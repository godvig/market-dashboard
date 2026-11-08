const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const fmtNum = (v: number | null | undefined, digits = 2) =>
  isNum(v) ? v.toLocaleString("sv-SE", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "–";

export const fmtPct = (v: number | null | undefined, digits = 1) =>
  isNum(v) ? `${v > 0 ? "+" : ""}${fmtNum(v, digits)} %` : "–";

export const fmtBig = (v: number | null | undefined) => {
  if (!isNum(v)) return "–";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${fmtNum(v / 1e12, 2)} T`;
  if (abs >= 1e9) return `${fmtNum(v / 1e9, 1)} B`;
  if (abs >= 1e6) return `${fmtNum(v / 1e6, 1)} M`;
  return v.toLocaleString("sv-SE");
};

/** Converts an amount with the row's exchange rate; null if not possible. */
export const toBase = (v: number | null | undefined, fx: number | null | undefined) =>
  isNum(v) && isNum(fx) ? v * fx : null;

/** True when the original currency already is the base currency. */
export const sameCurrency = (currency: string, base: string) => currency.toUpperCase() === base.toUpperCase();

export const tone =(v: number | null | undefined) => (!isNum(v) || v === 0 ? "" : v > 0 ? "pos" : "neg");
