// Scorecards: a generic engine plus the scoring models from the
// "Analysark" and "Allmän snurra" spreadsheets as presets.
//
// A criterion gives points by the first tier whose test the value passes.
// Two things differ from a plain spreadsheet lookup (both can be switched off):
//
//  * Smooth scoring. Points are blended linearly between neighbouring tiers,
//    so P/E 14.9 and 15.1 score almost the same instead of a full tier apart.
//  * Minimum coverage. Missing values are left out and the score is reported
//    against the points that *were* available, but when too little of the
//    scorecard had data no score is shown at all.
import { METRIC_BY_KEY, metricValue, passes, type MetricKey, type MetricSource, type Test } from "./metrics";

export interface Tier extends Test {
  points: number;
  /** Shown in the breakdown, e.g. ">20 %". */
  label?: string;
  /**
   * A hard edge. Values in this tier always get exactly its points and are
   * never blended with the tiers next to it (losses, negative equity, "no dividend").
   */
  cliff?: boolean;
}

export interface Criterion {
  id: string;
  label: string;
  metric: MetricKey;
  tiers: Tier[];
  /** Multiplies the tier points (Sundhet weights). Default 1. */
  weight?: number;
}

export interface Scorecard {
  id: string;
  name: string;
  description: string;
  /** Where it came from, shown in the UI. */
  origin: string;
  criteria: Criterion[];
}

export interface ScoreOptions {
  /** Blend points between tiers instead of stepping. Default true. */
  smooth?: boolean;
  /** Share (0–1) of the scorecard's points that must have data for a score to be shown. Default 0.6. */
  minCoverage?: number;
}

export const DEFAULT_SCORING: Required<ScoreOptions> = { smooth: true, minCoverage: 0.6 };

/** Exactly what the spreadsheets do: stepped tiers, any amount of data gives a score. */
export const EXCEL_SCORING: Required<ScoreOptions> = { smooth: false, minCoverage: 0 };

export interface CriterionResult {
  criterion: Criterion;
  value: number | null;
  tier: Tier | null;
  points: number | null;
  max: number;
}

export interface ScoreResult {
  scorecard: Scorecard;
  /** Points scored on the criteria that had data. */
  points: number;
  /** Max points on the criteria that had data. */
  max: number;
  /** Max points if every criterion had data. */
  fullMax: number;
  /** 0–100, points relative to what was available. Null when nothing had data or coverage is below the minimum. */
  pct: number | null;
  /** The same 0–100 figure even when coverage is too low to show it. */
  rawPct: number | null;
  /** Share (0–1) of the scorecard's points that had data. Weighted, so a heavy criterion counts for more. */
  coverage: number;
  /** False when coverage is below the minimum. */
  sufficient: boolean;
  covered: number;
  total: number;
  details: CriterionResult[];
}

const maxOf = (c: Criterion) => Math.max(0, ...c.tiers.map((t) => t.points)) * (c.weight ?? 1);
const minOf = (c: Criterion) => Math.min(0, ...c.tiers.map((t) => t.points)) * (c.weight ?? 1);

// ---------------------------------------------------------------------------
// Smooth scoring
//
// The tiers of a criterion cut the number line into intervals, each worth a
// fixed number of points. Smoothing replaces that staircase with a line
// through one anchor per interval:
//
//   * an interval between two thresholds is anchored at its midpoint,
//   * the outermost intervals are anchored half a neighbouring step away
//     from their threshold, and are flat beyond that.
//
// Example, P/E with ≤10 → 3, ≤15 → 2, ≤20 → 1, above → 0:
//   anchors (7.5, 3) (12.5, 2) (17.5, 1) (22.5, 0)
//   P/E 14.9 → 1.52 and 15.1 → 1.48 (stepped: 2 and 1).
//
// The curve crosses each threshold halfway between the two tiers, so on
// average a smooth score is neither higher nor lower than the stepped one.
// Tiers marked `cliff` keep their hard edge, and so do criteria whose metric
// is a level or a count (own assessments, years).

interface Segment {
  lo: number;
  hi: number;
  xs: number[];
  ys: number[];
}

const curves = new WeakMap<Criterion, Segment[]>();

/** Ramp half-width when neither side of a threshold has a width of its own (a single yes/no threshold). */
const loneRamp = (threshold: number) => Math.abs(threshold) * 0.25 || 1;

function buildSegments(c: Criterion): Segment[] {
  const bounds = [...new Set(c.tiers.flatMap((t) => [t.gte, t.gt, t.lte, t.lt]).filter((n): n is number => n != null))].sort((a, b) => a - b);
  if (!bounds.length) return [];
  // n thresholds → n+1 intervals; sample each to see which tier it belongs to.
  const intervals = Array.from({ length: bounds.length + 1 }, (_, i) => {
    const lo = i === 0 ? -Infinity : bounds[i - 1];
    const hi = i === bounds.length ? Infinity : bounds[i];
    const sample = lo === -Infinity ? hi - 1 : hi === Infinity ? lo + 1 : (lo + hi) / 2;
    const tier = c.tiers.find((t) => passes(sample, t));
    return { lo, hi, points: tier?.points ?? 0, cliff: !!tier?.cliff };
  });
  const half = (i: number) => (Number.isFinite(intervals[i].lo) && Number.isFinite(intervals[i].hi) ? (intervals[i].hi - intervals[i].lo) / 2 : null);

  const segments: Segment[] = [];
  for (let s = 0; s < intervals.length; s++) {
    if (intervals[s].cliff) continue;
    let e = s;
    while (e + 1 < intervals.length && !intervals[e + 1].cliff) e++;
    if (e > s) {
      const xs: number[] = [];
      for (let j = s; j <= e; j++) {
        const own = half(j);
        if (j === s) xs.push(intervals[j].hi - Math.min(half(j + 1) ?? own ?? loneRamp(intervals[j].hi), own ?? Infinity));
        else if (j === e) xs.push(intervals[j].lo + Math.min(half(j - 1) ?? own ?? loneRamp(intervals[j].lo), own ?? Infinity));
        else xs.push((intervals[j].lo + intervals[j].hi) / 2);
      }
      segments.push({ lo: intervals[s].lo, hi: intervals[e].hi, xs, ys: intervals.slice(s, e + 1).map((i) => i.points) });
    }
    s = e;
  }
  return segments;
}

/** Levels and counts are discrete; blending between them would be meaningless. */
const isDiscrete = (key: MetricKey) => {
  const unit = METRIC_BY_KEY.get(key)?.unit;
  return unit === "level" || unit === "years";
};

/** Points (before weight) for a value on the smooth curve, or null when the stepped value applies. */
function smoothPoints(c: Criterion, value: number): number | null {
  if (isDiscrete(c.metric)) return null;
  let segs = curves.get(c);
  if (!segs) curves.set(c, (segs = buildSegments(c)));
  const seg = segs.find((s) => value >= s.lo && value <= s.hi);
  if (!seg) return null;
  const { xs, ys } = seg;
  if (value <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (value <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (value - xs[i - 1])) / (xs[i] - xs[i - 1]);
  }
  return ys[ys.length - 1];
}

export function scoreCriterion(c: Criterion, value: number | null, smooth = DEFAULT_SCORING.smooth): CriterionResult {
  const max = maxOf(c);
  if (value == null) return { criterion: c, value, tier: null, points: null, max };
  const tier = c.tiers.find((t) => passes(value, t)) ?? null;
  const stepped = tier?.points ?? 0;
  const points = smooth && !tier?.cliff ? (smoothPoints(c, value) ?? stepped) : stepped;
  return { criterion: c, value, tier, points: points * (c.weight ?? 1), max };
}

export function score(card: Scorecard, src: MetricSource, options: ScoreOptions = {}): ScoreResult {
  const { smooth, minCoverage } = { ...DEFAULT_SCORING, ...options };
  const details = card.criteria.map((c) => scoreCriterion(c, metricValue(src, c.metric), smooth));
  const had = details.filter((d) => d.points != null);
  const points = had.reduce((a, d) => a + d.points!, 0);
  const max = had.reduce((a, d) => a + d.max, 0);
  // Scales with negative points (graded growth) are mapped from [min, max] to 0–100.
  const min = had.reduce((a, d) => a + minOf(d.criterion), 0);
  const rawPct = had.length && max > min ? Math.round(((points - min) / (max - min)) * 100) : null;
  // Coverage by weight: how much of the scorecard's point range had data.
  const range = (d: CriterionResult) => d.max - minOf(d.criterion);
  const fullRange = details.reduce((a, d) => a + range(d), 0);
  const coverage = fullRange > 0 ? had.reduce((a, d) => a + range(d), 0) / fullRange : 0;
  const sufficient = coverage >= minCoverage - 1e-9;
  return {
    scorecard: card,
    points: Math.round(points * 100) / 100,
    max,
    fullMax: details.reduce((a, d) => a + d.max, 0),
    pct: sufficient ? rawPct : null,
    rawPct,
    coverage,
    sufficient,
    covered: had.length,
    total: details.length,
    details,
  };
}

// ---------------------------------------------------------------------------
// Helpers to write tiers compactly. Values are in percent for % metrics.

/** Higher is better: [threshold, points] pairs tried top-down, `>=` threshold. Below all → `floor`. */
const atLeast = (pairs: [number, number][], floor = 0, strictLast = false): Tier[] => [
  ...pairs.map(([t, points], i) =>
    strictLast && i === pairs.length - 1 ? { gt: t, points, label: `>${t}` } : { gte: t, points, label: `≥${t}` },
  ),
  { points: floor, label: "lower" },
];

/** Lower is better: `<=` threshold. Negative values (losses, negative equity) score `neg`. */
const atMost = (pairs: [number, number][], floor = 0, neg = 0): Tier[] => [
  { lt: 0, points: neg, label: "negative", cliff: true },
  ...pairs.map(([t, points]) => ({ lte: t, points, label: `≤${t}` })),
  { points: floor, label: "higher" },
];

/** Lower is better with strict `<` (Key Metrics style). */
const below = (pairs: [number, number][], floor: number, neg: number): Tier[] => [
  { lt: 0, points: neg, label: "negative", cliff: true },
  ...pairs.map(([t, points]) => ({ lt: t, points, label: `<${t}` })),
  { points: floor, label: "higher" },
];

const crit = (id: string, label: string, metric: MetricKey, tiers: Tier[], weight?: number): Criterion => ({
  id,
  label,
  metric,
  tiers,
  ...(weight != null ? { weight } : {}),
});

// ---------------------------------------------------------------------------
// 1. Kvalitet & värdering — "POÄNG (3-2-1-0)" in Analysark.
//    Low dividend yield scores highest here (confirmed as intended).
//    Deviation: negative P/E, P/B, PEG and D/E (losses / negative equity)
//    score 0; in Excel they fell into the best tier.
const quality: Scorecard = {
  id: "quality",
  name: "Kvalitet & värdering",
  origin: "Analysark · 3-2-1-0 points",
  description: "Profit margin, valuation, ROE, cash flow, debt and dividend. 3–2–1–0 points per metric. Low yield and payout score highest: the company reinvests.",
  criteria: [
    crit("vm", "Profit margin", "profitMargin", atLeast([[20, 3], [15, 2], [10, 1]])),
    crit("pe", "P/E", "pe", atMost([[10, 3], [15, 2], [20, 1]])),
    crit("pb", "P/B", "pb", atMost([[1, 3], [2, 2], [3, 1]])),
    crit("peg", "PEG", "peg", atMost([[1, 3], [1.5, 2], [2, 1]])),
    crit("roe", "ROE", "roe", atLeast([[20, 3], [15, 2], [10, 1]], 0, true)),
    crit("fcf", "FCF", "fcfMargin", [
      { gte: 5, points: 3, label: "≥5" },
      { gte: -5, points: 2, label: "≥−5" },
      { points: 0, label: "lower" },
    ]),
    crit("de", "Debt/equity", "debtToEquity", atMost([[0.5, 3], [1, 2], [1.5, 1]])),
    crit("da", "Dividend yield (low = good)", "dividendYield", [
      { lte: 1, points: 3, label: "≤1" },
      { lte: 2, points: 2, label: "≤2" },
      { lte: 3, points: 1, label: "≤3" },
      { points: 0, label: ">3" },
    ]),
    crit("ua", "Payout ratio", "payoutRatio", [
      { lt: 5, points: 0, label: "<5", cliff: true },
      { gte: 5, lte: 30, points: 3, label: "5–30" },
      { gte: 30, lte: 50, points: 2, label: "30–50" },
      { gte: 50, lte: 70, points: 1, label: "50–70" },
      { points: 0, label: ">70" },
    ]),
  ],
};

// 2. Tillväxt — "POÄNG (tillväxt på längre sikt = större poäng)".
//    ≥10 % growth gives 1/2/3/4 points for 1/3/5/10 years.
const GROWTH_SETS: [string, string, MetricKey[]][] = [
  ["earn", "Earnings growth", ["earningsGrowth", "earningsCagr3y", "earningsCagr5y", "earningsCagr10y"]],
  ["div", "Dividend growth", ["dividendGrowth", "dividendCagr3y", "dividendCagr5y", "dividendCagr10y"]],
  ["eps", "EPS growth", ["epsGrowth", "epsCagr3y", "epsCagr5y", "epsCagr10y"]],
  ["rev", "Revenue growth", ["revenueGrowth", "revenueCagr3y", "revenueCagr5y", "revenueCagr10y"]],
  ["ebitda", "EBITDA growth", ["ebitdaGrowth", "ebitdaCagr3y", "ebitdaCagr5y", "ebitdaCagr10y"]],
];
const HORIZONS = ["1y", "3y", "5y", "10y"];

const growth: Scorecard = {
  id: "growth",
  name: "Tillväxt",
  origin: "Analysark · longer horizons score more",
  description: "Earnings, dividend, EPS, revenue and EBITDA. ≥10 %/year gives 1, 2, 3 and 4 points over 1, 3, 5 and 10 years.",
  criteria: GROWTH_SETS.flatMap(([id, label, keys]) =>
    keys.map((k, i) => crit(`${id}${i}`, `${label} ${HORIZONS[i]}`, k, [{ gte: 10, points: i + 1, label: "≥10" }, { points: 0, label: "<10" }])),
  ),
};

// 3. Tillväxt (graderad) — "POÄNG2 (liknande viktning)", with minus points for shrinking.
const GRADED = [
  [2, 1, -1],
  [2.5, 1.5, -1.5],
  [3, 2, -2],
  [3.5, 2.5, -2.5],
];
const growthGraded: Scorecard = {
  id: "growthGraded",
  name: "Tillväxt (graderad)",
  origin: "Analysark · graded",
  description: "Like Tillväxt but graded: ≥10 % and ≥5 % score, shrinking (<0 %) loses points. Longer horizons weigh more.",
  criteria: GROWTH_SETS.flatMap(([id, label, keys]) =>
    keys.map((k, i) => {
      const [hi, mid, neg] = GRADED[i];
      return crit(`${id}${i}`, `${label} ${HORIZONS[i]}`, k, [
        { gte: 10, points: hi, label: "≥10" },
        { gte: 5, points: mid, label: "≥5" },
        { lt: 0, points: neg, label: "<0" },
        { points: 0, label: "0–5" },
      ]);
    }),
  ),
};

// 4. Utdelningspoäng — "UTDELNINGSPOÄNG (BARA VINST & UTD.TILLVÄXT) 3,2,1,0p".
const step321 = (): Tier[] => [
  { gte: 10, points: 3, label: "≥10" },
  { gte: 5, points: 2, label: "≥5" },
  { gt: 1, points: 1, label: ">1" },
  { points: 0, label: "≤1" },
];
const divGrowth: Scorecard = {
  id: "divGrowth",
  name: "Utdelningspoäng (tillväxt)",
  origin: "Analysark · earnings and dividend growth only",
  description: "Earnings and dividend growth over 1, 3, 5 and 10 years. 3–2–1–0 points (≥10 %, ≥5 %, >1 %).",
  criteria: GROWTH_SETS.slice(0, 2).flatMap(([id, label, keys]) => keys.map((k, i) => crit(`${id}${i}`, `${label} ${HORIZONS[i]}`, k, step321()))),
};

// 5. Utdelning — "Slutgiltig utdelningspoäng" = Viktigaste + Tillväxt.
//    Includes the fixes: DA ">2 %" tier and 10-year dividend growth now count.
//    Deviation: the spreadsheet gave the most points for a payout of 5–30 %,
//    while also rewarding a yield ≥4 %. Both at once needs P/E below ~7.5
//    (yield = payout / P/E), so they worked against each other. The sweet
//    spot is now 30–60 %: room to keep paying without starving the business.
const dividend: Scorecard = {
  id: "dividend",
  name: "Utdelning",
  origin: "Analysark · final dividend score",
  description: "Core: dividend yield, payout ratio, P/E, profit margin. Growth: earnings and dividend growth over 5 and 10 years. Payout sweet spot 30–60 %.",
  criteria: [
    crit("da", "Dividend yield", "dividendYield", atLeast([[4, 3], [3, 2], [2, 1]], 0, true)),
    crit("ua", "Payout ratio", "payoutRatio", [
      { lt: 5, points: 0, label: "<5", cliff: true },
      { lt: 20, points: 1, label: "5–20" },
      { lt: 30, points: 2, label: "20–30" },
      { lte: 60, points: 3, label: "30–60" },
      { lte: 70, points: 2, label: "60–70" },
      { lte: 80, points: 1, label: "70–80" },
      { points: 0, label: ">80" },
    ]),
    crit("pe", "P/E", "pe", atMost([[15, 3], [20, 2], [25, 1]])),
    crit("vm", "Profit margin", "profitMargin", atLeast([[20, 3], [12, 2], [5, 1]])),
    crit("earn5", "Earnings growth 5y", "earningsCagr5y", step321()),
    crit("earn10", "Earnings growth 10y", "earningsCagr10y", step321()),
    crit("div5", "Dividend growth 5y", "dividendCagr5y", step321()),
    crit("div10", "Dividend growth 10y", "dividendCagr10y", step321()),
  ],
};

// 6–7. Sundhet — SUNDHET-fliken. Each criterion scores 0–1 by its tiers,
//      multiplied by the weight. Two weight profiles: yours and "Ain tycker till".
type SundhetRow = [id: string, label: string, metric: MetricKey, tiers: Tier[], mine: number, ai: number];
const frac = (pairs: [Test & { label: string; cliff?: boolean }, number][]): Tier[] => [
  ...pairs.map(([t, p]) => ({ ...t, points: p })),
  { points: 0, label: "other" },
];
const SUNDHET: SundhetRow[] = [
  ["roe", "Return on equity", "roe", frac([[{ gt: 20, label: ">20" }, 1], [{ gte: 15, label: "15–20" }, 2 / 3], [{ gte: 10, label: "10–15" }, 1 / 3]]), 1, 3],
  ["quick", "Quick ratio", "quickRatio", frac([[{ gt: 1.5, label: ">1.5" }, 1], [{ gte: 1, label: "1.0–1.5" }, 1 / 2]]), 1, 2],
  ["rev", "Revenue growth", "revenueGrowth", frac([[{ gt: 15, label: ">15" }, 1], [{ gte: 10, label: "10–15" }, 2 / 3], [{ gte: 5, label: "5–10" }, 1 / 3]]), 1, 3],
  ["pe", "P/E", "pe", frac([[{ lt: 0, label: "negative", cliff: true }, 0], [{ lt: 15, label: "<15" }, 1], [{ lte: 20, label: "15–20" }, 1 / 2]]), 3, 2],
  ["roa", "Return on assets", "roa", frac([[{ gt: 15, label: ">15" }, 1], [{ gte: 10, label: "10–15" }, 2 / 3], [{ gte: 5, label: "5–10" }, 1 / 3]]), 1, 3],
  ["opm", "Operating margin", "operatingMargin", frac([[{ gt: 20, label: ">20" }, 1], [{ gte: 15, label: "15–20" }, 2 / 3], [{ gte: 10, label: "10–15" }, 1 / 3]]), 1, 3],
  ["opi", "Operating profit growth", "operatingIncomeGrowth", frac([[{ gt: 20, label: ">20 % YoY" }, 1], [{ gte: 10, label: "10–20 % YoY" }, 1 / 2]]), 1, 2],
  ["de", "Debt/equity", "debtToEquity", frac([[{ lt: 0, label: "negative equity", cliff: true }, 0], [{ lt: 0.5, label: "<0.5" }, 1], [{ lte: 1, label: "0.5–1.0" }, 1 / 2]]), 1, 2],
  ["eq", "Equity ratio", "equityRatio", frac([[{ gt: 50, label: ">50" }, 1], [{ gte: 40, label: "40–50" }, 1 / 2]]), 3, 2],
  ["vm", "Profit margin", "profitMargin", frac([[{ gt: 15, label: ">15" }, 1], [{ gte: 10, label: "10–15" }, 2 / 3], [{ gte: 5, label: "5–10" }, 1 / 3]]), 3, 3],
  ["trendS", "Trend – sector", "manual.trendSector", frac([[{ gte: 3, label: "Strongly positive" }, 1]]), 1, 1],
  ["trendB", "Trend – industry", "manual.trendIndustry", frac([[{ gte: 3, label: "Strongly positive" }, 1]]), 1, 1],
  ["ps", "P/S", "ps", frac([[{ lt: 0, label: "negative", cliff: true }, 0], [{ lt: 1, label: "<1" }, 1]]), 2, 1],
  ["ebitda", "EBITDA margin", "ebitdaMargin", frac([[{ gt: 20, label: ">20" }, 1], [{ gte: 15, label: "15–20" }, 1 / 2]]), 3, 2],
  ["cagr", "Revenue CAGR 3y", "revenueCagr3y", frac([[{ gte: 15, label: "15 %+/yr" }, 1], [{ gte: 10, label: "10–15 %/yr" }, 1 / 2]]), 3, 2],
  // Deviation: the spreadsheet asked for volatility <10 %, which almost no
  // listed company has (large caps run at 20–30 %), so it never scored.
  ["vol", "Volatility", "volatility", frac([[{ lt: 20, label: "<20" }, 1], [{ lt: 30, label: "20–30" }, 1 / 2]]), 2, 1],
  ["beta", "Beta", "beta", frac([[{ lt: 0.8, label: "<0.8" }, 1], [{ lte: 1, label: "0.8–1.0" }, 1 / 2]]), 2, 1],
  ["sharpe", "Sharpe ratio (3y)", "sharpe", frac([[{ gt: 1.5, label: ">1.5" }, 1], [{ gte: 1, label: "1–1.5" }, 1 / 2]]), 1, 2],
  // Added (not in the spreadsheet): cash flow, capital efficiency and debt
  // capacity, which the original rows did not cover. Weight 2 in both profiles.
  ["fcf", "FCF margin", "fcfMargin", frac([[{ gt: 10, label: ">10" }, 1], [{ gte: 5, label: "5–10" }, 2 / 3], [{ gte: 0, label: "0–5" }, 1 / 3]]), 2, 2],
  ["roic", "ROIC", "roic", frac([[{ gt: 15, label: ">15" }, 1], [{ gte: 10, label: "10–15" }, 2 / 3], [{ gte: 5, label: "5–10" }, 1 / 3]]), 2, 2],
  ["nde", "Net debt/EBITDA", "netDebtEbitda", frac([[{ lt: 1, label: "<1" }, 1], [{ lt: 2, label: "1–2" }, 2 / 3], [{ lt: 3, label: "2–3" }, 1 / 3]]), 2, 2],
];
const sundhet = (id: string, name: string, which: 4 | 5, origin: string): Scorecard => ({
  id,
  name,
  origin,
  description: "Profitability, cash flow, balance sheet, valuation, growth and risk, from the SUNDHET sheet plus FCF, ROIC and net debt/EBITDA. Each metric weighs 1–3.",
  criteria: SUNDHET.map((r) => crit(r[0], r[1], r[2], r[3], r[which])),
});

// 8. Key Metrics — "Key Metrics + Poängsystem" in Allmän snurra, 1–5 per metric.
//    Qualitative tiers are quantified here (FCF, revenue and EPS growth).
const keyMetrics: Scorecard = {
  id: "keyMetrics",
  name: "Key Metrics",
  origin: "Allmän snurra · Key Metrics",
  description: "Ten key figures, 1–5 points each. Qualitative tiers (FCF, growth) are expressed as numbers.",
  criteria: [
    crit("vm", "Profit margin", "profitMargin", atLeast([[20, 5], [15, 4], [10, 3], [5, 2]], 1, true)),
    crit("fcf", "Free cash flow", "fcfMargin", [
      { gte: 10, points: 5, label: "strongly positive (≥10 % of revenue)" },
      { gte: 5, points: 4, label: "positive (5–10 %)" },
      { gte: 0, points: 3, label: "slightly positive (0–5 %)" },
      { gte: -5, points: 2, label: "slightly negative (−5–0 %)" },
      { points: 1, label: "negative (<−5 %)" },
    ]),
    crit("rev", "Revenue growth", "revenueGrowth", [
      { gte: 15, points: 5, label: "strong (≥15 %)" },
      { gte: 5, points: 4, label: "moderate (5–15 %)" },
      { gte: 0, points: 3, label: "stable (0–5 %)" },
      { gte: -5, points: 2, label: "shrinking (−5–0 %)" },
      { points: 1, label: "shrinking fast (<−5 %)" },
    ]),
    crit("da", "Dividend yield", "dividendYield", [
      { lte: 0, points: 1, label: "none", cliff: true },
      { gt: 5, points: 5, label: ">5" },
      { gte: 3, points: 4, label: "3–5" },
      { gte: 1, points: 3, label: "1–3" },
      { points: 2, label: "<1" },
    ]),
    crit("roe", "ROE", "roe", atLeast([[20, 5], [15, 4], [10, 3], [5, 2]], 1, true)),
    crit("de", "Debt/equity", "debtToEquity", below([[0.5, 5], [1, 4], [1.5, 3], [2, 2]], 1, 1)),
    crit("pb", "P/B", "pb", below([[1, 5], [2, 4], [3, 3], [4, 2]], 1, 1)),
    crit("eps", "EPS growth", "epsGrowth", [
      { gte: 15, points: 5, label: "strong (≥15 %)" },
      { gte: 5, points: 4, label: "moderate (5–15 %)" },
      { gte: 0, points: 3, label: "stable (0–5 %)" },
      { points: 2, label: "shrinking" },
    ]),
    crit("pe", "P/E", "pe", below([[10, 5], [15, 4], [20, 3], [25, 2]], 1, 1)),
    crit("peg", "PEG", "peg", below([[1, 5], [1.5, 4], [2, 3], [2.5, 2]], 1, 1)),
  ],
};

// 9. Egen bedömning — the "Fler, ej inräknade" checklist, scored 0–3 each.
const own: Scorecard = {
  id: "own",
  name: "Egen bedömning",
  origin: "Analysark · extra checklist",
  description: "Your own assessments: outlook, news, management, annual report, insiders, ownership, overall.",
  criteria: (["outlook", "newsflow", "management", "annualReport", "insiders", "ownership", "overall"] as const).map((k) =>
    crit(k, METRIC_BY_KEY.get(`manual.${k}`)?.label ?? k, `manual.${k}`, [3, 2, 1, 0].map((p) => ({ gte: p, points: p, label: String(p) }))),
  ),
};

export const SCORECARDS: Scorecard[] = [
  sundhet("sundhet", "Sundhet", 4, "Analysark · your weights"),
  sundhet("sundhetAi", "Sundhet (AI-vikter)", 5, "Analysark · alternative weights"),
  quality,
  keyMetrics,
  dividend,
  divGrowth,
  growth,
  growthGraded,
  own,
];

export const SCORECARD_BY_ID = new Map(SCORECARDS.map((s) => [s.id, s]));

/** Colour band for a 0–100 score. */
export const scoreBand = (pct: number | null) => (pct == null ? null : pct >= 67 ? "good" : pct >= 34 ? "ok" : "bad");
