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
});
