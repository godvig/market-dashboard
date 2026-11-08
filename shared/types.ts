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
 * Slow-changing key figures, fetched separately and cached for hours.
 * Percent values are in percent (12.5 = 12.5 %). Amounts are in the
 * listing currency.
 */
export interface Fundamentals {
  dividendYield?: number;
  payoutRatio?: number;
  dividendPerShare?: number;
  pe?: number;
  forwardPe?: number;
  ps?: number;
  pb?: number;
  evEbit?: number;
  evEbitda?: number;
  roe?: number;
  profitMargin?: number;
  revenueGrowth?: number;
  netDebtEbitda?: number;
  beta?: number;
  marketCap?: number;
}

export const FUNDAMENTAL_KEYS: (keyof Fundamentals)[] = [
  "dividendYield", "payoutRatio", "dividendPerShare", "pe", "forwardPe", "ps", "pb", "evEbit",
  "evEbitda", "roe", "profitMargin", "revenueGrowth", "netDebtEbitda", "beta", "marketCap",
];

export interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
  /** Category in the sidebar; undefined = uncategorised. */
  groupId?: string;
}

export interface ListGroup {
  id: string;
  name: string;
  collapsed?: boolean;
}

/** Everything the user saves: categories, lists (in sidebar order) and table columns. */
export interface UserStore {
  version: 2;
  groups: ListGroup[];
  lists: Watchlist[];
  /** Visible column ids, in order. Undefined = defaults. */
  columns?: string[];
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
  error?: string;
}

export interface Health {
  provider: string;
  fallback: string;
  baseCurrency: string;
}
