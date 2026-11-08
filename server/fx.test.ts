import { describe, expect, it } from "vitest";
import { createFx, normaliseCurrency } from "./fx";

describe("fx", () => {
  it("handles minor units like pence", () => {
    expect(normaliseCurrency("GBp")).toEqual({ code: "GBP", divisor: 100 });
    expect(normaliseCurrency("usd")).toEqual({ code: "USD", divisor: 1 });
  });

  it("returns 1 for the base currency and converts with offline rates", async () => {
    const fx = createFx("SEK", true);
    expect(await fx.rate("SEK")).toBe(1);
    expect(await fx.rate("USD")).toBeCloseTo(10.6);
    expect(await fx.rate("GBp")).toBeCloseTo(0.136);
    expect(await fx.rate("XYZ")).toBeNull();
    expect(await fx.rate(undefined)).toBeNull();
  });
});
