"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "dah_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The blocking <head> script (app/layout.tsx) already set the correct
  // data-theme attribute before this ever renders, so read it straight back
  // rather than re-deriving it — that would risk a brief render where React
  // thinks the theme is "light" before a later effect corrects it.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark") {
      return "dark";
    }
    return "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
