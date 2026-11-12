// Labels for investment types that were renamed, so saved data and old import files keep working.
const RENAMED: [RegExp, string][] = [[/^nostalgi$/i, "Nostalgic horse"]];

export function normaliseInvestmentType(type: string): string {
  const t = type.trim();
  return RENAMED.find(([re]) => re.test(t))?.[1] ?? t;
}
