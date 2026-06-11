import { useEffect, useState } from "react";
import { modelSupportsVision } from "@/lib/ollama";

export function useModelVision(baseUrl: string, model: string) {
  const [supports, setSupports] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!model) {
      setSupports(false);
      return;
    }
    modelSupportsVision(baseUrl, model)
      .then((v) => {
        if (!cancelled) setSupports(v);
      })
      .catch(() => {
        if (!cancelled) setSupports(false);
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, model]);
  return supports;
}