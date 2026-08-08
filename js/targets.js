// Calorie/macro target calculation and weekly adaptive adjustment.

import { state, save, dateKey, addDays, parseKey, daysBetween, mealsFor, mealTotals, runsOn, gymOn, latestWeight, wellnessFor, clamp, targetsFor, recordTargetChange } from './store.js';

export const ACTIVITY = {
  sedentary: { factor: 1.2, label: 'Sedentary (desk job, little exercise)' },
  light: { factor: 1.375, label: 'Light (1-3 workouts/week)' },
  moderate: { factor: 1.55, label: 'Moderate (3-5 workouts/week)' },
  active: { factor: 1.725, label: 'Active (6-7 workouts/week)' },
  athlete: { factor: 1.9, label: 'Athlete (2x/day training)' },
};

export const GOAL_RATES = [
  { value: -0.5, label: 'Lose 0.5 kg / week' },
  { value: -0.4, label: 'Lose 0.4 kg / week (~15% deficit)' },
  { value: -0.25, label: 'Lose 0.25 kg / week' },
  { value: 0, label: 'Maintain weight' },
  { value: 0.25, label: 'Gain 0.25 kg / week (lean bulk)' },
];

const KCAL_PER_KG = 7700;

// The formula-derived fibre target (14g/1000 kcal guideline, floor 25g).
// Also used to detect a hand-set fibre target: if the saved value differs
// from this, the user chose it deliberately and auto-recalc keeps it.
export function autoFibreFor(calories) {
  return Math.max(25, Math.round((calories * 14) / 1000));
}

// Mifflin-St Jeor
export function bmr({ sex, age, heightCm }, weightKg) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

export function formulaTdee(profile, weightKg) {
  return bmr(profile, weightKg) * ACTIVITY[profile.activity].factor;
}

export function computeTargets(profile, weightKg, tdeeOverride = null) {
  const tdee = tdeeOverride ?? formulaTdee(profile, weightKg);
  let calories = tdee + (profile.goalRate * KCAL_PER_KG) / 7;
  calories = Math.max(1200, Math.round(calories / 10) * 10);
  const protein = Math.round((profile.goalRate < 0 ? 2.0 : 1.8) * weightKg);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  // Fibre scales with intake (14g/1000 kcal guideline, floor 25g);
  // sodium is a flat 2300mg ceiling, not calorie-dependent.
  const fibre = autoFibreFor(calories);
  const sodium = 2300;
  // ml — user's chosen daily target. Lowered 4000 → 3000 on 20 Jul 2026:
  // 4L was missed on every one of the first 15 tracked days, and a target
  // that never goes green stops carrying information. 3L sits about 1L
  // above their actual intake — a stretch they can actually reach.
  const water = 3000;
  return { calories, protein, carbs, fat, fibre, sodium, water };
}

// Rough workout energy estimates (used for "daily caloric use").
export function runKcal(km, weightKg) {
  return Math.round(1.0 * (weightKg || 70) * km);
}

export function gymKcal(minutes, weightKg) {
  // ~5 METs strength training: kcal/min = 5 * 3.5 * kg / 200
  return Math.round(((5 * 3.5 * (weightKg || 70)) / 200) * (minutes || 45));
}

// Resting burn before any movement — the user's chosen flat figure (8 Aug),
// close to their Mifflin-St Jeor BMR of ~1628. Flat on purpose so the daily
// number is predictable; revisit if their weight moves materially.
export const BASE_KCAL = 1600;

// Steps per km at a walking stride, used both to price steps and to work out
// how many of the day's steps a logged run already accounts for.
const STEPS_PER_KM = 1300;

// Net cost of walking, i.e. ABOVE resting — resting is already in BASE_KCAL,
// so using a gross figure here (as most step trackers report) would double
// count it. ~0.5 kcal per kg per km works out at ~0.0004 kcal per step per kg.
export function stepKcal(steps, weightKg) {
  return Math.round((steps || 0) * (weightKg || 70) * 0.0004);
}

export function exerciseKcal(key) {
  const w = latestWeight() || 70;
  let total = 0;
  for (const r of runsOn(key)) total += runKcal(r.km, w);
  for (const g of gymOn(key)) total += gymKcal(g.minutes || 45, w);
  return total;
}

// Steps left once the ones a logged run already covers are removed. Without
// this a 5km run is paid for twice: once inside the day's step count and
// again as exercise. Each metre should be counted once, at running cost.
export function walkingSteps(key) {
  const raw = wellnessFor(key).steps || 0;
  const runKm = runsOn(key).reduce((s, r) => s + (r.km || 0), 0);
  return Math.max(0, raw - Math.round(runKm * STEPS_PER_KM));
}

// What the day actually cost: resting + walking + workouts. This replaces the
// old watch "active calories" basis (dropped 8 Aug at the user's request) —
// it's built from inputs they control rather than one opaque number, at the
// cost of missing incidental movement the watch would have caught.
export function dailyBurn(key) {
  const w = latestWeight() || 70;
  return BASE_KCAL + stepKcal(walkingSteps(key), w) + exerciseKcal(key);
}

// Movement only, no resting — for the "burned" figure shown next to intake.
export function activityKcal(key) {
  return dailyBurn(key) - BASE_KCAL;
}

// Linear-regression weight trend in kg/day over entries within the last `days`.
export function weightTrend(days = 28) {
  const cutoff = addDays(dateKey(), -days);
  const pts = state.weights.filter(w => w.date >= cutoff);
  if (pts.length < 3) return null;
  const x0 = parseKey(pts[0].date).getTime();
  const xs = pts.map(p => (parseKey(p.date).getTime() - x0) / 86400000);
  const ys = pts.map(p => p.kg);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b) / n;
  const my = ys.reduce((a, b) => a + b) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const span = xs[n - 1] - xs[0];
  if (span < 7) return null;
  return { kgPerDay: num / den, span, points: n };
}

// Estimate real-world TDEE from logged intake vs weight change (last 14 days).
// Only days logged to at least half the calorie target count: a day with one
// item on it is an incomplete log, not a 120-kcal day, and averaging those in
// drags the estimate far below reality (it once produced a 1570 kcal target
// from three barely-logged days).
function observedTdee() {
  const today = dateKey();
  let intakeSum = 0, loggedDays = 0;
  for (let i = 1; i <= 14; i++) {
    const key = addDays(today, -i);
    // Judge each day's completeness against the target that was live then,
    // or a target change mid-window would reclassify old days as partial.
    const floor = 0.5 * (targetsFor(key)?.calories || 2000);
    const kcal = mealsFor(key).length ? mealTotals(key).kcal : 0;
    if (kcal >= floor) {
      intakeSum += kcal;
      loggedDays++;
    }
  }
  const trend = weightTrend(21);
  if (loggedDays < 5 || !trend) return null;
  const avgIntake = intakeSum / loggedDays;
  return avgIntake - trend.kgPerDay * KCAL_PER_KG;
}

// Called on startup and after logging weight. Recomputes auto targets at most
// once every 7 days, using the latest weight and (when enough data exists)
// a blend of formula TDEE and observed TDEE.
export function maybeAutoRecalc({ force = false } = {}) {
  const p = state.profile;
  if (!p || !state.targets || state.targets.mode !== 'auto') return null;

  const today = dateKey();
  if (!force && state.lastAutoRecalc && daysBetween(state.lastAutoRecalc, today) < 7) return null;

  const w = latestWeight();
  const formula = formulaTdee(p, w);
  const observed = observedTdee();
  let tdee = formula;
  let basis = 'your latest weight';
  if (observed) {
    tdee = clamp(0.5 * formula + 0.5 * observed, formula * 0.75, formula * 1.25);
    basis = 'your logged intake and weight trend';
  }

  const next = computeTargets(p, w, tdee);
  const prev = state.targets;
  const changed = Math.abs(next.calories - prev.calories) >= 25 || next.protein !== prev.protein;

  // A fibre target that doesn't match the formula was set by hand — keep it
  // rather than resetting it every time calories move.
  if (prev.fibre != null && prev.fibre !== autoFibreFor(prev.calories)) {
    next.fibre = prev.fibre;
  }

  state.lastAutoRecalc = today;
  if (changed) {
    recordTargetChange(prev);
    state.targets = { ...next, mode: 'auto', updatedAt: today };
    const diff = next.calories - prev.calories;
    state.lastAutoNote =
      `Targets updated from ${basis}: ${diff > 0 ? '+' : ''}${diff} kcal ` +
      `(now ${next.calories} kcal, ${next.protein}g protein).`;
  }
  save();
  return changed ? state.lastAutoNote : null;
}
