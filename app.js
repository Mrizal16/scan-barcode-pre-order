const WORKER_URL = "https://po-scan-worker.rizal-scan.workers.dev/scan"; // ganti jika beda

let html5QrCode = null, isRunning = false, torchOn = false;
let cameras = [], currentCamIndex = 0;

const resultEl = document.getElementById("result");
const cameraSelect = document.getElementById("cameraSelect");
const resSelect    = document.getElementById("resSelect");
const startBtn = document.getElementById("startBtn");
const stopBtn  = document.getElementById("stopBtn");
const flipBtn  = document.getElementById("flipBtn");
const torchBtn = document.getElementById("torchBtn");
const livePill = document.getElementById("livePill");
const beepEl   = document.getElementById("beep");
const beepToggle = document.getElementById("beepToggle");
const vibeToggle = document.getElementById("vibeToggle");
const manualInput = document.getElementById("manualInput");
const manualBtn   = document.getElementById("manualBtn");

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

function setLive(state, text){
  livePill.textContent = text || (state ? "Scanning…" : "Idle");
  livePill.style.background = state ? "rgba(22,163,74,.12)" : "#0e1218";
  livePill.style.borderColor = state ? "rgba(22,163,74,.35)" : "var(--ring)";
  livePill.style.color = state ? "#b9f6c5" : "var(--muted)";
}

function renderOrder(order, first) {
  resultEl.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
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
  try{
    cameras = await Html5Qrcode.getCameras();
  }catch{
    cameras = [];
  }
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

function currentDeviceId(){
  return cameraSelect.value || (cameras[currentCamIndex]?.id) || { facingMode: "environment" };
}

async function startScan() {
  if (isRunning) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") {
    renderError("Akses kamera butuh HTTPS. Buka melalui https://… atau localhost.");
    return;
  }
  if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");

  const qrbox = parseInt(resSelect.value || "420", 10);
  const deviceId = currentDeviceId();

  try {
    await html5QrCode.start(deviceId, { fps: 12, qrbox }, onScanSuccess, ()=>{});
    isRunning = true; startBtn.disabled=true; stopBtn.disabled=false; torchBtn.disabled=false;
    setLive(true);
    // coba aktifkan torch info
    await updateTorchButtonState();
  } catch (e) {
    renderError("Tidak bisa akses kamera. Pastikan HTTPS & izinkan kamera.");
    setLive(false, "Idle");
  }
}
async function stopScan() {
  if (!html5QrCode || !isRunning) { setLive(false); return; }
  try{ await html5QrCode.stop(); await html5QrCode.clear(); }catch{}
  isRunning = false; startBtn.disabled=false; stopBtn.disabled=true; torchBtn.disabled=true; torchOn=false;
  setLive(false);
}
async function flipCamera() {
  if (!cameras || cameras.length < 2) return;
  currentCamIndex = (currentCamIndex + 1) % cameras.length;
  cameraSelect.selectedIndex = currentCamIndex;
  if (isRunning) { await stopScan(); await startScan(); }
}

async function updateTorchButtonState(){
  try{
    const caps = await html5QrCode.getRunningTrackCapabilities?.();
    if (caps && caps.torch) {
      torchBtn.disabled = false;
      torchBtn.textContent = torchOn ? "💡 Matikan Flash" : "💡 Nyalakan Flash";
    } else {
      torchBtn.disabled = true;
    }
  }catch{
    torchBtn.disabled = true;
  }
}
async function toggleTorch(){
  if (!isRunning) return;
  try{
    torchOn = !torchOn;
    await html5QrCode.applyVideoConstraints?.({ advanced:[{ torch: torchOn }] });
    await updateTorchButtonState();
  }catch{
    // beberapa device tidak support
    torchBtn.disabled = true;
  }
}

function parseTokenLike(s){
  let token = String(s||"").trim();
  try { const obj = JSON.parse(token); if (obj && obj.t) token = obj.t; } catch {}
  return token;
}

async function verifyToken(token){
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

async function onScanSuccess(decodedText) {
  const token = parseTokenLike(decodedText);
  if (beepToggle.checked) { try{ beepEl.currentTime=0; beepEl.play(); }catch{} }
  if (vibeToggle.checked && "vibrate" in navigator) { navigator.vibrate?.(60); }
  await stopScan();
  await verifyToken(token);
}

startBtn.addEventListener("click", startScan);
stopBtn.addEventListener("click", stopScan);
flipBtn.addEventListener("click", flipCamera);
torchBtn.addEventListener("click", toggleTorch);
cameraSelect.addEventListener("change", async ()=>{ if (isRunning){ await stopScan(); await startScan(); } });
resSelect.addEventListener("change", async ()=>{ if (isRunning){ await stopScan(); await startScan(); } });

manualBtn.addEventListener("click", async ()=>{
  const token = parseTokenLike(manualInput.value);
  if (!token) return renderError("Masukkan token terlebih dahulu.");
  await verifyToken(token);
});

(async function init(){ await enumerateCameras(); setLive(false); })();
