import { describe, expect, it } from "vitest";
import { maxDrawdown, periodReturn, rsi, sma, smaSeries, volatility, ytdReturn } from "./analysis";

describe("analysis", () => {
  it("periodReturn", () => {
    expect(periodReturn([100, 110, 121], 2)).toBeCloseTo(21);
    expect(periodReturn([100], 5)).toBeNull();
  });

  it("sma and smaSeries agree", () => {
    const v = [1, 2, 3, 4, 5];
    expect(sma(v, 3)).toBe(4);
    expect(smaSeries(v, 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("volatility is zero for constant growth", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 * 1.01 ** i);
    expect(volatility(closes)).toBeCloseTo(0, 6);
  });

  it("maxDrawdown", () => {
    expect(maxDrawdown([100, 120, 90, 130, 117])).toBeCloseTo(-25);
    expect(maxDrawdown([1, 2, 3])).toBe(0);
  });

  it("rsi bounds", () => {
    const up = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(rsi(up)).toBe(100);
    const down = Array.from({ length: 30 }, (_, i) => 30 - i);
    expect(rsi(down)).toBeCloseTo(0);
  });

  it("ytdReturn uses previous year's last close", () => {
    const c = (time: string, close: number) => ({ time, open: close, high: close, low: close, close, volume: 0 });
    expect(ytdReturn([c("2025-12-30", 90), c("2025-12-31", 100), c("2026-01-02", 105), c("2026-03-01", 110)])).toBeCloseTo(10);
  });
});
