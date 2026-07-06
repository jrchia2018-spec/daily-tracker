import {
  state, save, uid, dateKey, addDays, fmtDate, weekKeys,
  mealsFor, mealTotals, runsOn, gymOn, latestWeight,
  exportData, importData, clamp,
} from './store.js';
import {
  ACTIVITY, GOAL_RATES, computeTargets, maybeAutoRecalc,
  burnedOn, weightTrend, runKcal,
} from './targets.js';
import { searchFood, parseServingGrams } from './food.js';
import { searchCommonFoods } from './foods.js';

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
const modalRoot = document.getElementById('modal-root');
const modalCard = document.getElementById('modal-card');
const toastEl = document.getElementById('toast');

let tab = 'home';
let mealDate = dateKey();
let trainSub = 'runs';
let gymDraft = null;

// ---------- small helpers ----------

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const r0 = n => Math.round(n || 0);
const r1 = n => Math.round((n || 0) * 10) / 10;

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2600);
}

function openModal(html) {
  modalCard.innerHTML = html;
  modalRoot.classList.remove('hidden');
  return modalCard;
}
function closeModal() {
  modalRoot.classList.add('hidden');
  modalCard.innerHTML = '';
}
document.getElementById('modal-backdrop').addEventListener('click', closeModal);

tabbar.addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  tab = btn.dataset.tab;
  render();
});

function targets() {
  return state.targets || { calories: 2000, protein: 120, carbs: 220, fat: 60 };
}

// ---------- theme ----------

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('tracker.theme', t);
  document.querySelector('meta[name="theme-color"]')
    .setAttribute('content', t === 'light' ? '#f3f5fa' : '#0e1220');
}

function currentTheme() {
  return localStorage.getItem('tracker.theme') || 'dark';
}

applyTheme(currentTheme());

// ---------- render root ----------

function render() {
  if (!state.profile) {
    renderOnboarding();
    return;
  }
  for (const b of tabbar.querySelectorAll('.tab')) {
    b.classList.toggle('active', b.dataset.tab === tab);
  }
  ({ home: renderHome, meals: renderMeals, train: renderTrain, progress: renderProgress, news: renderNews }[tab])();
  window.scrollTo(0, 0);
}

// ---------- onboarding ----------

function renderOnboarding() {
  view.innerHTML = `
  <div class="onboard">
    <div class="logo">⚡</div>
    <h1 class="center">Daily Tracker</h1>
    <p class="center muted" style="margin:6px 0 22px">Meals, workouts and progress in one place.<br>Let's set your targets first.</p>
    <div class="card">
      <label class="field"><span>Sex</span>
        <select id="ob-sex"><option value="male">Male</option><option value="female">Female</option></select>
      </label>
      <div class="grid2">
        <label class="field"><span>Age</span><input id="ob-age" type="number" inputmode="numeric" placeholder="25"></label>
        <label class="field"><span>Height (cm)</span><input id="ob-height" type="number" inputmode="decimal" placeholder="175"></label>
        <label class="field"><span>Weight (kg)</span><input id="ob-weight" type="number" inputmode="decimal" step="0.1" placeholder="70"></label>
        <label class="field"><span>Goal weight (kg)</span><input id="ob-goal" type="number" inputmode="decimal" step="0.1" placeholder="65"></label>
      </div>
      <label class="field"><span>Activity level</span>
        <select id="ob-activity">${Object.entries(ACTIVITY).map(([k, v]) =>
          `<option value="${k}" ${k === 'moderate' ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      </label>
      <label class="field"><span>Goal pace</span>
        <select id="ob-rate">${GOAL_RATES.map(g =>
          `<option value="${g.value}" ${g.value === -0.25 ? 'selected' : ''}>${g.label}</option>`).join('')}</select>
      </label>
      <button class="btn primary block" id="ob-save">Calculate my targets</button>
      <p class="small muted" style="margin-top:10px">Targets use the Mifflin-St Jeor formula and auto-adjust weekly from your logged weight and meals. You can edit them manually anytime.</p>
    </div>
  </div>`;

  view.querySelector('#ob-save').addEventListener('click', () => {
    const g = id => view.querySelector('#' + id).value;
    const profile = {
      sex: g('ob-sex'),
      age: Number(g('ob-age')),
      heightCm: Number(g('ob-height')),
      weightKg: Number(g('ob-weight')),
      goalWeightKg: Number(g('ob-goal')),
      activity: g('ob-activity'),
      goalRate: Number(g('ob-rate')),
    };
    if (!profile.age || !profile.heightCm || !profile.weightKg || !profile.goalWeightKg) {
      toast('Please fill in all fields');
      return;
    }
    state.profile = profile;
    state.weights = [{ date: dateKey(), kg: profile.weightKg }];
    state.targets = { ...computeTargets(profile, profile.weightKg), mode: 'auto', updatedAt: dateKey() };
    state.lastAutoRecalc = dateKey();
    save();
    tab = 'home';
    render();
    toast('Targets set — welcome!');
  });
}

// ---------- home ----------

function renderHome() {
  const today = dateKey();
  const t = targets();
  const tot = mealTotals(today);
  const burned = burnedOn(today);
  const remaining = t.calories - r0(tot.kcal) + burned;
  const pct = clamp((tot.kcal / t.calories) * 100, 0, 100);
  const over = tot.kcal > t.calories + burned;
  const week = weekKeys();
  const weekKm = state.runs.filter(r => week.includes(r.date)).reduce((s, r) => s + r.km, 0);
  const weekSessions = state.gym.filter(g => week.includes(g.date)).length;
  const w = latestWeight();

  const showNote = state.lastAutoNote && state.targets?.updatedAt &&
    Math.abs(new Date(today) - new Date(state.targets.updatedAt)) < 3 * 86400000;

  view.innerHTML = `
  <div class="row between" style="margin-bottom:14px">
    <div><h1>Today</h1><div class="muted small">${fmtDate(today)}</div></div>
    <div class="row" style="gap:8px">
      <span class="badge ${state.targets?.mode === 'auto' ? 'green' : 'orange'}">${state.targets?.mode === 'auto' ? 'Auto targets' : 'Manual targets'}</span>
      <button class="btn small" id="theme-btn" title="Toggle light/dark">${currentTheme() === 'dark' ? '☀️' : '🌙'}</button>
    </div>
  </div>

  ${showNote ? `<div class="note">📈 ${esc(state.lastAutoNote)} <button class="btn ghost small" id="dismiss-note">Dismiss</button></div>` : ''}

  <div class="card">
    <div class="ring-wrap">
      <div class="ring" style="--pct:${pct}; --ring-color:${over ? 'var(--red)' : 'var(--accent)'}">
        <div class="hole">
          <div class="big">${r0(Math.abs(remaining))}</div>
          <div class="small muted">${remaining >= 0 ? 'kcal left' : 'kcal over'}</div>
        </div>
      </div>
      <div class="macro-bars">
        ${macroBar('Protein', tot.protein, t.protein, 'var(--green)')}
        ${macroBar('Carbs', tot.carbs, t.carbs, 'var(--orange)')}
        ${macroBar('Fat', tot.fat, t.fat, 'var(--teal)')}
      </div>
    </div>
    <div class="row between" style="margin-top:14px" >
      <span class="small muted">Eaten <b style="color:var(--text)">${r0(tot.kcal)}</b></span>
      <span class="small muted">Burned <b style="color:var(--text)">${burned}</b></span>
      <span class="small muted">Target <b style="color:var(--text)">${t.calories}</b></span>
    </div>
  </div>

  <div class="card">
    <h2>This week</h2>
    <div class="week-strip">${week.map(k => dayCell(k, today)).join('')}</div>
    <div class="row between" style="margin-top:14px">
      <span class="small muted">🏃 <b style="color:var(--text)">${r1(weekKm)} km</b> this week</span>
      <span class="small muted">🏋️ <b style="color:var(--text)">${weekSessions}</b> gym session${weekSessions === 1 ? '' : 's'}</span>
      <span class="small muted">⚖️ <b style="color:var(--text)">${w ? r1(w) + ' kg' : '—'}</b></span>
    </div>
  </div>

  <div class="quick">
    <button class="btn" id="q-meal"><span class="ico">🍽️</span>Meal</button>
    <button class="btn" id="q-run"><span class="ico">🏃</span>Run</button>
    <button class="btn" id="q-gym"><span class="ico">🏋️</span>Gym</button>
    <button class="btn" id="q-weight"><span class="ico">⚖️</span>Weight</button>
  </div>

  <div class="card" style="margin-top:14px">
    <div class="row between">
      <h2 style="margin:0">📰 Daily news</h2>
      <span class="badge">Coming soon</span>
    </div>
    <p class="small muted" style="margin-top:6px">This section is reserved for your daily news update.</p>
  </div>`;

  view.querySelector('#theme-btn').addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    render();
  });
  view.querySelector('#q-meal').addEventListener('click', () => { tab = 'meals'; mealDate = today; render(); });
  view.querySelector('#q-run').addEventListener('click', openRunModal);
  view.querySelector('#q-gym').addEventListener('click', () => { tab = 'train'; trainSub = 'gym'; render(); });
  view.querySelector('#q-weight').addEventListener('click', openWeightModal);
  view.querySelector('#dismiss-note')?.addEventListener('click', () => {
    state.lastAutoNote = null; save(); render();
  });
}

function macroBar(label, val, max, color) {
  const pct = clamp((val / max) * 100, 0, 100);
  return `
  <div class="macro-bar">
    <div class="row"><span class="muted">${label}</span><span><b>${r0(val)}</b><span class="muted"> / ${max}g</span></span></div>
    <div class="track"><div class="fill" style="width:${pct}%;background:${color}"></div></div>
  </div>`;
}

function dayCell(key, today) {
  const ran = runsOn(key).length > 0;
  const lifted = gymOn(key).length > 0;
  const icons = (ran ? '🏃' : '') + (lifted ? '🏋️' : '');
  const d = fmtDate(key).slice(0, 3);
  return `
  <div class="day-cell ${key === today ? 'today' : ''} ${icons ? 'done' : ''}">
    <div class="dot">${icons || '<span class="muted" style="font-size:11px">·</span>'}</div>
    <div class="dname">${d}</div>
  </div>`;
}

// ---------- meals ----------

function renderMeals() {
  const t = targets();
  const tot = mealTotals(mealDate);
  const entries = mealsFor(mealDate);

  view.innerHTML = `
  <h1 style="margin-bottom:14px">Meals</h1>
  <div class="date-nav">
    <button class="btn" id="d-prev">‹</button>
    <b>${mealDate === dateKey() ? 'Today' : fmtDate(mealDate)}</b>
    <button class="btn" id="d-next">›</button>
  </div>

  <div class="card">
    <div class="totals-strip">
      ${totCell(r0(tot.kcal), t.calories, 'kcal')}
      ${totCell(r0(tot.protein), t.protein, 'protein')}
      ${totCell(r0(tot.carbs), t.carbs, 'carbs')}
      ${totCell(r0(tot.fat), t.fat, 'fat')}
    </div>
  </div>

  <div class="card">
    <h2>Add food</h2>
    <div class="search-box">
      <input id="food-q" type="search" placeholder="Start typing… e.g. salmon, rice, yogurt" autocomplete="off">
    </div>
    <div id="food-results" class="search-results"></div>
    <button class="btn ghost small" id="food-manual">+ Enter manually instead</button>
  </div>

  <div class="card">
    <h2>Logged (${entries.length})</h2>
    ${entries.length ? entries.map(m => `
      <div class="item" data-id="${m.id}" style="cursor:pointer">
        <div>
          <div class="title">${esc(m.name)}</div>
          <div class="sub">${m.grams ? m.grams + 'g · ' : ''}P ${r0(m.protein)} · C ${r0(m.carbs)} · F ${r0(m.fat)}</div>
        </div>
        <div class="val">${r0(m.kcal)} kcal</div>
      </div>`).join('')
    : '<p class="muted small">Nothing logged yet. Search above to add your first item.</p>'}
  </div>`;

  view.querySelector('#d-prev').addEventListener('click', () => { mealDate = addDays(mealDate, -1); render(); });
  view.querySelector('#d-next').addEventListener('click', () => { mealDate = addDays(mealDate, 1); render(); });
  view.querySelector('#food-manual').addEventListener('click', () => openFoodModal(null));

  for (const it of view.querySelectorAll('.item[data-id]')) {
    it.addEventListener('click', () => {
      const entry = mealsFor(mealDate).find(m => m.id === it.dataset.id);
      if (entry) openFoodModal(null, entry);
    });
  }

  // Live search: built-in basics match instantly on every keystroke;
  // online results (Open Food Facts) are debounced and appended below.
  const q = view.querySelector('#food-q');
  const box = view.querySelector('#food-results');
  let shown = [];
  let timer = null;
  let seq = 0;

  function paint(loading) {
    box.innerHTML = shown.map((f, i) => `
      <div class="item" data-i="${i}">
        <div>
          <div class="title">${esc(f.name)}</div>
          <div class="sub">${f.brand === 'Basic' ? '<span class="badge green">Basic</span>' : esc(f.brand || 'Generic')} · per 100g: P ${f.per100.protein ?? '?'} C ${f.per100.carbs ?? '?'} F ${f.per100.fat ?? '?'}</div>
        </div>
        <div class="val">${r0(f.per100.kcal)} kcal</div>
      </div>`).join('')
      + (loading ? '<div class="spinner"></div>' : '')
      + (!shown.length && !loading && q.value.trim()
        ? '<p class="muted small" style="padding:8px 0">No matches. Try a simpler name, or enter it manually.</p>' : '');
    for (const it of box.querySelectorAll('.item[data-i]')) {
      it.addEventListener('click', () => openFoodModal(shown[Number(it.dataset.i)]));
    }
  }

  q.addEventListener('input', () => {
    const query = q.value.trim();
    clearTimeout(timer);
    const my = ++seq;
    if (!query) { shown = []; box.innerHTML = ''; return; }
    shown = searchCommonFoods(query);
    const goOnline = query.length >= 3;
    paint(goOnline);
    if (goOnline) {
      timer = setTimeout(async () => {
        try {
          const remote = await searchFood(query);
          if (my !== seq) return; // a newer keystroke superseded this request
          shown = [...searchCommonFoods(query), ...remote.slice(0, 10)];
          paint(false);
        } catch {
          if (my === seq) paint(false);
        }
      }, 450);
    }
  });
}

function totCell(val, max, label) {
  return `<div><div class="tval" style="color:${val > max ? 'var(--red)' : 'var(--text)'}">${val}</div><div class="tlabel">/ ${max} ${label}</div></div>`;
}

// Add (from search result or manual) or edit an existing entry.
function openFoodModal(result, existing = null) {
  const per100 = existing?.per100 || result?.per100 || null;
  const grams = existing?.grams ?? (result ? (parseServingGrams(result.serving) || 100) : '');
  const scaled = f => per100 && per100[f] != null && grams ? r1((per100[f] * grams) / 100) : '';
  const init = {
    name: existing?.name ?? result?.name ?? '',
    kcal: existing?.kcal ?? scaled('kcal'),
    protein: existing?.protein ?? scaled('protein'),
    carbs: existing?.carbs ?? scaled('carbs'),
    fat: existing?.fat ?? scaled('fat'),
  };

  const m = openModal(`
    <h2>${existing ? 'Edit food' : 'Add food'}</h2>
    <label class="field"><span>Name</span><input id="f-name" value="${esc(init.name)}"></label>
    <label class="field"><span>Amount (g) ${per100 ? '— macros update automatically' : ''}</span>
      <input id="f-grams" type="number" inputmode="decimal" value="${grams}"></label>
    <div class="grid2">
      <label class="field"><span>Calories (kcal)</span><input id="f-kcal" type="number" inputmode="decimal" value="${init.kcal}"></label>
      <label class="field"><span>Protein (g)</span><input id="f-protein" type="number" inputmode="decimal" value="${init.protein}"></label>
      <label class="field"><span>Carbs (g)</span><input id="f-carbs" type="number" inputmode="decimal" value="${init.carbs}"></label>
      <label class="field"><span>Fat (g)</span><input id="f-fat" type="number" inputmode="decimal" value="${init.fat}"></label>
    </div>
    <div class="row" style="margin-top:6px">
      <button class="btn primary block" id="f-save">${existing ? 'Save changes' : 'Add to log'}</button>
    </div>
    ${existing ? '<button class="btn danger block" id="f-del" style="margin-top:8px">Delete entry</button>' : ''}
  `);

  const $f = id => m.querySelector('#' + id);
  if (per100) {
    $f('f-grams').addEventListener('input', () => {
      const g = Number($f('f-grams').value) || 0;
      for (const f of ['kcal', 'protein', 'carbs', 'fat']) {
        if (per100[f] != null) $f('f-' + f).value = r1((per100[f] * g) / 100);
      }
    });
  }

  $f('f-save').addEventListener('click', () => {
    const name = $f('f-name').value.trim();
    if (!name) { toast('Name is required'); return; }
    const entry = {
      id: existing?.id || uid(),
      name,
      grams: Number($f('f-grams').value) || null,
      per100,
      kcal: Number($f('f-kcal').value) || 0,
      protein: Number($f('f-protein').value) || 0,
      carbs: Number($f('f-carbs').value) || 0,
      fat: Number($f('f-fat').value) || 0,
    };
    const list = state.meals[mealDate] || (state.meals[mealDate] = []);
    if (existing) {
      const i = list.findIndex(x => x.id === existing.id);
      if (i >= 0) list[i] = entry;
    } else {
      list.push(entry);
    }
    save();
    closeModal();
    render();
    toast(existing ? 'Updated' : `Added ${name}`);
  });

  $f('f-del')?.addEventListener('click', () => {
    state.meals[mealDate] = mealsFor(mealDate).filter(x => x.id !== existing.id);
    save();
    closeModal();
    render();
    toast('Deleted');
  });
}

// ---------- train ----------

function renderTrain() {
  view.innerHTML = `
  <h1 style="margin-bottom:14px">Train</h1>
  <div class="subtabs">
    <button id="st-runs" class="${trainSub === 'runs' ? 'active' : ''}">🏃 Runs</button>
    <button id="st-gym" class="${trainSub === 'gym' ? 'active' : ''}">🏋️ Gym</button>
  </div>
  <div id="train-body"></div>`;

  view.querySelector('#st-runs').addEventListener('click', () => { trainSub = 'runs'; render(); });
  view.querySelector('#st-gym').addEventListener('click', () => { trainSub = 'gym'; render(); });

  if (trainSub === 'runs') renderRuns();
  else renderGym();
}

function renderRuns() {
  const body = view.querySelector('#train-body');
  const week = weekKeys();
  const weekKm = state.runs.filter(r => week.includes(r.date)).reduce((s, r) => s + r.km, 0);
  const recent = [...state.runs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);

  body.innerHTML = `
  <div class="card">
    <div class="row between">
      <div><h2 style="margin:0">Weekly mileage</h2><div class="muted small">Mon–Sun</div></div>
      <div style="text-align:right"><div style="font-size:26px;font-weight:750">${r1(weekKm)} <span class="small muted">km</span></div></div>
    </div>
    <div style="margin-top:12px">${mileageChart()}</div>
  </div>
  <button class="btn primary block" id="add-run" style="margin-bottom:14px">+ Log a run</button>
  <div class="card">
    <h2>Recent runs</h2>
    ${recent.length ? recent.map(r => `
      <div class="item">
        <div>
          <div class="title">${fmtDate(r.date)}</div>
          <div class="sub">${r.min ? r.min + ' min · ' + pace(r) + ' /km' : ''}${r.notes ? ' · ' + esc(r.notes) : ''}</div>
        </div>
        <div class="row" style="gap:4px">
          <div class="val">${r1(r.km)} km</div>
          <button class="btn danger" data-del="${r.id}">✕</button>
        </div>
      </div>`).join('')
    : '<p class="muted small">No runs yet. Strava/Garmin sync is planned — manual logging for now.</p>'}
  </div>`;

  body.querySelector('#add-run').addEventListener('click', openRunModal);
  for (const b of body.querySelectorAll('[data-del]')) {
    b.addEventListener('click', () => {
      state.runs = state.runs.filter(r => r.id !== b.dataset.del);
      save(); render();
    });
  }
}

function pace(r) {
  if (!r.min || !r.km) return '';
  const p = r.min / r.km;
  const mm = Math.floor(p);
  const ss = String(Math.round((p - mm) * 60)).padStart(2, '0');
  return `${mm}:${ss}`;
}

function openRunModal() {
  const m = openModal(`
    <h2>Log a run</h2>
    <label class="field"><span>Date</span><input id="r-date" type="date" value="${dateKey()}"></label>
    <div class="grid2">
      <label class="field"><span>Distance (km)</span><input id="r-km" type="number" inputmode="decimal" step="0.01" placeholder="5.0"></label>
      <label class="field"><span>Duration (min)</span><input id="r-min" type="number" inputmode="decimal" placeholder="28"></label>
    </div>
    <label class="field"><span>Notes (optional)</span><input id="r-notes" placeholder="easy run, intervals..."></label>
    <button class="btn primary block" id="r-save">Save run</button>
  `);
  m.querySelector('#r-save').addEventListener('click', () => {
    const km = Number(m.querySelector('#r-km').value);
    if (!km) { toast('Distance is required'); return; }
    state.runs.push({
      id: uid(),
      date: m.querySelector('#r-date').value || dateKey(),
      km,
      min: Number(m.querySelector('#r-min').value) || null,
      notes: m.querySelector('#r-notes').value.trim(),
    });
    save();
    closeModal();
    render();
    toast(`Run logged: ${km} km (~${runKcal(km, latestWeight())} kcal)`);
  });
}

function mileageChart() {
  // Weekly totals for the last 8 weeks (oldest first).
  const weeks = [];
  const thisMon = weekKeys()[0];
  for (let i = 7; i >= 0; i--) {
    const mon = addDays(thisMon, -7 * i);
    const days = new Set(Array.from({ length: 7 }, (_, j) => addDays(mon, j)));
    const km = state.runs.filter(r => days.has(r.date)).reduce((s, r) => s + r.km, 0);
    weeks.push({ mon, km, current: i === 0 });
  }
  const max = Math.max(5, ...weeks.map(w => w.km));
  const W = 460, H = 130, pad = 6, bw = W / weeks.length;
  const bars = weeks.map((w, i) => {
    const h = (w.km / max) * (H - 38);
    const x = i * bw + pad;
    const label = fmtDate(w.mon, { weekday: false });
    return `
      <rect class="bar ${w.current ? 'current' : ''}" x="${x}" y="${H - 22 - h}" width="${bw - pad * 2}" height="${Math.max(h, 1.5)}" rx="4"/>
      ${w.km > 0 ? `<text class="axis" x="${x + (bw - pad * 2) / 2}" y="${H - 27 - h}" text-anchor="middle">${r1(w.km)}</text>` : ''}
      <text class="axis" x="${x + (bw - pad * 2) / 2}" y="${H - 8}" text-anchor="middle">${label}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

// ---------- gym ----------

function blankGymDraft() {
  return { date: dateKey(), minutes: '', exercises: [{ name: '', sets: [{ w: '', r: '' }] }] };
}

function exerciseNames() {
  const names = new Set();
  for (const s of state.gym) for (const e of s.exercises) names.add(e.name);
  return [...names].sort();
}

function lastSessionFor(name) {
  const sorted = [...state.gym].sort((a, b) => b.date.localeCompare(a.date));
  for (const s of sorted) {
    const ex = s.exercises.find(e => e.name.toLowerCase() === name.toLowerCase());
    if (ex) return { date: s.date, sets: ex.sets };
  }
  return null;
}

function setsSummary(sets) {
  return sets.map(s => `${s.w}×${s.r}`).join(', ');
}

function renderGym() {
  if (!gymDraft) gymDraft = blankGymDraft();
  const body = view.querySelector('#train-body');
  const names = exerciseNames();
  const sessions = [...state.gym].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);

  body.innerHTML = `
  <div class="card">
    <h2>New session</h2>
    <div class="grid2">
      <label class="field"><span>Date</span><input id="g-date" type="date" value="${gymDraft.date}"></label>
      <label class="field"><span>Duration (min)</span><input id="g-min" type="number" inputmode="numeric" placeholder="60" value="${gymDraft.minutes}"></label>
    </div>
    <datalist id="ex-names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div id="ex-blocks">${gymDraft.exercises.map((ex, i) => exBlock(ex, i)).join('')}</div>
    <div class="row">
      <button class="btn small" id="g-addex">+ Exercise</button>
      <button class="btn primary" id="g-save" style="flex:1">Save session</button>
    </div>
  </div>
  <div class="card">
    <h2>History</h2>
    ${sessions.length ? sessions.map(s => `
      <div class="item">
        <div style="flex:1">
          <div class="title">${fmtDate(s.date)}${s.minutes ? ` <span class="muted small">· ${s.minutes} min</span>` : ''}</div>
          ${s.exercises.map(e => `<div class="sub">${esc(e.name)} — ${setsSummary(e.sets)}</div>`).join('')}
        </div>
        <button class="btn danger" data-del="${s.id}">✕</button>
      </div>`).join('')
    : '<p class="muted small">No sessions yet. Your last weights per exercise will show up here.</p>'}
  </div>`;

  const $g = sel => body.querySelector(sel);

  $g('#g-date').addEventListener('change', e => { gymDraft.date = e.target.value; });
  $g('#g-min').addEventListener('input', e => { gymDraft.minutes = e.target.value; });

  $g('#g-addex').addEventListener('click', () => {
    gymDraft.exercises.push({ name: '', sets: [{ w: '', r: '' }] });
    render();
  });

  for (const b of body.querySelectorAll('[data-del]')) {
    b.addEventListener('click', () => {
      state.gym = state.gym.filter(s => s.id !== b.dataset.del);
      save(); render();
    });
  }

  // exercise block events
  for (const block of body.querySelectorAll('.ex-block')) {
    const i = Number(block.dataset.i);
    const ex = gymDraft.exercises[i];

    block.querySelector('.ex-name').addEventListener('input', e => { ex.name = e.target.value; });
    block.querySelector('.ex-name').addEventListener('change', e => {
      ex.name = e.target.value;
      const hint = block.querySelector('.lasttime');
      const last = ex.name.trim() ? lastSessionFor(ex.name.trim()) : null;
      hint.textContent = last ? `Last time (${fmtDate(last.date)}): ${setsSummary(last.sets)} kg×reps` : '';
    });

    block.querySelector('.ex-remove').addEventListener('click', () => {
      gymDraft.exercises.splice(i, 1);
      if (!gymDraft.exercises.length) gymDraft.exercises.push({ name: '', sets: [{ w: '', r: '' }] });
      render();
    });

    block.querySelector('.ex-addset').addEventListener('click', () => {
      const prev = ex.sets[ex.sets.length - 1];
      ex.sets.push({ w: prev?.w || '', r: prev?.r || '' });
      render();
    });

    for (const row of block.querySelectorAll('.set-row')) {
      const j = Number(row.dataset.j);
      row.querySelector('.set-w').addEventListener('input', e => { ex.sets[j].w = e.target.value; });
      row.querySelector('.set-r').addEventListener('input', e => { ex.sets[j].r = e.target.value; });
      row.querySelector('.set-del').addEventListener('click', () => {
        ex.sets.splice(j, 1);
        if (!ex.sets.length) ex.sets.push({ w: '', r: '' });
        render();
      });
    }
  }

  $g('#g-save').addEventListener('click', () => {
    const exercises = gymDraft.exercises
      .map(e => ({
        name: e.name.trim(),
        sets: e.sets
          .filter(s => s.w !== '' && s.r !== '')
          .map(s => ({ w: Number(s.w), r: Number(s.r) })),
      }))
      .filter(e => e.name && e.sets.length);
    if (!exercises.length) { toast('Add at least one exercise with a set'); return; }
    state.gym.push({
      id: uid(),
      date: gymDraft.date || dateKey(),
      minutes: Number(gymDraft.minutes) || null,
      exercises,
    });
    save();
    gymDraft = null;
    render();
    toast('Gym session saved 💪');
  });
}

function exBlock(ex, i) {
  const last = ex.name.trim() ? lastSessionFor(ex.name.trim()) : null;
  return `
  <div class="ex-block" data-i="${i}">
    <div class="row">
      <input class="ex-name" list="ex-names" placeholder="Exercise (e.g. Bench Press)" value="${esc(ex.name)}">
      <button class="btn danger ex-remove">✕</button>
    </div>
    <div class="lasttime">${last ? `Last time (${fmtDate(last.date)}): ${setsSummary(last.sets)} kg×reps` : ''}</div>
    ${ex.sets.map((s, j) => `
      <div class="set-row" data-j="${j}">
        <span class="setnum">${j + 1}</span>
        <input class="set-w" type="number" inputmode="decimal" step="0.5" placeholder="kg" value="${s.w}">
        <input class="set-r" type="number" inputmode="numeric" placeholder="reps" value="${s.r}">
        <button class="btn danger set-del">✕</button>
      </div>`).join('')}
    <button class="btn ghost small ex-addset" style="margin-top:8px">+ Set</button>
  </div>`;
}

// ---------- progress ----------

function renderProgress() {
  const p = state.profile;
  const t = targets();
  const w = latestWeight();
  const trend = weightTrend(28);
  const trendWk = trend ? trend.kgPerDay * 7 : null;

  view.innerHTML = `
  <h1 style="margin-bottom:14px">Progress</h1>

  <div class="card">
    <div class="row between">
      <h2 style="margin:0">Weight</h2>
      <button class="btn primary small" id="w-add">+ Log weight</button>
    </div>
    <div class="grid3" style="margin:12px 0;text-align:center">
      <div><div style="font-size:20px;font-weight:750">${w ? r1(w) : '—'}</div><div class="small muted">current kg</div></div>
      <div><div style="font-size:20px;font-weight:750;color:${trendWk == null ? 'var(--muted)' : trendWk <= 0 ? 'var(--green)' : 'var(--orange)'}">${trendWk == null ? '—' : (trendWk > 0 ? '+' : '') + r1(trendWk)}</div><div class="small muted">kg / week</div></div>
      <div><div style="font-size:20px;font-weight:750">${p.goalWeightKg}</div><div class="small muted">goal kg</div></div>
    </div>
    ${weightChart()}
  </div>

  <div class="card">
    <div class="row between">
      <h2 style="margin:0">Targets</h2>
      <span class="badge ${t.mode === 'auto' ? 'green' : 'orange'}">${t.mode === 'auto' ? 'Auto' : 'Manual'}</span>
    </div>
    <div class="totals-strip" style="margin:12px 0">
      <div><div class="tval">${t.calories}</div><div class="tlabel">kcal</div></div>
      <div><div class="tval">${t.protein}g</div><div class="tlabel">protein</div></div>
      <div><div class="tval">${t.carbs}g</div><div class="tlabel">carbs</div></div>
      <div><div class="tval">${t.fat}g</div><div class="tlabel">fat</div></div>
    </div>
    <p class="small muted" style="margin-bottom:10px">Auto mode recalculates weekly from your latest weight, and refines your calorie burn estimate once you have ~2 weeks of logged meals and weigh-ins.</p>
    <div class="row">
      <button class="btn small" id="t-edit">Edit targets</button>
      <button class="btn small" id="t-recalc">Recalculate now</button>
    </div>
  </div>

  <div class="card">
    <h2>Profile</h2>
    <p class="small muted">${p.sex === 'male' ? 'Male' : 'Female'}, ${p.age} · ${p.heightCm} cm · ${ACTIVITY[p.activity].label.split(' (')[0]} · ${GOAL_RATES.find(g => g.value === p.goalRate)?.label || ''}</p>
    <button class="btn small" id="p-edit" style="margin-top:10px">Edit profile</button>
  </div>

  <div class="card">
    <h2>Data</h2>
    <div class="row">
      <button class="btn small" id="d-export">Export backup</button>
      <button class="btn small" id="d-import">Import</button>
      <input id="d-file" type="file" accept=".json" class="hidden">
    </div>
    <p class="small muted" style="margin-top:8px">Data lives on this device (browser storage). Export a backup before switching phones.</p>
  </div>`;

  view.querySelector('#w-add').addEventListener('click', openWeightModal);
  view.querySelector('#t-edit').addEventListener('click', openTargetsModal);
  view.querySelector('#t-recalc').addEventListener('click', () => {
    if (state.targets) state.targets.mode = 'auto';
    const note = maybeAutoRecalc({ force: true });
    render();
    toast(note || 'Targets are already up to date');
  });
  view.querySelector('#p-edit').addEventListener('click', openProfileModal);
  view.querySelector('#d-export').addEventListener('click', () => {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tracker-backup-${dateKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  const fileInput = view.querySelector('#d-file');
  view.querySelector('#d-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      importData(await f.text());
      render();
      toast('Backup imported');
    } catch {
      toast('Import failed — not a valid backup file');
    }
  });
}

function openWeightModal() {
  const m = openModal(`
    <h2>Log weight</h2>
    <label class="field"><span>Date</span><input id="w-date" type="date" value="${dateKey()}"></label>
    <label class="field"><span>Weight (kg)</span><input id="w-kg" type="number" inputmode="decimal" step="0.1" placeholder="${latestWeight() || 70}"></label>
    <button class="btn primary block" id="w-save">Save</button>
  `);
  m.querySelector('#w-save').addEventListener('click', () => {
    const kg = Number(m.querySelector('#w-kg').value);
    const date = m.querySelector('#w-date').value || dateKey();
    if (!kg) { toast('Enter a weight'); return; }
    state.weights = state.weights.filter(x => x.date !== date);
    state.weights.push({ date, kg });
    state.weights.sort((a, b) => a.date.localeCompare(b.date));
    save();
    const note = maybeAutoRecalc();
    closeModal();
    render();
    toast(note || 'Weight logged');
  });
}

function openTargetsModal() {
  const t = targets();
  const m = openModal(`
    <h2>Edit targets</h2>
    <div class="grid2">
      <label class="field"><span>Calories</span><input id="t-kcal" type="number" value="${t.calories}"></label>
      <label class="field"><span>Protein (g)</span><input id="t-p" type="number" value="${t.protein}"></label>
      <label class="field"><span>Carbs (g)</span><input id="t-c" type="number" value="${t.carbs}"></label>
      <label class="field"><span>Fat (g)</span><input id="t-f" type="number" value="${t.fat}"></label>
    </div>
    <p class="small muted" style="margin-bottom:12px">Saving here switches targets to <b>Manual</b> — they'll stay fixed until you tap "Recalculate now".</p>
    <button class="btn primary block" id="t-save">Save targets</button>
  `);
  m.querySelector('#t-save').addEventListener('click', () => {
    state.targets = {
      calories: Number(m.querySelector('#t-kcal').value) || t.calories,
      protein: Number(m.querySelector('#t-p').value) || t.protein,
      carbs: Number(m.querySelector('#t-c').value) || t.carbs,
      fat: Number(m.querySelector('#t-f').value) || t.fat,
      mode: 'manual',
      updatedAt: dateKey(),
    };
    save();
    closeModal();
    render();
    toast('Targets saved (manual mode)');
  });
}

function openProfileModal() {
  const p = state.profile;
  const m = openModal(`
    <h2>Edit profile</h2>
    <label class="field"><span>Sex</span>
      <select id="p-sex"><option value="male" ${p.sex === 'male' ? 'selected' : ''}>Male</option><option value="female" ${p.sex === 'female' ? 'selected' : ''}>Female</option></select></label>
    <div class="grid2">
      <label class="field"><span>Age</span><input id="p-age" type="number" value="${p.age}"></label>
      <label class="field"><span>Height (cm)</span><input id="p-height" type="number" value="${p.heightCm}"></label>
      <label class="field"><span>Goal weight (kg)</span><input id="p-goal" type="number" step="0.1" value="${p.goalWeightKg}"></label>
      <label class="field"><span>Goal pace</span>
        <select id="p-rate">${GOAL_RATES.map(g => `<option value="${g.value}" ${g.value === p.goalRate ? 'selected' : ''}>${g.label}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>Activity level</span>
      <select id="p-activity">${Object.entries(ACTIVITY).map(([k, v]) => `<option value="${k}" ${k === p.activity ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
    <button class="btn primary block" id="p-save">Save profile</button>
  `);
  m.querySelector('#p-save').addEventListener('click', () => {
    p.sex = m.querySelector('#p-sex').value;
    p.age = Number(m.querySelector('#p-age').value) || p.age;
    p.heightCm = Number(m.querySelector('#p-height').value) || p.heightCm;
    p.goalWeightKg = Number(m.querySelector('#p-goal').value) || p.goalWeightKg;
    p.goalRate = Number(m.querySelector('#p-rate').value);
    p.activity = m.querySelector('#p-activity').value;
    save();
    const note = maybeAutoRecalc({ force: true });
    closeModal();
    render();
    toast(note || 'Profile saved');
  });
}

function weightChart() {
  const cutoff = addDays(dateKey(), -90);
  const pts = state.weights.filter(x => x.date >= cutoff);
  if (pts.length < 2) {
    return '<p class="muted small">Log a few weigh-ins to see your trend here.</p>';
  }
  const goal = state.profile.goalWeightKg;
  const W = 460, H = 190, padL = 34, padR = 10, padT = 14, padB = 22;
  const t0 = new Date(pts[0].date).getTime();
  const t1 = new Date(pts[pts.length - 1].date).getTime();
  const span = Math.max(t1 - t0, 86400000);
  const ys = pts.map(x => x.kg);
  const lo = Math.min(...ys, goal) - 0.5;
  const hi = Math.max(...ys, goal) + 0.5;
  const X = t => padL + ((t - t0) / span) * (W - padL - padR);
  const Y = kg => padT + (1 - (kg - lo) / (hi - lo)) * (H - padT - padB);

  const line = pts.map(x => `${r1(X(new Date(x.date).getTime()))},${r1(Y(x.kg))}`).join(' ');
  const dots = pts.slice(-3).map(x =>
    `<circle class="dot" cx="${r1(X(new Date(x.date).getTime()))}" cy="${r1(Y(x.kg))}" r="3.5"/>`).join('');
  const gy = r1(Y(goal));

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <line class="grid-line" x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}"/>
    <line class="grid-line" x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}"/>
    <text class="axis" x="4" y="${padT + 4}">${r1(hi)}</text>
    <text class="axis" x="4" y="${H - padB + 4}">${r1(lo)}</text>
    <line class="goal" x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}"/>
    <text class="axis" x="${W - padR}" y="${gy - 4}" text-anchor="end" fill="var(--green)">goal ${goal}</text>
    <polyline class="series" points="${line}"/>
    ${dots}
    <text class="axis" x="${padL}" y="${H - 6}">${fmtDate(pts[0].date, { weekday: false })}</text>
    <text class="axis" x="${W - padR}" y="${H - 6}" text-anchor="end">${fmtDate(pts[pts.length - 1].date, { weekday: false })}</text>
  </svg>`;
}

// ---------- news ----------

function renderNews() {
  view.innerHTML = `
  <h1 style="margin-bottom:14px">News</h1>
  <div class="card center" style="padding:38px 20px">
    <div style="font-size:40px;margin-bottom:10px">📰</div>
    <h2>Daily news — coming soon</h2>
    <p class="muted small" style="max-width:300px;margin:6px auto 0">This tab is reserved for your daily news update. We'll wire it up to your preferred sources later.</p>
  </div>`;
}

// ---------- init ----------

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

const startupNote = maybeAutoRecalc();
render();
if (startupNote) toast('📈 Targets auto-updated');
