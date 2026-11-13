import { describe, expect, it } from "vitest";
import { fromAnnual, fromDividends, fromSummary } from "./yahooParse";

describe("yahooParse", () => {
  it("reads key statistics and converts fractions to percent", () => {
    const f = fromSummary({
      summaryDetail: { dividendYield: 0.031, payoutRatio: 0.45, trailingPE: 14.2, beta: 0.9 },
      defaultKeyStatistics: { pegRatio: 1.3, priceToBook: 2.1, trailingEps: 8.5 },
      financialData: { returnOnEquity: 0.18, operatingMargins: 0.22, quickRatio: 1.1, freeCashflow: 50, totalRevenue: 500, debtToEquity: 85 },
    });
    expect(f).toMatchObject({ dividendYield: 3.1, payoutRatio: 45, pe: 14.2, peg: 1.3, pb: 2.1, roe: 18, operatingMargin: 22, quickRatio: 1.1, fcfMargin: 10, debtToEquity: 0.85, eps: 8.5 });
  });

  it("derives growth, equity ratio and liabilities/equity from annual statements", () => {
    const rows = [
      { date: new Date("2021-12-31"), TYPE: "FINANCIALS", totalRevenue: 100, netIncome: 10, dilutedEPS: 1, EBITDA: 20, operatingIncome: 15 },
      { date: new Date("2022-12-31"), TYPE: "FINANCIALS", totalRevenue: 110, netIncome: 12, dilutedEPS: 1.2, EBITDA: 22, operatingIncome: 18 },
      { date: new Date("2023-12-31"), TYPE: "FINANCIALS", totalRevenue: 121, netIncome: 11, dilutedEPS: 1.1, EBITDA: 25, operatingIncome: 18 },
      { date: new Date("2024-12-31"), TYPE: "FINANCIALS", totalRevenue: 133.1, netIncome: 15, dilutedEPS: 1.5, EBITDA: 30, operatingIncome: 21.6, freeCashFlow: 13.31 },
      { date: new Date("2024-12-31"), TYPE: "BALANCE_SHEET", totalAssets: 400, stockholdersEquity: 160, totalLiabilitiesNetMinorityInterest: 240 },
    ];
    const f = fromAnnual(rows);
    expect(f.revenueGrowth).toBeCloseTo(10);
    expect(f.revenueCagr3y).toBeCloseTo(10);
    expect(f.earningsGrowth).toBeCloseTo(36.36, 1);
    expect(f.operatingIncomeGrowth).toBeCloseTo(20);
    expect(f.equityRatio).toBeCloseTo(40);
    expect(f.debtToEquity).toBeCloseTo(1.5);
    expect(f.fcfMargin).toBeCloseTo(10);
  });

  it("turns dividend events into growth and a track record", () => {
    const today = new Date("2026-03-01");
    const ev = [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y, i) => ({ date: `${y}-05-01`, amount: 1 + i * 0.1 }));
    const f = fromDividends(ev, today);
    expect(f.dividendYearsPaid).toBe(12);
    expect(f.dividendYearsRaised).toBe(11);
    expect(f.dividendCagr10y).toBeGreaterThan(0);
  });
});

describe("ROIC, net debt/EBITDA and FCF yield", () => {
  it("derives ND/EBITDA and FCF yield from financialData", () => {
    const f = fromSummary({
      summaryDetail: { marketCap: 1000, currency: "SEK" },
      financialData: { totalDebt: 300, totalCash: 100, ebitda: 100, freeCashflow: 60, financialCurrency: "SEK" },
    });
    expect(f.netDebtEbitda).toBe(2);
    expect(f.fcfYield).toBeCloseTo(6, 5);
  });

  it("skips ND/EBITDA when EBITDA is negative and FCF yield when currencies differ", () => {
    const f = fromSummary({
      summaryDetail: { marketCap: 1000, currency: "USD" },
      financialData: { totalDebt: 300, totalCash: 100, ebitda: -5, freeCashflow: 60, financialCurrency: "TWD" },
    });
    expect(f.netDebtEbitda).toBeUndefined();
    expect(f.fcfYield).toBeUndefined();
  });

  it("computes ROIC from EBIT after tax and invested capital, latest year first", () => {
    const f = fromAnnual([
      { date: "2024-12-31", EBIT: 100, taxRateForCalcs: 0.25, investedCapital: 500 },
      { date: "2023-12-31", EBIT: 50, investedCapital: 500 },
    ]);
    expect(f.roic).toBeCloseTo(15, 5);
  });

  it("builds invested capital from equity, debt and cash when Yahoo has no figure", () => {
    const f = fromAnnual([{ date: "2024-12-31", EBIT: 80, stockholdersEquity: 300, totalDebt: 150, cashAndCashEquivalents: 50 }]);
    expect(f.roic).toBeCloseTo(16, 5); // 80 × 0.8 / 400
  });
});
