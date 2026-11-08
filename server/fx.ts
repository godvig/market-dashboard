// Currency conversion to a base currency (default SEK).
// Primary source: Frankfurter (ECB reference rates, free, no key, updated
// once per working day ~16:00 CET – the same rates the Riksbank publishes).
// Fallback: Yahoo currency pairs such as USDSEK=X.
import { cached } from "./cache";
import { getJson } from "./providers/types";
import { yahooProvider } from "./providers/yahoo";

const TTL = 6 * 3_600_000;

/** Exchanges quote some listings in the minor unit (pence, cents). */
const MINOR_UNITS: Record<string, [string, number]> = {
  GBp: ["GBP", 100],
  GBX: ["GBP", 100],
  ZAc: ["ZAR", 100],
  ILA: ["ILS", 100],
};

/** Fixed demo rates for PROVIDER=mock (base SEK). */
const MOCK_RATES: Record<string, number> = { SEK: 1, USD: 10.6, EUR: 11.5, GBP: 13.6, NOK: 0.98, DKK: 1.54 };

export function normaliseCurrency(currency: string): { code: string; divisor: number } {
  const minor = MINOR_UNITS[currency];
  return minor ? { code: minor[0], divisor: minor[1] } : { code: currency.toUpperCase(), divisor: 1 };
}

export function createFx(base: string, offline: boolean) {
  base = base.toUpperCase();

  /** Units of `base` per one unit of each currency. */
  const ecbRates = () =>
    cached(`fx:frankfurter:${base}`, TTL, async () => {
      const res = await getJson<{ rates: Record<string, number> }>(`https://api.frankfurter.dev/v1/latest?base=${base}`);
      const out: Record<string, number> = { [base]: 1 };
      for (const [code, perBase] of Object.entries(res.rates)) if (perBase > 0) out[code] = 1 / perBase;
      return out;
    });

  const yahooPair = (code: string) =>
    cached(`fx:yahoo:${code}${base}`, TTL, async () => {
      const [q] = await yahooProvider.getQuotes([`${code}${base}=X`]);
      if (!q || !(q.price > 0)) throw new Error(`No rate for ${code}${base}`);
      return q.price;
    });

  /**
   * Multiplier that converts an amount in `currency` to the base currency,
   * or null if no rate could be found.
   */
  async function rate(currency: string | undefined): Promise<number | null> {
    if (!currency) return null;
    const { code, divisor } = normaliseCurrency(currency);
    if (code === base) return 1 / divisor;

    if (offline) {
      const r = MOCK_RATES[code];
      return base === "SEK" && r ? r / divisor : null;
    }
    try {
      const r = (await ecbRates())[code];
      if (r) return r / divisor;
    } catch {
      /* fall through to Yahoo */
    }
    try {
      return (await yahooPair(code)) / divisor;
    } catch {
      return null;
    }
  }

  return { base, rate };
}
