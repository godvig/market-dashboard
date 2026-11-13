# Changelog

Notable changes, newest first.

## 2026-11-13 – Investment type picker

- **Investment type is a dropdown** on *Mina anteckningar*: the six horses, then your own types already used on other stocks, then *Egen typ…* to type a new one (Enter saves, Esc cancels). A type containing "horse" gets the plain horse icon.
- Repository renamed to `market-screener` (package name and demo link updated). Saved data and import files keep the `market-dashboard` keys, so nothing needs migrating.

## 2026-11-13 – Mobile layout, new name

- **Renamed to Market Screener** (page title, header, README). The repository keeps its name for now.
- **Phones (≤ 760 px):**
  - The watchlist sidebar becomes a drawer behind a ☰ button; it closes on picking a list, tapping outside or Esc.
  - List actions (Rename, Duplicate, Delete, Export, Import) move into a ⋯ menu.
  - The table pins one column with the symbol, and the name and horse under it; swipe for the rest.
  - The column picker opens as a bottom sheet; the import dialog fills the screen.
  - Stock page: score badges scroll sideways, prev/next become arrow buttons, the score breakdown wraps metric names, and stats sit in two columns.
  - 16 px inputs (no zoom on focus in iOS Safari), 40 px touch targets, safe-area insets for notched phones.
  - The footer shows touch hints instead of mouse hints.
- Dragging lists and columns still needs a mouse; on touch screens columns are sorted by tapping.

## 2026-11-13 – Import key figures from a file

- **Import key figures from CSV or Excel**, for example a Börsdata screener export, through the existing *Import* button (the file type is read from the content). Bring your own data: no API key needed, nothing is redistributed.
- **Column mapping dialog.** Headers are matched to key figures with a Swedish/English synonym table (`shared/importSynonyms.ts`); change or remove any mapping and choose the identifier column (ticker, name or ISIN). A preview shows the first five rows after conversion.
- **Numbers and scales.** Decimal comma, spaces and non-breaking spaces as thousands separators, `%`, `-`/`n/a`/empty as missing. Percentages as fractions and market cap in MSEK are detected per column, with the same rule as the Börsdata API provider, and can be overridden.
- **Matching.** By ticker (`VOLV B` → `VOLV-B.ST`), exact name, then similar name (never across share classes). Unmatched rows can be skipped, searched for or added under the file's ticker, optionally into a new list.
- **Remembered mappings.** The mapping is saved per header set, so the next export from the same screener imports in one click.
- **Storage and precedence.** Imported figures are saved per stock with file name and date, apart from provider data. They override the API until they are older than a chosen limit (default 120 days); after that the API wins and imports only fill gaps.
- **Sources shown.** The score breakdown has a *Källa* column with each value's source, and imported values carry a small **i** in the table. Data coverage in the column picker includes imported values.
- **Demo.** Works on GitHub Pages with `localStorage`; *Try sample import* opens the made-up `docs/examples/borsdata-screener-sample.csv`.
- New key figure **ROIC**, from imports and from Börsdata's API.
- SheetJS (`xlsx` 0.20.3 from cdn.sheetjs.com) reads spreadsheets. It loads only when a spreadsheet is opened.
- `.gitignore` ignores `.csv`/`.xlsx` exports outside `docs/examples/`.

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
