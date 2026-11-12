import { useState } from "react";
import { MANUAL_LEVELS, type ManualKey } from "../../shared/metrics";
import { SCORECARDS, score, scoreBand } from "../../shared/scoring";
import type { WatchlistRow } from "../../shared/types";
import { formatMetric, sourceOf, type Ctx } from "../columns";

interface Props {
  row: WatchlistRow;
  ctx: Ctx;
  onAssess: (key: string, value: number | null) => void;
}

const fmtPts = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
};

/** Every scorecard for one stock, each expandable into its criteria. */
export function ScorePanel({ row, ctx, onAssess }: Props) {
  const [open, setOpen] = useState<string | null>("sundhet");
  const src = sourceOf(row, ctx);

  return (
    <div className="scores">
      {SCORECARDS.map((card) => {
        const s = score(card, src, ctx.scoring);
        const isOpen = open === card.id;
        return (
          <section key={card.id} className={`score-card ${isOpen ? "open" : ""}`}>
            <button className="score-head" onClick={() => setOpen(isOpen ? null : card.id)} aria-expanded={isOpen}>
              <span className={`badge-score sb-${scoreBand(s.pct) ?? "none"}`}>{s.pct ?? "–"}</span>
              <span className="score-name">
                <strong>{card.name}</strong>
                <small className="muted">
                  {fmtPts(s.points)} av {fmtPts(s.max)} p · {s.covered}/{s.total} mått ({Math.round(s.coverage * 100)} % av poängen) · {card.origin}
                </small>
              </span>
              <span className="caret">{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div className="score-body">
                <p className="muted small">{card.description}</p>
                {s.rawPct != null && !s.sufficient && (
                  <p className="thin-note small">
                    För lite data för en poäng: måtten nedan täcker {Math.round(s.coverage * 100)} % av poängen, och minst{" "}
                    {Math.round((ctx.scoring.minCoverage ?? 0.6) * 100)} % krävs. På de mått som finns blir det {s.rawPct}.
                  </p>
                )}
                <table className="breakdown">
                  <thead>
                    <tr>
                      <th className="left">Mått</th>
                      <th>Värde</th>
                      <th className="left">Nivå</th>
                      <th>Poäng</th>
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
                                <option value="">Ej bedömd</option>
                                {MANUAL_LEVELS[manual].map((label, i) => (
                                  <option key={i} value={i}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              formatMetric(d.criterion.metric, d.value)
                            )}
                          </td>
                          <td className="left muted">{d.value == null ? "saknas" : (d.tier?.label ?? "")}</td>
                          <td>
                            {d.points == null ? (
                              <span className="muted">– / {fmtPts(d.max)}</span>
                            ) : (
                              <span className={frac == null ? "" : frac >= 0.67 ? "pos" : frac <= 0 ? "neg" : ""}>
                                {fmtPts(d.points)} / {fmtPts(d.max)}
                              </span>
                            )}
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
