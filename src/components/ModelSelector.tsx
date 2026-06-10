import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { listOllamaModels, type OllamaModel } from "@/lib/ollama";
import { cn } from "@/lib/utils";

export function ModelSelector({
  baseUrl,
  value,
  onChange,
}: {
  baseUrl: string;
  value: string;
  onChange: (model: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const m = await listOllamaModels(baseUrl);
      setModels(m);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load models");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && models.length === 0 && !loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[200px] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
      >
        <span className="truncate">{value || "Select model"}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>Ollama models</span>
            <button
              onClick={load}
              className="rounded p-1 hover:bg-accent"
              title="Refresh"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </button>
          </div>
          <div className="scroll-thin max-h-72 overflow-y-auto py-1">
            {loading && models.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                Loading…
              </div>
            )}
            {error && (
              <div className="px-3 py-3 text-xs text-destructive">
                {error}
                <div className="mt-1 text-muted-foreground">
                  Check Ollama URL in Settings.
                </div>
              </div>
            )}
            {!loading && !error && models.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No models found
              </div>
            )}
            {models.map((m) => (
              <button
                key={m.name}
                onClick={() => {
                  onChange(m.name);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-accent",
                  m.name === value && "bg-accent/60"
                )}
              >
                <span className="truncate">{m.name}</span>
                {m.name === value && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
