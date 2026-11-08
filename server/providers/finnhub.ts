// Finnhub (https://finnhub.io). Free key: ~60 calls/min, personal use,
// mainly US listings. Historical candles are not on the free plan, so
// history falls back to the fallback provider.
import type { Quote, SearchResult } from "../../shared/types";
import { getJson, type MarketProvider } from "./types";

const BASE = "https://finnhub.io/api/v1";

interface FhQuote { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number }
interface FhProfile { name?: string; currency?: string; exchange?: string; marketCapitalization?: number; finnhubIndustry?: string }
interface FhMetric { metric?: Record<string, number | undefined> }

export function finnhubProvider(apiKey: string): MarketProvider {
  const url = (path: string) => `${BASE}${path}${path.includes("?") ? "&" : "?"}token=${apiKey}`;

  return {
    name: "finnhub",

    async getQuotes(symbols) {
      // Three calls per symbol; results are cached by the server.
      return Promise.all(
        symbols.map(async (symbol): Promise<Quote> => {
          const s = encodeURIComponent(symbol);
          const [q, p, m] = await Promise.all([
            getJson<FhQuote>(url(`/quote?symbol=${s}`)),
            getJson<FhProfile>(url(`/stock/profile2?symbol=${s}`)).catch(() => ({}) as FhProfile),
            getJson<FhMetric>(url(`/stock/metric?symbol=${s}&metric=all`)).catch(() => ({}) as FhMetric),
          ]);
          const metric = m.metric ?? {};
          return {
            symbol,
            name: p.name ?? symbol,
            currency: p.currency ?? "USD",
            exchange: p.exchange,
            price: q.c,
            change: q.d,
            changePct: q.dp,
            marketCap: p.marketCapitalization != null ? p.marketCapitalization * 1e6 : undefined,
            pe: metric.peTTM ?? metric.peBasicExclExtraTTM,
            dividendYield: metric.currentDividendYieldTTM,
            fiftyTwoWeekHigh: metric["52WeekHigh"],
            fiftyTwoWeekLow: metric["52WeekLow"],
            sector: p.finnhubIndustry,
          };
        }),
      );
    },

    async search(query): Promise<SearchResult[]> {
      const res = await getJson<{ result: { symbol: string; description: string; type: string }[] }>(
        url(`/search?q=${encodeURIComponent(query)}`),
      );
      return res.result.slice(0, 8).map((r) => ({ symbol: r.symbol, name: r.description, type: r.type }));
    },
  };
}
