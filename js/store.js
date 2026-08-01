// Central app state, persisted to localStorage.

const KEY = 'tracker.v1';

function defaults() {
  return {
    profile: null,        // {sex, age, heightCm, weightKg, goalWeightKg, activity, goalRate}
    targets: null,        // {calories, protein, carbs, fat, mode: 'auto'|'manual', updatedAt}
    targetHistory: [],    // [ {from: 'YYYY-MM-DD', targets: {...}} ] — superseded target sets, oldest first
    meals: {},            // { 'YYYY-MM-DD': [ {id, name, brand, grams, per100, kcal, protein, carbs, fat, fibre, sodium} ] }
    runs: [],             // [ {id, date, km, min, notes} ]
    gym: [],              // [ {id, date, minutes, type: 'push'|'pull'|'legs'} ] (pre-PPL entries have exercises: [{name, sets: [{w, r}]}] instead)
    weights: [],          // [ {date, kg} ] sorted by date
    wellness: {},         // { 'YYYY-MM-DD': {sleep, sleepMins, activeKcal} } — sleep score + duration = that morning's, activeKcal = that day's watch total
    water: {},            // { 'YYYY-MM-DD': ml }
    lastAutoRecalc: null, // date string of last automatic target adjustment
    lastAutoNote: null,   // human-readable note about the last adjustment
    catchupDismissed: {}, // { 'YYYY-MM-DD': true } — catch-up reminders the user waved off
    weighinDismissed: {}, // { 'YYYY-MM-DD': true } — weekend weigh-in prompts waved off
    lastBackup: null,     // date string of the last export — drives the backup nudge
    skincareStart: null,  // 'YYYY-MM-DD' — day 0 of the 8-week hold routine, or null
    skincare: {},         // { 'YYYY-MM-DD': { whiteheads: n, newLesion: bool } }
  };
}

export const state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return Object.assign(defaults(), JSON.parse(raw));
  } catch {
    return defaults();
  }
}

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function exportData() {
  return JSON.stringify(state, null, 2);
}

export function importData(json) {
  const parsed = JSON.parse(json); // throws if invalid
  // Only accept files that look like a tracker backup, so importing a
  // random JSON file can't silently wipe real data.
  if (!parsed || typeof parsed !== 'object' || typeof parsed.meals !== 'object'
    || !Array.isArray(parsed.runs) || !Array.isArray(parsed.gym) || !Array.isArray(parsed.weights)) {
    throw new Error('not a tracker backup');
  }
  Object.assign(state, defaults(), parsed);
  save();
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---- date helpers (all local time, keys are YYYY-MM-DD) ----

export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}

// Monday-start week containing d, as 7 date keys.
export function weekKeys(d = new Date()) {
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    return dateKey(x);
  });
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(key, { weekday = true } = {}) {
  const d = parseKey(key);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return weekday ? `${DAY_NAMES[d.getDay()]} ${base}` : base;
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ---- domain helpers ----

export function mealsFor(key) {
  return state.meals[key] || [];
}

export function mealTotals(key) {
  return mealsFor(key).reduce(
    (t, m) => ({
      kcal: t.kcal + (m.kcal || 0),
      protein: t.protein + (m.protein || 0),
      carbs: t.carbs + (m.carbs || 0),
      fat: t.fat + (m.fat || 0),
      fibre: t.fibre + (m.fibre || 0),
      sodium: t.sodium + (m.sodium || 0),
      water: t.water + (m.water || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sodium: 0, water: 0 }
  );
}

// Every distinct food ever logged, keeping the most recent version of each
// (by name, case-insensitive) with the date it was last logged. This is the
// "saved forever" list — anything logged once stays searchable and one-tap
// re-loggable with no time window. "Quick add" kcal-only stubs are excluded.
export function loggedFoods() {
  const byName = new Map();
  for (const date of Object.keys(state.meals).sort()) { // ascending: later wins
    for (const m of state.meals[date]) {
      if (!m.name || m.name === 'Quick add') continue;
      byName.set(m.name.toLowerCase(), { ...m, lastDate: date });
    }
  }
  return [...byName.values()];
}

export function runsOn(key) {
  return state.runs.filter(r => r.date === key);
}

export function gymOn(key) {
  return state.gym.filter(g => g.date === key);
}

export function wellnessFor(key) {
  return state.wellness[key] || {};
}

export function waterFor(key) {
  return state.water[key] || 0;
}

export function addWater(key, ml) {
  state.water[key] = Math.max(0, waterFor(key) + ml);
  save();
}

// Fluid from logged drinks and soups (kopi, barley water, bak kut teh…).
export function foodWaterFor(key) {
  return Math.round(mealTotals(key).water);
}

// What actually counts toward the daily water target: what they logged by
// hand plus what they drank as food. The 4L target is a total-fluid figure,
// so counting drinks makes the number honest rather than easier — plain
// water alone was always an under-count.
export function waterTotalFor(key) {
  return waterFor(key) + foodWaterFor(key);
}

// ---- targets over time ----

const EPOCH = '1970-01-01';

// Targets change (weekly auto-recalc, or a manual edit like the 19 Jul plan
// change). A past day should be graded against the targets that were live
// then, so every change files the outgoing set here with the date it took
// effect; `targetsFor` replays that timeline.
export function recordTargetChange(prev) {
  if (!prev) return;
  const entry = { from: prev.updatedAt || EPOCH, targets: { ...prev } };
  const hist = state.targetHistory;
  const last = hist[hist.length - 1];
  // Two edits on the same day: only the later one was ever live for a whole
  // day, so replace rather than stacking an entry no day can ever match.
  if (last && last.from === entry.from) hist[hist.length - 1] = entry;
  else hist.push(entry);
}

export function targetsFor(key) {
  if (!state.targets) return null;
  const timeline = [
    ...state.targetHistory,
    { from: state.targets.updatedAt || EPOCH, targets: state.targets },
  ];
  // Days before anything was recorded fall back to the oldest set we know —
  // wrong targets are still better than no card at all.
  let pick = timeline[0];
  for (const e of timeline) if (e.from <= key) pick = e;
  return pick.targets;
}

export function latestWeight() {
  if (!state.weights.length) return state.profile ? state.profile.weightKg : null;
  return state.weights[state.weights.length - 1].kg;
}

// ---- skincare 8-week hold ----

export function skincareFor(key) {
  return state.skincare[key] || {};
}

// A day counts as a new-lesion day if any area was tagged. Entries logged
// before areas existed only have the boolean, so honour that too.
export function hadNewLesion(entry) {
  return !!(entry && ((entry.areas && entry.areas.length) || entry.newLesion));
}

// Merge a patch into a day's skincare entry; drop the entry when it holds
// nothing meaningful so the map stays sparse. whiteheads is kept even at 0
// (a logged zero is real data), so we test for a number, not truthiness.
export function setSkincare(key, patch) {
  const next = { ...state.skincare[key], ...patch };
  if (next.areas && !next.areas.length) delete next.areas;
  if (typeof next.whiteheads !== 'number' && !hadNewLesion(next)) delete state.skincare[key];
  else state.skincare[key] = next;
  save();
}

// Program position: day 0 is `skincareStart`, week 1 = days 0–6, over 8 weeks.
export function skincareProgram() {
  if (!state.skincareStart) return null;
  const today = dateKey();
  const dayNum = daysBetween(state.skincareStart, today); // 0 on day 0
  return {
    start: state.skincareStart,
    dayNum,                              // 0-based days since day 0
    weekIndex: Math.floor(dayNum / 7),   // 0-based week
    week: Math.floor(dayNum / 7) + 1,    // 1-based week
    dayOfWeek: (dayNum % 7) + 1,         // 1..7 within the week
    done: dayNum >= 56,                  // past the 8-week hold
  };
}

// New-lesion days, average active count, and a per-area tally for one 0-based
// program week, counting only days up to today. `daysLogged` distinguishes
// "no new whiteheads" from "didn't log" — they mean very different things.
export function skincareWeek(weekIndex) {
  const first = addDays(state.skincareStart, weekIndex * 7);
  const today = dateKey();
  let newDays = 0, sum = 0, counted = 0, elapsed = 0, daysLogged = 0;
  const areas = {};
  for (let i = 0; i < 7; i++) {
    const k = addDays(first, i);
    if (k > today) break;
    elapsed++;
    const e = state.skincare[k];
    if (!e) continue;
    daysLogged++;
    if (hadNewLesion(e)) newDays++;
    for (const a of e.areas || []) areas[a] = (areas[a] || 0) + 1;
    if (typeof e.whiteheads === 'number') { sum += e.whiteheads; counted++; }
  }
  return {
    first, daysElapsed: elapsed, daysLogged, newDays, areas,
    avg: counted ? Math.round(sum / counted) : null,
  };
}
