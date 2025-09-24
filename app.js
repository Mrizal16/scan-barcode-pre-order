const WORKER_URL = "https://po-scan-worker.rizal-scan.workers.dev/scan"; // GANTI jika beda

let html5QrCode = null, isRunning = false;
let cameras = [], currentCamIndex = 0;

const resultEl = document.getElementById("result");
const cameraSelect = document.getElementById("cameraSelect");
const startBtn = document.getElementById("startBtn");
const stopBtn  = document.getElementById("stopBtn");
const flipBtn  = document.getElementById("flipBtn");

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

function renderOrder(order, first) {
  resultEl.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2 style="margin:0">ID: ${esc(order.id)}</h2>
        <span class="badge ${first?'':'warn'}">${first?'✔️ Terscan & diambil':'⚠️ Sudah diambil'}</span>
      </div>
      <div class="hr"></div>
      <div class="kv">
        <div>Nama</div><div>${esc(order.nama||'-')}</div>
        <div>Jumlah</div><div>${esc(order.jumlah||'-')}</div>
        <div>Ukuran</div><div>${esc(order.ukuran||'-')}</div>
        <div>Telepon</div><div>${esc(order.telepon||'-')}</div>
        <div>Alamat</div><div>${esc(order.alamat||'-')}</div>
      </div>
      <div class="alert ${first?'ok':'err'}">
        ${first?'✅ Barang berhasil ditandai diambil.':'⚠️ Mohon maaf, baju anda sudah diambil sebelumnya.'}
      </div>
    </div>
  `;
}
function renderError(msg){
  resultEl.innerHTML = `
    <div class="card">
      <span class="badge err">❌ Error</span>
      <div class="hr"></div>
      <div class="alert err">${esc(msg)}</div>
    </div>
  `;
}

async function enumerateCameras() {
  cameras = await Html5Qrcode.getCameras();
  cameraSelect.innerHTML = "";
  if (cameras?.length) {
    cameras.forEach((d,i)=>{
      const o=document.createElement("option");
      o.value=d.id; o.textContent=d.label||`Kamera ${i+1}`; cameraSelect.appendChild(o);
    });
    const backIndex = cameras.findIndex(d => /back|rear|environment/i.test(d.label||""));
    currentCamIndex = backIndex >= 0 ? backIndex : 0;
    cameraSelect.selectedIndex = currentCamIndex;
  } else {
    const o=document.createElement("option");
    o.value=""; o.textContent="Tidak ada kamera"; cameraSelect.appendChild(o);
  }
}

async function startScan() {
  if (isRunning) return;
  if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
  const deviceId = cameraSelect.value || (cameras[currentCamIndex]?.id) || { facingMode: "environment" };
  try {
    await html5QrCode.start(deviceId, { fps: 12, qrbox: 280 }, onScanSuccess, ()=>{});
    isRunning = true; startBtn.disabled=true; stopBtn.disabled=false;
  } catch {
    renderError("Tidak bisa akses kamera. Pastikan HTTPS & izinkan kamera.");
  }
}
async function stopScan() {
  if (!html5QrCode || !isRunning) return;
  await html5QrCode.stop(); await html5QrCode.clear();
  isRunning = false; startBtn.disabled=false; stopBtn.disabled=true;
}
async function flipCamera() {
  if (!cameras || cameras.length < 2) return;
  currentCamIndex = (currentCamIndex + 1) % cameras.length;
  cameraSelect.selectedIndex = currentCamIndex;
  if (isRunning) { await stopScan(); await startScan(); }
}

async function onScanSuccess(decodedText) {
  let token = String(decodedText).trim();
  try { const obj = JSON.parse(token); if (obj && obj.t) token = obj.t; } catch {}
  await stopScan();

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    if (data.status === "PICKED_OK")            renderOrder(data.order || {}, true);
    else if (data.status === "ALREADY_PICKED")  renderOrder(data.order || {}, false);
    else if (data.error === "INVALID_SIGNATURE") renderError("Token tidak valid.");
    else if (data.error === "TOKEN_EXPIRED")     renderError("Token kedaluwarsa.");
    else if (data.error)                         renderError(data.error);
    else                                         renderError("Respon tidak dikenal.");
  } catch {
    renderError("Gagal menghubungi server verifikasi.");
  }
}

startBtn.addEventListener("click", startScan);
stopBtn.addEventListener("click", stopScan);
flipBtn.addEventListener("click", flipCamera);
(async function init(){ await enumerateCameras(); })();
