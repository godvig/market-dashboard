import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Ctx } from "./columns";
import type { WatchlistRow } from "../shared/types";
import { api } from "./api";
import { AddSymbol } from "./components/AddSymbol";
import { ColumnPicker } from "./components/ColumnPicker";
import { DetailPanel } from "./components/DetailPanel";
import { FixTicker } from "./components/FixTicker";
import { ListHeader } from "./components/ListHeader";
import { Sidebar } from "./components/Sidebar";
import { WatchlistTable } from "./components/WatchlistTable";
import { useRoute } from "./useRoute";
import { useStore } from "./useStore";

export function App() {
  const s = useStore();
  const { route, go } = useRoute();
  const store = s.store;

  const [rows, setRows] = useState<WatchlistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [provider, setProvider] = useState<string>();
  const [baseCurrency, setBaseCurrency] = useState("SEK");
  const [updated, setUpdated] = useState<Date>();
  const [progress, setProgress] = useState<string>();
  const [fixing, setFixing] = useState<string>();
  const loadId = useRef(0);

  useEffect(() => {
    api
      .health()
      .then((h) => {
        setProvider(h.provider);
        setBaseCurrency(h.baseCurrency ?? "SEK");
      })
      .catch(() => setProvider("offline"));
  }, []);

  // Active list comes from the URL; fall back to the first list.
  const list = store?.lists.find((l) => l.id === route.listId) ?? store?.lists[0];
  useEffect(() => {
    if (list && list.id !== route.listId) go(list.id, undefined, true);
  }, [list, route.listId, go]);

  const symbolKey = list?.symbols.join(",") ?? "";

  /** Loads rows in chunks so big lists fill in progressively. */
  const refresh = useCallback(() => {
    const symbols = symbolKey ? symbolKey.split(",") : [];
    const id = ++loadId.current;
    if (!symbols.length) return setRows([]);
    setLoading(true);
    setError(undefined);
    const CHUNK = 20;
    (async () => {
      let acc: WatchlistRow[] = [];
      for (let i = 0; i < symbols.length; i += CHUNK) {
        if (symbols.length > CHUNK) setProgress(`Loading ${Math.min(i + CHUNK, symbols.length)}/${symbols.length}…`);
        const part = await api.watchlist(symbols.slice(i, i + CHUNK));
        if (id !== loadId.current) return; // a newer load started
        acc = [...acc, ...part];
        // Show fresh rows plus last load's rows for symbols not refreshed yet (no flicker on refresh).
        const fresh = new Set(acc.map((r) => r.quote.symbol));
        const wanted = new Set(symbols);
        setRows((prev) => [...acc, ...prev.filter((r) => !fresh.has(r.quote.symbol) && wanted.has(r.quote.symbol))]);
      }
      setRows(acc);
      setUpdated(new Date());
    })()
      .catch((e: Error) => id === loadId.current && setError(e.message))
      .finally(() => {
        if (id === loadId.current) {
          setLoading(false);
          setProgress(undefined);
        }
      });
  }, [symbolKey]);

  useEffect(refresh, [refresh]);

  const listId = list?.id;
  const { removeSymbol } = s;
  const onRemove = useCallback((sym: string) => listId && removeSymbol(listId, sym), [listId, removeSymbol]);
  const openStock = useCallback((sym: string) => listId && go(listId, sym), [listId, go]);
  const backToList = useCallback(() => listId && go(listId), [listId, go]);

  // Rows in the list's own order, for prev/next in the stock view.
  const ordered = useMemo(
    () => (list ? list.symbols.map((sym) => rows.find((r) => r.quote.symbol === sym)).filter((r): r is WatchlistRow => !!r) : []),
    [list, rows],
  );
  const stockIndex = route.symbol ? ordered.findIndex((r) => r.quote.symbol === route.symbol) : -1;
  const stockRow = stockIndex >= 0 ? ordered[stockIndex] : undefined;
  const group = store?.groups.find((g) => g.id === list?.groupId);
  const ctx: Ctx = useMemo(
    () => ({ baseCurrency, stocks: store?.stocks, trafficLights: store?.settings?.trafficLights !== false }),
    [baseCurrency, store?.stocks, store?.settings?.trafficLights],
  );
  const fixMeta = fixing ? store?.stocks?.[fixing] : undefined;

  if (!store || !list) return <main className="loading-screen muted">Loading…</main>;

  return (
    <div className="layout">
      <Sidebar store={store} api={s} activeListId={list.id} onOpenList={(id) => go(id)} />

      <main>
        <header>
          <h1>Market Dashboard</h1>
          <span className="badge" title="Data provider (set PROVIDER in .env)">
            {provider ?? "…"}
          </span>
          <div className="spacer" />
          <AddSymbol onAdd={(sym) => s.addSymbol(list.id, sym)} />
          <button onClick={refresh} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </header>

        {s.saveError && <p className="neg">Could not save to the server: {s.saveError} (kept in this browser)</p>}
        {error && <p className="neg">Could not load data: {error}</p>}

        {route.symbol ? (
          stockRow ? (
            <DetailPanel
              row={stockRow}
              ctx={ctx}
              listName={list.name}
              onMeta={(patch) => s.setMeta(stockRow.quote.symbol, patch)}
              onAssess={(k, v) => s.setAssessment(stockRow.quote.symbol, k, v)}
              prev={ordered[stockIndex - 1]?.quote.symbol}
              next={ordered[stockIndex + 1]?.quote.symbol}
              onBack={backToList}
              onNavigate={openStock}
            />
          ) : (
            <div className="stock-view">
              <nav className="breadcrumb">
                <button className="crumb-link" onClick={backToList}>
                  ← {list.name}
                </button>
                <span className="muted"> › {route.symbol}</span>
              </nav>
              <div className="card empty">{loading ? "Loading…" : `${route.symbol} is not in this list.`}</div>
            </div>
          )
        ) : (
          <>
            <ListHeader
              list={list}
              group={group}
              canDelete={store.lists.length > 1}
              allLists={store.lists}
              onRename={(name) => s.renameList(list.id, name)}
              onDuplicate={() => {
                const id = s.duplicateList(list.id);
                if (id) go(id);
              }}
              onDelete={() => {
                const nextList = store.lists.find((l) => l.id !== list.id);
                s.deleteList(list.id);
                if (nextList) go(nextList.id);
              }}
              onImport={(lists) => {
                const id = s.importLists(lists);
                if (id) go(id);
              }}
              onImportBundle={(b) => {
                const id = s.importBundle(b);
                if (id) go(id);
              }}
            />
            {fixing && (
              <FixTicker
                symbol={fixing}
                name={fixMeta?.name}
                country={fixMeta?.country}
                onClose={() => setFixing(undefined)}
                onPick={(sym) => {
                  s.replaceSymbol(fixing, sym);
                  setFixing(undefined);
                }}
              />
            )}
            {list.symbols.length === 0 ? (
              <div className="card empty">This list is empty. Add tickers with the search box above.</div>
            ) : (
              <WatchlistTable
                rows={rows}
                ctx={ctx}
                columnIds={store.columns}
                progress={progress}
                toolbar={
                  <ColumnPicker
                    value={store.columns}
                    onChange={s.setColumns}
                    trafficLights={ctx.trafficLights}
                    onTrafficLights={s.setTrafficLights}
                  />
                }
                onOpen={openStock}
                onRemove={onRemove}
                onFix={setFixing}
              />
            )}
          </>
        )}

        <footer className="muted">
          {updated && `Updated ${updated.toLocaleTimeString("sv-SE")} · `}
          Click a row to open the stock · Esc or the list name goes back · drag lists in the sidebar · free data may be
          delayed. Not investment advice.
        </footer>
      </main>
    </div>
  );
}
