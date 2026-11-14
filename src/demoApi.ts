// Demo mode: runs entirely in the browser on the deterministic fake data from
// the mock provider, so the app can be hosted as static files (GitHub Pages).
// Lists are saved in the visitor's own browser (localStorage) by useStore.
import { computeMetrics, emptyMetrics } from "../shared/analysis";
import { mergeImported } from "../shared/importMerge";
import {
  FUNDAMENTAL_KEYS,
  type Candle,
  type FundamentalKey,
  type Fundamentals,
  type Health,
  type HistoryRange,
  type Quote,
  type SearchResult,
  type UserStore,
  type WatchlistRow,
} from "../shared/types";
import { snapshotOf, today, type Snapshot } from "../shared/scoreHistory";
import { mockProvider } from "../server/providers/mock";

const RISK_FREE = 2;
/** Fixed demo rates: SEK per unit of each currency. */
const RATES: Record<string, number> = { SEK: 1, USD: 10.6, EUR: 11.5, GBP: 13.6, NOK: 0.98, DKK: 1.54, CHF: 12.1 };

/** Names for the demo tickers (the prices and key figures are still made up). */
const NAMES: Record<string, string> = {
  "ATCO-A.ST": "Atlas Copco A", "SAND.ST": "Sandvik", "HM-B.ST": "H&M B", "SHB-A.ST": "Handelsbanken A",
  "SEB-A.ST": "SEB A", "TELIA.ST": "Telia Company", "AZN.ST": "AstraZeneca", GOOGL: "Alphabet Inc.",
  AMZN: "Amazon.com Inc.", META: "Meta Platforms", QQQ: "Invesco QQQ Trust", VT: "Vanguard Total World Stock ETF",
  "NOVO-B.CO": "Novo Nordisk B", "SAP.DE": "SAP SE", "NESN.SW": "Nestlé S.A.",
};

/** Listing currency from the ticker suffix. */
const currencyOf = (symbol: string, fallback: string) =>
  symbol.endsWith(".ST") ? "SEK" : symbol.endsWith(".CO") ? "DKK" : symbol.endsWith(".SW") ? "CHF"
  : /\.(AS|DE|PA|MI|MC|HE)$/.test(symbol) ? "EUR" : symbol.endsWith(".OL") ? "NOK" : symbol.endsWith(".L") ? "GBP" : fallback;

const defined = (f: Fundamentals): Fundamentals =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => typeof v === "number" && Number.isFinite(v)));

/** A starting setup with a couple of categories, so the sidebar shows what it can do. */
const DEMO_STORE: UserStore = {
  version: 2,
  groups: [
    { id: "demo-se", name: "Sweden" },
    { id: "demo-us", name: "United States" },
  ],
  lists: [
    { id: "demo-large", name: "Large caps", groupId: "demo-se", symbols: ["VOLV-B.ST", "ERIC-B.ST", "INVE-B.ST", "ATCO-A.ST", "SAND.ST", "HM-B.ST"], scorecardId: "sundhet" },
    { id: "demo-div", name: "Dividend ideas", groupId: "demo-se", symbols: ["SHB-A.ST", "SEB-A.ST", "TELIA.ST", "AZN.ST"], scorecardId: "dividend" },
    { id: "demo-tech", name: "Big tech", groupId: "demo-us", symbols: ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META"], scorecardId: "growth" },
    { id: "demo-etf", name: "ETFs", groupId: "demo-us", symbols: ["SPY", "QQQ", "VT"] },
    { id: "demo-eu", name: "Europe", symbols: ["ASML.AS", "NOVO-B.CO", "SAP.DE", "NESN.SW"], scorecardId: "custom-compounders" },
  ],
  // An example of a scorecard built in the editor, so "Yours" isn't empty on a first visit.
  scorecards: [
    {
      id: "custom-compounders",
      name: "Compounders",
      description: "Companies that earn a lot on their capital, turn profit into cash and don't need debt to do it.",
      origin: "Demo scorecard",
      criteria: [
        { id: "roic", label: "ROIC", metric: "roic", weight: 2, tiers: [{ gte: 20, points: 3 }, { gte: 12, points: 2 }, { gte: 8, points: 1 }, { points: 0 }] },
        { id: "fcf", label: "FCF margin", metric: "fcfMargin", tiers: [{ gte: 15, points: 3 }, { gte: 8, points: 2 }, { gte: 3, points: 1 }, { points: 0 }] },
        { id: "nde", label: "Net debt/EBITDA", metric: "netDebtEbitda", tiers: [{ lt: 1, points: 3 }, { lt: 2, points: 2 }, { lt: 3, points: 1 }, { points: 0 }] },
        { id: "growth", label: "Revenue growth", metric: "revenueGrowth", tiers: [{ gte: 10, points: 3 }, { gte: 5, points: 2 }, { gte: 0, points: 1 }, { points: 0, cliff: true }] },
        { id: "pe", label: "P/E", metric: "pe", tiers: [{ gt: 0, lt: 20, points: 2 }, { gt: 0, lt: 35, points: 1 }, { points: 0 }] },
      ],
    },
  ],
};

const STORE_KEY = "market-dashboard.store";

/** The visitor's saved store (useStore writes it on every change). */
function savedStore(): UserStore | null {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    return saved ? (JSON.parse(saved) as UserStore) : null;
  } catch {
    return null;
  }
}

async function row(symbol: string, store: UserStore | null): Promise<WatchlistRow> {
  try {
    const [q] = await mockProvider.getQuotes([symbol]);
    if (!q) throw new Error(`${symbol} not found`);
    const quote: Quote = {
      ...q,
      name: NAMES[symbol] ?? q.name.replace(" (demo)", ""),
      currency: currencyOf(symbol, q.currency),
      source: "demo",
    } as Quote;
    const [history, main] = await Promise.all([
      mockProvider.getHistory!(symbol, "5y"),
      mockProvider.getFundamentals!(symbol),
    ]);
    const fromQuote: Fundamentals = {};
    for (const k of FUNDAMENTAL_KEYS) {
      const v = (q as unknown as Record<string, unknown>)[k];
      if (typeof v === "number") fromQuote[k] = v;
    }
    // Same order as the server: made-up figures first, then anything imported from a file.
    const api = { ...defined(fromQuote), ...defined(main) };
    const sources = Object.fromEntries(Object.keys(api).map((k) => [k, "demo"])) as Partial<Record<FundamentalKey, string>>;
    const merged = mergeImported(api, sources, store?.imported?.[symbol], store?.settings?.importMaxAgeDays);
    return {
      quote,
      metrics: history.length ? computeMetrics(history, RISK_FREE) : emptyMetrics,
      fx: RATES[quote.currency] ?? null,
      fundamentals: merged.fundamentals,
      sources: merged.sources,
    };
  } catch (err) {
    const blank: Quote = { symbol, name: symbol, currency: "", price: NaN, change: NaN, changePct: NaN };
    return { quote: blank, metrics: emptyMetrics, fx: null, fundamentals: {}, error: (err as Error).message };
  }
}

/** Deterministic pseudo-random numbers per symbol, so the made-up history looks the same on every visit. */
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * A made-up year of weekly snapshots ending in today's figures: every value
 * drifts on its own random walk backwards in time, so scores move a little.
 */
function demoSnapshots(r: WatchlistRow): Snapshot[] {
  const now = snapshotOf(r);
  if (!now) return [];
  const rand = rng(r.quote.symbol);
  const walk = (o: Record<string, number>) => {
    const state = Object.fromEntries(Object.keys(o).map((k) => [k, 0]));
    return (step: number) =>
      Object.fromEntries(
        Object.entries(o).map(([k, v]) => {
          state[k] += (rand() - 0.5) * 0.08 * (step > 0 ? 1 : 0);
          return [k, Number((v * (1 + state[k]) + (Math.abs(v) < 1 ? state[k] : 0)).toPrecision(4))];
        }),
      );
  };
  const wf = walk(now.f as Record<string, number>);
  const wm = walk(now.m as Record<string, number>);
  const out: Snapshot[] = [];
  const day = Date.parse(now.d + "T00:00:00Z");
  for (let i = 0; i <= 52; i++) out.push({ d: today(new Date(day - i * 7 * 86_400_000)), f: wf(i), m: wm(i) });
  return out.reverse();
}

export const demoApi = {
  health: async (): Promise<Health> => ({ provider: "demo", fallback: "demo", baseCurrency: "SEK" }),
  watchlist: (symbols: string[]): Promise<WatchlistRow[]> => {
    const store = savedStore();
    return Promise.all(symbols.map((s) => row(s, store)));
  },
  history: (symbol: string, range: HistoryRange): Promise<Candle[]> => mockProvider.getHistory!(symbol, range),
  snapshots: async (symbol: string): Promise<Snapshot[]> => demoSnapshots(await row(symbol, savedStore())),
  search: async (q: string): Promise<SearchResult[]> => {
    const hits = await mockProvider.search!(q);
    const typed = q.trim().toUpperCase();
    // Any ticker works in the demo, so offer what was typed as well.
    return typed && !hits.some((h) => h.symbol === typed)
      ? [...hits, { symbol: typed, name: `${typed} (demo data)`, exchange: "DEMO" }]
      : hits;
  },
  // Nothing on a server: useStore falls back to the copy in this browser, or the demo setup.
  getStore: async (): Promise<UserStore | null> => savedStore() ?? DEMO_STORE,
  saveStore: async (store: UserStore): Promise<UserStore> => store,
};
