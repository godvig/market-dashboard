import type { Scorecard } from "./scoring";
// Types shared by the server and the web client.

export interface Quote {
  symbol: string;
  name: string;
  currency: string;
  exchange?: string;
  price: number;
  change: number;
  changePct: number;
  volume?: number;
  marketCap?: number;
  pe?: number;
  dividendYield?: number; // percent, e.g. 2.4 = 2.4 %
  payoutRatio?: number; // percent of earnings paid out as dividends
  dividendPerShare?: number; // annual, in the listing currency
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  sector?: string;
  /** Which provider delivered the quote (differs from the primary when it fell back). */
  source?: string;
}

/**
 * Every key figure the app knows, in one list. Percent values are in
 * percent (12.5 = 12.5 %), multiples as plain numbers (P/E 14.2), amounts
 * in the listing currency. Growth keys: "…Growth" = latest year,
 * "…Cagr3y/5y/10y" = compound annual growth over that many years.
 */
export const FUNDAMENTAL_KEYS = [
  // dividends
  "dividendYield", "payoutRatio", "dividendPerShare",
  "dividendGrowth", "dividendCagr3y", "dividendCagr5y", "dividendCagr10y",
  "dividendYearsPaid", "dividendYearsNoCut", "dividendYearsRaised",
  // valuation
  "pe", "forwardPe", "peg", "ps", "pb", "evEbit", "evEbitda", "fcfYield", "marketCap", "eps",
  // profitability
  "roe", "roa", "roic", "profitMargin", "operatingMargin", "ebitdaMargin", "fcfMargin",
  // balance sheet & risk
  "quickRatio", "debtToEquity", "equityRatio", "netDebtEbitda", "beta",
  // growth
  "revenueGrowth", "revenueCagr3y", "revenueCagr5y", "revenueCagr10y",
  "earningsGrowth", "earningsCagr3y", "earningsCagr5y", "earningsCagr10y",
  "epsGrowth", "epsCagr3y", "epsCagr5y", "epsCagr10y",
  "ebitdaGrowth", "ebitdaCagr3y", "ebitdaCagr5y", "ebitdaCagr10y",
  "operatingIncomeGrowth",
] as const;

export type FundamentalKey = (typeof FUNDAMENTAL_KEYS)[number];

/** Slow-changing key figures, fetched separately and cached for hours. */
export type Fundamentals = Partial<Record<FundamentalKey, number>>;

/** A stock's own data that the user keeps: classification, notes, own assessments. */
export interface StockMeta {
  name?: string;
  sector?: string;
  niche?: string;
  country?: string;
  /** Your own label, e.g. "Golden horse", "Silver horse", "Nostalgic horse". */
  investmentType?: string;
  note?: string;
  /** Manual criteria (e.g. "trendSector"), 0–3 where 3 is best. */
  assessments?: Record<string, number>;
}

export interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
  /** Category in the sidebar; undefined = uncategorised. */
  groupId?: string;
  /** Scorecard the list is ranked by ("lens"); undefined = no ranking. */
  scorecardId?: string;
}

export interface ListGroup {
  id: string;
  name: string;
  collapsed?: boolean;
}

export interface UserSettings {
  trafficLights?: boolean;
  /** Interpolate scores between tiers (default) instead of the spreadsheet's hard steps. */
  smoothScoring?: boolean;
  /** Percent (0–100) of a scorecard's points that must have data before a score is shown. Default 60. */
  minCoverage?: number;
  /** Imported key figures older than this many days lose to the API. Default 120. */
  importMaxAgeDays?: number;
  /** Period of the "score change" column, in days. Default 91 (3 months). */
  trendDays?: number;
}

/** One key figure imported from a file (e.g. a Börsdata screener export). */
export interface ImportedValue {
  v: number;
  /** Where it came from: "import: <filename>". */
  src: string;
  /** Import date, YYYY-MM-DD. */
  at: string;
}

export type ImportedFigures = Partial<Record<FundamentalKey, ImportedValue>>;

/** What a file column holds: a key figure or a way to identify the company. */
export type ImportTarget = FundamentalKey | "id.ticker" | "id.name" | "id.isin";

/** A column mapping, saved per header set so the next export of the same screener imports in one click. */
export interface ImportMapping {
  headers: string[];
  /** Per column (same order as `headers`); null = ignored. */
  columns: (ImportTarget | null)[];
  /** Scale factor per column index where the user overrode the detected one. */
  scales?: Record<number, number>;
  /** Exchange suffix for bare tickers ("VOLV B" → "VOLV-B" + suffix). */
  suffix?: string;
}

/** Everything the user saves: categories, lists (in sidebar order) and table columns. */
export interface UserStore {
  version: 2;
  groups: ListGroup[];
  lists: Watchlist[];
  /** Visible column ids, in order. Undefined = defaults. */
  columns?: string[];
  /** Per-ticker data the user keeps (sector, notes, assessments). Never sent anywhere but the local server. */
  stocks?: Record<string, StockMeta>;
  settings?: UserSettings;
  /** Key figures imported from files, per symbol. Kept apart from provider data and never sent anywhere but the local server. */
  imported?: Record<string, ImportedFigures>;
  /** Saved column mappings, keyed by a hash of the file's headers. */
  importMappings?: Record<string, ImportMapping>;
  /** Scorecards the user has built or copied; the presets live in shared/scoring.ts. */
  scorecards?: Scorecard[];
}

export interface Candle {
  time: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  type?: string;
}

export type HistoryRange = "6mo" | "1y" | "2y" | "5y";

export interface Metrics {
  ret1m: number | null;
  ret3m: number | null;
  ret6m: number | null;
  ret1y: number | null;
  retYtd: number | null;
  volatility: number | null; // annualised, percent
  maxDrawdown: number | null; // percent, negative
  rsi14: number | null;
  sma50: number | null;
  sma200: number | null;
  vsSma200: number | null; // percent above/below SMA200
  fromHigh: number | null; // percent below 52w high (<= 0)
  sharpe: number | null; // 1-year Sharpe ratio (excess return / volatility)
}

export interface WatchlistRow {
  quote: Quote;
  metrics: Metrics;
  /**
   * Multiply an amount in the quote's currency by this to get the base
   * currency (e.g. SEK). Null when no exchange rate was found.
   */
  fx: number | null;
  /** Key figures merged from the providers (quote values fill the gaps). */
  fundamentals: Fundamentals;
  /** Where each key figure came from: a provider name or "import: <file> (date)". */
  sources?: Partial<Record<FundamentalKey, string>>;
  error?: string;
}

export interface Health {
  provider: string;
  fallback: string;
  baseCurrency: string;
}
