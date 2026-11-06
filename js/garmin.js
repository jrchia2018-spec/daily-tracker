// Garmin data, by way of intervals.icu (6 Nov 2026, the owner's request).
// Garmin's own Personal API refuses calls from a web page (tested 5 Nov), so
// a free intervals.icu account sits in between: Garmin syncs to it officially,
// and it lets this app read the result with the athlete's personal API key.
//
// The key opens every Garmin record they have, so it never enters app state:
// it lives in its own localStorage entry on this phone, outside every backup
// file. A restore on a new phone means entering it again.
//
// For now this fills the morning check-in: last night's sleep time and score,
// and the steps of any day that's already over. It only ever fills an EMPTY
// field — a figure someone typed is theirs. Weight is left alone: what Garmin
// holds isn't the fasted weekend weigh-in the weight trend relies on.
// Workouts come later, once a synced run shows whether intervals.icu's
// calories are active or total.

import { state, save, dateKey, addDays, wellnessFor } from './store.js';

const CREDS = 'tracker.icu';
const PULLED = 'tracker.icuPulled';
const BASE = 'https://intervals.icu/api/v1/athlete/';
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

async function icuGet(creds, path) {
  const res = await fetch(BASE + encodeURIComponent(creds.athlete) + path, {
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
// filled, or null when not connected or checked too recently.
export async function pullFromGarmin({ force = false } = {}) {
  const creds = icuCreds();
  if (!creds) return null;
  if (!force && Date.now() - (lastPulled() || 0) < EVERY_MS) return null;
  const today = dateKey();
  const filled = applyWellness(await wellness(creds, addDays(today, -7), today), today);
  try { localStorage.setItem(PULLED, String(Date.now())); } catch { /* next open just checks again */ }
  return filled;
}
