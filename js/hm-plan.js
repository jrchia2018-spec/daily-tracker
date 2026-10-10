// The owner's half-marathon plan: sub-1:50 on Sun 21 Mar 2027.
//
// Source: "Half Marathon Plan — Sub-1 50 (21 Mar 2027).docx" (8 Oct 2026),
// with the changes agreed on 11 Oct 2026 folded in:
//   - a quad move (split squats) added to Wednesday's lower-body block
//   - 2 Nov's 5×800m swapped for threshold work — the plan's own diagnosis is
//     that endurance, not speed, is the limiter
//   - a fallback if January has no running at all (the post-break ramp is the
//     plan's steepest stretch): a shorter checkpoint, and drop 26 Feb's run
//   - an upgrade rule after the 2 Mar race-pace run, and a heat rule on race day
//   - a hard session after a sub-5h night runs easy instead
//
// Owner only: guests never see it and their planner is never filled from it.
// Static data, deliberately free of imports — store.js reads it at load time.

export const HM_RACE = '2027-03-21';
export const HM_TITLE = 'Half marathon';
export const HM_GOAL = 'sub-1:50 on Sun 21 Mar';

export const HM_PACES = [
  ['Easy', '6:15–7:30'],
  ['Long', '6:15–6:45'],
  ['Race pace', '5:05–5:12'],
  ['Tempo', '4:50–4:55'],
  ['Intervals', '4:25–4:30 (400m in 1:46–1:48)'],
  ['Fast 200s', '45–48 s each'],
];

export const HM_RULES = [
  'Hot, humid day: add 10–15 s/km to easy and tempo paces. Run race-pace sessions early so the numbers mean something.',
  'Slept under ~5 h? Run Tuesday\'s session easy instead.',
  'Tired: cut Friday first, then shorten Thursday. Tuesday and Saturday are the sessions that build the race.',
  'Missed sessions are never made up. A missed week (ill, injured, exams) counts as an off week plus re-entry, and skips one build week.',
  'An off week moving one week earlier: skip the last training week before it. One week later: repeat the week before it.',
  'Sharp or worsening shin, Achilles or knee pain ends the run — two easy days, no quality until it\'s gone.',
  'Fuel on runs over 75 min: practise the race gels from December.',
];

// Weekday gym at night and runs in the morning — how the owner already plans
// most days. Any slot can be moved in the planner.
const S = (day, slot, kind, text) => ({ day, slot, kind, text });
const push = text => S(0, 'night', 'push', text || 'Push');
const lower = sets => S(2, 'night', 'pull',
  `Pull + lower block: RDL ${sets}×6–8, hip thrust ${sets}×8–10, split squat ${sets}×8 each leg, calf raises ${sets}×12–15`);
const tue = (text, kind = 'run-hard') => S(1, 'am', kind, text);
const thu = text => S(3, 'am', 'run-easy', text);
const fri = text => S(4, 'am', 'run-easy', text);
const sat = (text, kind = 'run-long') => S(5, 'am', kind, text);

const PEAK_FOOD = 'Biggest training weeks: don\'t cut food. Extra carbs around Tuesday and Saturday.';
const JAN = 'Off 4–24 Jan. If you can run at all, two 30-min easy runs a week — it decides how steep February is. Never restart on 25 Jan at December volume.';

// One entry per Monday. Distances on Tuesdays include a 2 km warm-up and
// 1–2 km cool-down.
export const HM_WEEKS = [
  { mon: '2026-10-12', phase: 'Base', sessions: [push(), tue('10×200m fast (45–48 s), walk back — 5 km'), lower(3), thu('5 km easy'), sat('8 km easy')] },
  { mon: '2026-10-19', phase: 'Base', sessions: [push(), tue('6×400m @ 4:25, 90 s rest — 6 km'), lower(3), thu('6 km easy'), sat('9 km easy')] },
  { mon: '2026-10-26', phase: 'Base', sessions: [push(), tue('20 min tempo @ 4:55 — 7 km'), lower(3), thu('6 km easy'), sat('10 km easy')] },
  { mon: '2026-11-02', phase: 'Base', sessions: [push(), tue('3×8 min @ 4:55, 2 min jog — 7 km'), lower(3), thu('7 km easy'), sat('11 km easy')] },
  { mon: '2026-11-09', phase: 'Base', sessions: [push(), tue('2×10 min @ 4:50, 2 min jog — 7 km'), lower(3), thu('7 km easy + 6 strides (20 s relaxed-fast, 60–90 s walk)'), sat('13 km easy')] },
  { mon: '2026-11-16', phase: 'Base', sessions: [push(), tue('3×1.6 km @ 4:55, 2 min jog — 8 km'), lower(3), thu('7 km easy'), sat('14 km easy')] },
  { mon: '2026-11-23', phase: 'Off', sessions: [], note: 'Off week (23–27 Nov). Free on Sat 28 or Sun 29? 30–40 min easy, no quality.' },
  { mon: '2026-11-30', phase: 'Re-entry', sessions: [push(), tue('5 km easy', 'run-easy'), lower(3), thu('6 km easy + strides'), sat('11 km easy')] },
  { mon: '2026-12-07', phase: 'Build', sessions: [push(), tue('25 min tempo @ 4:50 — 8 km'), lower(3), thu('7 km easy'), sat('15 km easy — practise a gel')] },
  { mon: '2026-12-14', phase: 'Off', sessions: [], note: 'Off week (14–20 Dec).' },
  { mon: '2026-12-21', phase: 'Re-entry', sessions: [push(), tue('6 km easy', 'run-easy'), lower(3), thu('6 km easy + strides'), sat('12 km easy')] },
  { mon: '2026-12-28', phase: 'Build', sessions: [push(), tue('6×800m @ 4:30, 2 min jog — 8 km'), lower(3), thu('7 km easy'), sat('15 km easy — practise a gel')] },
  { mon: '2027-01-04', phase: 'Off', sessions: [], note: JAN },
  { mon: '2027-01-11', phase: 'Off', sessions: [], note: JAN },
  { mon: '2027-01-18', phase: 'Off', sessions: [], note: JAN },
  { mon: '2027-01-25', phase: 'Rebuild', sessions: [push(), tue('5 km easy', 'run-easy'), lower(3), thu('6 km easy + strides'), sat('10 km easy')] },
  { mon: '2027-02-01', phase: 'Rebuild', sessions: [push(), tue('6×400m @ 4:25, 90 s rest — 6 km'), lower(3), thu('6 km easy'), fri('3 km easy'), sat('12 km easy')] },
  { mon: '2027-02-08', phase: 'Specific', note: PEAK_FOOD, sessions: [push(), tue('3×2 km @ 5:00, 90 s jog — 9 km'), lower(3), thu('7 km easy'), fri('4 km easy'), sat('14 km — practise a gel')] },
  { mon: '2027-02-15', phase: 'Specific', note: PEAK_FOOD, sessions: [push(), tue('25 min tempo @ 4:50 — 9 km'), lower(3), thu('7 km easy'), fri('5 km easy'),
    sat('CHECKPOINT: 17 km, last 6 @ 5:10, in the Vaporfly. No running in January? Make it 16 km, last 5 @ 5:10. Held 5:12 or faster with control → stay on sub-1:50. Slower than 5:20, or had to stop → retarget sub-1:55 (5:27/km) and run every later race-pace segment at 5:20–5:27.')] },
  { mon: '2027-02-22', phase: 'Peak', note: PEAK_FOOD, sessions: [push(), tue('2×4 km @ 5:05, 3 min jog — 11 km'), lower(2), thu('7 km easy'),
    fri('5 km easy — drop it if January had no running'), sat('19 km easy — protect this one above everything. Gels.')] },
  { mon: '2027-03-01', phase: 'Specific', note: PEAK_FOOD, sessions: [push(),
    tue('8 km continuous @ 5:10 — 12 km, in the Vaporfly. Felt controlled? Aim faster than 1:48: start the race at 5:10, not 5:15.'),
    lower(2), thu('7 km easy'), fri('4 km easy'), sat('14 km easy')] },
  { mon: '2027-03-08', phase: 'Taper', note: 'Running drops this week — keep eating normally, don\'t diet into the race.', sessions: [push(), tue('5×1 km @ 4:55, 90 s jog — 8 km'), lower(2), thu('6 km easy'), sat('10 km easy')] },
  { mon: '2027-03-15', phase: 'Race week', note: 'No gym after Monday. Breakfast 2–3 h before the start on Sunday.', sessions: [
    push('Light push — the last gym session'), tue('6 km with 3 km @ 5:10'), thu('4 km easy + 4 strides'), sat('15 min shakeout', 'run-easy'),
    S(6, 'am', 'run-hard', '🏁 RACE. km 1–5 @ 5:15, km 6–15 @ 5:10, then 5:05 or faster (≈1:48:55). Pace off the course km markers, not your watch. Gels at 40 and 75 min; water at every station in the first half. Hot and humid? Start at 5:20 instead. Vaporfly 4.')] },
];

// Local date arithmetic (no imports — see the header).
function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Every session with its date, for filling the planner and finding a day's.
export const HM_SESSIONS = HM_WEEKS.flatMap((w, i) =>
  w.sessions.map(s => ({ ...s, date: addDaysKey(w.mon, s.day), week: i })));

// The plan week containing a date (any day Mon–Sun), with its 1-based number.
export function hmWeekOf(key) {
  for (let i = 0; i < HM_WEEKS.length; i++) {
    const w = HM_WEEKS[i];
    if (key >= w.mon && key <= addDaysKey(w.mon, 6)) return { ...w, n: i + 1, sun: addDaysKey(w.mon, 6) };
  }
  return null;
}

export function hmSessionsOn(key) {
  return HM_SESSIONS.filter(s => s.date === key);
}

// What the week asks for — the planner's weekly target while the plan runs.
export function hmTargets(week) {
  let gym = 0, run = 0;
  for (const s of week.sessions) { if (s.kind.startsWith('run')) run++; else gym++; }
  return { gym, run };
}
