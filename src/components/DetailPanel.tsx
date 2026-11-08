import { useEffect, useState } from "react";
import type { Candle, HistoryRange, WatchlistRow } from "../../shared/types";
import { api } from "../api";
import { fmtBig, fmtNum, fmtPct, sameCurrency, toBase, tone } from "../format";
import { PriceChart } from "./PriceChart";

const RANGES: HistoryRange[] = ["6mo", "1y", "2y", "5y"];

export function DetailPanel({ row, baseCurrency, onClose }: { row: WatchlistRow; baseCurrency: string; onClose: () => void }) {
  const { quote: q, metrics: m, fx } = row;
  const foreign = !sameCurrency(q.currency, baseCurrency) && fx != null;
  /** "12,34 USD (≈ 130,80 SEK)" – original first, base currency in brackets. */
  const both = (v: number | undefined, big = false) => {
    const f = big ? fmtBig : fmtNum;
    const base = toBase(v, fx);
    return foreign && base != null ? `${f(v)} ${q.currency} (≈ ${f(base)} ${baseCurrency})` : `${f(v)} ${q.currency}`;
  };
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

  const stats: [string, string, string?][] = [
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
    ["P/E", fmtNum(q.pe, 1)],
    ["Dividend yield", fmtPct(q.dividendYield).replace("+", "")],
    ["Payout ratio", fmtPct(q.payoutRatio, 0).replace("+", ""), q.payoutRatio != null && q.payoutRatio > 100 ? "neg" : ""],
    ["Dividend / share", both(q.dividendPerShare)],
    ["Market cap", both(q.marketCap, true)],
    ...(foreign ? ([[`${q.currency}/${baseCurrency}`, fmtNum(fx, 4)]] as [string, string][]) : []),
  ];

  return (
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
        </div>
        <div className="ranges">
          {RANGES.map((r) => (
            <button key={r} className={r === range ? "active" : ""} onClick={() => setRange(r)}>
              {r}
            </button>
          ))}
          <button className="icon" onClick={onClose} title="Close">
            ×
          </button>
        </div>
      </div>
      {error ? <p className="neg">{error}</p> : candles ? <PriceChart candles={candles} /> : <div className="chart loading">Loading…</div>}
      <dl className="stats">
        {stats.map(([k, v, cls]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className={cls}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
