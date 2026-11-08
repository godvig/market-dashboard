// Yahoo Finance via the community `yahoo-finance2` package.
// No API key, global coverage (e.g. VOLV-B.ST, ASML.AS), but unofficial:
// Yahoo can change or throttle it without notice.
import YahooFinance from "yahoo-finance2";
import type { Candle, Fundamentals, HistoryRange, Quote, SearchResult } from "../../shared/types";
import { startDate, toPct, type MarketProvider } from "./types";
import { clean, fromAnnual, fromDividends, fromSummary } from "./yahooParse";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const yahooProvider: MarketProvider = {
  name: "yahoo",
  batchQuotes: true,

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

  /**
   * Three calls, each allowed to fail on its own: key statistics, annual
   * statements (growth, equity ratio) and dividend history.
   */
  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const noValidate = { validateResult: false } as const;
    const [summary, annual, dividends] = await Promise.all([
      yf
        .quoteSummary(symbol, { modules: ["summaryDetail", "defaultKeyStatistics", "financialData"] }, noValidate)
        .catch(() => null),
      yf
        .fundamentalsTimeSeries(symbol, { period1: new Date(Date.now() - 6 * 366 * 86_400_000), type: "annual", module: "all" }, noValidate)
        .catch(() => null),
      yf.chart(symbol, { period1: "1995-01-01", interval: "1mo", events: "div" }, noValidate).catch(() => null),
    ]);
    if (!summary && !annual && !dividends) throw new Error(`No key figures from Yahoo for ${symbol}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const divEvents = ((dividends as any)?.events?.dividends ?? []) as { date: Date; amount: number }[];
    return clean({
      ...fromSummary((summary ?? {}) as Record<string, unknown>),
      ...fromAnnual(((annual ?? []) as unknown) as Record<string, unknown>[]),
      ...fromDividends(Array.isArray(divEvents) ? divEvents : Object.values(divEvents)),
    });
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
