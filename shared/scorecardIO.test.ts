import { describe, expect, it } from "vitest";
import type { MetricSource } from "./metrics";
import { score, SCORECARD_BY_ID } from "./scoring";
import {
  blankScorecard,
  CUSTOM_PREFIX,
  duplicateScorecard,
  isScorecardFile,
  parseScorecard,
  parseScorecards,
  toScorecardFile,
} from "./scorecardIO";

const valid = {
  id: "custom-abc",
  name: "  Compounders  ",
  description: "High returns, low debt",
  criteria: [
    {
      id: "r",
      label: "ROIC",
      metric: "roic",
      weight: 2,
      tiers: [{ gte: 15, points: 3 }, { gte: 8, points: 1, cliff: true }, { points: 0 }],
    },
  ],
};

describe("parseScorecard", () => {
  it("keeps a valid card and trims text", () => {
    const c = parseScorecard(valid);
    expect(c.id).toBe("custom-abc");
    expect(c.name).toBe("Compounders");
    expect(c.criteria[0]).toEqual({
      id: "r",
      label: "ROIC",
      metric: "roic",
      weight: 2,
      tiers: valid.criteria[0].tiers,
    });
  });

  it("gives preset or missing ids a custom id, so a file can never replace a built-in card", () => {
    expect(parseScorecard({ ...valid, id: "sundhet" }).id).toMatch(new RegExp(`^${CUSTOM_PREFIX}`));
    expect(parseScorecard({ ...valid, id: "sundhet" }).id).not.toBe("custom-sundhet");
    expect(parseScorecard({ ...valid, id: undefined }).id.startsWith(CUSTOM_PREFIX)).toBe(true);
    expect(parseScorecard({ ...valid, id: "mine" }).id).toBe("custom-mine");
  });

  it("rejects what can't be scored", () => {
    expect(() => parseScorecard({ ...valid, name: "" })).toThrow(/name/);
    expect(() => parseScorecard({ ...valid, criteria: [] })).toThrow(/criterion/);
    expect(() =>
      parseScorecard({
        ...valid,
        criteria: [{ metric: "nope", tiers: [{ points: 1 }] }],
      }),
    ).toThrow(/unknown metric/);
    expect(() => parseScorecard({ ...valid, criteria: [{ metric: "pe", tiers: [] }] })).toThrow(/tier/);
    expect(() =>
      parseScorecard({
        ...valid,
        criteria: [{ metric: "pe", tiers: [{ gte: 1 }] }],
      }),
    ).toThrow(/points/);
  });

  it("clamps weights and points and drops junk fields", () => {
    const c = parseScorecard({
      ...valid,
      criteria: [
        {
          metric: "pe",
          weight: 99,
          tiers: [{ lt: 15, gte: "x", points: 1e6, evil: "<script>" }],
        },
      ],
    });
    expect(c.criteria[0].weight).toBe(10);
    expect(c.criteria[0].tiers[0]).toEqual({ lt: 15, points: 100 });
    expect(c.criteria[0].label).toBe("P/E");
  });

  it("makes criterion ids unique", () => {
    const c = parseScorecard({
      ...valid,
      criteria: [valid.criteria[0], valid.criteria[0]],
    });
    expect(c.criteria.map((x) => x.id)).toEqual(["r", "r-2"]);
  });

  it("is idempotent", () => {
    const once = parseScorecard(valid);
    expect(parseScorecard(once)).toEqual(once);
  });
});

describe("scorecard files and copies", () => {
  it("round-trips through the export format", () => {
    const card = parseScorecard(valid);
    const file = JSON.parse(JSON.stringify(toScorecardFile(card)));
    expect(isScorecardFile(file)).toBe(true);
    expect(parseScorecard(file.scorecard)).toEqual(card);
    expect(isScorecardFile(valid)).toBe(false);
  });

  it("a duplicate of a preset scores exactly like the preset", () => {
    const preset = SCORECARD_BY_ID.get("sundhet")!;
    const copy = parseScorecard(duplicateScorecard(preset));
    expect(copy.id).not.toBe(preset.id);
    expect(copy.name).toBe("Sundhet (copy)");
    const src = {
      fundamentals: {
        roic: 12,
        netDebtEbitda: 1.5,
        fcfMargin: 8,
        payoutRatio: 40,
      },
      metrics: {},
    } as unknown as MetricSource;
    expect(score(copy, src).pct).toBe(score(preset, src).pct);
  });

  it("the blank starting card is valid", () => {
    expect(() => parseScorecard(blankScorecard())).not.toThrow();
  });

  it("parseScorecards skips broken cards and duplicate ids", () => {
    const list = parseScorecards([valid, { name: "" }, valid, { ...valid, id: "custom-2", name: "Two" }]);
    expect(list?.map((c) => c.id)).toEqual(["custom-abc", "custom-2"]);
    expect(parseScorecards("nope")).toBeUndefined();
    expect(parseScorecards([{ name: "" }])).toBeUndefined();
  });
});
