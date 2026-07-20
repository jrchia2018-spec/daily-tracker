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
    lastBackup: null,     // date string of the last export — drives the backup nudge
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
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sodium: 0 }
  );
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
