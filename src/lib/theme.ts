import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const THEME_KEY = "album-rank-theme";

const getSystemTheme = (): Theme => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem(THEME_KEY) as Theme | null;
    return stored ?? getSystemTheme();
  });

  useEffect(() => {
    const apply = (t: Theme) => {
      document.documentElement.setAttribute("data-theme", t);
    };
    apply(theme);
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => {
      const stored = window.localStorage.getItem(THEME_KEY);
      if (!stored) {
        setTheme(e.matches ? "dark" : "light");
      }
    };
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  const toggleTheme = () => setTheme((prev) => (prev === "light" ? "dark" : "light"));

  return { theme, toggleTheme };
};
