import { useCallback, useEffect, useRef, useState } from "react";
import type { ListGroup, StockMeta, UserStore, Watchlist } from "../shared/types";
import { normaliseInvestmentType } from "../shared/investmentTypes";
import { api } from "./api";

const BACKUP_KEY = "market-dashboard.store";
const OLD_KEYS = ["market-dashboard.lists", "market-dashboard.watchlist"]; // v0.2 / v0.1

export const DEFAULT_WATCHLIST = ["VOLV-B.ST", "ERIC-B.ST", "INVE-B.ST", "ASML.AS", "AAPL", "MSFT", "NVDA", "SPY"];

export const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * File format for importing lists with categories and per-stock info
 * (e.g. generated from a spreadsheet). Groups and lists are matched by name.
 */
export interface ImportBundle {
  format: "market-dashboard-import";
  version: 1;
  lists: { name: string; group?: string; symbols: string[] }[];
  stocks?: Record<string, StockMeta>;
}

export const isImportBundle = (x: unknown): x is ImportBundle =>
  !!x && typeof x === "object" && (x as ImportBundle).format === "market-dashboard-import" && Array.isArray((x as ImportBundle).lists);

function readLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** First run: carry over anything saved by older versions, else defaults. */
function initialStore(): UserStore {
  const backup = readLocal<UserStore>(BACKUP_KEY);
  if (backup?.lists?.length) return backup;
  const v2 = readLocal<Watchlist[]>(OLD_KEYS[0]);
  if (Array.isArray(v2) && v2.length) return { version: 2, groups: [], lists: v2 };
  const v1 = readLocal<string[]>(OLD_KEYS[1]);
  const symbols = Array.isArray(v1) && v1.length ? v1 : DEFAULT_WATCHLIST;
  return { version: 2, groups: [], lists: [{ id: newId(), name: "My watchlist", symbols }] };
}

/**
 * Categories, watchlists (in sidebar order) and column choices. Saved on
 * the server (data/store.json) with a backup copy in localStorage.
 */
export function useStore() {
  const [store, setStore] = useState<UserStore | null>(null);
  const [saveError, setSaveError] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef<UserStore | null>(null);

  useEffect(() => {
    api
      .getStore()
      .then((s) => {
        if (s?.lists?.length) return s;
        const first = initialStore();
        api.saveStore(first).catch(() => undefined);
        return first;
      })
      .catch(() => initialStore()) // server down: work from the local backup
      .then((s) => {
        latest.current = s;
        setStore(s);
      });
  }, []);

  /** Applies a change, saves locally right away and to the server shortly after. */
  const update = useCallback((fn: (s: UserStore) => UserStore) => {
    const cur = latest.current;
    if (!cur) return;
    const next = fn(cur);
    latest.current = next;
    setStore(next);
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api
        .saveStore(latest.current!)
        .then(() => setSaveError(undefined))
        .catch((e: Error) => setSaveError(e.message));
    }, 300);
  }, []);

  const mapList = (id: string, fn: (l: Watchlist) => Watchlist) =>
    update((s) => ({ ...s, lists: s.lists.map((l) => (l.id === id ? fn(l) : l)) }));
  const mapGroup = (id: string, fn: (g: ListGroup) => ListGroup) =>
    update((s) => ({ ...s, groups: s.groups.map((g) => (g.id === id ? fn(g) : g)) }));

  return {
    store,
    saveError,

    // --- lists ---
    createList(name: string, groupId?: string, symbols: string[] = []): string {
      const list: Watchlist = { id: newId(), name: name.trim() || "New list", symbols, ...(groupId ? { groupId } : {}) };
      update((s) => ({ ...s, lists: [...s.lists, list] }));
      return list.id;
    },
    renameList: (id: string, name: string) => name.trim() && mapList(id, (l) => ({ ...l, name: name.trim().slice(0, 60) })),
    deleteList: (id: string) => update((s) => (s.lists.length <= 1 ? s : { ...s, lists: s.lists.filter((l) => l.id !== id) })),
    duplicateList(id: string): string | undefined {
      const src = latest.current?.lists.find((l) => l.id === id);
      if (!src) return undefined;
      const copy: Watchlist = { ...src, id: newId(), name: `${src.name} (copy)`, symbols: [...src.symbols] };
      update((s) => {
        const i = s.lists.findIndex((l) => l.id === id);
        const lists = [...s.lists];
        lists.splice(i + 1, 0, copy);
        return { ...s, lists };
      });
      return copy.id;
    },
    addSymbol: (id: string, symbol: string) => {
      const sym = symbol.trim().toUpperCase();
      if (sym) mapList(id, (l) => (l.symbols.includes(sym) ? l : { ...l, symbols: [...l.symbols, sym] }));
    },
    removeSymbol: (id: string, symbol: string) => mapList(id, (l) => ({ ...l, symbols: l.symbols.filter((x) => x !== symbol) })),
    importLists(lists: Watchlist[]): string | undefined {
      const fresh = lists.map((l) => ({ id: newId(), name: l.name, symbols: l.symbols }));
      update((s) => ({ ...s, lists: [...s.lists, ...fresh] }));
      return fresh[0]?.id;
    },

    /**
     * Moves a list into a category (undefined = uncategorised), placed
     * before `beforeId` or last in that category.
     */
    moveList(id: string, groupId: string | undefined, beforeId?: string) {
      if (id === beforeId) return;
      update((s) => {
        const moving = s.lists.find((l) => l.id === id);
        if (!moving) return s;
        const rest = s.lists.filter((l) => l.id !== id);
        const placed: Watchlist = { ...moving };
        if (groupId) placed.groupId = groupId;
        else delete placed.groupId;
        let at = beforeId ? rest.findIndex((l) => l.id === beforeId) : -1;
        if (at < 0) {
          // after the last list of the target category, or at the end
          const lastInGroup = rest.map((l) => l.groupId).lastIndexOf(groupId);
          at = lastInGroup >= 0 ? lastInGroup + 1 : rest.length;
        }
        rest.splice(at, 0, placed);
        return { ...s, lists: rest };
      });
    },

    // --- categories ---
    createGroup(name: string): string {
      const g: ListGroup = { id: newId(), name: name.trim() || "New category" };
      update((s) => ({ ...s, groups: [...s.groups, g] }));
      return g.id;
    },
    renameGroup: (id: string, name: string) => name.trim() && mapGroup(id, (g) => ({ ...g, name: name.trim().slice(0, 60) })),
    toggleGroup: (id: string) => mapGroup(id, (g) => ({ ...g, collapsed: !g.collapsed })),
    /** Deletes a category; its lists become uncategorised (nothing is lost). */
    deleteGroup: (id: string) =>
      update((s) => ({
        ...s,
        groups: s.groups.filter((g) => g.id !== id),
        lists: s.lists.map((l) => (l.groupId === id ? { id: l.id, name: l.name, symbols: l.symbols } : l)),
      })),
    moveGroup(id: string, beforeId?: string) {
      if (id === beforeId) return;
      update((s) => {
        const moving = s.groups.find((g) => g.id === id);
        if (!moving) return s;
        const rest = s.groups.filter((g) => g.id !== id);
        const at = beforeId ? rest.findIndex((g) => g.id === beforeId) : -1;
        rest.splice(at < 0 ? rest.length : at, 0, moving);
        return { ...s, groups: rest };
      });
    },

    // --- per-stock info ---
    /** Merges fields into a stock's info; empty strings remove a field. */
    setMeta(symbol: string, patch: Partial<StockMeta>) {
      const sym = symbol.toUpperCase();
      update((s) => {
        const cur: StockMeta = { ...(s.stocks?.[sym] ?? {}) };
        for (const [k, v] of Object.entries(patch) as [keyof StockMeta, unknown][]) {
          if (v === "" || v == null) delete cur[k];
          else (cur as Record<string, unknown>)[k] = v;
        }
        const stocks = { ...(s.stocks ?? {}) };
        if (Object.keys(cur).length) stocks[sym] = cur;
        else delete stocks[sym];
        return { ...s, stocks };
      });
    },
    /** Sets an own assessment (0–3), or clears it with null. */
    setAssessment(symbol: string, key: string, value: number | null) {
      const sym = symbol.toUpperCase();
      update((s) => {
        const cur = { ...(s.stocks?.[sym] ?? {}) };
        const a = { ...(cur.assessments ?? {}) };
        if (value == null) delete a[key];
        else a[key] = value;
        if (Object.keys(a).length) cur.assessments = a;
        else delete cur.assessments;
        return { ...s, stocks: { ...(s.stocks ?? {}), [sym]: cur } };
      });
    },
    /** Swaps a ticker everywhere (all lists) and moves its info along. */
    replaceSymbol(oldSym: string, newSym: string) {
      const from = oldSym.toUpperCase();
      const to = newSym.trim().toUpperCase();
      if (!to || from === to) return;
      update((s) => {
        const lists = s.lists.map((l) =>
          l.symbols.includes(from)
            ? { ...l, symbols: [...new Set(l.symbols.map((x) => (x === from ? to : x)))] }
            : l,
        );
        const stocks = { ...(s.stocks ?? {}) };
        if (stocks[from]) {
          stocks[to] = { ...stocks[from], ...(stocks[to] ?? {}) };
          delete stocks[from];
        }
        return { ...s, lists, stocks };
      });
    },
    /** Adds lists (creating categories by name) and fills in stock info without overwriting your own. */
    importBundle(b: ImportBundle): string | undefined {
      let firstId: string | undefined;
      update((s) => {
        const groups = [...s.groups];
        const groupId = (name?: string) => {
          if (!name) return undefined;
          let g = groups.find((x) => x.name === name);
          if (!g) {
            g = { id: newId(), name: name.slice(0, 60) };
            groups.push(g);
          }
          return g.id;
        };
        const lists = [...s.lists];
        for (const l of b.lists) {
          const symbols = [...new Set(l.symbols.map((x) => String(x).trim().toUpperCase()).filter(Boolean))].slice(0, 300);
          const gid = groupId(l.group);
          const list: Watchlist = { id: newId(), name: String(l.name).slice(0, 60) || "Imported", symbols, ...(gid ? { groupId: gid } : {}) };
          firstId ??= list.id;
          lists.push(list);
        }
        const stocks = { ...(s.stocks ?? {}) };
        for (const [sym, meta] of Object.entries(b.stocks ?? {})) {
          const key = sym.toUpperCase();
          const cur = stocks[key] ?? {};
          const merged: StockMeta = { ...meta, ...cur }; // your existing info wins…
          if (merged.investmentType) merged.investmentType = normaliseInvestmentType(merged.investmentType);
          // …but imported notes are added below yours rather than dropped.
          if (meta.note && cur.note && !cur.note.includes(meta.note)) merged.note = `${cur.note}\n\n${meta.note}`;
          stocks[key] = merged;
        }
        return { ...s, groups, lists, stocks };
      });
      return firstId;
    },
    setTrafficLights: (on: boolean) => update((s) => ({ ...s, settings: { ...(s.settings ?? {}), trafficLights: on } })),
    setSmoothScoring: (on: boolean) => update((s) => ({ ...s, settings: { ...(s.settings ?? {}), smoothScoring: on } })),
    setMinCoverage: (pct: number) => update((s) => ({ ...s, settings: { ...(s.settings ?? {}), minCoverage: pct } })),

    // --- table columns ---
    setColumns: (columns: string[] | undefined) =>
      update((s) => {
        const next = { ...s };
        if (columns) next.columns = columns;
        else delete next.columns;
        return next;
      }),
  };
}

export type StoreApi = ReturnType<typeof useStore>;
