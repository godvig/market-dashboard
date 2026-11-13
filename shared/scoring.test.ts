// Checks the presets against values and results from the Analysark spreadsheet
// (Microsoft row, sheet "Utd.poäng & Sundhetspoäng").
import { describe, expect, it } from "vitest";
import { emptyMetrics } from "./analysis";
import { SCORECARD_BY_ID, score, scoreCriterion, type Criterion } from "./scoring";
import type { Fundamentals, Metrics } from "./types";

// Spreadsheet fractions converted to percent.
const msft: Fundamentals = {
  profitMargin: 34.146, pe: 36.9, pb: 12.71, peg: 2.37, roe: 38.82, fcfMargin: 30.63, debtToEquity: 0.9977,
  dividendYield: 0.74, payoutRatio: 27.03,
  earningsGrowth: 22.4, earningsCagr3y: 17.8, earningsCagr5y: 31.4, earningsCagr10y: 17.3,
  dividendGrowth: 9.8, dividendCagr3y: 10.2, dividendCagr5y: 10.1, dividendCagr10y: 10.9,
  epsGrowth: 21.4, epsCagr3y: 19.4, epsCagr5y: 17.5, epsCagr10y: 22,
  revenueGrowth: 12, revenueCagr3y: 15.1, revenueCagr5y: 15.7, revenueCagr10y: 12.2,
  ebitdaGrowth: 23, ebitdaCagr3y: 16.5, ebitdaCagr5y: 18.5, ebitdaCagr10y: 17,
};
const src = (f: Fundamentals, m: Partial<Metrics> = {}, assessments?: Record<string, number>) => ({
  fundamentals: f,
  metrics: { ...emptyMetrics, ...m },
  meta: assessments ? { assessments } : undefined,
});
const card = (id: string) => SCORECARD_BY_ID.get(id)!;
/** The spreadsheet's own behaviour: hard steps, and a score however little data there is. */
const EXCEL = { smooth: false, minCoverage: 0 };

describe("presets match the spreadsheet", () => {
  it("Kvalitet & värdering = POÄNG (3-2-1-0) = 17", () => {
    expect(score(card("quality"), src(msft), EXCEL).points).toBe(17);
  });
  it("Tillväxt = POÄNG = 49", () => {
    expect(score(card("growth"), src(msft), EXCEL).points).toBe(49);
  });
  it("Tillväxt (graderad) = POÄNG2 = 54", () => {
    expect(score(card("growthGraded"), src(msft), EXCEL).points).toBe(54);
  });
  it("Utdelningspoäng (tillväxt) = 23", () => {
    expect(score(card("divGrowth"), src(msft), EXCEL).points).toBe(23);
  });
  it("Utdelning = 17 (Excel shows 15: its typo skipped 10-year dividend growth, +3; the 30–60 % payout sweet spot gives MSFT's lower payout 2 instead of 3, −1)", () => {
    expect(score(card("dividend"), src(msft), EXCEL).points).toBe(17);
  });
});

describe("engine", () => {
  it("leaves out missing values and reports coverage", () => {
    const r = score(card("quality"), src({ pe: 9, roe: 25 }), EXCEL);
    expect(r.points).toBe(6);
    expect(r.max).toBe(6);
    expect(r.pct).toBe(100);
    expect([r.covered, r.total]).toEqual([2, 9]);
    expect(r.fullMax).toBe(27);
  });

  it("scores losses and negative equity as 0, not as the best tier", () => {
    const r = score(card("quality"), src({ pe: -5, debtToEquity: -4.07 }), EXCEL);
    expect(r.points).toBe(0);
  });

  it("applies Sundhet weights: same data, different profiles", () => {
    const f = { roe: 25, pe: 12 };
    const mine = score(card("sundhet"), src(f), EXCEL);
    const ai = score(card("sundhetAi"), src(f), EXCEL);
    expect(mine.points).toBe(1 + 3); // ROE weight 1, P/E weight 3
    expect(ai.points).toBe(3 + 2); // ROE weight 3, P/E weight 2
  });

  it("uses computed metrics and own assessments", () => {
    const r = score(card("sundhetAi"), src({}, { volatility: 8, sharpe: 1.2 }, { trendSector: 3, trendIndustry: 2 }), EXCEL);
    // vol <10 → 1×1, sharpe 1–1.5 → ½×2, trend sector strong → 1, industry not strong → 0
    expect(r.points).toBe(3);
    expect(r.covered).toBe(4);
  });

  it("maps graded scores with minus points onto 0–100", () => {
    const shrinking = Object.fromEntries(Object.keys(msft).filter((k) => /Growth|Cagr/.test(k)).map((k) => [k, -10]));
    expect(score(card("growthGraded"), src(shrinking), EXCEL).pct).toBe(0);
  });

  it("Key Metrics quantifies qualitative tiers 1–5", () => {
    const r = score(card("keyMetrics"), src({ fcfMargin: 12, revenueGrowth: -8, dividendYield: 0 }), EXCEL);
    expect(r.details.filter((d) => d.points != null).map((d) => d.points)).toEqual([5, 1, 1]);
  });
});

describe("smooth scoring", () => {
  const crit = (cardId: string, id: string): Criterion => card(cardId).criteria.find((c) => c.id === id)!;
  const pts = (c: Criterion, v: number, smooth = true) => scoreCriterion(c, v, smooth).points!;

  it("removes the cliff: P/E 14.9 and 15.1 score almost the same", () => {
    const pe = crit("quality", "pe"); // ≤10 → 3, ≤15 → 2, ≤20 → 1
    expect(pts(pe, 14.9, false) - pts(pe, 15.1, false)).toBe(1);
    expect(pts(pe, 14.9) - pts(pe, 15.1)).toBeLessThan(0.05);
    expect(pts(pe, 15)).toBeCloseTo(1.5, 5); // on the edge: halfway between the tiers
  });

  it("gives the spreadsheet's points in the middle of a tier", () => {
    const pe = crit("quality", "pe");
    expect(pts(pe, 12.5)).toBeCloseTo(2, 5);
    expect(pts(pe, 17.5)).toBeCloseTo(1, 5);
    expect(pts(pe, 5)).toBe(3);
    expect(pts(pe, 40)).toBe(0);
  });

  it("never rises when the value gets worse (monotone)", () => {
    for (const [cardId, id, from, to] of [["quality", "pe", 0, 40], ["keyMetrics", "de", 0, 4], ["dividend", "pe", 0, 40]] as const) {
      const c = crit(cardId, id);
      for (let v = from, prev = Infinity; v <= to; v += 0.1) {
        const p = pts(c, v);
        expect(p).toBeLessThanOrEqual(prev + 1e-9);
        prev = p;
      }
    }
    const roe = crit("sundhet", "roe");
    for (let v = -10, prev = -Infinity; v <= 40; v += 0.1) {
      const p = pts(roe, v);
      expect(p).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = p;
    }
  });

  it("stays within the tier range", () => {
    for (const c of [...card("sundhet").criteria, ...card("keyMetrics").criteria, ...card("growthGraded").criteria]) {
      const all = c.tiers.map((t) => t.points);
      for (let v = -50; v <= 100; v += 0.37) {
        const p = scoreCriterion({ ...c, weight: 1 }, v).points!;
        expect(p).toBeGreaterThanOrEqual(Math.min(...all) - 1e-9);
        expect(p).toBeLessThanOrEqual(Math.max(...all) + 1e-9);
      }
    }
  });

  it("keeps hard edges where a blend would be wrong", () => {
    // A loss is not "almost a low P/E".
    expect(pts(crit("quality", "pe"), -0.1)).toBe(0);
    expect(pts(crit("quality", "pe"), 0.1)).toBe(3);
    // No dividend is not "almost a small dividend".
    expect(pts(crit("keyMetrics", "da"), 0)).toBe(1);
    expect(pts(crit("quality", "ua"), 4.9)).toBe(0);
    expect(pts(crit("quality", "ua"), 5)).toBe(3);
  });

  it("handles single thresholds: half the points on the line, full a quarter beyond it", () => {
    const g = crit("growth", "rev3"); // ≥10 % over 10 years → 4 points
    expect(pts(g, 10)).toBeCloseTo(2, 5);
    expect(pts(g, 12.5)).toBe(4);
    expect(pts(g, 7.5)).toBe(0);
  });

  it("does not smooth own assessments", () => {
    const t = crit("sundhet", "trendS"); // "Stark positiv" (3) → 1
    expect(pts(t, 3)).toBe(1);
    expect(pts(t, 2)).toBe(0);
    for (const v of [0, 1, 2, 3]) expect(pts(crit("own", "overall"), v)).toBe(v);
  });

  it("smooth and stepped scores agree on average over a tier ladder", () => {
    const roe = crit("keyMetrics", "roe");
    let a = 0, b = 0, n = 0;
    for (let v = 2.5; v <= 22.5; v += 0.01, n++) {
      a += pts(roe, v);
      b += pts(roe, v, false);
    }
    expect(Math.abs(a - b) / n).toBeLessThan(0.01);
  });
});

describe("minimum coverage", () => {
  it("shows no score when too little data backs it", () => {
    const r = score(card("quality"), src({ pe: 5, roe: 30 })); // 6 of 27 points covered
    expect(r.rawPct).toBe(100);
    expect(r.coverage).toBeCloseTo(6 / 27, 5);
    expect(r.sufficient).toBe(false);
    expect(r.pct).toBeNull();
  });

  it("shows the score once coverage reaches the minimum", () => {
    const f = { profitMargin: 12, pe: 12, pb: 2.5, peg: 1.2, roe: 17, fcfMargin: 3 }; // 18 of 27 = 67 %
    const r = score(card("quality"), src(f));
    expect(r.coverage).toBeCloseTo(18 / 27, 5);
    expect(r.pct).not.toBeNull();
    expect(score(card("quality"), src(f), { minCoverage: 0.75 }).pct).toBeNull();
  });

  it("weighs coverage by points, not by number of criteria", () => {
    // Sundhet: P/E, equity ratio and profit margin weigh 3 each of 37 in total
    // (31 from the spreadsheet + 2 each for FCF margin, ROIC and net debt/EBITDA).
    const r = score(card("sundhet"), src({ pe: 12, equityRatio: 55, profitMargin: 18 }));
    expect([r.covered, r.total]).toEqual([3, 21]);
    expect(r.coverage).toBeCloseTo(9 / 37, 5);
  });

  it("counts the whole range for scales with minus points", () => {
    const r = score(card("growthGraded"), src({ revenueGrowth: 12 }));
    expect(r.coverage).toBeCloseTo(3 / 90, 5); // 2 − (−1) of a total span of 5 × (3 + 4 + 5 + 6)
  });
});

describe("metric fixes", () => {
  it("volatility scores for ordinary large caps (the spreadsheet's <10 % never did)", () => {
    const vol = (v: number) => score(card("sundhet"), src({}, { volatility: v, sharpe: null }), EXCEL).details.find((d) => d.criterion.id === "vol")!.points;
    expect([vol(15), vol(25), vol(35)]).toEqual([2, 1, 0]);
  });

  it("Utdelning rewards a 30–60 % payout most and punishes both extremes", () => {
    const ua = (v: number) => score(card("dividend"), src({ payoutRatio: v }), EXCEL).details.find((d) => d.criterion.id === "ua")!.points;
    expect([3, 10, 25, 45, 65, 75, 90].map(ua)).toEqual([0, 1, 2, 3, 2, 1, 0]);
  });

  it("Sundhet scores the added cash-flow, ROIC and debt-capacity rows", () => {
    const r = score(card("sundhet"), src({ fcfMargin: 12, roic: 11, netDebtEbitda: -0.5 }), EXCEL);
    const pts = Object.fromEntries(r.details.filter((d) => d.points != null).map((d) => [d.criterion.id, d.points]));
    expect(pts).toEqual({ fcf: 2, roic: 4 / 3, nde: 2 });
  });
});
