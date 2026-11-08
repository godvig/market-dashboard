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
}

/** Slow-changing data, fetched separately and cached for hours. */
export interface Fundamentals {
  dividendYield?: number; // percent
  payoutRatio?: number; // percent
  dividendPerShare?: number;
  pe?: number;
}

export interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
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
  error?: string;
}
