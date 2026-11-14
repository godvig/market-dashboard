import { describe, expect, it } from "vitest";
import { emptyMetrics } from "./analysis";
import { addSnapshot, explainChange, parseSnapshots, scoreHistory, snapshotBefore, snapshotOf, type Snapshot } from "./scoreHistory";
import type { Scorecard } from "./scoring";
import type { WatchlistRow } from "./types";

const snap = (d: string, roic = 10): Snapshot => ({ d, f: { roic }, m: {} });
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

describe("addSnapshot", () => {
  it("replaces a snapshot from the same day and keeps the list sorted", () => {
    let list = addSnapshot([], snap("2026-11-10", 1));
    list = addSnapshot(list, snap("2026-11-09", 2));
    list = addSnapshot(list, snap("2026-11-10", 3));
    expect(list.map((s) => [s.d, s.f.roic])).toEqual([
      ["2026-11-09", 2],
      ["2026-11-10", 3],
    ]);
  });

  it("keeps daily points for five weeks, then one per week", () => {
    let list: Snapshot[] = [];
    const start = "2026-01-05"; // a Monday
    for (let i = 0; i < 120; i++) list = addSnapshot(list, snap(addDays(start, i)));
    const newest = list[list.length - 1].d;
    expect(newest).toBe(addDays(start, 119));
    const recent = list.filter((s) => s.d >= addDays(newest, -35));
    expect(recent.length).toBe(36);
    const old = list.filter((s) => s.d < addDays(newest, -35));
    // Each old week is represented once, by its Sunday.
    expect(old.every((s) => new Date(s.d + "T00:00:00Z").getUTCDay() === 0)).toBe(true);
    expect(new Set(old.map((s) => s.d)).size).toBe(old.length);
  });
});

describe("snapshotOf", () => {
  const row = {
    quote: { symbol: "X", name: "X", currency: "SEK", price: 10, change: 0, changePct: 0 },
    metrics: { ...emptyMetrics, volatility: 23.456789 },
    fx: 1,
    fundamentals: { roic: 12.345678, pe: Number.NaN },
  } as WatchlistRow;

  it("keeps finite values, rounded to four digits", () => {
    expect(snapshotOf(row, "2026-11-14")).toEqual({ d: "2026-11-14", f: { roic: 12.35 }, m: { volatility: 23.46 } });
  });
  it("skips rows that failed", () => {
    expect(snapshotOf({ ...row, error: "nope" })).toBeNull();
  });
});

describe("scoring history", () => {
  const card: Scorecard = {
    id: "custom-h",
    name: "H",
    description: "",
    origin: "",
    criteria: [
      { id: "roic", label: "ROIC", metric: "roic", tiers: [{ gte: 15, points: 2 }, { gte: 10, points: 1 }, { points: 0 }] },
      { id: "pe", label: "P/E", metric: "pe", tiers: [{ lt: 15, points: 2 }, { points: 0 }] },
    ],
  };
  const opts = { smooth: false, minCoverage: 0 };
  const a: Snapshot = { d: "2026-08-01", f: { roic: 8, pe: 12 }, m: {} };
  const b: Snapshot = { d: "2026-11-01", f: { roic: 16, pe: 12 }, m: {} };

  it("scores every snapshot with the card as it is now", () => {
    expect(scoreHistory(card, [a, b], undefined, opts).map((p) => p.pct)).toEqual([50, 100]);
  });

  it("explains what moved the score", () => {
    const c = explainChange(card, a, b, undefined, opts);
    expect(c.from.pct).toBe(50);
    expect(c.to.pct).toBe(100);
    expect(c.changes).toHaveLength(1);
    expect(c.changes[0]).toMatchObject({ from: 8, to: 16, effect: 50 });
  });

  it("finds the snapshot at the start of a period", () => {
    const list = [snap("2026-01-01"), snap("2026-06-01"), snap("2026-10-20"), snap("2026-11-14")];
    expect(snapshotBefore(list, 30)).toBe(1);
    expect(snapshotBefore(list, 1000)).toBe(0);
    expect(snapshotBefore([], 30)).toBe(-1);
  });

  it("parses stored snapshots defensively", () => {
    expect(parseSnapshots([{ d: "2026-11-02", f: { roic: 5, x: "bad" } }, { d: "nope" }, { d: "2026-11-01" }])).toEqual([
      { d: "2026-11-01", f: {}, m: {} },
      { d: "2026-11-02", f: { roic: 5 }, m: {} },
    ]);
  });
});
