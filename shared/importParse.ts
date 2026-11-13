// Reading key figures out of a table from a file: CSV parsing, numbers in
// Swedish and English notation, which column holds what, and in what scale.
// Pure functions; the file itself is read in importFile.ts.
import { METRIC_BY_KEY } from "./metrics";
import { headerScale, normaliseHeader, synonymLookup } from "./importSynonyms";
import type { Fundamentals, FundamentalKey, ImportMapping, ImportTarget } from "./types";

/** A cell as it comes from a CSV (text) or a spreadsheet (number or text). */
export type Cell = string | number | boolean | null | undefined;

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** The separator used in the header line: semicolon, tab or comma (quoted text is skipped). */
export function detectDelimiter(text: string): ";" | "\t" | "," {
  const firstLine = text.replace(/"[^"]*"/g, "").split(/\r?\n/, 1)[0] ?? "";
  const count = (c: string) => firstLine.split(c).length - 1;
  const candidates = [";", "\t", ","] as const;
  return candidates.reduce((best, c) => (count(c) > count(best) ? c : best), candidates[0]);
}

/** RFC 4180-ish: quoted fields, "" inside quotes, CRLF or LF line ends. Blank lines are dropped. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const MISSING = /^(-|–|—|n\/?a|na|nan|null|none|saknas|#n\/a|#div\/0!|#value!|\.)$/i;

export interface ParsedNumber {
  value: number;
  /** The cell said "%" itself, so the number is already in percent. */
  percent: boolean;
}

/**
 * A number from a cell, or null when it is missing. Handles decimal comma
 * ("4,5"), thousands separators as spaces, non-breaking or thin spaces
 * ("1 234,5"), "1,234.5", "%", a Unicode minus and "(12)" for negatives.
 * "-", "n/a" and empty cells are missing.
 */
export function parseNumber(cell: Cell): ParsedNumber | null {
  if (typeof cell === "number") return Number.isFinite(cell) ? { value: cell, percent: false } : null;
  if (typeof cell !== "string") return null;
  let s = cell.trim();
  if (!s || MISSING.test(s)) return null;
  const percent = s.includes("%");
  s = s.replace(/%/g, "").replace(/[\s   ']/g, "").replace(/[−–]/g, "-");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/^[^\d+\-.,]+|[^\d.,]+$/g, ""); // currency or unit text around the number
  const comma = s.lastIndexOf(",");
  const dot = s.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    // The later one is the decimal mark: "1.234,5" or "1,234.5".
    s = comma > dot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (comma >= 0) {
    // Only commas: one is a decimal comma ("4,5"), several are thousands ("1,234,567").
    s = (s.match(/,/g)!.length > 1 ? s.replace(/,/g, "") : s.replace(",", "."));
  } else if ((s.match(/\./g)?.length ?? 0) > 1) {
    s = s.replace(/\./g, ""); // "1.234.567"
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  const value = Number(s) * (negative ? -1 : 1);
  return Number.isFinite(value) ? { value, percent } : null;
}

// ---------------------------------------------------------------------------
// Headers and mapping
// ---------------------------------------------------------------------------

const isNumeric = (c: Cell) => parseNumber(c) != null;
const filled = (c: Cell) => c != null && String(c).trim() !== "";

/**
 * Index of the header row: the first of the top rows that is mostly text and
 * at least half as wide as the table (skips title rows above the headers).
 */
export function findHeaderRow(table: Cell[][]): number {
  const width = Math.max(0, ...table.slice(0, 20).map((r) => r.filter(filled).length));
  for (let i = 0; i < Math.min(table.length, 20); i++) {
    const cells = table[i].filter(filled);
    const text = cells.filter((c) => !isNumeric(c)).length;
    if (cells.length >= Math.max(2, width / 2) && text >= cells.length * 0.6) return i;
  }
  return 0;
}

/** The suggested target for each column; each target is used once (first column wins). */
export function suggestMapping(headers: string[]): (ImportTarget | null)[] {
  const lookup = synonymLookup();
  const used = new Set<ImportTarget>();
  return headers.map((h) => {
    const t = lookup.get(normaliseHeader(h));
    if (!t || used.has(t)) return null;
    used.add(t);
    return t;
  });
}

/** Short, stable id for a set of headers (FNV-1a over the normalised names, in order). */
export function headerHash(headers: string[]): string {
  let h = 0x811c9dc5;
  for (const ch of headers.map((x) => normaliseHeader(String(x ?? ""))).join("|")) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------------

/** Units a key figure is stored in, for the preview. */
export function unitOf(target: ImportTarget | null): string {
  if (!target || target.startsWith("id.")) return "";
  const def = METRIC_BY_KEY.get(target);
  switch (def?.unit) {
    case "pct":
      return "%";
    case "x":
      return "×";
    case "years":
      return "år";
    case "amount":
      return target === "marketCap" ? "kr" : "kr/aktie";
    default:
      return "";
  }
}

const isPercentKey = (target: ImportTarget) => METRIC_BY_KEY.get(target)?.unit === "pct";


export const median = (xs: number[]) => {
  const s = xs.filter((x) => Number.isFinite(x) && x !== 0).map(Math.abs).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * The factor that brings a column into the app's units, detected the same
 * way as for Börsdata's API: percentages written as fractions (0.045) are
 * multiplied by 100, market cap in millions by 1e6. A unit in the header
 * ("Börsvärde (MSEK)") or "%" in the cells wins over the guess.
 */
export function detectScale(target: ImportTarget | null, header: string, cells: Cell[]): number {
  if (!target || target.startsWith("id.")) return 1;
  const parsed = cells.map(parseNumber).filter((p): p is ParsedNumber => p != null);
  if (isPercentKey(target) && parsed.some((p) => p.percent)) return 1;
  if (target === "marketCap" && headerScale(header)) return headerScale(header)!;
  return scaleFromMedian(target, median(parsed.map((p) => p.value)));
}

/**
 * The guess itself, from the median absolute value of a column: a
 * percentage under 1 is a fraction, a market cap under 10 million is in
 * millions. Shared with the Börsdata API provider.
 */
export function scaleFromMedian(key: string, med: number): number {
  if (isPercentKey(key as ImportTarget) && med > 0 && med < 1) return 100;
  if (key === "marketCap" && med > 0 && med < 1e7) return 1e6;
  return 1;
}

/** Labels for the scale choices in the preview, by unit. */
export function scaleChoices(target: ImportTarget | null): { factor: number; label: string }[] {
  if (!target || target.startsWith("id.")) return [{ factor: 1, label: "–" }];
  if (isPercentKey(target)) {
    return [
      { factor: 1, label: "In % (4,5)" },
      { factor: 100, label: "Fraction (0,045) ×100" },
    ];
  }
  if (METRIC_BY_KEY.get(target)?.unit === "amount") {
    return [
      { factor: 1, label: "As is" },
      { factor: 1e3, label: "Thousands" },
      { factor: 1e6, label: "Millions" },
      { factor: 1e9, label: "Billions" },
    ];
  }
  return [
    { factor: 1, label: "As is" },
    { factor: 100, label: "×100" },
  ];
}

// ---------------------------------------------------------------------------
// The whole table
// ---------------------------------------------------------------------------

export interface SheetData {
  headers: string[];
  /** Data rows (below the header row), padded to the header width. */
  rows: Cell[][];
}

/** Splits a raw table into headers and data rows. */
export function toSheet(table: Cell[][]): SheetData {
  const at = findHeaderRow(table);
  const headers = (table[at] ?? []).map((h, i) => (filled(h) ? String(h).trim() : `Column ${i + 1}`));
  const rows = table
    .slice(at + 1)
    .filter((r) => r.some(filled))
    .map((r) => headers.map((_, i) => r[i] ?? null));
  return { headers, rows };
}

/** A fresh mapping for a sheet: suggested targets and no scale overrides. */
export function defaultMapping(headers: string[]): ImportMapping {
  return { headers, columns: suggestMapping(headers), suffix: ".ST" };
}

/** Scale per column: the user's override, else the detected one. */
export function columnScales(sheet: SheetData, mapping: ImportMapping): number[] {
  return sheet.headers.map(
    (h, i) => mapping.scales?.[i] ?? detectScale(mapping.columns[i] ?? null, h, sheet.rows.map((r) => r[i])),
  );
}

export interface ImportRow {
  /** Index in sheet.rows. */
  index: number;
  ticker?: string;
  name?: string;
  isin?: string;
  values: Fundamentals;
}

const text = (c: Cell) => (filled(c) ? String(c).trim() : undefined);

/** Every data row as identifiers plus key figures in the app's units. Rows without any identifier are left out. */
export function interpretRows(sheet: SheetData, mapping: ImportMapping, scales = columnScales(sheet, mapping)): ImportRow[] {
  const out: ImportRow[] = [];
  sheet.rows.forEach((r, index) => {
    const row: ImportRow = { index, values: {} };
    mapping.columns.forEach((target, i) => {
      if (!target) return;
      if (target === "id.ticker") row.ticker = text(r[i]);
      else if (target === "id.name") row.name = text(r[i]);
      else if (target === "id.isin") row.isin = text(r[i])?.toUpperCase();
      else {
        const p = parseNumber(r[i]);
        if (p) row.values[target as FundamentalKey] = round(p.value * scales[i]);
      }
    });
    if (row.ticker || row.name || row.isin) out.push(row);
  });
  return out;
}

/** Drops floating-point noise from scaling (0.045 × 100 = 4.500000000000001). */
const round = (v: number) => Number(v.toPrecision(12));
