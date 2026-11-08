import { useRef, useState } from "react";
import type { Watchlist } from "../../shared/types";

interface Props {
  lists: Watchlist[];
  activeId?: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => string;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onImport: (lists: Watchlist[]) => void;
}

/** Tabs for named watchlists: switch, create, rename, duplicate, delete, export/import. */
export function ListTabs({ lists, activeId, onSelect, onCreate, onRename, onDelete, onDuplicate, onImport }: Props) {
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [importError, setImportError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  const startRename = (l: Watchlist) => {
    setEditing(l.id);
    setDraft(l.name);
    setConfirmDelete(undefined);
  };
  const finishRename = () => {
    if (editing) onRename(editing, draft);
    setEditing(undefined);
  };

  const create = () => {
    const id = onCreate(`List ${lists.length + 1}`);
    setEditing(id);
    setDraft(`List ${lists.length + 1}`);
  };

  const exportLists = () => {
    const blob = new Blob([JSON.stringify(lists, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `watchlists-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const arr = Array.isArray(data) ? data : [data];
      const valid = arr.filter((l) => l && typeof l.name === "string" && Array.isArray(l.symbols));
      if (!valid.length) throw new Error("No watchlists found in the file");
      onImport(valid.map((l) => ({ id: "", name: String(l.name), symbols: l.symbols.map(String) })));
      setImportError(undefined);
    } catch (e) {
      setImportError((e as Error).message);
    }
  };

  const active = lists.find((l) => l.id === activeId);

  return (
    <div className="lists">
      <div className="tabs" role="tablist">
        {lists.map((l) =>
          editing === l.id ? (
            <input
              key={l.id}
              className="tab-edit"
              autoFocus
              value={draft}
              maxLength={60}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={finishRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") finishRename();
                if (e.key === "Escape") setEditing(undefined);
              }}
            />
          ) : (
            <button
              key={l.id}
              role="tab"
              aria-selected={l.id === activeId}
              className={`tab ${l.id === activeId ? "active" : ""}`}
              onClick={() => onSelect(l.id)}
              onDoubleClick={() => startRename(l)}
              title="Double-click to rename"
            >
              {l.name} <span className="count">{l.symbols.length}</span>
            </button>
          ),
        )}
        <button className="tab add-tab" onClick={create} title="New list">
          + New list
        </button>
      </div>

      {active && (
        <div className="list-actions">
          {confirmDelete === active.id ? (
            <>
              <span>Delete “{active.name}”?</span>
              <button
                className="danger"
                onClick={() => {
                  onDelete(active.id);
                  setConfirmDelete(undefined);
                }}
              >
                Delete
              </button>
              <button onClick={() => setConfirmDelete(undefined)}>Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => startRename(active)}>Rename</button>
              <button onClick={() => onDuplicate(active.id)}>Duplicate</button>
              <button
                onClick={() => setConfirmDelete(active.id)}
                disabled={lists.length <= 1}
                title={lists.length <= 1 ? "You need at least one list" : "Delete this list"}
              >
                Delete
              </button>
              <span className="sep" />
              <button onClick={exportLists} title="Download all lists as a JSON file">
                Export
              </button>
              <button onClick={() => fileInput.current?.click()} title="Add lists from an exported JSON file">
                Import
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importFile(f);
                  e.target.value = "";
                }}
              />
            </>
          )}
          {importError && <span className="neg">{importError}</span>}
        </div>
      )}
    </div>
  );
}
