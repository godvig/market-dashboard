import { describe, expect, it } from "vitest";
import { DEFAULT_COLUMNS, insertColumn, moveColumn, visibleColumns } from "./columns";

describe("column order", () => {
  it("keeps the saved order instead of the registry order", () => {
    expect(visibleColumns(["pe", "price", "ret1y"]).map((c) => c.id)).toEqual(["pe", "price", "ret1y"]);
  });

  it("falls back to the defaults and ignores unknown or duplicate ids", () => {
    expect(visibleColumns(undefined).map((c) => c.id)).toEqual(DEFAULT_COLUMNS);
    expect(visibleColumns(["price", "nope", "price", "vol"]).map((c) => c.id)).toEqual(["price", "volatility"]);
  });

  it("moves a column before or after another", () => {
    const order = ["price", "day", "pe", "roe"];
    expect(moveColumn(order, "roe", "day", false)).toEqual(["price", "roe", "day", "pe"]);
    expect(moveColumn(order, "price", "pe", true)).toEqual(["day", "pe", "price", "roe"]);
    expect(moveColumn(order, "pe", null, false)).toEqual(["pe", "price", "day", "roe"]); // dropped on the locked columns
    expect(moveColumn(order, "pe", "pe", true)).toEqual(order);
  });

  it("adds a new column after its nearest registry neighbour, wherever that was dragged", () => {
    expect(insertColumn(["pe", "price", "ret1y"], "day")).toEqual(["pe", "price", "day", "ret1y"]);
    expect(insertColumn(["pe"], "price")).toEqual(["price", "pe"]);
    expect(insertColumn(["pe", "price"], "pe")).toEqual(["pe", "price"]);
  });
});
