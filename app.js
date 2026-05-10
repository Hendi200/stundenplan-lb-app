// ── SERVICE WORKER ──
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
if (typeof pdfjsLib !== 'undefined') pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── SUBJECT COLORS ──
const SUBJECT_COLORS = {
  M:'#6c63ff', MATH:'#6c63ff',
  E:'#3b82f6', ENG:'#3b82f6',
  D:'#ef4444', DEU:'#ef4444',
  BI:'#22c55e', BIO:'#22c55e',
  CH:'#a855f7', CHE:'#a855f7',
  PH:'#f97316', PHY:'#f97316',
  IF:'#f59e0b', INF:'#f59e0b',
  GE:'#14b8a6', GES:'#14b8a6',
  EK:'#84cc16', ERD:'#84cc16',
  SW:'#06b6d4', SOWI:'#06b6d4',
  SP:'#f43f5e', SPO:'#f43f5e',
  KU:'#8b5cf6', MU:'#ec4899',
  LA:'#0ea5e9', FR:'#10b981',
  NL:'#f97316', KR:'#db2777',
  PA:'#64748b', LI:'#7c3aed',
  LB:'#facc15', L8:'#eab308',
  ER:'#059669', F:'#dc2626',
  S:'#2563eb', SW:'#0891b2',
  DEFAULT:'#6b7280'
};

function subjectColor(subject) {
  if (!subject) return SUBJECT_COLORS.DEFAULT;
  const key = subject.toUpperCase().replace(/[^A-Z0-9]/g,'');
  return SUBJECT_COLORS[key] || SUBJECT_COLORS.DEFAULT;
}

// ── STATE ──
const SK = 'sp_state_v2';
let S = loadState();

function defaultState() {
  return {
    lessons: [],
    lbData: {},
    bookings: {},
    untis: {},
    weekOffset: 0,
    activeFilter: null,
  };
}
function loadState() {
  try { const s = JSON.parse(localStorage.getItem(SK)); return s ? {...defaultState(),...s} : defaultState(); }
  catch { return defaultState(); }
}
function save() { localStorage.setItem(SK, JSON.stringify(S)); }

// ── HELPERS ──
const DAYS = ['Mo','Di','Mi','Do','Fr'];
const DAYS_LONG = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag'];
const TIMES = [
  ['07:55','08:40'],['08:40','09:25'],['09:45','10:30'],['10:30','11:15'],
  ['11:35','12:20'],['12:20','13:05'],['13:15','14:00'],['14:05','14:50'],
  ['14:50','15:35'],['15:40','16:25']
];

function getMonday(offset=0) {
  const n = new Date(); const d = n.getDay();
  const diff = n.getDate() - (d===0?6:d-1) + offset*7;
  const m = new Date(n); m.setDate(diff); m.setHours(0,0,0,0); return m;
}
function getWeekNum(d) {
  const s = new Date(d.getFullYear(),0,1);
  return Math.ceil(((d-s)/86400000+s.getDay()+1)/7);
}
function weekKey(off) {
  const m = getMonday(off); return `${m.getFullYear()}-${String(getWeekNum(m)).padStart(2,'0')}`;
}
function lbSlotKey(d,p) { return `${d}_${p}`; }
function bookingKey(d,p,off) { return `${weekKey(off)}_${d}_${p}`; }

function toast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show' + (type?' '+type:'');
  setTimeout(()=>{ t.className='toast'; }, 2600);
}

// ── NAVIGATION ──
const pages = { today:'page-today', week:'page-week', lb:'page-lb', settings:'page-settings' };
document.querySelectorAll('.bnav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const pg = btn.dataset.page;
    document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(pages[pg]).classList.add('active');
    document.getElementById('kw-nav').style.display = pg==='week' ? '' : 'none';
    if (pg==='week') renderWeek();
    if (pg==='today') renderToday();
    if (pg==='lb') renderLbList();
  });
});

document.getElementById('settings-btn').addEventListener('click', () => {
  document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.bnav-item')[3].classList.add('active');
  document.getElementById('page-settings').classList.add('active');
  document.getElementById('kw-nav').style.display = 'none';
});

// ── BUBBLES ──
function getSubjectsFromLessons() {
  const set = new Set();
  S.lessons.forEach(l => { if (l.subject) set.add(l.subject.toUpperCase()); });
  return [...set].sort();
}

function renderBubbles(containerId, onFilter) {
  const bar = document.getElementById(containerId);
  bar.innerHTML = '';
  const subjects = getSubjectsFromLessons();
  if (subjects.length === 0) return;

  subjects.forEach(sub => {
    const color = subjectColor(sub);
    const btn = document.createElement('button');
    btn.className = 'bubble' + (S.activeFilter === sub ? ' active' : '');
    btn.textContent = sub;
    btn.style.setProperty('--subject-color', color);
    if (S.activeFilter === sub) btn.style.color = color;
    btn.addEventListener('click', () => {
      S.activeFilter = S.activeFilter === sub ? null : sub;
      save();
      onFilter();
    });
    bar.appendChild(btn);
  });
}

// ── TODAY ──
function renderToday() {
  const now = new Date();
  const dow = now.getDay();
  const dayIdx = dow>=1&&dow<=5 ? dow-1 : 0;
  document.getElementById('today-heading').textContent = DAYS_LONG[dayIdx];
  document.getElementById('today-sub').textContent = now.toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'});

  renderBubbles('today-bubbles', renderToday);

  const list = document.getElementById('today-list');
  const todayL = S.lessons.filter(l=>l.day===dayIdx).sort((a,b)=>a.period-b.period);
  if (!todayL.length) {
    list.innerHTML = '<p style="color:var(--text-muted);padding:20px 0">Keine Stunden heute. Demo laden oder Untis verbinden.</p>';
    return;
  }
  list.innerHTML = '';
  todayL.forEach(lesson => {
    const color = subjectColor(lesson.subject);
    const slotKey = lbSlotKey(dayIdx, lesson.period);
    const lbs = S.lbData[slotKey] || [];
    const bKey = bookingKey(dayIdx, lesson.period, S.weekOffset);
    const booked = S.bookings[bKey] ? lbs.find(l=>l.id===S.bookings[bKey]) : null;
    const hasLB = lesson.isLB && lbs.length > 0;
    const times = TIMES[lesson.period-1] || ['',''];

    const dimmed = S.activeFilter && lesson.subject.toUpperCase() !== S.activeFilter;
    const item = document.createElement('div');
    item.className = 'today-item';
    item.style.opacity = dimmed ? '.2' : '1';

    item.innerHTML = `
      <div class="today-time">
        <span class="t-start">${times[0]}</span>
        <span class="t-end">${times[1]}</span>
      </div>
      <div class="today-card" style="--subject-color:${color}">
        <div class="lesson-subject">${lesson.subject}</div>
        <div class="lesson-teacher">${lesson.teacher||''}</div>
        <div class="lesson-room">${lesson.room||''}</div>
        ${booked ? `<div style="margin-top:6px;font-size:.75rem;color:#4ade80;font-weight:700">✓ ${booked.subject||booked.teacher} · ${booked.room}</div>` : ''}
        ${hasLB && !dimmed ? `<button class="today-lb-btn" style="--subject-color:${color}" onclick="openLbModal(${dayIdx},${lesson.period})">
          ${booked?'✏️ Ändern':'📝 LB wählen'}
        </button>` : ''}
        ${booked ? '<span class="lb-dot booked" style="top:8px;right:8px;position:absolute"></span>' : (hasLB ? '<span class="lb-dot" style="top:8px;right:8px;position:absolute"></span>' : '')}
      </div>`;
    list.appendChild(item);
  });
}

// ── WEEK ──
function renderWeek() {
  const mon = getMonday(S.weekOffset);
  const fri = new Date(mon); fri.setDate(fri.getDate()+4);
  document.getElementById('week-label').textContent =
    `KW ${getWeekNum(mon)}, ${mon.getFullYear()}`;

  renderBubbles('week-bubbles', renderWeek);

  const grid = document.getElementById('tt-grid');
  grid.innerHTML = '';
  const today = new Date();
  const todayDow = today.getDay()-1;
  const wk = weekKey(S.weekOffset);

  // Headers
  grid.innerHTML += '<div class="tt-col-header"></div>';
  DAYS.forEach((d,i) => {
    const isToday = i===todayDow && wk===weekKey(0);
    grid.innerHTML += `<div class="tt-col-header${isToday?' today-col':''}">${
      d + (isToday ? '<br><span style="font-size:.6rem;color:var(--accent)">heute</span>' : '')}</div>`;
  });

  for (let p=1; p<=10; p++) {
    const t = TIMES[p-1]||['',''];
    grid.innerHTML += `<div class="tt-time"><span class="period-num">${p}</span><span class="period-start">${t[0]}</span><span class="period-end">${t[1]}</span></div>`;
    for (let d=0; d<5; d++) {
      const lesson = S.lessons.find(l=>l.day===d&&l.period===p);
      const color = lesson ? subjectColor(lesson.subject) : '#888';
      const slotKey = lbSlotKey(d,p);
      const lbs = S.lbData[slotKey]||[];
      const bKey = bookingKey(d,p,S.weekOffset);
      const booked = S.bookings[bKey] ? lbs.find(l=>l.id===S.bookings[bKey]) : null;
      const hasLB = lesson && lesson.isLB && lbs.length>0;
      const filtered = S.activeFilter && lesson && lesson.subject.toUpperCase()!==S.activeFilter;

      const cell = document.createElement('div');
      cell.className = 'tt-cell' + (filtered ? ' filtered' : '');

      if (!lesson) {
        cell.innerHTML = '<div class="cell-empty"><div class="cell-dot"></div></div>';
      } else {
        // Ghost = same subject as previous period (Doppelstunde)
        const prev = S.lessons.find(l=>l.day===d&&l.period===p-1);
        const isGhost = prev && prev.subject===lesson.subject && prev.teacher===lesson.teacher;
        cell.innerHTML = `
          <div class="lesson-card ${isGhost?'ghost':''} ${hasLB?'has-lb':''}" style="--subject-color:${color}" ${
            hasLB && !filtered ? `onclick="openLbModal(${d},${p})"` : ''}>
            <div class="lesson-subject">${lesson.subject}</div>
            <div class="lesson-teacher">${lesson.teacher||''}</div>
            <div class="lesson-room">${lesson.room||''}</div>
            ${booked ? '<span class="lb-dot booked"></span>' : (hasLB ? '<span class="lb-dot"></span>' : '')}
          </div>`;
      }
      grid.appendChild(cell);
    }
  }
}

document.getElementById('prev-week').addEventListener('click', ()=>{ S.weekOffset--; save(); renderWeek(); });
document.getElementById('next-week').addEventListener('click', ()=>{ S.weekOffset++; save(); renderWeek(); });

// ── LB MODAL ──
function openLbModal(day, period) {
  const slotKey = lbSlotKey(day,period);
  const lbs = S.lbData[slotKey]||[];
  const bKey = bookingKey(day,period,S.weekOffset);
  const currentId = S.bookings[bKey];

  document.getElementById('lb-modal-title').textContent = `${DAYS_LONG[day]} · Stunde ${period}`;
  document.getElementById('lb-modal-sub').textContent = TIMES[period-1]?.[0]+' – '+(TIMES[period-1]?.[1]||'');

  const opts = document.getElementById('lb-modal-options');
  const cancelBtn = document.getElementById('lb-modal-cancel');

  if (!lbs.length) {
    opts.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px 0">Keine Lernbüros für diese Stunde.</p>';
    cancelBtn.style.display = 'none';
  } else {
    opts.innerHTML = lbs.map(lb => {
      const color = subjectColor(lb.subject||lb.teacher);
      return `<div class="lb-option ${currentId===lb.id?'selected':''}" onclick="bookLb('${bKey}','${lb.id}')">
        <div class="lb-color-dot" style="--subject-color:${color};background:${color}"></div>
        <div class="lb-option-content">
          <div class="lb-option-subject">${lb.subject||lb.teacher}</div>
          <div class="lb-option-meta">Lehrer: ${lb.teacher}</div>
          <div class="lb-option-room">📍 ${lb.room}</div>
        </div>
        ${currentId===lb.id?'<span class="lb-check">✓</span>':''}
      </div>`;
    }).join('');
    cancelBtn.style.display = currentId ? 'block' : 'none';
    cancelBtn.onclick = () => { delete S.bookings[bKey]; save(); closeLbModal(); renderToday(); renderWeek(); toast('Buchung aufgehoben','red'); };
  }
  document.getElementById('lb-modal').classList.add('open');
}

function bookLb(bKey, lbId) {
  S.bookings[bKey] = lbId; save();
  closeLbModal(); renderToday(); renderWeek();
  toast('Lernbüro gebucht ✓','green');
}
function closeLbModal() { document.getElementById('lb-modal').classList.remove('open'); }
document.getElementById('lb-modal').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeLbModal(); });

// ── LB LIST ──
function renderLbList() {
  const container = document.getElementById('lb-entries-list');
  container.innerHTML = '';
  let any = false;
  for (let d=0; d<5; d++) {
    for (let p=1; p<=10; p++) {
      const key = lbSlotKey(d,p);
      const entries = S.lbData[key]||[];
      if (!entries.length) continue;
      any = true;
      const card = document.createElement('div');
      card.className = 'lb-slot-card';
      card.innerHTML = `<div class="lb-slot-header"><span class="lb-slot-key">${DAYS_LONG[d]} · Stunde ${p}</span><span style="font-size:.75rem;color:var(--text-muted)">${TIMES[p-1]?.[0]||''}</span></div>`
        + entries.map(e => {
          const color = subjectColor(e.subject||e.teacher);
          return `<div class="lb-entry-row">
            <div class="lb-entry-dot" style="--subject-color:${color};background:${color}"></div>
            <div class="lb-entry-info">
              <div class="lb-entry-subject">${e.subject||e.teacher}</div>
              <div class="lb-entry-meta">${e.teacher} · ${e.room}</div>
            </div>
            <button class="lb-del-btn" onclick="deleteLb('${key}','${e.id}')">✕</button>
          </div>`;
        }).join('');
      container.appendChild(card);
    }
  }
  if (!any) container.innerHTML = '<p style="color:var(--text-muted);padding:20px 0">Noch keine Lernbüros. PDF hochladen oder manuell hinzufügen.</p>';
}

function deleteLb(key, id) {
  S.lbData[key] = (S.lbData[key]||[]).filter(e=>e.id!==id);
  save(); renderLbList(); toast('Gelöscht');
}

// ── ADD LB ──
document.getElementById('lb-add-btn').addEventListener('click', ()=>{ document.getElementById('add-lb-modal').classList.add('open'); });
document.getElementById('add-lb-close').addEventListener('click', ()=>{ document.getElementById('add-lb-modal').classList.remove('open'); });
document.getElementById('add-lb-modal').addEventListener('click', e=>{ if(e.target===e.currentTarget) document.getElementById('add-lb-modal').classList.remove('open'); });
document.getElementById('lb-add-save').addEventListener('click', ()=>{
  const day = parseInt(document.getElementById('lb-add-day').value);
  const period = parseInt(document.getElementById('lb-add-period').value);
  const subject = document.getElementById('lb-add-subject').value.trim().toUpperCase();
  const teacher = document.getElementById('lb-add-teacher').value.trim().toUpperCase();
  const room = document.getElementById('lb-add-room').value.trim();
  if (!period||!teacher||!room) { toast('Bitte Stunde, Lehrer und Raum ausfüllen','red'); return; }
  const key = lbSlotKey(day,period);
  if (!S.lbData[key]) S.lbData[key]=[];
  S.lbData[key].push({ id: Date.now().toString(), subject, teacher, room });
  S.lessons.forEach(l=>{ if(l.day===day&&l.period===period) l.isLB=true; });
  save(); document.getElementById('add-lb-modal').classList.remove('open');
  renderLbList(); toast('Hinzugefügt ✓','green');
});

// ── PDF ──
const uploadZone = document.getElementById('pdf-upload-zone');
const pdfInput = document.getElementById('pdf-input');
uploadZone.addEventListener('click', ()=>pdfInput.click());
uploadZone.addEventListener('dragover', e=>{ e.preventDefault(); uploadZone.classList.add('drag'); });
uploadZone.addEventListener('dragleave', ()=>uploadZone.classList.remove('drag'));
uploadZone.addEventListener('drop', e=>{ e.preventDefault(); uploadZone.classList.remove('drag'); const f=e.dataTransfer.files[0]; if(f?.type==='application/pdf') parsePdf(f); else toast('Bitte PDF hochladen','red'); });
pdfInput.addEventListener('change', ()=>{ if(pdfInput.files[0]) parsePdf(pdfInput.files[0]); });

let parsedEntries = null;
async function parsePdf(file) {
  const status = document.getElementById('pdf-status');
  const preview = document.getElementById('pdf-preview');
  const previewDiv = document.getElementById('pdf-parsed-preview');
  status.textContent = '⏳ Lese PDF…'; preview.style.display = 'block';
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data:buf}).promise;
    let text = '';
    for (let i=1;i<=pdf.numPages;i++) {
      const pg = await pdf.getPage(i);
      const c = await pg.getTextContent();
      text += c.items.map(it=>it.str).join(' ') + '\n';
    }
    parsedEntries = extractLbs(text);
    status.textContent = `✅ ${parsedEntries.length} Lernbüro-Einträge erkannt`;
    const color = subjectColor;
    previewDiv.innerHTML = parsedEntries.slice(0,15).map(e=>
      `<div class="lb-entry-row"><div class="lb-entry-dot" style="background:${color(e.subject||e.teacher)}"></div><div class="lb-entry-info"><div class="lb-entry-subject">${e.subject||e.teacher}</div><div class="lb-entry-meta">${e.teacher} · ${e.room} · ${DAYS_LONG[e.day]} Std.${e.period}</div></div></div>`
    ).join('') + (parsedEntries.length>15?`<p style="color:var(--text-muted);font-size:.78rem;padding:6px 0">…und ${parsedEntries.length-15} weitere</p>`:'');
  } catch(err) { status.textContent = '❌ Fehler: '+err.message; }
}

function extractLbs(text) {
  const results = [];
  const lines = text.split(/[\n\r]+/);
  const dayPats = [{re:/montag|\bmo\b/i,d:0},{re:/dienstag|\bdi\b/i,d:1},{re:/mittwoch|\bmi\b/i,d:2},{re:/donnerstag|\bdo\b/i,d:3},{re:/freitag|\bfr\b/i,d:4}];
  const roomRe = /([A-Z]\s?\d[\s-]?\d{2}|\d{3}[a-zA-Z]?|[A-Z]+\d+)/;
  const teacherRe = /\b([A-ZÜÄÖ]{2,6})\b/g;
  const periodRe = /(?:std\.?|stunde|\b)(\d{1,2})\b/i;
  const subjectRe = /\b(M(?:ATH)?|E(?:NG)?|D(?:EU)?|BI(?:O)?|CH(?:E)?|PH(?:Y)?|IF|GE(?:S)?|EK|SP(?:O)?|KU|MU|LA|FR|NL|KR|PA|LI|SW|SOWI|INF)\b/gi;
  let currentDay = -1;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    for (const {re,d} of dayPats) { if(re.test(line)) { currentDay=d; break; } }
    const pM = line.match(periodRe);
    const rM = line.match(roomRe);
    const sM = line.match(subjectRe);
    const teachers = [...line.matchAll(teacherRe)].map(m=>m[1]).filter(t=>t.length>=2);
    if (rM && teachers.length && currentDay>=0) {
      const period = pM ? parseInt(pM[1]) : null;
      if (period && period>=1 && period<=10) {
        results.push({
          id:`pdf_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
          day: currentDay, period,
          teacher: teachers[0],
          room: rM[0].trim(),
          subject: sM ? sM[0].toUpperCase() : teachers[0],
        });
      }
    }
  }
  const seen = new Set();
  return results.filter(e=>{ const k=`${e.day}_${e.period}_${e.teacher}_${e.room}`; if(seen.has(k)) return false; seen.add(k); return true; });
}

document.getElementById('pdf-import-btn').addEventListener('click', ()=>{
  if (!parsedEntries?.length) { toast('Keine Einträge','red'); return; }
  parsedEntries.forEach(e=>{
    const key=lbSlotKey(e.day,e.period);
    if(!S.lbData[key]) S.lbData[key]=[];
    S.lbData[key].push(e);
    S.lessons.forEach(l=>{ if(l.day===e.day&&l.period===e.period) l.isLB=true; });
  });
  save(); renderLbList();
  toast(`${parsedEntries.length} Lernbüros importiert ✓`,'green');
  parsedEntries=null; document.getElementById('pdf-preview').style.display='none';
});

// ── UNTIS ──
['url','school','user','pass','classes'].forEach(k=>{
  const el=document.getElementById('untis-'+k);
  if(el){ el.value=S.untis[k]||''; el.addEventListener('change',()=>{ S.untis[k]=el.value; save(); }); }
});
document.getElementById('untis-connect-btn').addEventListener('click', async ()=>{
  const st=document.getElementById('untis-status');
  const {url,school,user,pass}=S.untis;
  if (!url||!school||!user||!pass) { toast('Alle Felder ausfüllen','red'); return; }
  st.textContent='⏳ Verbinde…';
  try {
    const base=url.replace(/\/$/,'');
    const r = await fetch(`${base}/WebUntis/jsonrpc.do?school=${encodeURIComponent(school)}`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({id:'1',method:'authenticate',params:{user,password:pass,client:'sp-pwa'},jsonrpc:'2.0'}),
      credentials:'include'
    });
    const data = await r.json();
    if(data.error) throw new Error(data.error.message);
    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const tr = await fetch(`${base}/WebUntis/jsonrpc.do?school=${encodeURIComponent(school)}`,{
      method:'POST', headers:{'Content-Type':'application/json','Cookie':`JSESSIONID=${data.result.sessionId}`},
      body: JSON.stringify({id:'2',method:'getTimetable',params:{options:{startDate:dateStr,endDate:dateStr,onlyBaseTimetable:true,showInfo:true,klasseFields:['name'],roomFields:['name'],subjectFields:['name'],teacherFields:['name']}},jsonrpc:'2.0'}),
      credentials:'include'
    });
    const td = await tr.json();
    if(td.error) throw new Error(td.error.message);
    const classList=(S.untis.classes||'').split(',').map(c=>c.trim().toLowerCase());
    S.lessons = processUntis(td.result||[], classList);
    save(); st.textContent=`✅ ${S.lessons.length} Stunden geladen`;
    renderToday(); renderWeek(); toast('Untis geladen ✓','green');
  } catch(err) { st.textContent='⚠️ '+err.message; }
});

function processUntis(raw, classList) {
  return raw.reduce((acc,item)=>{
    const ds=String(item.date); const dow=parseInt(ds.slice(-2))%7; const dayIdx=dow>=1&&dow<=5?dow-1:-1;
    if(dayIdx<0) return acc;
    const period=item.startTime?Math.round(item.startTime/100):item.lessonNumber;
    const subject=(item.su?.[0]?.name||'').toUpperCase();
    const teacher=item.te?.[0]?.name||'';
    const room=item.ro?.[0]?.name||'';
    const klasse=(item.kl?.[0]?.name||'').toLowerCase();
    const matchesClass=classList.length===0||classList.some(c=>klasse.includes(c));
    if(!matchesClass) return acc;
    const isLB=klasse.includes('lb')||klasse.includes('os_lb')||subject==='LB';
    acc.push({day:dayIdx,period:parseInt(period)||1,subject,teacher,room,isLB});
    return acc;
  },[]);
}

// ── DEMO ──
document.getElementById('demo-btn').addEventListener('click', ()=>{
  S.lessons = [
    {day:0,period:3,subject:'KU',teacher:'THOL',room:'2-14',isLB:false},
    {day:1,period:3,subject:'SP',teacher:'MVCR',room:'TH',isLB:false},
    {day:1,period:4,subject:'SP',teacher:'MVCR',room:'TH',isLB:false},
    {day:1,period:5,subject:'D',teacher:'JDIR',room:'2-02',isLB:false},
    {day:1,period:6,subject:'D',teacher:'JDIR',room:'2-02',isLB:true},
    {day:2,period:1,subject:'E',teacher:'SGEU',room:'1-07',isLB:false},
    {day:2,period:2,subject:'E',teacher:'SGEU',room:'1-07',isLB:false},
    {day:2,period:3,subject:'IF',teacher:'AMIS',room:'1-16',isLB:false},
    {day:2,period:4,subject:'IF',teacher:'AMIS',room:'1-16',isLB:false},
    {day:2,period:5,subject:'M',teacher:'TKIN',room:'1-13',isLB:false},
    {day:2,period:6,subject:'M',teacher:'TKIN',room:'1-13',isLB:true},
    {day:3,period:3,subject:'GE',teacher:'JBÖR',room:'2-01',isLB:false},
    {day:3,period:4,subject:'GE',teacher:'JBÖR',room:'2-01',isLB:false},
    {day:3,period:5,subject:'EK',teacher:'HSCH',room:'1-07',isLB:false},
    {day:3,period:6,subject:'EK',teacher:'HSCH',room:'1-07',isLB:false},
    {day:3,period:8,subject:'NL',teacher:'MVME',room:'1-13',isLB:false},
    {day:3,period:9,subject:'NL',teacher:'MVME',room:'1-13',isLB:false},
    {day:3,period:10,subject:'SP',teacher:'MVCR',room:'TH',isLB:false},
    {day:4,period:1,subject:'KU',teacher:'THOL',room:'2-14',isLB:false},
    {day:4,period:2,subject:'KU',teacher:'THOL',room:'2-14',isLB:false},
    {day:4,period:8,subject:'NL',teacher:'MVME',room:'1-07',isLB:false},
    {day:4,period:9,subject:'NL',teacher:'MVME',room:'1-07',isLB:false},
    {day:0,period:8,subject:'KR',teacher:'SGEU',room:'18C',isLB:false},
    {day:0,period:9,subject:'KR',teacher:'SGEU',room:'18C',isLB:false},
    {day:2,period:8,subject:'CH',teacher:'IDCA',room:'1-19',isLB:false},
    {day:2,period:9,subject:'CH',teacher:'IDCA',room:'1-19',isLB:false},
  ];
  S.lbData = {
    '1_6':[{id:'d1',subject:'M',teacher:'SSCH',room:'O 2-02'},{id:'d2',subject:'D',teacher:'JDIR',room:'2-02'}],
    '2_6':[{id:'d3',subject:'M',teacher:'TKIN',room:'1-13'},{id:'d4',subject:'E',teacher:'SGEU',room:'1-07'}],
  };
  save(); renderToday(); renderWeek();
  document.querySelectorAll('.bnav-item')[1].click();
  toast('Demo geladen ✓','green');
});

// ── RESET ──
document.getElementById('reset-btn').addEventListener('click', ()=>{
  if(confirm('Wirklich alle Daten löschen?')) {
    localStorage.removeItem(SK); S=defaultState(); renderToday(); renderWeek(); renderLbList(); toast('Zurückgesetzt');
  }
});

// ── INIT ──
renderToday();
