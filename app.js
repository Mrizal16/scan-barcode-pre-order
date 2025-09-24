// ====== Konfigurasi dasar ======
const LS_KEY = "scannedOrders:v1"; // namespace localStorage
let orders = [];
let scanned = new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));

const readerEl = document.getElementById("reader");
const resultEl = document.getElementById("result");
const startBtn = document.getElementById("startBtn");
const stopBtn  = document.getElementById("stopBtn");
const resetBtn = document.getElementById("resetBtn");
const cameraSelect = document.getElementById("cameraSelect");

let html5QrCode = null;
let isRunning = false;

// ====== Helper UI ======
function htmlEscape(s){
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
function showOrderCard(order, firstTime){
  const statusBadge = firstTime
    ? `<span class="badge">✔️ Terscan & diambil</span>`
    : `<span class="badge warn">⚠️ Sudah pernah diambil</span>`;

  resultEl.innerHTML = `
    <div class="card">
      <div class="row">
        <h2 style="margin:0">ID: ${htmlEscape(order.id)}</h2>
        ${statusBadge}
      </div>
      <div class="hr"></div>
      <div class="kv">
        <div class="key">Nama</div><div>${htmlEscape(order.nama || "-")}</div>
        <div class="key">Jumlah</div><div>${htmlEscape(order.jumlah || "-")}</div>
        <div class="key">Ukuran</div><div>${htmlEscape(order.ukuran || "-")}</div>
        <div class="key">Telepon</div><div>${htmlEscape(order.telepon || "-")}</div>
        <div class="key">Alamat</div><div>${htmlEscape(order.alamat || "-")}</div>
      </div>
      ${
        firstTime
          ? `<div class="alert ok">✅ Barang berhasil ditandai <b>diambil</b> (tersimpan di perangkat ini).</div>`
          : `<div class="alert">⚠️ Mohon maaf, baju anda <b>sudah diambil</b> sebelumnya.</div>`
      }
    </div>
  `;
}
function showError(msg){
  resultEl.innerHTML = `
    <div class="card">
      <div class="badge error">❌ ${htmlEscape(msg)}</div>
    </div>
  `;
}

// ====== Data loader ======
async function loadOrders(){
  // Cache-busting agar GitHub Pages tidak menahan versi lama saat update JSON
  const res = await fetch(`./orders.json?ts=${Date.now()}`);
  if(!res.ok){
    showError("Gagal memuat orders.json");
    return;
  }
  orders = await res.json();
}

// ====== Scanner control ======
async function enumerateCameras(){
  const devices = await Html5Qrcode.getCameras();
  cameraSelect.innerHTML = "";
  if(devices && devices.length){
    devices.forEach((d,i)=>{
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.label || `Kamera ${i+1}`;
      cameraSelect.appendChild(opt);
    });
  }else{
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Tidak ada kamera terdeteksi";
    cameraSelect.appendChild(opt);
  }
}

function persistScanned(){
  localStorage.setItem(LS_KEY, JSON.stringify(Array.from(scanned)));
}

async function startScan(){
  if(isRunning) return;
  if(!html5QrCode){
    html5QrCode = new Html5Qrcode("reader", { verbose: false });
  }

  const camId = cameraSelect.value || { facingMode: "environment" };
  const config = { fps: 12, qrbox: 280, rememberLastUsedCamera: true, aspectRatio: 1.0 };
  try{
    await html5QrCode.start(
      camId,
      config,
      onScanSuccess,
      (err)=>{} // onScanFailure: diamkan agar UI tidak spam
    );
    isRunning = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
  }catch(e){
    showError("Tidak bisa mengakses kamera. Pastikan izinkan kamera & gunakan HTTPS (GitHub Pages).");
  }
}

async function stopScan(){
  if(!html5QrCode || !isRunning) return;
  await html5QrCode.stop();
  await html5QrCode.clear();
  isRunning = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

function normalizeCode(s){
  return String(s || "").trim();
}

// ====== Callback hasil scan ======
function onScanSuccess(decodedText, decodedResult){
  // decodedText bisa dari QR atau beberapa jenis barcode yang didukung
  const code = normalizeCode(decodedText);

  if(!orders || !orders.length){
    showError("Data order belum termuat. Coba refresh halaman.");
    return;
  }

  // Pencocokan by ID (case-sensitive sesuai JSON untuk lebih tegas)
  const order = orders.find(o => String(o.id) === code);

  if(!order){
    showError(`Order dengan kode "${code}" tidak ditemukan!`);
    return;
  }

  // Cek apakah sudah pernah terscan di perangkat ini
  if(scanned.has(code)){
    showOrderCard(order, /*firstTime*/ false);
  }else{
    scanned.add(code);
    persistScanned();
    showOrderCard(order, /*firstTime*/ true);
  }

  // Hentikan kamera sebentar agar tidak auto re-scan cepat
  // (opsional: bisa tetap lanjut kalau ingin scan beruntun)
  stopScan();
}

// ====== Event binding ======
startBtn.addEventListener("click", startScan);
stopBtn.addEventListener("click", stopScan);
resetBtn.addEventListener("click", ()=>{
  if(confirm("Reset status 'sudah diambil' di perangkat ini?")){
    scanned = new Set();
    persistScanned();
    resultEl.innerHTML = "";
    alert("Status telah direset (localStorage dibersihkan).");
  }
});

// ====== Init ======
(async function init(){
  await loadOrders();
  await enumerateCameras();
})();
