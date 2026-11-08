import { useEffect, useState } from "react";
import type { Candle, HistoryRange, WatchlistRow } from "../../shared/types";
import { api } from "../api";
import { COLUMNS } from "../columns";
import { fmtBig, fmtNum, fmtPct, sameCurrency, toBase, tone } from "../format";
import { PriceChart } from "./PriceChart";

const RANGES: HistoryRange[] = ["6mo", "1y", "2y", "5y"];

interface Props {
  row: WatchlistRow;
  listName: string;
  baseCurrency: string;
  prev?: string;
  next?: string;
  onBack: () => void;
  onNavigate: (symbol: string) => void;
}

/** Full-page view of one stock. Breadcrumb "List › Stock"; the list name leads back. */
export function DetailPanel({ row, listName, baseCurrency, prev, next, onBack, onNavigate }: Props) {
  const { quote: q, metrics: m, fx, fundamentals: f } = row;
  const [range, setRange] = useState<HistoryRange>("1y");
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

  // Esc goes back; ←/→ step through the list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
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
    ["Volatility (1y)", fmtPct(m.volatility).replace("+", "")],
    ["Max drawdown (1y)", fmtPct(m.maxDrawdown), tone(m.maxDrawdown)],
    ["RSI(14)", fmtNum(m.rsi14, 0)],
    ["Dividend / share", both(f.dividendPerShare)],
    ["Market cap", both(f.marketCap, true)],
    ...(foreign ? ([[`${q.currency}/${baseCurrency}`, fmtNum(fx, 4)]] as [string, string][]) : []),
  ];

  // Every "extra" column that has a value for this stock.
  const keyFigures = COLUMNS.filter((c) => c.tier === "extra" && c.id !== "mktcap" && c.id !== "dps").filter(
    (c) => c.value(row, { baseCurrency }) != null,
  );

  return (
    <div className="stock-view">
      <nav className="breadcrumb">
        <button className="crumb-link" onClick={onBack} title="Back to the list (Esc)">
          ← {listName}
        </button>
        <span className="muted"> › {q.symbol}</span>
        <span className="spacer" />
        <button disabled={!prev} onClick={() => prev && onNavigate(prev)} title="Previous in list (←)">
          ‹ {prev ?? ""}
        </button>
        <button disabled={!next} onClick={() => next && onNavigate(next)} title="Next in list (→)">
          {next ?? ""} ›
        </button>
      </nav>

      <div className="card detail">
        <div className="detail-head">
          <div>
            <h2>
              {q.symbol} <span className="muted">{q.name}</span>
            </h2>
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
          <div className="ranges">
            {RANGES.map((r) => (
              <button key={r} className={r === range ? "active" : ""} onClick={() => setRange(r)}>
                {r}
              </button>
            ))}
          </div>
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
        {keyFigures.length > 0 && (
          <>
            <h3>Key figures</h3>
            <dl className="stats">
              {keyFigures.map((c) => (
                <div key={c.id} title={c.title}>
                  <dt>{c.label}</dt>
                  <dd>{c.render ? c.render(row, { baseCurrency }) : fmtNum(c.value(row, { baseCurrency }))}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
    </div>
  );
}
