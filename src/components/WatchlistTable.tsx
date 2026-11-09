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
import { metaOf, visibleColumns, type Ctx } from "../columns";
import { HorseIcon } from "./HorseIcon";

const col = createColumnHelper<WatchlistRow>();

interface Props {
  rows: WatchlistRow[];
  ctx: Ctx;
  columnIds?: string[];
  toolbar?: ReactNode;
  /** Shown above the table while rows are still arriving. */
  progress?: string;
  onOpen: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onFix: (symbol: string) => void;
}

export function WatchlistTable({ rows, ctx, columnIds, toolbar, progress, onOpen, onRemove, onFix }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");
  const defs = useMemo(() => visibleColumns(columnIds), [columnIds]);
  const firstExtra = defs.find((d) => d.tier === "extra")?.id;

  const columns = useMemo(
    () => [
      col.accessor((r) => r.quote.symbol, {
        id: "symbol",
        header: "Symbol",
        cell: (c) => <strong>{c.getValue()}</strong>,
      }),
      // Your own name for the company (e.g. from the spreadsheet) wins over the provider's.
      col.accessor((r) => metaOf(r, ctx)?.name ?? r.quote.name, {
        id: "name",
        header: "Name",
        cell: (c) =>
          c.row.original.error ? (
            <span className="name err" title={c.row.original.error}>
              ⚠ {c.getValue()}{" "}
              <button
                className="link"
                onClick={(e) => {
                  e.stopPropagation();
                  onFix(c.row.original.quote.symbol);
                }}
              >
                Find ticker
              </button>
            </span>
          ) : (
            <span className="name" title={[metaOf(c.row.original, ctx)?.investmentType, c.row.original.quote.name].filter(Boolean).join(" · ")}>
              <HorseIcon type={metaOf(c.row.original, ctx)?.investmentType} size={16} />
              {c.getValue()}
            </span>
          ),
      }),
      ...defs.map((d) =>
        // undefined (not null) so TanStack's sortUndefined keeps missing values last
        col.accessor((r) => d.value(r, ctx) ?? undefined, {
          id: d.id,
          header: d.label,
          meta: { title: d.title, divider: d.id === firstExtra, left: d.align === "left" },
          sortingFn: "basic",
          sortUndefined: "last",
          sortDescFirst: !d.ascFirst,
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
    [defs, ctx, firstExtra, onRemove, onFix],
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
        {progress && <span className="progress">{progress}</span>}
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
                  const meta = h.column.columnDef.meta as { title?: string; divider?: boolean; left?: boolean } | undefined;
                  return (
                    <th
                      key={h.id}
                      title={meta?.title}
                      onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                      className={[h.column.getCanSort() ? "sortable" : "", meta?.divider ? "divider" : "", meta?.left ? "left" : ""].join(" ")}
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
                  const meta = c.column.columnDef.meta as { divider?: boolean; left?: boolean } | undefined;
                  return (
                    <td key={c.id} className={[meta?.divider ? "divider" : "", meta?.left ? "left" : ""].join(" ") || undefined}>
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
