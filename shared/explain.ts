// "Why does this stock score what it does?" – compares one stock's points per
// criterion with the rest of its list, so the score can be read as
// "ROIC lifts it 8 points above a typical stock in the list, the dividend
// pulls it down 5".
import { metricValue, type MetricSource } from "./metrics";
import { score, type Criterion, type ScoreOptions, type Scorecard } from "./scoring";

export interface CriterionWhy {
  criterion: Criterion;
  value: number | null;
  points: number | null;
  max: number;
  /** The list's median value for the metric (other stocks only). */
  peerValue: number | null;
  /** Average points the other stocks with data get on this criterion. */
  peerPoints: number | null;
  /** How many other stocks had data. */
  peerCount: number;
  /**
   * Effect on the 0–100 score compared with an average stock in the list:
   * (points − peer average) / the stock's available max × 100.
   * Null when the stock or every peer is missing the metric.
   */
  effect: number | null;
}

export interface ScoreWhy {
  scorecard: Scorecard;
  pct: number | null;
  /** Average score of the other stocks that have one. */
  peerAvg: number | null;
  /** 1-based place among the stocks in the list that have a score. */
  rank: number | null;
  ranked: number;
  /** Every criterion, biggest effect (either way) first; missing values last. */
  criteria: CriterionWhy[];
  /** Criteria the stock has no value for, and what the list average would have given. */
  missing: CriterionWhy[];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Explains a stock's score on one scorecard against its peers. `peers` are the
 * other stocks in the list (the stock itself is skipped if it is included).
 */
export function explainScore(card: Scorecard, src: MetricSource, peers: MetricSource[], opts?: ScoreOptions): ScoreWhy {
  const own = score(card, src, opts);
  const others = peers.filter((p) => p !== src).map((p) => score(card, p, opts));
  const otherSrc = peers.filter((p) => p !== src);

  const rows: CriterionWhy[] = own.details.map((d, i) => {
    const peerDetails = others.map((o) => o.details[i]).filter((pd) => pd.points != null);
    const peerPoints = mean(peerDetails.map((pd) => pd.points!));
    const peerValues = otherSrc.map((p) => metricValue(p, d.criterion.metric)).filter((v): v is number => v != null);
    const effect = d.points != null && peerPoints != null && own.max > 0 ? ((d.points - peerPoints) / own.max) * 100 : null;
    return {
      criterion: d.criterion,
      value: d.value,
      points: d.points,
      max: d.max,
      peerValue: median(peerValues),
      peerPoints,
      peerCount: peerDetails.length,
      effect,
    };
  });

  const scored = others.map((o) => o.pct).filter((p): p is number => p != null);
  const all = own.pct == null ? scored : [...scored, own.pct];
  return {
    scorecard: card,
    pct: own.pct,
    peerAvg: mean(scored),
    rank: own.pct == null ? null : 1 + scored.filter((p) => p > own.pct!).length,
    ranked: all.length,
    criteria: rows
      .filter((r) => r.value != null)
      .sort((a, b) => Math.abs(b.effect ?? 0) - Math.abs(a.effect ?? 0) || b.max - a.max),
    missing: rows.filter((r) => r.value == null).sort((a, b) => b.max - a.max),
  };
}
