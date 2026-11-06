// Garmin data, by way of intervals.icu (6 Nov 2026, the owner's request).
// Garmin's own Personal API refuses calls from a web page (tested 5 Nov), so
// a free intervals.icu account sits in between: Garmin syncs to it officially,
// and it lets this app read the result with the athlete's personal API key.
//
// The key opens every Garmin record they have, so it never enters app state:
// it lives in its own localStorage entry on this phone, outside every backup
// file. A restore on a new phone means entering it again.
//
// It fills the morning check-in: last night's sleep time and score, and the
// steps of any day that's already over. It only ever fills an EMPTY field — a
// figure someone typed is theirs. Weight is left alone: what Garmin holds
// isn't the fasted weekend weigh-in the weight trend relies on. Since 7 Nov it
// also finds new workouts, which wait for a tap to review before anything is
// added (see the workouts section below).

import { state, save, uid, dateKey, addDays, wellnessFor } from './store.js';
import { baseKcal, STEPS_PER_KM } from './targets.js';

const CREDS = 'tracker.icu';
const PULLED = 'tracker.icuPulled';
const BASE = 'https://intervals.icu/api/v1/athlete/';
const ACTIVITY = 'https://intervals.icu/api/v1/activity/';
const EVERY_MS = 30 * 60 * 1000; // opening the app checks at most this often

export function icuCreds() {
  try {
    const c = JSON.parse(localStorage.getItem(CREDS));
    return c?.athlete && c?.key ? c : null;
  } catch {
    return null;
  }
}

export function clearIcuCreds() {
  try { localStorage.removeItem(CREDS); localStorage.removeItem(PULLED); } catch { /* nothing to clear */ }
}

export function lastPulled() {
  try { return Number(localStorage.getItem(PULLED)) || null; } catch { return null; }
}

async function icuGet(creds, path, base = BASE + encodeURIComponent(creds.athlete)) {
  const res = await fetch(base + path, {
    headers: { Authorization: 'Basic ' + btoa('API_KEY:' + creds.key) },
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403 || res.status === 404) throw new Error('refused');
  if (!res.ok) throw new Error('failed');
  return res.json();
}

const wellness = (creds, oldest, newest) =>
  icuGet(creds, `/wellness?oldest=${oldest}&newest=${newest}&fields=id,sleepSecs,sleepScore,steps`);

// Tries the pair before keeping it, so a typo is caught on the spot.
export async function connectIcu(athlete, key) {
  const creds = { athlete: athlete.trim(), key: key.trim() };
  const today = dateKey();
  await wellness(creds, addDays(today, -1), today);
  localStorage.setItem(CREDS, JSON.stringify(creds));
}

// Fills empty check-in fields from intervals.icu's day records. Each record's
// id is its date, and sleep sits on the morning it ended — the app's own
// convention. Today's steps are never taken: the day isn't over.
export function applyWellness(records, today = dateKey()) {
  const filled = [];
  for (const r of records || []) {
    const d = r?.id;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '') || d > today) continue;
    const w = { ...wellnessFor(d) };
    const before = JSON.stringify(w);
    if (w.sleepMins == null && r.sleepSecs > 0) w.sleepMins = Math.round(r.sleepSecs / 60);
    if (w.sleep == null && r.sleepScore > 0) w.sleep = Math.round(r.sleepScore);
    if (w.steps == null && d < today && r.steps > 0) w.steps = Math.round(r.steps);
    if (JSON.stringify(w) !== before) {
      state.wellness[d] = w;
      filled.push(d);
    }
  }
  if (filled.length) save();
  return filled;
}

// The past week, so a missed morning catches up by itself. Returns the dates
// filled and how many workouts wait for review, or null when not connected or
// checked too recently. A failed workout check never costs the sleep fill.
export async function pullFromGarmin({ force = false } = {}) {
  const creds = icuCreds();
  if (!creds) return null;
  if (!force && Date.now() - (lastPulled() || 0) < EVERY_MS) return null;
  const today = dateKey();
  const filled = applyWellness(await wellness(creds, addDays(today, -7), today), today);
  try { pending = await findWorkouts(creds, today); } catch { /* keep what was found before */ }
  try { localStorage.setItem(PULLED, String(Date.now())); } catch { /* next open just checks again */ }
  return { filled, workouts: pending.length };
}

// ---- workouts (7 Nov 2026) ----
//
// intervals.icu's calories are Garmin's TOTAL for the session (the owner
// checked against Garmin Connect, 7 Nov), resting energy included. This app
// counts resting once, in its daily base, so the session's share of that
// base comes off: base per minute × the session's minutes.
export function activeFrom(totalKcal, secs) {
  if (!(totalKcal > 0)) return null;
  return Math.max(0, Math.round(totalKcal - (baseKcal() / 1440) * ((secs || 0) / 60)));
}

const RUN_TYPES = new Set(['Run', 'VirtualRun', 'TrailRun']);
const ON_FOOT = new Set(['Walk', 'Hike']);
const prettyType = t => (t || 'Activity').replace(/([a-z])([A-Z])/g, (_, a, b) => `${a} ${b.toLowerCase()}`);

// Laps into splits. A lap within 10 s/km of the stretch before it joins it,
// so the auto-laps of a steady run read as one split while reps, recoveries,
// warm-up and cool-down stay apart. One split means a steady run: none kept.
// Each split's heart rate is its laps' average, weighted by time.
export function lapsToSplits(laps) {
  const out = [];
  for (const l of laps || []) {
    const km = (l.distance || 0) / 1000, secs = l.moving_time || l.elapsed_time || 0;
    if (km < 0.05 || !secs) continue;
    const hr = l.average_heartrate > 0 ? l.average_heartrate : 0;
    const last = out[out.length - 1];
    if (last && Math.abs(last.secs / last.km - secs / km) <= 10) {
      last.km += km; last.secs += secs;
      if (hr) { last.hrSum += hr * secs; last.hrSecs += secs; }
    } else {
      out.push({ km, secs, hrSum: hr * secs, hrSecs: hr ? secs : 0 });
    }
  }
  return out.length > 1
    ? out.map(s => {
      const split = { reps: 1, km: Math.round(s.km * 100) / 100, pace: Math.round(s.secs / s.km) };
      if (s.hrSecs) split.hr = Math.round(s.hrSum / s.hrSecs);
      return split;
    })
    : null;
}

// Found on the last check, not yet reviewed. Not stored: the next check
// rebuilds it, and anything reviewed is remembered in state.icuSeen.
let pending = [];
export const garminPending = () => pending;

function already(id) {
  return (state.icuSeen || []).includes(id)
    || [...state.runs, ...state.gym, ...(state.activities || [])].some(x => x.icu === id);
}

async function findWorkouts(creds, today) {
  const list = await icuGet(creds, `/activities?oldest=${addDays(today, -7)}&newest=${today}`);
  const out = [];
  for (const a of list || []) {
    const id = a?.id != null ? String(a.id) : null;
    if (!id || !a.start_date_local || already(id)) continue; // Strava imports come back as empty stubs
    const km = a.distance > 0 ? Math.round(a.distance / 10) / 100 : 0;
    const secs = a.moving_time || a.elapsed_time || 0;
    const w = {
      icu: id, date: a.start_date_local.slice(0, 10), type: a.type, name: prettyType(a.type),
      kind: RUN_TYPES.has(a.type) && km > 0 ? 'run' : a.type === 'WeightTraining' ? 'gym' : 'other',
      km, min: Math.round((secs / 60) * 10000) / 10000,
      totalKcal: a.calories > 0 ? a.calories : null,
      kcal: activeFrom(a.calories, a.elapsed_time || secs),
      where: a.trainer || a.type === 'VirtualRun' ? 'treadmill' : 'outdoor',
    };
    // Outdoors, Garmin's GPS pace and heart rate are the record. On a
    // treadmill the watch only guesses distance from the wrist, so the owner
    // types the belt's pace and their heart rate (7 Nov 2026): a Garmin
    // treadmill run brings its time and calories, and the run form does the rest.
    if (w.kind === 'run' && w.where === 'treadmill') {
      w.typeIn = true;
    } else if (w.kind === 'run') {
      if (a.average_heartrate > 0) w.hr = Math.round(a.average_heartrate);
      try { w.splits = lapsToSplits((await icuGet(creds, `${encodeURIComponent(id)}/intervals`, ACTIVITY))?.icu_intervals); } catch { /* laps are a bonus */ }
    }
    if (w.kind === 'other' && ON_FOOT.has(a.type) && km > 0) w.steps = Math.round(km * STEPS_PER_KM);
    out.push(w);
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

// items: [{ w, take, gymType }]. Every reviewed workout is remembered, taken
// or not, so a skipped one never comes back. Taken ones become ordinary
// entries (marked with their intervals.icu id), editable like any other.
export function importWorkouts(items) {
  if (!state.icuSeen) state.icuSeen = [];
  if (!state.activities) state.activities = [];
  let added = 0;
  for (const { w, take, gymType } of items) {
    state.icuSeen.push(w.icu);
    if (!take) continue;
    const base = { id: uid(), date: w.date, icu: w.icu };
    if (w.kind === 'run') {
      const r = { ...base, km: w.km, min: w.min, notes: '', where: w.where };
      if (w.kcal != null) r.kcal = w.kcal;
      if (w.hr) r.hr = w.hr;
      if (w.splits) r.splits = w.splits;
      state.runs.push(r);
    } else if (w.kind === 'gym') {
      const g = { ...base, type: gymType };
      if (w.kcal != null) g.kcal = w.kcal;
      state.gym.push(g);
    } else {
      const o = { ...base, name: w.name, kcal: w.kcal ?? 0 };
      if (w.steps) o.steps = w.steps;
      state.activities.push(o);
    }
    added++;
  }
  state.icuSeen = state.icuSeen.slice(-300);
  pending = pending.filter(p => !items.some(i => i.w.icu === p.icu));
  save();
  return added;
}

// A Garmin treadmill run finished in the run form, or skipped.
export function markGarminSeen(id) {
  if (!state.icuSeen) state.icuSeen = [];
  state.icuSeen.push(id);
  state.icuSeen = state.icuSeen.slice(-300);
  pending = pending.filter(p => p.icu !== id);
  save();
}
