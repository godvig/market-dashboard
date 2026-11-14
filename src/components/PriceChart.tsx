import { CandlestickSeries, createChart, LineSeries, type IChartApi } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { smaSeries } from "../../shared/analysis";
import type { Candle } from "../../shared/types";

/** Changes whenever the light/dark theme does (system setting or the toggle), so the chart can redraw. */
function useThemeKey() {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const bump = () => setKey((k) => k + 1);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener("change", bump);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      media?.removeEventListener("change", bump);
      observer.disconnect();
    };
  }, []);
  return key;
}

export function PriceChart({ candles }: { candles: Candle[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const themeKey = useThemeKey();

  useEffect(() => {
    if (!ref.current) return;
    // Colours come from the CSS theme tokens.
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const up = v("--pos");
    const down = v("--neg");
    const chart: IChartApi = createChart(ref.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: v("--muted"), fontFamily: v("--font") },
      grid: { vertLines: { visible: false }, horzLines: { color: v("--border") } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    });

    chart
      .addSeries(CandlestickSeries, {
        upColor: up,
        downColor: down,
        wickUpColor: up,
        wickDownColor: down,
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
    overlay(50, v("--accent"));
    overlay(200, v("--brass"));

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, themeKey]);

  return <div ref={ref} className="chart" />;
}
