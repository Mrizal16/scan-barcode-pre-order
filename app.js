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

/* ====== elemen untuk daftar order (panel tabel) ====== */
const ordersFile = document.getElementById("ordersFile");
const ordersPanel = document.getElementById("ordersPanel");
const ordersTableBody = document.querySelector("#ordersTable tbody");
const ordersStats = document.getElementById("ordersStats");
const clearCheckedBtn = document.getElementById("clearChecked");

/* ====== state daftar order ====== */
let orders = [];                 // [{id,nama,jumlah,ukuran,telepon,token?}]
let orderById = new Map();       // id -> order
let idByToken = new Map();       // token -> id (untuk file tokens.json)
let checked = new Set();         // id yang sudah ditandai selesai
const LS_KEY = "po-scan-checked-v1";

/* ====== util umum ====== */
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

function setLive(state, text){
  livePill.textContent = text || (state ? "Scanning…" : "Idle");
  livePill.style.background = state ? "rgba(22,163,74,.12)" : "#0e1218";
  livePill.style.borderColor = state ? "rgba(22,163,74,.35)" : "var(--ring)";
  livePill.style.color = state ? "#b9f6c5" : "var(--muted)";
}

/* ====== render kartu hasil scan ====== */
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

/* ====== kamera ====== */
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
    torchBtn.disabled = true; // device tidak support
  }
}

/* ====== parsing token ====== */
function parseTokenLike(s){
  let token = String(s||"").trim();
  try { const obj = JSON.parse(token); if (obj && obj.t) token = obj.t; } catch {}
  return token;
}

/* ====== daftar order: render & centang ====== */
function normalizeArr(arr){
  // dukung format tokens.json (id, token) atau orders.json (id, nama, dst)
  return arr.map(x=>({
    id: x.id ?? x.ID ?? "",
    nama: x.nama ?? x.name ?? "",
    jumlah: x.jumlah ?? x.qty ?? "",
    ukuran: x.ukuran ?? x.size ?? "",
    telepon: x.telepon ?? x.phone ?? "",
    token: x.token
  })).filter(x=>x.id);
}

// pulihkan centang dari localStorage
try { (JSON.parse(localStorage.getItem(LS_KEY)||"[]")||[]).forEach(v=>checked.add(String(v))); } catch {}

function renderOrders(){
  if (!orders.length){ ordersPanel.style.display="none"; return; }
  ordersPanel.style.display="block";
  ordersTableBody.innerHTML = "";
  let done = 0;
  for (const o of orders){
    const isDone = checked.has(String(o.id));
    if (isDone) done++;
    const tr = document.createElement("tr");
    if (isDone) tr.classList.add("done");
    tr.innerHTML = `
      <td><span class="status-dot"><span class="dot ${isDone?'green':'gray'}"></span>${isDone?'Selesai':'Belum'}</span></td>
      <td><span class="kbd">${esc(o.id)}</span></td>
      <td>${esc(o.nama||'-')}</td>
      <td>${esc(o.jumlah||'-')}</td>
      <td>${esc(o.ukuran||'-')}</td>
      <td>${esc(o.telepon||'-')}</td>
    `;
    ordersTableBody.appendChild(tr);
  }
  ordersStats.textContent = `${done}/${orders.length} selesai • Sisa ${orders.length - done}`;
}

function markChecked(id){
  if (!id) return;
  checked.add(String(id));
  try{ localStorage.setItem(LS_KEY, JSON.stringify([...checked])); }catch{}
  renderOrders();
}

/* ====== verifikasi token ke server ====== */
async function verifyToken(token){
  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });
    const data = await res.json();

    if (data.status === "PICKED_OK") {
      renderOrder(data.order || {}, true);
      const id = (data.order && data.order.id) || idByToken.get(String(token)) || "";
      markChecked(id);
    }
    else if (data.status === "ALREADY_PICKED") {
      renderOrder(data.order || {}, false);
      const id = (data.order && data.order.id) || idByToken.get(String(token)) || "";
      markChecked(id);
    }
    else if (data.error === "INVALID_SIGNATURE") renderError("Token tidak valid.");
    else if (data.error === "TOKEN_EXPIRED")     renderError("Token kedaluwarsa.");
    else if (data.error)                         renderError(data.error);
    else                                         renderError("Respon tidak dikenal.");
  } catch {
    renderError("Gagal menghubungi server verifikasi.");
  }
}

/* ====== event scan ====== */
async function onScanSuccess(decodedText) {
  const token = parseTokenLike(decodedText);
  if (beepToggle && beepToggle.checked) { try{ beepEl.currentTime=0; beepEl.play(); }catch{} }
  if (vibeToggle && vibeToggle.checked && "vibrate" in navigator) { navigator.vibrate?.(60); }
  await stopScan();
  await verifyToken(token);
}

/* ====== listeners UI ====== */
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

/* ====== loader daftar order + reset centang ====== */
if (ordersFile){
  ordersFile.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    if (!f) return;
    try{
      const arr = JSON.parse(await f.text());
      orders = normalizeArr(Array.isArray(arr)?arr:[]);
      orderById.clear(); idByToken.clear();
      for (const o of orders){
        orderById.set(String(o.id), o);
        if (o.token) idByToken.set(String(o.token), String(o.id));
      }
      renderOrders();
    }catch{
      renderError("Gagal membaca daftar order (.json).");
    }
  });
}
if (clearCheckedBtn){
  clearCheckedBtn.addEventListener("click", ()=>{
    if (!confirm("Hapus semua tanda centang lokal?")) return;
    checked.clear(); try{ localStorage.removeItem(LS_KEY); }catch{}
    renderOrders();
  });
}

/* ====== init ====== */
(async function init(){ await enumerateCameras(); setLive(false); renderOrders(); })();
