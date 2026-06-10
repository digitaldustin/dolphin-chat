import { useEffect } from "react";
import { useSettings } from "./use-settings";

const THEMES = ["theme-slate", "theme-mocha", "theme-forest", "theme-plum"];

export function useApplyTheme() {
  const s = useSettings();
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    THEMES.forEach((t) => root.classList.remove(t));
    root.classList.add(`theme-${s.theme}`);

    let dark = s.appearance === "dark";
    if (s.appearance === "system") {
      dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    root.classList.toggle("dark", dark);
  }, [s.theme, s.appearance]);
}
