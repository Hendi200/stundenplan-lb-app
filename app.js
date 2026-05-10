// ── SERVICE WORKER ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ── PDF.js worker ──
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── STATE ──
const STATE_KEY = 'stundenplan_state';
let state = loadState();

function defaultState() {
  return {
    lessons: [],      // { day:0-4, period:1-10, subject, teacher, room, isLB:false }
    lbData: {},       // key: "day_period" -> [ { teacher, room, subject, id } ]
    bookings: {},     // key: "YYYY-WW_day_period" -> lb entry id
    untis: { url:'', school:'', user:'', pass:'', classes:'' },
    weekOffset: 0,
    lbWeekOffset: 0,
  };
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY));
    return s ? { ...defaultState(), ...s } : defaultState();
  } catch { return defaultState(); }
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

// ── HELPERS ──
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
const DAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
const TIMES = [
  '07:45–08:30', '08:30–09:15', '09:30–10:15', '10:15–11:00',
  '11:20–12:05', '12:05–12:50', '13:30–14:15', '14:15–15:00',
  '15:00–15:45', '15:45–16:30'
];

function getMonday(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7;
  const mon = new Date(now.setDate(diff));
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function getWeekKey(offset) {
  const mon = getMonday(offset);
  const y = mon.getFullYear();
  const start = new Date(y, 0, 1);
  const wk = Math.ceil(((mon - start) / 86400000 + start.getDay() + 1) / 7);
  return `${y}-${String(wk).padStart(2, '0')}`;
}

function getLbKey(day, period, weekOffset = null) {
  if (weekOffset !== null) {
    return `${getWeekKey(weekOffset)}_${day}_${period}`;
  }
  return `${day}_${period}`;
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => { t.className = 'toast'; }, 2800);
}

// ── NAVIGATION ──
document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('page-' + btn.dataset.page).classList.add('active');
    if (btn.dataset.page === 'week') renderWeek();
    if (btn.dataset.page === 'today') renderToday();
    if (btn.dataset.page === 'lb-manager') renderLbManager();
  });
});

// ── TODAY ──
function renderToday() {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const dayIdx = dow >= 1 && dow <= 5 ? dow - 1 : 0;
  const heading = document.getElementById('today-heading');
  heading.textContent = DAYS_LONG[dayIdx] + ', ' + now.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });

  const container = document.getElementById('today-slots');
  const todayLessons = state.lessons
    .filter(l => l.day === dayIdx)
    .sort((a, b) => a.period - b.period);

  if (todayLessons.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted)">Keine Stunden heute oder Stundenplan nicht geladen.</p>';
    return;
  }

  const weekKey = getWeekKey(state.weekOffset);
  container.innerHTML = '';
  todayLessons.forEach(lesson => {
    const lbKey = getLbKey(dayIdx, lesson.period);
    const availableLBs = (state.lbData[lbKey] || []);
    const bookingKey = `${weekKey}_${dayIdx}_${lesson.period}`;
    const booking = state.bookings[bookingKey];
    const bookedLB = booking ? availableLBs.find(lb => lb.id === booking) : null;

    const slot = document.createElement('div');
    slot.className = 'today-slot';

    let lessonClass = 'today-lesson';
    let badgeHtml = '';
    if (lesson.isLB && availableLBs.length > 0) lessonClass += ' lb-available';
    if (bookedLB) { lessonClass += ' lb-booked'; badgeHtml = `<span style="color:var(--green)">✓ ${bookedLB.teacher} – ${bookedLB.room}</span>`; }

    slot.innerHTML = `
      <div class="today-time">${TIMES[lesson.period - 1] || ''}</div>
      <div class="${lessonClass}" data-day="${dayIdx}" data-period="${lesson.period}">
        <div class="tl-subject">${lesson.subject || 'Stunde ' + lesson.period}</div>
        <div class="tl-meta">${lesson.teacher || ''}${lesson.room ? ' · ' + lesson.room : ''}${lesson.isLB ? ' · <span style="color:var(--yellow)">LB verfügbar</span>' : ''}</div>
        ${badgeHtml ? '<div style="margin-top:4px;font-size:.78rem">' + badgeHtml + '</div>' : ''}
        ${lesson.isLB && availableLBs.length > 0 ? '<button class="btn" style="margin-top:8px;padding:5px 12px;font-size:.78rem" onclick="openLbModal(' + dayIdx + ',' + lesson.period + ')">' + (bookedLB ? '✏️ Ändern' : '📝 LB wählen') + '</button>' : ''}
      </div>`;
    container.appendChild(slot);
  });
}

// ── WEEK ──
function renderWeek() {
  const grid = document.getElementById('timetable-grid');
  const mon = getMonday(state.weekOffset);
  const fri = new Date(mon); fri.setDate(fri.getDate() + 4);
  document.getElementById('week-label').textContent =
    mon.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' – ' +
    fri.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const weekKey = getWeekKey(state.weekOffset);
  grid.innerHTML = '';

  // headers
  grid.innerHTML += '<div class="tt-header"></div>';
  DAYS.forEach(d => grid.innerHTML += `<div class="tt-header">${d}</div>`);

  // rows
  for (let p = 1; p <= 10; p++) {
    grid.innerHTML += `<div class="tt-time"><b>${p}</b><span style="font-size:.6rem">${(TIMES[p-1]||'').split('–')[0]}</span></div>`;
    for (let d = 0; d < 5; d++) {
      const lesson = state.lessons.find(l => l.day === d && l.period === p);
      const lbKey = getLbKey(d, p);
      const availableLBs = state.lbData[lbKey] || [];
      const bookingKey = `${weekKey}_${d}_${p}`;
      const booking = state.bookings[bookingKey];
      const bookedLB = booking ? availableLBs.find(lb => lb.id === booking) : null;

      const cell = document.createElement('div');
      cell.className = 'tt-cell';
      if (lesson) cell.classList.add('has-lesson');
      if (lesson && lesson.isLB && availableLBs.length > 0) cell.classList.add('has-lb');
      if (bookedLB) cell.classList.add('lb-booked');

      if (lesson) {
        cell.innerHTML = `<div class="lesson-name">${lesson.subject || ''}</div><div class="lesson-sub">${lesson.teacher || ''}</div><div class="lesson-sub">${lesson.room || ''}</div>`;
      }
      if (bookedLB) {
        cell.innerHTML += `<span class="booked-badge">✓ LB</span>`;
      } else if (lesson && lesson.isLB && availableLBs.length > 0) {
        cell.innerHTML += `<span class="lb-badge">LB</span>`;
      }

      if (lesson && lesson.isLB && availableLBs.length > 0) {
        cell.addEventListener('click', () => openLbModal(d, p));
      }
      grid.appendChild(cell);
    }
  }
}

document.getElementById('prev-week').addEventListener('click', () => { state.weekOffset--; saveState(); renderWeek(); });
document.getElementById('next-week').addEventListener('click', () => { state.weekOffset++; saveState(); renderWeek(); });

// ── LB MODAL ──
function openLbModal(day, period) {
  const lbKey = getLbKey(day, period);
  const availableLBs = state.lbData[lbKey] || [];
  const weekKey = getWeekKey(state.weekOffset);
  const bookingKey = `${weekKey}_${day}_${period}`;
  const currentBooking = state.bookings[bookingKey];

  document.getElementById('lb-modal-title').textContent = `Lernbüro – ${DAYS_LONG[day]}, Stunde ${period}`;
  document.getElementById('lb-modal-slot').textContent = TIMES[period - 1] || '';

  const optionsDiv = document.getElementById('lb-modal-options');
  const cancelBtn = document.getElementById('lb-modal-cancel-booking');

  if (availableLBs.length === 0) {
    optionsDiv.innerHTML = '<p style="color:var(--text-muted)">Keine Lernbüros für diese Stunde eingetragen.</p>';
    cancelBtn.style.display = 'none';
  } else {
    optionsDiv.innerHTML = availableLBs.map(lb => `
      <div class="lb-option ${currentBooking === lb.id ? 'selected' : ''}" data-id="${lb.id}" onclick="bookLb('${bookingKey}','${lb.id}')">
        <div>
          <div class="lb-name">${lb.subject || lb.teacher}</div>
          <div class="lb-info">Lehrer: ${lb.teacher}</div>
          <div class="lb-room">📍 ${lb.room}</div>
        </div>
        ${currentBooking === lb.id ? '<span style="color:var(--green);font-size:1.2rem">✓</span>' : ''}
      </div>`).join('');
    cancelBtn.style.display = currentBooking ? 'block' : 'none';
    cancelBtn.onclick = () => { delete state.bookings[bookingKey]; saveState(); closeLbModal(); renderToday(); renderWeek(); showToast('Buchung aufgehoben', 'error'); };
  }

  document.getElementById('lb-modal').classList.add('open');
}

function bookLb(bookingKey, lbId) {
  state.bookings[bookingKey] = lbId;
  saveState();
  closeLbModal();
  renderToday();
  renderWeek();
  showToast('Lernbüro gebucht! ✓', 'success');
}

function closeLbModal() {
  document.getElementById('lb-modal').classList.remove('open');
}
document.getElementById('lb-modal-close').addEventListener('click', closeLbModal);
document.getElementById('lb-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeLbModal(); });

// ── LB MANAGER ──
function renderLbManager() {
  const mon = getMonday(state.lbWeekOffset);
  const fri = new Date(mon); fri.setDate(fri.getDate() + 4);
  document.getElementById('lb-week-label').textContent =
    'KW ' + getWeekKey(state.lbWeekOffset).split('-')[1] + ' · ' +
    mon.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' – ' +
    fri.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const list = document.getElementById('lb-slots-list');
  list.innerHTML = '';

  let hasAny = false;
  for (let d = 0; d < 5; d++) {
    for (let p = 1; p <= 10; p++) {
      const key = `${d}_${p}`;
      const entries = state.lbData[key] || [];
      if (entries.length === 0) continue;
      hasAny = true;
      const row = document.createElement('div');
      row.className = 'lb-slot-row';
      row.innerHTML = `
        <div class="lb-slot-key">${DAYS_LONG[d]}<br>Std. ${p}</div>
        <div>${entries.map(e => `
          <div class="lb-entry">
            <div>
              <span style="font-weight:600">${e.subject || e.teacher}</span>
              <span class="lb-entry-info"> · ${e.teacher} · ${e.room}</span>
            </div>
            <button class="btn danger" style="padding:3px 8px;font-size:.72rem" onclick="deleteLbEntry('${key}','${e.id}')">✕</button>
          </div>`).join('')}</div>
        <div></div>`;
      list.appendChild(row);
    }
  }
  if (!hasAny) {
    list.innerHTML = '<p style="color:var(--text-muted)">Noch keine Lernbüros eingetragen. PDF hochladen oder manuell hinzufügen.</p>';
  }
}

function deleteLbEntry(key, id) {
  state.lbData[key] = (state.lbData[key] || []).filter(e => e.id !== id);
  saveState();
  renderLbManager();
  showToast('Eintrag gelöscht');
}

document.getElementById('lb-prev-week').addEventListener('click', () => { state.lbWeekOffset--; saveState(); renderLbManager(); });
document.getElementById('lb-next-week').addEventListener('click', () => { state.lbWeekOffset++; saveState(); renderLbManager(); });

// Add LB modal
document.getElementById('lb-add-btn').addEventListener('click', () => {
  document.getElementById('add-lb-modal').classList.add('open');
});
document.getElementById('add-lb-close').addEventListener('click', () => {
  document.getElementById('add-lb-modal').classList.remove('open');
});
document.getElementById('add-lb-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('add-lb-modal').classList.remove('open');
});

document.getElementById('lb-add-save').addEventListener('click', () => {
  const day = parseInt(document.getElementById('lb-add-day').value);
  const period = parseInt(document.getElementById('lb-add-period').value);
  const teacher = document.getElementById('lb-add-teacher').value.trim();
  const room = document.getElementById('lb-add-room').value.trim();
  const subject = document.getElementById('lb-add-subject').value.trim();
  if (!period || !teacher || !room) { showToast('Bitte alle Felder ausfüllen', 'error'); return; }
  const key = `${day}_${period}`;
  if (!state.lbData[key]) state.lbData[key] = [];
  state.lbData[key].push({ id: Date.now().toString(), teacher, room, subject });
  saveState();
  document.getElementById('add-lb-modal').classList.remove('open');
  renderLbManager();
  // mark lesson as LB-capable
  const lesson = state.lessons.find(l => l.day === day && l.period === period);
  if (lesson) lesson.isLB = true;
  saveState();
  showToast('Lernbüro-Eintrag gespeichert ✓', 'success');
});

// ── PDF PARSING ──
const uploadZone = document.getElementById('pdf-upload-zone');
const pdfInput = document.getElementById('pdf-input');

uploadZone.addEventListener('click', () => pdfInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') parsePdf(file);
  else showToast('Bitte eine PDF-Datei hochladen', 'error');
});
pdfInput.addEventListener('change', () => {
  if (pdfInput.files[0]) parsePdf(pdfInput.files[0]);
});

let parsedLbEntries = null;

async function parsePdf(file) {
  const status = document.getElementById('pdf-status');
  const preview = document.getElementById('pdf-preview');
  const previewDiv = document.getElementById('pdf-parsed-preview');
  status.textContent = '⏳ Lese PDF…';
  preview.style.display = 'block';

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(it => it.str).join(' ') + '\n';
    }

    parsedLbEntries = extractLbFromText(fullText);
    status.textContent = `✅ ${parsedLbEntries.length} Lernbüro-Einträge gefunden`;
    previewDiv.innerHTML = parsedLbEntries.slice(0, 20).map(e =>
      `<div class="lb-entry"><span style="font-weight:600">${e.subject||e.teacher}</span><span class="lb-entry-info"> · ${e.teacher} · ${e.room} · ${DAYS_LONG[e.day]} Std.${e.period}</span></div>`
    ).join('') + (parsedLbEntries.length > 20 ? `<p style="color:var(--text-muted)">…und ${parsedLbEntries.length - 20} weitere</p>` : '');
  } catch (err) {
    status.textContent = '❌ Fehler beim Lesen der PDF: ' + err.message;
    console.error(err);
  }
}

function extractLbFromText(text) {
  const results = [];
  const lines = text.split(/[\n\r]+/);

  // Pattern: tries to find teacher codes, room numbers, day/period info
  // Flexible multi-pattern approach
  const dayPatterns = [
    { re: /montag|mo\b/i, day: 0 },
    { re: /dienstag|di\b/i, day: 1 },
    { re: /mittwoch|mi\b/i, day: 2 },
    { re: /donnerstag|do\b/i, day: 3 },
    { re: /freitag|fr\b/i, day: 4 },
  ];

  const roomRe = /([A-Z]\s?\d[\s-]?\d{2}|\d{3}[a-z]?|[A-Z]+\d+)/i;
  const teacherRe = /\b([A-ZÜÄÖ]{2,6})\b/;
  const periodRe = /(?:std\.?|stunde|\b)\s*(\d{1,2})\s*[.:\-]?/i;
  const subjectRe = /(?:mathematik|math|deutsch|englisch|bio|chemie|physik|informatik|sport|musik|kunst|geschichte|erdkunde|politik|wirtschaft|latein|französisch|spanisch|religion|ethik|sozialwissenschaft|sowi)/i;

  let currentDay = -1;
  for (const line of lines) {
    const ll = line.trim();
    if (!ll) continue;

    // Detect day
    for (const { re, day } of dayPatterns) {
      if (re.test(ll)) { currentDay = day; break; }
    }

    // Try to extract period
    const periodMatch = ll.match(periodRe);
    const roomMatch = ll.match(roomRe);
    const teacherMatch = ll.match(teacherRe);
    const subjectMatch = ll.match(subjectRe);

    if (roomMatch && teacherMatch && currentDay >= 0) {
      const period = periodMatch ? parseInt(periodMatch[1]) : null;
      if (period && period >= 1 && period <= 10) {
        results.push({
          id: `pdf_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          day: currentDay,
          period,
          teacher: teacherMatch[1],
          room: roomMatch[0].trim(),
          subject: subjectMatch ? subjectMatch[0] : teacherMatch[1],
        });
      }
    }
  }

  // Deduplicate
  const seen = new Set();
  return results.filter(e => {
    const k = `${e.day}_${e.period}_${e.teacher}_${e.room}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

document.getElementById('pdf-import-btn').addEventListener('click', () => {
  if (!parsedLbEntries || parsedLbEntries.length === 0) {
    showToast('Keine Einträge zum Importieren', 'error');
    return;
  }
  parsedLbEntries.forEach(e => {
    const key = `${e.day}_${e.period}`;
    if (!state.lbData[key]) state.lbData[key] = [];
    state.lbData[key].push(e);
    // mark matching lessons as LB-capable
    state.lessons.forEach(l => { if (l.day === e.day && l.period === e.period) l.isLB = true; });
  });
  saveState();
  renderLbManager();
  showToast(`${parsedLbEntries.length} Lernbüros importiert ✓`, 'success');
  parsedLbEntries = null;
  document.getElementById('pdf-preview').style.display = 'none';
});

// ── UNTIS INTEGRATION ──
// Note: Direct Untis API calls are blocked by CORS in browser environments.
// This implementation uses a CORS proxy approach or the WebUntis unofficial API.
// For production, you need either a backend proxy or use the official Untis iCal export.

const untisFields = ['untis-url', 'untis-school', 'untis-user', 'untis-pass', 'untis-classes'];
untisFields.forEach(id => {
  const el = document.getElementById(id);
  const key = id.replace('untis-', '');
  el.value = state.untis[key] || '';
  el.addEventListener('change', () => {
    state.untis[key] = el.value;
    saveState();
  });
});

document.getElementById('untis-connect-btn').addEventListener('click', async () => {
  const status = document.getElementById('untis-status');
  const { url, school, user, pass, classes } = state.untis;
  if (!url || !school || !user || !pass) {
    showToast('Bitte alle Untis-Felder ausfüllen', 'error');
    return;
  }
  status.textContent = '⏳ Verbinde mit Untis…';

  try {
    // Try WebUntis JSON-RPC API
    const baseUrl = url.replace(/\/$/, '');
    const loginRes = await fetch(`${baseUrl}/WebUntis/jsonrpc.do?school=${encodeURIComponent(school)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: '1', method: 'authenticate', params: { user, password: pass, client: 'stundenplan-pwa' }, jsonrpc: '2.0'
      }),
      credentials: 'include'
    });
    const loginData = await loginRes.json();
    if (loginData.error) throw new Error(loginData.error.message);
    const sessionId = loginData.result.sessionId;

    // Get timetable for current week
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const ttRes = await fetch(`${baseUrl}/WebUntis/jsonrpc.do?school=${encodeURIComponent(school)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': `JSESSIONID=${sessionId}` },
      body: JSON.stringify({
        id: '2', method: 'getTimetable',
        params: { options: { startDate: dateStr, endDate: dateStr, onlyBaseTimetable: true, showInfo: true, showSubstText: true, showLsText: true, klasseFields: ['name'], roomFields: ['name'], subjectFields: ['name'], teacherFields: ['name'] } },
        jsonrpc: '2.0'
      }),
      credentials: 'include'
    });
    const ttData = await ttRes.json();
    if (ttData.error) throw new Error(ttData.error.message);

    const classList = (classes || '').split(',').map(c => c.trim().toLowerCase());
    const lessons = processUntisLessons(ttData.result || [], classList);
    state.lessons = lessons;
    saveState();
    status.textContent = `✅ ${lessons.length} Stunden geladen!`;
    renderToday();
    renderWeek();
    showToast('Stundenplan von Untis geladen ✓', 'success');
  } catch (err) {
    status.textContent = '⚠️ ' + err.message + ' – Tipp: CORS-Proxy nötig oder Demo-Daten nutzen.';
    console.error(err);
  }
});

function processUntisLessons(raw, classList) {
  const lessons = [];
  raw.forEach(item => {
    const dow = parseInt(String(item.date).slice(-2)) % 7; // rough day-of-week
    const dayIdx = dow >= 1 && dow <= 5 ? dow - 1 : -1;
    if (dayIdx < 0) return;
    const period = item.startTime ? Math.round(item.startTime / 100) : item.lessonNumber;
    const subject = item.su?.[0]?.name || 'Fach';
    const teacher = item.te?.[0]?.name || '';
    const room = item.ro?.[0]?.name || '';
    const klasse = item.kl?.[0]?.name?.toLowerCase() || '';

    const isLBClass = klasse.includes('lb') || klasse.includes('os_lb');
    const matchesClass = classList.length === 0 || classList.some(c => klasse.includes(c));
    if (!matchesClass) return;

    // Check if this is a Lernbüro slot (class contains LB or subject matches)
    const isLB = isLBClass || subject.toLowerCase().includes('lb');
    lessons.push({ day: dayIdx, period: parseInt(period) || 1, subject, teacher, room, isLB });
  });
  return lessons;
}

// ── DEMO DATA ──
document.getElementById('demo-btn').addEventListener('click', () => {
  state.lessons = [
    { day: 0, period: 1, subject: 'Deutsch', teacher: 'MÜL', room: 'A 1-01', isLB: false },
    { day: 0, period: 2, subject: 'Mathematik', teacher: 'SCH', room: 'A 1-02', isLB: false },
    { day: 0, period: 3, subject: 'LB', teacher: '', room: '', isLB: true },
    { day: 0, period: 4, subject: 'LB', teacher: '', room: '', isLB: true },
    { day: 0, period: 5, subject: 'Englisch', teacher: 'BRN', room: 'B 2-04', isLB: false },
    { day: 1, period: 1, subject: 'Bio', teacher: 'KRN', room: 'C 3-01', isLB: false },
    { day: 1, period: 3, subject: 'LB', teacher: '', room: '', isLB: true },
    { day: 1, period: 4, subject: 'Physik', teacher: 'WGN', room: 'C 3-02', isLB: false },
    { day: 2, period: 2, subject: 'Geschichte', teacher: 'FOC', room: 'A 2-03', isLB: false },
    { day: 2, period: 3, subject: 'LB', teacher: '', room: '', isLB: true },
    { day: 3, period: 1, subject: 'Chemie', teacher: 'HNR', room: 'D 1-01', isLB: false },
    { day: 3, period: 4, subject: 'LB', teacher: '', room: '', isLB: true },
    { day: 4, period: 2, subject: 'Sport', teacher: 'LNG', room: 'Sporthalle', isLB: false },
    { day: 4, period: 3, subject: 'LB', teacher: '', room: '', isLB: true },
  ];
  state.lbData = {
    '0_3': [
      { id: 'lb1', teacher: 'SSCH', room: 'O 2-02', subject: 'Mathematik' },
      { id: 'lb2', teacher: 'MÜL', room: 'A 1-01', subject: 'Deutsch' },
      { id: 'lb3', teacher: 'BRN', room: 'B 2-04', subject: 'Englisch' },
    ],
    '0_4': [
      { id: 'lb4', teacher: 'KRN', room: 'C 3-01', subject: 'Biologie' },
      { id: 'lb5', teacher: 'WGN', room: 'C 3-02', subject: 'Physik' },
    ],
    '1_3': [
      { id: 'lb6', teacher: 'SSCH', room: 'O 2-02', subject: 'Mathematik' },
      { id: 'lb7', teacher: 'HNR', room: 'D 1-01', subject: 'Chemie' },
    ],
    '2_3': [
      { id: 'lb8', teacher: 'FOC', room: 'A 2-03', subject: 'Geschichte' },
      { id: 'lb9', teacher: 'MÜL', room: 'A 1-01', subject: 'Deutsch' },
    ],
    '3_4': [
      { id: 'lb10', teacher: 'SSCH', room: 'O 2-02', subject: 'Mathematik' },
      { id: 'lb11', teacher: 'LNG', room: 'Sporthalle', subject: 'Sport' },
    ],
    '4_3': [
      { id: 'lb12', teacher: 'BRN', room: 'B 2-04', subject: 'Englisch' },
      { id: 'lb13', teacher: 'KRN', room: 'C 3-01', subject: 'Biologie' },
    ],
  };
  saveState();
  renderToday();
  renderWeek();
  showToast('Demo-Daten geladen ✓', 'success');
  document.querySelectorAll('.nav-tab')[0].click();
});

// ── RESET ──
document.getElementById('reset-btn').addEventListener('click', () => {
  if (confirm('Wirklich alle Daten löschen?')) {
    localStorage.removeItem(STATE_KEY);
    state = defaultState();
    renderToday();
    renderWeek();
    renderLbManager();
    showToast('Daten gelöscht');
  }
});

// ── INIT ──
renderToday();
renderWeek();
