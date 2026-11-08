// Small TTL cache: memory first, then JSON files in .cache/ so restarts
// don't burn through free-tier quotas.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.resolve(".cache");
const mem = new Map<string, { expires: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

const file = (key: string) => path.join(DIR, createHash("sha1").update(key).digest("hex") + ".json");

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = mem.get(key);
  if (hit && hit.expires > now) return hit.value as T;

  try {
    const disk = JSON.parse(await readFile(file(key), "utf8")) as { expires: number; value: T };
    if (disk.expires > now) {
      mem.set(key, disk);
      return disk.value;
    }
  } catch {
    /* no cache file yet */
  }

  // Deduplicate concurrent requests for the same key.
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const p = load()
    .then(async (value) => {
      const entry = { expires: Date.now() + ttlMs, value };
      mem.set(key, entry);
      await mkdir(DIR, { recursive: true });
      await writeFile(file(key), JSON.stringify(entry)).catch(() => undefined);
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Runs async tasks with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
