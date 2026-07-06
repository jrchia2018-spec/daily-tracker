# Section 2 — Format rules & search procedure (static config; absorbs corrections over time)

## Format rules
- Display at top: report timestamp and coverage window (exact SGT times).
- Global stories: breaking first, then analytical.
- Singapore stories: 2–3 SG-world, 2–3 domestic; breaking first, then analytical.
- Each story: headline, factual summary, then two separate paragraphs labelled **Geopolitical** and **Socioeconomic**.
- No cross-report repetition unless a significant new development occurred that day. Stale summaries excluded.
- No cross-story repetition within a report unless genuinely different angle.
- SG stories must be genuinely local. An elaboration of a global story already covered does not qualify unless it adds materially new local information. Local stories of even medium importance take precedence. Run fewer than 5 rather than pad (applies to global too).
- No countdown or forecasting framing. No running trackers published in the report body.
- Iran MOU updates — regardless of angles — consolidated into one story.
- Gap handling: when a session gap exceeds one day, flag it at the top of the report and carry forward significant intervening Iran developments in the dominant story summary. Do not backfill missed daily reports.
- Prices: SGD primary; original currency in brackets if different.

## Search procedure
- Global: search breaking news, then lead analytical stories. Prioritise developments within the coverage window.
- Singapore: fetch CNA, Straits Times, and Mothership headlines directly — via their RSS feeds, since the homepages are not machine-readable (JS-rendered/bot-blocked; feed URLs and fallbacks in `news/AGENT.md`, correction absorbed 6 Jul 2026). Check PMO site for cabinet-level changes. Include SG politics and Singaporean achievements explicitly. Pending open-threads items don't qualify as SG stories unless materially new that day.

## Word of the Day
Every report ends with one unused word: word, definition, etymology, example sentence in context of that day's news. After every report, immediately append the word to the correct list (`7-words-a-m.md` or `8-words-n-z.md`). Never repeat a word from either list.

## Hard rules for the automated agent
- **All dates, weekday names, and coverage windows must be computed programmatically** (shell `date`/PowerShell `Get-Date`), never written from model knowledge. A previous manual run misdated itself ("7 July", "Saturday 5 July" for a Sunday, 48h window for a 24h spec).
- Gap detection: compare today's date against the `date` field of `news/latest.json` before writing. If the gap exceeds one day, apply the gap-handling rule above.
