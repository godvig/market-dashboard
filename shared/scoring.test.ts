// Checks the presets against values and results from the Analysark spreadsheet
// (Microsoft row, sheet "Utd.poäng & Sundhetspoäng").
import { describe, expect, it } from "vitest";
import { emptyMetrics } from "./analysis";
import { SCORECARD_BY_ID, score } from "./scoring";
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

describe("presets match the spreadsheet", () => {
  it("Kvalitet & värdering = POÄNG (3-2-1-0) = 17", () => {
    expect(score(card("quality"), src(msft)).points).toBe(17);
  });
  it("Tillväxt = POÄNG = 49", () => {
    expect(score(card("growth"), src(msft)).points).toBe(49);
  });
  it("Tillväxt (graderad) = POÄNG2 = 54", () => {
    expect(score(card("growthGraded"), src(msft)).points).toBe(54);
  });
  it("Utdelningspoäng (tillväxt) = 23", () => {
    expect(score(card("divGrowth"), src(msft)).points).toBe(23);
  });
  it("Utdelning = 18 (Excel shows 15 because of the AN/AN2 typo that skipped 10-year dividend growth)", () => {
    expect(score(card("dividend"), src(msft)).points).toBe(18);
  });
});

describe("engine", () => {
  it("leaves out missing values and reports coverage", () => {
    const r = score(card("quality"), src({ pe: 9, roe: 25 }));
    expect(r.points).toBe(6);
    expect(r.max).toBe(6);
    expect(r.pct).toBe(100);
    expect([r.covered, r.total]).toEqual([2, 9]);
    expect(r.fullMax).toBe(27);
  });

  it("scores losses and negative equity as 0, not as the best tier", () => {
    const r = score(card("quality"), src({ pe: -5, debtToEquity: -4.07 }));
    expect(r.points).toBe(0);
  });

  it("applies Sundhet weights: same data, different profiles", () => {
    const f = { roe: 25, pe: 12 };
    const mine = score(card("sundhet"), src(f));
    const ai = score(card("sundhetAi"), src(f));
    expect(mine.points).toBe(1 + 3); // ROE weight 1, P/E weight 3
    expect(ai.points).toBe(3 + 2); // ROE weight 3, P/E weight 2
  });

  it("uses computed metrics and own assessments", () => {
    const r = score(card("sundhetAi"), src({}, { volatility: 8, sharpe: 1.2 }, { trendSector: 3, trendIndustry: 2 }));
    // vol <10 → 1×1, sharpe 1–1.5 → ½×2, trend sector strong → 1, industry not strong → 0
    expect(r.points).toBe(3);
    expect(r.covered).toBe(4);
  });

  it("maps graded scores with minus points onto 0–100", () => {
    const shrinking = Object.fromEntries(Object.keys(msft).filter((k) => /Growth|Cagr/.test(k)).map((k) => [k, -10]));
    expect(score(card("growthGraded"), src(shrinking)).pct).toBe(0);
  });

  it("Key Metrics quantifies qualitative tiers 1–5", () => {
    const r = score(card("keyMetrics"), src({ fcfMargin: 12, revenueGrowth: -8, dividendYield: 0 }));
    expect(r.details.filter((d) => d.points != null).map((d) => d.points)).toEqual([5, 1, 1]);
  });
});
