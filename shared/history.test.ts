import { describe, expect, it } from "vitest";
import { dividendRecord, dividendsByYear, growth, growthSet } from "./history";

const series = (values: [number, number][]) => values.map(([year, value]) => ({ year, value }));

describe("growth", () => {
  it("computes 1-year growth and multi-year CAGR", () => {
    const s = series([[2020, 100], [2021, 110], [2022, 121], [2023, 133.1]]);
    expect(growth(s, 1)).toBeCloseTo(10);
    expect(growth(s, 3)).toBeCloseTo(10);
    expect(growth(s, 5)).toBeNull();
  });

  it("measures 1-year improvement from a loss as positive, but no CAGR from a loss", () => {
    const s = series([[2022, -50], [2023, 25]]);
    expect(growth(s, 1)).toBeCloseTo(150);
    expect(growth(series([[2020, -10], [2023, 30]]), 3)).toBeNull();
  });

  it("builds prefixed keys", () => {
    const s = series([[2020, 100], [2023, 200]]);
    expect(growthSet(s, "revenue")).toEqual({ revenueCagr3y: expect.closeTo(25.99, 1) });
  });
});

describe("dividends", () => {
  const today = new Date("2026-06-01");
  const pay = (d: string, amount: number) => ({ date: d, amount });

  it("sums per year, skips the current year and fills gaps with 0", () => {
    const y = dividendsByYear([pay("2022-05-01", 1), pay("2022-11-01", 1), pay("2024-05-01", 3), pay("2026-05-01", 9)], today);
    expect(y).toEqual(series([[2022, 2], [2023, 0], [2024, 3]]));
  });

  it("counts paid, no-cut and raise streaks from the latest complete year", () => {
    const y = series([[2018, 1], [2019, 1.2], [2020, 0.6], [2021, 0.8], [2022, 0.8], [2023, 1.0], [2024, 1.1], [2025, 1.2]]);
    expect(dividendRecord(y, 2025)).toEqual({ dividendYearsPaid: 8, dividendYearsNoCut: 5, dividendYearsRaised: 3 });
  });

  it("stops the paid streak at a year without dividend", () => {
    const y = series([[2022, 1], [2023, 0], [2024, 1], [2025, 1]]);
    expect(dividendRecord(y, 2025).dividendYearsPaid).toBe(2);
  });
});
