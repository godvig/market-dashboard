// Turns the bytes of an uploaded file into a table of cells. CSV is parsed
// here (importParse.ts); .xlsx/.xls/.ods go through SheetJS, loaded only
// when a spreadsheet is opened so it stays out of the main bundle.
import { parseCsv, type Cell } from "./importParse";

export type FileKind = "csv" | "xlsx" | "xls" | "ods";

/** File type from its first bytes (a zip = .xlsx/.ods, OLE2 = old .xls), else the extension, else CSV. */
export function detectFileKind(bytes: Uint8Array, name = ""): FileKind {
  const ext = name.toLowerCase().split(".").pop();
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return ext === "ods" ? "ods" : "xlsx";
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return "xls";
  return "csv";
}

/** UTF-8 (with or without BOM), falling back to Windows-1252 for files saved by older Excel versions. */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * The first sheet as rows of cells. Numbers stay numbers; cells formatted
 * as percent (stored as 0.045) come back as "4.5%" so the parser knows they
 * are already in percent.
 */
export async function readSpreadsheet(bytes: Uint8Array): Promise<Cell[][]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(bytes, { type: "array", cellDates: false, cellNF: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const rows: Cell[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: Cell[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as { t?: string; v?: unknown; z?: string } | undefined;
      if (!cell || cell.v == null || cell.t === "e") row.push(null);
      else if (cell.t === "n" && typeof cell.v === "number" && cell.z?.includes("%")) row.push(`${Number((cell.v * 100).toPrecision(12))}%`);
      else row.push(cell.v as Cell);
    }
    rows.push(row);
  }
  return rows;
}

/** Reads any supported file into a table of cells. */
export async function readTable(bytes: Uint8Array, name = ""): Promise<{ kind: FileKind; table: Cell[][] }> {
  const kind = detectFileKind(bytes, name);
  const table = kind === "csv" ? parseCsv(decodeText(bytes)) : await readSpreadsheet(bytes);
  return { kind, table };
}
