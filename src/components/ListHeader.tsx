import { useRef, useState } from "react";
import { decodeText, readTable } from "../../shared/importFile";
import type { Cell } from "../../shared/importParse";
import type { ListGroup, Watchlist } from "../../shared/types";
import { IS_DEMO } from "../api";
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
  /** A CSV/XLSX table of key figures, for the import dialog. */
  onImportTable: (fileName: string, table: Cell[][]) => void;
}

/** Title and actions for the open watchlist. */
export function ListHeader({ list, group, canDelete, allLists, onRename, onDuplicate, onDelete, onImport, onImportBundle, onImportTable }: Props) {
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

  /** JSON = lists or an import bundle; anything else is a table of key figures (CSV, XLSX…), told apart by content. */
  const importFile = async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { kind, table } = await readTable(bytes, file.name);
      const looksJson = kind === "csv" && /^\s*[[{]/.test(decodeText(bytes.slice(0, 64)));
      if (!looksJson) {
        if (table.length < 2) throw new Error("The file has no rows to import");
        onImportTable(file.name, table);
        setImportError(undefined);
        return;
      }
      const data = JSON.parse(decodeText(bytes));
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
            <button
              onClick={() => fileInput.current?.click()}
              title="Lists from an exported JSON file, or key figures from a CSV/Excel file (e.g. a Börsdata screener export)"
            >
              Import
            </button>
            {IS_DEMO && (
              <button
                onClick={async () => {
                  const { default: csv } = await import("../../docs/examples/borsdata-screener-sample.csv?raw");
                  onImportTable("borsdata-screener-sample.csv", (await readTable(new TextEncoder().encode(csv), "sample.csv")).table);
                }}
                title="Open the import dialog with a made-up screener export (docs/examples/borsdata-screener-sample.csv)"
              >
                Try sample import
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json,.csv,text/csv,.txt,.xlsx,.xls,.ods"
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
