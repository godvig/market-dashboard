import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { WatchlistRow } from "../../shared/types";
import { fmtBig, fmtNum, fmtPct, sameCurrency, toBase, tone } from "../format";

const col = createColumnHelper<WatchlistRow>();

const pct = (header: string, get: (r: WatchlistRow) => number | null | undefined, title?: string) =>
  col.accessor((r) => get(r) ?? null, {
    id: header,
    header,
    meta: { title },
    sortUndefined: "last",
    sortingFn: (a, b, id) => {
      const x = a.getValue<number | null>(id);
      const y = b.getValue<number | null>(id);
      if (x == null || Number.isNaN(x)) return y == null || Number.isNaN(y) ? 0 : -1;
      if (y == null || Number.isNaN(y)) return 1;
      return x - y;
    },
    cell: (c) => <span className={tone(c.getValue())}>{fmtPct(c.getValue())}</span>,
  });

interface Props {
  rows: WatchlistRow[];
  baseCurrency: string;
  selected?: string;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
}

export function WatchlistTable({ rows, baseCurrency, selected, onSelect, onRemove }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");

  const columns = useMemo(
    () => [
      col.accessor((r) => r.quote.symbol, {
        id: "Symbol",
        header: "Symbol",
        cell: (c) => <strong>{c.getValue()}</strong>,
      }),
      col.accessor((r) => r.quote.name, {
        id: "Name",
        header: "Name",
        cell: (c) => (
          <span className="name" title={c.row.original.error ?? c.getValue()}>
            {c.row.original.error ? `⚠ ${c.row.original.error}` : c.getValue()}
          </span>
        ),
      }),
      col.accessor((r) => r.quote.price, {
        id: "Price",
        header: "Price",
        meta: { title: `Price in the listing currency, with the ${baseCurrency} value below` },
        cell: (c) => {
          const { quote, fx } = c.row.original;
          const base = toBase(quote.price, fx);
          return (
            <div className="dual">
              <span>
                {fmtNum(c.getValue())} <small>{quote.currency}</small>
              </span>
              {!sameCurrency(quote.currency, baseCurrency) && base != null && (
                <small>
                  ≈ {fmtNum(base)} {baseCurrency}
                </small>
              )}
            </div>
          );
        },
      }),
      pct("Day", (r) => r.quote.changePct, "Change today"),
      pct("1M", (r) => r.metrics.ret1m, "Return, last 21 trading days"),
      pct("3M", (r) => r.metrics.ret3m),
      pct("1Y", (r) => r.metrics.ret1y),
      pct("YTD", (r) => r.metrics.retYtd, "Year to date"),
      col.accessor((r) => r.metrics.volatility ?? null, {
        id: "Vol",
        header: "Vol",
        meta: { title: "Annualised volatility, 1 year" },
        sortUndefined: "last",
        cell: (c) => fmtPct(c.getValue()).replace("+", ""),
      }),
      pct("Max DD", (r) => r.metrics.maxDrawdown, "Max drawdown, 1 year"),
      pct("vs 52w high", (r) => r.metrics.fromHigh),
      pct("vs SMA200", (r) => r.metrics.vsSma200, "Price vs 200-day moving average"),
      col.accessor((r) => r.metrics.rsi14 ?? null, {
        id: "RSI",
        header: "RSI",
        meta: { title: "RSI(14): >70 overbought, <30 oversold" },
        sortUndefined: "last",
        cell: (c) => {
          const v = c.getValue();
          return <span className={v == null ? "" : v > 70 ? "neg" : v < 30 ? "pos" : ""}>{fmtNum(v, 0)}</span>;
        },
      }),
      col.accessor((r) => r.quote.pe ?? null, {
        id: "P/E",
        header: "P/E",
        sortUndefined: "last",
        cell: (c) => fmtNum(c.getValue(), 1),
      }),
      col.accessor((r) => r.quote.dividendYield ?? null, {
        id: "Div yield",
        header: "Div yield",
        meta: { title: "Dividend yield (direktavkastning): annual dividend ÷ share price" },
        sortUndefined: "last",
        cell: (c) => fmtPct(c.getValue()).replace("+", ""),
      }),
      col.accessor((r) => r.quote.payoutRatio ?? null, {
        id: "Payout",
        header: "Payout",
        meta: { title: "Payout ratio (utdelningsandel): share of earnings paid as dividends. Over 100 % = paying more than it earns" },
        sortUndefined: "last",
        cell: (c) => {
          const v = c.getValue();
          return <span className={v != null && v > 100 ? "neg" : ""}>{fmtPct(v, 0).replace("+", "")}</span>;
        },
      }),
      col.accessor((r) => toBase(r.quote.marketCap, r.fx), {
        id: "Mkt cap",
        header: `Mkt cap (${baseCurrency})`,
        meta: { title: `Market cap converted to ${baseCurrency} so it can be compared and sorted; original currency below` },
        sortUndefined: "last",
        cell: (c) => {
          const { quote } = c.row.original;
          const base = c.getValue();
          return (
            <div className="dual">
              <span>{base != null ? fmtBig(base) : fmtBig(quote.marketCap)}</span>
              {!sameCurrency(quote.currency, baseCurrency) && quote.marketCap != null && (
                <small>
                  {fmtBig(quote.marketCap)} {quote.currency}
                </small>
              )}
            </div>
          );
        },
      }),
      col.display({
        id: "remove",
        header: "",
        cell: (c) => (
          <button
            className="icon"
            title="Remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(c.row.original.quote.symbol);
            }}
          >
            ×
          </button>
        ),
      }),
    ],
    [onRemove, baseCurrency],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    globalFilterFn: (row, _id, value: string) => {
      const q = value.toLowerCase();
      return row.original.quote.symbol.toLowerCase().includes(q) || row.original.quote.name.toLowerCase().includes(q);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="card">
      <div className="toolbar">
        <input placeholder="Filter by symbol or name…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="muted">
          {table.getRowModel().rows.length} of {rows.length}
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  const meta = h.column.columnDef.meta as { title?: string } | undefined;
                  return (
                    <th
                      key={h.id}
                      title={meta?.title}
                      onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                      className={h.column.getCanSort() ? "sortable" : ""}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {sorted === "asc" ? " ▲" : sorted === "desc" ? " ▼" : ""}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr
                key={r.id}
                className={r.original.quote.symbol === selected ? "selected" : ""}
                onClick={() => onSelect(r.original.quote.symbol)}
              >
                {r.getVisibleCells().map((c) => (
                  <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
