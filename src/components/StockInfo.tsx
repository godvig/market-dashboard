import { useEffect, useState } from "react";
import { MANUAL_LEVELS, METRIC_BY_KEY, type ManualKey } from "../../shared/metrics";
import type { StockMeta } from "../../shared/types";

interface Props {
  symbol: string;
  meta?: StockMeta;
  onChange: (patch: Partial<StockMeta>) => void;
  onAssess: (key: string, value: number | null) => void;
}

/** Your own info about a stock: classification, note and assessments. Saved locally only. */
export function StockInfo({ symbol, meta, onChange, onAssess }: Props) {
  const [note, setNote] = useState(meta?.note ?? "");
  useEffect(() => setNote(meta?.note ?? ""), [symbol, meta?.note]);

  const field = (key: "sector" | "niche" | "country", label: string) => (
    <label className="info-field">
      <span>{label}</span>
      <input
        key={`${symbol}-${key}`}
        defaultValue={meta?.[key] ?? ""}
        placeholder="–"
        onBlur={(e) => e.target.value !== (meta?.[key] ?? "") && onChange({ [key]: e.target.value.trim() })}
      />
    </label>
  );

  return (
    <div className="stock-info">
      <div className="info-row">
        {field("sector", "Industri/Sektor")}
        {field("niche", "Nisch/Bransch")}
        {field("country", "Land")}
      </div>
      <label className="info-field note">
        <span>Anteckningar</span>
        <textarea
          value={note}
          placeholder="Dina tankar om bolaget…"
          rows={4}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (meta?.note ?? "") && onChange({ note })}
        />
      </label>
      <div className="assessments">
        {(Object.keys(MANUAL_LEVELS) as ManualKey[]).map((k) => {
          const def = METRIC_BY_KEY.get(`manual.${k}`);
          const v = meta?.assessments?.[k];
          return (
            <label key={k} className="info-field" title={def?.description}>
              <span>{def?.sv ?? k}</span>
              <select value={v ?? ""} onChange={(e) => onAssess(k, e.target.value === "" ? null : Number(e.target.value))}>
                <option value="">Ej bedömd</option>
                {MANUAL_LEVELS[k].map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <p className="muted small">Sparas bara lokalt på din dator (data/store.json).</p>
    </div>
  );
}
