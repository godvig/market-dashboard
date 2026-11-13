import { useEffect, useMemo, useRef, useState } from "react";
import { METRICS, METRIC_BY_KEY, type MetricKey } from "../../shared/metrics";
import { score, scoreBand, type Criterion, type Scorecard, type Tier } from "../../shared/scoring";
import {
  blankScorecard,
  duplicateScorecard,
  isCustomId,
  isScorecardFile,
  LIMITS,
  newCriterion,
  parseScorecard,
  toScorecardFile,
} from "../../shared/scorecardIO";
import type { WatchlistRow } from "../../shared/types";
import { COLUMNS, sourceOf, type Ctx } from "../columns";

interface Props {
  /** Presets first, then the user's own. */
  cards: Scorecard[];
  selectedId?: string;
  rows: WatchlistRow[];
  ctx: Ctx;
  listName: string;
  /** The scorecard the open list is ranked by. */
  lensId?: string;
  onSelect: (id: string) => void;
  onSave: (card: Scorecard) => void;
  onDelete: (id: string) => void;
  onLens: (id: string | undefined) => void;
  onBack: () => void;
}

/** Metrics grouped by the same sections as the column picker. */
const METRIC_GROUPS = (() => {
  const section = new Map(COLUMNS.map((c) => [c.id, c.section]));
  const groups = new Map<string, { key: MetricKey; label: string }[]>();
  for (const m of METRICS) {
    const s = section.get(m.key) ?? "Other";
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s)!.push({ key: m.key, label: m.label });
  }
  return [...groups];
})();

const UNIT_HINT: Record<string, string> = {
  pct: "%",
  x: "×",
  years: "years",
  level: "level",
  amount: "amount",
};

/** Ranks rows by a scorecard: best first, rows without a score last. */
function rank(card: Scorecard, rows: WatchlistRow[], ctx: Ctx) {
  return rows
    .filter((r) => !r.error)
    .map((r) => ({ row: r, s: score(card, sourceOf(r, ctx), ctx.scoring) }))
    .sort((a, b) => (b.s.pct ?? -1) - (a.s.pct ?? -1) || a.row.quote.symbol.localeCompare(b.row.quote.symbol));
}

function download(card: Scorecard) {
  const blob = new Blob([JSON.stringify(toScorecardFile(card), null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `scorecard-${
    card.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "custom"
  }.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Build, copy and tune scorecards, with a live ranking of the open list. */
export function ScorecardEditor({ cards, selectedId, rows, ctx, listName, lensId, onSelect, onSave, onDelete, onLens, onBack }: Props) {
  const selected = cards.find((c) => c.id === selectedId) ?? cards.find((c) => c.id === lensId) ?? cards[0];
  const editable = isCustomId(selected.id);
  const presets = cards.filter((c) => !isCustomId(c.id));
  const custom = cards.filter((c) => isCustomId(c.id));

  const [draft, setDraft] = useState<Scorecard>(selected);
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // A new card picked: start from the saved version and remember its ranking,
  // so the preview can show how far each stock moves while you edit.
  const [baseline, setBaseline] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    setDraft(selected);
    setError(undefined);
    setConfirmDelete(false);
    setBaseline(new Map(rank(selected, rows, ctx).map((x, i) => [x.row.quote.symbol, i])));
    // Only when another card is picked, not on every save or reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.id]);

  // Autosave a valid draft shortly after the last change. Compared as JSON, so
  // the store handing back an equal copy doesn't trigger another save.
  const saved = useRef("");
  useEffect(() => {
    saved.current = JSON.stringify(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.id]);
  useEffect(() => {
    // Right after switching cards the draft still holds the previous one.
    if (!editable || draft.id !== selected.id) return;
    const t = setTimeout(() => {
      try {
        const card = parseScorecard(draft);
        const json = JSON.stringify(card);
        setError(undefined);
        if (json === saved.current) return;
        saved.current = json;
        onSave(card);
      } catch (e) {
        setError((e as Error).message);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [draft, editable, onSave, selected.id]);

  const ranking = useMemo(() => rank(draft, rows, ctx), [draft, rows, ctx]);

  const edit = (fn: (c: Scorecard) => Scorecard) => editable && setDraft((d) => fn(d));
  const editCriterion = (i: number, fn: (c: Criterion) => Criterion) =>
    edit((d) => ({
      ...d,
      criteria: d.criteria.map((c, j) => (j === i ? fn(c) : c)),
    }));
  const editTier = (ci: number, ti: number, fn: (t: Tier) => Tier) =>
    editCriterion(ci, (c) => ({
      ...c,
      tiers: c.tiers.map((t, j) => (j === ti ? fn(t) : t)),
    }));
  const move = <T,>(arr: T[], i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  const create = (card: Scorecard) => {
    onSave(card);
    onSelect(card.id);
  };

  const importFile = async (file: File) => {
    try {
      const data: unknown = JSON.parse(await file.text());
      const card = parseScorecard(isScorecardFile(data) ? data.scorecard : data);
      // A file never overwrites a card you already have.
      create(cards.some((c) => c.id === card.id) ? duplicateScorecard(card, card.name) : card);
      setError(undefined);
    } catch (e) {
      setError(`Could not import ${file.name}: ${(e as Error).message}`);
    }
  };

  const maxPoints = draft.criteria.reduce((sum, c) => sum + Math.max(0, ...c.tiers.map((t) => t.points)) * (c.weight ?? 1), 0);

  return (
    <div className="sc-editor">
      <nav className="breadcrumb">
        <button className="crumb-link" onClick={onBack}>
          ← {listName}
        </button>
        <span className="muted"> › Scorecards</span>
      </nav>

      <div className="sc-layout">
        <aside className="card sc-list">
          <div className="sc-list-head">Built in</div>
          <ul>
            {presets.map((c) => (
              <li key={c.id}>
                <button className={c.id === selected.id ? "sc-item active" : "sc-item"} onClick={() => onSelect(c.id)}>
                  <span className="sc-lock" aria-label="locked" title="Built in – duplicate it to make changes">
                    🔒
                  </span>
                  {c.name}
                  {c.id === lensId && <span className="sc-lens-tag">lens</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="sc-list-head">Yours</div>
          <ul>
            {custom.map((c) => (
              <li key={c.id}>
                <button className={c.id === selected.id ? "sc-item active" : "sc-item"} onClick={() => onSelect(c.id)}>
                  {c.name}
                  {c.id === lensId && <span className="sc-lens-tag">lens</span>}
                </button>
              </li>
            ))}
            {custom.length === 0 && <li className="muted sc-empty">None yet. Duplicate a built-in one or start fresh.</li>}
          </ul>
          <div className="sc-list-actions">
            <button onClick={() => create(blankScorecard())} disabled={custom.length >= LIMITS.scorecards}>
              + New
            </button>
            <button onClick={() => fileInput.current?.click()}>Import…</button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = "";
              }}
            />
          </div>
        </aside>

        <section className="card sc-main">
          <div className="sc-head">
            {editable ? (
              <input
                className="sc-name"
                value={draft.name}
                maxLength={60}
                aria-label="Scorecard name"
                onChange={(e) => edit((d) => ({ ...d, name: e.target.value }))}
              />
            ) : (
              <h2 className="sc-name">{draft.name}</h2>
            )}
            <div className="sc-actions">
              <button
                className={selected.id === lensId ? "active" : ""}
                title={`Rank “${listName}” by this scorecard`}
                onClick={() => onLens(selected.id === lensId ? undefined : selected.id)}
              >
                {selected.id === lensId ? "✓ Ranks this list" : "Rank this list by it"}
              </button>
              <button onClick={() => create(duplicateScorecard(editable ? draft : selected))} disabled={custom.length >= LIMITS.scorecards}>
                Duplicate
              </button>
              <button onClick={() => download(editable ? draft : selected)}>Export</button>
              {editable &&
                (confirmDelete ? (
                  <button
                    className="danger"
                    onClick={() => {
                      onDelete(selected.id);
                      onSelect(cards[0].id);
                    }}
                  >
                    Really delete?
                  </button>
                ) : (
                  <button onClick={() => setConfirmDelete(true)}>Delete</button>
                ))}
            </div>
          </div>

          {!editable && (
            <p className="sc-locked-note">
              Built-in scorecards follow the spreadsheets and can't be changed. <strong>Duplicate</strong> it to make your own version.
            </p>
          )}
          {editable ? (
            <textarea
              className="sc-desc"
              rows={2}
              maxLength={400}
              placeholder="What this scorecard looks for…"
              value={draft.description}
              onChange={(e) => edit((d) => ({ ...d, description: e.target.value }))}
            />
          ) : (
            <p className="muted">
              {draft.description} <small>({draft.origin})</small>
            </p>
          )}
          {error && <p className="neg">{error}</p>}

          <div className="sc-summary muted">
            {draft.criteria.length} criteria · {Math.round(maxPoints * 10) / 10} points possible
          </div>

          <ol className="sc-criteria">
            {draft.criteria.map((c, ci) => {
              const def = METRIC_BY_KEY.get(c.metric);
              const share = maxPoints > 0 ? (Math.max(0, ...c.tiers.map((t) => t.points)) * (c.weight ?? 1)) / maxPoints : 0;
              return (
                <li key={c.id} className="sc-crit">
                  <div className="sc-crit-head">
                    <input
                      className="sc-crit-label"
                      value={c.label}
                      maxLength={80}
                      disabled={!editable}
                      aria-label="Criterion name"
                      onChange={(e) =>
                        editCriterion(ci, (x) => ({
                          ...x,
                          label: e.target.value,
                        }))
                      }
                    />
                    <select
                      value={c.metric}
                      disabled={!editable}
                      aria-label="Metric"
                      onChange={(e) =>
                        editCriterion(ci, (x) => {
                          const metric = e.target.value as MetricKey;
                          // Keep a label you typed yourself; follow the metric when it was the default.
                          const auto = x.label === METRIC_BY_KEY.get(x.metric)?.label;
                          return {
                            ...x,
                            metric,
                            label: auto ? (METRIC_BY_KEY.get(metric)?.label ?? x.label) : x.label,
                          };
                        })
                      }
                    >
                      {METRIC_GROUPS.map(([group, metrics]) => (
                        <optgroup key={group} label={group}>
                          {metrics.map((m) => (
                            <option key={m.key} value={m.key}>
                              {m.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <label className="sc-weight" title="Multiplies the points of every tier">
                      ×
                      <input
                        type="number"
                        min={0}
                        max={LIMITS.weight}
                        step={0.5}
                        value={c.weight ?? 1}
                        disabled={!editable}
                        aria-label="Weight"
                        onChange={(e) =>
                          editCriterion(ci, (x) => ({
                            ...x,
                            weight: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                    <span className="sc-share" title="Share of the scorecard's points">
                      {Math.round(share * 100)} %
                    </span>
                    {editable && (
                      <span className="sc-row-tools">
                        <button
                          className="icon"
                          title="Move up"
                          onClick={() =>
                            edit((d) => ({
                              ...d,
                              criteria: move(d.criteria, ci, -1),
                            }))
                          }
                        >
                          ↑
                        </button>
                        <button
                          className="icon"
                          title="Move down"
                          onClick={() =>
                            edit((d) => ({
                              ...d,
                              criteria: move(d.criteria, ci, 1),
                            }))
                          }
                        >
                          ↓
                        </button>
                        <button
                          className="icon"
                          title="Remove criterion"
                          disabled={draft.criteria.length <= 1}
                          onClick={() =>
                            edit((d) => ({
                              ...d,
                              criteria: d.criteria.filter((_, j) => j !== ci),
                            }))
                          }
                        >
                          ×
                        </button>
                      </span>
                    )}
                  </div>
                  {def?.description && <div className="sc-metric-desc muted">{def.description}</div>}

                  <table className="sc-tiers">
                    <thead>
                      <tr>
                        <th>From</th>
                        <th>To</th>
                        <th>Points</th>
                        <th title="A hard edge: never blended with the tiers next to it">Hard</th>
                        {editable && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {c.tiers.map((t, ti) => (
                        <tr key={ti}>
                          <td>
                            <Bound
                              ops={["gte", "gt"]}
                              tier={t}
                              unit={UNIT_HINT[def?.unit ?? ""]}
                              disabled={!editable}
                              onChange={(next) => editTier(ci, ti, () => next)}
                            />
                          </td>
                          <td>
                            <Bound
                              ops={["lte", "lt"]}
                              tier={t}
                              unit={UNIT_HINT[def?.unit ?? ""]}
                              disabled={!editable}
                              onChange={(next) => editTier(ci, ti, () => next)}
                            />
                          </td>
                          <td>
                            <input
                              className="sc-pts"
                              type="number"
                              step={0.5}
                              value={t.points}
                              disabled={!editable}
                              aria-label="Points"
                              onChange={(e) =>
                                editTier(ci, ti, (x) => ({
                                  ...x,
                                  points: Number(e.target.value),
                                }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={!!t.cliff}
                              disabled={!editable}
                              aria-label="Hard edge"
                              onChange={(e) =>
                                editTier(ci, ti, (x) => {
                                  const next = { ...x };
                                  if (e.target.checked) next.cliff = true;
                                  else delete next.cliff;
                                  return next;
                                })
                              }
                            />
                          </td>
                          {editable && (
                            <td className="sc-row-tools">
                              <button
                                className="icon"
                                title="Remove tier"
                                disabled={c.tiers.length <= 1}
                                onClick={() =>
                                  editCriterion(ci, (x) => ({
                                    ...x,
                                    tiers: x.tiers.filter((_, j) => j !== ti),
                                  }))
                                }
                              >
                                ×
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {editable && c.tiers.length < LIMITS.tiers && (
                    <button
                      className="link"
                      onClick={() =>
                        editCriterion(ci, (x) => ({
                          ...x,
                          tiers: [...x.tiers.slice(0, -1), { gte: 0, points: 1 }, ...x.tiers.slice(-1)],
                        }))
                      }
                    >
                      + Tier
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {editable && draft.criteria.length < LIMITS.criteria && (
            <button
              onClick={() =>
                edit((d) => {
                  let n = d.criteria.length + 1;
                  while (d.criteria.some((c) => c.id === `c${n}`)) n++;
                  return {
                    ...d,
                    criteria: [...d.criteria, newCriterion("pe", `c${n}`)],
                  };
                })
              }
            >
              + Add criterion
            </button>
          )}
          <p className="sc-help muted">
            The first tier whose range the value falls in gives the points; a tier with no range catches everything else. Between tiers the
            points are blended smoothly unless a tier is marked hard.
          </p>
        </section>

        <section className="card sc-preview">
          <div className="sc-list-head">Ranking of {listName}</div>
          {ranking.length === 0 ? (
            <p className="muted">The list has no stocks loaded yet.</p>
          ) : (
            <ol className="sc-rank">
              {ranking.map(({ row, s }, i) => {
                const before = baseline.get(row.quote.symbol);
                const moved = before == null ? 0 : before - i;
                return (
                  <li key={row.quote.symbol}>
                    <span className="sc-pos">{i + 1}</span>
                    <span className="sc-sym" title={row.quote.name}>
                      {row.quote.symbol}
                    </span>
                    <span className={`sc-move ${moved > 0 ? "pos" : moved < 0 ? "neg" : ""}`}>
                      {moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : ""}
                    </span>
                    <span className={`badge-score sb-${scoreBand(s.pct) ?? "none"}`}>{s.pct ?? "–"}</span>
                    <small>
                      {s.covered}/{s.total}
                    </small>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="muted sc-help">Arrows show how far a stock has moved since you opened this scorecard.</p>
        </section>
      </div>
    </div>
  );
}

/** One side of a tier's range: an operator (or "any") and a value. */
function Bound({
  ops,
  tier,
  unit,
  disabled,
  onChange,
}: {
  ops: ["gte", "gt"] | ["lte", "lt"];
  tier: Tier;
  unit?: string;
  disabled: boolean;
  onChange: (t: Tier) => void;
}) {
  const op = ops.find((o) => tier[o] != null);
  const value = op ? tier[op] : undefined;
  const symbols = { gte: "≥", gt: ">", lte: "≤", lt: "<" } as const;
  const set = (nextOp: string, nextValue: number | undefined) => {
    const t: Tier = { ...tier };
    for (const o of ops) delete t[o];
    if (nextOp && nextOp !== "any") t[nextOp as (typeof ops)[number]] = nextValue ?? 0;
    onChange(t);
  };
  return (
    <span className="sc-bound">
      <select value={op ?? "any"} disabled={disabled} aria-label="Operator" onChange={(e) => set(e.target.value, value)}>
        <option value="any">any</option>
        {ops.map((o) => (
          <option key={o} value={o}>
            {symbols[o]}
          </option>
        ))}
      </select>
      {op && (
        <input
          type="number"
          step="any"
          value={value}
          disabled={disabled}
          aria-label="Value"
          title={unit}
          onChange={(e) => set(op, e.target.value === "" ? 0 : Number(e.target.value))}
        />
      )}
    </span>
  );
}
