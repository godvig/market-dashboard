// Every table column the user can show or hide, in display order.
// "standard" columns come first; everything in "extra" sits to the right of a divider.
import type { ReactNode } from "react";
import { MANUAL_LEVELS, METRIC_BY_KEY, metricValue, rate, type ManualKey, type MetricKey, type Rating } from "../shared/metrics";
import { SCORECARDS, score, scoreBand, type Scorecard } from "../shared/scoring";
import type { StockMeta, WatchlistRow } from "../shared/types";
import { HorseIcon, investmentRank } from "./components/HorseIcon";
import { fmtBig, fmtNum, fmtPct, sameCurrency, toBase, tone } from "./format";

export interface Ctx {
  baseCurrency: string;
  stocks?: Record<string, StockMeta>;
  trafficLights: boolean;
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
      return `${Math.round(v)} år`;
    case "level":
      return MANUAL_LEVELS[key.slice(7) as ManualKey]?.[v] ?? String(v);
    case "amount":
      return Math.abs(v) >= 1e6 ? fmtBig(v) : fmtNum(v);
    default:
      return fmtNum(v);
  }
}

/** A metric value with its traffic light. */
export function MetricCell({ k, v, lights }: { k: MetricKey; v: number | null; lights: boolean }) {
  const cls = SIGNED.test(k) ? tone(v) : "";
  return (
    <span className="metric">
      {lights && <Light rating={rate(k, v)} />}
      <span className={cls}>{formatMetric(k, v)}</span>
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
    render: (r, ctx) => <MetricCell k={key} v={metricValue(sourceOf(r, ctx), key)} lights={ctx.trafficLights} />,
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

/** Score badge: 0–100 with coverage, coloured by band. */
export function ScoreBadge({ card, r, ctx }: { card: Scorecard; r: WatchlistRow; ctx: Ctx }) {
  const s = score(card, sourceOf(r, ctx));
  if (s.pct == null) return <span className="muted">–</span>;
  return (
    <span className="score" title={`${card.name}: ${s.points} av ${s.max} möjliga poäng (${s.covered}/${s.total} mått hade data, max ${s.fullMax} med all data)`}>
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
  title: `${card.description} (${card.origin}). 0–100 = poäng i förhållande till möjliga poäng på de mått som hade data; siffran under är täckningen.`,
  tier: "extra",
  section: "Scores",
  defaultOn,
  value: (r, ctx) => score(card, sourceOf(r, ctx)).pct,
  render: (r, ctx) => <ScoreBadge card={card} r={r} ctx={ctx} />,
});

const infoCol = (id: "sector" | "niche" | "country", label: string, sv: string): ColumnDef => ({
  id: `info.${id}`,
  label,
  title: sv,
  tier: "extra",
  section: "Company info",
  defaultOn: false,
  align: "left",
  value: (r, ctx) => metaOf(r, ctx)?.[id] ?? null,
  render: (r, ctx) => <span className="info-text">{metaOf(r, ctx)?.[id] ?? "–"}</span>,
});

const DEFAULT_SCORES = new Set(["sundhet", "keyMetrics", "dividend"]);

export const COLUMNS: ColumnDef[] = [
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

  // ---- extra (right of the divider) ----
  ...SCORECARDS.map((c) => scoreCol(c, DEFAULT_SCORES.has(c.id))),

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
  metricCol("eps", "Valuation"),
  {
    id: "mktcap",
    label: "Mkt cap",
    tier: "extra",
    section: "Valuation",
    defaultOn: true,
    title: "Börsvärde, converted to the base currency so it can be compared and sorted; original below",
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
    title: "Investeringstyp (Golden horse, Silver horse …). Sorts Golden → Silver → Bronze → Lucky → Stupid.",
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

/** Visible columns in registry order (unknown ids are ignored). */
export function visibleColumns(ids: string[] | undefined): ColumnDef[] {
  const set = new Set((ids ?? DEFAULT_COLUMNS).map((id) => RENAMED[id] ?? id));
  return COLUMNS.filter((c) => set.has(c.id));
}

export const normaliseColumnIds = (ids: string[] | undefined) => (ids ? ids.map((id) => RENAMED[id] ?? id) : undefined);
