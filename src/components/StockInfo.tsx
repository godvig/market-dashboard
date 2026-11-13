import { useEffect, useState } from "react";
import { MANUAL_LEVELS, METRIC_BY_KEY, type ManualKey } from "../../shared/metrics";
import type { StockMeta } from "../../shared/types";
import { HorseIcon, KNOWN_TYPES } from "./HorseIcon";

interface Props {
  symbol: string;
  meta?: StockMeta;
  /** Investment types already used on other stocks, offered in the list next to the built-in ones. */
  usedTypes?: string[];
  onChange: (patch: Partial<StockMeta>) => void;
  onAssess: (key: string, value: number | null) => void;
}

/** Your own info about a stock: classification, note and assessments. Saved locally only. */
export function StockInfo({ symbol, meta, usedTypes = [], onChange, onAssess }: Props) {
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
        <label className="info-field">
          <span>
            Investeringstyp <HorseIcon type={meta?.investmentType} size={14} />
          </span>
          <TypePicker
            key={`${symbol}-type`}
            value={meta?.investmentType ?? ""}
            usedTypes={usedTypes}
            onChange={(investmentType) => onChange({ investmentType })}
          />
        </label>
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

const CUSTOM = "\u0000custom";

/** A dropdown of the known investment types and the ones you have used, plus "Own type…" to type a new one. */
function TypePicker({ value, usedTypes, onChange }: { value: string; usedTypes: string[]; onChange: (v: string) => void }) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const known = new Set(KNOWN_TYPES.map((t) => t.toLowerCase()));
  const own = [...new Set([...usedTypes, value].map((t) => t.trim()).filter((t) => t && !known.has(t.toLowerCase())))].sort((a, b) =>
    a.localeCompare(b, "sv"),
  );

  const save = () => {
    const v = draft.trim();
    if (v && v !== value) onChange(v);
    setTyping(false);
  };

  if (typing)
    return (
      <span className="type-custom">
        <input
          autoFocus
          value={draft}
          maxLength={40}
          placeholder="Egen typ, t.ex. Dark horse"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setTyping(false);
          }}
        />
      </span>
    );

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === CUSTOM) {
          setDraft("");
          setTyping(true);
        } else onChange(e.target.value);
      }}
    >
      <option value="">– Ingen –</option>
      <optgroup label="Hästar">
        {KNOWN_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </optgroup>
      {own.length > 0 && (
        <optgroup label="Egna">
          {own.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </optgroup>
      )}
      <option value={CUSTOM}>Egen typ…</option>
    </select>
  );
}
