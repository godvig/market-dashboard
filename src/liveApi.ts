import type { Snapshot } from "../shared/scoreHistory";
import type { Candle, Health, HistoryRange, SearchResult, UserStore, WatchlistRow } from "../shared/types";

async function get<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? res.statusText);
  return body as T;
}

export const liveApi = {
  health: () => get<Health>("/api/health"),
  watchlist: (symbols: string[]) =>
    get<WatchlistRow[]>(`/api/watchlist?symbols=${encodeURIComponent(symbols.join(","))}`),
  history: (symbol: string, range: HistoryRange) =>
    get<Candle[]>(`/api/history/${encodeURIComponent(symbol)}?range=${range}`),
  snapshots: (symbol: string) => get<Snapshot[]>(`/api/snapshots/${encodeURIComponent(symbol)}`),
  search: (q: string) => get<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
  getStore: () => get<UserStore | null>("/api/store"),
  saveStore: (store: UserStore) =>
    get<UserStore>("/api/store", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(store),
    }),
};
