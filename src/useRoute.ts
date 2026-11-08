import { useCallback, useEffect, useState } from "react";

/**
 * Tiny hash router so the browser's back button works:
 *   #/list/<listId>                 → watchlist table
 *   #/list/<listId>/stock/<SYMBOL>  → stock view
 */
export interface Route {
  listId?: string;
  symbol?: string;
}

function parse(hash: string): Route {
  const m = hash.match(/^#\/list\/([^/]+)(?:\/stock\/(.+))?$/);
  return m ? { listId: decodeURIComponent(m[1]), symbol: m[2] ? decodeURIComponent(m[2]) : undefined } : {};
}

export function routeHash(listId: string, symbol?: string) {
  return `#/list/${encodeURIComponent(listId)}` + (symbol ? `/stock/${encodeURIComponent(symbol)}` : "");
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  /** Navigate; `replace` avoids adding a history entry (used for redirects). */
  const go = useCallback((listId: string, symbol?: string, replace = false) => {
    const hash = routeHash(listId, symbol);
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
