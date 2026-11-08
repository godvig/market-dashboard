# Market Dashboard

A stock watchlist and analysis dashboard that pulls data from free market-data APIs. Add any tickers (Stockholm, US, Europe…), sort and filter the list by returns, risk and valuation metrics, and open a candlestick chart with moving averages for each one.

![Screenshot](docs/screenshot.png)

## Features

- **Sortable, filterable watchlist.** Price, day change, 1M/3M/1Y/YTD returns, volatility, max drawdown, distance from the 52-week high, price vs SMA200, RSI(14), P/E, dividend yield and market cap
- **Detail view.** Candlestick chart (6 mo – 5 y) with SMA50/SMA200 overlays, plus key stats
- **Ticker search** with autocomplete. The watchlist is saved in the browser
- **Pluggable data providers.** Choose Yahoo Finance, Finnhub, Financial Modeling Prep or offline mock data with one env variable
- **Quota-friendly.** A server-side cache (memory and disk) keeps you inside free-tier limits, and API keys never reach the browser
- **Analysis runs locally.** Every metric is computed from daily closes in `shared/analysis.ts`, which has unit tests

## Quick start

```bash
npm install
cp .env.example .env      # PROVIDER=yahoo works without a key
npm run dev               # web on http://localhost:5173, API on :8787
```

Run `npm run dev:mock` for offline demo data.

## Data providers

| `PROVIDER` | Key | Free limits (check provider docs) | Coverage | Notes |
|---|---|---|---|---|
| `yahoo` (default) | none | unofficial, no published limit | global incl. `.ST`, `.AS`, `.DE` | Uses [`yahoo-finance2`](https://github.com/gadicc/yahoo-finance2). Not an official API, so it can break or throttle |
| `finnhub` | `FINNHUB_API_KEY` | ~60 calls/min, personal use | mainly US | Quotes, profile and metrics. History falls back to Yahoo |
| `fmp` | `FMP_API_KEY` | 250 requests/day, EOD data | mainly US | Uses the `stable` API |
| `mock` | none | – | demo symbols | Deterministic random walks for development |

To add another source, implement `MarketProvider` in `server/providers/` and register it in `server/providers/index.ts`.

## Project layout

```
server/            Express API (proxy, cache, providers)
  providers/       yahoo · finnhub · fmp · mock adapters
shared/            Types + analysis functions (used by server and client)
src/               React client (Vite, TanStack Table, lightweight-charts)
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + Vite dev server with hot reload |
| `npm run dev:mock` | Same, with offline mock data |
| `npm test` | Unit tests for the analysis functions |
| `npm run typecheck` | TypeScript check |
| `npm run build && npm start` | Production build served by the API on :8787 |

## Notes on the metrics

- Returns use trading-day lookbacks: 21 for 1M, 63 for 3M, 126 for 6M and 252 for 1Y.
- Volatility is the annualised standard deviation of daily log returns over one year.
- Max drawdown is the largest peak-to-trough fall within the last year.
- Market cap is in the listing currency, so comparing across currencies is not meaningful.

## Roadmap ideas

- [ ] Currency conversion (everything in SEK) for comparable market caps
- [ ] Multiple named watchlists and CSV export
- [ ] Compare view: normalised performance of several tickers on one chart
- [ ] Screener: filter rules like "RSI < 30 and above SMA200"
- [ ] Fundamentals tab (revenue, margins, cash flow) from FMP
- [ ] Deploy (e.g. Fly.io / Render) with a public demo running in mock mode

---

Data from free sources may be delayed or inaccurate. This is not investment advice.
