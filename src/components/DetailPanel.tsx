import { useEffect, useState } from "react";
import { scoreBand, SCORECARDS, score } from "../../shared/scoring";
import type { Candle, HistoryRange, StockMeta, WatchlistRow } from "../../shared/types";
import { api } from "../api";
import { COLUMNS, metaOf, sourceOf, type Ctx } from "../columns";
import { fmtBig, fmtNum, fmtPct, sameCurrency, toBase, tone } from "../format";
import { HorseIcon } from "./HorseIcon";
import { PriceChart } from "./PriceChart";
import { ScorePanel } from "./ScorePanel";
import { StockInfo } from "./StockInfo";

const RANGES: HistoryRange[] = ["6mo", "1y", "2y", "5y"];
type Tab = "overview" | "scores" | "info";

interface Props {
  row: WatchlistRow;
  ctx: Ctx;
  listName: string;
  prev?: string;
  next?: string;
  onBack: () => void;
  onNavigate: (symbol: string) => void;
  onMeta: (patch: Partial<StockMeta>) => void;
  onAssess: (key: string, value: number | null) => void;
}

/** Full-page view of one stock. Breadcrumb "List › Stock"; the list name leads back. */
export function DetailPanel({ row, ctx, listName, prev, next, onBack, onNavigate, onMeta, onAssess }: Props) {
  const { quote: q, metrics: m, fx, fundamentals: f } = row;
  const { baseCurrency } = ctx;
  const meta = metaOf(row, ctx);
  const [range, setRange] = useState<HistoryRange>("1y");
  const [tab, setTab] = useState<Tab>("overview");
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let alive = true;
    setCandles(null);
    setError(undefined);
    api
      .history(q.symbol, range)
      .then((c) => alive && setCandles(c))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [q.symbol, range]);

  // Esc goes back; ←/→ step through the list (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") onBack();
      if (e.key === "ArrowLeft" && prev) onNavigate(prev);
      if (e.key === "ArrowRight" && next) onNavigate(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack, onNavigate, prev, next]);

  const foreign = !sameCurrency(q.currency, baseCurrency) && fx != null;
  /** "12,34 USD (≈ 130,80 SEK)" – original first, base currency in brackets. */
  const both = (v: number | undefined, big = false) => {
    const fmt = big ? fmtBig : fmtNum;
    const base = toBase(v, fx);
    return foreign && base != null ? `${fmt(v)} ${q.currency} (≈ ${fmt(base)} ${baseCurrency})` : `${fmt(v)} ${q.currency}`;
  };

  const overview: [string, string, string?][] = [
    ["Day", fmtPct(q.changePct, 2), tone(q.changePct)],
    [
      "52w range",
      `${fmtNum(q.fiftyTwoWeekLow)} – ${fmtNum(q.fiftyTwoWeekHigh)} ${q.currency}` +
        (foreign ? ` (≈ ${fmtNum(toBase(q.fiftyTwoWeekLow, fx))} – ${fmtNum(toBase(q.fiftyTwoWeekHigh, fx))} ${baseCurrency})` : ""),
    ],
    ["SMA50 / SMA200", `${fmtNum(m.sma50)} / ${fmtNum(m.sma200)}`],
    ["Max drawdown (1y)", fmtPct(m.maxDrawdown), tone(m.maxDrawdown)],
    ["RSI(14)", fmtNum(m.rsi14, 0)],
    ["Dividend / share", both(f.dividendPerShare)],
    ["Market cap", both(f.marketCap, true)],
    ...(foreign ? ([[`${q.currency}/${baseCurrency}`, fmtNum(fx, 4)]] as [string, string][]) : []),
  ];

  // Key figures grouped like the column picker, only those with a value.
  const metricCols = COLUMNS.filter((c) => c.id !== "mktcap" && !c.id.startsWith("score.") && !c.id.startsWith("info.") && c.section !== "Own assessments")
    .filter((c) => c.tier === "extra" || c.id === "volatility" || c.id === "sharpe")
    .filter((c) => c.value(row, ctx) != null);
  const sections = [...new Set(metricCols.map((c) => c.section))];

  return (
    <div className="stock-view">
      <nav className="breadcrumb">
        <button className="crumb-link" onClick={onBack} title="Back to the list (Esc)">
          ← {listName}
        </button>
        <span className="muted"> › {q.symbol}</span>
        <span className="spacer" />
        <button disabled={!prev} onClick={() => prev && onNavigate(prev)} title="Previous in list (←)">
          ‹<span className="nav-sym"> {prev ?? ""}</span>
        </button>
        <button disabled={!next} onClick={() => next && onNavigate(next)} title="Next in list (→)">
          <span className="nav-sym">{next ?? ""} </span>›
        </button>
      </nav>

      <div className="card detail">
        <div className="detail-head">
          <div>
            <h2>
              <HorseIcon type={meta?.investmentType} size={22} />
              {q.symbol} <span className="muted">{meta?.name ?? q.name}</span>
              {meta?.investmentType && <span className="type-tag">{meta.investmentType}</span>}
            </h2>
            {(meta?.sector || meta?.niche || meta?.country) && (
              <div className="muted small">{[meta?.sector, meta?.niche, meta?.country].filter((x) => x && x !== "-").join(" · ")}</div>
            )}
            <div className="price">
              {fmtNum(q.price)} {q.currency}{" "}
              <span className={tone(q.change)}>
                {q.change > 0 ? "+" : ""}
                {fmtNum(q.change)} ({fmtPct(q.changePct, 2)})
              </span>
            </div>
            {foreign && (
              <div className="muted">
                ≈ {fmtNum(toBase(q.price, fx))} {baseCurrency}
              </div>
            )}
            {q.source && <div className="muted small">Source: {q.source}</div>}
          </div>
          <div className="mini-scores">
            {SCORECARDS.filter((c) => ["sundhet", "keyMetrics", "dividend", "quality"].includes(c.id)).map((c) => {
              const s = score(c, sourceOf(row, ctx), ctx.scoring);
              return (
                <button key={c.id} className="mini-score" onClick={() => setTab("scores")} title={`${c.name}: ${s.covered}/${s.total} metrics`}>
                  <span className={`badge-score sb-${scoreBand(s.pct) ?? "none"}`}>{s.pct ?? "–"}</span>
                  <small>{c.name}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div className="tabs-bar" role="tablist">
          {(
            [
              ["overview", "Overview"],
              ["scores", "Scores"],
              ["info", "My notes"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <>
            <div className="ranges">
              {RANGES.map((r) => (
                <button key={r} className={r === range ? "active" : ""} onClick={() => setRange(r)}>
                  {r}
                </button>
              ))}
            </div>
            {error ? <p className="neg">{error}</p> : candles ? <PriceChart candles={candles} /> : <div className="chart loading">Loading…</div>}
            <dl className="stats">
              {overview.map(([k, v, cls]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd className={cls}>{v}</dd>
                </div>
              ))}
            </dl>
            {sections.map((sec) => (
              <div key={sec}>
                <h3>{sec}</h3>
                <dl className="stats">
                  {metricCols
                    .filter((c) => c.section === sec)
                    .map((c) => (
                      <div key={c.id} title={c.title}>
                        <dt>{c.label}</dt>
                        <dd>{c.render ? c.render(row, ctx) : String(c.value(row, ctx))}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}
          </>
        )}

        {tab === "scores" && <ScorePanel row={row} ctx={ctx} onAssess={onAssess} />}
        {tab === "info" && <StockInfo
            symbol={q.symbol}
            meta={meta}
            usedTypes={Object.values(ctx.stocks ?? {}).flatMap((m) => (m?.investmentType ? [m.investmentType] : []))}
            onChange={onMeta}
            onAssess={onAssess}
          />}
      </div>
    </div>
  );
}
