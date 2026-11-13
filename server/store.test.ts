import { describe, expect, it } from "vitest";
import { parseStore } from "./store";

describe("parseStore", () => {
  it("normalises symbols and trims names", () => {
    const s = parseStore({
      version: 2,
      groups: [{ id: "g1", name: " Utdelning " }],
      lists: [{ id: "a", name: "  Utdelare ", symbols: ["volv-b.st", "VOLV-B.ST", " aapl ", 3, ""], groupId: "g1" }],
    });
    expect(s.groups).toEqual([{ id: "g1", name: "Utdelning" }]);
    expect(s.lists[0]).toEqual({ id: "a", name: "Utdelare", symbols: ["VOLV-B.ST", "AAPL"], groupId: "g1" });
  });

  it("migrates the old array format", () => {
    const s = parseStore([{ id: "a", name: "My watchlist", symbols: ["AAPL"] }]);
    expect(s).toEqual({ version: 2, groups: [], lists: [{ id: "a", name: "My watchlist", symbols: ["AAPL"] }] });
  });

  it("drops references to categories that don't exist", () => {
    const s = parseStore({ groups: [], lists: [{ id: "a", name: "x", symbols: [], groupId: "gone" }] });
    expect(s.lists[0].groupId).toBeUndefined();
  });

  it("keeps column choices", () => {
    expect(parseStore({ lists: [{ id: "a", name: "x", symbols: [] }], columns: ["price", "pe", 7] }).columns).toEqual(["price", "pe"]);
  });

  it("keeps stock notes and assessments, drops junk", () => {
    const s = parseStore({
      lists: [{ id: "a", name: "x", symbols: [] }],
      stocks: {
        "volv-b.st": { sector: "Industri", niche: "Lantbruk & Tunga Byggmaskiner", investmentType: "Bronze horse", note: "Bra bolag", assessments: { trendSector: 3, outlook: 9, "bad key!": 1 }, evil: "x" },
        EMPTY: {},
      },
      settings: { trafficLights: false },
    });
    expect(s.stocks).toEqual({
      "VOLV-B.ST": { sector: "Industri", niche: "Lantbruk & Tunga Byggmaskiner", investmentType: "Bronze horse", note: "Bra bolag", assessments: { trendSector: 3 } },
    });
    expect(s.settings).toEqual({ trafficLights: false });
  });

  it("rejects bad input", () => {
    expect(() => parseStore({ lists: [] })).toThrow();
    expect(() => parseStore({ lists: [{ id: "a", name: "", symbols: [] }] })).toThrow();
    expect(() => parseStore("nope")).toThrow();
  });
  it("keeps imported figures and mappings, dropping anything malformed", () => {
    const s = parseStore({
      version: 2,
      groups: [],
      lists: [{ id: "a", name: "L", symbols: ["GNUG-B.ST"] }],
      settings: { importMaxAgeDays: 90.4 },
      imported: {
        "gnug-b.st": {
          pe: { v: 14.2, src: "import: s.csv", at: "2026-11-13" },
          roe: { v: "21", src: "import: s.csv", at: "2026-11-13" }, // not a number
          bogus: { v: 1, src: "x", at: "2026-11-13" }, // unknown key
          pb: { v: 3.1, src: "import: s.csv", at: "yesterday" }, // bad date
        },
      },
      importMappings: {
        "1a2b3c4d": { headers: ["Bolag", "P/E", "X"], columns: ["id.name", "pe", "drop table"], scales: { 1: 100, x: 2 }, suffix: ".ST" },
        "not-a-hash!": { headers: [], columns: [] },
      },
    });
    expect(s.settings).toEqual({ importMaxAgeDays: 90 });
    expect(s.imported).toEqual({ "GNUG-B.ST": { pe: { v: 14.2, src: "import: s.csv", at: "2026-11-13" } } });
    expect(s.importMappings).toEqual({ "1a2b3c4d": { headers: ["Bolag", "P/E", "X"], columns: ["id.name", "pe", null], scales: { 1: 100 }, suffix: ".ST" } });
  });
  it("keeps custom scorecards and list lenses", () => {
    const card = { id: "custom-x", name: "Mine", description: "", criteria: [{ metric: "pe", tiers: [{ lt: 15, points: 1 }, { points: 0 }] }] };
    const s = parseStore({
      version: 2,
      groups: [],
      lists: [{ id: "a", name: "A", symbols: ["AAPL"], scorecardId: "custom-x" }],
      scorecards: [card, { name: "broken" }],
    });
    expect(s.lists[0].scorecardId).toBe("custom-x");
    expect(s.scorecards?.map((c) => c.id)).toEqual(["custom-x"]);
  });
});
