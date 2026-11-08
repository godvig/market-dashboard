// Pure analysis functions. Inputs are daily closes ordered oldest -> newest.
import type { Candle, Metrics } from "./types";

const TRADING_DAYS = 252;

/** Percent return over the last `days` trading days. */
export function periodReturn(closes: number[], days: number): number | null {
  if (closes.length <= days) return null;
  const start = closes[closes.length - 1 - days];
  const end = closes[closes.length - 1];
  if (!start) return null;
  return (end / start - 1) * 100;
}

/** Simple moving average of the last `period` values. */
export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

/** Full SMA series aligned with the input (null until enough data). */
export function smaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

/** Annualised volatility (stdev of daily log returns), percent. */
export function volatility(closes: number[], lookback = TRADING_DAYS): number | null {
  const slice = closes.slice(-(lookback + 1));
  if (slice.length < 20) return null;
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) rets.push(Math.log(slice[i] / slice[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS) * 100;
}

/** Largest peak-to-trough fall, percent (negative or 0). */
export function maxDrawdown(closes: number[], lookback = TRADING_DAYS): number | null {
  const slice = closes.slice(-lookback);
  if (slice.length < 2) return null;
  let peak = slice[0];
  let worst = 0;
  for (const c of slice) {
    if (c > peak) peak = c;
    const dd = (c / peak - 1) * 100;
    if (dd < worst) worst = dd;
  }
  return worst;
}

/** Wilder's RSI. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Year-to-date return using the last close of the previous year. */
export function ytdReturn(candles: Candle[]): number | null {
  if (candles.length < 2) return null;
  const last = candles[candles.length - 1];
  const year = last.time.slice(0, 4);
  let base: Candle | undefined;
  for (const c of candles) {
    if (c.time.slice(0, 4) < year) base = c;
    else break;
  }
  if (!base) return null;
  return (last.close / base.close - 1) * 100;
}

/**
 * Sharpe ratio over the last year: (annualised return − risk-free rate) /
 * annualised volatility. `riskFree` in percent, e.g. 2 = 2 %.
 */
export function sharpe(closes: number[], riskFree = 2, lookback = TRADING_DAYS): number | null {
  const slice = closes.slice(-(lookback + 1));
  if (slice.length < 60) return null;
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) rets.push(slice[i] / slice[i - 1] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1));
  if (sd === 0) return null;
  return (mean * TRADING_DAYS - riskFree / 100) / (sd * Math.sqrt(TRADING_DAYS));
}

export function computeMetrics(candles: Candle[], riskFree = 2): Metrics {
  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1];
  const s200 = sma(closes, 200);
  const yearHigh = closes.length ? Math.max(...closes.slice(-TRADING_DAYS)) : null;
  return {
    ret1m: periodReturn(closes, 21),
    ret3m: periodReturn(closes, 63),
    ret6m: periodReturn(closes, 126),
    ret1y: periodReturn(closes, TRADING_DAYS),
    retYtd: ytdReturn(candles),
    volatility: volatility(closes),
    maxDrawdown: maxDrawdown(closes),
    rsi14: rsi(closes),
    sma50: sma(closes, 50),
    sma200: s200,
    vsSma200: s200 && last ? (last / s200 - 1) * 100 : null,
    fromHigh: yearHigh && last ? (last / yearHigh - 1) * 100 : null,
    sharpe: sharpe(closes, riskFree),
  };
}

export const emptyMetrics: Metrics = {
  ret1m: null, ret3m: null, ret6m: null, ret1y: null, retYtd: null,
  volatility: null, maxDrawdown: null, rsi14: null, sma50: null,
  sma200: null, vsSma200: null, fromHigh: null, sharpe: null,
};
