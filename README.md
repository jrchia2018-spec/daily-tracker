# Daily Tracker

A personal PWA (progressive web app) for daily tracking: meals & macros, runs & gym sessions, weight progress, and (soon) daily news. No accounts, no backend — all data stays on your device in browser storage.

## Features

- **Home** — calorie ring (eaten / burned / remaining), macro bars, weekly activity strip with run/gym icons per day, quick-add buttons.
- **Meals** — type a food name and macros are fetched automatically from the free [Open Food Facts](https://world.openfoodfacts.org) database; adjust the grams and everything rescales. All values are manually editable, and full manual entry is supported. Browse any day with the date arrows.
- **Train → Runs** — log distance/duration/notes, automatic pace, weekly mileage total plus an 8-week bar chart. (Strava/Garmin sync planned; manual for now.)
- **Train → Gym** — log exercises with weight × reps per set. When you type an exercise you've done before, the app shows exactly what you lifted last session.
- **Progress** — weight log with trend chart, kg/week rate, and goal line. Targets are computed with Mifflin-St Jeor + activity factor and **auto-adjust weekly** using your latest weight; once there are ~2 weeks of logged meals and weigh-ins it also blends in your *observed* energy expenditure (intake vs. weight change). Manual override available anytime.
- **News** — placeholder tab, to be wired up later.
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
3. On **iPhone (Safari)**, later: open the URL → Share → *Add to Home Screen*.

Data is stored per-device (localStorage). When you switch phones, use **Progress → Export backup** on the old device and **Import** on the new one.

## Project layout

```
index.html            app shell + tab bar
css/style.css         all styling (dark theme)
js/app.js             views, modals, rendering
js/store.js           state + localStorage persistence + date helpers
js/targets.js         BMR/TDEE, macro targets, weekly adaptive recalculation
js/food.js            Open Food Facts search client
sw.js                 service worker (offline cache)
manifest.webmanifest  PWA install metadata
tools/serve.ps1       tiny PowerShell static server for local dev
```
