// Deterministic fake data for offline development, demos and tests.
// Every symbol gets its own reproducible random walk.
import type { Candle, Fundamentals, HistoryRange, Quote, SearchResult } from "../../shared/types";
import { rangeToDays, type MarketProvider } from "./types";

const NAMES: Record<string, [string, string]> = {
  "VOLV-B.ST": ["Volvo AB ser. B", "SEK"],
  "ERIC-B.ST": ["Ericsson B", "SEK"],
  "INVE-B.ST": ["Investor AB ser. B", "SEK"],
  "ASML.AS": ["ASML Holding N.V.", "EUR"],
  AAPL: ["Apple Inc.", "USD"],
  MSFT: ["Microsoft Corporation", "USD"],
  NVDA: ["NVIDIA Corporation", "USD"],
  SPY: ["SPDR S&P 500 ETF Trust", "USD"],
};

function seeded(seedText: string) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function walk(symbol: string): Candle[] {
  const rand = seeded(symbol);
  const drift = (rand() - 0.4) * 0.002;
  const vol = 0.01 + rand() * 0.02;
  let price = 20 + rand() * 400;
  const out: Candle[] = [];
  const end = new Date();
  const d = new Date(end.getTime() - rangeToDays["5y"] * 86_400_000);
  for (; d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const open = price;
    // Box-Muller normal shock
    const z = Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
    price = Math.max(1, price * Math.exp(drift + vol * z));
    const hi = Math.max(open, price) * (1 + rand() * vol * 0.5);
    const lo = Math.min(open, price) * (1 - rand() * vol * 0.5);
    out.push({ time: d.toISOString().slice(0, 10), open, high: hi, low: lo, close: price, volume: Math.round(1e6 * (0.5 + rand())) });
  }
  return out;
}

export const mockProvider: MarketProvider = {
  name: "mock",

  async getQuotes(symbols) {
    return symbols.map((symbol): Quote => {
      const h = walk(symbol);
      const last = h[h.length - 1];
      const prev = h[h.length - 2];
      const year = h.slice(-252).map((c) => c.close);
      const rand = seeded(symbol + "fundamentals");
      const [name, currency] = NAMES[symbol] ?? [`${symbol} (demo)`, "USD"];
      const pe = 8 + rand() * 40;
      const dividendYield = rand() * 5;
      return {
        symbol,
        name,
        currency,
        exchange: "DEMO",
        price: last.close,
        change: last.close - prev.close,
        changePct: (last.close / prev.close - 1) * 100,
        volume: last.volume,
        marketCap: Math.round(1e9 * (5 + rand() * 2000)),
        pe,
        dividendYield,
        dividendPerShare: (last.close * dividendYield) / 100,
        // payout = dividend / earnings = yield × P/E
        payoutRatio: dividendYield * pe,
        fiftyTwoWeekHigh: Math.max(...year),
        fiftyTwoWeekLow: Math.min(...year),
      };
    });
  },

  async getHistory(symbol: string, range: HistoryRange) {
    const cutoff = new Date(Date.now() - rangeToDays[range] * 86_400_000).toISOString().slice(0, 10);
    return walk(symbol).filter((c) => c.time >= cutoff);
  },

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const r = seeded(symbol + "keyfigures");
    const pick = (lo: number, hi: number, d = 1) => Number((lo + r() * (hi - lo)).toFixed(d));
    return {
      forwardPe: pick(6, 35),
      ps: pick(0.5, 12),
      pb: pick(0.8, 15),
      evEbit: pick(6, 40),
      evEbitda: pick(4, 25),
      roe: pick(-5, 45),
      profitMargin: pick(-10, 35),
      revenueGrowth: pick(-15, 40),
      netDebtEbitda: pick(-1, 4, 2),
      beta: pick(0.4, 1.9, 2),
    };
  },

  async search(query): Promise<SearchResult[]> {
    const q = query.toUpperCase();
    return Object.entries(NAMES)
      .filter(([s, [n]]) => s.includes(q) || n.toUpperCase().includes(q))
      .map(([symbol, [name]]) => ({ symbol, name, exchange: "DEMO" }));
  },
};
