import { borsdataProvider } from "./borsdata";
import { finnhubProvider } from "./finnhub";
import { fmpProvider } from "./fmp";
import { mockProvider } from "./mock";
import type { MarketProvider } from "./types";
import { yahooProvider } from "./yahoo";

/** Picks the provider named in PROVIDER (default: yahoo). */
export function createProviders(env: NodeJS.ProcessEnv): { primary: MarketProvider; fallback: MarketProvider } {
  const name = (env.PROVIDER ?? "yahoo").toLowerCase();
  const fallback = name === "mock" ? mockProvider : yahooProvider;

  const need = (key: string) => {
    const v = env[key];
    if (!v) throw new Error(`PROVIDER=${name} needs ${key} in .env`);
    return v;
  };

  switch (name) {
    case "mock":
      return { primary: mockProvider, fallback };
    case "yahoo":
      return { primary: yahooProvider, fallback };
    case "finnhub":
      return { primary: finnhubProvider(need("FINNHUB_API_KEY")), fallback };
    case "borsdata":
      return { primary: borsdataProvider(need("BORSDATA_API_KEY"), env), fallback };
    case "fmp":
      return { primary: fmpProvider(need("FMP_API_KEY")), fallback };
    default:
      throw new Error(`Unknown PROVIDER "${name}". Use yahoo, borsdata, finnhub, fmp or mock.`);
  }
}
