import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Ctx } from "./columns";
import type { KnownStock } from "../shared/importMatch";
import type { Cell } from "../shared/importParse";
import { DEFAULT_IMPORT_MAX_AGE_DAYS } from "../shared/importMerge";
import { allScorecards } from "../shared/scorecardIO";
import type { WatchlistRow } from "../shared/types";
import { api, IS_DEMO } from "./api";
import { AddSymbol } from "./components/AddSymbol";
import { ColumnPicker } from "./components/ColumnPicker";
import { DetailPanel } from "./components/DetailPanel";
import { FixTicker } from "./components/FixTicker";
import { ImportDialog } from "./components/ImportDialog";
import { LensPicker } from "./components/LensPicker";
import { ListHeader } from "./components/ListHeader";
import { ScorecardEditor } from "./components/ScorecardEditor";
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
  const [importing, setImporting] = useState<{ fileName: string; table: Cell[][] }>();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  const loadId = useRef(0);
  /** Company names seen this session, so imported rows can be matched by name. */
  const seenNames = useRef(new Map<string, string>());

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

  useEffect(() => {
    for (const r of rows) if (!r.error && r.quote.name) seenNames.current.set(r.quote.symbol, r.quote.name);
  }, [rows]);
  const known = useMemo((): KnownStock[] => {
    if (!importing || !store) return [];
    const symbols = new Set(store.lists.flatMap((l) => l.symbols));
    return [...symbols].map((symbol) => ({ symbol, name: store.stocks?.[symbol]?.name ?? seenNames.current.get(symbol) }));
  }, [importing, store]);

  const listId = list?.id;
  const { removeSymbol } = s;
  const onRemove = useCallback((sym: string) => listId && removeSymbol(listId, sym), [listId, removeSymbol]);
  const openStock = useCallback((sym: string) => listId && go(listId, sym), [listId, go]);
  const backToList = useCallback(() => listId && go(listId), [listId, go]);
  const openScorecard = useCallback((id: string) => listId && go(listId, undefined, true, id), [listId, go]);

  // Rows in the list's own order, for prev/next in the stock view.
  const ordered = useMemo(
    () => (list ? list.symbols.map((sym) => rows.find((r) => r.quote.symbol === sym)).filter((r): r is WatchlistRow => !!r) : []),
    [list, rows],
  );
  const stockIndex = route.symbol ? ordered.findIndex((r) => r.quote.symbol === route.symbol) : -1;
  const stockRow = stockIndex >= 0 ? ordered[stockIndex] : undefined;
  const group = store?.groups.find((g) => g.id === list?.groupId);
  const ctx: Ctx = useMemo(
    () => ({
      baseCurrency,
      stocks: store?.stocks,
      trafficLights: store?.settings?.trafficLights !== false,
      scoring: { smooth: store?.settings?.smoothScoring !== false, minCoverage: (store?.settings?.minCoverage ?? 60) / 100 },
      scorecards: allScorecards(store?.scorecards),
    }),
    [baseCurrency, store?.stocks, store?.scorecards, store?.settings?.trafficLights, store?.settings?.smoothScoring, store?.settings?.minCoverage],
  );
  const fixMeta = fixing ? store?.stocks?.[fixing] : undefined;

  if (!store || !list) return <main className="loading-screen muted">Loading…</main>;

  return (
    <div className={`layout${menuOpen ? " menu-open" : ""}`}>
      <Sidebar
        store={store}
        api={s}
        activeListId={list.id}
        onOpenList={(id) => {
          go(id);
          setMenuOpen(false);
        }}
        scorecardsOpen={route.scorecard != null}
        onOpenScorecards={() => {
          go(list.id, undefined, false, list.scorecardId ?? "");
          setMenuOpen(false);
        }}
      />
      {menuOpen && <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <main>
        <header>
          <button className="menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open watchlists" aria-expanded={menuOpen}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <h1>Market Screener</h1>
          <span className="badge" title="Data provider (set PROVIDER in .env)">
            {provider ?? "…"}
          </span>
          <div className="spacer" />
          <AddSymbol onAdd={(sym) => s.addSymbol(list.id, sym)} />
          <button onClick={refresh} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </header>

        {IS_DEMO && (
          <p className="demo-banner">
            <strong>Demo:</strong> all prices and key figures are made up, not real market data. Your lists are saved
            only in this browser. <a href="https://github.com/godvig/market-screener">Code on GitHub</a>
          </p>
        )}

        {s.saveError && <p className="neg">Could not save to the server: {s.saveError} (kept in this browser)</p>}
        {error && <p className="neg">Could not load data: {error}</p>}

        {route.scorecard != null ? (
          <ScorecardEditor
            cards={ctx.scorecards}
            selectedId={route.scorecard || undefined}
            rows={rows}
            ctx={ctx}
            listName={list.name}
            lensId={list.scorecardId}
            onSelect={openScorecard}
            onSave={s.saveScorecard}
            onDelete={s.deleteScorecard}
            onLens={(id) => s.setListLens(list.id, id)}
            onBack={backToList}
          />
        ) : route.symbol ? (
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
              onImportTable={(fileName, table) => setImporting({ fileName, table })}
            />
            {importing && (
              <ImportDialog
                fileName={importing.fileName}
                table={importing.table}
                known={known}
                savedMappings={store.importMappings}
                maxAgeDays={store.settings?.importMaxAgeDays ?? DEFAULT_IMPORT_MAX_AGE_DAYS}
                onMaxAge={async (days) => {
                  s.setImportMaxAge(days);
                  await s.flush();
                  refresh();
                }}
                importedCount={Object.keys(store.imported ?? {}).length}
                onClearImported={async () => {
                  s.clearImported();
                  await s.flush();
                  refresh();
                }}
                onClose={() => setImporting(undefined)}
                onImport={async (imp) => {
                  const id = s.importFigures(imp);
                  setImporting(undefined);
                  await s.flush(); // the server merges imported figures into the rows, so save first
                  if (id) go(id);
                  else refresh();
                }}
              />
            )}
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
                onColumns={s.setColumns}
                progress={progress}
                lensId={ctx.scorecards.some((c) => c.id === list.scorecardId) ? list.scorecardId : undefined}
                toolbar={
                  <>
                    <LensPicker
                      cards={ctx.scorecards}
                      value={list.scorecardId}
                      onChange={(id) => s.setListLens(list.id, id)}
                      onEdit={() => go(list.id, undefined, false, list.scorecardId ?? "")}
                    />
                    <ColumnPicker
                      value={store.columns}
                      onChange={s.setColumns}
                      rows={rows}
                      ctx={ctx}
                      onTrafficLights={s.setTrafficLights}
                      onSmoothScoring={s.setSmoothScoring}
                      onMinCoverage={s.setMinCoverage}
                    />
                  </>
                }
                onOpen={openStock}
                onRemove={onRemove}
                onFix={setFixing}
              />
            )}
          </>
        )}

        <footer className="muted">
          {updated && `Updated ${updated.toLocaleTimeString("en-GB")} · `}
          <span className="mouse-hint">
            Click a row to open the stock · drag a column header to move it · scroll on the header row to move sideways ·{" "}
          </span>
          <span className="touch-hint">Tap a row to open the stock · swipe the table for more columns · </span>
          Free data may be delayed. Not investment advice.
        </footer>
      </main>
    </div>
  );
}
