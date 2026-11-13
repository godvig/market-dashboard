// How imported key figures combine with the providers' figures. Used by the
// server's fundamentals() and by the static demo, so both behave the same.
import type { Fundamentals, FundamentalKey, ImportedFigures, ImportedValue } from "./types";

export const DEFAULT_IMPORT_MAX_AGE_DAYS = 120;

const DAY = 86_400_000;

/** Whole days between an import date (YYYY-MM-DD) and now. */
export const ageInDays = (at: string, now: Date) => Math.floor((now.getTime() - Date.parse(`${at}T00:00:00Z`)) / DAY);

/** "import: screener.xlsx (2026-11-13)" */
export const importLabel = (v: ImportedValue) => `${v.src} (${v.at})`;

export interface Merged {
  fundamentals: Fundamentals;
  sources: Partial<Record<FundamentalKey, string>>;
}

/**
 * Imported values override the API for the figures the import has, unless
 * the import is older than `maxAgeDays`: then the API wins where it has a
 * value, and the import only fills gaps.
 */
export function mergeImported(
  api: Fundamentals,
  apiSources: Partial<Record<FundamentalKey, string>>,
  imported: ImportedFigures | undefined,
  maxAgeDays = DEFAULT_IMPORT_MAX_AGE_DAYS,
  now = new Date(),
): Merged {
  const fundamentals: Fundamentals = { ...api };
  const sources = { ...apiSources };
  for (const [key, v] of Object.entries(imported ?? {}) as [FundamentalKey, ImportedValue][]) {
    if (!v || typeof v.v !== "number" || !Number.isFinite(v.v)) continue;
    const stale = ageInDays(v.at, now) > maxAgeDays;
    if (stale && typeof api[key] === "number") continue;
    fundamentals[key] = v.v;
    sources[key] = stale ? `${importLabel(v)}, older than ${maxAgeDays} days` : importLabel(v);
  }
  return { fundamentals, sources };
}

/** True when a value's source is a file import. */
export const isImportSource = (src: string | undefined) => !!src?.startsWith("import:");
