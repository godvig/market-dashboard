// Quick live check of the configured data source and exchange rates.
// Usage: npm run check            (default tickers)
//        npm run check -- SAND.ST KO
import "dotenv/config";
import { computeMetrics } from "../shared/analysis";
import type { Fundamentals } from "../shared/types";
import { createFx } from "./fx";
import { createProviders } from "./providers";

const symbols = process.argv.slice(2).length ? process.argv.slice(2) : ["VOLV-B.ST", "INVE-B.ST", "AAPL", "KO"];
const { primary, fallback } = createProviders(process.env);
const fx = createFx(process.env.BASE_CURRENCY ?? "SEK", primary.name === "mock");

const n = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "–" : v.toFixed(d));
const ok = (label: string) => console.log(`  ✔ ${label}`);
const fail = (label: string, err: unknown) => console.log(`  ✘ ${label}: ${(err as Error).message ?? err}`);

console.log(`\nProvider: ${primary.name} (fallback: ${fallback.name}) · base currency: ${fx.base}\n`);
let failures = 0;

for (const symbol of symbols) {
  console.log(symbol);
  try {
    const [q] = await primary.getQuotes([symbol]);
    if (!q || !Number.isFinite(q.price)) throw new Error("no price returned");
    const rate = await fx.rate(q.currency);
    ok(`quote: ${q.name} · ${n(q.price)} ${q.currency}` + (rate != null && rate !== 1 ? ` ≈ ${n(q.price * rate)} ${fx.base} (rate ${n(rate, 4)})` : ""));
    if (rate == null) fail("exchange rate", `none found for ${q.currency}`);

    const fp = primary.getFundamentals ? primary : fallback;
    const f: Fundamentals = fp.getFundamentals ? await fp.getFundamentals(symbol).catch((e): Fundamentals => (fail("fundamentals", e), {})) : {};
    ok(
      `dividend yield ${n(f.dividendYield ?? q.dividendYield)} % · payout ratio ${n(f.payoutRatio ?? q.payoutRatio, 0)} % · ` +
        `dividend/share ${n(f.dividendPerShare ?? q.dividendPerShare)} · P/E ${n(f.pe ?? q.pe, 1)}`,
    );

    const hp = primary.getHistory ? primary : fallback;
    const h = await hp.getHistory!(symbol, "1y");
    const m = computeMetrics(h);
    ok(`history: ${h.length} days (${h[0]?.time} → ${h.at(-1)?.time}) · 1Y ${n(m.ret1y, 1)} % · vol ${n(m.volatility, 1)} %`);
  } catch (err) {
    failures++;
    fail("failed", err);
  }
  console.log();
}

console.log(failures ? `${failures} of ${symbols.length} tickers failed.` : "All good ✔");
console.log("Compare a few numbers with Avanza/Nordnet or finance.yahoo.com to sanity-check the data.\n");
process.exit(failures ? 1 : 0);
