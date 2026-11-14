// Score history. Instead of storing scores (which go stale the moment a
// scorecard is edited), we store the key figures behind them: one snapshot
// per stock per day for the last five weeks, then one per week. Any
// scorecard – including one built today – can then be scored back in time,
// and a change in score can be traced to the figures that moved.
import { emptyMetrics } from "./analysis";
import type { MetricSource } from "./metrics";
import { score, type Criterion, type ScoreOptions, type Scorecard } from "./scoring";
import type { Fundamentals, Metrics, StockMeta, WatchlistRow } from "./types";

export interface Snapshot {
  /** Day, YYYY-MM-DD (UTC). */
  d: string;
  /** Key figures that had a value that day. */
  f: Fundamentals;
  /** Price-based metrics that had a value that day. */
  m: Partial<Metrics>;
}

/** Daily snapshots are kept this long; older ones are thinned to one per week. */
export const DAILY_DAYS = 35;
/** About five years of weekly points. */
export const MAX_SNAPSHOTS = 300;

/** Four significant digits: plenty for scoring, and it keeps the file small. */
const round = (v: number) => (v === 0 ? 0 : Number(v.toPrecision(4)));

function compact<T extends object>(o: T): Partial<T> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) if (typeof v === "number" && Number.isFinite(v)) out[k] = round(v);
  return out as Partial<T>;
}

export const today = (now = new Date()) => now.toISOString().slice(0, 10);

/** The figures of a loaded row as a snapshot; null for rows that failed to load. */
export function snapshotOf(row: WatchlistRow, day = today()): Snapshot | null {
  if (row.error || !Number.isFinite(row.quote.price)) return null;
  const f = compact(row.fundamentals) as Fundamentals;
  const m = compact(row.metrics);
  if (!Object.keys(f).length && !Object.keys(m).length) return null;
  return { d: day, f, m };
}

const dayNum = (d: string) => Math.floor(Date.parse(d + "T00:00:00Z") / 86_400_000);
/** Weeks since 1970-01-05 (a Monday), so a week runs Monday–Sunday. */
const weekOf = (d: string) => Math.floor((dayNum(d) - 4) / 7);

/**
 * Adds a snapshot (replacing one from the same day), keeps the list sorted,
 * thins everything older than DAILY_DAYS to the last snapshot of each week
 * and caps the length.
 */
export function addSnapshot(list: Snapshot[], snap: Snapshot): Snapshot[] {
  const merged = [...list.filter((s) => s.d !== snap.d), snap].sort((a, b) => a.d.localeCompare(b.d));
  const cutoff = dayNum(merged[merged.length - 1].d) - DAILY_DAYS;
  const out: Snapshot[] = [];
  for (let i = 0; i < merged.length; i++) {
    const s = merged[i];
    const next = merged[i + 1];
    const old = dayNum(s.d) < cutoff;
    // Old snapshot: keep it only if it is the last one of its week.
    if (old && next && dayNum(next.d) < cutoff && weekOf(next.d) === weekOf(s.d)) continue;
    out.push(s);
  }
  return out.slice(-MAX_SNAPSHOTS);
}

/** Scores a snapshot. Your own assessments aren't historical, so today's are used. */
export const sourceOfSnapshot = (s: Snapshot, meta?: StockMeta): MetricSource => ({
  fundamentals: s.f,
  metrics: { ...emptyMetrics, ...s.m },
  meta,
});

export interface HistoryPoint {
  d: string;
  pct: number | null;
}

export function scoreHistory(card: Scorecard, snaps: Snapshot[], meta?: StockMeta, opts?: ScoreOptions): HistoryPoint[] {
  return snaps.map((s) => ({ d: s.d, pct: score(card, sourceOfSnapshot(s, meta), opts).pct }));
}

export interface CriterionChange {
  criterion: Criterion;
  from: number | null;
  to: number | null;
  /** Change in this criterion's points, in score points (0–100 scale of the later score). */
  effect: number;
}

export interface ScoreChange {
  from: HistoryPoint;
  to: HistoryPoint;
  /** Criteria whose points moved, biggest first. */
  changes: CriterionChange[];
}

/** What moved a score between two snapshots. */
export function explainChange(card: Scorecard, a: Snapshot, b: Snapshot, meta?: StockMeta, opts?: ScoreOptions): ScoreChange {
  const sa = score(card, sourceOfSnapshot(a, meta), opts);
  const sb = score(card, sourceOfSnapshot(b, meta), opts);
  const max = sb.max || sa.max;
  const changes = sb.details
    .map((d, i) => {
      const before = sa.details[i];
      const effect = max > 0 ? (((d.points ?? 0) - (before.points ?? 0)) / max) * 100 : 0;
      return { criterion: d.criterion, from: before.value, to: d.value, effect };
    })
    .filter((c) => Math.abs(c.effect) >= 0.05 || (c.from == null) !== (c.to == null))
    .sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect));
  return { from: { d: a.d, pct: sa.pct }, to: { d: b.d, pct: sb.pct }, changes };
}

/** Index of the last snapshot at least `days` before the newest one (or the oldest). */
export function snapshotBefore(snaps: Snapshot[], days: number): number {
  if (!snaps.length) return -1;
  const target = dayNum(snaps[snaps.length - 1].d) - days;
  for (let i = snaps.length - 1; i >= 0; i--) if (dayNum(snaps[i].d) <= target) return i;
  return 0;
}

/** Validates snapshots read from disk or a request. */
export function parseSnapshots(input: unknown): Snapshot[] {
  if (!Array.isArray(input)) return [];
  const out: Snapshot[] = [];
  for (const raw of input.slice(-MAX_SNAPSHOTS)) {
    const o = (raw ?? {}) as Record<string, unknown>;
    if (typeof o.d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.d)) continue;
    const f = o.f && typeof o.f === "object" ? (compact(o.f) as Fundamentals) : {};
    const m = o.m && typeof o.m === "object" ? compact(o.m as Partial<Metrics>) : {};
    out.push({ d: o.d, f, m });
  }
  return out.sort((a, b) => a.d.localeCompare(b.d));
}
