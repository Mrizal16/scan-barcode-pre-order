// GANTI sesuai Worker kamu:
const WORKER_URL = "https://po-scan-worker.rizal-scan.workers.dev/scan";

let html5QrCode = null, isRunning = false, cameras = [], currentIndex = 0, lastStreamSettings = null;
const el = (id) => document.getElementById(id);
const cameraSelect = el("cameraSelect");
const startBtn = el("startBtn"), stopBtn = el("stopBtn"), flipBtn = el("flipBtn"), retryBtn = el("retryBtn");
const statusDot = el("statusDot"), statusText = el("statusText");
const resultEl = el("result"), historyEl = el("history"), beep = el("beep"), resolutionSel = el("resolution");

function setStatus(kind, text){
  statusDot.className = "dot" + (kind ? " " + kind : "");
  statusText.textContent = text || "Siap";
}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function vib(ms=60){ if (navigator.vibrate) try{ navigator.vibrate(ms) }catch{} }
function beepOnce(){ try{ beep.currentTime=0; beep.play(); }catch{} }
function showResult(html){ resultEl.innerHTML = html; resultEl.classList.remove("hidden"); }
function hideResult(){ resultEl.classList.add("hidden"); resultEl.innerHTML=""; }

async function enumerateCameras(){
  try{
    cameras = await Html5Qrcode.getCameras();
    cameraSelect.innerHTML = "";
    if (!cameras?.length){
      const opt = document.createElement("option"); opt.textContent = "Tidak ada kamera"; cameraSelect.appendChild(opt);
      setStatus("warn","Tidak ada kamera terdeteksi");
      return;
    }
    cameras.forEach((c,i)=>{
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.label || `Kamera ${i+1}`;
      cameraSelect.appendChild(o);
    });
    // default: kamera belakang kalau ada
    const envIdx = cameras.findIndex(d => /back|rear|environment/i.test(d.label||""));
    currentIndex = envIdx >= 0 ? envIdx : 0;
    cameraSelect.selectedIndex = currentIndex;
    setStatus("","Siap");
  }catch(e){
    setStatus("err","Gagal mendeteksi kamera. Izinkan akses kamera.");
  }
}

function parseResolution(sel){
  if (sel === "auto") return null;
  const [w,h] = sel.split("x").map(n=>parseInt(n,10));
  if (!w||!h) return null;
  return { width: { ideal: w }, height: { ideal: h } };
}

async function startScan(){
  if (isRunning) return;
  if (!html5QrCode) html5QrCode = new Html5Qrcode("reader", { verbose: false });

  const deviceId = cameraSelect.value || (cameras[currentIndex] && cameras[currentIndex].id);
  if (!deviceId){ setStatus("err","Kamera tidak tersedia"); return; }

  let constraints = { fps: 12, qrbox: (vw, vh) => Math.min(300, Math.floor(Math.min(vw, vh)*0.6)) };
  const pref = parseResolution(resolutionSel.value);
  const config = Object.assign({ facingMode: undefined }, constraints);
  try{
    setStatus("live","Memulai kamera…");
    await html5QrCode.start(
      { deviceId: { exact: deviceId } },
      config,
      onScanSuccess,
      onScanFail
    );
    // simpan setting terakhir (untuk troubleshooting, tidak wajib)
    try {
      const tracks = html5QrCode.getState() ? html5QrCode.qrcodeRegion ? [] : [] : [];
      // tidak semua versi expose stream; kita biarkan kosong saja
      lastStreamSettings = null;
    } catch(_) {}
    isRunning = true;
    startBtn.disabled = true; stopBtn.disabled = false; retryBtn.disabled = true;
    setStatus("live","Memindai… arahkan kamera ke QR");
  }catch(e){
    console.error(e);
    setStatus("err","Tidak bisa menyalakan kamera. Pastikan HTTPS & izin kamera aktif.");
  }
}
async function stopScan(){
  if (!html5QrCode || !isRunning) return;
  try{
    await html5QrCode.stop(); await html5QrCode.clear();
  }catch(_){}
  isRunning = false;
  startBtn.disabled = false; stopBtn.disabled = true; retryBtn.disabled = false;
  setStatus("", "Berhenti");
}

async function flipCamera(){
  if (!cameras || cameras.length < 2) return;
  currentIndex = (currentIndex + 1) % cameras.length;
  cameraSelect.selectedIndex = currentIndex;
  if (isRunning){ await stopScan(); await startScan(); }
}

async function onScanFail(){ /* diamkan saja agar tidak spam */ }

function addHistory(item){
  const div = document.createElement("div");
  div.className = "hist-item";
  div.innerHTML = `
    <div><b>${esc(item.id || "-")}</b></div>
    <div class="small">${esc(item.status || item.error || "-")}</div>
    <div class="small">${new Date().toLocaleTimeString()}</div>
  `;
  historyEl.prepend(div);
}

function renderOrder(order, first){
  showResult(`
    <div class="result-card">
      <div class="result-head">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="font-weight:700;font-size:18px">ID: ${esc(order.id)}</div>
        </div>
        <span class="badge ${first?'':'warn'}">${first?'✔️ Ditandai diambil':'⚠️ Sudah diambil'}</span>
      </div>
      <div class="hr"></div>
      <div class="kv">
        <div>Nama</div><div>${esc(order.nama||'-')}</div>
        <div>Jumlah</div><div>${esc(order.jumlah||'-')}</div>
        <div>Ukuran</div><div>${esc(order.ukuran||'-')}</div>
        <div>Telepon</div><div>${esc(order.telepon||'-')}</div>
        <div>Alamat</div><div>${esc(order.alamat||'-')}</div>
      </div>
      <div class="hr"></div>
      <div class="actions">
        <button class="copy" data-copy="${esc(order.id)}">Copy ID</button>
        ${order.telepon ? `<button class="copy" data-copy="${esc(order.telepon)}">Copy Telepon</button>` : ""}
        ${order.alamat ? `<button class="copy" data-copy="${esc(order.alamat)}">Copy Alamat</button>` : ""}
      </div>
    </div>
  `);

  // copy handlers
  resultEl.querySelectorAll(".copy").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const val = btn.getAttribute("data-copy");
      try { await navigator.clipboard.writeText(val); btn.textContent = "✅ Copied"; setTimeout(()=>btn.textContent="Copy",1000); } catch {}
    });
  });

  addHistory({ id: order.id, status: first ? "PICKED_OK" : "ALREADY_PICKED" });
}

function renderError(msg){
  showResult(`
    <div class="result-card">
      <div class="result-head">
        <div style="font-weight:700">Hasil</div>
        <span class="badge err">❌ Error</span>
      </div>
      <div class="hr"></div>
      <div>${esc(msg)}</div>
    </div>
  `);
  addHistory({ id: "-", error: msg });
}

async function onScanSuccess(decoded){
  beepOnce(); vib(80);
  setStatus("live","QR terbaca… verifikasi ke server…");
  await stopScan(); // hentikan supaya tidak baca berulang

  // jika QR berisi JSON {t:"..."} → ambil field t
  let token = String(decoded || "").trim();
  try { const o = JSON.parse(token); if (o && o.t) token = o.t; } catch {}

  try{
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });
    const data = await res.json().catch(()=>({}));
    if (data.status === "PICKED_OK") {
      renderOrder(data.order || { id:"-" }, true);
      setStatus("","Berhasil ditandai");
    } else if (data.status === "ALREADY_PICKED") {
      renderOrder(data.order || { id:"-" }, false);
      setStatus("warn","Kode ini sudah pernah diambil");
    } else if (data.error === "INVALID_SIGNATURE") {
      renderError("Token tidak valid (signature salah).");
      setStatus("err","Token tidak valid");
    } else if (data.error === "TOKEN_EXPIRED") {
      renderError("Token kedaluwarsa. Minta token baru.");
      setStatus("err","Token kedaluwarsa");
    } else if (data.error === "TOKEN_REQUIRED") {
      renderError("QR tidak berisi token.");
      setStatus("err","QR tanpa token");
    } else {
      renderError("Respon tidak dikenali atau server error.");
      setStatus("err","Gagal verifikasi");
    }
  }catch(e){
    console.error(e);
    renderError("Tidak dapat menghubungi server. Periksa internet & CORS.");
    setStatus("err","Jaringan/CORS bermasalah");
  }finally{
    retryBtn.disabled = false;
  }
}

startBtn.addEventListener("click", startScan);
stopBtn.addEventListener("click", stopScan);
flipBtn.addEventListener("click", flipCamera);
retryBtn.addEventListener("click", async ()=>{ hideResult(); setStatus("", "Siap"); await startScan(); });
cameraSelect.addEventListener("change", async ()=>{
  currentIndex = cameraSelect.selectedIndex;
  if (isRunning){ await stopScan(); await startScan(); }
});

(async function init(){
  // cek HTTPS
  if (location.protocol !== "https:" && location.hostname !== "localhost") {
    setStatus("warn","Sebaiknya akses lewat HTTPS agar kamera bisa dipakai.");
  }
  await enumerateCameras();
})();
