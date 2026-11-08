import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo, useState, type ReactNode } from "react";
import type { WatchlistRow } from "../../shared/types";
import { visibleColumns } from "../columns";

const col = createColumnHelper<WatchlistRow>();

interface Props {
  rows: WatchlistRow[];
  baseCurrency: string;
  columnIds?: string[];
  toolbar?: ReactNode;
  onOpen: (symbol: string) => void;
  onRemove: (symbol: string) => void;
}

export function WatchlistTable({ rows, baseCurrency, columnIds, toolbar, onOpen, onRemove }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");
  const ctx = useMemo(() => ({ baseCurrency }), [baseCurrency]);
  const defs = useMemo(() => visibleColumns(columnIds), [columnIds]);
  const firstExtra = defs.find((d) => d.tier === "extra")?.id;

  const columns = useMemo(
    () => [
      col.accessor((r) => r.quote.symbol, {
        id: "symbol",
        header: "Symbol",
        cell: (c) => <strong>{c.getValue()}</strong>,
      }),
      col.accessor((r) => r.quote.name, {
        id: "name",
        header: "Name",
        cell: (c) => (
          <span className="name" title={c.row.original.error ?? c.getValue()}>
            {c.row.original.error ? `⚠ ${c.row.original.error}` : c.getValue()}
          </span>
        ),
      }),
      ...defs.map((d) =>
        // undefined (not null) so TanStack's sortUndefined keeps missing values last
        col.accessor((r) => d.value(r, ctx) ?? undefined, {
          id: d.id,
          header: d.label,
          meta: { title: d.title, divider: d.id === firstExtra },
          sortingFn: "basic",
          sortUndefined: "last",
          cell: (c) => (d.render ? d.render(c.row.original, ctx) : String(c.getValue() ?? "–")),
        }),
      ),
      col.display({
        id: "remove",
        header: "",
        cell: (c) => (
          <button
            className="icon"
            title="Remove from this list"
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
    [defs, ctx, firstExtra, onRemove],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    sortDescFirst: true,
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
        <div className="spacer" />
        {toolbar}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  const meta = h.column.columnDef.meta as { title?: string; divider?: boolean } | undefined;
                  return (
                    <th
                      key={h.id}
                      title={meta?.title}
                      onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                      className={[h.column.getCanSort() ? "sortable" : "", meta?.divider ? "divider" : ""].join(" ")}
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
              <tr key={r.id} onClick={() => onOpen(r.original.quote.symbol)}>
                {r.getVisibleCells().map((c) => {
                  const meta = c.column.columnDef.meta as { divider?: boolean } | undefined;
                  return (
                    <td key={c.id} className={meta?.divider ? "divider" : undefined}>
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
