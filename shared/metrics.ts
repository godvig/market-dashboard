// Registry of every metric the app can show, colour or score.
// Descriptions (sv) and most traffic-light thresholds come from the
// "Analysark" / "Allmän snurra" spreadsheets; `ruleSource` says which.
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
  /** Swedish name, as in the spreadsheets. */
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
    description: "Årlig utdelning / aktiekurs.",
    rate: { good: any({ gte: 4 }), bad: any({ lt: 2 }), skipZero: true }, ruleSource: "analysark",
  },
  {
    key: "payoutRatio", label: "Payout", sv: "Utdelningsandel", unit: "pct",
    description: "Andel av vinsten som delas ut. 30–70 % är standard på Stockholmsbörsen. Inte över 80 %.",
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
    description: "Utdelningarna har höjts mer sällan men aldrig eller nästan aldrig sänkts.",
    rate: { good: any({ gte: 10 }), bad: any({ lt: 1 }) }, ruleSource: "analysark",
  },
  {
    key: "dividendYearsRaised", label: "Yrs raised", sv: "Antal år med höjningar", unit: "years",
    description: "Utdelningarna har höjts ofta, nästan varje år.",
    rate: { good: any({ gte: 10 }), bad: any({ lt: 1 }) }, ruleSource: "analysark",
  },

  // ---- valuation ----
  {
    key: "pe", label: "P/E", sv: "P/E-tal", unit: "x",
    description: "Förhållande mellan aktiepris och dess vinst. Stabilt P/E brukar ligga på 10–15. Desto lägre under 20, desto större potential.",
    rate: { good: any({ gte: 0, lt: 10 }), bad: any({ gte: 25 }, { lt: 0 }) }, ruleSource: "analysark",
  },
  {
    key: "forwardPe", label: "Fwd P/E", sv: "P/E (prognos)", unit: "x",
    rate: { good: any({ gte: 0, lt: 10 }), bad: any({ gte: 25 }, { lt: 0 }) }, ruleSource: "analysark",
  },
  {
    key: "peg", label: "PEG", sv: "PEG-tal", unit: "x",
    description: "P/E i förhållande till vinsttillväxten. Under 1: potentiellt undervärderad, 1–1,5: rimligt värderad, över 2,5: tydligt övervärderad.",
    rate: { good: any({ gte: 0, lt: 1 }), bad: any({ gte: 2.5 }, { lt: 0 }) }, ruleSource: "analysark",
  },
  {
    key: "ps", label: "P/S", sv: "P/S-tal", unit: "x", description: "Viktigt vid startup- och tillväxtföretag.",
    rate: { good: any({ gte: 0, lt: 1 }), bad: any({ gte: 4 }, { lt: 0 }) }, ruleSource: "analysark",
  },
  {
    key: "pb", label: "P/B", sv: "P/B-tal", unit: "x", description: "Aktiepris i förhållande till eget kapital per aktie.",
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
    key: "marketCap", label: "Mkt cap", sv: "Börsvärde", unit: "amount",
    description:
      "Mindre bolag kan ha större potential för tillväxt men också högre risk; större bolag större stabilitet men mindre tillväxtpotential.",
  },
  { key: "eps", label: "EPS", sv: "Vinst/aktie", unit: "amount", rate: { good: [], bad: any({ lt: 0 }) }, ruleSource: "default" },

  // ---- profitability ----
  {
    key: "roe", label: "ROE", sv: "Avkastning på eget kapital", unit: "pct", description: "Lönsamhet och effektivitet.",
    rate: { good: any({ gte: 20 }), bad: any({ lt: 5 }) }, ruleSource: "analysark",
  },
  {
    key: "roa", label: "ROA", sv: "Räntabilitet", unit: "pct", description: "Hur stor avkastning på investerat kapital.",
    rate: { good: any({ gte: 15 }), bad: any({ lt: 5 }) }, ruleSource: "analysark",
  },
  {
    key: "profitMargin", label: "Margin", sv: "Vinstmarginal", unit: "pct",
    description: "Förmåga att hantera sina kostnader och generera vinst. Nettoresultat / omsättning.",
    rate: { good: any({ gte: 20 }), bad: any({ lt: 5 }) }, ruleSource: "analysark",
  },
  {
    key: "operatingMargin", label: "Op margin", sv: "Rörelsemarginal", unit: "pct",
    description: "Förmåga att täcka sina rörelsekostnader och investera i framtida tillväxt.",
    rate: { good: any({ gte: 20 }), bad: any({ lt: 10 }) }, ruleSource: "analysark",
  },
  {
    key: "ebitdaMargin", label: "EBITDA mgn", sv: "EBITDA-marginal", unit: "pct", description: "Justerat rörelseresultat som andel av omsättningen.",
    rate: { good: any({ gte: 20 }), bad: any({ lt: 5 }) }, ruleSource: "analysark",
  },
  {
    key: "fcfMargin", label: "FCF", sv: "Fritt kassaflöde (/omsättning)", unit: "pct",
    description: "Kassaflöde från den löpande verksamheten minus investeringar, som andel av omsättningen.",
    rate: { good: any({ gte: 5 }), bad: any({ lt: -5 }) }, ruleSource: "analysark",
  },

  // ---- balance sheet & risk ----
  {
    key: "quickRatio", label: "Quick", sv: "Kassalikviditet", unit: "x", description: "Förmåga att betala kortfristiga skulder.",
    rate: { good: any({ gte: 1.5 }), bad: any({ lt: 1 }) }, ruleSource: "analysark",
  },
  {
    key: "debtToEquity", label: "D/E", sv: "Skuldsättningsgrad", unit: "x",
    description: "Finansiell risk, förmåga att hantera sin skuld. Skulder / eget kapital.",
    rate: { good: any({ gte: 0, lt: 0.5 }), bad: any({ gte: 2 }, { lt: 0 }) }, ruleSource: "analysark",
  },
  {
    key: "equityRatio", label: "Equity ratio", sv: "Soliditet", unit: "pct",
    description: "Mått på ekonomisk stabilitet – hur mycket av tillgångarna som finansieras med eget kapital.",
    rate: { good: any({ gte: 50 }), bad: any({ lt: 20 }) }, ruleSource: "analysark",
  },
  {
    key: "netDebtEbitda", label: "ND/EBITDA", sv: "Nettoskuld/EBITDA", unit: "x",
    rate: { good: any({ lt: 1 }), bad: any({ gte: 3 }) }, ruleSource: "default",
  },
  {
    key: "beta", label: "Beta", sv: "Beta", unit: "x", description: "En aktie med ett betatal över 1 är mer riskfylld, mer volatil, än börsen.",
    rate: { good: any({ lt: 0.8 }), bad: any({ gt: 1 }) }, ruleSource: "analysark",
  },
  {
    key: "volatility", label: "Vol", sv: "Volatilitet", unit: "pct", description: "Risk på kort sikt. Årlig standardavvikelse, senaste året.",
    rate: { good: any({ lt: 20 }), bad: any({ gte: 40 }) }, ruleSource: "default",
  },
  {
    key: "sharpe", label: "Sharpe", sv: "Sharpekvot", unit: "x",
    description: "Riskjusterad avkastning: hur mycket avkastning som genererats i förhållande till hur hög risk som tagits.",
    rate: { good: any({ gt: 1.5 }), bad: any({ lt: 1 }) }, ruleSource: "analysark",
  },

  // ---- growth ----
  { key: "revenueGrowth", label: "Rev gr 1y", sv: "Omsättningstillväxt", unit: "pct", description: "Förmåga att öka intäkterna över tid.", rate: growthRate, ruleSource: "analysark" },
  {
    key: "revenueCagr3y", label: "Rev CAGR 3y", sv: "CAGR omsättning (3 år)", unit: "pct",
    rate: { good: any({ gte: 10 }), bad: any({ lt: -5 }) }, ruleSource: "analysark",
  },
  { key: "revenueCagr5y", label: "Rev CAGR 5y", sv: "Omsättningstillväxt 5 år", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  { key: "revenueCagr10y", label: "Rev CAGR 10y", sv: "Omsättningstillväxt 10 år", unit: "pct", rate: growthRate, ruleSource: "analysark" },
  {
    key: "earningsGrowth", label: "Earn gr 1y", sv: "Vinsttillväxt", unit: "pct",
    description: "Hur hälsosam är utvecklingstakten för vinsten i förhållande till omsättningen?", rate: growthRate, ruleSource: "analysark",
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
    key: "operatingIncomeGrowth", label: "EBIT gr 1y", sv: "Rörelseresultat (tillväxt)", unit: "pct", description: "Lönsamt?",
    rate: { good: any({ gte: 20 }), bad: any({ lt: 0 }) }, ruleSource: "analysark",
  },

  // ---- own assessments (0–3) ----
  { key: "manual.trendSector", label: "Trend sector", sv: "Trend – sektor", unit: "level", description: "Sektorns långsiktiga trend." },
  { key: "manual.trendIndustry", label: "Trend industry", sv: "Trend – bransch", unit: "level" },
  { key: "manual.outlook", label: "Outlook", sv: "Framtidsutsikter", unit: "level", description: "Ser det ljust ut för bolagets produkter och tjänster?" },
  { key: "manual.newsflow", label: "News", sv: "Nyhetsläge", unit: "level", description: "Är problem tillfälliga eller är bolaget i djup kris?" },
  { key: "manual.management", label: "Management", sv: "Ledningen", unit: "level", description: "Öppen och kommunikativ är bra." },
  { key: "manual.annualReport", label: "Annual report", sv: "Årsredovisning", unit: "level", description: "Bra känsla?" },
  { key: "manual.insiders", label: "Insiders", sv: "Insiderregister", unit: "level", description: "Köper insynspersonerna fler aktier?" },
  {
    key: "manual.ownership", label: "Ownership", sv: "Ägarstruktur", unit: "level",
    description: "Ledning med betydande ägarandel, namnkunniga institutionella investerare såsom fonder har ägarandelar i bolaget.",
  },
  { key: "manual.overall", label: "Overall", sv: "Helhetsbedömning", unit: "level" },
];

export const METRIC_BY_KEY = new Map<string, MetricDef>(METRICS.map((m) => [m.key, m]));

/** Level texts for own assessments (index = value 0–3). */
export const MANUAL_LEVELS: Record<ManualKey, [string, string, string, string]> = {
  trendSector: ["Negativ", "Neutral", "Positiv", "Stark positiv"],
  trendIndustry: ["Negativ", "Neutral", "Positiv", "Stark positiv"],
  outlook: ["Jag vet inte alls", "Vet inte men kanske", "Det är en stabil aktie", "Jag tror mycket på detta bolaget"],
  newsflow: ["Djup kris", "Problem", "Neutralt", "Positivt"],
  management: ["Dålig", "Osäker", "Bra", "Mycket bra"],
  annualReport: ["Dålig känsla", "Osäker", "Bra känsla", "Mycket bra känsla"],
  insiders: ["Säljer", "Inget att se", "Köper lite", "Köper mycket"],
  ownership: ["Svag", "Osäker", "Bra", "Mycket bra"],
  overall: ["Svag", "Medel", "Bra", "Mycket bra"],
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
