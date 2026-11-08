// Growth and dividend-history figures computed from yearly values.
// Pure functions, used by providers that deliver raw annual data (Yahoo).
import type { Fundamentals } from "./types";

export interface YearValue {
  year: number;
  value: number;
}

/**
 * Growth in percent from `years` years before the latest value to the
 * latest. 1 year = plain growth; more = compound annual growth (CAGR).
 * Null when the data doesn't reach back far enough or the start value
 * isn't positive (a CAGR from a loss is meaningless).
 */
export function growth(series: YearValue[], years: number): number | null {
  const sorted = [...series].filter((p) => Number.isFinite(p.value)).sort((a, b) => a.year - b.year);
  const last = sorted[sorted.length - 1];
  if (!last) return null;
  const first = sorted.find((p) => p.year === last.year - years);
  if (!first) return null;
  if (years === 1) {
    if (first.value === 0) return null;
    // From a loss: change relative to the size of the loss, so improving is positive.
    return ((last.value - first.value) / Math.abs(first.value)) * 100;
  }
  if (first.value <= 0 || last.value <= 0) return null;
  return ((last.value / first.value) ** (1 / years) - 1) * 100;
}

/** Growth for 1, 3, 5 and 10 years under one prefix, e.g. revenueGrowth, revenueCagr3y… */
export function growthSet(
  series: YearValue[],
  prefix: "revenue" | "earnings" | "eps" | "ebitda" | "dividend",
): Fundamentals {
  const out: Fundamentals = {};
  const put = (key: string, v: number | null) => {
    if (v != null && Number.isFinite(v)) (out as Record<string, number>)[key] = v;
  };
  put(`${prefix}Growth`, growth(series, 1));
  put(`${prefix}Cagr3y`, growth(series, 3));
  put(`${prefix}Cagr5y`, growth(series, 5));
  put(`${prefix}Cagr10y`, growth(series, 10));
  return out;
}

/**
 * Sums dividend payments per calendar year. The current year is left out
 * while it's incomplete, so a half-paid year doesn't look like a cut.
 */
export function dividendsByYear(payments: { date: Date | string; amount: number }[], today = new Date()): YearValue[] {
  const byYear = new Map<number, number>();
  for (const p of payments) {
    const year = new Date(p.date).getUTCFullYear();
    if (!(p.amount > 0) || year >= today.getUTCFullYear()) continue;
    byYear.set(year, (byYear.get(year) ?? 0) + p.amount);
  }
  // Fill gap years with 0 so a skipped dividend counts as a cut.
  const years = [...byYear.keys()];
  if (!years.length) return [];
  const out: YearValue[] = [];
  for (let y = Math.min(...years); y <= Math.max(...years); y++) out.push({ year: y, value: byYear.get(y) ?? 0 });
  return out;
}

/**
 * Dividend track record, counted backwards from the latest complete year:
 * years in a row with a dividend, without a cut, and with a raise.
 * Changes within ±1 % count as unchanged (rounding, currency effects).
 */
export function dividendRecord(years: YearValue[], lastCompleteYear = new Date().getUTCFullYear() - 1): Fundamentals {
  const v = new Map(years.map((p) => [p.year, p.value]));
  let paid = 0;
  let noCut = 0;
  let raised = 0;
  let paidOpen = true;
  let noCutOpen = true;
  let raisedOpen = true;
  for (let y = lastCompleteYear; v.has(y); y--) {
    const cur = v.get(y)!;
    const prev = v.get(y - 1);
    if (paidOpen && cur > 0) paid++;
    else paidOpen = false;
    if (prev == null) break;
    if (noCutOpen && cur > 0 && cur >= prev * 0.99) noCut++;
    else noCutOpen = false;
    if (raisedOpen && cur > prev * 1.01) raised++;
    else raisedOpen = false;
    if (!paidOpen && !noCutOpen && !raisedOpen) break;
  }
  return { dividendYearsPaid: paid, dividendYearsNoCut: noCut, dividendYearsRaised: raised };
}
