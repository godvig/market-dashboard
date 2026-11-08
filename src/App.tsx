import { useCallback, useEffect, useState } from "react";
import type { WatchlistRow } from "../shared/types";
import { api } from "./api";
import { AddSymbol } from "./components/AddSymbol";
import { DetailPanel } from "./components/DetailPanel";
import { WatchlistTable } from "./components/WatchlistTable";
import { useWatchlist } from "./useWatchlist";

export function App() {
  const { symbols, add, remove, reset } = useWatchlist();
  const [rows, setRows] = useState<WatchlistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [provider, setProvider] = useState<string>();
  const [updated, setUpdated] = useState<Date>();

  useEffect(() => {
    api.health().then((h) => setProvider(h.provider)).catch(() => setProvider("offline"));
  }, []);

  const refresh = useCallback(() => {
    if (!symbols.length) return setRows([]);
    setLoading(true);
    api
      .watchlist(symbols)
      .then((r) => {
        setRows(r);
        setError(undefined);
        setUpdated(new Date());
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [symbols]);

  useEffect(refresh, [refresh]);

  const handleRemove = useCallback(
    (s: string) => {
      remove(s);
      if (selected === s) setSelected(undefined);
    },
    [remove, selected],
  );

  const selectedRow = rows.find((r) => r.quote.symbol === selected);

  return (
    <main>
      <header>
        <h1>Market Dashboard</h1>
        <span className="badge" title="Data provider (set PROVIDER in .env)">
          {provider ?? "…"}
        </span>
        <div className="spacer" />
        <AddSymbol onAdd={add} />
        <button onClick={refresh} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button onClick={reset} title="Restore the default watchlist">
          Reset
        </button>
      </header>
      {error && <p className="neg">Could not load data: {error}</p>}
      {selectedRow && <DetailPanel row={selectedRow} onClose={() => setSelected(undefined)} />}
      <WatchlistTable rows={rows} selected={selected} onSelect={setSelected} onRemove={handleRemove} />
      <footer className="muted">
        {updated && `Updated ${updated.toLocaleTimeString("sv-SE")} · `}
        Click a row for the chart · click a header to sort · free data may be delayed. Not investment advice.
      </footer>
    </main>
  );
}
