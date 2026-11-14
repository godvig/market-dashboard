import { useEffect, useMemo, useRef, useState } from "react";
import type { WatchlistRow } from "../../shared/types";
import { DEFAULT_COLUMNS, TREND_CHOICES, columnCoverage, columnsFor, customOf, insertColumn, normaliseColumnIds, type ColumnDef, type Ctx } from "../columns";

interface Props {
  value?: string[];
  onChange: (ids: string[] | undefined) => void;
  /** The rows on screen, to show how many of them have data for each column. */
  rows: WatchlistRow[];
  ctx: Ctx;
  onTrafficLights: (on: boolean) => void;
  onSmoothScoring: (on: boolean) => void;
  onMinCoverage: (pct: number) => void;
  onTrendDays: (days: number) => void;
}

const MIN_COVERAGE_CHOICES = [0, 40, 50, 60, 75, 90];

/** Dropdown with checkboxes: standard columns, a divider, then extra key figures. */
export function ColumnPicker({ value, onChange, rows, ctx, onTrafficLights, onSmoothScoring, onMinCoverage, onTrendDays }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const order = normaliseColumnIds(value) ?? DEFAULT_COLUMNS;
  const selected = new Set(order);
  const custom = useMemo(() => customOf(ctx.scorecards), [ctx.scorecards]);
  const COLUMNS = useMemo(() => columnsFor(custom), [custom]);

  // Only worked out while the menu is open: it walks every column for every row.
  const coverage = useMemo(
    () => (open ? new Map(COLUMNS.map((c) => [c.id, columnCoverage(c, rows, ctx)])) : new Map<string, number | null>()),
    [open, rows, ctx, COLUMNS],
  );

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  // Hiding and showing keeps the order you have dragged the columns into.
  const toggle = (id: string) => onChange(selected.has(id) ? order.filter((x) => x !== id) : insertColumn(order, id, custom));

  const setTier = (tier: ColumnDef["tier"], on: boolean) => {
    const ids = COLUMNS.filter((c) => c.tier === tier).map((c) => c.id);
    onChange(on ? ids.reduce((o, id) => insertColumn(o, id, custom), order) : order.filter((id) => !ids.includes(id)));
  };

  const renderTier = (tier: ColumnDef["tier"], title: string) => {
    const cols = COLUMNS.filter((c) => c.tier === tier);
    const sections = [...new Set(cols.map((c) => c.section))];
    return (
      <div className="picker-tier">
        <div className="picker-head">
          <strong>{title}</strong>
          <span>
            <button className="link" onClick={() => setTier(tier, true)}>
              All
            </button>{" "}
            ·{" "}
            <button className="link" onClick={() => setTier(tier, false)}>
              None
            </button>
          </span>
        </div>
        {sections.map((s) => (
          <fieldset key={s}>
            <legend>{s}</legend>
            {cols
              .filter((c) => c.section === s)
              .map((c) => {
                const cov = coverage.get(c.id);
                return (
                  <label key={c.id} title={c.title}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    <span className="picker-label">{c.label}</span>
                    {cov != null && (
                      <span
                        className={`cov ${cov < 0.5 ? "cov-low" : cov < 0.9 ? "cov-mid" : ""}`}
                        title={`${Math.round(cov * rows.length)} of ${rows.length} stocks in this list have a value`}
                      >
                        {Math.round(cov * 100)}
                      </span>
                    )}
                  </label>
                );
              })}
          </fieldset>
        ))}
      </div>
    );
  };

  return (
    <div className="picker" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Columns ({order.length}) ▾
      </button>
      {open && (
        <div className="picker-menu" role="dialog" aria-label="Choose columns">
          <p className="picker-hint muted">
            The number after each name is the share of this list (%) that has data for it. Drag a column header in the table to move it.
          </p>
          {renderTier("standard", "Standard")}
          <hr />
          {renderTier("extra", "Scores & key figures")}
          <div className="picker-settings">
            <label title="Coloured dots like the spreadsheet's icons: green = good, yellow = in between, red = weak">
              <input type="checkbox" checked={ctx.trafficLights} onChange={(e) => onTrafficLights(e.target.checked)} /> Traffic lights
            </label>
            <label title="On: points are blended between the tiers, so P/E 14.9 and 15.1 score almost the same. Off: the hard steps from the spreadsheet.">
              <input type="checkbox" checked={ctx.scoring.smooth !== false} onChange={(e) => onSmoothScoring(e.target.checked)} /> Smooth scores
            </label>
            <label title="A score is only shown when at least this share of the scorecard's points has data. Below it the badge is greyed out.">
              Min. data for a score
              <select value={Math.round((ctx.scoring.minCoverage ?? 0.6) * 100)} onChange={(e) => onMinCoverage(Number(e.target.value))}>
                {MIN_COVERAGE_CHOICES.map((p) => (
                  <option key={p} value={p}>
                    {p === 0 ? "Off" : `${p} %`}
                  </option>
                ))}
              </select>
            </label>
            <label title="Period of the Score change column. It follows the list's scorecard (Rank by), or Sundhet.">
              Score change over
              <select value={ctx.trendDays} onChange={(e) => onTrendDays(Number(e.target.value))}>
                {TREND_CHOICES.map(([days, label]) => (
                  <option key={days} value={days}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="picker-foot">
            <span />
            <button className="link" onClick={() => onChange(undefined)}>
              Reset to default
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
