// User-defined scorecards: validation, file format and helpers for the editor.
// Shared by the server (store.json) and the browser (import, demo mode), so a
// scorecard is checked the same way wherever it comes from.
import { METRIC_BY_KEY, type MetricKey } from "./metrics";
import { SCORECARDS, type Criterion, type Scorecard, type Tier } from "./scoring";

export const SCORECARD_FILE_FORMAT = "market-screener-scorecard";

/** What an exported scorecard file contains. */
export interface ScorecardFile {
  format: typeof SCORECARD_FILE_FORMAT;
  version: 1;
  scorecard: Scorecard;
}

export const LIMITS = {
  scorecards: 50,
  criteria: 60,
  tiers: 12,
  weight: 10,
  points: 100,
} as const;

/** Ids of custom scorecards start with this, so they can never collide with a preset. */
export const CUSTOM_PREFIX = "custom-";
export const isCustomId = (id: string) => id.startsWith(CUSTOM_PREFIX);
const PRESET_IDS = new Set(SCORECARDS.map((s) => s.id));

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const finite = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function parseTier(input: unknown): Tier {
  const o = (input ?? {}) as Record<string, unknown>;
  const points = finite(o.points);
  if (points == null) throw new Error("Every tier needs points");
  const tier: Tier = { points: clamp(points, -LIMITS.points, LIMITS.points) };
  for (const k of ["gte", "gt", "lte", "lt"] as const) {
    const v = finite(o[k]);
    if (v != null) tier[k] = v;
  }
  const label = str(o.label, 60);
  if (label) tier.label = label;
  if (o.cliff === true) tier.cliff = true;
  return tier;
}

function parseCriterion(input: unknown, i: number): Criterion {
  const o = (input ?? {}) as Record<string, unknown>;
  const metric = str(o.metric, 60) as MetricKey;
  if (!METRIC_BY_KEY.has(metric)) throw new Error(`Criterion ${i + 1}: unknown metric "${metric}"`);
  if (!Array.isArray(o.tiers) || o.tiers.length === 0) throw new Error(`Criterion ${i + 1}: needs at least one tier`);
  const weight = finite(o.weight);
  return {
    id: str(o.id, 40) || `c${i + 1}`,
    label: str(o.label, 80) || METRIC_BY_KEY.get(metric)!.label,
    metric,
    tiers: o.tiers.slice(0, LIMITS.tiers).map(parseTier),
    ...(weight != null && weight !== 1 ? { weight: clamp(weight, 0, LIMITS.weight) } : {}),
  };
}

/**
 * Checks and cleans a scorecard from a file or store.json. Throws with a
 * readable message when it can't be used. Custom ids keep their prefix.
 */
export function parseScorecard(input: unknown): Scorecard {
  const o = (input ?? {}) as Record<string, unknown>;
  const name = str(o.name, 60);
  if (!name) throw new Error("The scorecard needs a name");
  if (!Array.isArray(o.criteria) || o.criteria.length === 0) throw new Error("The scorecard needs at least one criterion");
  let id = str(o.id, 40);
  if (!isCustomId(id)) id = CUSTOM_PREFIX + (id && !PRESET_IDS.has(id) ? id : randomId());
  const criteria = o.criteria.slice(0, LIMITS.criteria).map(parseCriterion);
  // Criterion ids must be unique within the card: the breakdown is keyed by them.
  const seen = new Set<string>();
  for (const c of criteria) {
    let cid = c.id;
    for (let n = 2; seen.has(cid); n++) cid = `${c.id}-${n}`;
    c.id = cid;
    seen.add(cid);
  }
  return {
    id,
    name,
    description: str(o.description, 400),
    origin: str(o.origin, 80) || "Your own scorecard",
    criteria,
  };
}

/** Parses a list of custom scorecards, dropping the ones that are broken instead of failing the whole store. */
export function parseScorecards(input: unknown): Scorecard[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: Scorecard[] = [];
  const ids = new Set<string>();
  for (const raw of input.slice(0, LIMITS.scorecards)) {
    try {
      const card = parseScorecard(raw);
      if (ids.has(card.id)) continue;
      ids.add(card.id);
      out.push(card);
    } catch {
      // A broken card is skipped; the rest of the store is still usable.
    }
  }
  return out.length ? out : undefined;
}

export const randomId = () => Math.random().toString(36).slice(2, 10);

/** Built-in presets first, then the user's own. */
export const allScorecards = (custom: Scorecard[] | undefined): Scorecard[] => [...SCORECARDS, ...(custom ?? [])];

/** A deep copy that can be edited, with a new custom id. */
export function duplicateScorecard(card: Scorecard, name = `${card.name} (copy)`): Scorecard {
  const copy = JSON.parse(JSON.stringify(card)) as Scorecard;
  return {
    ...copy,
    id: CUSTOM_PREFIX + randomId(),
    name: name.slice(0, 60),
    origin: isCustomId(card.id) ? card.origin : `Copy of ${card.name}`,
  };
}

/** A small starting point for a brand-new scorecard. */
export function blankScorecard(): Scorecard {
  return {
    id: CUSTOM_PREFIX + randomId(),
    name: "My scorecard",
    description: "",
    origin: "Your own scorecard",
    criteria: [
      newCriterion("roic", "c1", [{ gte: 15, points: 3 }, { gte: 10, points: 2 }, { gte: 5, points: 1 }, { points: 0 }]),
      newCriterion("netDebtEbitda", "c2", [{ lt: 1, points: 3 }, { lt: 2, points: 2 }, { lt: 3, points: 1 }, { points: 0 }]),
      newCriterion("fcfYield", "c3", [{ gte: 6, points: 3 }, { gte: 4, points: 2 }, { gte: 2, points: 1 }, { points: 0 }]),
    ],
  };
}

export function newCriterion(metric: MetricKey, id: string, tiers?: Tier[]): Criterion {
  return {
    id,
    label: METRIC_BY_KEY.get(metric)?.label ?? metric,
    metric,
    tiers: tiers ?? [{ gte: 0, points: 1 }, { points: 0 }],
  };
}

export const toScorecardFile = (card: Scorecard): ScorecardFile => ({
  format: SCORECARD_FILE_FORMAT,
  version: 1,
  scorecard: card,
});

export const isScorecardFile = (v: unknown): v is ScorecardFile =>
  !!v && typeof v === "object" && (v as Record<string, unknown>).format === SCORECARD_FILE_FORMAT;

/** A readable condition for a tier, e.g. "≥ 10 and < 15", or "otherwise". */
export function describeTier(t: Tier): string {
  const parts: string[] = [];
  if (t.gte != null) parts.push(`≥ ${t.gte}`);
  if (t.gt != null) parts.push(`> ${t.gt}`);
  if (t.lte != null) parts.push(`≤ ${t.lte}`);
  if (t.lt != null) parts.push(`< ${t.lt}`);
  return parts.length ? parts.join(" and ") : "otherwise";
}
