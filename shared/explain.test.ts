import { describe, expect, it } from "vitest";
import { explainScore } from "./explain";
import type { MetricSource } from "./metrics";
import type { Scorecard } from "./scoring";

const card: Scorecard = {
  id: "custom-t",
  name: "Test",
  description: "",
  origin: "",
  criteria: [
    { id: "roic", label: "ROIC", metric: "roic", tiers: [{ gte: 15, points: 3 }, { gte: 10, points: 2 }, { points: 0 }] },
    { id: "pe", label: "P/E", metric: "pe", tiers: [{ lt: 15, points: 3 }, { lt: 25, points: 1 }, { points: 0 }] },
    { id: "nde", label: "ND/EBITDA", metric: "netDebtEbitda", tiers: [{ lt: 1, points: 3 }, { points: 0 }] },
  ],
};
const src = (f: Record<string, number>) => ({ fundamentals: f, metrics: {} }) as unknown as MetricSource;
const stepped = { smooth: false, minCoverage: 0 };

describe("explainScore", () => {
  const me = src({ roic: 20, pe: 30, netDebtEbitda: 0.5 }); // 3 + 0 + 3 = 6 of 9
  const peers = [src({ roic: 5, pe: 10, netDebtEbitda: 0.2 }), src({ roic: 12, pe: 12 })];
  const why = explainScore(card, me, peers, stepped);

  it("scores the stock and places it in the list", () => {
    expect(why.pct).toBe(67);
    expect(why.ranked).toBe(3);
    // peers: 0+3+3 = 6/9 → 67, and 2+3 = 5/6 → 83
    expect(why.peerAvg).toBe(75);
    expect(why.rank).toBe(2);
  });

  it("gives each criterion's effect against the average peer, biggest first", () => {
    const by = Object.fromEntries(why.criteria.map((c) => [c.criterion.id, c]));
    // ROIC: 3 vs peer average 1 → +2 of 9 → +22.2
    expect(by.roic.effect).toBeCloseTo(22.22, 1);
    // P/E: 0 vs 3 → −33.3
    expect(by.pe.effect).toBeCloseTo(-33.33, 1);
    // ND/EBITDA: only one peer has it, 3 vs 3 → 0
    expect(by.nde.effect).toBe(0);
    expect(by.nde.peerCount).toBe(1);
    expect(why.criteria[0].criterion.id).toBe("pe");
    expect(by.roic.peerValue).toBe(8.5);
  });

  it("lists missing metrics separately", () => {
    const w = explainScore(card, src({ roic: 20 }), peers, stepped);
    expect(w.missing.map((m) => m.criterion.id)).toEqual(["pe", "nde"]);
    expect(w.criteria.map((c) => c.criterion.id)).toEqual(["roic"]);
  });

  it("has no effects without peers", () => {
    const w = explainScore(card, me, [], stepped);
    expect(w.criteria.every((c) => c.effect == null)).toBe(true);
    expect(w.rank).toBe(1);
    expect(w.peerAvg).toBeNull();
  });
});
