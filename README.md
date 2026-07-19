# Daily Tracker

A personal PWA (progressive web app) for daily tracking: meals & nutrition, water, sleep, runs & gym sessions, weight progress, and an automated daily news briefing. No accounts, no backend — all data stays on your device in browser storage.

Live at: https://jrchia2018-spec.github.io/daily-tracker/

## Features

- **Home** — calorie ring (remaining vs target; burned kcal shown for info, not credited to the budget), bars for protein/carbs/fat/fibre/sodium/water, daily summary (sleep, burn, rule-based suggestions), a catch-up card flagging under-logged recent days, weekly activity strip, and the day's top headline.
- **Meals** — the input hub, browsable by date so past days can be backfilled:
  - **Paste from Claude** (primary input): paste `name | kcal | protein | carbs | fat | fibre | sodium` lines or a markdown table from a macro-estimating chat.
  - Search across built-in basics, a Singapore hawker database (local names + aliases like `ckt`, `cai png`), a personal 400-item food list, and [Open Food Facts](https://world.openfoodfacts.org) for branded items; grams rescale everything.
  - Favourites/frequent foods, copy-previous-day, quick-add, full manual entry.
  - **Water** quick-logging (+1 cup / +500ml / custom) and the **morning check-in** (sleep score, sleep time, active kcal from a watch) — all bound to the date being viewed.
- **Train → Runs** — log distance/duration/notes, automatic pace, weekly mileage total plus an 8-week bar chart.
- **Train → Gym** — one-tap push / pull / legs session logging with optional duration.
- **Progress** — weight trend chart with goal line, auto-adjusting targets (Mifflin-St Jeor + activity factor, blended with *observed* energy expenditure once ~2 weeks of data exist), and a visual weekly review: 7-day intake chart against target, meters for calories/protein/sleep, daily tick rows for protein and water (misses show the deficit), training and check-in stats.
- **News** — automated daily briefing (global + Singapore + word of the day), published to `news/reports/` by a scheduled cloud agent at 7am SGT (9am retry). The tab shows today, yesterday and the day before, with explicit "not published" states. See `news/AGENT.md` for the pipeline runbook.
- Works offline after first load (service worker). Export/import JSON backups from the Progress tab (do this before switching phones!).

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

Data is stored per-device (localStorage). When you switch phones, use **Progress → Export backup** on the old device and **Import** on the new one.

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
sw.js                 service worker (offline cache)
manifest.webmanifest  PWA install metadata
tools/serve.ps1       tiny PowerShell static server for local dev
news/AGENT.md         runbook for the automated morning-briefing agent
news/reports/         one JSON report per day (the app reads these directly)
news/state/           the briefing agent's memory between runs
```
