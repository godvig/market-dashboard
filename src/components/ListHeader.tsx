import { useRef, useState } from "react";
import type { ListGroup, Watchlist } from "../../shared/types";
import { isImportBundle, type ImportBundle } from "../useStore";

interface Props {
  list: Watchlist;
  group?: ListGroup;
  canDelete: boolean;
  allLists: Watchlist[];
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onImport: (lists: Watchlist[]) => void;
  onImportBundle: (bundle: ImportBundle) => void;
}

/** Title and actions for the open watchlist. */
export function ListHeader({ list, group, canDelete, allLists, onRename, onDuplicate, onDelete, onImport, onImportBundle }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [importError, setImportError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  const finish = () => {
    onRename(draft);
    setEditing(false);
  };

  const exportLists = () => {
    const blob = new Blob([JSON.stringify(allLists, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `watchlists-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (isImportBundle(data)) {
        onImportBundle(data);
        setImportError(undefined);
        return;
      }
      const arr = Array.isArray(data) ? data : Array.isArray(data?.lists) ? data.lists : [data];
      const valid = arr.filter((l: Watchlist) => l && typeof l.name === "string" && Array.isArray(l.symbols));
      if (!valid.length) throw new Error("No watchlists found in the file");
      onImport(valid.map((l: Watchlist) => ({ id: "", name: String(l.name), symbols: l.symbols.map(String) })));
      setImportError(undefined);
    } catch (e) {
      setImportError((e as Error).message);
    }
  };

  return (
    <div className="list-header">
      <div className="crumbs">
        {group && <span className="muted">{group.name} › </span>}
        {editing ? (
          <input
            className="title-edit"
            autoFocus
            value={draft}
            maxLength={60}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={finish}
            onKeyDown={(e) => {
              if (e.key === "Enter") finish();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <h2 onDoubleClick={() => (setDraft(list.name), setEditing(true))} title="Double-click to rename">
            {list.name}
          </h2>
        )}
      </div>
      <div className="list-actions">
        {confirm ? (
          <>
            <span>Delete “{list.name}”?</span>
            <button
              className="danger"
              onClick={() => {
                onDelete();
                setConfirm(false);
              }}
            >
              Delete
            </button>
            <button onClick={() => setConfirm(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button onClick={() => (setDraft(list.name), setEditing(true))}>Rename</button>
            <button onClick={onDuplicate}>Duplicate</button>
            <button onClick={() => setConfirm(true)} disabled={!canDelete} title={canDelete ? "Delete this list" : "You need at least one list"}>
              Delete
            </button>
            <span className="sep" />
            <button onClick={exportLists} title="Download all lists as a JSON file">
              Export
            </button>
            <button onClick={() => fileInput.current?.click()} title="Add lists from an exported JSON file or an import file (e.g. from your spreadsheet)">
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
    </div>
  );
}
