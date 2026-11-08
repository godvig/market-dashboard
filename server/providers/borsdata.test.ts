// Börsdata adapter against a simulated API (shapes from Börsdata's docs/SDKs).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { borsdataProvider } from "./borsdata";

const calls: string[] = [];

function fakeApi(url: string) {
  const u = new URL(url);
  calls.push(u.pathname);
  if (u.searchParams.get("authKey") !== "KEY") return { status: 403, body: {} };
  const p = u.pathname.replace("/v1", "");
  if (p === "/instruments")
    return {
      body: {
        instruments: [
          { insId: 750, name: "Volvo B", ticker: "VOLV B", yahoo: "VOLV-B.ST", stockPriceCurrency: "SEK" },
          { insId: 77, name: "Ericsson B", ticker: "ERIC B", yahoo: "ERIC-B.ST" },
        ],
      },
    };
  if (p === "/instruments/global")
    return { body: { instruments: [{ insId: 9001, name: "Apple", ticker: "AAPL", yahoo: "AAPL", stockPriceCurrency: "USD" }] } };
  if (/^\/instruments\/\d+\/stockprices$/.test(p))
    return {
      body: {
        stockPricesList: [
          { d: "2026-11-05T00:00:00", c: 200, o: 198, h: 201, l: 197, v: 1000 },
          { d: "2026-11-06T00:00:00", c: 210, o: 200, h: 212, l: 199, v: 2000 },
        ],
      },
    };
  if (p === "/instruments/kpis/metadata")
    return {
      body: {
        kpiHistoryMetadatas: [
          { kpiId: 1, nameSv: "Direktavkastning", nameEn: "Dividend Yield", isString: false },
          { kpiId: 2, nameSv: "P/E", nameEn: "P/E", isString: false },
          { kpiId: 20, nameSv: "Utdelningsandel", nameEn: "Dividend Payout", isString: false },
          { kpiId: 50, nameSv: "Börsvärde", nameEn: "Market Cap", isString: false },
          { kpiId: 60, nameSv: "Omsättning", nameEn: "Revenue", isString: false },
        ],
      },
    };
  // Bulk KPI values: yield and payout as fractions, market cap in millions.
  const bulk: Record<string, { i: number; n: number }[]> = {
    "1": [{ i: 750, n: 0.045 }, { i: 77, n: 0.03 }],
    "2": [{ i: 750, n: 11.2 }, { i: 77, n: 25 }],
    "20": [{ i: 750, n: 0.5 }, { i: 77, n: 0.8 }],
    "50": [{ i: 750, n: 450_000 }, { i: 77, n: 280_000 }],
  };
  const m = p.match(/^\/instruments\/kpis\/(\d+)\/last\/latest$/);
  if (m) return { body: { values: bulk[m[1]] ?? [] } };
  // Revenue CAGR as fractions: 3 years 8 %, 10 years 6 %.
  const g = p.match(/^\/instruments\/kpis\/60\/(\d+)year\/cagr$/);
  if (g) return { body: { values: g[1] === "3" ? [{ i: 750, n: 0.08 }, { i: 77, n: 0.02 }] : g[1] === "10" ? [{ i: 750, n: 0.06 }, { i: 77, n: 0.01 }] : [] } };
  const one = p.match(/^\/instruments\/(\d+)\/kpis\/(\d+)\/last\/latest$/);
  if (one) return { body: { value: { i: Number(one[1]), n: one[2] === "2" ? 33 : null } } };
  return { status: 404, body: {} };
}

beforeAll(() => {
  process.env.CACHE_DIR = mkdtempSync(path.join(tmpdir(), "bd-cache-"));
  vi.stubGlobal("fetch", async (url: string) => {
    const { status = 200, body } = fakeApi(url);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
});
afterAll(() => vi.unstubAllGlobals());

describe("borsdataProvider", () => {
  const bd = borsdataProvider("KEY");

  it("maps Yahoo tickers to Börsdata instruments and builds a quote", async () => {
    const [q] = await bd.getQuotes(["VOLV-B.ST"]);
    expect(q).toMatchObject({ symbol: "VOLV-B.ST", name: "Volvo B", currency: "SEK", price: 210, change: 10 });
    expect(q.changePct).toBeCloseTo(5);
  });

  it("finds a stock by its ticker when the Yahoo field is missing", async () => {
    const [q] = await bd.getQuotes(["ERIC-B.ST"]);
    expect(q.name).toBe("Ericsson B");
  });

  it("returns candles sorted by date", async () => {
    const h = await bd.getHistory!("VOLV-B.ST", "1y");
    expect(h.map((c) => c.time)).toEqual(["2026-11-05", "2026-11-06"]);
  });

  it("resolves KPI ids by name and normalises percent and market cap", async () => {
    const f = await bd.getFundamentals!("VOLV-B.ST");
    expect(f.dividendYield).toBeCloseTo(4.5);
    expect(f.payoutRatio).toBeCloseTo(50);
    expect(f.pe).toBe(11.2);
    expect(f.marketCap).toBe(450_000e6);
  });

  it("fetches growth as CAGR over 3/5/10 years and converts fractions to percent", async () => {
    const f = await bd.getFundamentals!("VOLV-B.ST");
    expect(f.revenueCagr3y).toBeCloseTo(8);
    expect(f.revenueCagr10y).toBeCloseTo(6);
    expect(f.revenueCagr5y).toBeUndefined();
  });

  it("asks per instrument for global stocks not in the bulk list", async () => {
    const f = await bd.getFundamentals!("AAPL");
    expect(f.pe).toBe(33);
    const [q] = await bd.getQuotes(["AAPL"]);
    expect(q.currency).toBe("USD");
  });

  it("fails clearly for unknown tickers", async () => {
    await expect(bd.getQuotes(["SPY"])).rejects.toThrow(/not found in Börsdata/);
  });

  it("uses the instrument list from cache on later calls", () => {
    expect(calls.filter((c) => c === "/v1/instruments").length).toBe(1);
  });

  it("explains auth errors", async () => {
    const bad = borsdataProvider("WRONG");
    await expect(bad.search!("volvo")).rejects.toThrow(/BORSDATA_API_KEY/);
  });
});
