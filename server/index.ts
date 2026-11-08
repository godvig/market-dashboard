import "dotenv/config";
import express from "express";
import path from "node:path";
import { computeMetrics, emptyMetrics } from "../shared/analysis";
import type { Fundamentals, HistoryRange, Quote, WatchlistRow } from "../shared/types";
import { cached, mapLimit } from "./cache";
import { createFx } from "./fx";
import { createProviders } from "./providers";
import { parseWatchlists, readWatchlists, writeWatchlists } from "./store";

const { primary, fallback } = createProviders(process.env);
const PORT = Number(process.env.PORT ?? 8787);
const QUOTE_TTL = Number(process.env.QUOTE_TTL_SECONDS ?? 60) * 1000;
const HISTORY_TTL = Number(process.env.HISTORY_TTL_HOURS ?? 12) * 3_600_000;
const RANGES: HistoryRange[] = ["6mo", "1y", "2y", "5y"];
const fx = createFx(process.env.BASE_CURRENCY ?? "SEK", primary.name === "mock");

const parseSymbols = (raw: unknown) =>
  String(raw ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 50);

const history = (symbol: string, range: HistoryRange) =>
  cached(`history:${primary.name}:${symbol}:${range}`, HISTORY_TTL, () =>
    (primary.getHistory ?? fallback.getHistory!).call(primary.getHistory ? primary : fallback, symbol, range),
  );

const quote = (symbol: string) =>
  cached(`quote:${primary.name}:${symbol}`, QUOTE_TTL, async () => {
    const [q] = await primary.getQuotes([symbol]);
    if (!q) throw new Error(`No quote for ${symbol}`);
    return q;
  });

// Dividend data etc. changes slowly, so it is cached as long as history.
const fundamentals = (symbol: string): Promise<Fundamentals> => {
  const p = primary.getFundamentals ? primary : fallback.getFundamentals ? fallback : null;
  if (!p) return Promise.resolve({});
  return cached(`fundamentals:${p.name}:${symbol}`, HISTORY_TTL, () => p.getFundamentals!(symbol)).catch(() => ({}));
};

/** Keeps the quote's own values and fills the gaps from fundamentals. */
function withFundamentals(q: Quote, f: Fundamentals): Quote {
  const out = { ...q };
  for (const [k, v] of Object.entries(f) as [keyof Fundamentals, number | undefined][]) {
    if (v != null && Number.isFinite(v) && (out[k] == null || !Number.isFinite(out[k]))) out[k] = v;
  }
  return out;
}

const app = express();
app.use(express.json({ limit: "200kb" }));

app.get("/api/watchlists", async (_req, res) => {
  res.json(await readWatchlists());
});

app.put("/api/watchlists", async (req, res) => {
  try {
    const lists = parseWatchlists(req.body);
    await writeWatchlists(lists);
    res.json(lists);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ provider: primary.name, fallback: fallback.name, baseCurrency: fx.base });
});

// Quote + computed metrics for each symbol; one failing symbol doesn't break the list.
app.get("/api/watchlist", async (req, res) => {
  const symbols = parseSymbols(req.query.symbols);
  const rows = await mapLimit(symbols, 4, async (symbol): Promise<WatchlistRow> => {
    try {
      const [q, h, f] = await Promise.all([
        quote(symbol),
        history(symbol, "1y").catch(() => []),
        fundamentals(symbol),
      ]);
      return {
        quote: withFundamentals(q, f),
        metrics: h.length ? computeMetrics(h) : emptyMetrics,
        fx: await fx.rate(q.currency),
      };
    } catch (err) {
      const blank: Quote = { symbol, name: symbol, currency: "", price: NaN, change: NaN, changePct: NaN };
      return { quote: blank, metrics: emptyMetrics, fx: null, error: (err as Error).message };
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
    const p = primary.search ? primary : fallback;
    res.json(await cached(`search:${p.name}:${q.toLowerCase()}`, 86_400_000, () => p.search!(q)));
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
