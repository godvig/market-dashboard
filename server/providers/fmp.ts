// Financial Modeling Prep (https://financialmodelingprep.com), "stable" API.
// Free key: 250 requests/day, end-of-day data, mainly US listings.
import type { Candle, HistoryRange, Quote, SearchResult } from "../../shared/types";
import { getJson, startDate, type MarketProvider } from "./types";

const BASE = "https://financialmodelingprep.com/stable";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export function fmpProvider(apiKey: string): MarketProvider {
  const url = (path: string) => `${BASE}${path}${path.includes("?") ? "&" : "?"}apikey=${apiKey}`;

  return {
    name: "fmp",

    async getQuotes(symbols) {
      return Promise.all(
        symbols.map(async (symbol): Promise<Quote> => {
          const s = encodeURIComponent(symbol);
          const [[q], [p]] = await Promise.all([
            getJson<Row[]>(url(`/quote?symbol=${s}`)),
            getJson<Row[]>(url(`/profile?symbol=${s}`)).catch(() => [{}] as Row[]),
          ]);
          if (!q) throw new Error(`No quote for ${symbol}`);
          const price = q.price ?? 0;
          return {
            symbol,
            name: q.name ?? p?.companyName ?? symbol,
            currency: p?.currency ?? "USD",
            exchange: q.exchange ?? p?.exchange,
            price,
            change: q.change ?? 0,
            changePct: q.changePercentage ?? 0,
            volume: q.volume,
            marketCap: q.marketCap ?? p?.marketCap,
            pe: q.pe,
            dividendYield: p?.lastDividend && price ? (p.lastDividend / price) * 100 : undefined,
            fiftyTwoWeekHigh: q.yearHigh,
            fiftyTwoWeekLow: q.yearLow,
            sector: p?.sector,
          };
        }),
      );
    },

    async getHistory(symbol: string, range: HistoryRange): Promise<Candle[]> {
      const from = startDate(range).toISOString().slice(0, 10);
      const rows = await getJson<Row[]>(url(`/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&from=${from}`));
      return rows
        .map((r) => ({ time: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? 0 }))
        .sort((a, b) => a.time.localeCompare(b.time));
    },

    async search(query): Promise<SearchResult[]> {
      const rows = await getJson<Row[]>(url(`/search-symbol?query=${encodeURIComponent(query)}&limit=8`));
      return rows.map((r) => ({ symbol: r.symbol, name: r.name, exchange: r.exchange }));
    },
  };
}
