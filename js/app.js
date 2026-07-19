import {
  state, save, uid, dateKey, addDays, parseKey, fmtDate, weekKeys,
  mealsFor, mealTotals, runsOn, gymOn, latestWeight, wellnessFor, waterFor, addWater,
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
let reviewWeek = 0; // 0 = current week, -1 = last week, …

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
  const t = state.targets || { calories: 2000, protein: 120, carbs: 220, fat: 60 };
  // Targets saved before fibre/sodium tracking existed lack those fields —
  // fill them with the same defaults computeTargets would use.
  return {
    fibre: Math.max(25, Math.round(((t.calories || 2000) * 14) / 1000)),
    sodium: 2300,
    water: 4000,
    ...t,
  };
}

function fmtWater(ml) {
  return ml < 1000 ? `${ml}ml` : `${r1(ml / 1000)}L`;
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
  // Burned kcal are shown for information only — the budget is the target
  // alone (activity is already baked into TDEE via the activity factor).
  const remaining = t.calories - r0(tot.kcal);
  const pct = clamp((tot.kcal / t.calories) * 100, 0, 100);
  const over = tot.kcal > t.calories;
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
        ${macroBar('Fibre', tot.fibre, t.fibre, 'var(--accent2)')}
        ${macroBar('Sodium', tot.sodium, t.sodium, tot.sodium > t.sodium ? 'var(--red)' : 'var(--accent)', 'mg')}
        ${macroBar('Water', waterFor(today), t.water, 'var(--teal)', 'ml')}
      </div>
    </div>
    <div class="row between" style="margin-top:14px" >
      <span class="small muted">Eaten <b style="color:var(--text)">${r0(tot.kcal)}</b></span>
      <span class="small muted">Burned <b style="color:var(--text)">${burned}</b></span>
      <span class="small muted">Target <b style="color:var(--text)">${t.calories}</b></span>
    </div>
  </div>

  ${(() => {
    const { sleep, sleepMins } = wellnessFor(today);
    const yesterday = addDays(today, -1);
    const yW = wellnessFor(yesterday);
    const yTot = mealTotals(yesterday);
    const checkedIn = (sleep != null || sleepMins != null) && yW.activeKcal != null;
    const yNet = yTot.kcal ? r0(yTot.kcal - t.calories) : null;
    return `
  <div class="card">
    <div class="row between">
      <h2 style="margin:0">Daily summary</h2>
      <button class="btn small ${checkedIn ? '' : 'primary'}" id="q-checkin">${checkedIn ? 'Edit in Meals' : '🌅 Check in'}</button>
    </div>
    <div class="row" style="gap:16px;margin:10px 0 4px">
      <span class="small muted">😴 Sleep <b style="color:${sleep == null ? 'var(--muted)' : sleep >= 80 ? 'var(--green)' : sleep < 60 ? 'var(--orange)' : 'var(--text)'}">${sleep ?? '—'}</b></span>
      <span class="small muted">🛏 <b style="color:${sleepMins == null ? 'var(--muted)' : sleepMins >= 450 ? 'var(--green)' : sleepMins < 360 ? 'var(--orange)' : 'var(--text)'}">${sleepMins != null ? fmtSleep(sleepMins) : '—'}</b></span>
      <span class="small muted">🔥 Yesterday's burn <b style="color:var(--text)">${yW.activeKcal ?? '—'}</b></span>
      ${yNet != null ? `<span class="small muted">Yesterday vs target <b style="color:${yNet <= 0 ? 'var(--green)' : 'var(--orange)'}">${yNet > 0 ? '+' : ''}${yNet}</b></span>` : ''}
    </div>
    ${daySuggestions(today).map(s => `<p class="small" style="margin:8px 0 0">${s}</p>`).join('')}
  </div>`;
  })()}

  ${(() => {
    const cu = catchupDays();
    if (!cu.length) return '';
    return `
  <div class="card" style="border-color:rgba(255,176,84,.45)">
    <h2 style="margin-bottom:2px">✍️ Catch-up</h2>
    <p class="small muted" style="margin-bottom:2px">These days look under-logged — tap one to backfill, or ✕ if that's how the day really went.</p>
    ${cu.map(c => `
    <div class="item" data-cu="${c.date}" style="cursor:pointer">
      <div>
        <div class="title">${fmtDate(c.date)}</div>
        <div class="sub">${c.parts.join(' · ')}</div>
      </div>
      <button class="btn danger" data-cudel="${c.date}" title="Dismiss">✕</button>
    </div>`).join('')}
  </div>`;
  })()}

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

  <div class="card" style="margin-top:14px;cursor:pointer" id="home-news">
    <div class="row between">
      <h2 style="margin:0">📰 Daily news</h2>
      <span class="badge" id="home-news-badge">…</span>
    </div>
    <p class="small muted" id="home-news-line" style="margin-top:6px">Loading briefing…</p>
  </div>`;

  view.querySelector('#theme-btn').addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    render();
  });
  view.querySelector('#home-news').addEventListener('click', () => { tab = 'news'; render(); });
  loadLatestReport()
    .then(rep => {
      const badge = view.querySelector('#home-news-badge');
      const line = view.querySelector('#home-news-line');
      if (!badge || !line) return;
      const isToday = rep.date === dateKey();
      badge.textContent = isToday ? 'Today' : fmtDate(rep.date, { weekday: false });
      const top = rep.global?.[0]?.headline || rep.singapore?.[0]?.headline || '';
      line.textContent = top || 'Open the briefing →';
    })
    .catch(() => {
      const badge = view.querySelector('#home-news-badge');
      const line = view.querySelector('#home-news-line');
      if (badge) badge.textContent = '—';
      if (line) line.textContent = 'No briefing in the last 3 days.';
    });
  view.querySelector('#q-meal').addEventListener('click', () => { tab = 'meals'; mealDate = today; render(); });
  view.querySelector('#q-run').addEventListener('click', openRunModal);
  view.querySelector('#q-gym').addEventListener('click', () => { tab = 'train'; trainSub = 'gym'; render(); });
  view.querySelector('#q-weight').addEventListener('click', openWeightModal);
  view.querySelector('#q-checkin').addEventListener('click', () => { tab = 'meals'; mealDate = today; render(); });
  for (const it of view.querySelectorAll('[data-cu]')) {
    it.addEventListener('click', () => { tab = 'meals'; mealDate = it.dataset.cu; render(); });
  }
  for (const b of view.querySelectorAll('[data-cudel]')) {
    b.addEventListener('click', e => {
      e.stopPropagation();
      (state.catchupDismissed || (state.catchupDismissed = {}))[b.dataset.cudel] = true;
      // Prune dismissals older than the 3-day window so the map stays tiny.
      const cutoff = addDays(dateKey(), -7);
      for (const k of Object.keys(state.catchupDismissed)) if (k < cutoff) delete state.catchupDismissed[k];
      save();
      render();
    });
  }
  view.querySelector('#dismiss-note')?.addEventListener('click', () => {
    state.lastAutoNote = null; save(); render();
  });
}

// Sleep time entry: accepts "7:41", "7h 41m", "7h41", or decimal "7.5".
function parseSleepTime(str) {
  const s = String(str).trim().toLowerCase();
  if (!s) return null;
  let m = /^(\d{1,2})[:h]\s*(\d{1,2})?m?$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2] || 0);
  const dec = parseFloat(s);
  return Number.isFinite(dec) && dec > 0 && dec <= 24 ? Math.round(dec * 60) : null;
}

function fmtSleep(mins) {
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

// Rule-based daily suggestions — deterministic, no AI. Priority: sleep
// first, then over-limits, then gaps. At most three.
function daySuggestions(today) {
  const t = targets();
  const tot = mealTotals(today);
  const { sleep, sleepMins } = wellnessFor(today);
  const out = [];

  // Sleep: either metric can flag a rough night; a "push" day needs every
  // present metric to look good (score ≥80, ≥7.5h).
  const sleepBits = [
    sleep != null ? `score ${sleep}` : null,
    sleepMins != null ? fmtSleep(sleepMins) : null,
  ].filter(Boolean).join(', ');
  if ((sleep != null && sleep < 60) || (sleepMins != null && sleepMins < 360)) {
    out.push(`😴 Rough night (${sleepBits}) — treat today as recovery: easy pace or lighter volume, earlier night tonight.`);
  } else if (sleepBits && (sleep == null || sleep >= 80) && (sleepMins == null || sleepMins >= 450)) {
    out.push(`⚡ Slept well (${sleepBits}) — good day to push a harder session.`);
  }
  if (tot.sodium > t.sodium) {
    out.push(`🧂 Sodium already over ${t.sodium}mg — keep the rest of today low-salt (broths and gravies are the big hitters).`);
  } else if (tot.sodium > 0.75 * t.sodium && tot.kcal < 0.75 * t.calories) {
    out.push(`🧂 Sodium at ${r0(tot.sodium)}mg with meals still to come — pick a lighter-salt option next.`);
  }
  if (tot.kcal > t.calories) {
    out.push(`⚖️ Over today's calorie target — balance across the week rather than restricting hard tonight.`);
  }
  if (tot.kcal > 0.6 * t.calories && tot.protein < 0.6 * t.protein) {
    out.push(`🍗 Protein lagging (${r0(tot.protein)}g of ${t.protein}g) — make it the anchor of your next meal.`);
  }
  if (tot.kcal > 0.7 * t.calories && tot.fibre < 0.5 * t.fibre) {
    out.push(`🥬 Fibre at ${r0(tot.fibre)}g of ${t.fibre}g — veg or fruit with the next meal closes the gap.`);
  }
  const water = waterFor(today);
  if (tot.kcal > 0.5 * t.calories && water < 0.4 * t.water) {
    out.push(`💧 Water at ${fmtWater(water)} of ${fmtWater(t.water)} — the day's ahead of your drinking.`);
  }
  if (!out.length && tot.kcal > 0) out.push('✅ All on track — nothing to fix today.');
  return out.slice(0, 3);
}

// Catch-up reminders: the last 3 days (excluding today, which the live
// suggestions cover) where logging looks forgotten — nothing recorded, or
// suspiciously little (kcal/water well under target). Days before the very
// first log are ignored, and a dismissed day stays dismissed.
function catchupDays() {
  const t = targets();
  const today = dateKey();
  const dismissed = state.catchupDismissed || {};
  const logged = [...Object.keys(state.meals), ...Object.keys(state.water), ...Object.keys(state.wellness)];
  if (!logged.length) return [];
  const earliest = logged.sort()[0];
  const out = [];
  for (let i = 1; i <= 3; i++) {
    const d = addDays(today, -i);
    if (d < earliest || dismissed[d]) continue;
    const kcal = mealTotals(d).kcal;
    const water = waterFor(d);
    const w = wellnessFor(d);
    const parts = [];
    if (!mealsFor(d).length) parts.push('no food logged');
    else if (kcal < 0.6 * t.calories) parts.push(`food looks partial (${r0(kcal)} of ${t.calories} kcal)`);
    if (!water) parts.push('no water');
    else if (water < 0.6 * t.water) parts.push(`water only ${fmtWater(water)}`);
    if (w.sleep == null && w.sleepMins == null && w.activeKcal == null) parts.push('no check-in');
    if (parts.length) out.push({ date: d, parts });
  }
  return out;
}

function openWaterModal(day) {
  const m = openModal(`
    <h2>Log water</h2>
    <p class="small muted" style="margin-bottom:10px">${day === dateKey() ? 'Today' : fmtDate(day)} so far: <b>${fmtWater(waterFor(day))}</b> of ${fmtWater(targets().water)}. Negative amounts subtract (mis-taps happen).</p>
    <label class="field"><span>Amount (ml)</span>
      <input id="wa-ml" type="number" inputmode="numeric" placeholder="e.g. 750"></label>
    <button class="btn primary block" id="wa-save">Add</button>
  `);
  m.querySelector('#wa-save').addEventListener('click', () => {
    const ml = Number(m.querySelector('#wa-ml').value);
    if (!ml) { toast('Enter an amount'); return; }
    addWater(day, Math.round(ml));
    closeModal();
    render();
    toast(`💧 ${fmtWater(waterFor(day))} today`);
  });
}

function macroBar(label, val, max, color, unit = 'g') {
  const pct = clamp((val / max) * 100, 0, 100);
  return `
  <div class="macro-bar">
    <div class="row"><span class="muted">${label}</span><span><b>${r0(val)}</b><span class="muted"> / ${max}${unit}</span></span></div>
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

// Most-logged foods from the last 60 days; the most recent entry for each
// name is kept as the template (so last-used portion size is remembered).
function frequentFoods(limit = 8) {
  const cutoff = addDays(dateKey(), -60);
  const byName = new Map();
  for (const [date, list] of Object.entries(state.meals)) {
    if (date < cutoff) continue;
    for (const m of list) {
      if (!m.name || m.name === 'Quick add') continue;
      const k = m.name.toLowerCase();
      const e = byName.get(k) || { count: 0, last: null, lastDate: '' };
      e.count++;
      if (date >= e.lastDate) { e.lastDate = date; e.last = m; }
      byName.set(k, e);
    }
  }
  return [...byName.values()]
    .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate))
    .slice(0, limit)
    .map(e => ({ ...e.last, count: e.count }));
}

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
      ${totCell(r0(tot.fibre), t.fibre, 'fibre', 'floor')}
      ${totCell(r0(tot.sodium), t.sodium, 'sodium')}
    </div>
  </div>

  ${(() => {
    const w = wellnessFor(mealDate);
    const water = waterFor(mealDate);
    const empty = w.sleep == null && w.sleepMins == null && w.activeKcal == null;
    return `
  <div class="card">
    <div class="row between">
      <span class="small muted">💧 <b style="color:${water >= t.water ? 'var(--green)' : 'var(--text)'}">${fmtWater(water)}</b><span class="muted"> / ${fmtWater(t.water)}</span></span>
      <div class="row" style="gap:6px">
        <button class="btn small" id="mw-cup">+1 cup</button>
        <button class="btn small" id="mw-500">+500ml</button>
        <button class="btn small" id="mw-custom">+…</button>
      </div>
    </div>
    <div class="macro-bar" style="margin-top:6px">
      <div class="track"><div class="fill" style="width:${clamp((water / t.water) * 100, 0, 100)}%;background:var(--teal)"></div></div>
    </div>
    <details ${empty && mealDate === dateKey() ? 'open' : ''}>
      <summary class="small" style="cursor:pointer;margin-top:10px;color:var(--accent);font-weight:600">🌅 Check-in — sleep &amp; active kcal${empty ? '' : ' <span class="muted">(saved ✓)</span>'}</summary>
      <div class="grid3" style="margin-top:10px">
        <label class="field"><span>Sleep score</span><input id="mw-sleep" type="number" inputmode="numeric" min="0" max="100" value="${w.sleep ?? ''}" placeholder="78"></label>
        <label class="field"><span>Sleep time</span><input id="mw-time" value="${w.sleepMins != null ? fmtSleep(w.sleepMins) : ''}" placeholder="7:41"></label>
        <label class="field"><span>Active kcal</span><input id="mw-active" type="number" inputmode="numeric" value="${w.activeKcal ?? ''}" placeholder="650"></label>
      </div>
      <p class="small muted" style="margin-bottom:8px">Everything on this card belongs to ${mealDate === dateKey() ? 'today' : fmtDate(mealDate)} — sleep is the night into it; log the watch's active-kcal total on the day it happened (‹ for yesterday's).</p>
      <button class="btn small block" id="mw-save">Save check-in</button>
    </details>
  </div>`;
  })()}

  <div class="card">
    <h2>Add food</h2>
    <button class="btn primary block" id="food-paste" style="margin-bottom:12px;padding:15px 16px;font-size:15px">📋 Paste from Claude</button>
    <div class="search-box">
      <input id="food-q" type="search" placeholder="Start typing… e.g. salmon, rice, yogurt" autocomplete="off">
    </div>
    <div id="food-results" class="search-results"></div>
    <div class="row" style="margin-top:10px">
      <input id="qa-name" placeholder="Quick add, e.g. lunch out" style="flex:2">
      <input id="qa-kcal" type="number" inputmode="numeric" placeholder="kcal" style="flex:1;min-width:70px;max-width:90px">
      <button class="btn small" id="qa-add">Add</button>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn ghost small" id="food-manual">+ Enter manually</button>
    </div>
  </div>

  <div class="card">
    <h2>Logged (${entries.length})</h2>
    ${entries.length ? entries.map(m => `
      <div class="item" data-id="${m.id}" style="cursor:pointer">
        <div>
          <div class="title">${esc(m.name)}</div>
          <div class="sub">${m.grams ? m.grams + 'g · ' : ''}P ${r0(m.protein)} · C ${r0(m.carbs)} · F ${r0(m.fat)}${m.fibre ? ` · Fb ${r0(m.fibre)}` : ''}${m.sodium ? ` · Na ${r0(m.sodium)}` : ''}</div>
        </div>
        <div class="val">${r0(m.kcal)} kcal</div>
      </div>`).join('')
    : '<p class="muted small">Nothing logged yet. Search above to add your first item.</p>'}
  </div>`;

  view.querySelector('#d-prev').addEventListener('click', () => { mealDate = addDays(mealDate, -1); render(); });
  view.querySelector('#d-next').addEventListener('click', () => { mealDate = addDays(mealDate, 1); render(); });
  view.querySelector('#food-manual').addEventListener('click', () => openFoodModal(null));
  view.querySelector('#food-paste').addEventListener('click', openPasteModal);

  view.querySelector('#mw-cup').addEventListener('click', () => { addWater(mealDate, 250); render(); toast(`💧 ${fmtWater(waterFor(mealDate))}`); });
  view.querySelector('#mw-500').addEventListener('click', () => { addWater(mealDate, 500); render(); toast(`💧 ${fmtWater(waterFor(mealDate))}`); });
  view.querySelector('#mw-custom').addEventListener('click', () => openWaterModal(mealDate));
  view.querySelector('#mw-save').addEventListener('click', () => {
    const sleep = view.querySelector('#mw-sleep').value;
    const time = view.querySelector('#mw-time').value.trim();
    const active = view.querySelector('#mw-active').value;
    const mins = time === '' ? null : parseSleepTime(time);
    if (time !== '' && mins == null) { toast('Sleep time looks off — try 7:41 or 7.5'); return; }
    // Cleared fields delete the stored value, so bad entries can be removed.
    const w = { ...wellnessFor(mealDate) };
    if (sleep !== '') w.sleep = clamp(Number(sleep), 0, 100); else delete w.sleep;
    if (mins != null) w.sleepMins = mins; else delete w.sleepMins;
    if (active !== '') w.activeKcal = Math.max(0, Number(active)); else delete w.activeKcal;
    state.wellness[mealDate] = w;
    save();
    render();
    toast('Check-in saved ☀️');
  });

  view.querySelector('#qa-add').addEventListener('click', () => {
    const kcal = Number(view.querySelector('#qa-kcal').value);
    if (!kcal || kcal <= 0) { toast('Enter calories'); return; }
    const name = view.querySelector('#qa-name').value.trim() || 'Quick add';
    (state.meals[mealDate] || (state.meals[mealDate] = [])).push({
      id: uid(), name, grams: null, per100: null, kcal, protein: 0, carbs: 0, fat: 0, fibre: 0, sodium: 0,
    });
    save();
    render();
    toast(`Added ${name} (${r0(kcal)} kcal)`);
  });

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
    box.innerHTML = shown.map((f, i) => {
      const badge = f.brand === 'Basic' ? '<span class="badge green">Basic</span>'
        : f.brand === 'My log' ? '<span class="badge">My log</span>'
        : esc(f.brand || 'Generic');
      // "My log" items carry whole-portion macros and no per-100g data.
      const macros = f.per100
        ? `per 100g: P ${f.per100.protein ?? '?'} C ${f.per100.carbs ?? '?'} F ${f.per100.fat ?? '?'}`
        : `per portion: P ${r0(f.protein)} C ${r0(f.carbs)} F ${r0(f.fat)}`;
      return `
      <div class="item" data-i="${i}">
        <div>
          <div class="title">${esc(f.name)}</div>
          <div class="sub">${badge} · ${macros}</div>
        </div>
        <div class="val">${r0(f.per100 ? f.per100.kcal : f.kcal)} kcal</div>
      </div>`;
    }).join('')
      + (loading ? '<div class="spinner"></div>' : '')
      + (!shown.length && !loading && q.value.trim()
        ? '<p class="muted small" style="padding:8px 0">No matches. Try a simpler name, or enter it manually.</p>' : '');
    for (const it of box.querySelectorAll('.item[data-i]')) {
      it.addEventListener('click', () => openFoodModal(shown[Number(it.dataset.i)]));
    }
  }

  // With an empty search box, offer one-tap re-logging: yesterday's meals
  // and the most frequently logged foods.
  function paintIdle() {
    const favs = frequentFoods();
    const prevDay = addDays(mealDate, -1);
    const prevMeals = mealsFor(prevDay);
    box.innerHTML =
      (prevMeals.length
        ? `<button class="btn ghost small" id="copy-prev">⧉ Copy ${fmtDate(prevDay)}'s meals (${prevMeals.length})</button>` : '')
      + (favs.length
        ? '<p class="small muted" style="margin:10px 0 0">Frequent</p>' + favs.map((f, i) => `
          <div class="item" data-fav="${i}">
            <div>
              <div class="title">${esc(f.name)}</div>
              <div class="sub"><span class="badge">${f.count}×</span>${f.grams ? ` ${f.grams}g` : ''}</div>
            </div>
            <div class="val">${r0(f.kcal)} kcal</div>
          </div>`).join('') : '');
    box.querySelector('#copy-prev')?.addEventListener('click', () => {
      const list = state.meals[mealDate] || (state.meals[mealDate] = []);
      for (const m of prevMeals) list.push({ ...m, id: uid() });
      save();
      render();
      toast(`Copied ${prevMeals.length} item${prevMeals.length === 1 ? '' : 's'} from ${fmtDate(prevDay)}`);
    });
    for (const it of box.querySelectorAll('[data-fav]')) {
      it.addEventListener('click', () => {
        const f = favs[Number(it.dataset.fav)];
        openFoodModal({
          name: f.name, per100: f.per100, grams: f.grams,
          kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat,
          fibre: f.fibre, sodium: f.sodium,
          serving: f.grams ? `${f.grams} g` : '',
        });
      });
    }
  }
  paintIdle();

  q.addEventListener('input', () => {
    const query = q.value.trim();
    clearTimeout(timer);
    const my = ++seq;
    if (!query) { shown = []; paintIdle(); return; }
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

// dir 'cap': exceeding the target is bad (red). dir 'floor': reaching it is
// the goal (green when met) — fibre is a floor, everything else a cap.
function totCell(val, max, label, dir = 'cap') {
  const color = dir === 'floor'
    ? (val >= max ? 'var(--green)' : 'var(--text)')
    : (val > max ? 'var(--red)' : 'var(--text)');
  return `<div><div class="tval" style="color:${color}">${val}</div><div class="tlabel">/ ${max} ${label}</div></div>`;
}

// Parse pasted "name | kcal | protein | carbs | fat | fibre | sodium" lines
// (one item per line). Tolerates markdown tables: leading/trailing pipes,
// separator rows, and a header row are skipped.
function parsePasteLines(text) {
  const items = [], bad = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    if (/^[|\s:—-]+$/.test(line)) continue; // markdown table separator row
    line = line.replace(/^\|/, '').replace(/\|+$/, '');
    const cells = line.split('|').map(c => c.trim());
    const name = cells[0];
    const nums = cells.slice(1, 7).map(c => parseFloat(String(c).replace(/[^\d.-]/g, '')));
    if (!name || cells.length < 2 || !Number.isFinite(nums[0])) {
      if (/kcal|calorie/i.test(line)) continue; // header row
      bad.push(raw.trim());
      continue;
    }
    const v = i => (Number.isFinite(nums[i]) ? nums[i] : 0);
    items.push({ name, kcal: v(0), protein: v(1), carbs: v(2), fat: v(3), fibre: v(4), sodium: v(5) });
  }
  return { items, bad };
}

function openPasteModal() {
  const m = openModal(`
    <h2>Paste from Claude</h2>
    <p class="small muted" style="margin-bottom:10px">One item per line:<br><code>name | kcal | protein | carbs | fat | fibre | sodium</code><br>Markdown tables paste fine too. Fibre/sodium optional.</p>
    <textarea id="paste-in" rows="14" style="min-height:38vh" placeholder="Chicken katsu curry | 850 | 32 | 105 | 33 | 5 | 1600"></textarea>
    <div id="paste-preview" class="small muted" style="margin:10px 0;min-height:18px"></div>
    <button class="btn primary block" id="paste-add" disabled>Add to log</button>
  `);
  const input = m.querySelector('#paste-in');
  const preview = m.querySelector('#paste-preview');
  const addBtn = m.querySelector('#paste-add');
  let parsed = { items: [], bad: [] };

  input.addEventListener('input', () => {
    parsed = parsePasteLines(input.value);
    const kcal = parsed.items.reduce((s, x) => s + x.kcal, 0);
    preview.innerHTML =
      (parsed.items.length
        ? `<b>${parsed.items.length}</b> item${parsed.items.length === 1 ? '' : 's'} · ${r0(kcal)} kcal — ` +
          parsed.items.map(x => esc(x.name)).join(', ')
        : 'Nothing parsed yet.')
      + (parsed.bad.length ? `<br><span style="color:var(--orange)">Skipped ${parsed.bad.length} unreadable line${parsed.bad.length === 1 ? '' : 's'}</span>` : '');
    addBtn.disabled = !parsed.items.length;
  });

  addBtn.addEventListener('click', () => {
    const list = state.meals[mealDate] || (state.meals[mealDate] = []);
    for (const x of parsed.items) {
      list.push({ id: uid(), grams: null, per100: null, ...x });
    }
    save();
    closeModal();
    render();
    toast(`Added ${parsed.items.length} item${parsed.items.length === 1 ? '' : 's'}`);
  });
}

// Add (from search result or manual) or edit an existing entry.
function openFoodModal(result, existing = null) {
  const per100 = existing?.per100 || result?.per100 || null;
  // Without per-100g data (My log / manual favourites) grams are unknown —
  // leave Amount blank rather than implying the portion weighs 100g.
  const grams = existing?.grams
    ?? (result ? (per100 ? (result.grams ?? parseServingGrams(result.serving) ?? 100) : result.grams ?? '') : '');
  const scaled = f => per100 && per100[f] != null && grams ? r1((per100[f] * grams) / 100) : '';
  // Favourite templates without per100 (manual entries) carry macros directly.
  const direct = f => (per100 ? scaled(f) : result?.[f] ?? '');
  const init = {
    name: existing?.name ?? result?.name ?? '',
    kcal: existing?.kcal ?? direct('kcal'),
    protein: existing?.protein ?? direct('protein'),
    carbs: existing?.carbs ?? direct('carbs'),
    fat: existing?.fat ?? direct('fat'),
    fibre: existing?.fibre ?? direct('fibre'),
    sodium: existing?.sodium ?? direct('sodium'),
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
      <label class="field"><span>Fibre (g)</span><input id="f-fibre" type="number" inputmode="decimal" value="${init.fibre}"></label>
      <label class="field"><span>Sodium (mg)</span><input id="f-sodium" type="number" inputmode="decimal" value="${init.sodium}"></label>
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
      for (const f of ['kcal', 'protein', 'carbs', 'fat', 'fibre', 'sodium']) {
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
      fibre: Number($f('f-fibre').value) || 0,
      sodium: Number($f('f-sodium').value) || 0,
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

const GYM_TYPES = [
  { type: 'push', label: 'Push', ico: '🫸', sub: 'chest · shoulders · triceps' },
  { type: 'pull', label: 'Pull', ico: '🫷', sub: 'back · biceps' },
  { type: 'legs', label: 'Legs', ico: '🦵', sub: 'quads · hams · glutes' },
];

function gymTypeLabel(type) {
  return GYM_TYPES.find(t => t.type === type)?.label || 'Gym';
}

function blankGymDraft() {
  return { date: dateKey(), minutes: '' };
}

// Sessions logged before the push/pull/legs switch have exercises instead
// of a type; summarise them so old history stays readable.
function setsSummary(sets) {
  return sets.map(s => `${s.w}×${s.r}`).join(', ');
}

function renderGym() {
  if (!gymDraft) gymDraft = blankGymDraft();
  const body = view.querySelector('#train-body');
  const sessions = [...state.gym].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);

  body.innerHTML = `
  <div class="card">
    <h2>New session</h2>
    <div class="grid2">
      <label class="field"><span>Date</span><input id="g-date" type="date" value="${gymDraft.date}"></label>
      <label class="field"><span>Duration (min)</span><input id="g-min" type="number" inputmode="numeric" placeholder="60" value="${gymDraft.minutes}"></label>
    </div>
    <p class="small muted" style="margin:10px 0 8px">Tap to log the session:</p>
    <div class="grid3">
      ${GYM_TYPES.map(t => `
      <button class="btn" data-type="${t.type}" style="flex-direction:column;padding:14px 6px">
        <span class="ico" style="font-size:22px">${t.ico}</span>
        <b>${t.label}</b>
        <span class="small muted">${t.sub}</span>
      </button>`).join('')}
    </div>
  </div>
  <div class="card">
    <h2>History</h2>
    ${sessions.length ? sessions.map(s => `
      <div class="item">
        <div style="flex:1">
          <div class="title">${s.type ? `${gymTypeLabel(s.type)} day` : fmtDate(s.date)}${s.minutes ? ` <span class="muted small">· ${s.minutes} min</span>` : ''}</div>
          ${s.type
            ? `<div class="sub">${fmtDate(s.date)}</div>`
            : (s.exercises || []).map(e => `<div class="sub">${esc(e.name)} — ${setsSummary(e.sets)}</div>`).join('')}
        </div>
        <button class="btn danger" data-del="${s.id}">✕</button>
      </div>`).join('')
    : '<p class="muted small">No sessions yet. Pick push, pull or legs above after you train.</p>'}
  </div>`;

  const $g = sel => body.querySelector(sel);

  $g('#g-date').addEventListener('change', e => { gymDraft.date = e.target.value; });
  $g('#g-min').addEventListener('input', e => { gymDraft.minutes = e.target.value; });

  for (const b of body.querySelectorAll('[data-type]')) {
    b.addEventListener('click', () => {
      state.gym.push({
        id: uid(),
        date: gymDraft.date || dateKey(),
        minutes: Number(gymDraft.minutes) || null,
        type: b.dataset.type,
      });
      save();
      gymDraft = null;
      render();
      toast(`${gymTypeLabel(b.dataset.type)} day logged 💪`);
    });
  }

  for (const b of body.querySelectorAll('[data-del]')) {
    b.addEventListener('click', () => {
      state.gym = state.gym.filter(s => s.id !== b.dataset.del);
      save(); render();
    });
  }
}

// ---------- progress ----------

// Stats for one Mon–Sun week. Meal averages only count days with entries,
// so unlogged days don't drag the numbers down.
function weekReview(keys) {
  const t = targets();
  const today = dateKey();
  const logged = keys.filter(k => k <= today && mealsFor(k).length);
  let kcal = 0, protein = 0, proteinHit = 0;
  for (const k of logged) {
    const x = mealTotals(k);
    kcal += x.kcal;
    protein += x.protein;
    if (x.protein >= t.protein) proteinHit++;
  }
  const runs = state.runs.filter(r => keys.includes(r.date));
  const gym = state.gym.filter(g => keys.includes(g.date));
  const byType = {};
  for (const g of gym) if (g.type) byType[g.type] = (byType[g.type] || 0) + 1;
  const ws = state.weights.filter(x => keys.includes(x.date));
  const sleeps = keys.map(k => wellnessFor(k).sleep).filter(s => s != null);
  const times = keys.map(k => wellnessFor(k).sleepMins).filter(s => s != null);
  const actives = keys.map(k => wellnessFor(k).activeKcal).filter(a => a != null);
  const waters = keys.map(k => waterFor(k)).filter(w => w > 0);
  return {
    waterDays: waters.length,
    waterHit: waters.filter(w => w >= t.water).length,
    sleepAvg: sleeps.length ? Math.round(sleeps.reduce((a, b) => a + b) / sleeps.length) : null,
    sleepMin: sleeps.length ? Math.min(...sleeps) : null,
    sleepMax: sleeps.length ? Math.max(...sleeps) : null,
    sleepTimeAvg: times.length ? Math.round(times.reduce((a, b) => a + b) / times.length) : null,
    activeAvg: actives.length ? Math.round(actives.reduce((a, b) => a + b) / actives.length) : null,
    checkins: Math.max(sleeps.length, times.length, actives.length),
    loggedDays: logged.length,
    avgKcal: logged.length ? Math.round(kcal / logged.length) : 0,
    avgProtein: logged.length ? Math.round(protein / logged.length) : 0,
    proteinHit,
    km: runs.reduce((s, r) => s + (r.km || 0), 0),
    runN: runs.length,
    gymN: gym.length,
    ppl: GYM_TYPES.map(g => (byType[g.type] ? `${byType[g.type]}× ${g.label.toLowerCase()}` : null)).filter(Boolean).join(' · '),
    weightDelta: ws.length >= 2 ? ws[ws.length - 1].kg - ws[0].kg : null,
  };
}

// Seven-day intake chart for the weekly review: one bar per logged day
// against a dashed target line; over-target days turn red.
function weekKcalChart(keys, target) {
  const today = dateKey();
  const vals = keys.map(k => (k <= today && mealsFor(k).length ? mealTotals(k).kcal : null));
  if (!vals.some(v => v != null)) return '';
  const W = 460, H = 128, pad = 6, bw = W / 7, top = 18, base = H - 22;
  const max = Math.max(target * 1.2, ...vals.filter(v => v != null));
  const Y = v => base - (v / max) * (base - top);
  const bars = keys.map((k, i) => {
    const x = i * bw + pad, w = bw - pad * 2, v = vals[i];
    const day = `<text class="axis" x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${fmtDate(k).slice(0, 3)}</text>`;
    if (v == null) return day;
    return `
      <rect class="bar" x="${x}" y="${r1(Y(v))}" width="${w}" height="${Math.max(r1(base - Y(v)), 1.5)}" rx="4" style="fill:${v > target ? 'var(--red)' : 'var(--accent)'}"/>
      <text class="axis" x="${x + w / 2}" y="${r1(Y(v)) - 4}" text-anchor="middle">${r0(v)}</text>
      ${day}`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <line class="goal" x1="0" y1="${r1(Y(target))}" x2="${W}" y2="${r1(Y(target))}"/>
    <text class="axis" x="${W}" y="${r1(Y(target)) - 4}" text-anchor="end" fill="var(--green)">target ${target}</text>
    ${bars}
  </svg>`;
}

function weeklyReviewCard() {
  const keys = weekKeys(parseKey(addDays(dateKey(), reviewWeek * 7)));
  const wr = weekReview(keys);
  const t = targets();
  const today = dateKey();
  const range = `${fmtDate(keys[0], { weekday: false })} – ${fmtDate(keys[6], { weekday: false })}`;
  const label = reviewWeek === 0 ? 'This week' : reviewWeek === -1 ? 'Last week' : range;
  const dKg = wr.weightDelta;

  // Meter: the fill carries the state; the value stays in text ink. Width
  // caps at 100% so an overshoot reads by colour, not size.
  const meter = (name, val, max, color, disp) => `
    <div class="macro-bar">
      <div class="row"><span class="muted">${name}</span><span>${disp}</span></div>
      <div class="track"><div class="fill" style="width:${clamp((val / max) * 100, 0, 100)}%;background:${color}"></div></div>
    </div>`;

  // Tick row: ✓ when the day's value meets the target, otherwise the deficit
  // (how far short). Days with nothing tracked yet stay blank.
  const tickRow = (valueOn, target, fmtMiss) => keys.map(k => {
    const val = k <= today ? valueOn(k) : null;
    const hit = val != null && val >= target;
    return `
    <div class="day-cell ${k === today ? 'today' : ''} ${hit ? 'hit' : ''}">
      <div class="dot">${hit ? '✓' : val != null ? `<span class="miss">-${fmtMiss(target - val)}</span>` : ''}</div>
      <div class="dname">${fmtDate(k).slice(0, 3)}</div>
    </div>`;
  }).join('');
  const proteinDots = tickRow(k => (mealsFor(k).length ? mealTotals(k).protein : null), t.protein, d => r0(d));
  const waterDots = tickRow(k => waterFor(k) || null, t.water, d => r1(d / 1000));

  const tile = (val, lbl, color) => `
    <div><div class="tval"${color ? ` style="color:${color}"` : ''}>${val}</div><div class="tlabel">${lbl}</div></div>`;

  return `
  <div class="card">
    <div class="row between">
      <h2 style="margin:0">Weekly review</h2>
      <div class="row" style="gap:6px">
        <button class="btn small" id="wr-prev">‹</button>
        <b class="small" style="min-width:76px;text-align:center">${label}</b>
        <button class="btn small" id="wr-next" ${reviewWeek >= 0 ? 'disabled' : ''}>›</button>
      </div>
    </div>
    <p class="small muted" style="margin:4px 0 14px">${range}${wr.loggedDays ? ` · ${wr.loggedDays} day${wr.loggedDays === 1 ? '' : 's'} logged` : ''}</p>
    ${wr.loggedDays ? `
    ${weekKcalChart(keys, t.calories)}
    <div class="macro-bars" style="margin:12px 0 14px">
      ${meter('Avg calories', wr.avgKcal, t.calories, wr.avgKcal > t.calories ? 'var(--red)' : 'var(--accent)', `<b>${wr.avgKcal}</b><span class="muted"> / ${t.calories} kcal</span>`)}
      ${meter('Avg protein', wr.avgProtein, t.protein, 'var(--green)', `<b>${wr.avgProtein}</b><span class="muted"> / ${t.protein} g</span>`)}
    </div>
    <div class="row between" style="font-size:12.5px;margin-bottom:4px">
      <span class="muted">Protein ≥ ${t.protein}g <span style="opacity:.7">(misses show g short)</span></span>
      <span><b>${wr.proteinHit}</b><span class="muted"> / ${wr.loggedDays} logged</span></span>
    </div>
    <div class="wr-days">${proteinDots}</div>`
    : '<p class="small muted" style="margin-bottom:14px">No meals logged this week.</p>'}
    <div class="row between" style="font-size:12.5px;margin-bottom:4px">
      <span class="muted">Water ≥ ${fmtWater(t.water)} <span style="opacity:.7">(misses show L short)</span></span>
      <span><b>${wr.waterHit}</b><span class="muted"> / ${wr.waterDays} tracked</span></span>
    </div>
    <div class="wr-days">${waterDots}</div>
    ${wr.sleepAvg != null || wr.sleepTimeAvg != null ? `
    <div class="macro-bars" style="margin:14px 0">
      ${wr.sleepAvg != null ? meter('Avg sleep score', wr.sleepAvg, 100, wr.sleepAvg >= 80 ? 'var(--green)' : wr.sleepAvg < 60 ? 'var(--orange)' : 'var(--accent)', `<b>${wr.sleepAvg}</b><span class="muted"> / 100 · range ${wr.sleepMin}–${wr.sleepMax}</span>`) : ''}
      ${wr.sleepTimeAvg != null ? meter('Avg sleep time', wr.sleepTimeAvg, 480, wr.sleepTimeAvg >= 450 ? 'var(--green)' : wr.sleepTimeAvg < 360 ? 'var(--orange)' : 'var(--accent)', `<b>${fmtSleep(wr.sleepTimeAvg)}</b><span class="muted"> / 8h</span>`) : ''}
    </div>` : ''}
    <div class="grid3" style="text-align:center;border-top:1px solid var(--line);padding-top:12px">
      ${tile(r1(wr.km), wr.runN ? `km · ${wr.runN} run${wr.runN === 1 ? '' : 's'}` : 'run km')}
      ${tile(wr.gymN, wr.ppl || 'gym sessions')}
      ${dKg == null
        ? tile('—', 'kg change', 'var(--muted)')
        : tile((dKg > 0 ? '+' : '') + r1(dKg), 'kg this week', dKg <= 0 ? 'var(--green)' : 'var(--orange)')}
    </div>
    <div class="totals-strip" style="margin-top:12px">
      ${wr.activeAvg == null
        ? tile('—', 'avg active kcal', 'var(--muted)')
        : tile(wr.activeAvg, 'avg active kcal')}
      ${tile(`${wr.checkins}/7`, 'check-ins')}
    </div>
  </div>`;
}

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
      <div><div class="tval">${t.fibre}g</div><div class="tlabel">fibre ≥</div></div>
      <div><div class="tval">${t.sodium}</div><div class="tlabel">sodium mg ≤</div></div>
      <div><div class="tval">${fmtWater(t.water)}</div><div class="tlabel">water ≥</div></div>
    </div>
    <p class="small muted" style="margin-bottom:10px">Auto mode recalculates weekly from your latest weight, and refines your calorie burn estimate once you have ~2 weeks of logged meals and weigh-ins.</p>
    <div class="row">
      <button class="btn small" id="t-edit">Edit targets</button>
      <button class="btn small" id="t-recalc">Recalculate now</button>
    </div>
  </div>

  ${weeklyReviewCard()}

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
  view.querySelector('#wr-prev').addEventListener('click', () => { reviewWeek--; render(); });
  view.querySelector('#wr-next').addEventListener('click', () => { if (reviewWeek < 0) { reviewWeek++; render(); } });
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
      <label class="field"><span>Fibre (g, minimum)</span><input id="t-fib" type="number" value="${t.fibre}"></label>
      <label class="field"><span>Sodium (mg, limit)</span><input id="t-na" type="number" value="${t.sodium}"></label>
      <label class="field"><span>Water (ml, minimum)</span><input id="t-water" type="number" value="${t.water}"></label>
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
      fibre: Number(m.querySelector('#t-fib').value) || t.fibre,
      sodium: Number(m.querySelector('#t-na').value) || t.sodium,
      water: Number(m.querySelector('#t-water').value) || t.water,
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

// Per-date report cache. A published report never changes, so a hit lives
// for the whole session; a miss (not yet published, or offline) is retried
// after a minute. Reports are fetched by their own dated file — never a
// shared "latest" pointer — so a briefing can't render under the wrong day.
const newsReports = new Map();
let newsSel = null; // date selected in the News tab

async function loadReport(date) {
  const hit = newsReports.get(date);
  if (hit && (hit.rep || Date.now() - hit.at < 60 * 1000)) return hit.rep;
  let rep = null;
  try {
    const res = await fetch(`news/reports/${date}.json`, { cache: 'no-store' });
    if (res.ok) rep = await res.json();
  } catch { /* offline and not in the service-worker cache — treat as missing */ }
  newsReports.set(date, { rep, at: Date.now() });
  return rep;
}

function newsDays() {
  const today = dateKey();
  return [
    { date: today, label: 'Today' },
    { date: addDays(today, -1), label: 'Yesterday' },
    { date: addDays(today, -2), label: fmtDate(addDays(today, -2)) },
  ];
}

// Newest of the last three daily reports — for the home-screen card.
async function loadLatestReport() {
  for (const d of newsDays()) {
    const rep = await loadReport(d.date);
    if (rep) return rep;
  }
  throw new Error('No report in the last 3 days');
}

function renderNews() {
  const days = newsDays();
  if (!days.some(d => d.date === newsSel)) newsSel = days[0].date;
  view.innerHTML = `
  <h1 style="margin-bottom:14px">News</h1>
  <div class="subtabs">
    ${days.map(d => `<button data-nd="${d.date}" class="${d.date === newsSel ? 'active' : ''}">${d.label}</button>`).join('')}
  </div>
  <div id="news-body">
    <div class="card center" style="padding:38px 20px">
      <div style="font-size:40px;margin-bottom:10px">📰</div>
      <p class="muted small">Loading briefing…</p>
    </div>
  </div>`;
  for (const b of view.querySelectorAll('[data-nd]')) {
    b.addEventListener('click', () => { newsSel = b.dataset.nd; render(); });
  }
  const body = view.querySelector('#news-body');
  const date = newsSel;
  loadReport(date).then(rep => {
    if (tab !== 'news' || newsSel !== date || !body.isConnected) return;
    body.innerHTML = rep ? newsHtml(rep) : missingNewsHtml(date);
  });
}

function missingNewsHtml(date) {
  const isToday = date === dateKey();
  return `
  <div class="card center" style="padding:38px 20px">
    <div style="font-size:40px;margin-bottom:10px">${isToday ? '⏳' : '📭'}</div>
    <h2>${isToday ? 'Not published yet' : 'No briefing this day'}</h2>
    <p class="muted small" style="max-width:300px;margin:6px auto 0">${
      isToday
        ? "Today's briefing usually lands around 7:15am. If it's well past that, the morning run may have been missed — yesterday's report is one tap away."
        : `No report was published on ${esc(fmtDate(date))} — that morning's run was missed.`}</p>
  </div>`;
}

function newsHtml(rep) {
  const gap = rep.gapNote ? `<div class="news-note">⚠️ ${esc(rep.gapNote)}</div>` : '';
  const w = rep.word || {};
  return `
  <div class="card">
    <h2 style="margin:0">Morning report — ${esc(fmtDate(rep.date))}</h2>
    <p class="small muted" style="margin-top:4px">${esc(rep.coverage?.label || '')}</p>
  </div>
  ${gap}
  ${newsSection('Global', rep.global)}
  ${newsSection('Singapore', rep.singapore)}
  <div class="card" style="margin-top:14px">
    <p class="small muted" style="margin:0 0 4px;letter-spacing:.06em;text-transform:uppercase">Word of the day</p>
    <h2 style="margin:0">${esc(w.word)} <span class="muted small">(${esc(w.pos)}) ${esc(w.pronunciation || '')}</span></h2>
    <p class="small" style="margin-top:8px">${esc(w.definition)}</p>
    <p class="small muted" style="margin-top:8px"><b>Etymology:</b> ${esc(w.etymology)}</p>
    <p class="small" style="margin-top:8px;font-style:italic">“${esc(w.example)}”</p>
  </div>`;
}

function newsSection(title, stories) {
  if (!stories?.length) return '';
  return `
  <p class="small muted" style="margin:16px 0 8px;letter-spacing:.06em;text-transform:uppercase">${esc(title)} — ${stories.length} ${stories.length === 1 ? 'story' : 'stories'}</p>
  ${stories.map(s => `
  <details class="card news-story" open>
    <summary>
      ${s.breaking ? '<span class="badge badge-breaking">Breaking</span> ' : ''}<b>${esc(s.headline)}</b>
    </summary>
    ${(s.summary || []).map(p => `<p class="small news-p">${esc(p)}</p>`).join('')}
    <p class="small news-p"><span class="news-label">Geopolitical</span> ${esc(s.geopolitical)}</p>
    <p class="small news-p"><span class="news-label">Socioeconomic</span> ${esc(s.socioeconomic)}</p>
  </details>`).join('')}`;
}

// ---------- init ----------

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

const startupNote = maybeAutoRecalc();
render();
if (startupNote) toast('📈 Targets auto-updated');
