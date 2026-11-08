import { useCallback, useEffect, useState } from "react";
import type { WatchlistRow } from "../shared/types";
import { api } from "./api";
import { AddSymbol } from "./components/AddSymbol";
import { DetailPanel } from "./components/DetailPanel";
import { ListTabs } from "./components/ListTabs";
import { WatchlistTable } from "./components/WatchlistTable";
import { useWatchlists } from "./useWatchlist";

export function App() {
  const wl = useWatchlists();
  const symbols = wl.active?.symbols ?? [];
  const symbolKey = symbols.join(",");

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
    const list = symbolKey ? symbolKey.split(",") : [];
    if (!list.length) return setRows([]);
    setLoading(true);
    api
      .watchlist(list)
      .then((r) => {
        setRows(r);
        setError(undefined);
        setUpdated(new Date());
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [symbolKey]);

  useEffect(refresh, [refresh]);

  // Close the detail view when switching lists.
  useEffect(() => setSelected(undefined), [wl.active?.id]);

  const { removeSymbol } = wl;
  const handleRemove = useCallback(
    (s: string) => {
      removeSymbol(s);
      setSelected((cur) => (cur === s ? undefined : cur));
    },
    [removeSymbol],
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
        <AddSymbol onAdd={wl.addSymbol} />
        <button onClick={refresh} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </header>

      {wl.ready && (
        <ListTabs
          lists={wl.lists}
          activeId={wl.active?.id}
          onSelect={wl.select}
          onCreate={(name) => wl.createList(name)}
          onRename={wl.renameList}
          onDelete={wl.deleteList}
          onDuplicate={(id) => wl.duplicateList(id)}
          onImport={wl.importLists}
        />
      )}

      {wl.saveError && <p className="neg">Could not save lists to the server: {wl.saveError} (kept in this browser)</p>}
      {error && <p className="neg">Could not load data: {error}</p>}
      {selectedRow && <DetailPanel row={selectedRow} onClose={() => setSelected(undefined)} />}

      {wl.ready && !symbols.length ? (
        <div className="card empty">This list is empty. Add tickers with the search box above.</div>
      ) : (
        <WatchlistTable rows={rows} selected={selected} onSelect={setSelected} onRemove={handleRemove} />
      )}

      <footer className="muted">
        {updated && `Updated ${updated.toLocaleTimeString("sv-SE")} · `}
        Click a row for the chart · click a header to sort · double-click a list tab to rename · free data may be delayed. Not
        investment advice.
      </footer>
    </main>
  );
}
