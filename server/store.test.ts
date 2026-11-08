import { describe, expect, it } from "vitest";
import { parseWatchlists } from "./store";

describe("parseWatchlists", () => {
  it("normalises symbols and trims names", () => {
    const [l] = parseWatchlists([{ id: "a", name: "  Utdelare ", symbols: ["volv-b.st", "VOLV-B.ST", " aapl ", 3, ""] }]);
    expect(l).toEqual({ id: "a", name: "Utdelare", symbols: ["VOLV-B.ST", "AAPL"] });
  });

  it("rejects bad input", () => {
    expect(() => parseWatchlists([])).toThrow();
    expect(() => parseWatchlists([{ id: "a", name: "", symbols: [] }])).toThrow();
    expect(() => parseWatchlists("nope")).toThrow();
  });
});
