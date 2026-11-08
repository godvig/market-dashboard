import type { Candle, Fundamentals, HistoryRange, Quote, SearchResult } from "../../shared/types";

/**
 * A market-data source. Add a new API by implementing this interface and
 * registering it in providers/index.ts. Optional methods fall back to the
 * fallback provider (Yahoo by default) when missing.
 */
export interface MarketProvider {
  name: string;
  getQuotes(symbols: string[]): Promise<Quote[]>;
  getHistory?(symbol: string, range: HistoryRange): Promise<Candle[]>;
  search?(query: string): Promise<SearchResult[]>;
  /** Dividend data, payout ratio etc. Used to fill gaps in the quote. */
  getFundamentals?(symbol: string): Promise<Fundamentals>;
}

/** Converts a fraction (0.42) to percent (42), keeping undefined. */
export const toPct = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v * 100 : undefined;

export const rangeToDays: Record<HistoryRange, number> = {
  "6mo": 183,
  "1y": 366,
  "2y": 731,
  "5y": 1827,
};

export function startDate(range: HistoryRange): Date {
  return new Date(Date.now() - rangeToDays[range] * 86_400_000);
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
  return (await res.json()) as T;
}
