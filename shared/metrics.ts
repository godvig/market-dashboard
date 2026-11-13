// Registry of every metric the app can show, colour or score.
// Most descriptions and traffic-light thresholds come from the "Analysark" /
// "Allmän snurra" spreadsheets; `ruleSource` says which. `sv` keeps the
// Swedish name, shown as a glossary and used to recognise Swedish exports.
import type { FundamentalKey, Fundamentals, Metrics, StockMeta } from "./types";

/** A numeric condition. All given bounds must hold. */
export interface Test {
  gte?: number;
  gt?: number;
  lte?: number;
  lt?: number;
}

export const passes = (v: number, t: Test) =>
  (t.gte == null || v >= t.gte) && (t.gt == null || v > t.gt) && (t.lte == null || v <= t.lte) && (t.lt == null || v < t.lt);

export type Rating = "good" | "ok" | "bad";

export type Unit = "pct" | "x" | "num" | "years" | "amount" | "level";

export type ManualKey =
  | "trendSector"
  | "trendIndustry"
  | "outlook"
  | "newsflow"
  | "management"
  | "annualReport"
  | "insiders"
  | "ownership"
  | "overall";

export type MetricKey = FundamentalKey | keyof Metrics | `manual.${ManualKey}`;

export interface MetricDef {
  key: MetricKey;
  /** Short column label. */
  label: string;
  /** Swedish name, as in the spreadsheets and Swedish data sources. */
  sv: string;
  description?: string;
  unit: Unit;
  /** Traffic light: good / bad tests, everything else is "ok". Null-rated when `skipZero` and value is 0. */
  rate?: { good: Test[]; bad: Test[]; skipZero?: boolean };
  ruleSource?: "analysark" | "snurra" | "default";
}

/** Shorthand: any of the tests matches. */
const any = (...t: Test[]) => t;

const growthRate = { good: any({ gte: 10 }), bad: any({ lt: 0 }) };

export const METRICS: MetricDef[] = [
  // ---- dividends ----
  {
    key: "dividendYield", label: "Div yield", sv: "Direktavkastning", unit: "pct",
    description: "Yearly dividend / share price.",
    rate: { good: any({ gte: 4 }), bad: any({ lt: 2 }), skipZero: true }, ruleSource: "analysark",
  },
  {
    key: "payoutRatio", label: "Payout", sv: "Utdelningsandel", unit: "pct",
    description: "Share of earnings paid out. 30–70 % is normal on the Stockholm exchange; above 80 % is a warning sign.",
    rate: { good: any({ gte: 5, lt: 30 }), bad: any({ gte: 70 }), skipZero: true }, ruleSource: "analysark",
  },
  { key: "dividendPerShare", label: "Div/share", sv: "Utdelning/aktie", unit: "amount" },
  { key: "dividendGrowth", label: "Div gr 1y", sv: "Utdelningstillväxt", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  { key: "dividendCagr3y", label: "Div gr 3y", sv: "Utdelningstillväxt 3 år", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  { key: "dividendCagr5y", label: "Div gr 5y", sv: "Utdelningstillväxt 5 år", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  { key: "dividendCagr10y", label: "Div gr 10y", sv: "Utdelningstillväxt 10 år", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  {
    key: "dividendYearsPaid", label: "Yrs w/ div", sv: "Antal år med utdelning", unit: "years",
    rate: { good: any({ gte: 10 }), bad: any({ lt: 1 }) }, ruleSource: "analysark",
  },
  {
    key: "dividendYearsNoCut", label: "Yrs no cut", sv: "Antal år utan sänkningar", unit: "years",
    description: "Years in a row without a dividend cut.",
    rate: { good: any({ gte: 10 }), bad: any({ lt: 1 }) }, ruleSource: "analysark",
  },
  {
    key: "dividendYearsRaised", label: "Yrs raised", sv: "Antal år med höjningar", unit: "years",
    description: "Years in a row with a raised dividend.",
    rate: { good: any({ gte: 10 }), bad: any({ lt: 1 }) }, ruleSource: "analysark",
  },

  // ---- valuation ----
  {
    key: "pe", label: "P/E", sv: "P/E-tal", unit: "x",
    description: "Share price / earnings per share. 10–15 is typical for a stable company; the further below 20, the more upside.",
    rate: { good: any({ gte: 0, lt: 10 }), bad: any({ gte: 25 }, { lt: 0 }) }, ruleSource: "analysark",
  },
  {
    key: "forwardPe", label: "Fwd P/E", sv: "P/E (prognos)", unit: "x",
    rate: { good: any({ gte: 0, lt: 10 }), bad: any({ gte: 25 }, { lt: 0 }) }, ruleSource: "analysark",
  },
  {
    key: "peg", label: "PEG", sv: "PEG-tal", unit: "x",
    description: "P/E divided by earnings growth. Below 1: possibly undervalued; 1–1.5: fair; above 2.5: clearly expensive. Depends on a growth forecast.",
    rate: { good: any({ gte: 0, lt: 1 }), bad: any({ gte: 2.5 }, { lt: 0 }) }, ruleSource: "analysark",
  },
  {
    key: "ps", label: "P/S", sv: "P/S-tal", unit: "x", description: "Price / sales. Useful for young companies without profits; read it together with the margin.",
    rate: { good: any({ gte: 0, lt: 1 }), bad: any({ gte: 4 }, { lt: 0 }) }, ruleSource: "analysark",
  },
  {
    key: "pb", label: "P/B", sv: "P/B-tal", unit: "x", description: "Price / book value. Most meaningful for banks, insurers and investment companies.",
    rate: { good: any({ gte: 0, lt: 1 }), bad: any({ gte: 4 }, { lt: 0 }) }, ruleSource: "analysark",
  },
  {
    key: "evEbit", label: "EV/EBIT", sv: "EV/EBIT", unit: "x",
    rate: { good: any({ gte: 0, lt: 10 }), bad: any({ gte: 25 }, { lt: 0 }) }, ruleSource: "default",
  },
  {
    key: "evEbitda", label: "EV/EBITDA", sv: "EV/EBITDA", unit: "x",
    rate: { good: any({ gte: 0, lt: 8 }), bad: any({ gte: 20 }, { lt: 0 }) }, ruleSource: "default",
  },
  {
    key: "fcfYield", label: "FCF yield", sv: "FCF-avkastning", unit: "pct",
    description: "Free cash flow / market cap: the cash generated per krona of share price. Comparable across debt levels.",
    rate: { good: any({ gte: 5 }), bad: any({ lt: 0 }) }, ruleSource: "default",
  },
  {
    key: "marketCap", label: "Mkt cap", sv: "Börsvärde", unit: "amount",
    description:
      "Smaller companies can grow faster but carry more risk; large ones are steadier with less room to grow.",
  },
  { key: "eps", label: "EPS", sv: "Vinst/aktie", unit: "amount", rate: { good: [], bad: any({ lt: 0 }) }, ruleSource: "default" },

  // ---- profitability ----
  {
    key: "roe", label: "ROE", sv: "Avkastning på eget kapital", unit: "pct", description: "Return on equity: profit / equity. Inflated by debt and buybacks.",
    rate: { good: any({ gte: 20 }), bad: any({ lt: 5 }) }, ruleSource: "analysark",
  },
  {
    key: "roa", label: "ROA", sv: "Räntabilitet", unit: "pct", description: "Return on assets: profit / total assets.",
    rate: { good: any({ gte: 15 }), bad: any({ lt: 5 }) }, ruleSource: "analysark",
  },
  {
    key: "roic", label: "ROIC", sv: "Avkastning på investerat kapital", unit: "pct",
    description: "Return on invested capital: operating profit after tax / (equity + debt − cash). Unlike ROE, debt does not inflate it.",
    rate: { good: any({ gte: 15 }), bad: any({ lt: 5 }) }, ruleSource: "default",
  },
  {
    key: "profitMargin", label: "Margin", sv: "Vinstmarginal", unit: "pct",
    description: "Net income / revenue.",
    rate: { good: any({ gte: 20 }), bad: any({ lt: 5 }) }, ruleSource: "analysark",
  },
  {
    key: "operatingMargin", label: "Op margin", sv: "Rörelsemarginal", unit: "pct",
    description: "Operating profit / revenue.",
    rate: { good: any({ gte: 20 }), bad: any({ lt: 10 }) }, ruleSource: "analysark",
  },
  {
    key: "ebitdaMargin", label: "EBITDA mgn", sv: "EBITDA-marginal", unit: "pct", description: "EBITDA / revenue.",
    rate: { good: any({ gte: 20 }), bad: any({ lt: 5 }) }, ruleSource: "analysark",
  },
  {
    key: "fcfMargin", label: "FCF", sv: "Fritt kassaflöde (/omsättning)", unit: "pct",
    description: "Free cash flow (operating cash flow minus investments) / revenue.",
    rate: { good: any({ gte: 5 }), bad: any({ lt: -5 }) }, ruleSource: "analysark",
  },

  // ---- balance sheet & risk ----
  {
    key: "quickRatio", label: "Quick", sv: "Kassalikviditet", unit: "x", description: "Ability to pay short-term debts: (current assets − inventory) / current liabilities.",
    rate: { good: any({ gte: 1.5 }), bad: any({ lt: 1 }) }, ruleSource: "analysark",
  },
  {
    key: "debtToEquity", label: "D/E", sv: "Skuldsättningsgrad", unit: "x",
    description: "Liabilities / equity.",
    rate: { good: any({ gte: 0, lt: 0.5 }), bad: any({ gte: 2 }, { lt: 0 }) }, ruleSource: "analysark",
  },
  {
    key: "equityRatio", label: "Equity ratio", sv: "Soliditet", unit: "pct",
    description: "Equity / total assets: how much of the company is financed by its owners. Not meaningful for banks and real estate.",
    rate: { good: any({ gte: 50 }), bad: any({ lt: 20 }) }, ruleSource: "analysark",
  },
  {
    key: "netDebtEbitda", label: "ND/EBITDA", sv: "Nettoskuld/EBITDA", unit: "x",
    description: "Net debt / EBITDA: years of operating profit needed to pay off the debt. Negative means more cash than debt; above 3 is high.",
    rate: { good: any({ lt: 1 }), bad: any({ gte: 3 }) }, ruleSource: "default",
  },
  {
    key: "beta", label: "Beta", sv: "Beta", unit: "x", description: "Above 1: moves more than the market.",
    rate: { good: any({ lt: 0.8 }), bad: any({ gt: 1 }) }, ruleSource: "analysark",
  },
  {
    key: "volatility", label: "Vol", sv: "Volatilitet", unit: "pct", description: "Short-term risk: annualised standard deviation of daily returns, last year. A typical large company is around 20–30 %.",
    rate: { good: any({ lt: 20 }), bad: any({ gte: 40 }) }, ruleSource: "default",
  },
  {
    key: "sharpe", label: "Sharpe", sv: "Sharpekvot", unit: "x",
    description: "Risk-adjusted return over the last three years (at least one): return above the risk-free rate / volatility.",
    rate: { good: any({ gt: 1.5 }), bad: any({ lt: 1 }) }, ruleSource: "analysark",
  },

  // ---- growth ----
  { key: "revenueGrowth", label: "Rev gr 1y", sv: "Omsättningstillväxt", unit: "pct", description: "Revenue growth, last year.", rate: growthRate, ruleSource: "analysark" },
  {
    key: "revenueCagr3y", label: "Rev CAGR 3y", sv: "CAGR omsättning (3 år)", unit: "pct",
    rate: { good: any({ gte: 10 }), bad: any({ lt: -5 }) }, ruleSource: "analysark",
  },
  { key: "revenueCagr5y", label: "Rev CAGR 5y", sv: "Omsättningstillväxt 5 år", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  { key: "revenueCagr10y", label: "Rev CAGR 10y", sv: "Omsättningstillväxt 10 år", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  {
    key: "earningsGrowth", label: "Earn gr 1y", sv: "Vinsttillväxt", unit: "pct",
    description: "Net income growth, last year. Compare with revenue growth.", rate: growthRate, ruleSource: "analysark",
  },
  { key: "earningsCagr3y", label: "Earn gr 3y", sv: "Vinsttillväxt 3 år", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  { key: "earningsCagr5y", label: "Earn gr 5y", sv: "Vinsttillväxt 5 år", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  { key: "earningsCagr10y", label: "Earn gr 10y", sv: "Vinsttillväxt 10 år", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  { key: "epsGrowth", label: "EPS gr 1y", sv: "EPS-tillväxt", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  { key: "epsCagr3y", label: "EPS gr 3y", sv: "EPS-tillväxt 3 år", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  { key: "epsCagr5y", label: "EPS gr 5y", sv: "EPS-tillväxt 5 år", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  { key: "epsCagr10y", label: "EPS gr 10y", sv: "EPS-tillväxt 10 år", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  { key: "ebitdaGrowth", label: "EBITDA gr 1y", sv: "EBITDA-tillväxt", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  { key: "ebitdaCagr3y", label: "EBITDA gr 3y", sv: "EBITDA-tillväxt 3 år", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  { key: "ebitdaCagr5y", label: "EBITDA gr 5y", sv: "EBITDA-tillväxt 5 år", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  { key: "ebitdaCagr10y", label: "EBITDA gr 10y", sv: "EBITDA-tillväxt 10 år", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  {
    key: "operatingIncomeGrowth", label: "EBIT gr 1y", sv: "Rörelseresultat (tillväxt)", unit: "pct", description: "Operating profit growth, last year.",
    rate: { good: any({ gte: 20 }), bad: any({ lt: 0 }) }, ruleSource: "analysark",
  },

  // ---- own assessments (0–3) ----
  { key: "manual.trendSector", label: "Trend sector", sv: "Trend – sektor", unit: "level", description: "Long-term trend for the sector." },
  { key: "manual.trendIndustry", label: "Trend industry", sv: "Trend – bransch", unit: "level" },
  { key: "manual.outlook", label: "Outlook", sv: "Framtidsutsikter", unit: "level", description: "Do the company's products and services have a bright future?" },
  { key: "manual.newsflow", label: "News", sv: "Nyhetsläge", unit: "level", description: "Are problems temporary, or is the company in deep trouble?" },
  { key: "manual.management", label: "Management", sv: "Ledningen", unit: "level", description: "Open and communicative is good." },
  { key: "manual.annualReport", label: "Annual report", sv: "Årsredovisning", unit: "level", description: "Does the annual report leave a good impression?" },
  { key: "manual.insiders", label: "Insiders", sv: "Insiderregister", unit: "level", description: "Are insiders buying more shares?" },
  {
    key: "manual.ownership", label: "Ownership", sv: "Ägarstruktur", unit: "level",
    description: "Management owns a meaningful stake; well-known institutional investors are among the owners.",
  },
  { key: "manual.overall", label: "Overall", sv: "Helhetsbedömning", unit: "level" },
];

export const METRIC_BY_KEY = new Map<string, MetricDef>(METRICS.map((m) => [m.key, m]));

/** Level texts for own assessments (index = value 0–3). */
export const MANUAL_LEVELS: Record<ManualKey, [string, string, string, string]> = {
  trendSector: ["Negative", "Neutral", "Positive", "Strongly positive"],
  trendIndustry: ["Negative", "Neutral", "Positive", "Strongly positive"],
  outlook: ["No idea", "Not sure, maybe", "A stable company", "I really believe in this one"],
  newsflow: ["Deep crisis", "Problems", "Neutral", "Positive"],
  management: ["Poor", "Unsure", "Good", "Very good"],
  annualReport: ["Bad feeling", "Unsure", "Good feeling", "Very good feeling"],
  insiders: ["Selling", "Nothing to see", "Buying a little", "Buying a lot"],
  ownership: ["Weak", "Unsure", "Good", "Very good"],
  overall: ["Weak", "Average", "Good", "Very good"],
};

export interface MetricSource {
  fundamentals: Fundamentals;
  metrics: Metrics;
  meta?: StockMeta;
}

/** The value of any metric for one stock, or null. */
export function metricValue(src: MetricSource, key: MetricKey): number | null {
  let v: unknown;
  if (key.startsWith("manual.")) v = src.meta?.assessments?.[key.slice(7)];
  else if (key in src.metrics) v = src.metrics[key as keyof Metrics];
  else v = src.fundamentals[key as FundamentalKey];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Traffic light for a value, or null when the metric has no rule. */
export function rate(key: MetricKey, v: number | null | undefined): Rating | null {
  const def = METRIC_BY_KEY.get(key);
  if (!def?.rate || v == null || !Number.isFinite(v)) return null;
  if (def.rate.skipZero && v === 0) return null;
  if (def.rate.good.some((t) => passes(v, t))) return "good";
  if (def.rate.bad.some((t) => passes(v, t))) return "bad";
  return "ok";
}
