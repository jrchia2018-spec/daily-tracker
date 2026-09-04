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
    waists: [],           // [ {date, cm} ] sorted by date — separates recomp from a stall when weight is flat
    wellness: {},         // { 'YYYY-MM-DD': {sleep, sleepMins, steps, activeKcal} } — sleep score + duration = that morning's; steps = that day's total. activeKcal is LEGACY (the watch's active-calorie figure, collected until 8 Aug); kept so old days still read, no longer used in any calculation.
    water: {},            // { 'YYYY-MM-DD': ml }
    lastAutoRecalc: null, // date string of last automatic target adjustment
    lastAutoNote: null,   // human-readable note about the last adjustment
    catchupDismissed: {}, // { 'YYYY-MM-DD': true } — catch-up reminders the user waved off
    weighinDismissed: {}, // { 'YYYY-MM-DD': true } — weekend weigh-in prompts waved off
    lastBackup: null,     // date string of the last export — drives the backup nudge
    skincareStart: null,  // 'YYYY-MM-DD' — day 0 of the 8-week hold routine, or null
    skincare: {},         // { 'YYYY-MM-DD': { whiteheads: n, newLesion: bool } } — LEGACY per-day counts, still read for days before the ledger starts
    lesions: [],          // [ {id, area, appeared, resolved|null, carried} ] — one record per whitehead, from 15 Aug 2026. See the ledger section below.
    supplements: {},      // { 'YYYY-MM-DD': ['whey', 'creatine', ...] } — ticked that day
    plan: {},             // { 'YYYY-MM-DD': { am: kind, pm: kind, night: kind } } — the training plan, sparse. See the planner section below.
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
// A logged entry's top-level macros are TOTALS (per-serving x servings), so
// handing one straight back to search made a half portion become that food's
// new base — and re-logging it halved it again. Exactly the compounding the
// servings redesign was built to end. Search must always offer ONE serving.
const MACRO_FIELDS = ['kcal', 'protein', 'carbs', 'fat', 'fibre', 'sodium', 'water'];
function oneServingOf(m) {
  const n = m.servings || 1;
  const out = { ...m, servings: 1 };
  for (const f of MACRO_FIELDS) {
    // per1 is authoritative where present; otherwise divide the totals back
    // out. Entries predating the servings feature have neither per1 nor
    // servings and are already per-serving, so n === 1 leaves them alone.
    if (m.per1 && m.per1[f] != null) out[f] = m.per1[f];
    else if (typeof m[f] === 'number' && n !== 1) out[f] = Math.round((m[f] / n) * 10) / 10;
  }
  if (typeof m.grams === 'number' && n !== 1) out.grams = Math.round((m.grams / n) * 10) / 10;
  return out;
}

export function loggedFoods() {
  const byName = new Map();
  for (const date of Object.keys(state.meals).sort()) { // ascending: later wins
    for (const m of state.meals[date]) {
      if (!m.name || m.name === 'Quick add') continue;
      byName.set(m.name.toLowerCase(), { ...oneServingOf(m), lastDate: date });
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

export function latestWaist() {
  return state.waists.length ? state.waists[state.waists.length - 1].cm : null;
}

// Change over a window, estimated by a least-squares line through EVERY
// reading rather than first-vs-last. First and last are the two single
// noisiest points in any series, so differencing them hands the whole verdict
// to two tape placements. A fitted slope lets the middle readings pull the
// error out. With exactly 2 points it reduces to last-minus-first anyway.
function fittedChange(pts, valueOf, fromDate, spanDays) {
  if (pts.length < 2 || spanDays <= 0) return null;
  const xs = pts.map(p => daysBetween(fromDate, p.date));
  const ys = pts.map(valueOf);
  const n = pts.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (den === 0) return null;            // every reading on one date
  return r1cm((num / den) * spanDays);   // slope per day, over the whole span
}

// Change in weight and waist over the same window, so the two can be read
// together — that pairing is what distinguishes recomposition (waist down,
// weight flat) from a genuine stall (neither moving). Needs >= 2 waist
// points; weight is matched to the same date span so the comparison is fair.
export function bodyChange(days = 28) {
  const w = state.waists;
  if (w.length < 2) return null;
  const cutoff = addDays(dateKey(), -days);
  const pts = w.filter(x => x.date >= cutoff);
  if (pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const spanDays = daysBetween(first.date, last.date);
  const inSpan = state.weights.filter(x => x.date >= first.date && x.date <= last.date);
  return {
    from: first.date,
    to: last.date,
    spanDays,
    waistDelta: fittedChange(pts, p => p.cm, first.date, spanDays),
    waistNow: last.cm,
    weightDelta: inSpan.length >= 2 ? fittedChange(inSpan, p => p.kg, first.date, spanDays) : null,
    points: pts.length,
  };
}

// How far a reading has to move before it means anything. A self-taken tape
// measurement carries roughly +/-1cm of placement error, so anything under
// 1cm is indistinguishable from wobble and must not be given a verdict.
// The scale is far more precise, hence the tighter bar there.
export const WAIST_NOISE_CM = 1.0;
export const WEIGHT_NOISE_KG = 0.5;

// Single readings can't be averaged down, so the only way to beat the noise is
// to wait for more of them across a longer span. Under these floors the honest
// answer is "not yet", not a confident stall-or-recomp call.
export const BODY_MIN_POINTS = 3;
export const BODY_MIN_SPAN_DAYS = 21;   // enough to name a change
export const BODY_STALL_SPAN_DAYS = 42; // "nothing is moving" needs longer still

const r1cm = n => Math.round(n * 10) / 10;

// ---- training planner (30 Aug 2026) ----
//
// Three slots a day so a gym session and a run can share a date while still
// being hours apart — which is the whole reason the user asked for slots
// rather than a day-level plan.
export const PLAN_SLOTS = [
  { id: 'am', label: 'Morning' },
  { id: 'pm', label: 'Afternoon' },
  { id: 'night', label: 'Night' },
];

export const PLAN_KINDS = [
  { id: 'push', label: 'Push', group: 'gym', short: 'Push' },
  { id: 'pull', label: 'Pull', group: 'gym', short: 'Pull' },
  { id: 'legs', label: 'Legs', group: 'gym', short: 'Legs' },
  { id: 'run-easy', label: 'Easy run', group: 'run', short: 'Easy' },
  { id: 'run-hard', label: 'Hard run', group: 'run', short: 'Hard' },
  { id: 'run-long', label: 'Long run', group: 'run', short: 'Long' },
];

// Runs that leave the legs wrecked. A long run isn't "high intensity" in the
// pace sense, but it costs the legs as much as a hard one, so it clashes with
// leg day for the same reason.
const HEAVY_RUNS = new Set(['run-hard', 'run-long']);

const kindOf = id => PLAN_KINDS.find(k => k.id === id) || null;

export function planFor(key) {
  return state.plan[key] || {};
}

// Set or clear one slot. Empty days are dropped so the map stays sparse.
export function setPlanSlot(key, slot, kind) {
  const day = { ...planFor(key) };
  if (kind) day[slot] = kind; else delete day[slot];
  if (Object.keys(day).length) state.plan[key] = day; else delete state.plan[key];
  save();
}

// Did the planned session actually happen? Read from what was LOGGED rather
// than asking for a second tick — the user logs sessions anyway, so a
// separate "mark done" would be pure duplicate friction.
// A planned gym slot needs a logged gym session of that type; a planned run
// needs any logged run (runs carry no intensity, so easy/hard can't be told
// apart after the fact).
export function planSlotStatus(key, slot) {
  const kind = kindOf(planFor(key)[slot]);
  if (!kind) return null;
  const done = kind.group === 'gym'
    ? gymOn(key).some(g => g.type === kind.id)
    : runsOn(key).length > 0;
  if (done) return 'done';
  return key < dateKey() ? 'missed' : 'todo';
}

// Advisory warnings, never blocks. The user plans around a varying week, so
// the app's job is to point at a clash, not to refuse it.
export function planWarnings(keys) {
  const out = [];
  const kindsOn = k => Object.values(planFor(k)).map(kindOf).filter(Boolean);

  // Legs and a leg-heavy run on back-to-back days — both tax the same legs.
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i], b = keys[i + 1];
    if (!b) break;
    const aK = kindsOn(a), bK = kindsOn(b);
    const aLegs = aK.some(k => k.id === 'legs'), bLegs = bK.some(k => k.id === 'legs');
    const aRun = aK.find(k => HEAVY_RUNS.has(k.id)), bRun = bK.find(k => HEAVY_RUNS.has(k.id));
    const run = (aLegs && bRun) ? bRun : (bLegs && aRun) ? aRun : null;
    if (run) {
      out.push(`${fmtDate(a, { weekday: true })} → ${fmtDate(b, { weekday: true })}: legs and a ${run.label.toLowerCase()} back to back — put a day between them.`);
    }
  }

  // Gym and a run on the same day must be far apart: morning + night is fine,
  // adjacent slots are not.
  for (const k of keys) {
    const day = planFor(k);
    const pairs = [['am', 'pm'], ['pm', 'night']];
    for (const [x, y] of pairs) {
      const kx = kindOf(day[x]), ky = kindOf(day[y]);
      if (kx && ky && kx.group !== ky.group) {
        out.push(`${fmtDate(k, { weekday: true })}: ${kx.label} and ${ky.label} are in back-to-back slots — spread them to morning and night.`);
      }
    }
  }
  return out;
}

// How the week's plan compares to the 3 gym + 3 runs target.
export function planCounts(keys) {
  let gym = 0, run = 0;
  for (const k of keys) {
    for (const id of Object.values(planFor(k))) {
      const kind = kindOf(id);
      if (!kind) continue;
      if (kind.group === 'gym') gym++; else run++;
    }
  }
  return { gym, run };
}

export { kindOf as planKind };

// ---- supplements ----

export function supplementsFor(key) {
  return state.supplements[key] || [];
}

// Toggle one supplement for a day. Empty days are dropped so the map stays
// sparse and an untouched day is distinguishable from a deliberate "none".
export function toggleSupplement(key, id) {
  const cur = supplementsFor(key);
  const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
  if (next.length) state.supplements[key] = next;
  else delete state.supplements[key];
  save();
}

// ---- skincare 8-week hold ----

export function skincareFor(key) {
  return state.skincare[key] || {};
}

// `areas` is a { areaId: count } map so more than one new spot can be logged
// in the same place on the same day. Two older shapes still exist in real
// data and must keep working: an ARRAY of ids (each meaning one), and the
// original bare `newLesion: true` boolean with no areas at all.
export function areaCounts(entry) {
  const a = entry && entry.areas;
  if (Array.isArray(a)) return Object.fromEntries(a.map(id => [id, 1]));
  if (a && typeof a === 'object') return { ...a };
  return {};
}

// How many NEW spots appeared that day. A legacy boolean-only entry means
// "at least one" — count it as 1 rather than losing the day entirely.
export function newLesionCount(entry) {
  const total = Object.values(areaCounts(entry)).reduce((s, n) => s + n, 0);
  if (total) return total;
  return entry && entry.newLesion ? 1 : 0;
}

export function hadNewLesion(entry) {
  return newLesionCount(entry) > 0;
}

// Merge a patch into a day's skincare entry; drop the entry when it holds
// nothing meaningful so the map stays sparse. whiteheads is kept even at 0
// (a logged zero is real data), so we test for a number, not truthiness.
export function setSkincare(key, patch) {
  const next = { ...state.skincare[key], ...patch };
  if (next.areas && !Object.keys(areaCounts(next)).length) delete next.areas;
  if (typeof next.whiteheads !== 'number' && !hadNewLesion(next)) delete state.skincare[key];
  else state.skincare[key] = next;
  save();
}

// ---- whitehead ledger (15 Aug 2026) ----
//
// A whitehead is now ONE RECORD that lives until it clears, instead of a count
// retyped every day. This fixes both of the user's complaints at once: the
// active count carries itself forward with no daily entry, and a spot can be
// marked gone on the day it goes — which is what makes "how long does one
// last" answerable at all. Duration is a far more sensitive read on whether
// the 8-week routine is working than a daily headcount.
//
// Nothing is migrated. Days before the ledger starts keep being read from the
// old per-day `skincare` map, which still holds all three legacy shapes.

export function lesionsAll() {
  if (!Array.isArray(state.lesions)) state.lesions = [];
  return state.lesions;
}

// First date the ledger covers. Before it, only the old per-day count exists.
export function ledgerStart() {
  const ls = lesionsAll();
  if (!ls.length) return null;
  return ls.reduce((m, l) => (l.appeared < m ? l.appeared : m), ls[0].appeared);
}

const onLedger = key => {
  const s = ledgerStart();
  return !!s && key >= s;
};

// Spots present on a given day, oldest first. A spot marked resolved on day X
// is treated as gone ON X — it's logged the morning they notice it cleared.
export function activeLesionsOn(key) {
  return lesionsAll()
    .filter(l => l.appeared <= key && (!l.resolved || l.resolved > key))
    .sort((a, b) => a.appeared.localeCompare(b.appeared));
}

// Active count for a day: the ledger once it starts, the old stored number
// before that. A logged 0 is real data, so this tests for a number.
export function activeCountOn(key) {
  if (onLedger(key)) return activeLesionsOn(key).length;
  const e = state.skincare[key];
  return e && typeof e.whiteheads === 'number' ? e.whiteheads : null;
}

// Spots that APPEARED on a day. Carried-over ones are excluded — they were
// already on the face when tracking began and aren't new incidence.
export function newOnDate(key) {
  if (onLedger(key)) {
    return lesionsAll().filter(l => l.appeared === key && !l.carried).length;
  }
  return newLesionCount(state.skincare[key]);
}

// New spots by area for a day, in the same { areaId: count } shape the old
// per-day map used, so the weekly rollup can treat both alike.
export function newAreasOn(key) {
  if (!onLedger(key)) return areaCounts(state.skincare[key]);
  const out = {};
  for (const l of lesionsAll()) {
    if (l.appeared === key && !l.carried) out[l.area] = (out[l.area] || 0) + 1;
  }
  return out;
}

export function addLesion(key, area, carried = false) {
  lesionsAll().push({ id: uid(), area, appeared: key, resolved: null, carried });
  save();
}

// Undo for the '−' button. Only ever removes a spot added on the SAME day in
// that area, so a mistap is reversible without destroying a real older record.
export function removeLesionAdded(key, area) {
  const ls = lesionsAll();
  for (let i = ls.length - 1; i >= 0; i--) {
    if (ls[i].appeared === key && ls[i].area === area && !ls[i].resolved) {
      ls.splice(i, 1);
      save();
      return true;
    }
  }
  return false;
}

// Mark a spot cleared, optionally on an earlier day than today — noticing it
// has gone is not the same as the day it went, and a forgotten tap otherwise
// inflates the duration for good. The date is clamped to [appeared, today]:
// clearing before it appeared would make a negative duration, and clearing in
// the future would leave it active while claiming to be gone.
export function resolveLesion(id, key) {
  const l = lesionsAll().find(x => x.id === id);
  if (!l) return null;
  const today = dateKey();
  let d = key || today;
  if (d < l.appeared) d = l.appeared;
  if (d > today) d = today;
  l.resolved = d;
  save();
  return d;
}

// Spots cleared in the last `days`, newest first — the window in which a
// wrong clear-date can still be corrected.
export function recentlyCleared(days = 14) {
  const cutoff = addDays(dateKey(), -days);
  return lesionsAll()
    .filter(l => l.resolved && l.resolved >= cutoff)
    .sort((a, b) => b.resolved.localeCompare(a.resolved));
}

export function unresolveLesion(id) {
  const l = lesionsAll().find(x => x.id === id);
  if (l) { l.resolved = null; save(); }
}

// How long a spot lasted, in days. Null while it's still there.
export function lesionDays(l, key = dateKey()) {
  return daysBetween(l.appeared, l.resolved || key);
}

// Add or remove one new spot in a given area for a day. Same two buttons the
// user already knows; a ledger record underneath instead of a bare count.
export function bumpSkincareArea(key, id, delta) {
  if (delta > 0) addLesion(key, id);
  else removeLesionAdded(key, id);
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
  let newDays = 0, newTotal = 0, sum = 0, counted = 0, elapsed = 0, daysLogged = 0;
  const areas = {};
  for (let i = 0; i < 7; i++) {
    const k = addDays(first, i);
    if (k > today) break;
    elapsed++;
    const ledger = onLedger(k);
    const e = state.skincare[k];
    // On the ledger every elapsed day is known — an untouched day genuinely
    // means "nothing changed", not "forgot to log". That ambiguity was the
    // whole reason daysLogged existed.
    if (ledger) daysLogged++;
    else if (e) daysLogged++;
    else continue;

    const n = newOnDate(k);
    if (n) newDays++;
    newTotal += n;
    // Sum the counts, not the number of distinct areas — two on the chin is 2.
    for (const [a, c] of Object.entries(newAreasOn(k))) areas[a] = (areas[a] || 0) + c;
    const act = activeCountOn(k);
    if (typeof act === 'number') { sum += act; counted++; }
  }

  // Spots that cleared during this week, and how long they had lasted.
  // CARRIED spots are excluded from the duration average: they were already
  // on the face when tracking began, so their `appeared` is the day they were
  // entered, not the day they started. Averaging them in would understate how
  // long a whitehead really lasts — the one number this whole tab is for.
  const last = addDays(first, 6);
  const clearedList = lesionsAll().filter(l => l.resolved && l.resolved >= first && l.resolved <= last);
  const timed = clearedList.filter(l => !l.carried);
  const durSum = timed.reduce((s, l) => s + daysBetween(l.appeared, l.resolved), 0);

  return {
    first, daysElapsed: elapsed, daysLogged, newDays, newTotal, areas,
    avg: counted ? Math.round(sum / counted) : null,
    cleared: clearedList.length,
    clearedTimed: timed.length,
    avgDaysToClear: timed.length ? Math.round(durSum / timed.length) : null,
    onLedger: onLedger(first) || onLedger(last),
  };
}
