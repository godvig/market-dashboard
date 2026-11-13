// Matching rows from an imported file to the stocks in your lists: by
// ticker (Börsdata/Nordnet "VOLV B" → "VOLV-B.ST"), then exact company name,
// then a fuzzy name match.
import type { ImportRow } from "./importParse";

/** Exchange suffixes for bare tickers, for the choice in the import dialog. */
export const TICKER_SUFFIXES: { suffix: string; label: string }[] = [
  { suffix: ".ST", label: "Stockholm (.ST)" },
  { suffix: ".OL", label: "Oslo (.OL)" },
  { suffix: ".CO", label: "Copenhagen (.CO)" },
  { suffix: ".HE", label: "Helsinki (.HE)" },
  { suffix: "", label: "None (US)" },
];

/**
 * Börsdata and Nordnet write share classes with a space ("VOLV B",
 * "SHB A"); Yahoo uses a dash ("VOLV-B"). Also used by the Börsdata
 * provider to find an instrument from a Yahoo ticker.
 */
export const borsdataToYahoo = (ticker: string) => ticker.trim().toUpperCase().replace(/\s+/g, "-");

/** The Yahoo-style ticker for a bare ticker from a file: "VOLV B" → "VOLV-B.ST". Tickers that already have a suffix keep it. */
export function toYahooTicker(raw: string, suffix = ".ST"): string {
  const t = borsdataToYahoo(raw.replace(/^[A-Z]{2,4}:/i, "")); // "STO:VOLV B"
  return /\.[A-Z]{1,3}$/.test(t) || !suffix ? t : t + suffix;
}

/** Every spelling of a file's ticker that could be in your lists, most likely first. */
export function tickerCandidates(raw: string, suffix = ".ST"): string[] {
  const bare = borsdataToYahoo(raw.replace(/^[A-Z]{2,4}:/i, ""));
  const out = [toYahooTicker(raw, suffix), bare, bare.replace(/-/g, ""), bare.replace(/-/g, ".")];
  if (!/\.[A-Z]{1,3}$/.test(bare)) for (const s of TICKER_SUFFIXES) if (s.suffix) out.push(bare + s.suffix);
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** Legal-form and filler words that differ between sources ("Volvo AB (publ)" vs "Volvo"). */
const FILLER = new Set([
  "ab", "publ", "asa", "as", "oyj", "abp", "a/s", "hf", "plc", "inc", "corp", "corporation", "co", "ltd", "limited", "sa", "se",
  "nv", "ag", "spa", "group", "holding", "holdings", "the", "och", "and", "ser", "series", "class", "aktie", "aktier",
]);

/** Lower case, folded accents, filler removed: "AB Volvo (publ) ser. B" → "volvo b". */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .join(" ");
}

/** A trailing single-letter share class ("volvo b" → "b"). */
const shareClass = (n: string) => /\s([a-d])$/.exec(n)?.[1];

const bigrams = (s: string) => {
  const t = ` ${s} `;
  const out = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) out.set(t.slice(i, i + 2), (out.get(t.slice(i, i + 2)) ?? 0) + 1);
  return out;
};

/** Dice coefficient on character pairs of the normalised names (0–1). Different share classes never match. */
export function nameSimilarity(a: string, b: string): number {
  const x = normaliseName(a);
  const y = normaliseName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ca = shareClass(x);
  const cb = shareClass(y);
  if (ca && cb && ca !== cb) return 0;
  const ga = bigrams(x);
  const gb = bigrams(y);
  let common = 0;
  for (const [g, n] of ga) common += Math.min(n, gb.get(g) ?? 0);
  const total = [...ga.values(), ...gb.values()].reduce((s, n) => s + n, 0);
  return (2 * common) / total;
}

// ---------------------------------------------------------------------------
// Rows → stocks
// ---------------------------------------------------------------------------

export interface KnownStock {
  symbol: string;
  name?: string;
}

export type MatchHow = "ticker" | "name" | "fuzzy";

export interface RowMatch {
  row: ImportRow;
  /** The stock it matched, if any. */
  symbol?: string;
  how?: MatchHow;
  /** 0–1 for fuzzy matches. */
  similarity?: number;
  /** For unmatched rows with a ticker: the Yahoo-style ticker it would get as a new stock. */
  guess?: string;
}

/** Below this a fuzzy name match is not trusted. */
export const FUZZY_MIN = 0.72;
/** The best fuzzy match must beat the runner-up by this much. */
const FUZZY_MARGIN = 0.06;

/**
 * Matches each row to one of the known stocks: ticker first (in every
 * spelling), then the exact normalised name, then the closest name if it is
 * clearly the best. A stock is matched by at most one row.
 */
export function matchRows(rows: ImportRow[], known: KnownStock[], suffix = ".ST"): RowMatch[] {
  const bySymbol = new Map(known.map((k) => [k.symbol.toUpperCase(), k]));
  const byName = new Map<string, KnownStock[]>();
  for (const k of known) {
    if (!k.name) continue;
    const n = normaliseName(k.name);
    byName.set(n, [...(byName.get(n) ?? []), k]);
  }
  const taken = new Set<string>();
  const results: RowMatch[] = rows.map((row) => ({ row, guess: row.ticker ? toYahooTicker(row.ticker, suffix) : undefined }));

  // Pass 1: tickers. Pass 2: exact names. Pass 3: fuzzy names. Earlier passes claim stocks first.
  for (const m of results) {
    const hit = m.row.ticker && tickerCandidates(m.row.ticker, suffix).find((c) => bySymbol.has(c) && !taken.has(c));
    if (hit) {
      Object.assign(m, { symbol: hit, how: "ticker" });
      taken.add(hit);
    }
  }
  for (const m of results) {
    if (m.symbol || !m.row.name) continue;
    const hit = byName.get(normaliseName(m.row.name))?.find((k) => !taken.has(k.symbol));
    if (hit) {
      Object.assign(m, { symbol: hit.symbol, how: "name" });
      taken.add(hit.symbol);
    }
  }
  for (const m of results) {
    if (m.symbol || !m.row.name) continue;
    const scored = known
      .filter((k) => k.name && !taken.has(k.symbol))
      .map((k) => ({ k, s: nameSimilarity(m.row.name!, k.name!) }))
      .sort((a, b) => b.s - a.s);
    const [best, next] = scored;
    if (best && best.s >= FUZZY_MIN && (!next || best.s - next.s >= FUZZY_MARGIN)) {
      Object.assign(m, { symbol: best.k.symbol, how: "fuzzy", similarity: best.s });
      taken.add(best.k.symbol);
    }
  }
  return results;
}
