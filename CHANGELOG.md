# Changelog

Notable changes, newest first.

## 2026-11-14 – Why this score, and score history

- **Why this score** on the stock page: the criteria that lift the stock above a typical stock in its list or pull it below, in score points with a bar, the list's median value next to the stock's, its place in the list and the gap to the list average. Pick any scorecard; the list's lens is shown first.
- **Score history**: the server saves the key figures behind the scores whenever a list loads (`data/snapshots.json`; daily for five weeks, then weekly, at most 300 per stock). The stock page draws the score over 1M / 3M / 1Y / all and lists the figures that moved it most. Because figures, not scores, are stored, an edited or brand-new scorecard gets a history straight away.
- The mini scores in the stock header start with the list's lens.
- **Demo**: every list now has a scorecard lens (Large caps → Sundhet, Dividend ideas → Utdelning, Big tech → Tillväxt, Europe → an example custom card, *Compounders*), and each stock gets a made-up year of history.

## 2026-11-13 – Scorecard editor

- **Build your own scorecards** on the new *Scorecards* page: duplicate a preset or start from a small template, then edit criteria, metrics, tier ranges, points, hard edges and weights. Built-in cards stay locked so they keep matching the spreadsheets.
- **Live preview**: the open list is ranked by the card you are editing, with arrows for how far each stock has moved since you opened it.
- **Export and import** scorecards as JSON (`market-screener-scorecard`, version 1). Files are validated; an import never overwrites an existing card.
- **A lens per list**: *Rank by* above the table picks the scorecard a list is sorted by. Its column is always shown and highlighted.
- Custom scorecards get their own score column in the column picker and appear on the stock page's *Scores* tab.
- Stored in `data/store.json` (`scorecards`, and `scorecardId` on each list). Deleting a card also removes its column and any list lens that used it.

## 2026-11-13 – English interface, sharper metrics

### Interface

- **English everywhere**: tabs (*Overview*, *Scores*, *My notes*), score breakdown, own assessments and their levels, the ticker fixer, the investment-type picker, metric descriptions and tooltips. Scorecard names stay Swedish (*Sundhet*, *Utdelning* …); the README has a glossary.
- Numbers use a decimal point (`1.5`, `12,345`) instead of a decimal comma.
- Metric tooltips show the Swedish name as a glossary, so Börsdata users recognise *Direktavkastning*, *Soliditet* and the rest.

### Metrics and scorecards

- **New: FCF yield** (free cash flow / market cap), a valuation column.
- **Yahoo now delivers ROIC and net debt/EBITDA** too (before, only Börsdata did). ROIC = EBIT after tax / (equity + debt − cash) from the latest annual report; ND/EBITDA from total debt, cash and EBITDA, empty when EBITDA is negative.
- **Sundhet** gets three rows, weight 2 in both profiles: FCF margin, ROIC and net debt/EBITDA. Yahoo can fill 95 % of it.
- **Sundhet, volatility**: <20 % gives the point and 20–30 % half (was <10 %, which practically never happened).
- **Sharpe ratio over three years** instead of one; the list fetches five years of prices for it (cached like before).
- **Utdelning, payout ratio**: sweet spot 30–60 % (was 5–30 %, which contradicted the reward for a high yield).
- Scorecard sources shortened to the spreadsheet name and a plain description.

**Effect on existing numbers:** Sundhet moves for every stock (new rows, new volatility tier, three-year Sharpe), and Utdelning moves for companies with a payout below 30 % or above 60 %.

## 2026-11-13 – Continuous integration

- **CI on every push and pull request** (`.github/workflows/ci.yml`): lint, typecheck, tests and a build of both the app and the demo. Badge in the README.
- **Lint with oxlint** (`npm run lint`, rules in `.oxlintrc.json`). ESLint's TypeScript plugin does not support TypeScript 7 yet; oxlint doesn't depend on the TypeScript version. Real errors fail the build; React style hints (state set in effects, refs read during render) are warnings to clean up later.
- A few one-line comma expressions in the CSV parser and import matching rewritten as plain blocks.

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
