import { useEffect, useState } from "react";
import type { SearchResult } from "../../shared/types";
import { api } from "../api";

interface Props {
  symbol: string;
  /** Company name to search for (from your info), falls back to the ticker. */
  name?: string;
  country?: string;
  onPick: (symbol: string) => void;
  onClose: () => void;
}

/** Search for the right ticker for a row that didn't load, and swap it in everywhere. */
export function FixTicker({ symbol, name, country, onPick, onClose }: Props) {
  const [q, setQ] = useState(name ?? symbol.replace(/\.[A-Z]+$/, ""));
  const [hits, setHits] = useState<SearchResult[] | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setHits([]);
    setHits(null);
    const t = setTimeout(() => api.search(term).then(setHits).catch(() => setHits([])), 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="card fix-ticker">
      <div className="fix-head">
        <strong>
          Hitta rätt ticker för {symbol}
          {name ? ` (${name}${country ? `, ${country}` : ""})` : ""}
        </strong>
        <button className="icon" onClick={onClose} title="Stäng">
          ×
        </button>
      </div>
      <p className="muted small">Välj en träff så byts tickern ut i alla listor. Dina anteckningar följer med.</p>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök bolagsnamn eller ticker…" />
      <ul className="hits static">
        {hits == null && <li className="muted">Söker…</li>}
        {hits?.length === 0 && <li className="muted">Inga träffar – prova ett kortare namn.</li>}
        {hits?.map((h) => (
          <li key={h.symbol} onClick={() => onPick(h.symbol)}>
            <strong>{h.symbol}</strong> {h.name} <span className="muted">{h.exchange}</span>
          </li>
        ))}
      </ul>
      <div className="fix-manual">
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="…eller skriv in tickern, t.ex. PEAB-B.ST" />
        <button disabled={!manual.trim()} onClick={() => onPick(manual)}>
          Byt
        </button>
      </div>
    </div>
  );
}
