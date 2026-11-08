// Börsdata (https://borsdata.se) REST API v1. Requires an API key from
// "Min sida → API" (Pro+ membership). Nordic instruments with Pro+, global
// instruments too where the key allows it. End-of-day prices.
//
// Docs: https://github.com/Borsdata-Sweden/API · Swagger: https://apidoc.borsdata.se/swagger
// Limits: 100 calls per 10 s (HTTP 429 + Retry-After), aim for < 10 000/day.
//
// Tickers: Börsdata's instrument list carries each stock's Yahoo symbol, so the
// app keeps using Yahoo-style tickers (VOLV-B.ST) and maps them to Börsdata ids.
import { createHash } from "node:crypto";
import type { Candle, Fundamentals, HistoryRange, Quote, SearchResult } from "../../shared/types";
import { cached } from "../cache";
import { startDate, type MarketProvider } from "./types";

const BASE = "https://apiservice.borsdata.se/v1";
const DAY = 86_400_000;

interface Instrument {
  insId: number;
  name: string;
  ticker: string;
  yahoo?: string;
  isin?: string;
  stockPriceCurrency?: string;
  reportCurrency?: string;
  marketId?: number;
  countryId?: number;
  global?: boolean;
}
interface PriceRow { d: string; o?: number; h?: number; l?: number; c: number; v?: number }
interface KpiMeta { kpiId: number; nameSv?: string; nameEn?: string; format?: string; isString?: boolean }
interface KpiValue { i: number; n?: number | null; s?: string | null }

/**
 * Börsdata KPI names (Swedish / English) for each key figure. The numeric
 * KPI ids are looked up from /instruments/kpis/metadata at runtime; override
 * with e.g. BORSDATA_KPI_PE=2 if a name ever changes.
 */
const KPI_NAMES: Partial<Record<keyof Fundamentals, string[]>> = {
  dividendYield: ["Direktavkastning", "Dividend Yield"],
  payoutRatio: ["Utdelningsandel", "Dividend Payout", "Payout Ratio"],
  dividendPerShare: ["Utdelning/aktie", "Utdelning", "Dividend/Share", "Dividend"],
  pe: ["P/E"],
  forwardPe: ["P/E (fwd)", "Forward P/E"],
  peg: ["PEG"],
  ps: ["P/S"],
  pb: ["P/B"],
  evEbit: ["EV/EBIT"],
  evEbitda: ["EV/EBITDA"],
  eps: ["Vinst/aktie", "EPS", "Earnings/Share"],
  roe: ["ROE", "Avkastning på eget kapital", "Return on Equity"],
  roa: ["ROA", "Avkastning på totalt kapital", "Return on Assets"],
  profitMargin: ["Vinstmarginal", "Profit Margin"],
  operatingMargin: ["Rörelsemarginal", "EBIT-marginal", "Operating Margin", "EBIT Margin"],
  ebitdaMargin: ["EBITDA-marginal", "EBITDA Margin"],
  fcfMargin: ["FCF-marginal", "FCF Margin"],
  quickRatio: ["Kassalikviditet", "Quick Ratio"],
  debtToEquity: ["Skuldsättningsgrad", "Debt/Equity"],
  equityRatio: ["Soliditet", "Equity Ratio"],
  netDebtEbitda: ["Nettoskuld/EBITDA", "Net Debt/EBITDA"],
  beta: ["Beta"],
  marketCap: ["Börsvärde", "Market Cap"],
};

/**
 * Growth: Börsdata computes CAGR over 1/3/5/10 years for a base KPI
 * (/instruments/kpis/{id}/{N}year/cagr). Prefix → base KPI names.
 */
const GROWTH_BASES: Record<"revenue" | "earnings" | "eps" | "ebitda" | "dividend", string[]> = {
  revenue: ["Omsättning", "Revenue", "Sales"],
  earnings: ["Vinst", "Nettoresultat", "Earnings", "Net Income"],
  eps: ["Vinst/aktie", "EPS", "Earnings/Share"],
  ebitda: ["EBITDA"],
  dividend: ["Utdelning/aktie", "Utdelning", "Dividend/Share", "Dividend"],
};
const OPERATING_INCOME = ["Rörelseresultat", "EBIT", "Operating Income"];
const GROWTH_PERIODS: [string, string][] = [["1year", "Growth"], ["3year", "Cagr3y"], ["5year", "Cagr5y"], ["10year", "Cagr10y"]];

const PERCENT_KEYS = new Set<string>([
  "dividendYield", "payoutRatio", "roe", "roa", "profitMargin", "operatingMargin", "ebitdaMargin", "fcfMargin", "equityRatio",
]);

const norm = (s?: string) => (s ?? "").toLowerCase().replace(/\s+/g, "");
const median = (xs: number[]) => {
  const s = xs.filter((x) => Number.isFinite(x) && x !== 0).map(Math.abs).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

export function borsdataProvider(apiKey: string, env: NodeJS.ProcessEnv = {}): MarketProvider {
  // Cache keys include a hash of the API key, so a new key never sees stale data.
  const ns = "borsdata:" + createHash("sha1").update(apiKey).digest("hex").slice(0, 8);

  // --- HTTP with a simple rate limiter (max ~9 calls/second) and 429 retry ---
  const sent: number[] = [];
  async function call<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const now = Date.now();
      while (sent.length && now - sent[0] > 10_000) sent.shift();
      if (sent.length >= 90) await new Promise((r) => setTimeout(r, 10_000 - (now - sent[0]) + 50));
      sent.push(Date.now());

      const qs = new URLSearchParams({ authKey: apiKey, ...params }); // must be exactly "authKey"
      const res = await fetch(`${BASE}${path}?${qs}`);
      if (res.status === 429) {
        const wait = Number(res.headers.get("Retry-After") ?? 2) * 1000;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new Error(`Börsdata ${res.status}: check BORSDATA_API_KEY / membership level`);
      if (!res.ok) throw new Error(`Börsdata ${res.status} ${res.statusText} for ${path}`);
      return (await res.json()) as T;
    }
    throw new Error("Börsdata rate limit – try again shortly");
  }

  // --- Instruments and ticker mapping (cached a day) ---
  const instruments = () =>
    cached(`${ns}:instruments`, DAY, async () => {
      const nordic = (await call<{ instruments: Instrument[] }>("/instruments")).instruments ?? [];
      const global = await call<{ instruments: Instrument[] }>("/instruments/global")
        .then((r) => (r.instruments ?? []).map((i) => ({ ...i, global: true })))
        .catch(() => [] as Instrument[]); // not included in every membership
      return [...nordic, ...global];
    });

  async function resolve(symbol: string): Promise<Instrument> {
    const s = symbol.toUpperCase();
    const all = await instruments();
    const hit =
      all.find((i) => i.yahoo?.toUpperCase() === s) ??
      all.find((i) => i.ticker?.toUpperCase() === s) ??
      // "VOLV-B.ST" → ticker "VOLV B"
      all.find((i) => i.ticker?.toUpperCase().replace(/\s+/g, "-") === s.replace(/\.[A-Z]+$/, ""));
    if (!hit) throw new Error(`${symbol} not found in Börsdata`);
    return hit;
  }

  const currencyOf = (i: Instrument) => i.stockPriceCurrency || (i.global ? "USD" : "SEK");

  // --- Prices ---
  const prices = (insId: number, from: string) =>
    cached(`${ns}:prices:${insId}:${from}`, 6 * 3_600_000, async () => {
      const r = await call<{ stockPricesList?: PriceRow[] }>(`/instruments/${insId}/stockprices`, { from });
      return (r.stockPricesList ?? [])
        .filter((p) => p.c != null)
        .map((p): Candle => ({
          time: p.d.slice(0, 10),
          open: p.o ?? p.c,
          high: p.h ?? p.c,
          low: p.l ?? p.c,
          close: p.c,
          volume: p.v ?? 0,
        }))
        .sort((a, b) => a.time.localeCompare(b.time));
    });

  const isoDaysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

  // --- KPIs: resolve ids by name, fetch each KPI for all instruments at once ---
  const kpiIds = () =>
    cached(`${ns}:kpi-ids`, DAY, async () => {
      const meta = (await call<{ kpiHistoryMetadatas?: KpiMeta[] }>("/instruments/kpis/metadata")).kpiHistoryMetadatas ?? [];
      const find = (key: string, names: string[]) => {
        const override = env[`BORSDATA_KPI_${key.replace(/[A-Z]/g, (c) => "_" + c).toUpperCase()}`];
        if (override) return Number(override);
        const wanted = names.map(norm);
        return meta.find((k) => !k.isString && (wanted.includes(norm(k.nameSv)) || wanted.includes(norm(k.nameEn))))?.kpiId;
      };
      const ids: Record<string, number> = {};
      for (const [key, names] of Object.entries(KPI_NAMES)) {
        const id = find(key, names!);
        if (id != null) ids[key] = id;
      }
      // Growth bases are stored as "base:<prefix>"
      for (const [prefix, names] of Object.entries(GROWTH_BASES)) {
        const id = find(`${prefix}Base`, names);
        if (id != null) ids[`base:${prefix}`] = id;
      }
      const op = find("operatingIncomeBase", OPERATING_INCOME);
      if (op != null) ids["base:operatingIncome"] = op;
      return ids;
    });

  /** All Nordic instruments' latest value for one KPI, plus the detected scale. */
  const kpiAll = (kpiId: number, group = "last", calc = "latest") =>
    cached(`${ns}:kpi:${kpiId}:${group}:${calc}`, 12 * 3_600_000, async () => {
      const r = await call<{ values?: KpiValue[] }>(`/instruments/kpis/${kpiId}/${group}/${calc}`);
      const values: Record<number, number> = {};
      for (const v of r.values ?? []) if (typeof v.n === "number") values[v.i] = v.n;
      return { values, median: median(Object.values(values)) };
    });

  const kpiOne = (insId: number, kpiId: number, group = "last", calc = "latest") =>
    cached(`${ns}:kpi:${kpiId}:${group}:${calc}:${insId}`, 12 * 3_600_000, async () => {
      const r = await call<{ value?: KpiValue }>(`/instruments/${insId}/kpis/${kpiId}/${group}/${calc}`);
      return typeof r.value?.n === "number" ? r.value.n : null;
    });

  /** Börsdata may return percentages as fractions and market cap in millions; normalise. */
  function scale(key: string, v: number, med: number): number {
    const isPct = PERCENT_KEYS.has(key) || /Growth$|Cagr\d+y$/.test(key);
    if (isPct && med > 0 && med < 1) return v * 100;
    if (key === "marketCap" && med > 0 && med < 1e7) return v * 1e6;
    return v;
  }

  return {
    name: "borsdata",

    async getQuotes(symbols) {
      return Promise.all(
        symbols.map(async (symbol): Promise<Quote> => {
          const inst = await resolve(symbol);
          const year = await prices(inst.insId, isoDaysAgo(370));
          const last = year[year.length - 1];
          const prev = year[year.length - 2];
          if (!last) throw new Error(`No Börsdata prices for ${symbol}`);
          const closes = year.slice(-252).map((c) => c.close);
          return {
            symbol,
            name: inst.name,
            currency: currencyOf(inst),
            exchange: inst.global ? "Börsdata Global" : "Börsdata",
            price: last.close,
            change: prev ? last.close - prev.close : 0,
            changePct: prev ? (last.close / prev.close - 1) * 100 : 0,
            volume: last.volume,
            fiftyTwoWeekHigh: Math.max(...closes),
            fiftyTwoWeekLow: Math.min(...closes),
          };
        }),
      );
    },

    async getHistory(symbol: string, range: HistoryRange) {
      const inst = await resolve(symbol);
      return prices(inst.insId, startDate(range).toISOString().slice(0, 10));
    },

    async getFundamentals(symbol: string): Promise<Fundamentals> {
      const inst = await resolve(symbol);
      const ids = await kpiIds();
      const out: Record<string, number> = {};
      const fetchOne = async (key: string, id: number, group = "last", calc = "latest") => {
        try {
          const all = await kpiAll(id, group, calc);
          let v: number | null | undefined = all.values[inst.insId];
          if (v == null && inst.global) v = await kpiOne(inst.insId, id, group, calc); // global stocks aren't in the bulk list
          if (v != null && Number.isFinite(v)) out[key] = scale(key, v, all.median);
        } catch {
          /* one missing KPI shouldn't hide the rest */
        }
      };
      const jobs: Promise<void>[] = [];
      for (const [key, id] of Object.entries(ids)) {
        if (!key.startsWith("base:")) jobs.push(fetchOne(key, id));
      }
      for (const prefix of Object.keys(GROWTH_BASES)) {
        const id = ids[`base:${prefix}`];
        if (id != null) for (const [group, suffix] of GROWTH_PERIODS) jobs.push(fetchOne(`${prefix}${suffix}`, id, group, "cagr"));
      }
      if (ids["base:operatingIncome"] != null) jobs.push(fetchOne("operatingIncomeGrowth", ids["base:operatingIncome"], "1year", "cagr"));
      await Promise.all(jobs);
      return out as Fundamentals;
    },

    async search(query): Promise<SearchResult[]> {
      const q = query.toLowerCase();
      const all = await instruments();
      return all
        .filter((i) => i.name.toLowerCase().includes(q) || i.ticker?.toLowerCase().includes(q) || i.yahoo?.toLowerCase().includes(q))
        .slice(0, 8)
        .map((i) => ({
          symbol: i.yahoo || i.ticker,
          name: i.name,
          exchange: i.global ? "Börsdata Global" : "Börsdata",
        }));
    },
  };
}
