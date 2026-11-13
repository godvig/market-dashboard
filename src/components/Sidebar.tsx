import { useState, type DragEvent } from "react";
import type { ListGroup, UserStore, Watchlist } from "../../shared/types";
import type { StoreApi } from "../useStore";

interface Props {
  store: UserStore;
  api: StoreApi;
  activeListId?: string;
  onOpenList: (id: string) => void;
  scorecardsOpen?: boolean;
  onOpenScorecards: () => void;
}

type Drag = { kind: "list" | "group"; id: string } | null;
type DropTarget = { kind: "beforeList" | "intoGroup" | "beforeGroup"; id: string } | null;

const UNCATEGORISED = "__none__";

/**
 * Left sidebar: categories with their watchlists. Drag a list onto another
 * list (to place it before) or onto a category (to put it last in it);
 * drag a category header to reorder categories. Double-click to rename.
 */
export function Sidebar({ store, api, activeListId, onOpenList, scorecardsOpen, onOpenScorecards }: Props) {
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<DropTarget>(null);
  const [editing, setEditing] = useState<{ kind: "list" | "group"; id: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmGroup, setConfirmGroup] = useState<string>();

  const startEdit = (kind: "list" | "group", id: string, name: string) => {
    setEditing({ kind, id });
    setDraft(name);
  };
  const finishEdit = () => {
    if (!editing) return;
    if (editing.kind === "list") api.renameList(editing.id, draft);
    else api.renameGroup(editing.id, draft);
    setEditing(null);
  };

  const listsIn = (groupId?: string) => store.lists.filter((l) => l.groupId === groupId);

  // ---- drag & drop ----
  const onDragStart = (e: DragEvent, d: NonNullable<Drag>) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", d.id); // Firefox needs some data
    setDrag(d);
  };
  const onDragEnd = () => {
    setDrag(null);
    setOver(null);
  };
  const allow = (e: DragEvent, target: NonNullable<DropTarget>) => {
    if (!drag) return;
    // lists can go before lists or into categories; categories only before categories
    const ok = drag.kind === "list" ? target.kind !== "beforeGroup" : target.kind === "beforeGroup";
    if (!ok) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (over?.kind !== target.kind || over.id !== target.id) setOver(target);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (drag && over) {
      if (drag.kind === "list") {
        if (over.kind === "beforeList") {
          const target = store.lists.find((l) => l.id === over.id);
          api.moveList(drag.id, target?.groupId, over.id);
        } else if (over.kind === "intoGroup") {
          api.moveList(drag.id, over.id === UNCATEGORISED ? undefined : over.id);
        }
      } else if (over.kind === "beforeGroup") {
        api.moveGroup(drag.id, over.id === UNCATEGORISED ? undefined : over.id);
      }
    }
    onDragEnd();
  };

  const isOver = (kind: NonNullable<DropTarget>["kind"], id: string) => over?.kind === kind && over.id === id;

  // ---- rendering ----
  const renderList = (l: Watchlist) =>
    editing?.kind === "list" && editing.id === l.id ? (
      <li key={l.id}>
        <input
          className="side-edit"
          autoFocus
          value={draft}
          maxLength={60}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={finishEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") finishEdit();
            if (e.key === "Escape") setEditing(null);
          }}
        />
      </li>
    ) : (
      <li
        key={l.id}
        draggable
        onDragStart={(e) => onDragStart(e, { kind: "list", id: l.id })}
        onDragEnd={onDragEnd}
        onDragOver={(e) => allow(e, { kind: "beforeList", id: l.id })}
        onDrop={onDrop}
        className={[
          "side-list",
          l.id === activeListId ? "active" : "",
          isOver("beforeList", l.id) ? "drop-before" : "",
          drag?.kind === "list" && drag.id === l.id ? "dragging" : "",
        ].join(" ")}
        onClick={() => onOpenList(l.id)}
        onDoubleClick={() => startEdit("list", l.id, l.name)}
        title="Click to open · double-click to rename · drag to move"
        data-list-id={l.id}
      >
        <span className="grip" aria-hidden>
          ⋮⋮
        </span>
        <span className="side-name">{l.name}</span>
        <span className="count">{l.symbols.length}</span>
      </li>
    );

  const renderGroup = (g: ListGroup | null) => {
    const id = g?.id ?? UNCATEGORISED;
    const lists = listsIn(g?.id);
    const collapsed = !!g?.collapsed;
    return (
      <section
        key={id}
        className={["side-group", isOver("intoGroup", id) ? "drop-into" : "", isOver("beforeGroup", id) ? "drop-before" : ""].join(" ")}
        onDragOver={(e) => (drag?.kind === "group" ? allow(e, { kind: "beforeGroup", id }) : allow(e, { kind: "intoGroup", id }))}
        onDrop={onDrop}
        data-group-id={id}
      >
        <header
          draggable={!!g}
          onDragStart={g ? (e) => onDragStart(e, { kind: "group", id: g.id }) : undefined}
          onDragEnd={onDragEnd}
          className="side-group-head"
        >
          {g ? (
            <button className="icon caret" onClick={() => api.toggleGroup(g.id)} title={collapsed ? "Expand" : "Collapse"}>
              {collapsed ? "▸" : "▾"}
            </button>
          ) : (
            <span className="caret-space" />
          )}
          {g && editing?.kind === "group" && editing.id === g.id ? (
            <input
              className="side-edit"
              autoFocus
              value={draft}
              maxLength={60}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={finishEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") finishEdit();
                if (e.key === "Escape") setEditing(null);
              }}
            />
          ) : (
            <span className="group-name" onDoubleClick={() => g && startEdit("group", g.id, g.name)} title={g ? "Double-click to rename · drag to reorder" : undefined}>
              {g ? g.name : "Uncategorised"}
            </span>
          )}
          <span className="count">{lists.length}</span>
          {g && (
            <span className="group-actions">
              <button className="icon" title="Rename category" onClick={() => startEdit("group", g.id, g.name)}>
                ✎
              </button>
              <button className="icon" title="Delete category (its lists are kept)" onClick={() => setConfirmGroup(g.id)}>
                ×
              </button>
            </span>
          )}
        </header>
        {g && confirmGroup === g.id && (
          <div className="side-confirm">
            Delete “{g.name}”? Its lists move to Uncategorised.
            <div>
              <button
                className="danger"
                onClick={() => {
                  api.deleteGroup(g.id);
                  setConfirmGroup(undefined);
                }}
              >
                Delete
              </button>
              <button onClick={() => setConfirmGroup(undefined)}>Cancel</button>
            </div>
          </div>
        )}
        {!collapsed && (
          <ul>
            {lists.map(renderList)}
            {lists.length === 0 && <li className="side-empty">{drag?.kind === "list" ? "Drop here" : "No lists"}</li>}
          </ul>
        )}
      </section>
    );
  };

  return (
    <aside className="sidebar">
      <div className="side-title">Watchlists</div>
      <nav>
        {store.groups.map(renderGroup)}
        {renderGroup(null)}
      </nav>
      <button className={`side-link${scorecardsOpen ? " active" : ""}`} onClick={onOpenScorecards}>
        Scorecards
        <small>build and tune your own</small>
      </button>
      <div className="side-actions">
        <button
          onClick={() => {
            const id = api.createList(`List ${store.lists.length + 1}`);
            onOpenList(id);
            startEdit("list", id, `List ${store.lists.length + 1}`);
          }}
        >
          + New list
        </button>
        <button
          onClick={() => {
            const id = api.createGroup("New category");
            startEdit("group", id, "New category");
          }}
        >
          + New category
        </button>
      </div>
    </aside>
  );
}
