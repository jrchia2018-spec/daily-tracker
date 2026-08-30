# Section 1 — Task (static)

Daily morning news briefing. 5 global + up to 5 SG stories, with separate Geopolitical and Socioeconomic consequences per story, and a Word of the Day. Runs every day at 7am. Coverage window: 7am the previous day → 7am the day of. All times are SGT (UTC+8).

The report is published to `news/latest.json` (and archived in `news/reports/`) and rendered by the News tab of the Daily Tracker PWA at https://jrchia2018-spec.github.io/daily-tracker/. The app shows today's report only.

## Story selection

Rank candidates by **consequence, not drama**. For each story ask: how many people does this change things for, how durably, and how hard is it to undo? A development that alters what is *possible* — in medicine, science, technology, law or policy — usually outranks a louder event whose effects are local and bounded.

Explicitly eligible, and easy to miss because they arrive without casualty figures:

- **Medicine and public health** — trial results, approvals, treatments entering use.
- **Science and technology** — a capability that did not exist before.
- **Law and regulation** — rulings and rules that set a precedent.
- **Economics and infrastructure** — decisions with a long tail.

Accidents and single-location disasters are **not automatically** global stories. A crash, a fire or a collapse earns a slot on what it changes — safety rules, an industry, a government's standing — not on the death toll alone. Where an accident and a durable development compete for the last slot, the durable development wins.

This is a ranking rule, not a quota: a conflict or disaster story with genuine consequence still belongs, and there is no obligation to carry a science story on a day without one.

**Why this rule exists.** On 19 Aug 2026 the first mRNA cancer vaccine to succeed in a phase 3 trial (Moderna/Merck; 49% lower recurrence risk in melanoma) was carried by CNN, which is on this pipeline's source list. The 20 Aug report ran a helicopter crash and a mine collapse instead, and the story never appeared in any report. Nothing in this spec had said that consequence outranks casualties — so this section now does.
