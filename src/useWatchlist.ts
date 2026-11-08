import { useCallback, useEffect, useRef, useState } from "react";
import type { Watchlist } from "../shared/types";
import { api } from "./api";

const LEGACY_KEY = "market-dashboard.watchlist"; // single list from v0.1
const BACKUP_KEY = "market-dashboard.lists";
const ACTIVE_KEY = "market-dashboard.activeList";

export const DEFAULT_WATCHLIST = ["VOLV-B.ST", "ERIC-B.ST", "INVE-B.ST", "ASML.AS", "AAPL", "MSFT", "NVDA", "SPY"];

const newId = () => Math.random().toString(36).slice(2, 10);

const storage = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  },
};

/** First run: carry over the old single list, else start with the defaults. */
function initialLists(): Watchlist[] {
  const backup = storage.get<Watchlist[]>(BACKUP_KEY);
  if (Array.isArray(backup) && backup.length) return backup;
  const legacy = storage.get<string[]>(LEGACY_KEY);
  const symbols = Array.isArray(legacy) && legacy.length ? legacy : DEFAULT_WATCHLIST;
  return [{ id: newId(), name: "My watchlist", symbols }];
}

/**
 * Named watchlists. Saved on the server (data/watchlists.json) so they
 * survive browser resets; localStorage keeps a backup copy.
 */
export function useWatchlists() {
  const [lists, setLists] = useState<Watchlist[]>([]);
  const [activeId, setActiveId] = useState<string>(() => storage.get<string>(ACTIVE_KEY) ?? "");
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    api
      .getLists()
      .then((server) => {
        if (server?.length) return server;
        const first = initialLists();
        api.saveLists(first).catch(() => undefined);
        return first;
      })
      .catch(() => initialLists()) // server down: work from the local backup
      .then((loaded) => {
        setLists(loaded);
        setActiveId((id) => (loaded.some((l) => l.id === id) ? id : loaded[0].id));
        setReady(true);
      });
  }, []);

  const commit = useCallback((next: Watchlist[]) => {
    setLists(next);
    storage.set(BACKUP_KEY, next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api
        .saveLists(next)
        .then(() => setSaveError(undefined))
        .catch((e: Error) => setSaveError(e.message));
    }, 300);
  }, []);

  const select = useCallback((id: string) => {
    setActiveId(id);
    storage.set(ACTIVE_KEY, id);
  }, []);

  const active = lists.find((l) => l.id === activeId) ?? lists[0];

  const update = (id: string, fn: (l: Watchlist) => Watchlist) => commit(lists.map((l) => (l.id === id ? fn(l) : l)));

  return {
    ready,
    lists,
    active,
    saveError,
    select,

    addSymbol(s: string) {
      const sym = s.trim().toUpperCase();
      if (active && sym && !active.symbols.includes(sym)) update(active.id, (l) => ({ ...l, symbols: [...l.symbols, sym] }));
    },
    removeSymbol(s: string) {
      if (active) update(active.id, (l) => ({ ...l, symbols: l.symbols.filter((x) => x !== s) }));
    },

    createList(name: string, symbols: string[] = []) {
      const list = { id: newId(), name: name.trim() || "New list", symbols };
      commit([...lists, list]);
      select(list.id);
      return list.id;
    },
    renameList(id: string, name: string) {
      if (name.trim()) update(id, (l) => ({ ...l, name: name.trim().slice(0, 60) }));
    },
    deleteList(id: string) {
      if (lists.length <= 1) return; // always keep one list
      const next = lists.filter((l) => l.id !== id);
      commit(next);
      if (id === active?.id) select(next[0].id);
    },
    duplicateList(id: string) {
      const src = lists.find((l) => l.id === id);
      if (src) this.createList(`${src.name} (copy)`, [...src.symbols]);
    },

    /** Replaces or appends lists from an exported JSON file. */
    importLists(imported: Watchlist[]) {
      const fresh = imported.map((l) => ({ ...l, id: newId() }));
      commit([...lists, ...fresh]);
      if (fresh[0]) select(fresh[0].id);
    },
  };
}
