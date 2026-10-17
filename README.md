# Daily Tracker

A personal PWA (progressive web app) for daily tracking: meals & nutrition, water, sleep, runs & gym sessions, weight progress, and an automated daily news briefing. No accounts, no backend — all data stays on your device in browser storage.

Live at: https://jrchia2018-spec.github.io/daily-tracker/

## Features

- **Home** — calorie ring (remaining vs target; burned kcal shown for info, not credited to the budget), bars for protein/carbs/fat/fibre/sodium/water, daily summary (sleep, burn, rule-based suggestions), a catch-up card flagging under-logged recent days, weekly activity strip, and the day's top headline.
- **Meals** — the input hub, browsable by date so past days can be backfilled:
  - **Paste from Claude** (primary input): paste `name | kcal | protein | carbs | fat | fibre | sodium | water` lines (the water column is optional) from a macro-estimating chat.
  - Search across built-in basics, a Singapore hawker database (local names + aliases like `ckt`, `cai png`), the owner's personal food list (owner's phone only), and [Open Food Facts](https://world.openfoodfacts.org) for branded items; grams rescale everything. Anything you've logged before shows as **Saved**; a saved food you no longer want suggested can be **forgotten** (logging it again brings it back).
  - Frequent foods, servings (½ / 1 / 2 / 3), quick-add, full manual entry.
  - **Water** quick-logging (+1 cup = 300ml / +500ml / custom), the **morning check-in** (sleep score, sleep time, steps, optional nap) and a **supplement checklist** (the owner's fixed stack; guests build their own) — all bound to the date being viewed.
- **Train → Plan** — a 7-day × 3-slot planner (morning / afternoon / night) with clash warnings; a slot shows ✓ once the session is logged. On the owner's phone it carries their half-marathon plan (sub-1:50, 21 Mar 2027): each session written out on Home, a race panel with the week's sessions, paces and rules, and weekly targets that follow the plan.
- **Train → Runs** — distance, total time, optional active calories and notes (pre-filled with the planned session on plan days); automatic pace, a guard against typing the pace as the time, weekly mileage plus an 8-week chart.
- **Train → Gym** — one-tap push / pull / legs logging with optional active calories.
- **Progress** — weight and waist cards, targets (Mifflin-St Jeor + activity factor; auto mode blends in *observed* expenditure; fibre, sodium and water you set yourself stay put), and a visual weekly review: 7-day intake chart against target, meters for calories/protein/sodium/sleep, protein and water tick rows, eaten vs burned (resting base + digestion + steps + workouts — information only, never added to the budget), training and check-in stats.
- **Skincare** — the daily routine (morning on training/rest days, evening with tonight's variant highlighted) and an optional spot tracker.
- **News** — automated daily briefing (global + Singapore + word of the day), published to `news/reports/` by a scheduled cloud agent at 7am SGT (9am retry). The tab shows today, yesterday and the day before, with explicit "not published" states. See `news/AGENT.md` for the pipeline runbook.
- Works offline after first load (service worker). **Progress → Data → Back up** sends a backup through the phone's share menu (to Google Drive, a chat with yourself, etc.); **Import** restores it on any phone. Home nudges after a week without one.

## Sharing it with friends

Anyone can open the link and use it — each phone keeps its own data, and nobody can see anyone else's. The phone that already held data when sharing was added (6 Oct 2026) is the **owner's**: it keeps the personal food list, the fixed supplement stack and the flat 1600 kcal resting burn. Every other install is a **guest**: general food databases only, their own supplement list, and a resting burn worked out from their own profile. Restoring a backup carries the owner/guest status with it.

## Run locally (Windows, no installs needed)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\serve.ps1 -Port 8765
```

Then open http://localhost:8765 in a browser.

## Put it on your phone

PWAs must be served over **HTTPS** to be installable, so host the folder on any free static host:

1. **GitHub Pages** (recommended): create a repo, push these files, enable Pages → your app is at `https://<user>.github.io/<repo>/`.
2. On **Android (Chrome)**: open the URL → menu (⋮) → *Add to Home screen* → *Install*.
3. On **iPhone (Safari)**: open the URL → Share → *Add to Home Screen*.

Opened in a browser before setup, the app shows these steps itself (tailored to Android or iPhone, with one-tap install where Chrome offers it) ahead of the setup questions.

Data is stored per-device (localStorage). When you switch phones, use **Progress → Back up** on the old device and **Import** on the new one. On iPhone, add it to the Home Screen *before* logging anything and only use it from there — the Home Screen app and Safari keep separate data.

## Project layout

```
index.html            app shell + tab bar
css/style.css         all styling (dark + light themes)
js/app.js             views, modals, rendering
js/store.js           state + localStorage persistence + date helpers
js/targets.js         BMR/TDEE, macro targets, weekly adaptive recalculation
js/food.js            Open Food Facts search client
js/foods.js           built-in food search (basics + SG + personal list + aliases)
js/foods-sg.js        Singapore hawker/local food database
js/foods-my.js        personal food list (per-portion macros)
js/hm-plan.js         the owner's half-marathon plan (the single source of truth for it)
sw.js                 service worker (offline cache)
manifest.webmanifest  PWA install metadata
tools/serve.ps1       tiny PowerShell static server for local dev
news/AGENT.md         runbook for the automated morning-briefing agent
news/reports/         one JSON report per day (the app reads these directly)
news/state/           the briefing agent's memory between runs
```
