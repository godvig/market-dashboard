// Keeps data/snapshots.json: the key figures behind the scores, one snapshot
// per stock per day (weekly after five weeks). Recorded whenever a list is
// loaded, so score history builds up on its own. See shared/scoreHistory.ts.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { addSnapshot, parseSnapshots, snapshotOf, type Snapshot } from "../shared/scoreHistory";
import type { WatchlistRow } from "../shared/types";

const DIR = path.resolve(process.env.DATA_DIR ?? "data");
const FILE = path.join(DIR, "snapshots.json");

let cache: Map<string, Snapshot[]> | null = null;
let writeTimer: NodeJS.Timeout | null = null;

async function load(): Promise<Map<string, Snapshot[]>> {
  if (cache) return cache;
  const map = new Map<string, Snapshot[]>();
  try {
    const raw = JSON.parse(await readFile(FILE, "utf8")) as { symbols?: Record<string, unknown> };
    for (const [symbol, list] of Object.entries(raw.symbols ?? {})) {
      const snaps = parseSnapshots(list);
      if (snaps.length) map.set(symbol.toUpperCase(), snaps);
    }
  } catch {
    /* no history yet */
  }
  return (cache = map);
}

async function flush() {
  writeTimer = null;
  if (!cache) return;
  await mkdir(DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  await writeFile(tmp, JSON.stringify({ version: 1, symbols: Object.fromEntries(cache) }));
  await rename(tmp, FILE);
}

/** Records today's figures for the rows that loaded. Writes are batched. */
export async function recordSnapshots(rows: WatchlistRow[]): Promise<void> {
  const map = await load();
  let changed = false;
  for (const row of rows) {
    const snap = snapshotOf(row);
    if (!snap) continue;
    const symbol = row.quote.symbol.toUpperCase();
    map.set(symbol, addSnapshot(map.get(symbol) ?? [], snap));
    changed = true;
  }
  if (changed && !writeTimer) writeTimer = setTimeout(() => void flush().catch(() => {}), 2000);
}

export async function snapshotsFor(symbol: string): Promise<Snapshot[]> {
  return (await load()).get(symbol.toUpperCase()) ?? [];
}
