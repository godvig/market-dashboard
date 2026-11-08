// Yahoo Finance via the community `yahoo-finance2` package.
// No API key, global coverage (e.g. VOLV-B.ST, ASML.AS), but unofficial:
// Yahoo can change or throttle it without notice.
import YahooFinance from "yahoo-finance2";
import type { Candle, Fundamentals, HistoryRange, Quote, SearchResult } from "../../shared/types";
import { startDate, toPct, type MarketProvider } from "./types";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const yahooProvider: MarketProvider = {
  name: "yahoo",

  async getQuotes(symbols) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any[] = await yf.quote(symbols, { return: "array" });
    return res.map((q): Quote => ({
      symbol: q.symbol,
      name: q.longName ?? q.shortName ?? q.symbol,
      currency: q.currency ?? "",
      exchange: q.fullExchangeName ?? q.exchange,
      price: q.regularMarketPrice ?? 0,
      change: q.regularMarketChange ?? 0,
      changePct: q.regularMarketChangePercent ?? 0,
      volume: q.regularMarketVolume,
      marketCap: q.marketCap,
      pe: q.trailingPE,
      dividendYield: toPct(q.trailingAnnualDividendYield),
      dividendPerShare: q.trailingAnnualDividendRate,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow,
    }));
  },

  async getHistory(symbol: string, range: HistoryRange): Promise<Candle[]> {
    const res = await yf.chart(symbol, { period1: startDate(range), interval: "1d" });
    return res.quotes
      .filter((q) => q.close != null)
      .map((q) => ({
        time: q.date.toISOString().slice(0, 10),
        open: q.open ?? q.close!,
        high: q.high ?? q.close!,
        low: q.low ?? q.close!,
        close: q.close!,
        volume: q.volume ?? 0,
      }));
  },

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await yf.quoteSummary(symbol, {
      modules: ["summaryDetail", "defaultKeyStatistics", "financialData"],
    });
    const s = res.summaryDetail ?? {};
    const k = res.defaultKeyStatistics ?? {};
    const f = res.financialData ?? {};
    return {
      // Forward yield if Yahoo has one, otherwise trailing.
      dividendYield: toPct(s.dividendYield ?? s.trailingAnnualDividendYield),
      payoutRatio: toPct(s.payoutRatio),
      dividendPerShare: s.dividendRate ?? s.trailingAnnualDividendRate,
      pe: s.trailingPE,
      forwardPe: s.forwardPE ?? k.forwardPE,
      ps: s.priceToSalesTrailing12Months,
      pb: k.priceToBook,
      evEbitda: k.enterpriseToEbitda,
      roe: toPct(f.returnOnEquity),
      profitMargin: toPct(f.profitMargins ?? k.profitMargins),
      revenueGrowth: toPct(f.revenueGrowth),
      beta: s.beta ?? k.beta,
      marketCap: s.marketCap,
    };
  },

  async search(query: string): Promise<SearchResult[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await yf.search(query, { quotesCount: 8, newsCount: 0 });
    return (res.quotes ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((q: any) => q.symbol)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((q: any) => ({
        symbol: q.symbol,
        name: q.longname ?? q.shortname ?? q.symbol,
        exchange: q.exchDisp ?? q.exchange,
        type: q.quoteType,
      }));
  },
};
