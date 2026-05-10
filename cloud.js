// ═══════════════════════════════════════════════
// cloud.js — Cloud-Sync für Stundenplan
// ═══════════════════════════════════════════════

const API = 'https://stundenplan-api.hendric-makowski2.workers.dev';

let cloudToken = null;
let cloudUser = null;

function cloudInit() {
  try {
    cloudToken = localStorage.getItem('cloudToken');
    const u = localStorage.getItem('cloudUser');
    if (u) cloudUser = JSON.parse(u);
  } catch(e) {}
  updateCloudUI();
}

function updateCloudUI() {
  const loggedIn = !!cloudToken;
  const out = document.getElementById('cloudLoggedOut');
  const inn = document.getElementById('cloudLoggedIn');
  if (!out || !inn) return;
  out.style.display = loggedIn ? 'none' : '';
  inn.style.display = loggedIn ? '' : 'none';
  if (loggedIn && cloudUser) {
    const el = document.getElementById('cloudUserEmail');
    if (el) el.textContent = cloudUser.email;
  }
}

function switchAuthTab(tab) {
  document.getElementById('tabLogin').classList.toggle('on', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('on', tab === 'register');
  document.getElementById('authLoginPanel').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('authRegPanel').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('loginTitle').textContent = tab === 'login' ? 'Anmelden' : 'Registrieren';
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginErr');
  errEl.style.display = 'none';
  if (!email || !pass) { errEl.textContent = 'Bitte E-Mail und Passwort eingeben'; errEl.style.display = ''; return; }
  try {
    const res = await fetch(API + '/auth/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, password: pass})
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Fehler beim Anmelden'; errEl.style.display = ''; return; }
    cloudToken = data.token;
    cloudUser = data.user;
    localStorage.setItem('cloudToken', cloudToken);
    localStorage.setItem('cloudUser', JSON.stringify(cloudUser));
    vib([3,8,3]);
    closeSheet('loginM');
    updateCloudUI();
    setTimeout(() => cloudSync(), 500);
  } catch(e) {
    errEl.textContent = 'Keine Verbindung';
    errEl.style.display = '';
  }
}

async function doRegister() {
  const email = document.getElementById('regEmail').value.trim();
  const pass = document.getElementById('regPass').value;
  const name = document.getElementById('regName').value.trim();
  const errEl = document.getElementById('regErr');
  errEl.style.display = 'none';
  if (!email || !pass) { errEl.textContent = 'Bitte E-Mail und Passwort eingeben'; errEl.style.display = ''; return; }
  if (pass.length < 6) { errEl.textContent = 'Passwort mindestens 6 Zeichen'; errEl.style.display = ''; return; }
  try {
    const res = await fetch(API + '/auth/register', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, password: pass, display_name: name || undefined})
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Fehler beim Registrieren'; errEl.style.display = ''; return; }
    cloudToken = data.token;
    cloudUser = data.user;
    localStorage.setItem('cloudToken', cloudToken);
    localStorage.setItem('cloudUser', JSON.stringify(cloudUser));
    vib([3,8,3,8,3]);
    closeSheet('loginM');
    updateCloudUI();
    setTimeout(() => cloudSync(), 500);
  } catch(e) {
    errEl.textContent = 'Keine Verbindung';
    errEl.style.display = '';
  }
}

async function cloudSync() {
  if (!cloudToken) return;
  const statusEl = document.getElementById('cloudSyncStatus');
  if (statusEl) statusEl.textContent = 'Synchronisiere...';
  try {
    // Upload local plan
    const planData = {F, LB, W, ENT, reqLB, TIMES};
    await fetch(API + '/plan', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cloudToken},
      body: JSON.stringify({data: planData})
    });
    // Download plan back
    const res = await fetch(API + '/plan', {
      headers: {'Authorization': 'Bearer ' + cloudToken}
    });
    if (res.status === 401) { cloudLogout(); return; }
    const json = await res.json();
    if (json.data && typeof json.data === 'object') {
      const d = json.data;
      if (d.F) F = d.F;
      if (d.LB) LB = d.LB;
      if (d.W) W = d.W;
      if (d.ENT) ENT = d.ENT;
      if (d.reqLB) reqLB = d.reqLB;
      if (d.TIMES && Array.isArray(d.TIMES) && d.TIMES.length === 10) TIMES = d.TIMES;
      render();
      sv();
    }
    const now = new Date().toLocaleTimeString('de', {hour:'2-digit',minute:'2-digit'});
    if (statusEl) statusEl.textContent = 'Zuletzt: ' + now;
    vib([3,6,3]);
  } catch(e) {
    if (statusEl) statusEl.textContent = 'Fehler beim Sync';
  }
}

function cloudLogout() {
  if (cloudToken) {
    fetch(API + '/auth/logout', {
      method: 'POST',
      headers: {'Authorization': 'Bearer ' + cloudToken}
    }).catch(() => {});
  }
  cloudToken = null;
  cloudUser = null;
  localStorage.removeItem('cloudToken');
  localStorage.removeItem('cloudUser');
  updateCloudUI();
  vib(4);
}
