import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { detectFileKind, readTable } from "./importFile";
import { matchRows, nameSimilarity, normaliseName, tickerCandidates, toYahooTicker } from "./importMatch";
import { mergeImported } from "./importMerge";
import {
  columnScales,
  defaultMapping,
  detectDelimiter,
  detectScale,
  headerHash,
  interpretRows,
  parseCsv,
  parseNumber,
  suggestMapping,
  toSheet,
  type ImportRow,
} from "./importParse";
import { IMPORT_SYNONYMS, normaliseHeader } from "./importSynonyms";

// All companies and figures here are made up.
const num = (c: Parameters<typeof parseNumber>[0]) => parseNumber(c)?.value ?? null;

describe("parseNumber", () => {
  it("reads decimal comma, spaces and non-breaking spaces as thousands separators", () => {
    expect(num("4,5")).toBe(4.5);
    expect(num("1 234,5")).toBe(1234.5);
    expect(num("1 234 567,25")).toBe(1234567.25);
    expect(num("12 000")).toBe(12000);
  });

  it("reads English notation and mixed separators", () => {
    expect(num("1,234.5")).toBe(1234.5);
    expect(num("1.234,5")).toBe(1234.5);
    expect(num("1,234,567")).toBe(1234567);
    expect(num("0.045")).toBe(0.045);
  });

  it("keeps the sign, including a Unicode minus and accounting brackets", () => {
    expect(num("-3,1")).toBe(-3.1);
    expect(num("−3,1")).toBe(-3.1);
    expect(num("(12,5)")).toBe(-12.5);
  });

  it("notes a % sign and strips units", () => {
    expect(parseNumber("4,5 %")).toEqual({ value: 4.5, percent: true });
    expect(num("12,3 SEK")).toBe(12.3);
  });

  it("treats -, n/a, empty and text as missing", () => {
    for (const c of ["-", "–", "n/a", "N/A", "", "  ", null, undefined, "#N/A", "abc"]) expect(num(c)).toBeNull();
  });

  it("passes spreadsheet numbers through", () => {
    expect(num(14.2)).toBe(14.2);
    expect(num(NaN)).toBeNull();
  });
});

describe("CSV", () => {
  it("detects semicolon, comma and tab separators", () => {
    expect(detectDelimiter("Bolag;P/E;ROE\nA;1,2;3")).toBe(";");
    expect(detectDelimiter("Company,P/E,ROE\nA,1.2,3")).toBe(",");
    expect(detectDelimiter("Company\tP/E\nA\t1.2")).toBe("\t");
  });

  it("handles quotes, embedded separators, CRLF and a BOM", () => {
    const rows = parseCsv('﻿Name;Note\r\n"Kaka; AB";"say ""hej"""\r\n\r\nB;x');
    expect(rows).toEqual([["Name", "Note"], ["Kaka; AB", 'say "hej"'], ["B", "x"]]);
  });

  it("keeps a decimal comma inside a quoted field of a comma-separated file", () => {
    expect(parseCsv('Bolag,P/E\nKaka AB,"14,2"')).toEqual([["Bolag", "P/E"], ["Kaka AB", "14,2"]]);
  });
});

describe("synonyms", () => {
  it("maps Swedish and English headers to key figures", () => {
    const headers = [
      "Bolag", "Ticker", "Direktavkastning", "Dividend Yield", "Utdelningsandel", "P/E", "P/S", "P/B", "EV/EBIT", "ROE", "ROIC",
      "Soliditet", "Vinsttillväxt 5år", "Omsättningstillväxt 10år", "Utdelning tillväxt 5år", "Nettoskuld/EBITDA", "Börsvärde", "ISIN",
    ];
    expect(suggestMapping(headers)).toEqual([
      "id.name", "id.ticker", "dividendYield", null /* already taken by the column before */, "payoutRatio", "pe", "ps", "pb",
      "evEbit", "roe", "roic", "equityRatio", "earningsCagr5y", "revenueCagr10y", "dividendCagr5y", "netDebtEbitda", "marketCap", "id.isin",
    ]);
  });

  it("ignores case, spacing, units and how the horizon is written", () => {
    const same = ["Vinsttillväxt 5år", "vinsttillväxt 5 år", "VINSTTILLVÄXT - 5 ÅR", "Earnings Growth 5y", "Earnings growth (5 years)"];
    expect(new Set(same.map((h) => suggestMapping([h])[0]))).toEqual(new Set(["earningsCagr5y"]));
    expect(suggestMapping(["Börsvärde (MSEK)"])).toEqual(["marketCap"]);
    expect(suggestMapping(["Direktavkastning %"])).toEqual(["dividendYield"]);
    expect(suggestMapping(["P/E (fwd)"])).toEqual(["forwardPe"]);
    expect(suggestMapping(["Something else"])).toEqual([null]);
  });

  it("never lets one spelling mean two different figures", () => {
    const seen = new Map<string, string>();
    for (const [target, names] of Object.entries(IMPORT_SYNONYMS)) {
      for (const n of names!) {
        const k = normaliseHeader(n);
        expect(seen.get(k) ?? target, `"${n}"`).toBe(target);
        seen.set(k, target);
      }
    }
  });

  it("hashes the same header set to the same id, regardless of spelling noise", () => {
    expect(headerHash(["Bolag", "P/E", "ROE"])).toBe(headerHash(["bolag ", "P/E", "roe"]));
    expect(headerHash(["Bolag", "P/E", "ROE"])).not.toBe(headerHash(["Bolag", "ROE", "P/E"]));
  });
});

describe("scales", () => {
  it("multiplies percentages written as fractions by 100", () => {
    expect(detectScale("payoutRatio", "Utdelningsandel", ["0,48", "0,55", "0,6"])).toBe(100);
    expect(detectScale("roe", "ROE", ["21,7", "15,9", "-3,1"])).toBe(1);
  });

  it("trusts a % sign in the cells over the guess", () => {
    expect(detectScale("dividendYield", "Direktavkastning", ["0,5 %", "0,8 %", "0,3 %"])).toBe(1);
  });

  it("reads market cap in millions from the values or from the header", () => {
    expect(detectScale("marketCap", "Börsvärde", ["48 210,5", "6 845", "812,9"])).toBe(1e6);
    expect(detectScale("marketCap", "Market cap", [4.8e10, 6.8e9])).toBe(1);
    expect(detectScale("marketCap", "Börsvärde (MSEK)", [4.8e10])).toBe(1e6);
  });

  it("leaves multiples alone and lets the user override", () => {
    const sheet = toSheet([["Bolag", "P/E", "Utdelningsandel"], ["Kaka", "14,2", "0,5"]]);
    const mapping = defaultMapping(sheet.headers);
    expect(columnScales(sheet, mapping)).toEqual([1, 1, 100]);
    expect(interpretRows(sheet, mapping)[0].values).toEqual({ pe: 14.2, payoutRatio: 50 });
    expect(interpretRows(sheet, { ...mapping, scales: { 2: 1 } })[0].values).toEqual({ pe: 14.2, payoutRatio: 0.5 });
  });
});

describe("the sample file", () => {
  const bytes = new Uint8Array(readFileSync(new URL("../docs/examples/borsdata-screener-sample.csv", import.meta.url)));

  it("maps every column but the list name and converts the units", async () => {
    const { kind, table } = await readTable(bytes, "borsdata-screener-sample.csv");
    expect(kind).toBe("csv");
    const sheet = toSheet(table);
    const mapping = defaultMapping(sheet.headers);
    expect(mapping.columns.filter((c) => c == null)).toHaveLength(1); // "Lista"
    const rows = interpretRows(sheet, mapping);
    expect(rows).toHaveLength(10);
    const gnuggel = rows[0];
    expect(gnuggel).toMatchObject({ name: "Gnuggel Mekaniska AB", ticker: "GNUG B" });
    expect(gnuggel.values).toMatchObject({ marketCap: 48_210_500_000, dividendYield: 3.4, payoutRatio: 48, roic: 16.2, earningsCagr5y: 9.6 });
    const kanelbulle = rows[2];
    expect(kanelbulle.values.evEbit).toBeUndefined(); // "-"
    expect(kanelbulle.values.roic).toBeUndefined(); // "n/a"
  });
});

describe("spreadsheets", () => {
  it("reads .xlsx by its content, with percent-formatted cells already in percent", async () => {
    const ws = XLSX.utils.aoa_to_sheet([["Export from a screener"], [], ["Bolag", "Ticker", "Direktavkastning", "P/E"], ["Kaka AB", "KAKA B", 0.045, 14.2]]);
    ws["C4"].z = "0.0%";
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Screener");
    const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    expect(detectFileKind(bytes, "export.csv")).toBe("xlsx"); // the content decides, not the name
    const sheet = toSheet((await readTable(bytes, "export.xlsx")).table);
    expect(sheet.headers).toEqual(["Bolag", "Ticker", "Direktavkastning", "P/E"]); // title rows skipped
    expect(interpretRows(sheet, defaultMapping(sheet.headers))[0].values).toEqual({ dividendYield: 4.5, pe: 14.2 });
  });
});

describe("tickers", () => {
  it("converts Börsdata/Nordnet tickers to Yahoo style", () => {
    expect(toYahooTicker("VOLV B")).toBe("VOLV-B.ST");
    expect(toYahooTicker("gnug b")).toBe("GNUG-B.ST");
    expect(toYahooTicker("LSYL", ".OL")).toBe("LSYL.OL");
    expect(toYahooTicker("KAKA-B.ST")).toBe("KAKA-B.ST");
    expect(toYahooTicker("STO:KBUL A")).toBe("KBUL-A.ST");
    expect(toYahooTicker("MYSF", "")).toBe("MYSF");
  });

  it("tries the other Nordic exchanges as well", () => {
    expect(tickerCandidates("BVAL B")).toEqual(expect.arrayContaining(["BVAL-B.ST", "BVAL-B", "BVAL-B.OL", "BVAL-B.CO", "BVAL-B.HE"]));
  });
});

describe("matching rows to stocks", () => {
  const row = (r: Partial<ImportRow>): ImportRow => ({ index: 0, values: {}, ...r });
  const known = [
    { symbol: "GNUG-B.ST", name: "Gnuggel Mekaniska B" },
    { symbol: "LSYL.ST", name: "Lingonsylt Industrier" },
    { symbol: "KBUL-A.ST", name: "Kanelbulle Bank A" },
    { symbol: "KBUL-B.ST", name: "Kanelbulle Bank B" },
    { symbol: "SNSK-B.ST", name: "Snöskottar Norden B" },
    { symbol: "BVAL-B.OL", name: "Blåval Rederi" },
  ];

  it("matches by ticker, then exact name, then fuzzy name", () => {
    const m = matchRows(
      [
        row({ ticker: "GNUG B", name: "whatever" }),
        row({ name: "Lingonsylt Industrier AB (publ)" }),
        row({ name: "Snoskottar Nordan ser. B" }),
        row({ ticker: "BVAL B" }),
        row({ ticker: "ZZZZ", name: "Helt Okänt Bolag" }),
      ],
      known,
    );
    expect(m.map((x) => [x.symbol, x.how])).toEqual([
      ["GNUG-B.ST", "ticker"],
      ["LSYL.ST", "name"],
      ["SNSK-B.ST", "fuzzy"],
      ["BVAL-B.OL", "ticker"],
      [undefined, undefined],
    ]);
    expect(m[4].guess).toBe("ZZZZ.ST");
  });

  it("never matches a different share class by name", () => {
    expect(nameSimilarity("Kanelbulle Bank A", "Kanelbulle Bank B")).toBe(0);
    const [m] = matchRows([row({ name: "Kanelbulle Bank ser. B" })], known);
    expect(m.symbol).toBe("KBUL-B.ST");
  });

  it("leaves a close call unmatched instead of guessing", () => {
    const twins = [
      { symbol: "AAA.ST", name: "Pepparkaka Media" },
      { symbol: "BBB.ST", name: "Pepparkaka Medic" },
    ];
    expect(matchRows([row({ name: "Pepparkaka Medi" })], twins)[0].symbol).toBeUndefined();
  });

  it("normalises legal forms away", () => {
    expect(normaliseName("AB Gnuggel Mekaniska (publ)")).toBe("gnuggel mekaniska");
  });
});

describe("merging imports with the API", () => {
  const now = new Date("2026-11-13T12:00:00Z");
  const api = { pe: 15, roe: 20 };
  const apiSources = { pe: "yahoo", roe: "yahoo" } as const;

  it("lets a recent import override the API for the figures it has", () => {
    const m = mergeImported(api, apiSources, { pe: { v: 12, src: "import: s.csv", at: "2026-11-01" }, roic: { v: 9, src: "import: s.csv", at: "2026-11-01" } }, 120, now);
    expect(m.fundamentals).toEqual({ pe: 12, roe: 20, roic: 9 });
    expect(m.sources).toEqual({ pe: "import: s.csv (2026-11-01)", roe: "yahoo", roic: "import: s.csv (2026-11-01)" });
  });

  it("lets the API win over an import older than the limit, but keeps it where the API has nothing", () => {
    const old = { v: 12, src: "import: old.csv", at: "2026-06-01" };
    const m = mergeImported(api, apiSources, { pe: old, roic: old }, 120, now);
    expect(m.fundamentals).toEqual({ pe: 15, roe: 20, roic: 12 });
    expect(m.sources.pe).toBe("yahoo");
    expect(m.sources.roic).toMatch(/older than 120 days/);
    expect(mergeImported(api, apiSources, { pe: old }, 365, now).fundamentals.pe).toBe(12); // a longer limit keeps it
  });
});
