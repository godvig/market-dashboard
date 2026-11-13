import { useCallback, useEffect, useState } from "react";

/**
 * Tiny hash router so the browser's back button works:
 *   #/list/<listId>                 → watchlist table
 *   #/list/<listId>/stock/<SYMBOL>  → stock view
 *   #/list/<listId>/scorecards/<id> → scorecard editor, previewed on that list
 */
export interface Route {
  listId?: string;
  symbol?: string;
  /** Set on the scorecard editor; "" = editor without a card picked. */
  scorecard?: string;
}

function parse(hash: string): Route {
  const m = hash.match(/^#\/list\/([^/]+)(?:\/stock\/(.+)|\/scorecards(?:\/(.+))?)?$/);
  if (!m) return {};
  const listId = decodeURIComponent(m[1]);
  if (m[2]) return { listId, symbol: decodeURIComponent(m[2]) };
  if (m[0].includes("/scorecards")) return { listId, scorecard: m[3] ? decodeURIComponent(m[3]) : "" };
  return { listId };
}

export function routeHash(listId: string, symbol?: string, scorecard?: string) {
  const base = `#/list/${encodeURIComponent(listId)}`;
  if (symbol) return `${base}/stock/${encodeURIComponent(symbol)}`;
  if (scorecard != null) return `${base}/scorecards` + (scorecard ? `/${encodeURIComponent(scorecard)}` : "");
  return base;
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  /** Navigate; `replace` avoids adding a history entry (used for redirects). */
  const go = useCallback((listId: string, symbol?: string, replace = false, scorecard?: string) => {
    const hash = routeHash(listId, symbol, scorecard);
    if (window.location.hash === hash) return;
    if (replace) {
      history.replaceState(null, "", hash);
      setRoute(parse(hash));
    } else {
      window.location.hash = hash;
    }
  }, []);

  return { route, go };
}
