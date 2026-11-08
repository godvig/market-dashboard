import type { Candle, HistoryRange, SearchResult, WatchlistRow } from "../shared/types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? res.statusText);
  return body as T;
}

export const api = {
  health: () => get<{ provider: string; fallback: string }>("/api/health"),
  watchlist: (symbols: string[]) =>
    get<WatchlistRow[]>(`/api/watchlist?symbols=${encodeURIComponent(symbols.join(","))}`),
  history: (symbol: string, range: HistoryRange) =>
    get<Candle[]>(`/api/history/${encodeURIComponent(symbol)}?range=${range}`),
  search: (q: string) => get<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
};
