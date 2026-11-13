# Changelog

Notable changes, newest first.

## 2026-11-13

- Round app icon: a score ring, in the same ring style as the other godvig.com sites.
- MIT `LICENSE` file and a License section in the README.

## 2026-11-12 – Honest scores, a table you can arrange, new horses

### Scoring

- **Smooth scores.** Points are now interpolated between tiers instead of jumping a whole tier at a threshold (P/E 14.9 vs 15.1 used to differ by a full point; now by 0.04). Anchors: the midpoint of each tier, and half a neighbouring step beyond the threshold for the best and worst tier. The middle of a tier still scores exactly what the spreadsheet gives, and averaged over a tier ladder smooth and stepped scores agree.
- **Hard edges kept where a blend would be wrong**: losses and negative equity, "no dividend" (Key Metrics), payout ratio under 5 %, and own assessments (levels 0–3). Tiers can be marked `cliff: true` in `shared/scoring.ts`.
- **Minimum coverage.** A score is only shown when at least 60 % of the scorecard's points have data. Coverage is weighted by points, so a weight-3 criterion counts three times a weight-1 criterion. Below the limit the badge is greyed out, the row sorts last and the tooltip says what the score would have been.
- **Settings** under *Columns ▾*: *Smooth scores* on/off and *Min. data for a score* (Off, 40, 50, 60, 75, 90 %). `EXCEL_SCORING` (stepped, no minimum) reproduces the spreadsheet and is what the parity tests use.
- The score breakdown shows points with one decimal and the share of points covered.
- Preset changes that do not alter stepped results: payout ratio has an explicit `<5` tier, and "no dividend" in Key Metrics is its own tier.

**Effect on existing numbers:** scores move by a few points because values near a threshold no longer round to a whole tier. Scorecards with too little data lose their number: on Yahoo data that is always the case for *Tillväxt* and *Tillväxt (graderad)* (see the coverage table in the README).

### Data coverage

- The column picker shows, per column, the percentage of the current list that has a value (amber under 90 %, red under 50 %).
- A table header is flagged ("45 % data") when under 60 % of the list has a value in that column.
- README: a table of how much of each scorecard Yahoo and Börsdata can fill.

### Table

- **Drag column headers** to reorder. Symbol and Name are locked; dropping a column on them puts it first. The order is saved with your columns, and hiding/showing a column keeps your order.
- **Symbol and Name stay in view** when the table scrolls sideways.
- **Long headers wrap** on word boundaries.
- **Mouse wheel scrolls sideways** (down = right, up = left) on the header row, and anywhere in the table when the page itself has nowhere left to scroll in that direction. Shift + wheel works as before.
- The divider before the extra key figures is hidden once the two groups have been mixed by dragging.

### Investment types

- *Nostalgi* is now **Nostalgic horse**. Saved data and old import files are converted when read.
- **Stupid horse** gallops the other way.
- **Lucky horse** is no longer green: its coat cycles through the rainbow with twinkling stars.

### Docs

- README: how smooth scoring and minimum coverage work, with a worked example; a *Data and terms of use* section.
