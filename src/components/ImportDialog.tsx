import { useEffect, useMemo, useState } from "react";
import { matchRows, TICKER_SUFFIXES, type KnownStock, type RowMatch } from "../../shared/importMatch";
import {
  columnScales,
  defaultMapping,
  headerHash,
  interpretRows,
  parseNumber,
  scaleChoices,
  toSheet,
  unitOf,
  type Cell,
} from "../../shared/importParse";
import { METRIC_BY_KEY, METRICS } from "../../shared/metrics";
import { FUNDAMENTAL_KEYS, type FundamentalKey, type ImportMapping, type ImportTarget, type SearchResult } from "../../shared/types";
import { api } from "../api";
import { formatMetric } from "../columns";
import type { FigureImport } from "../useStore";

interface Props {
  fileName: string;
  table: Cell[][];
  /** Stocks in your lists, to match rows against. */
  known: KnownStock[];
  savedMappings?: Record<string, ImportMapping>;
  maxAgeDays: number;
  onMaxAge: (days: number) => void;
  /** How many stocks have imported figures already. */
  importedCount: number;
  onClearImported: () => void;
  onImport: (imp: FigureImport) => void;
  onClose: () => void;
}

const PREVIEW_ROWS = 5;
const MAX_AGE_CHOICES = [30, 60, 90, 120, 180, 365, 730];
const ID_TARGETS: [ImportTarget, string][] = [
  ["id.ticker", "Ticker"],
  ["id.name", "Company name"],
  ["id.isin", "ISIN"],
];
const KEY_SET = new Set<string>(FUNDAMENTAL_KEYS);
const METRIC_OPTIONS = METRICS.filter((m) => KEY_SET.has(m.key));

const targetLabel = (t: ImportTarget) =>
  ID_TARGETS.find(([k]) => k === t)?.[1] ?? `${METRIC_BY_KEY.get(t)?.label ?? t} – ${METRIC_BY_KEY.get(t)?.sv ?? ""}`;

const baseName = (file: string) => file.replace(/\.[^.]+$/, "").slice(0, 60);

/** Choice for one row: a symbol, or "" to skip it. Undefined = what matching suggested. */
type Choice = string | undefined;

/**
 * Import key figures from a CSV/XLSX file: map columns to key figures,
 * check the interpreted values, match rows to stocks, save.
 */
export function ImportDialog({
  fileName, table, known, savedMappings, maxAgeDays, onMaxAge, importedCount, onClearImported, onImport, onClose,
}: Props) {
  const sheet = useMemo(() => toSheet(table), [table]);
  const hash = useMemo(() => headerHash(sheet.headers), [sheet.headers]);
  const saved = savedMappings?.[hash];
  const [mapping, setMapping] = useState<ImportMapping>(() => (saved ? { ...saved, headers: sheet.headers } : defaultMapping(sheet.headers)));
  const [step, setStep] = useState<"columns" | "stocks">(saved ? "stocks" : "columns");
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [createList, setCreateList] = useState(false);
  const [listName, setListName] = useState(baseName(fileName));
  const [showMatched, setShowMatched] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const scales = useMemo(() => columnScales(sheet, mapping), [sheet, mapping]);
  const rows = useMemo(() => interpretRows(sheet, mapping, scales), [sheet, mapping, scales]);
  const matches = useMemo(() => matchRows(rows, known, mapping.suffix ?? ".ST"), [rows, known, mapping.suffix]);

  const hasId = mapping.columns.some((c) => c?.startsWith("id."));
  const figureCols = mapping.columns.filter((c) => c && !c.startsWith("id.")).length;
  const recognised = mapping.columns.filter(Boolean).length;

  /** Where a row ends up: the user's choice, the match, the guessed ticker when creating a list, or skipped. */
  const resolved = (m: RowMatch): string | undefined => {
    const c = choices[m.row.index];
    if (c !== undefined) return c || undefined;
    return m.symbol ?? (createList ? m.guess : undefined);
  };
  const toImport = matches.filter((m) => resolved(m) && Object.keys(m.row.values).length);
  const unmatched = matches.filter((m) => !m.symbol);
  const fuzzy = matches.filter((m) => m.how === "fuzzy");
  const exact = matches.filter((m) => m.how === "ticker" || m.how === "name");

  const setTarget = (i: number, t: ImportTarget | null) =>
    setMapping((m) => {
      const columns = m.columns.map((c, j) => (j === i ? t : c === t ? null : c)); // one column per target
      const scalesNext = { ...(m.scales ?? {}) };
      delete scalesNext[i]; // a new target gets a fresh guess
      return { ...m, columns, scales: scalesNext };
    });
  const setScale = (i: number, f: number) => setMapping((m) => ({ ...m, scales: { ...(m.scales ?? {}), [i]: f } }));

  const submit = () => {
    const seen = new Set<string>();
    const out: FigureImport["rows"] = [];
    for (const m of toImport) {
      const symbol = resolved(m)!.toUpperCase();
      if (seen.has(symbol)) continue; // the first row for a stock wins
      seen.add(symbol);
      out.push({ symbol, name: m.row.name, values: m.row.values });
    }
    // Only real overrides are saved, so the guess still adapts to the next file's values.
    const detected = columnScales(sheet, { ...mapping, scales: {} });
    const overrides = Object.fromEntries(Object.entries(mapping.scales ?? {}).filter(([i, f]) => detected[Number(i)] !== f));
    onImport({
      fileName,
      rows: out,
      hash,
      mapping: { headers: sheet.headers, columns: mapping.columns, suffix: mapping.suffix, ...(Object.keys(overrides).length ? { scales: overrides } : {}) },
      newList: createList ? listName.trim() || baseName(fileName) : undefined,
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal import-dialog" role="dialog" aria-modal="true" aria-label="Import key figures">
        <div className="modal-head">
          <div>
            <h2>Import key figures</h2>
            <div className="muted small">
              {fileName} · {sheet.rows.length} rows · {sheet.headers.length} columns
            </div>
          </div>
          <ol className="steps">
            <li className={step === "columns" ? "active" : ""}>
              <button className="link" onClick={() => setStep("columns")}>1 Columns</button>
            </li>
            <li className={step === "stocks" ? "active" : ""}>
              <button className="link" disabled={!hasId} onClick={() => setStep("stocks")}>2 Stocks</button>
            </li>
          </ol>
          <button className="icon" onClick={onClose} title="Close (Esc)">×</button>
        </div>

        <div className="modal-body">
          {step === "columns" ? (
            <>
              <p className="small">
                Recognised <strong>{recognised}</strong> of {sheet.headers.length} columns. Check what each column means and how
                its values are read; the preview shows the first {Math.min(PREVIEW_ROWS, sheet.rows.length)} rows after conversion.
                {saved && " This mapping was saved from an earlier import of the same columns."}
              </p>
              <div className="table-wrap">
                <table className="map-table">
                  <thead>
                    <tr>
                      <th className="left">File column</th>
                      <th className="left">Means</th>
                      <th className="left">Values are</th>
                      {sheet.rows.slice(0, PREVIEW_ROWS).map((_, r) => (
                        <th key={r}>Row {r + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.headers.map((h, i) => {
                      const t = mapping.columns[i] ?? null;
                      const isFigure = !!t && !t.startsWith("id.");
                      const choicesFor = scaleChoices(t);
                      return (
                        <tr key={i} className={t ? "" : "unmapped"}>
                          <td className="left">
                            <strong>{h}</strong>
                          </td>
                          <td className="left">
                            <select value={t ?? ""} onChange={(e) => setTarget(i, (e.target.value || null) as ImportTarget | null)} aria-label={`What ${h} means`}>
                              <option value="">— ignore —</option>
                              <optgroup label="Identifies the company">
                                {ID_TARGETS.map(([k, label]) => (
                                  <option key={k} value={k}>{label}</option>
                                ))}
                              </optgroup>
                              <optgroup label="Key figure">
                                {METRIC_OPTIONS.map((m) => (
                                  <option key={m.key} value={m.key}>{targetLabel(m.key as FundamentalKey)}</option>
                                ))}
                              </optgroup>
                            </select>
                          </td>
                          <td className="left">
                            {isFigure && choicesFor.length > 1 ? (
                              <select value={scales[i]} onChange={(e) => setScale(i, Number(e.target.value))} aria-label={`Scale of ${h}`}>
                                {choicesFor.map((c) => (
                                  <option key={c.factor} value={c.factor}>{c.label}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="muted small">{isFigure ? unitOf(t) : t ? "text" : ""}</span>
                            )}
                          </td>
                          {sheet.rows.slice(0, PREVIEW_ROWS).map((r, j) => (
                            <td key={j} title={r[i] == null ? "" : `In the file: ${String(r[i])}`} className={isFigure ? "" : "left"}>
                              {previewCell(t, r[i], scales[i])}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              {saved && (
                <p className="saved-note small">
                  Using the column mapping saved for this export ({figureCols} key figures).{" "}
                  <button className="link" onClick={() => setStep("columns")}>Change columns</button>
                </p>
              )}
              <div className="match-summary">
                <span className="pill pos">{exact.length} matched</span>
                {fuzzy.length > 0 && <span className="pill warn">{fuzzy.length} by similar name – check</span>}
                <span className={`pill ${unmatched.length ? "neg" : ""}`}>{unmatched.length} not in your lists</span>
                {mapping.columns.includes("id.ticker") && (
                  <label className="small">
                    Bare tickers are on{" "}
                    <select value={mapping.suffix ?? ".ST"} onChange={(e) => setMapping((m) => ({ ...m, suffix: e.target.value }))}>
                      {TICKER_SUFFIXES.map((s) => (
                        <option key={s.suffix} value={s.suffix}>{s.label}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <label className="create-list">
                <input type="checkbox" checked={createList} onChange={(e) => setCreateList(e.target.checked)} /> Also create a list with
                the imported stocks
                {createList && <input value={listName} maxLength={60} onChange={(e) => setListName(e.target.value)} aria-label="List name" />}
              </label>
              {createList && unmatched.some((m) => m.guess) && (
                <p className="muted small">Rows not in your lists are added by their ticker from the file (e.g. “VOLV B” → VOLV-B.ST). Pick another stock or skip any that look wrong.</p>
              )}

              {[...unmatched, ...fuzzy].length > 0 && (
                <MatchTable
                  title={unmatched.length ? "Check these rows" : "Matched by a similar name"}
                  matches={[...unmatched, ...fuzzy]}
                  resolved={resolved}
                  onChoice={(i, c) => setChoices((x) => ({ ...x, [i]: c }))}
                />
              )}
              {exact.length > 0 && (
                <p className="small">
                  <button className="link" onClick={() => setShowMatched((v) => !v)}>
                    {showMatched ? "▾" : "▸"} {exact.length} rows matched by ticker or exact name
                  </button>
                </p>
              )}
              {showMatched && (
                <MatchTable title="" matches={exact} resolved={resolved} onChoice={(i, c) => setChoices((x) => ({ ...x, [i]: c }))} />
              )}
            </>
          )}
        </div>

        <div className="modal-foot">
          <div className="foot-settings small">
            <label title="After this many days the API's figures win again over imported ones; imported figures still fill gaps the API leaves.">
              Imported figures win over the API for{" "}
              <select value={maxAgeDays} onChange={(e) => onMaxAge(Number(e.target.value))}>
                {MAX_AGE_CHOICES.map((d) => (
                  <option key={d} value={d}>{d} days</option>
                ))}
              </select>
            </label>
            {importedCount > 0 &&
              (confirmClear ? (
                <span>
                  Forget imported figures for {importedCount} stocks?{" "}
                  <button className="link danger-link" onClick={() => (onClearImported(), setConfirmClear(false))}>Forget</button>{" "}
                  <button className="link" onClick={() => setConfirmClear(false)}>Cancel</button>
                </span>
              ) : (
                <button className="link" onClick={() => setConfirmClear(true)}>
                  Forget all imported figures ({importedCount} stocks)
                </button>
              ))}
            <span className="muted">Saved only on this computer, never shared.</span>
          </div>
          <div className="foot-actions">
            <button onClick={onClose}>Cancel</button>
            {step === "columns" ? (
              <button className="primary" disabled={!hasId || !figureCols} onClick={() => setStep("stocks")} title={hasId ? "" : "Pick which column identifies the company (ticker, name or ISIN)"}>
                {hasId ? "Next: match stocks →" : "Pick an identifier column"}
              </button>
            ) : (
              <button className="primary" disabled={!toImport.length} onClick={submit}>
                Import {toImport.length} {toImport.length === 1 ? "stock" : "stocks"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A preview cell: the value in the app's units, or the text for identifier columns. */
function previewCell(t: ImportTarget | null, cell: Cell, scale: number) {
  if (!t) return <span className="muted">{cell == null ? "" : String(cell)}</span>;
  if (t.startsWith("id.")) return cell == null ? <span className="muted">–</span> : String(cell);
  const p = parseNumber(cell);
  if (!p) return <span className="muted">–</span>;
  return formatMetric(t as FundamentalKey, Number((p.value * scale).toPrecision(12)));
}

interface MatchTableProps {
  title: string;
  matches: RowMatch[];
  resolved: (m: RowMatch) => string | undefined;
  onChoice: (rowIndex: number, choice: Choice) => void;
}

const HOW: Record<string, string> = { ticker: "ticker", name: "name", fuzzy: "similar name" };

function MatchTable({ title, matches, resolved, onChoice }: MatchTableProps) {
  const [searching, setSearching] = useState<number | null>(null);
  return (
    <div className="match-block">
      {title && <h3>{title}</h3>}
      <table className="match-table">
        <thead>
          <tr>
            <th className="left">In the file</th>
            <th className="left">Found</th>
            <th className="left">Import as</th>
            <th>Figures</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => {
            const target = resolved(m);
            const id = [m.row.ticker, m.row.name, m.row.isin].filter(Boolean).join(" · ");
            const options = [...new Set([m.symbol, m.guess, target].filter((x): x is string => !!x))];
            return (
              <tr key={m.row.index} className={target ? "" : "skipped"}>
                <td className="left">{id}</td>
                <td className="left muted small">
                  {m.symbol ? `${m.symbol} by ${HOW[m.how!]}${m.similarity ? ` (${Math.round(m.similarity * 100)} %)` : ""}` : "not in your lists"}
                </td>
                <td className="left">
                  {searching === m.row.index ? (
                    <StockSearch
                      initial={m.row.isin ?? m.row.name ?? m.row.ticker ?? ""}
                      onPick={(sym) => (onChoice(m.row.index, sym), setSearching(null))}
                      onCancel={() => setSearching(null)}
                    />
                  ) : (
                    <span className="choice">
                      <select value={target ?? ""} onChange={(e) => onChoice(m.row.index, e.target.value)} aria-label={`Import ${id} as`}>
                        <option value="">Skip</option>
                        {options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                            {o === m.guess && o !== m.symbol ? " (new, from the file's ticker)" : ""}
                          </option>
                        ))}
                      </select>
                      <button className="link" onClick={() => setSearching(m.row.index)}>Search…</button>
                    </span>
                  )}
                </td>
                <td>{Object.keys(m.row.values).length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Inline ticker search for a row that didn't match (searches by ISIN or name). */
function StockSearch({ initial, onPick, onCancel }: { initial: string; onPick: (symbol: string) => void; onCancel: () => void }) {
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<SearchResult[] | null>(null);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setHits([]);
    setHits(null);
    const t = setTimeout(() => api.search(term).then(setHits).catch(() => setHits([])), 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="stock-search">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.stopPropagation(), onCancel();
          if (e.key === "Enter" && q.trim()) onPick(hits?.[0]?.symbol ?? q.trim());
        }}
        placeholder="Name, ISIN or ticker"
      />
      <ul className="hits static">
        {hits == null && <li className="muted">Searching…</li>}
        {hits?.slice(0, 6).map((h) => (
          <li key={h.symbol} onClick={() => onPick(h.symbol)}>
            <strong>{h.symbol}</strong> {h.name} <span className="muted">{h.exchange}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
