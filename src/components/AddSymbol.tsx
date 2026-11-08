import { useEffect, useState } from "react";
import type { SearchResult } from "../../shared/types";
import { api } from "../api";

/** Search box with autocomplete; Enter adds the typed symbol as-is. */
export function AddSymbol({ onAdd }: { onAdd: (symbol: string) => void }) {
  const [text, setText] = useState("");
  const [hits, setHits] = useState<SearchResult[]>([]);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) return setHits([]);
    const t = setTimeout(() => api.search(q).then(setHits).catch(() => setHits([])), 300);
    return () => clearTimeout(t);
  }, [text]);

  const add = (s: string) => {
    onAdd(s);
    setText("");
    setHits([]);
  };

  return (
    <div className="add">
      <input
        placeholder="Add ticker or search (e.g. SAND.ST, Tesla)…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && text.trim() && add(text)}
      />
      {hits.length > 0 && (
        <ul className="hits">
          {hits.map((h) => (
            <li key={h.symbol} onClick={() => add(h.symbol)}>
              <strong>{h.symbol}</strong> {h.name} <span className="muted">{h.exchange}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
