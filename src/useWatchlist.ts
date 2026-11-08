import { useCallback, useState } from "react";

const KEY = "market-dashboard.watchlist";
export const DEFAULT_WATCHLIST = ["VOLV-B.ST", "ERIC-B.ST", "INVE-B.ST", "ASML.AS", "AAPL", "MSFT", "NVDA", "SPY"];

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) && list.length ? list : DEFAULT_WATCHLIST;
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

/** Watchlist symbols, persisted in this browser's localStorage. */
export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>(load);

  const save = useCallback((next: string[]) => {
    setSymbols(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable – keep in memory */
    }
  }, []);

  const add = (s: string) => {
    const sym = s.trim().toUpperCase();
    if (sym && !symbols.includes(sym)) save([...symbols, sym]);
  };
  const remove = (s: string) => save(symbols.filter((x) => x !== s));
  const reset = () => save(DEFAULT_WATCHLIST);

  return { symbols, add, remove, reset };
}
