import "dotenv/config";
import express from "express";
import path from "node:path";
import { computeMetrics, emptyMetrics } from "../shared/analysis";
import type { HistoryRange, Quote, WatchlistRow } from "../shared/types";
import { cached, mapLimit } from "./cache";
import { createProviders } from "./providers";

const { primary, fallback } = createProviders(process.env);
const PORT = Number(process.env.PORT ?? 8787);
const QUOTE_TTL = Number(process.env.QUOTE_TTL_SECONDS ?? 60) * 1000;
const HISTORY_TTL = Number(process.env.HISTORY_TTL_HOURS ?? 12) * 3_600_000;
const RANGES: HistoryRange[] = ["6mo", "1y", "2y", "5y"];

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

const app = express();

app.get("/api/health", (_req, res) => {
  res.json({ provider: primary.name, fallback: fallback.name });
});

// Quote + computed metrics for each symbol; one failing symbol doesn't break the list.
app.get("/api/watchlist", async (req, res) => {
  const symbols = parseSymbols(req.query.symbols);
  const rows = await mapLimit(symbols, 4, async (symbol): Promise<WatchlistRow> => {
    try {
      const [q, h] = await Promise.all([quote(symbol), history(symbol, "1y").catch(() => [])]);
      return { quote: q, metrics: h.length ? computeMetrics(h) : emptyMetrics };
    } catch (err) {
      const blank: Quote = { symbol, name: symbol, currency: "", price: NaN, change: NaN, changePct: NaN };
      return { quote: blank, metrics: emptyMetrics, error: (err as Error).message };
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
