import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { WatchlistRow } from "../../shared/types";
import { columnCoverage, metaOf, moveColumn, visibleColumns, type Ctx } from "../columns";
import { HorseIcon } from "./HorseIcon";

const col = createColumnHelper<WatchlistRow>();

interface Props {
  rows: WatchlistRow[];
  ctx: Ctx;
  columnIds?: string[];
  /** Called with the new order when a column header is dragged to another place. */
  onColumns: (ids: string[]) => void;
  toolbar?: ReactNode;
  /** Shown above the table while rows are still arriving. */
  progress?: string;
  onOpen: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onFix: (symbol: string) => void;
}

/** The first two columns stay put: they cannot be dragged and they stay visible when scrolling sideways. */
const LOCKED = new Set(["symbol", "name"]);
/** Below this share of rows with data, the header says so. */
const LOW_COVERAGE = 0.6;

interface ColMeta {
  title?: string;
  divider?: boolean;
  left?: boolean;
  coverage?: number | null;
}

export function WatchlistTable({ rows, ctx, columnIds, onColumns, toolbar, progress, onOpen, onRemove, onFix }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const defs = useMemo(() => visibleColumns(columnIds), [columnIds]);
  // The divider marks where the extra key figures start. Once columns have been
  // dragged so that the two groups are mixed, there is no such place.
  const firstExtra = useMemo(() => {
    const i = defs.findIndex((d) => d.tier === "extra");
    return i >= 0 && defs.slice(i).every((d) => d.tier === "extra") ? defs[i].id : undefined;
  }, [defs]);
  const coverage = useMemo(() => new Map(defs.map((d) => [d.id, columnCoverage(d, rows, ctx)])), [defs, rows, ctx]);

  // The mouse wheel moves the table sideways (down = right, up = left): always
  // on the header row, and on the rows whenever the page itself has nowhere
  // left to scroll in that direction. Shift + wheel works everywhere, as usual.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.shiftKey || !e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const onHeader = !!(e.target as Element | null)?.closest?.("thead");
      if (!onHeader) {
        const page = document.scrollingElement ?? document.documentElement;
        const pageCanMove = e.deltaY > 0 ? page.scrollTop + page.clientHeight < page.scrollHeight - 1 : page.scrollTop > 0;
        if (pageCanMove) return;
      }
      const next = Math.min(max, Math.max(0, el.scrollLeft + (e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY)));
      if (next === el.scrollLeft) return;
      e.preventDefault();
      el.scrollLeft = next;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const dragProps = (id: string) => {
    const locked = LOCKED.has(id);
    if (id === "remove") return {};
    return {
      draggable: !locked,
      onDragStart: locked
        ? undefined
        : (e: DragEvent<HTMLTableCellElement>) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", id);
            setDragId(id);
          },
      onDragOver: (e: DragEvent<HTMLTableCellElement>) => {
        if (!dragId || dragId === id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const box = e.currentTarget.getBoundingClientRect();
        // Dropping on a locked column means "first, right after the locked ones".
        const after = locked || e.clientX > box.left + box.width / 2;
        if (drop?.id !== id || drop.after !== after) setDrop({ id, after });
      },
      onDrop: (e: DragEvent<HTMLTableCellElement>) => {
        e.preventDefault();
        if (dragId && dragId !== id) {
          const order = defs.map((d) => d.id);
          onColumns(moveColumn(order, dragId, locked ? null : id, !locked && !!drop?.after));
        }
        setDragId(null);
        setDrop(null);
      },
      onDragEnd: () => {
        setDragId(null);
        setDrop(null);
      },
    };
  };

  const columns = useMemo(
    () => [
      col.accessor((r) => r.quote.symbol, {
        id: "symbol",
        header: "Symbol",
        cell: (c) => {
          const r = c.row.original;
          const meta = metaOf(r, ctx);
          return (
            <>
              <strong>{c.getValue()}</strong>
              {/* Phones hide the Name column and show the name here instead. */}
              <span className={`sym-name${r.error ? " err" : ""}`}>
                {r.error ? (
                  <button
                    className="link"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFix(r.quote.symbol);
                    }}
                  >
                    ⚠ Find ticker
                  </button>
                ) : (
                  <>
                    <HorseIcon type={meta?.investmentType} size={14} />
                    {meta?.name ?? r.quote.name}
                  </>
                )}
              </span>
            </>
          );
        },
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
          meta: { title: d.title, divider: d.id === firstExtra, left: d.align === "left", coverage: coverage.get(d.id) } satisfies ColMeta,
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
    [defs, ctx, firstExtra, coverage, onRemove, onFix],
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
      <div className="table-wrap" ref={wrapRef}>
        <table>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  const meta = h.column.columnDef.meta as ColMeta | undefined;
                  const id = h.column.id;
                  const low = meta?.coverage != null && rows.length >= 3 && meta.coverage < LOW_COVERAGE;
                  return (
                    <th
                      key={h.id}
                      title={
                        LOCKED.has(id) || id === "remove"
                          ? meta?.title
                          : [meta?.title, low ? `Only ${Math.round(meta!.coverage! * 100)} % of this list has data here.` : "", "Drag to move the column."]
                              .filter(Boolean)
                              .join(" · ")
                      }
                      onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                      className={[
                        h.column.getCanSort() ? "sortable" : "",
                        meta?.divider ? "divider" : "",
                        meta?.left ? "left" : "",
                        LOCKED.has(id) ? `locked locked-${id}` : id === "remove" ? "" : "movable",
                        dragId === id ? "dragging" : "",
                        drop?.id === id ? (drop.after ? "drop-after" : "drop-before") : "",
                      ].join(" ")}
                      {...dragProps(id)}
                    >
                      <span className="th-label">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === "asc" ? " ▲" : sorted === "desc" ? " ▼" : ""}
                      </span>
                      {low && <span className="th-cov">{Math.round(meta!.coverage! * 100)} % data</span>}
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
                  const meta = c.column.columnDef.meta as ColMeta | undefined;
                  const locked = LOCKED.has(c.column.id) ? `locked locked-${c.column.id}` : "";
                  return (
                    <td key={c.id} className={[meta?.divider ? "divider" : "", meta?.left ? "left" : "", locked].join(" ").trim() || undefined}>
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
