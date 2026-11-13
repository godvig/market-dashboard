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
    { id: "demo-large", name: "Large caps", groupId: "demo-se", symbols: ["VOLV-B.ST", "ERIC-B.ST", "INVE-B.ST", "ATCO-A.ST", "SAND.ST", "HM-B.ST"] },
    { id: "demo-div", name: "Dividend ideas", groupId: "demo-se", symbols: ["SHB-A.ST", "SEB-A.ST", "TELIA.ST", "AZN.ST"] },
    { id: "demo-tech", name: "Big tech", groupId: "demo-us", symbols: ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META"] },
    { id: "demo-etf", name: "ETFs", groupId: "demo-us", symbols: ["SPY", "QQQ", "VT"] },
    { id: "demo-eu", name: "Europe", symbols: ["ASML.AS", "NOVO-B.CO", "SAP.DE", "NESN.SW"] },
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

export const demoApi = {
  health: async (): Promise<Health> => ({ provider: "demo", fallback: "demo", baseCurrency: "SEK" }),
  watchlist: (symbols: string[]): Promise<WatchlistRow[]> => {
    const store = savedStore();
    return Promise.all(symbols.map((s) => row(s, store)));
  },
  history: (symbol: string, range: HistoryRange): Promise<Candle[]> => mockProvider.getHistory!(symbol, range),
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
