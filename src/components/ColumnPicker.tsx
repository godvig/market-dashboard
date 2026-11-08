import { useEffect, useRef, useState } from "react";
import { COLUMNS, DEFAULT_COLUMNS, type ColumnDef } from "../columns";

interface Props {
  value?: string[];
  onChange: (ids: string[] | undefined) => void;
}

/** Dropdown with checkboxes: standard columns, a divider, then extra key figures. */
export function ColumnPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = new Set(value ?? DEFAULT_COLUMNS);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(COLUMNS.filter((c) => next.has(c.id)).map((c) => c.id));
  };

  const setTier = (tier: ColumnDef["tier"], on: boolean) => {
    const next = new Set(selected);
    for (const c of COLUMNS) if (c.tier === tier) on ? next.add(c.id) : next.delete(c.id);
    onChange(COLUMNS.filter((c) => next.has(c.id)).map((c) => c.id));
  };

  const renderTier = (tier: ColumnDef["tier"], title: string) => {
    const cols = COLUMNS.filter((c) => c.tier === tier);
    const sections = [...new Set(cols.map((c) => c.section))];
    return (
      <div className="picker-tier">
        <div className="picker-head">
          <strong>{title}</strong>
          <span>
            <button className="link" onClick={() => setTier(tier, true)}>
              All
            </button>{" "}
            ·{" "}
            <button className="link" onClick={() => setTier(tier, false)}>
              None
            </button>
          </span>
        </div>
        {sections.map((s) => (
          <fieldset key={s}>
            <legend>{s}</legend>
            {cols
              .filter((c) => c.section === s)
              .map((c) => (
                <label key={c.id} title={c.title}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /> {c.label}
                </label>
              ))}
          </fieldset>
        ))}
      </div>
    );
  };

  const count = COLUMNS.filter((c) => selected.has(c.id)).length;

  return (
    <div className="picker" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Columns ({count}) ▾
      </button>
      {open && (
        <div className="picker-menu" role="dialog" aria-label="Choose columns">
          {renderTier("standard", "Standard")}
          <hr />
          {renderTier("extra", "More key figures")}
          <div className="picker-foot">
            <button className="link" onClick={() => onChange(undefined)}>
              Reset to default
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
