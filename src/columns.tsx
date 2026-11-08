// Every table column the user can show or hide, in display order.
// "standard" columns come first; "extra" key figures sit to the right of a divider.
import type { ReactNode } from "react";
import type { Fundamentals, Metrics, WatchlistRow } from "../shared/types";
import { fmtBig, fmtNum, fmtPct, sameCurrency, toBase, tone } from "./format";

export interface Ctx {
  baseCurrency: string;
}

export interface ColumnDef {
  id: string;
  label: string;
  /** Tooltip, ideally with the Swedish term. */
  title?: string;
  tier: "standard" | "extra";
  section: string;
  defaultOn: boolean;
  value: (r: WatchlistRow, ctx: Ctx) => number | null;
  render?: (r: WatchlistRow, ctx: Ctx) => ReactNode;
}

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const signedPct = (v: number | null) => <span className={tone(v)}>{fmtPct(v)}</span>;
const plainPct = (v: number | null, d = 1) => fmtPct(v, d).replace("+", "");

const metric = (id: string, label: string, key: keyof Metrics, opts: Partial<ColumnDef> = {}): ColumnDef => ({
  id,
  label,
  tier: "standard",
  section: "Returns",
  defaultOn: true,
  value: (r) => num(r.metrics[key]),
  render: (r) => signedPct(num(r.metrics[key])),
  ...opts,
});

const fund = (
  id: string,
  label: string,
  key: keyof Fundamentals,
  kind: "pct" | "x" | "num",
  opts: Partial<ColumnDef> = {},
): ColumnDef => ({
  id,
  label,
  tier: "extra",
  section: "Valuation",
  defaultOn: false,
  value: (r) => num(r.fundamentals[key]),
  render: (r) => {
    const v = num(r.fundamentals[key]);
    if (kind === "pct") return plainPct(v);
    return fmtNum(v, kind === "x" ? 1 : 2);
  },
  ...opts,
});

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
    render: (r) => signedPct(num(r.quote.changePct)),
  },
  metric("ret1m", "1M", "ret1m", { title: "Return, last 21 trading days" }),
  metric("ret3m", "3M", "ret3m"),
  metric("ret6m", "6M", "ret6m", { defaultOn: false }),
  metric("ret1y", "1Y", "ret1y"),
  metric("ytd", "YTD", "retYtd", { title: "Year to date" }),
  metric("vol", "Vol", "volatility", {
    section: "Risk & technicals",
    title: "Volatility (volatilitet): how much the price swings, annualised over 1 year",
    render: (r) => plainPct(num(r.metrics.volatility)),
  }),
  metric("maxdd", "Max DD", "maxDrawdown", { section: "Risk & technicals", title: "Max drawdown, 1 year" }),
  metric("fromHigh", "vs 52w high", "fromHigh", { section: "Risk & technicals" }),
  metric("vsSma200", "vs SMA200", "vsSma200", {
    section: "Risk & technicals",
    title: "Price vs 200-day moving average",
  }),
  metric("rsi", "RSI", "rsi14", {
    section: "Risk & technicals",
    title: "RSI(14): >70 overbought, <30 oversold",
    render: (r) => {
      const v = num(r.metrics.rsi14);
      return <span className={v == null ? "" : v > 70 ? "neg" : v < 30 ? "pos" : ""}>{fmtNum(v, 0)}</span>;
    },
  }),

  // ---- extra key figures (right of the divider) ----
  fund("divYield", "Div yield", "dividendYield", "pct", {
    section: "Dividends",
    defaultOn: true,
    title: "Dividend yield (direktavkastning): annual dividend ÷ share price",
  }),
  fund("payout", "Payout", "payoutRatio", "pct", {
    section: "Dividends",
    defaultOn: true,
    title: "Payout ratio (utdelningsandel): share of earnings paid as dividends. Over 100 % = paying more than it earns",
    render: (r) => {
      const v = num(r.fundamentals.payoutRatio);
      return <span className={v != null && v > 100 ? "neg" : ""}>{plainPct(v, 0)}</span>;
    },
  }),
  fund("dps", "Div/share", "dividendPerShare", "num", {
    section: "Dividends",
    title: "Dividend per share (utdelning/aktie), listing currency",
  }),
  fund("pe", "P/E", "pe", "x", { defaultOn: true, title: "Price / earnings (P/E-tal)" }),
  fund("fwdPe", "Fwd P/E", "forwardPe", "x", { title: "Forward P/E, based on expected earnings" }),
  fund("ps", "P/S", "ps", "x", { title: "Price / sales (P/S-tal)" }),
  fund("pb", "P/B", "pb", "x", { title: "Price / book value (P/B-tal)" }),
  fund("evEbit", "EV/EBIT", "evEbit", "x", { title: "Enterprise value / operating profit" }),
  fund("evEbitda", "EV/EBITDA", "evEbitda", "x"),
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
  fund("roe", "ROE", "roe", "pct", { section: "Profitability & growth", title: "Return on equity (avkastning på eget kapital)" }),
  fund("margin", "Margin", "profitMargin", "pct", { section: "Profitability & growth", title: "Profit margin (vinstmarginal)" }),
  fund("growth", "Rev growth", "revenueGrowth", "pct", {
    section: "Profitability & growth",
    title: "Revenue growth (omsättningstillväxt), latest year",
    render: (r) => signedPct(num(r.fundamentals.revenueGrowth)),
  }),
  fund("ndEbitda", "ND/EBITDA", "netDebtEbitda", "num", {
    section: "Balance sheet & risk",
    title: "Net debt / EBITDA (nettoskuld/EBITDA). Negative = net cash",
  }),
  fund("beta", "Beta", "beta", "num", {
    section: "Balance sheet & risk",
    title: "Beta: how much the stock moves relative to the market (1 = like the market)",
  }),
];

export const DEFAULT_COLUMNS = COLUMNS.filter((c) => c.defaultOn).map((c) => c.id);

/** Visible columns in registry order (unknown ids are ignored). */
export function visibleColumns(ids: string[] | undefined): ColumnDef[] {
  const set = new Set(ids ?? DEFAULT_COLUMNS);
  return COLUMNS.filter((c) => set.has(c.id));
}
