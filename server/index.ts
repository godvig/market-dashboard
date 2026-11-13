import "dotenv/config";
import express from "express";
import path from "node:path";
import { computeMetrics, emptyMetrics } from "../shared/analysis";
import { DEFAULT_IMPORT_MAX_AGE_DAYS, mergeImported, type Merged } from "../shared/importMerge";
import {
  FUNDAMENTAL_KEYS,
  type FundamentalKey,
  type Fundamentals,
  type HistoryRange,
  type ImportedFigures,
  type Quote,
  type WatchlistRow,
} from "../shared/types";
import { cached, isFresh, mapLimit, seed } from "./cache";
import { createFx } from "./fx";
import { createProviders } from "./providers";
import type { MarketProvider } from "./providers/types";
import { parseStore, readStore, writeStore } from "./store";

const { primary, fallback } = createProviders(process.env);
const PORT = Number(process.env.PORT ?? 8787);
const QUOTE_TTL = Number(process.env.QUOTE_TTL_SECONDS ?? 60) * 1000;
const HISTORY_TTL = Number(process.env.HISTORY_TTL_HOURS ?? 12) * 3_600_000;
const RANGES: HistoryRange[] = ["6mo", "1y", "2y", "5y"];
const fx = createFx(process.env.BASE_CURRENCY ?? "SEK", primary.name === "mock");
const hasFallback = fallback !== primary;
const RISK_FREE = Number(process.env.RISK_FREE_RATE ?? 2); // percent, for the Sharpe ratio
const MAX_SYMBOLS = 300;

const parseSymbols = (raw: unknown) =>
  String(raw ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_SYMBOLS);

/**
 * Tries the primary provider, then the fallback (e.g. Yahoo for an ETF
 * that Börsdata doesn't carry). Each provider's answer is cached separately.
 */
async function withFallback<T>(
  key: string,
  ttl: number,
  task: (p: MarketProvider) => (() => Promise<T>) | undefined,
): Promise<T> {
  const providers = hasFallback ? [primary, fallback] : [primary];
  let lastErr: unknown = new Error("No provider supports this");
  for (const p of providers) {
    const load = task(p); // a loader, so nothing is fetched when the cache is fresh
    if (!load) continue;
    try {
      return await cached(`${key}:${p.name}`, ttl, load);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

const history = (symbol: string, range: HistoryRange) =>
  withFallback(`history:${symbol}:${range}`, HISTORY_TTL, (p) =>
    p.getHistory ? () => p.getHistory!(symbol, range) : undefined,
  );

const quote = (symbol: string) =>
  withFallback(`quote:${symbol}`, QUOTE_TTL, (p) => () =>
    p.getQuotes([symbol]).then(([q]) => {
      if (!q || !Number.isFinite(q.price)) throw new Error(`No quote for ${symbol}`);
      return { ...q, source: p.name };
    }),
  );

const defined = (f: Fundamentals): Fundamentals =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => typeof v === "number" && Number.isFinite(v)));

/**
 * Key figures: primary provider first, gaps filled from the fallback and
 * finally from the quote itself (cached as long as price history). Then
 * figures imported from a file override those, unless the import is older
 * than `maxAgeDays` (see shared/importMerge.ts).
 */
async function fundamentals(symbol: string, q: Quote, imported: ImportedFigures | undefined, maxAgeDays: number): Promise<Merged> {
  const get = (p: MarketProvider) =>
    p.getFundamentals
      ? cached(`fundamentals:${symbol}:${p.name}`, HISTORY_TTL, () => p.getFundamentals!(symbol)).catch(() => ({}))
      : Promise.resolve({});
  const [main, extra] = await Promise.all([get(primary), hasFallback ? get(fallback) : Promise.resolve({})]);
  const fromQuote: Fundamentals = {};
  for (const k of FUNDAMENTAL_KEYS) {
    const v = (q as unknown as Record<string, unknown>)[k];
    if (typeof v === "number") fromQuote[k] = v;
  }
  const layers: [Fundamentals, string][] = [[defined(fromQuote), q.source ?? primary.name], [defined(extra), fallback.name], [defined(main), primary.name]];
  const merged: Fundamentals = {};
  const sources: Partial<Record<FundamentalKey, string>> = {};
  for (const [f, name] of layers) {
    for (const [k, v] of Object.entries(f) as [FundamentalKey, number][]) {
      merged[k] = v;
      sources[k] = name;
    }
  }
  return mergeImported(merged, sources, imported, maxAgeDays);
}

const app = express();
app.use(express.json({ limit: "8mb" })); // imported key figures for a few thousand stocks fit

app.get("/api/health", (_req, res) => {
  res.json({ provider: primary.name, fallback: fallback.name, baseCurrency: fx.base });
});

app.get("/api/store", async (_req, res) => {
  res.json(await readStore());
});

app.put("/api/store", async (req, res) => {
  try {
    const store = parseStore(req.body);
    await writeStore(store);
    res.json(store);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/** Fetches quotes for many symbols in a few batch requests and caches them per symbol. */
async function prefetchQuotes(symbols: string[]) {
  if (!primary.batchQuotes) return;
  const missing = symbols.filter((s) => !isFresh(`quote:${s}:${primary.name}`));
  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    try {
      for (const q of await primary.getQuotes(chunk)) {
        if (q && Number.isFinite(q.price)) seed(`quote:${q.symbol.toUpperCase()}:${primary.name}`, QUOTE_TTL, { ...q, source: primary.name });
      }
    } catch {
      /* fall back to per-symbol requests */
    }
  }
}

// Quote + computed metrics + key figures for each symbol; one failing symbol doesn't break the list.
app.get("/api/watchlist", async (req, res) => {
  const symbols = parseSymbols(req.query.symbols);
  const [store] = await Promise.all([readStore(), prefetchQuotes(symbols)]);
  const maxAge = store?.settings?.importMaxAgeDays ?? DEFAULT_IMPORT_MAX_AGE_DAYS;
  const rows = await mapLimit(symbols, 6, async (symbol): Promise<WatchlistRow> => {
    try {
      const q = await quote(symbol);
      const [h, f, rate] = await Promise.all([
        // 5 years so Sharpe can use three; every other metric looks at the last year at most.
        history(symbol, "5y").catch(() => []),
        fundamentals(symbol, q, store?.imported?.[symbol], maxAge),
        fx.rate(q.currency),
      ]);
      const metrics = h.length ? computeMetrics(h, RISK_FREE) : emptyMetrics;
      return { quote: q, metrics, fx: rate, fundamentals: f.fundamentals, sources: f.sources };
    } catch (err) {
      const blank: Quote = { symbol, name: symbol, currency: "", price: NaN, change: NaN, changePct: NaN };
      return { quote: blank, metrics: emptyMetrics, fx: null, fundamentals: {}, error: (err as Error).message };
    }
  });
  res.json(rows);
});

app.get("/api/history/:symbol", async (req, res) => {
  const range = (RANGES.includes(req.query.range as HistoryRange) ? req.query.range : "1y") as HistoryRange;
  try {
    res.json(await history(req.params.symbol.toUpperCase(), range));
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.get("/api/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 1) return void res.json([]);
  try {
    // Merge results from both providers, primary first, without duplicates.
    const lists = await Promise.all(
      [primary, ...(hasFallback ? [fallback] : [])]
        .filter((p) => p.search)
        .map((p) => cached(`search:${p.name}:${q.toLowerCase()}`, 86_400_000, () => p.search!(q)).catch(() => [])),
    );
    const seen = new Set<string>();
    res.json(lists.flat().filter((r) => !seen.has(r.symbol) && seen.add(r.symbol)).slice(0, 10));
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// In production, serve the built client too.
const dist = path.resolve("dist");
app.use(express.static(dist));
app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));

app.listen(PORT, () => {
  console.log(`API on http://localhost:${PORT}  (provider: ${primary.name}, fallback: ${fallback.name})`);
});
