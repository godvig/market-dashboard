// Every table column the user can show or hide, in display order.
// "standard" columns come first; everything in "extra" sits to the right of a divider.
import type { ReactNode } from "react";
import { MANUAL_LEVELS, METRIC_BY_KEY, metricValue, rate, type ManualKey, type MetricKey, type Rating } from "../shared/metrics";
import { isImportSource } from "../shared/importMerge";
import { SCORECARDS, score, scoreBand, type ScoreOptions, type Scorecard } from "../shared/scoring";
import type { FundamentalKey, StockMeta, WatchlistRow } from "../shared/types";
import { HorseIcon, investmentRank } from "./components/HorseIcon";
import { fmtBig, fmtNum, fmtPct, sameCurrency, toBase, tone } from "./format";

export interface Ctx {
  baseCurrency: string;
  stocks?: Record<string, StockMeta>;
  trafficLights: boolean;
  /** Smooth or stepped tiers, and the minimum coverage. */
  scoring: ScoreOptions;
  /** Every scorecard available: presets, then the user's own. */
  scorecards: Scorecard[];
}

export interface ColumnDef {
  id: string;
  label: string;
  /** Tooltip, ideally with the Swedish term. */
  title?: string;
  tier: "standard" | "extra";
  section: string;
  defaultOn: boolean;
  value: (r: WatchlistRow, ctx: Ctx) => number | string | null;
  render?: (r: WatchlistRow, ctx: Ctx) => ReactNode;
  align?: "left";
  /** First click sorts ascending (e.g. Golden horse first). */
  ascFirst?: boolean;
}

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const metaOf = (r: WatchlistRow, ctx: Ctx) => ctx.stocks?.[r.quote.symbol.toUpperCase()];
export const sourceOf = (r: WatchlistRow, ctx: Ctx) => ({ fundamentals: r.fundamentals, metrics: r.metrics, meta: metaOf(r, ctx) });

/** Coloured dot like the spreadsheet's traffic-light icons. */
export function Light({ rating }: { rating: Rating | null }) {
  if (!rating) return null;
  return <span className={`tl tl-${rating}`} aria-label={rating} />;
}

const SIGNED = /Growth$|Cagr\d+y$/;

/** Formats a metric value by its unit. */
export function formatMetric(key: MetricKey, v: number | null): string {
  if (v == null) return "–";
  const def = METRIC_BY_KEY.get(key);
  switch (def?.unit) {
    case "pct":
      return SIGNED.test(key) ? fmtPct(v) : fmtPct(v).replace("+", "");
    case "x":
      return fmtNum(v, key === "beta" || key === "peg" || key === "quickRatio" || key === "debtToEquity" || key === "sharpe" ? 2 : 1);
    case "years":
      return `${Math.round(v)} yrs`;
    case "level":
      return MANUAL_LEVELS[key.slice(7) as ManualKey]?.[v] ?? String(v);
    case "amount":
      return Math.abs(v) >= 1e6 ? fmtBig(v) : fmtNum(v);
    default:
      return fmtNum(v);
  }
}

/** Where a key figure came from ("yahoo", "import: file.csv (2026-11-13)"), or undefined for computed metrics. */
export const sourceOfValue = (r: WatchlistRow, key: MetricKey) => r.sources?.[key as FundamentalKey];

/** Small marker for a value imported from a file; the tooltip names the file and date. */
export function ImportedMark({ src }: { src?: string }) {
  if (!isImportSource(src)) return null;
  return (
    <span className="imp-mark" title={`Imported – ${src}`} aria-label="imported">
      i
    </span>
  );
}

/** A metric value with its traffic light, marked when it was imported from a file. */
export function MetricCell({ k, v, lights, src }: { k: MetricKey; v: number | null; lights: boolean; src?: string }) {
  const cls = SIGNED.test(k) ? tone(v) : "";
  return (
    <span className="metric">
      {lights && <Light rating={rate(k, v)} />}
      <span className={cls}>{formatMetric(k, v)}</span>
      {v != null && <ImportedMark src={src} />}
    </span>
  );
}

const metricCol = (key: MetricKey, section: string, opts: Partial<ColumnDef> = {}): ColumnDef => {
  const def = METRIC_BY_KEY.get(key);
  return {
    id: key,
    label: def?.label ?? key,
    title: [def?.sv, def?.description].filter(Boolean).join(" – "),
    tier: "extra",
    section,
    defaultOn: false,
    value: (r, ctx) => metricValue(sourceOf(r, ctx), key),
    render: (r, ctx) => <MetricCell k={key} v={metricValue(sourceOf(r, ctx), key)} lights={ctx.trafficLights} src={sourceOfValue(r, key)} />,
    ...opts,
  };
};

const returnCol = (id: string, label: string, key: "ret1m" | "ret3m" | "ret6m" | "ret1y" | "retYtd", opts: Partial<ColumnDef> = {}): ColumnDef => ({
  id,
  label,
  tier: "standard",
  section: "Returns",
  defaultOn: true,
  value: (r) => num(r.metrics[key]),
  render: (r) => <span className={tone(num(r.metrics[key]))}>{fmtPct(num(r.metrics[key]))}</span>,
  ...opts,
});

const pctOf = (share: number) => `${Math.round(share * 100)} %`;

/** Score badge: 0–100 with coverage, coloured by band. Greyed out when too little data backs the score. */
export function ScoreBadge({ card, r, ctx }: { card: Scorecard; r: WatchlistRow; ctx: Ctx }) {
  const s = score(card, sourceOf(r, ctx), ctx.scoring);
  if (s.rawPct == null) return <span className="muted">–</span>;
  if (!s.sufficient) {
    return (
      <span
        className="score thin"
        title={`${card.name}: too little data for a score. ${s.covered}/${s.total} metrics had data, covering ${pctOf(s.coverage)} of the points (${pctOf(ctx.scoring.minCoverage ?? 0.6)} needed). On those metrics it would be ${s.rawPct}.`}
      >
        <span className="badge-score sb-none">–</span>
        <small>
          {s.covered}/{s.total}
        </small>
      </span>
    );
  }
  return (
    <span
      className="score"
      title={`${card.name}: ${s.points} of ${s.max} possible points (${s.covered}/${s.total} metrics had data = ${pctOf(s.coverage)} of the points; ${s.fullMax} with all data)`}
    >
      <span className={`badge-score sb-${scoreBand(s.pct)}`}>{s.pct}</span>
      <small>
        {s.covered}/{s.total}
      </small>
    </span>
  );
}

const scoreCol = (card: Scorecard, defaultOn: boolean): ColumnDef => ({
  id: `score.${card.id}`,
  label: card.name,
  title: `${card.description} (${card.origin}). 0–100 = points relative to the points possible on the metrics that had data; the small number is coverage. No score is shown when coverage is too low.`,
  tier: "extra",
  section: "Scores",
  defaultOn,
  value: (r, ctx) => score(card, sourceOf(r, ctx), ctx.scoring).pct,
  render: (r, ctx) => <ScoreBadge card={card} r={r} ctx={ctx} />,
});

const infoCol = (id: "sector" | "niche" | "country", label: string, sv: string): ColumnDef => ({
  id: `info.${id}`,
  label,
  title: `Swedish: ${sv}`,
  tier: "extra",
  section: "Company info",
  defaultOn: false,
  align: "left",
  value: (r, ctx) => metaOf(r, ctx)?.[id] ?? null,
  render: (r, ctx) => <span className="info-text">{metaOf(r, ctx)?.[id] ?? "–"}</span>,
});

const DEFAULT_SCORES = new Set(["sundhet", "keyMetrics", "dividend"]);

const BEFORE_SCORES: ColumnDef[] = [
  // ---- standard ----
  {
    id: "price",
    label: "Price",
    tier: "standard",
    section: "Price",
    defaultOn: true,
    title: "Price in the listing currency, with the base-currency value below",
    value: (r) => num(r.quote.price),
    render: (r, { baseCurrency }) => {
      const base = toBase(r.quote.price, r.fx);
      return (
        <div className="dual">
          <span>
            {fmtNum(r.quote.price)} <small>{r.quote.currency}</small>
          </span>
          {!sameCurrency(r.quote.currency, baseCurrency) && base != null && (
            <small>
              ≈ {fmtNum(base)} {baseCurrency}
            </small>
          )}
        </div>
      );
    },
  },
  {
    id: "day",
    label: "Day",
    tier: "standard",
    section: "Price",
    defaultOn: true,
    title: "Change today",
    value: (r) => num(r.quote.changePct),
    render: (r) => <span className={tone(num(r.quote.changePct))}>{fmtPct(num(r.quote.changePct))}</span>,
  },
  returnCol("ret1m", "1M", "ret1m", { title: "Return, last 21 trading days" }),
  returnCol("ret3m", "3M", "ret3m"),
  returnCol("ret6m", "6M", "ret6m", { defaultOn: false }),
  returnCol("ret1y", "1Y", "ret1y"),
  returnCol("ytd", "YTD", "retYtd", { title: "Year to date" }),
  metricCol("volatility", "Risk & technicals", { tier: "standard", defaultOn: true }),
  {
    id: "maxdd",
    label: "Max DD",
    tier: "standard",
    section: "Risk & technicals",
    defaultOn: true,
    title: "Max drawdown, 1 year",
    value: (r) => num(r.metrics.maxDrawdown),
    render: (r) => <span className={tone(num(r.metrics.maxDrawdown))}>{fmtPct(num(r.metrics.maxDrawdown))}</span>,
  },
  {
    id: "fromHigh",
    label: "vs 52w high",
    tier: "standard",
    section: "Risk & technicals",
    defaultOn: false,
    value: (r) => num(r.metrics.fromHigh),
    render: (r) => <span className={tone(num(r.metrics.fromHigh))}>{fmtPct(num(r.metrics.fromHigh))}</span>,
  },
  {
    id: "vsSma200",
    label: "vs SMA200",
    tier: "standard",
    section: "Risk & technicals",
    defaultOn: false,
    title: "Price vs 200-day moving average",
    value: (r) => num(r.metrics.vsSma200),
    render: (r) => <span className={tone(num(r.metrics.vsSma200))}>{fmtPct(num(r.metrics.vsSma200))}</span>,
  },
  {
    id: "rsi",
    label: "RSI",
    tier: "standard",
    section: "Risk & technicals",
    defaultOn: true,
    title: "RSI(14): >70 overbought, <30 oversold",
    value: (r) => num(r.metrics.rsi14),
    render: (r) => {
      const v = num(r.metrics.rsi14);
      return <span className={v == null ? "" : v > 70 ? "neg" : v < 30 ? "pos" : ""}>{fmtNum(v, 0)}</span>;
    },
  },
  metricCol("sharpe", "Risk & technicals", { tier: "standard" }),

];

const AFTER_SCORES: ColumnDef[] = [

  // Key Metrics (Allmän snurra) + dividend basics
  metricCol("profitMargin", "Key Metrics"),
  metricCol("pe", "Key Metrics", { defaultOn: true }),
  metricCol("pb", "Key Metrics"),
  metricCol("peg", "Key Metrics"),
  metricCol("roe", "Key Metrics"),
  metricCol("fcfMargin", "Key Metrics"),
  metricCol("debtToEquity", "Key Metrics"),
  metricCol("dividendYield", "Key Metrics", { defaultOn: true }),
  metricCol("payoutRatio", "Key Metrics", { defaultOn: true }),
  metricCol("epsGrowth", "Key Metrics"),
  metricCol("revenueGrowth", "Key Metrics"),

  metricCol("dividendPerShare", "Dividends"),
  metricCol("dividendGrowth", "Dividends"),
  metricCol("dividendCagr3y", "Dividends"),
  metricCol("dividendCagr5y", "Dividends"),
  metricCol("dividendCagr10y", "Dividends"),
  metricCol("dividendYearsPaid", "Dividends"),
  metricCol("dividendYearsNoCut", "Dividends"),
  metricCol("dividendYearsRaised", "Dividends"),

  metricCol("forwardPe", "Valuation"),
  metricCol("ps", "Valuation"),
  metricCol("evEbit", "Valuation"),
  metricCol("evEbitda", "Valuation"),
  metricCol("fcfYield", "Valuation"),
  metricCol("eps", "Valuation"),
  {
    id: "mktcap",
    label: "Mkt cap",
    tier: "extra",
    section: "Valuation",
    defaultOn: true,
    title: "Market cap (börsvärde), converted to the base currency so it can be compared and sorted; original below",
    value: (r) => toBase(r.fundamentals.marketCap, r.fx),
    render: (r, { baseCurrency }) => {
      const cap = r.fundamentals.marketCap;
      const base = toBase(cap, r.fx);
      return (
        <div className="dual">
          <span>{base != null ? fmtBig(base) : fmtBig(cap)}</span>
          {!sameCurrency(r.quote.currency, baseCurrency) && cap != null && (
            <small>
              {fmtBig(cap)} {r.quote.currency}
            </small>
          )}
        </div>
      );
    },
  },

  metricCol("roa", "Profitability"),
  metricCol("roic", "Profitability"),
  metricCol("operatingMargin", "Profitability"),
  metricCol("ebitdaMargin", "Profitability"),

  metricCol("quickRatio", "Balance sheet & risk"),
  metricCol("equityRatio", "Balance sheet & risk"),
  metricCol("netDebtEbitda", "Balance sheet & risk"),
  metricCol("beta", "Balance sheet & risk"),

  metricCol("revenueCagr3y", "Growth"),
  metricCol("revenueCagr5y", "Growth"),
  metricCol("revenueCagr10y", "Growth"),
  metricCol("earningsGrowth", "Growth"),
  metricCol("earningsCagr3y", "Growth"),
  metricCol("earningsCagr5y", "Growth"),
  metricCol("earningsCagr10y", "Growth"),
  metricCol("epsCagr3y", "Growth"),
  metricCol("epsCagr5y", "Growth"),
  metricCol("epsCagr10y", "Growth"),
  metricCol("ebitdaGrowth", "Growth"),
  metricCol("ebitdaCagr3y", "Growth"),
  metricCol("ebitdaCagr5y", "Growth"),
  metricCol("ebitdaCagr10y", "Growth"),
  metricCol("operatingIncomeGrowth", "Growth"),

  ...(Object.keys(MANUAL_LEVELS) as ManualKey[]).map((k) => metricCol(`manual.${k}`, "Own assessments")),

  {
    id: "info.investmentType",
    label: "Type",
    title: "Investeringstyp (Golden horse, Silver horse …). Sorts Golden → Silver → Bronze → Lucky → Stupid → Nostalgic.",
    tier: "extra",
    section: "Company info",
    defaultOn: true,
    align: "left",
    ascFirst: true,
    value: (r, ctx) => investmentRank(metaOf(r, ctx)?.investmentType),
    render: (r, ctx) => {
      const t = metaOf(r, ctx)?.investmentType;
      return t ? (
        <span className="type-label">
          <HorseIcon type={t} size={16} />
          <span className="info-text">{t}</span>
        </span>
      ) : (
        <span className="muted">–</span>
      );
    },
  },
  infoCol("sector", "Sector", "Industri/Sektor"),
  infoCol("niche", "Niche", "Nisch/Bransch"),
  infoCol("country", "Country", "Land"),
];

/** The column registry for a set of custom scorecards; the result is cached per array. */
const registryCache = new WeakMap<Scorecard[], ColumnDef[]>();
const presetColumns = SCORECARDS.map((c) => scoreCol(c, DEFAULT_SCORES.has(c.id)));
export function columnsFor(custom?: Scorecard[]): ColumnDef[] {
  if (!custom?.length) return COLUMNS;
  let cols = registryCache.get(custom);
  if (!cols) {
    cols = [...BEFORE_SCORES, ...presetColumns, ...custom.map((c) => scoreCol(c, false)), ...AFTER_SCORES];
    registryCache.set(custom, cols);
  }
  return cols;
}

/** Custom scorecards in a scorecard list (everything after the presets). */
export const customOf = (cards: Scorecard[] | undefined) => cards?.filter((c) => !SCORECARD_IDS.has(c.id));
const SCORECARD_IDS = new Set(SCORECARDS.map((c) => c.id));

export const COLUMNS: ColumnDef[] = [...BEFORE_SCORES, ...presetColumns, ...AFTER_SCORES];

export const DEFAULT_COLUMNS = COLUMNS.filter((c) => c.defaultOn).map((c) => c.id);

/** Old column ids from earlier versions → current ids. */
const RENAMED: Record<string, string> = {
  vol: "volatility",
  divYield: "dividendYield",
  payout: "payoutRatio",
  dps: "dividendPerShare",
  fwdPe: "forwardPe",
  margin: "profitMargin",
  growth: "revenueGrowth",
  ndEbitda: "netDebtEbitda",
};

const byIdCache = new WeakMap<ColumnDef[], Map<string, ColumnDef>>();
function byId(cols: ColumnDef[]) {
  let m = byIdCache.get(cols);
  if (!m) byIdCache.set(cols, (m = new Map(cols.map((c) => [c.id, c]))));
  return m;
}

export const normaliseColumnIds = (ids: string[] | undefined) => (ids ? [...new Set(ids.map((id) => RENAMED[id] ?? id))] : undefined);

/** Visible columns in the saved order (unknown ids are ignored). */
export function visibleColumns(ids: string[] | undefined, custom?: Scorecard[]): ColumnDef[] {
  const map = byId(columnsFor(custom));
  return (normaliseColumnIds(ids) ?? DEFAULT_COLUMNS).map((id) => map.get(id)).filter((c): c is ColumnDef => !!c);
}

/** Adds a column where it belongs by default: after the nearest visible column that precedes it in the registry. */
export function insertColumn(order: string[], id: string, custom?: Scorecard[]): string[] {
  if (order.includes(id)) return order;
  const cols = columnsFor(custom);
  const at = cols.findIndex((c) => c.id === id);
  for (let i = at - 1; i >= 0; i--) {
    const j = order.indexOf(cols[i].id);
    if (j >= 0) return [...order.slice(0, j + 1), id, ...order.slice(j + 1)];
  }
  return [id, ...order];
}

/** Moves a column next to another one (before or after it). */
export function moveColumn(order: string[], id: string, targetId: string | null, after: boolean): string[] {
  if (id === targetId) return order;
  const rest = order.filter((x) => x !== id);
  const j = targetId == null ? -1 : rest.indexOf(targetId);
  const at = targetId == null ? 0 : j < 0 ? rest.length : j + (after ? 1 : 0);
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** Share of the rows (0–1) that have a value in a column; rows that failed to load count as missing. */
export function columnCoverage(col: ColumnDef, rows: WatchlistRow[], ctx: Ctx): number | null {
  if (!rows.length) return null;
  return rows.filter((r) => !r.error && col.value(r, ctx) != null).length / rows.length;
}
