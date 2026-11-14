import { useEffect, useMemo, useState } from "react";
import { explainScore, type CriterionWhy } from "../../shared/explain";
import { scoreBand, type Scorecard } from "../../shared/scoring";
import type { WatchlistRow } from "../../shared/types";
import { explainChange, scoreHistory, snapshotBefore, type Snapshot } from "../../shared/scoreHistory";
import { api } from "../api";
import { formatMetric, metaOf, sourceOf, type Ctx } from "../columns";

interface Props {
  row: WatchlistRow;
  /** The other stocks in the list. */
  peers: WatchlistRow[];
  ctx: Ctx;
  listName: string;
  /** Scorecard to explain first: the list's lens, or Sundhet. */
  initialCard: Scorecard;
  onShowAll: () => void;
}

const SHOWN = 6;
const fmtEffect = (e: number) => `${e > 0 ? "+" : e < 0 ? "−" : "±"}${Math.abs(e) < 9.95 ? Math.abs(e).toFixed(1) : Math.round(Math.abs(e))}`;

/** "Why this score": what lifts the stock above or pulls it below a typical stock in the same list. */
export function WhyPanel({ row, peers, ctx, listName, initialCard, onShowAll }: Props) {
  const [cardId, setCardId] = useState(initialCard.id);
  const [expanded, setExpanded] = useState(false);
  const card = ctx.scorecards.find((c) => c.id === cardId) ?? initialCard;

  const why = useMemo(
    () =>
      explainScore(
        card,
        sourceOf(row, ctx),
        peers.filter((p) => !p.error).map((p) => sourceOf(p, ctx)),
        ctx.scoring,
      ),
    [card, row, peers, ctx],
  );

  const shown = expanded ? why.criteria : why.criteria.slice(0, SHOWN);
  const scale = Math.max(5, ...why.criteria.map((c) => Math.abs(c.effect ?? 0)));
  const vsAvg = why.pct != null && why.peerAvg != null ? why.pct - why.peerAvg : null;

  return (
    <section className="why card-inset" aria-label="Why this score">
      <header className="why-head">
        <span className={`badge-score sb-${scoreBand(why.pct) ?? "none"}`}>{why.pct ?? "–"}</span>
        <div className="why-title">
          <label>
            <span className="muted small">Why this score on </span>
            <select value={card.id} onChange={(e) => setCardId(e.target.value)} aria-label="Scorecard to explain">
              {ctx.scorecards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="muted small">
            {why.rank != null && why.ranked > 1 ? (
              <>
                #{why.rank} of {why.ranked} in {listName}
                {vsAvg != null && (
                  <>
                    {" "}
                    · <span className={vsAvg > 0 ? "pos" : vsAvg < 0 ? "neg" : ""}>{fmtEffect(vsAvg)}</span> vs the list average (
                    {Math.round(why.peerAvg!)})
                  </>
                )}
              </>
            ) : why.pct == null ? (
              "Too little data for a score yet"
            ) : (
              "Add more stocks to the list to compare"
            )}
          </div>
        </div>
      </header>

      {why.criteria.length > 0 && (
        <ul className="why-list">
          {shown.map((c) => (
            <WhyRow key={c.criterion.id} c={c} scale={scale} />
          ))}
        </ul>
      )}
      <div className="why-foot small">
        {why.criteria.length > SHOWN && (
          <button className="link" onClick={() => setExpanded(!expanded)}>
            {expanded ? "Show fewer" : `Show all ${why.criteria.length}`}
          </button>
        )}
        {why.missing.length > 0 && (
          <span className="muted" title={why.missing.map((m) => m.criterion.label).join(", ")}>
            Missing: {why.missing.slice(0, 3).map((m) => m.criterion.label).join(", ")}
            {why.missing.length > 3 && ` +${why.missing.length - 3}`}
          </span>
        )}
        <button className="link" onClick={onShowAll}>
          Full breakdown →
        </button>
      </div>
      <ScoreTrend row={row} card={card} ctx={ctx} />
    </section>
  );
}

function WhyRow({ c, scale }: { c: CriterionWhy; scale: number }) {
  const e = c.effect;
  const width = e == null ? 0 : (Math.abs(e) / scale) * 50;
  const metric = c.criterion.metric;
  return (
    <li className="why-row">
      <span className="why-label" title={c.criterion.label}>
        {c.criterion.label}
      </span>
      <span className="why-value">
        <strong>{formatMetric(metric, c.value)}</strong>
        {c.peerValue != null && <small className="muted"> list {formatMetric(metric, c.peerValue)}</small>}
      </span>
      <span className="why-bar" aria-hidden>
        <span className="why-axis" />
        {e != null && e !== 0 && (
          <span className={`why-fill ${e > 0 ? "up" : "down"}`} style={e > 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }} />
        )}
      </span>
      <span className={`why-effect ${e == null ? "muted" : e > 0.05 ? "pos" : e < -0.05 ? "neg" : "muted"}`}>
        {e == null ? "no peers" : fmtEffect(e)}
      </span>
    </li>
  );
}

const PERIODS = [
  ["1M", 30],
  ["3M", 91],
  ["1Y", 365],
  ["All", 100_000],
] as const;

const fmtDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The score over time, recomputed from stored key figures, and what moved it. */
function ScoreTrend({ row, card, ctx }: { row: WatchlistRow; card: Scorecard; ctx: Ctx }) {
  const symbol = row.quote.symbol;
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null);
  const [period, setPeriod] = useState<number>(91);

  useEffect(() => {
    let alive = true;
    setSnaps(null);
    api
      .snapshots(symbol)
      .then((s) => alive && setSnaps(s))
      .catch(() => alive && setSnaps([]));
    return () => {
      alive = false;
    };
  }, [symbol]);

  const meta = metaOf(row, ctx);
  const from = snaps ? Math.max(0, snapshotBefore(snaps, period)) : 0;
  const visible = useMemo(() => (snaps ? snaps.slice(from) : []), [snaps, from]);
  const points = useMemo(() => scoreHistory(card, visible, meta, ctx.scoring), [card, visible, meta, ctx.scoring]);
  const change = useMemo(
    () => (visible.length >= 2 ? explainChange(card, visible[0], visible[visible.length - 1], meta, ctx.scoring) : null),
    [card, visible, meta, ctx.scoring],
  );

  if (snaps == null) return null;
  if (snaps.length < 2)
    return (
      <p className="trend-empty muted small">
        Score history starts today: the figures behind the scores are saved every time the list loads, so a trend shows up here after a
        few days.
      </p>
    );

  const span = snaps.length ? (Date.parse(snaps[snaps.length - 1].d) - Date.parse(snaps[0].d)) / 86_400_000 : 0;
  const delta = change && change.from.pct != null && change.to.pct != null ? change.to.pct - change.from.pct : null;

  return (
    <div className="trend">
      <div className="trend-head">
        <span className="small">
          <strong>Over time</strong>{" "}
          {change && (
            <span className="muted">
              since {fmtDay(change.from.d)}: {change.from.pct ?? "–"} → {change.to.pct ?? "–"}{" "}
              {delta != null && <span className={delta > 0 ? "pos" : delta < 0 ? "neg" : ""}>({delta > 0 ? "+" : delta < 0 ? "−" : "±"}{Math.abs(Math.round(delta))})</span>}
            </span>
          )}
        </span>
        <span className="trend-periods">
          {PERIODS.filter(([, days], i) => i === 0 || days <= span * 1.5 || days === 100_000).map(([label, days]) => (
            <button key={label} className={period === days ? "active" : ""} onClick={() => setPeriod(days)}>
              {label}
            </button>
          ))}
        </span>
      </div>
      <Sparkline points={points.map((p) => p.pct)} />
      {change && change.changes.some((c) => Math.abs(c.effect) >= 0.5) && (
        <ul className="trend-changes small">
          {change.changes.filter((c) => Math.abs(c.effect) >= 0.5 || c.from == null || c.to == null).slice(0, 3).map((c) => (
            <li key={c.criterion.id}>
              <span>{c.criterion.label}</span>{" "}
              <span className="muted">
                {formatMetric(c.criterion.metric, c.from)} → {formatMetric(c.criterion.metric, c.to)}
              </span>{" "}
              <strong className={c.effect > 0 ? "pos" : c.effect < 0 ? "neg" : "muted"}>{fmtEffect(c.effect)}</strong>
            </li>
          ))}
        </ul>
      )}
      {(meta?.assessments && Object.keys(meta.assessments).length > 0) && (
        <p className="muted small trend-note">Your own assessments aren't dated, so today's are used for every point.</p>
      )}
    </div>
  );
}

/** The score as a line, scaled to its own range so small moves show; gaps where there was too little data. */
function Sparkline({ points }: { points: (number | null)[] }) {
  const w = 300;
  const h = 56;
  const vals = points.filter((v): v is number => v != null);
  if (!vals.length) return <p className="muted small">Too little data for a score at any point in this period.</p>;
  // At least a 20-point window, so noise doesn't look like a crash.
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = Math.max(0, 20 - (hi - lo)) / 2;
  lo = Math.max(0, Math.floor(lo - pad));
  hi = Math.min(100, Math.ceil(hi + pad));
  if (hi - lo < 20) (lo === 0 ? (hi = 20) : (lo = hi - 20));
  const x = (i: number) => (points.length < 2 ? w : (i / (points.length - 1)) * w);
  const y = (v: number) => h - 3 - ((v - lo) / (hi - lo)) * (h - 6);
  const segments: string[] = [];
  let cur = "";
  points.forEach((v, i) => {
    if (v == null) {
      if (cur) segments.push(cur);
      cur = "";
      return;
    }
    cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segments.push(cur);
  return (
    <div className="spark-wrap">
      <span className="spark-scale muted">
        <span>{hi}</span>
        <span>{lo}</span>
      </span>
      <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Score over time, between ${lo} and ${hi}`}>
        <line x1={0} x2={w} y1={y((lo + hi) / 2)} y2={y((lo + hi) / 2)} className="spark-mid" />
        {segments.map((d, i) => (
          <path key={i} d={d} className="spark-line" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    </div>
  );
}
