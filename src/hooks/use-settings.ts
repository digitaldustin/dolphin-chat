import { useEffect, useState } from "react";
import { loadSettings, type Settings } from "@/lib/storage";

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if (ce.detail) setSettings(ce.detail);
      else setSettings(loadSettings());
    };
    window.addEventListener("settings:changed", handler);
    return () => window.removeEventListener("settings:changed", handler);
  }, []);
  return settings;
}
