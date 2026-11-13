// Column names in screener exports (Börsdata, Excel sheets of your own…)
// and what they map to. Swedish and English. Matching ignores case,
// å/ä/ö, spaces and punctuation, and reads "5 år", "5år", "5y" and
// "5 years" as the same thing (see `normaliseHeader`).
//
// None of these have been checked against a real Börsdata export yet: they
// come from Börsdata's KPI names in the API and the spreadsheets. When a
// name is confirmed, add it to VERIFIED_HEADERS (and the README table).
import type { ImportTarget } from "./types";

type Family = "revenue" | "earnings" | "eps" | "ebitda" | "dividend";

/** Stems for growth figures; a horizon ("3 år", "5y", "10 years") is appended. */
const GROWTH_STEMS: Record<Family, string[]> = {
  revenue: ["Omsättningstillväxt", "Omsättning tillväxt", "Försäljningstillväxt", "Revenue Growth", "Sales Growth", "Revenue CAGR"],
  earnings: ["Vinsttillväxt", "Vinst tillväxt", "Nettoresultat tillväxt", "Earnings Growth", "Net Income Growth", "Earnings CAGR"],
  eps: ["EPS-tillväxt", "EPS tillväxt", "Vinst/aktie tillväxt", "Vinst per aktie tillväxt", "EPS Growth", "EPS CAGR"],
  ebitda: ["EBITDA-tillväxt", "EBITDA tillväxt", "EBITDA Growth", "EBITDA CAGR"],
  dividend: ["Utdelningstillväxt", "Utdelning tillväxt", "Utdelning/aktie tillväxt", "Dividend Growth", "Dividend CAGR"],
};

const growth = (family: Family) => {
  const stems = GROWTH_STEMS[family];
  return {
    [`${family}Growth`]: [...stems, ...stems.map((s) => `${s} 1 år`)],
    [`${family}Cagr3y`]: stems.map((s) => `${s} 3 år`),
    [`${family}Cagr5y`]: stems.map((s) => `${s} 5 år`),
    [`${family}Cagr10y`]: stems.map((s) => `${s} 10 år`),
  } as Partial<Record<ImportTarget, string[]>>;
};

export const IMPORT_SYNONYMS: Partial<Record<ImportTarget, string[]>> = {
  // ---- identifiers ----
  "id.ticker": ["Ticker", "Kortnamn", "Symbol", "Short Name", "Tickersymbol"],
  "id.name": ["Bolag", "Bolagsnamn", "Namn", "Företag", "Company", "Company Name", "Name", "Instrument"],
  "id.isin": ["ISIN", "ISIN-kod", "ISIN Code"],

  // ---- dividends ----
  dividendYield: ["Direktavkastning", "Direktavk", "Dividend Yield", "Yield"],
  payoutRatio: ["Utdelningsandel", "Payout Ratio", "Dividend Payout", "Payout"],
  dividendPerShare: ["Utdelning/aktie", "Utdelning per aktie", "Utdelning", "Dividend/Share", "Dividend per Share", "DPS"],
  dividendYearsPaid: ["Antal år med utdelning", "År med utdelning", "Years with Dividend"],
  dividendYearsNoCut: ["Antal år utan sänkning", "År utan sänkning", "Years without Cut"],
  dividendYearsRaised: ["Antal år med höjning", "År med höjning", "Utdelningshöjningar i rad", "Years of Dividend Growth"],
  ...growth("dividend"),

  // ---- valuation ----
  pe: ["P/E", "PE", "P/E-tal", "Price/Earnings"],
  forwardPe: ["P/E (fwd)", "Forward P/E", "P/E prognos", "P/E-tal prognos"],
  peg: ["PEG", "PEG-tal", "PEG Ratio"],
  ps: ["P/S", "PS", "P/S-tal", "Price/Sales"],
  pb: ["P/B", "PB", "P/B-tal", "P/EK", "Price/Book"],
  evEbit: ["EV/EBIT"],
  evEbitda: ["EV/EBITDA"],
  fcfYield: ["FCF-avkastning", "FCF-yield", "FCF yield", "FCF Yield", "Free Cash Flow Yield"],
  marketCap: ["Börsvärde", "Marknadsvärde", "Market Cap", "Market Capitalization"],
  eps: ["Vinst/aktie", "Vinst per aktie", "EPS", "Earnings/Share", "Earnings per Share"],

  // ---- profitability ----
  roe: ["ROE", "Avkastning på eget kapital", "Return on Equity"],
  roa: ["ROA", "Avkastning på totalt kapital", "Return on Assets"],
  roic: ["ROIC", "Avkastning på investerat kapital", "Return on Invested Capital"],
  profitMargin: ["Vinstmarginal", "Nettomarginal", "Profit Margin", "Net Margin"],
  operatingMargin: ["Rörelsemarginal", "EBIT-marginal", "Operating Margin", "EBIT Margin"],
  ebitdaMargin: ["EBITDA-marginal", "EBITDA Margin"],
  fcfMargin: ["FCF-marginal", "Kassaflödesmarginal", "FCF Margin"],

  // ---- balance sheet & risk ----
  quickRatio: ["Kassalikviditet", "Quick Ratio"],
  debtToEquity: ["Skuldsättningsgrad", "Debt/Equity", "D/E"],
  equityRatio: ["Soliditet", "Equity Ratio"],
  netDebtEbitda: ["Nettoskuld/EBITDA", "Net Debt/EBITDA", "ND/EBITDA"],
  beta: ["Beta"],

  // ---- growth ----
  ...growth("revenue"),
  ...growth("earnings"),
  ...growth("eps"),
  ...growth("ebitda"),
  operatingIncomeGrowth: ["Rörelseresultat tillväxt", "Rörelseresultattillväxt", "EBIT-tillväxt", "EBIT tillväxt", "EBIT Growth", "Operating Income Growth"],
};

/**
 * Header names confirmed against a real export, per source. Empty until
 * someone imports an actual Börsdata file; the README lists the same.
 */
export const VERIFIED_HEADERS: Record<string, string[]> = {
  borsdata: [],
};

/** Words that only describe the period or a unit and say nothing about which figure it is. */
const NOISE = /\b(senaste|latest|last|ttm|r12|rullande|rolling|nuvarande|current)\b/g;

/**
 * Comparable form of a header: lower case, å/ä/ö folded, horizons as
 * "<n>y", and everything but letters and digits removed.
 * "Vinsttillväxt - 5 år" → "vinsttillvaxt5y", "P/E" → "pe".
 */
export function normaliseHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[()[\]]/g, " ")
    .replace(/%|\b(msek|mkr|mnkr|tkr|ksek|sek|mdkr)\b/g, " ") // units: "Börsvärde (MSEK)" is still "Börsvärde"
    .replace(NOISE, " ")
    .replace(/(\d+)\s*-?\s*(ar|years?|yrs?|y)\b/g, "$1y")
    .replace(/[^a-z0-9]/g, "");
}

let lookup: Map<string, ImportTarget> | undefined;

/** Normalised synonym → target. Built once. */
export function synonymLookup(): Map<string, ImportTarget> {
  if (lookup) return lookup;
  lookup = new Map();
  for (const [target, names] of Object.entries(IMPORT_SYNONYMS) as [ImportTarget, string[]][]) {
    for (const n of names) {
      const k = normaliseHeader(n);
      if (!lookup.has(k)) lookup.set(k, target);
    }
  }
  return lookup;
}

/** Scale implied by a unit in the header itself: "Börsvärde (MSEK)" → 1e6. */
export function headerScale(h: string): number | undefined {
  const s = h.toLowerCase();
  if (/\b(msek|mkr|mnkr|meur|musd|mn|mln|millions?|miljoner)\b/.test(s)) return 1e6;
  if (/\b(mdkr|mdsek|bn|billions?|miljarder)\b/.test(s)) return 1e9;
  if (/\b(tkr|ksek|tusen|thousands?)\b/.test(s)) return 1e3;
  return undefined;
}
