import { useState } from "react";
import { MANUAL_LEVELS, type ManualKey, type MetricKey } from "../../shared/metrics";
import { score, scoreBand } from "../../shared/scoring";
import type { WatchlistRow } from "../../shared/types";
import { isImportSource } from "../../shared/importMerge";
import { formatMetric, ImportedMark, sourceOf, sourceOfValue, type Ctx } from "../columns";

interface Props {
  row: WatchlistRow;
  ctx: Ctx;
  onAssess: (key: string, value: number | null) => void;
}

const fmtPts = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

/** Every scorecard for one stock, each expandable into its criteria. */
export function ScorePanel({ row, ctx, onAssess }: Props) {
  const [open, setOpen] = useState<string | null>("sundhet");
  const src = sourceOf(row, ctx);
  /** Where a criterion's value came from: provider, imported file, computed from prices or your own assessment. */
  const origin = (metric: MetricKey, hasValue: boolean) => {
    if (!hasValue) return "";
    if (metric.startsWith("manual.")) return "your assessment";
    if (metric in row.metrics) return "calculated from prices";
    return sourceOfValue(row, metric) ?? "";
  };

  return (
    <div className="scores">
      {ctx.scorecards.map((card) => {
        const s = score(card, src, ctx.scoring);
        const isOpen = open === card.id;
        return (
          <section key={card.id} className={`score-card ${isOpen ? "open" : ""}`}>
            <button className="score-head" onClick={() => setOpen(isOpen ? null : card.id)} aria-expanded={isOpen}>
              <span className={`badge-score sb-${scoreBand(s.pct) ?? "none"}`}>{s.pct ?? "–"}</span>
              <span className="score-name">
                <strong>{card.name}</strong>
                <small className="muted">
                  {fmtPts(s.points)} of {fmtPts(s.max)} pts · {s.covered}/{s.total} metrics ({Math.round(s.coverage * 100)} % of the points) · {card.origin}
                </small>
              </span>
              <span className="caret">{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div className="score-body">
                <p className="muted small">{card.description}</p>
                {s.rawPct != null && !s.sufficient && (
                  <p className="thin-note small">
                    Too little data for a score: the metrics below cover {Math.round(s.coverage * 100)} % of the points, and at least{" "}
                    {Math.round((ctx.scoring.minCoverage ?? 0.6) * 100)} % is needed. On the metrics that are there it would be {s.rawPct}.
                  </p>
                )}
                <table className="breakdown">
                  <thead>
                    <tr>
                      <th className="left">Metric</th>
                      <th>Value</th>
                      <th className="left">Tier</th>
                      <th>Points</th>
                      <th className="left">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.details.map((d) => {
                      const manual = d.criterion.metric.startsWith("manual.") ? (d.criterion.metric.slice(7) as ManualKey) : null;
                      const frac = d.points == null || d.max === 0 ? null : d.points / d.max;
                      return (
                        <tr key={d.criterion.id} className={d.value == null ? "missing" : ""}>
                          <td className="left">{d.criterion.label}</td>
                          <td>
                            {manual ? (
                              <select
                                value={d.value ?? ""}
                                onChange={(e) => onAssess(manual, e.target.value === "" ? null : Number(e.target.value))}
                              >
                                <option value="">Not assessed</option>
                                {MANUAL_LEVELS[manual].map((label, i) => (
                                  <option key={i} value={i}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <>
                                {formatMetric(d.criterion.metric, d.value)}
                                {d.value != null && <ImportedMark src={sourceOfValue(row, d.criterion.metric)} />}
                              </>
                            )}
                          </td>
                          <td className="left muted">{d.value == null ? "missing" : (d.tier?.label ?? "")}</td>
                          <td>
                            {d.points == null ? (
                              <span className="muted">– / {fmtPts(d.max)}</span>
                            ) : (
                              <span className={frac == null ? "" : frac >= 0.67 ? "pos" : frac <= 0 ? "neg" : ""}>
                                {fmtPts(d.points)} / {fmtPts(d.max)}
                              </span>
                            )}
                          </td>
                          <td className={`left small source ${isImportSource(origin(d.criterion.metric, d.value != null)) ? "imported" : "muted"}`}>
                            {origin(d.criterion.metric, d.value != null)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
