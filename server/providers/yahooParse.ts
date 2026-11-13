// Turns raw Yahoo responses into Fundamentals. Kept free of network calls
// so it can be tested with recorded/simulated data.
import { dividendRecord, dividendsByYear, growthSet, type YearValue } from "../../shared/history";
import type { Fundamentals } from "../../shared/types";
import { toPct } from "./types";

type Obj = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const ratio = (a: unknown, b: unknown) => {
  const x = num(a);
  const y = num(b);
  return x != null && y != null && y !== 0 ? x / y : undefined;
};

/** quoteSummary modules summaryDetail, defaultKeyStatistics, financialData. */
export function fromSummary(res: Obj): Fundamentals {
  const s = (res.summaryDetail ?? {}) as Obj;
  const k = (res.defaultKeyStatistics ?? {}) as Obj;
  const f = (res.financialData ?? {}) as Obj;
  const de = num(f.debtToEquity);
  // Net debt / EBITDA: meaningless when EBITDA is zero or negative.
  const ebitda = num(f.ebitda);
  const netDebt = num(f.totalDebt) != null ? num(f.totalDebt)! - (num(f.totalCash) ?? 0) : undefined;
  // FCF yield only when cash flow and market cap are in the same currency (not true for some ADRs).
  const sameCurrency = !f.financialCurrency || !s.currency || f.financialCurrency === s.currency;
  return {
    // Forward yield if Yahoo has one, otherwise trailing.
    dividendYield: toPct(s.dividendYield ?? s.trailingAnnualDividendYield),
    payoutRatio: toPct(s.payoutRatio),
    dividendPerShare: num(s.dividendRate ?? s.trailingAnnualDividendRate),
    pe: num(s.trailingPE),
    forwardPe: num(s.forwardPE ?? k.forwardPE),
    peg: num(k.pegRatio),
    ps: num(s.priceToSalesTrailing12Months),
    pb: num(k.priceToBook),
    evEbitda: num(k.enterpriseToEbitda),
    marketCap: num(s.marketCap),
    eps: num(k.trailingEps),
    roe: toPct(f.returnOnEquity),
    roa: toPct(f.returnOnAssets),
    profitMargin: toPct(f.profitMargins ?? k.profitMargins),
    operatingMargin: toPct(f.operatingMargins),
    ebitdaMargin: toPct(f.ebitdaMargins),
    fcfMargin: toPct(ratio(f.freeCashflow, f.totalRevenue)),
    fcfYield: sameCurrency ? toPct(ratio(f.freeCashflow, s.marketCap)) : undefined,
    netDebtEbitda: ebitda != null && ebitda > 0 && netDebt != null ? netDebt / ebitda : undefined,
    quickRatio: num(f.quickRatio),
    // Yahoo gives total debt / equity in percent; replaced below by total liabilities / equity when available.
    debtToEquity: de != null ? de / 100 : undefined,
    revenueGrowth: toPct(f.revenueGrowth),
    earningsGrowth: toPct(f.earningsGrowth),
    beta: num(s.beta ?? k.beta),
  };
}

/**
 * fundamentalsTimeSeries (type "annual", module "all"): rows per date and
 * statement. Gives multi-year growth, equity ratio and total-liabilities D/E.
 */
export function fromAnnual(rows: Obj[]): Fundamentals {
  const byYear = new Map<number, Obj>();
  for (const r of rows) {
    const d = r.date instanceof Date ? r.date : new Date(String(r.date));
    if (Number.isNaN(d.getTime())) continue;
    const y = d.getUTCFullYear();
    byYear.set(y, { ...(byYear.get(y) ?? {}), ...r });
  }
  const series = (...fields: string[]): YearValue[] =>
    [...byYear.entries()]
      .map(([year, r]) => ({ year, value: fields.map((f) => num(r[f])).find((v) => v != null) }))
      .filter((p): p is YearValue => p.value != null);

  const out: Fundamentals = {
    ...growthSet(series("totalRevenue"), "revenue"),
    ...growthSet(series("netIncome", "netIncomeCommonStockholders"), "earnings"),
    ...growthSet(series("dilutedEPS", "basicEPS"), "eps"),
    ...growthSet(series("EBITDA", "normalizedEBITDA"), "ebitda"),
  };
  const opInc = growthSet(series("operatingIncome", "EBIT"), "revenue").revenueGrowth;
  if (opInc != null) out.operatingIncomeGrowth = opInc;

  // Latest year that has a balance sheet.
  const latest = [...byYear.entries()].sort((a, b) => b[0] - a[0]).find(([, r]) => num(r.totalAssets) != null)?.[1];
  if (latest) {
    const eq = num(latest.stockholdersEquity ?? latest.commonStockEquity);
    const equityRatio = toPct(ratio(eq, latest.totalAssets));
    if (equityRatio != null) out.equityRatio = equityRatio;
    // Skuldsättningsgrad as in the spreadsheet: total liabilities / equity.
    const de = ratio(latest.totalLiabilitiesNetMinorityInterest, eq);
    if (de != null) out.debtToEquity = de;
  }
  const latestFcf = [...byYear.entries()].sort((a, b) => b[0] - a[0]).find(([, r]) => num(r.freeCashFlow) != null && num(r.totalRevenue) != null)?.[1];
  if (latestFcf) out.fcfMargin = toPct(ratio(latestFcf.freeCashFlow, latestFcf.totalRevenue));
  const roic = returnOnInvestedCapital(byYear);
  if (roic != null) out.roic = roic;
  return out;
}

/**
 * ROIC for the latest year with an operating result: EBIT after tax /
 * invested capital (equity + debt − cash). Uses Yahoo's tax rate, else 20 %.
 */
function returnOnInvestedCapital(byYear: Map<number, Obj>): number | undefined {
  for (const [, r] of [...byYear.entries()].sort((a, b) => b[0] - a[0])) {
    const ebit = num(r.EBIT) ?? num(r.operatingIncome);
    if (ebit == null) continue;
    const invested =
      num(r.investedCapital) ??
      (() => {
        const eq = num(r.stockholdersEquity ?? r.commonStockEquity);
        return eq != null ? eq + (num(r.totalDebt) ?? 0) - (num(r.cashAndCashEquivalents) ?? 0) : undefined;
      })();
    if (invested == null || invested <= 0) return undefined;
    const tax = num(r.taxRateForCalcs);
    const rate = tax != null && tax >= 0 && tax < 0.6 ? tax : 0.2;
    return toPct((ebit * (1 - rate)) / invested);
  }
  return undefined;
}

/** Dividend events from chart(): growth over 1/3/5/10 years and the track record. */
export function fromDividends(events: { date: Date | string; amount: number }[], today = new Date()): Fundamentals {
  const years = dividendsByYear(events, today);
  if (!years.length) return {};
  // Yearly growth needs the last complete year to have a dividend.
  return { ...growthSet(years, "dividend"), ...dividendRecord(years, today.getUTCFullYear() - 1) };
}

/** Keeps only finite numbers. */
export const clean = (f: Fundamentals): Fundamentals =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => typeof v === "number" && Number.isFinite(v)));
