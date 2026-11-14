import { useEffect, useState } from "react";

type Theme = "auto" | "light" | "dark";
const KEY = "market-screener.theme";
const NEXT: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };
const LABEL: Record<Theme, string> = { auto: "Theme: follows your system", light: "Theme: light", dark: "Theme: dark" };

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "auto";
  } catch {
    return "auto";
  }
}

/** Light, dark or follow the system. Per browser, so it lives in localStorage rather than the store. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(read);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.dataset.theme = theme;
    try {
      if (theme === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }, [theme]);

  return (
    <button className="theme-toggle" onClick={() => setTheme(NEXT[theme])} title={`${LABEL[theme]} (click to change)`} aria-label={LABEL[theme]}>
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
        {theme === "light" ? (
          <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none">
            <circle cx="10" cy="10" r="3.6" />
            <path d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" />
          </g>
        ) : theme === "dark" ? (
          <path d="M15.5 12.6A6.5 6.5 0 0 1 7.4 4.5a6.5 6.5 0 1 0 8.1 8.1z" fill="currentColor" />
        ) : (
          <g>
            <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor" />
          </g>
        )}
      </svg>
    </button>
  );
}
