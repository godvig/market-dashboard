// Scorecards: a generic engine plus the scoring models from the
// "Analysark" and "Allmän snurra" spreadsheets as presets.
//
// A criterion gives points by the first tier whose test the value passes.
// Missing values are left out and the score is reported against the
// points that *were* available, with coverage shown separately.
import { METRIC_BY_KEY, metricValue, passes, type MetricKey, type MetricSource, type Test } from "./metrics";

export interface Tier extends Test {
  points: number;
  /** Shown in the breakdown, e.g. ">20 %". */
  label?: string;
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
  /** 0–100, points relative to what was available. Null when nothing had data. */
  pct: number | null;
  covered: number;
  total: number;
  details: CriterionResult[];
}

const maxOf = (c: Criterion) => Math.max(0, ...c.tiers.map((t) => t.points)) * (c.weight ?? 1);
const minOf = (c: Criterion) => Math.min(0, ...c.tiers.map((t) => t.points)) * (c.weight ?? 1);

export function scoreCriterion(c: Criterion, value: number | null): CriterionResult {
  const max = maxOf(c);
  if (value == null) return { criterion: c, value, tier: null, points: null, max };
  const tier = c.tiers.find((t) => passes(value, t)) ?? null;
  return { criterion: c, value, tier, points: (tier?.points ?? 0) * (c.weight ?? 1), max };
}

export function score(card: Scorecard, src: MetricSource): ScoreResult {
  const details = card.criteria.map((c) => scoreCriterion(c, metricValue(src, c.metric)));
  const had = details.filter((d) => d.points != null);
  const points = had.reduce((a, d) => a + d.points!, 0);
  const max = had.reduce((a, d) => a + d.max, 0);
  // Scales with negative points (graded growth) are mapped from [min, max] to 0–100.
  const min = had.reduce((a, d) => a + minOf(d.criterion), 0);
  const pct = had.length && max > min ? Math.round(((points - min) / (max - min)) * 100) : null;
  return {
    scorecard: card,
    points: Math.round(points * 100) / 100,
    max,
    fullMax: details.reduce((a, d) => a + d.max, 0),
    pct,
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
  { points: floor, label: "lägre" },
];

/** Lower is better: `<=` threshold. Negative values (losses, negative equity) score `neg`. */
const atMost = (pairs: [number, number][], floor = 0, neg = 0): Tier[] => [
  { lt: 0, points: neg, label: "negativt" },
  ...pairs.map(([t, points]) => ({ lte: t, points, label: `≤${t}` })),
  { points: floor, label: "högre" },
];

/** Lower is better with strict `<` (Key Metrics style). */
const below = (pairs: [number, number][], floor: number, neg: number): Tier[] => [
  { lt: 0, points: neg, label: "negativt" },
  ...pairs.map(([t, points]) => ({ lt: t, points, label: `<${t}` })),
  { points: floor, label: "högre" },
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
  origin: "Analysark · POÄNG (3-2-1-0)",
  description: "Vinstmarginal, värdering, ROE, kassaflöde, skuldsättning och utdelning. 3–2–1–0 poäng per mått.",
  criteria: [
    crit("vm", "Vinstmarginal", "profitMargin", atLeast([[20, 3], [15, 2], [10, 1]])),
    crit("pe", "P/E", "pe", atMost([[10, 3], [15, 2], [20, 1]])),
    crit("pb", "P/B", "pb", atMost([[1, 3], [2, 2], [3, 1]])),
    crit("peg", "PEG", "peg", atMost([[1, 3], [1.5, 2], [2, 1]])),
    crit("roe", "ROE", "roe", atLeast([[20, 3], [15, 2], [10, 1]], 0, true)),
    crit("fcf", "FCF", "fcfMargin", [
      { gte: 5, points: 3, label: "≥5" },
      { gte: -5, points: 2, label: "≥−5" },
      { points: 0, label: "lägre" },
    ]),
    crit("de", "Skuldsättning", "debtToEquity", atMost([[0.5, 3], [1, 2], [1.5, 1]])),
    crit("da", "Direktavkastning (låg = bra)", "dividendYield", [
      { lte: 1, points: 3, label: "≤1" },
      { lte: 2, points: 2, label: "≤2" },
      { lte: 3, points: 1, label: "≤3" },
      { points: 0, label: ">3" },
    ]),
    crit("ua", "Utdelningsandel", "payoutRatio", [
      { gte: 5, lte: 30, points: 3, label: "5–30" },
      { gte: 30, lte: 50, points: 2, label: "30–50" },
      { gte: 50, lte: 70, points: 1, label: "50–70" },
      { points: 0, label: "övrigt" },
    ]),
  ],
};

// 2. Tillväxt — "POÄNG (tillväxt på längre sikt = större poäng)".
//    ≥10 % growth gives 1/2/3/4 points for 1/3/5/10 years.
const GROWTH_SETS: [string, string, MetricKey[]][] = [
  ["earn", "Vinsttillväxt", ["earningsGrowth", "earningsCagr3y", "earningsCagr5y", "earningsCagr10y"]],
  ["div", "Utdelningstillväxt", ["dividendGrowth", "dividendCagr3y", "dividendCagr5y", "dividendCagr10y"]],
  ["eps", "EPS-tillväxt", ["epsGrowth", "epsCagr3y", "epsCagr5y", "epsCagr10y"]],
  ["rev", "Omsättningstillväxt", ["revenueGrowth", "revenueCagr3y", "revenueCagr5y", "revenueCagr10y"]],
  ["ebitda", "EBITDA-tillväxt", ["ebitdaGrowth", "ebitdaCagr3y", "ebitdaCagr5y", "ebitdaCagr10y"]],
];
const HORIZONS = ["1 år", "3 år", "5 år", "10 år"];

const growth: Scorecard = {
  id: "growth",
  name: "Tillväxt",
  origin: "Analysark · POÄNG (tillväxt på längre sikt = större poäng)",
  description: "Vinst, utdelning, EPS, omsättning och EBITDA. ≥10 %/år ger 1, 2, 3 resp. 4 poäng för 1, 3, 5 och 10 år.",
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
  origin: "Analysark · POÄNG2 (liknande viktning)",
  description: "Som Tillväxt men graderad: ≥10 % och ≥5 % ger poäng, krympande (<0 %) ger minuspoäng. Längre sikt väger tyngre.",
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
  origin: "Analysark · UTDELNINGSPOÄNG (bara vinst & utd.tillväxt)",
  description: "Vinst- och utdelningstillväxt över 1, 3, 5 och 10 år. 3–2–1–0 poäng (≥10 %, ≥5 %, >1 %).",
  criteria: GROWTH_SETS.slice(0, 2).flatMap(([id, label, keys]) => keys.map((k, i) => crit(`${id}${i}`, `${label} ${HORIZONS[i]}`, k, step321()))),
};

// 5. Utdelning — "Slutgiltig utdelningspoäng" = Viktigaste + Tillväxt.
//    Includes the fixes: DA ">2 %" tier and 10-year dividend growth now count.
const dividend: Scorecard = {
  id: "dividend",
  name: "Utdelning",
  origin: "Analysark · Slutgiltig utdelningspoäng (Viktigaste + Tillväxt)",
  description: "Viktigaste: direktavkastning, utdelningsandel, P/E, vinstmarginal. Tillväxt: vinst- och utdelningstillväxt 5 och 10 år.",
  criteria: [
    crit("da", "Direktavkastning", "dividendYield", atLeast([[4, 3], [3, 2], [2, 1]], 0, true)),
    crit("ua", "Utdelningsandel", "payoutRatio", [
      { gte: 5, lt: 30, points: 3, label: "5–30" },
      { gte: 5, lt: 50, points: 2, label: "30–50" },
      { gte: 5, lt: 70, points: 1, label: "50–70" },
      { points: 0, label: "70+ / <5" },
    ]),
    crit("pe", "P/E", "pe", atMost([[15, 3], [20, 2], [25, 1]])),
    crit("vm", "Vinstmarginal", "profitMargin", atLeast([[20, 3], [12, 2], [5, 1]])),
    crit("earn5", "Vinsttillväxt 5 år", "earningsCagr5y", step321()),
    crit("earn10", "Vinsttillväxt 10 år", "earningsCagr10y", step321()),
    crit("div5", "Utdelningstillväxt 5 år", "dividendCagr5y", step321()),
    crit("div10", "Utdelningstillväxt 10 år", "dividendCagr10y", step321()),
  ],
};

// 6–7. Sundhet — SUNDHET-fliken. Each criterion scores 0–1 by its tiers,
//      multiplied by the weight. Two weight profiles: yours and "Ain tycker till".
type SundhetRow = [id: string, label: string, metric: MetricKey, tiers: Tier[], mine: number, ai: number];
const frac = (pairs: [Test & { label: string }, number][]): Tier[] => [
  ...pairs.map(([t, p]) => ({ ...t, points: p })),
  { points: 0, label: "övrigt" },
];
const SUNDHET: SundhetRow[] = [
  ["roe", "Avkastning på eget kapital", "roe", frac([[{ gt: 20, label: ">20" }, 1], [{ gte: 15, label: "15–20" }, 2 / 3], [{ gte: 10, label: "10–15" }, 1 / 3]]), 1, 3],
  ["quick", "Kassalikviditet", "quickRatio", frac([[{ gt: 1.5, label: ">1,5" }, 1], [{ gte: 1, label: "1,0–1,5" }, 1 / 2]]), 1, 2],
  ["rev", "Omsättningstillväxt", "revenueGrowth", frac([[{ gt: 15, label: ">15" }, 1], [{ gte: 10, label: "10–15" }, 2 / 3], [{ gte: 5, label: "5–10" }, 1 / 3]]), 1, 3],
  ["pe", "P/E-tal", "pe", frac([[{ lt: 0, label: "negativt" }, 0], [{ lt: 15, label: "<15" }, 1], [{ lte: 20, label: "15–20" }, 1 / 2]]), 3, 2],
  ["roa", "Räntabilitet", "roa", frac([[{ gt: 15, label: ">15" }, 1], [{ gte: 10, label: "10–15" }, 2 / 3], [{ gte: 5, label: "5–10" }, 1 / 3]]), 1, 3],
  ["opm", "Rörelsemarginal", "operatingMargin", frac([[{ gt: 20, label: ">20" }, 1], [{ gte: 15, label: "15–20" }, 2 / 3], [{ gte: 10, label: "10–15" }, 1 / 3]]), 1, 3],
  ["opi", "Rörelseresultat", "operatingIncomeGrowth", frac([[{ gt: 20, label: ">20 % YoY" }, 1], [{ gte: 10, label: "10–20 % YoY" }, 1 / 2]]), 1, 2],
  ["de", "Skuldsättningsgrad", "debtToEquity", frac([[{ lt: 0, label: "negativt EK" }, 0], [{ lt: 0.5, label: "<0,5" }, 1], [{ lte: 1, label: "0,5–1,0" }, 1 / 2]]), 1, 2],
  ["eq", "Soliditet", "equityRatio", frac([[{ gt: 50, label: ">50" }, 1], [{ gte: 40, label: "40–50" }, 1 / 2]]), 3, 2],
  ["vm", "Vinstmarginal", "profitMargin", frac([[{ gt: 15, label: ">15" }, 1], [{ gte: 10, label: "10–15" }, 2 / 3], [{ gte: 5, label: "5–10" }, 1 / 3]]), 3, 3],
  ["trendS", "Trend – sektor", "manual.trendSector", frac([[{ gte: 3, label: "Stark positiv" }, 1]]), 1, 1],
  ["trendB", "Trend – bransch", "manual.trendIndustry", frac([[{ gte: 3, label: "Stark positiv" }, 1]]), 1, 1],
  ["ps", "P/S", "ps", frac([[{ lt: 0, label: "negativt" }, 0], [{ lt: 1, label: "<1" }, 1]]), 2, 1],
  ["ebitda", "EBITDA-marginal", "ebitdaMargin", frac([[{ gt: 20, label: ">20" }, 1], [{ gte: 15, label: "15–20" }, 1 / 2]]), 3, 2],
  ["cagr", "CAGR (omsättning 3 år)", "revenueCagr3y", frac([[{ gte: 15, label: "15 %+/år" }, 1], [{ gte: 10, label: "10–15 %/år" }, 1 / 2]]), 3, 2],
  ["vol", "Volatilitet", "volatility", frac([[{ lt: 10, label: "<10" }, 1]]), 2, 1],
  ["beta", "Beta", "beta", frac([[{ lt: 0.8, label: "<0,8" }, 1], [{ lte: 1, label: "0,8–1,0" }, 1 / 2]]), 2, 1],
  ["sharpe", "Sharpekvot", "sharpe", frac([[{ gt: 1.5, label: ">1,5" }, 1], [{ gte: 1, label: "1–1,5" }, 1 / 2]]), 1, 2],
];
const sundhet = (id: string, name: string, which: 4 | 5, origin: string): Scorecard => ({
  id,
  name,
  origin,
  description: "Lönsamhet, balansräkning, värdering, tillväxt och risk enligt SUNDHET-fliken. Varje mått viktas 1–3.",
  criteria: SUNDHET.map((r) => crit(r[0], r[1], r[2], r[3], r[which])),
});

// 8. Key Metrics — "Key Metrics + Poängsystem" in Allmän snurra, 1–5 per metric.
//    Qualitative tiers are quantified here (FCF, revenue and EPS growth).
const keyMetrics: Scorecard = {
  id: "keyMetrics",
  name: "Key Metrics",
  origin: "Allmän snurra · Key Metrics + Poängsystem",
  description: "Tio nyckeltal, 1–5 poäng vardera. Kvalitativa nivåer (FCF, tillväxt) är omsatta i siffror.",
  criteria: [
    crit("vm", "Vinstmarginal", "profitMargin", atLeast([[20, 5], [15, 4], [10, 3], [5, 2]], 1, true)),
    crit("fcf", "Fritt kassaflöde", "fcfMargin", [
      { gte: 10, points: 5, label: "starkt positivt (≥10 % av oms.)" },
      { gte: 5, points: 4, label: "positivt (5–10 %)" },
      { gte: 0, points: 3, label: "svagt positivt (0–5 %)" },
      { gte: -5, points: 2, label: "svagt negativt (−5–0 %)" },
      { points: 1, label: "negativt (<−5 %)" },
    ]),
    crit("rev", "Omsättningstillväxt", "revenueGrowth", [
      { gte: 15, points: 5, label: "stark (≥15 %)" },
      { gte: 5, points: 4, label: "måttlig (5–15 %)" },
      { gte: 0, points: 3, label: "stabil (0–5 %)" },
      { gte: -5, points: 2, label: "minskande (−5–0 %)" },
      { points: 1, label: "kraftigt minskande (<−5 %)" },
    ]),
    crit("da", "Direktavkastning", "dividendYield", [
      { gt: 5, points: 5, label: ">5" },
      { gte: 3, points: 4, label: "3–5" },
      { gte: 1, points: 3, label: "1–3" },
      { gt: 0, points: 2, label: "<1" },
      { points: 1, label: "ingen" },
    ]),
    crit("roe", "ROE", "roe", atLeast([[20, 5], [15, 4], [10, 3], [5, 2]], 1, true)),
    crit("de", "Skuldsättningsgrad", "debtToEquity", below([[0.5, 5], [1, 4], [1.5, 3], [2, 2]], 1, 1)),
    crit("pb", "P/B", "pb", below([[1, 5], [2, 4], [3, 3], [4, 2]], 1, 1)),
    crit("eps", "EPS-tillväxt", "epsGrowth", [
      { gte: 15, points: 5, label: "kraftig (≥15 %)" },
      { gte: 5, points: 4, label: "måttlig (5–15 %)" },
      { gte: 0, points: 3, label: "stabil (0–5 %)" },
      { points: 2, label: "minskande" },
    ]),
    crit("pe", "P/E", "pe", below([[10, 5], [15, 4], [20, 3], [25, 2]], 1, 1)),
    crit("peg", "PEG", "peg", below([[1, 5], [1.5, 4], [2, 3], [2.5, 2]], 1, 1)),
  ],
};

// 9. Egen bedömning — the "Fler, ej inräknade" checklist, scored 0–3 each.
const own: Scorecard = {
  id: "own",
  name: "Egen bedömning",
  origin: "Analysark · Fler, ej inräknade",
  description: "Dina egna bedömningar: framtidsutsikter, nyhetsläge, ledning, årsredovisning, insiders, ägarstruktur, helhet.",
  criteria: (["outlook", "newsflow", "management", "annualReport", "insiders", "ownership", "overall"] as const).map((k) =>
    crit(k, METRIC_BY_KEY.get(`manual.${k}`)?.sv ?? k, `manual.${k}`, [3, 2, 1, 0].map((p) => ({ gte: p, points: p, label: String(p) }))),
  ),
};

export const SCORECARDS: Scorecard[] = [
  sundhet("sundhet", "Sundhet", 4, "Analysark · SUNDHET (dina vikter)"),
  sundhet("sundhetAi", "Sundhet (AI-vikter)", 5, "Analysark · SUNDHET (Ain tycker till)"),
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
