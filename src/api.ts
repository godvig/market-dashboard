import type { Candle, HistoryRange, SearchResult, Watchlist, WatchlistRow } from "../shared/types";

async function get<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
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
  getLists: () => get<Watchlist[] | null>("/api/watchlists"),
  saveLists: (lists: Watchlist[]) =>
    get<Watchlist[]>("/api/watchlists", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lists),
    }),
};
