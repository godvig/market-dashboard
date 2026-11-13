// Saves the user's categories, watchlists and column choices to
// data/store.json, so they survive browser resets and work in any browser
// on this machine. Older data/watchlists.json files are migrated.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { normaliseInvestmentType } from "../shared/investmentTypes";
import { parseScorecards } from "../shared/scorecardIO";
import {
  FUNDAMENTAL_KEYS,
  type FundamentalKey,
  type ImportedFigures,
  type ImportMapping,
  type ImportTarget,
  type ListGroup,
  type StockMeta,
  type UserSettings,
  type UserStore,
  type Watchlist,
} from "../shared/types";

const DIR = path.resolve(process.env.DATA_DIR ?? "data");
const FILE = path.join(DIR, "store.json");
const LEGACY_FILE = path.join(DIR, "watchlists.json");

/** Returns null when nothing has been saved yet. */
export async function readStore(): Promise<UserStore | null> {
  for (const file of [FILE, LEGACY_FILE]) {
    try {
      return parseStore(JSON.parse(await readFile(file, "utf8")));
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function writeStore(store: UserStore): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  await writeFile(tmp, JSON.stringify(store, null, 2));
  await rename(tmp, FILE); // atomic replace: never a half-written file
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Validates and normalises input; accepts the v1 format (array of lists). Throws on bad shape. */
export function parseStore(input: unknown): UserStore {
  const raw = Array.isArray(input) ? { lists: input, groups: [] } : (input as Record<string, unknown>);
  if (!raw || typeof raw !== "object") throw new Error("Expected an object");

  const groupsIn = Array.isArray(raw.groups) ? raw.groups : [];
  const groups: ListGroup[] = groupsIn.slice(0, 50).map((g, i) => {
    const o = (g ?? {}) as Record<string, unknown>;
    const id = str(o.id, 40);
    const name = str(o.name, 60);
    if (!id || !name) throw new Error(`Category ${i} needs id and name`);
    return { id, name, ...(o.collapsed ? { collapsed: true } : {}) };
  });
  const groupIds = new Set(groups.map((g) => g.id));

  const listsIn = raw.lists;
  if (!Array.isArray(listsIn) || listsIn.length === 0 || listsIn.length > 200) {
    throw new Error("Expected 1–200 watchlists");
  }
  const lists: Watchlist[] = listsIn.map((l, i) => {
    const o = (l ?? {}) as Record<string, unknown>;
    const id = str(o.id, 40);
    const name = str(o.name, 60);
    if (!id) throw new Error(`Watchlist ${i} has no id`);
    if (!name) throw new Error(`Watchlist ${i} has no name`);
    if (!Array.isArray(o.symbols)) throw new Error(`Watchlist ${i} has no symbols array`);
    const symbols = [
      ...new Set(o.symbols.filter((s): s is string => typeof s === "string").map((s) => s.trim().toUpperCase())),
    ]
      .filter(Boolean)
      .slice(0, 300);
    const groupId = typeof o.groupId === "string" && groupIds.has(o.groupId) ? o.groupId : undefined;
    const scorecardId = str(o.scorecardId, 40) || undefined;
    return { id, name, symbols, ...(groupId ? { groupId } : {}), ...(scorecardId ? { scorecardId } : {}) };
  });

  const columns = Array.isArray(raw.columns)
    ? raw.columns.filter((c): c is string => typeof c === "string").slice(0, 60)
    : undefined;

  const stocks = parseStocks(raw.stocks);
  const settings = parseSettings(raw.settings);
  const imported = parseImported(raw.imported);
  const importMappings = parseMappings(raw.importMappings);
  const scorecards = parseScorecards(raw.scorecards);

  return {
    version: 2,
    groups,
    lists,
    ...(columns ? { columns } : {}),
    ...(stocks ? { stocks } : {}),
    ...(settings ? { settings } : {}),
    ...(imported ? { imported } : {}),
    ...(importMappings ? { importMappings } : {}),
    ...(scorecards ? { scorecards } : {}),
  };
}

const KEYS = new Set<string>(FUNDAMENTAL_KEYS);
const TARGETS = new Set<string>([...FUNDAMENTAL_KEYS, "id.ticker", "id.name", "id.isin"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Imported key figures: known keys only, finite numbers, a source and a date. */
function parseImported(input: unknown): Record<string, ImportedFigures> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const out: Record<string, ImportedFigures> = {};
  for (const [sym, figs] of Object.entries(input as Record<string, unknown>).slice(0, 10_000)) {
    if (!figs || typeof figs !== "object") continue;
    const f: ImportedFigures = {};
    for (const [k, v] of Object.entries(figs as Record<string, unknown>)) {
      const o = (v ?? {}) as Record<string, unknown>;
      if (!KEYS.has(k) || typeof o.v !== "number" || !Number.isFinite(o.v) || typeof o.at !== "string" || !DATE.test(o.at)) continue;
      f[k as FundamentalKey] = { v: o.v, src: str(o.src, 160) || "import", at: o.at };
    }
    const key = sym.trim().toUpperCase().slice(0, 40);
    if (key && Object.keys(f).length) out[key] = f;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Saved column mappings, keyed by header hash. */
function parseMappings(input: unknown): Record<string, ImportMapping> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const out: Record<string, ImportMapping> = {};
  for (const [hash, v] of Object.entries(input as Record<string, unknown>).slice(0, 50)) {
    const o = (v ?? {}) as Record<string, unknown>;
    if (!/^[0-9a-f]{1,16}$/.test(hash) || !Array.isArray(o.headers) || !Array.isArray(o.columns)) continue;
    const headers = o.headers.slice(0, 300).map((h) => str(h, 120));
    const columns = headers.map((_, i) => {
      const c = (o.columns as unknown[])[i];
      return typeof c === "string" && TARGETS.has(c) ? (c as ImportTarget) : null;
    });
    const scales: Record<number, number> = {};
    for (const [i, f] of Object.entries((o.scales ?? {}) as Record<string, unknown>)) {
      if (/^\d+$/.test(i) && typeof f === "number" && f > 0 && Number.isFinite(f)) scales[Number(i)] = f;
    }
    const suffix = typeof o.suffix === "string" && /^(\.[A-Z]{1,3})?$/.test(o.suffix) ? o.suffix : undefined;
    out[hash] = { headers, columns, ...(Object.keys(scales).length ? { scales } : {}), ...(suffix != null ? { suffix } : {}) };
  }
  return Object.keys(out).length ? out : undefined;
}

function parseSettings(input: unknown): UserSettings | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  const out: UserSettings = {};
  if (typeof o.trafficLights === "boolean") out.trafficLights = o.trafficLights;
  if (typeof o.smoothScoring === "boolean") out.smoothScoring = o.smoothScoring;
  if (typeof o.minCoverage === "number" && Number.isFinite(o.minCoverage)) out.minCoverage = Math.min(100, Math.max(0, Math.round(o.minCoverage)));
  if (typeof o.importMaxAgeDays === "number" && Number.isFinite(o.importMaxAgeDays)) {
    out.importMaxAgeDays = Math.min(3650, Math.max(1, Math.round(o.importMaxAgeDays)));
  }
  return Object.keys(out).length ? out : undefined;
}

/** Per-ticker notes and assessments; unknown fields are dropped, text is length-limited. */
function parseStocks(input: unknown): Record<string, StockMeta> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const out: Record<string, StockMeta> = {};
  for (const [sym, v] of Object.entries(input as Record<string, unknown>).slice(0, 5000)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const m: StockMeta = {};
    for (const k of ["name", "sector", "niche", "country", "investmentType"] as const) {
      const t = str(o[k], 120);
      if (t) m[k] = k === "investmentType" ? normaliseInvestmentType(t) : t;
    }
    const note = typeof o.note === "string" ? o.note.slice(0, 20_000) : "";
    if (note.trim()) m.note = note;
    if (o.assessments && typeof o.assessments === "object") {
      const a: Record<string, number> = {};
      for (const [k, n] of Object.entries(o.assessments as Record<string, unknown>)) {
        if (typeof n === "number" && n >= 0 && n <= 3 && /^[a-zA-Z]{1,40}$/.test(k)) a[k] = Math.round(n);
      }
      if (Object.keys(a).length) m.assessments = a;
    }
    const key = sym.trim().toUpperCase().slice(0, 40);
    if (key && Object.keys(m).length) out[key] = m;
  }
  return Object.keys(out).length ? out : undefined;
}
