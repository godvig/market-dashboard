import { CandlestickSeries, createChart, LineSeries, type IChartApi } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { smaSeries } from "../../shared/analysis";
import type { Candle } from "../../shared/types";

export function PriceChart({ candles }: { candles: Candle[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const chart: IChartApi = createChart(ref.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: dark ? "#c9cdd4" : "#333" },
      grid: { vertLines: { visible: false }, horzLines: { color: dark ? "#2a2e36" : "#eee" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    });

    chart
      .addSeries(CandlestickSeries, {
        upColor: "#1a9c5b",
        downColor: "#d64545",
        wickUpColor: "#1a9c5b",
        wickDownColor: "#d64545",
        borderVisible: false,
      })
      .setData(candles);

    const closes = candles.map((c) => c.close);
    const overlay = (period: number, color: string) => {
      const s = smaSeries(closes, period);
      chart
        .addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: `SMA${period}` })
        .setData(candles.flatMap((c, i) => (s[i] == null ? [] : [{ time: c.time, value: s[i]! }])));
    };
    overlay(50, "#3b82f6");
    overlay(200, "#f59e0b");

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles]);

  return <div ref={ref} className="chart" />;
}
