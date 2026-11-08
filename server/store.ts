// Saves the user's named watchlists to data/watchlists.json, so they
// survive browser resets and work in any browser on this machine.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Watchlist } from "../shared/types";

const DIR = path.resolve(process.env.DATA_DIR ?? "data");
const FILE = path.join(DIR, "watchlists.json");

/** Returns null when nothing has been saved yet. */
export async function readWatchlists(): Promise<Watchlist[] | null> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as Watchlist[];
  } catch {
    return null;
  }
}

export async function writeWatchlists(lists: Watchlist[]): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  await writeFile(tmp, JSON.stringify(lists, null, 2));
  await rename(tmp, FILE); // atomic replace: never a half-written file
}

/** Validates and normalises input; throws on bad shape. */
export function parseWatchlists(input: unknown): Watchlist[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 100) {
    throw new Error("Expected a non-empty array of watchlists");
  }
  return input.map((l, i) => {
    if (!l || typeof l !== "object") throw new Error(`Watchlist ${i} is not an object`);
    const { id, name, symbols } = l as Record<string, unknown>;
    if (typeof id !== "string" || !id) throw new Error(`Watchlist ${i} has no id`);
    if (typeof name !== "string" || !name.trim()) throw new Error(`Watchlist ${i} has no name`);
    if (!Array.isArray(symbols)) throw new Error(`Watchlist ${i} has no symbols array`);
    const clean = [...new Set(symbols.filter((s): s is string => typeof s === "string").map((s) => s.trim().toUpperCase()))];
    return { id, name: name.trim().slice(0, 60), symbols: clean.filter(Boolean).slice(0, 50) };
  });
}
