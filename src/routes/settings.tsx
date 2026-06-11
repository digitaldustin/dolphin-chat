import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState, type ReactNode } from "react";
import {
  loadSettings,
  saveSettings,
  type Settings,
} from "@/lib/storage";
import { listOllamaModels } from "@/lib/ollama";
import { toast } from "sonner";
import {
  Palette,
  Server,
  SlidersHorizontal,
  Globe,
  Sparkles,
  RefreshCw,
  Check,
  Sun,
  Moon,
  Monitor,
  Cpu,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · Dolphin" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const [s, setS] = useState<Settings>(loadSettings());
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const update = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    const next = { ...s, [k]: v };
    setS(next);
    saveSettings(next);
  };

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const list = await listOllamaModels(s.ollamaBaseUrl);
      setModels(list.map((m) => m.name));
      if (list.length && !list.find((m) => m.name === s.ollamaModel)) {
        update("ollamaModel", list[0].name);
      }
      toast.success(`Found ${list.length} model(s)`);
    } catch (e: any) {
      toast.error(
        `Could not reach Ollama. Make sure it's running and OLLAMA_ORIGINS allows this page.`
      );
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const testEndpoint = async (
    label: string,
    url: string,
    path: string
  ) => {
    if (!url) {
      toast.error(`No ${label} URL set`);
      return;
    }
    setTesting(label);
    try {
      const res = await fetch(url.replace(/\/$/, "") + path);
      if (res.ok) toast.success(`${label} OK`);
      else toast.error(`${label} returned ${res.status}`);
    } catch {
      toast.error(`Could not reach ${label}`);
    } finally {
      setTesting(null);
    }
  };

  return (
    <AppLayout>
      <div className="scroll-thin h-full overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-10 md:px-8">
          <div className="mb-8">
            <h1 className="font-serif text-3xl tracking-tight">Settings</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Everything is stored locally in your browser.
            </p>
          </div>

          <SettingsCard icon={<Palette className="h-4 w-4" />} title="Appearance">
            <Field label="Color theme">
              <div className="flex flex-wrap gap-2">
                {(["slate", "mocha", "forest", "plum"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => update("theme", t)}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs capitalize transition",
                      s.theme === t
                        ? "border-ring bg-accent"
                        : "border-border hover:bg-accent/50"
                    )}
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ background: themeSwatch(t) }}
                    />
                    {t}
                    {s.theme === t && <Check className="h-3 w-3" />}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Appearance mode">
              <div className="flex gap-2">
                {(
                  [
                    { key: "light", icon: <Sun className="h-3.5 w-3.5" /> },
                    { key: "dark", icon: <Moon className="h-3.5 w-3.5" /> },
                    { key: "system", icon: <Monitor className="h-3.5 w-3.5" /> },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.key}
                    onClick={() => update("appearance", m.key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs capitalize transition",
                      s.appearance === m.key
                        ? "border-ring bg-accent"
                        : "border-border hover:bg-accent/50"
                    )}
                  >
                    {m.icon}
                    {m.key}
                  </button>
                ))}
              </div>
            </Field>
          </SettingsCard>

          <SettingsCard icon={<Server className="h-4 w-4" />} title="Connection & Model">
            <Field
              label="Ollama base URL"
              hint="Run Ollama with OLLAMA_ORIGINS='*' so the browser can connect."
            >
              <div className="flex gap-2">
                <input
                  className="settings-input flex-1"
                  value={s.ollamaBaseUrl}
                  onChange={(e) => update("ollamaBaseUrl", e.target.value)}
                  placeholder="http://localhost:11434"
                />
                <button
                  className="settings-btn"
                  onClick={fetchModels}
                  disabled={loadingModels}
                >
                  <RefreshCw
                    className={cn("h-3.5 w-3.5", loadingModels && "animate-spin")}
                  />
                  Reload
                </button>
              </div>
            </Field>
            <Field
              label="Model"
              hint={
                models.length
                  ? undefined
                  : "Could not load models — check Ollama URL and click Reload."
              }
            >
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 shrink-0 text-muted-foreground" />
                <select
                  className="settings-input flex-1"
                  value={s.ollamaModel}
                  onChange={(e) => update("ollamaModel", e.target.value)}
                  disabled={!models.length}
                >
                  {!models.length && (
                    <option value={s.ollamaModel}>
                      {s.ollamaModel || "No models available"}
                    </option>
                  )}
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="System prompt">
              <textarea
                className="settings-input min-h-[120px] resize-y"
                value={s.systemPrompt}
                onChange={(e) => update("systemPrompt", e.target.value)}
                placeholder="You are a helpful assistant…"
              />
            </Field>
          </SettingsCard>

          <SettingsCard icon={<SlidersHorizontal className="h-4 w-4" />} title="Generation">
            <Field label="Temperature" hint="Lower is more focused and deterministic. Higher is more creative.">
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={s.temperature}
                  onChange={(e) => update("temperature", Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="w-12 text-right text-sm font-mono text-muted-foreground">
                  {s.temperature.toFixed(1)}
                </span>
              </div>
            </Field>
            <Field label="Max tokens" hint="Maximum number of tokens to generate.">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="number"
                  min={1}
                  max={128000}
                  step={1}
                  value={s.maxTokens}
                  onChange={(e) => update("maxTokens", Number(e.target.value))}
                  className="settings-input w-32"
                />
              </div>
            </Field>
          </SettingsCard>

          <SettingsCard icon={<Globe className="h-4 w-4" />} title="Web Search">
            <Field
              label="SearXNG URL"
              hint="An instance with JSON format enabled."
            >
              <div className="flex gap-2">
                <input
                  className="settings-input flex-1"
                  value={s.searxngUrl}
                  onChange={(e) => update("searxngUrl", e.target.value)}
                  placeholder="https://your-searxng.example"
                />
                <button
                  className="settings-btn"
                  disabled={testing === "SearXNG"}
                  onClick={() =>
                    testEndpoint("SearXNG", s.searxngUrl, "/search?q=test&format=json")
                  }
                >
                  Test
                </button>
              </div>
            </Field>
            <Field label="Results per query">
              <input
                className="settings-input w-24"
                type="number"
                min={1}
                max={20}
                value={s.webSearchResults}
                onChange={(e) =>
                  update("webSearchResults", Number(e.target.value))
                }
              />
            </Field>
          </SettingsCard>

          <SettingsCard icon={<Sparkles className="h-4 w-4" />} title="Deep Research">
            <Field
              label="OpenCode agent"
              hint="When on, deep research is delegated to a local `opencode serve` process. When off, Dolphin runs an Ollama + SearXNG research loop."
            >
              <label className="inline-flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 transition hover:bg-accent/40">
                <input
                  type="checkbox"
                  checked={s.opencodeEnabled}
                  onChange={(e) => update("opencodeEnabled", e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm">Enable OpenCode</span>
              </label>
            </Field>
            <Field
              label="Research depth"
              hint="Number of sub-queries used by the Ollama + SearXNG loop."
            >
              <input
                className="settings-input w-24"
                type="number"
                min={1}
                max={5}
                value={s.researchDepth}
                onChange={(e) =>
                  update("researchDepth", Number(e.target.value))
                }
              />
            </Field>
          </SettingsCard>

          <div className="pb-10" />
        </div>

        <style>{`
          .settings-input {
            width: 100%;
            border-radius: 0.625rem;
            border: 1px solid var(--border);
            background: var(--card);
            color: var(--foreground);
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
            outline: none;
            transition: border-color .15s, box-shadow .15s;
          }
          .settings-input:focus {
            border-color: var(--ring);
            box-shadow: 0 0 0 1px var(--ring);
          }
          .settings-input:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          .settings-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            border-radius: 0.625rem;
            border: 1px solid var(--border);
            background: var(--card);
            padding: 0 0.85rem;
            font-size: 0.8rem;
            white-space: nowrap;
            transition: background .15s;
          }
          .settings-btn:hover { background: var(--accent); }
          .settings-btn:disabled { opacity: 0.5; cursor: not-allowed; }
          input[type="range"].accent-primary {
            -webkit-appearance: none;
            appearance: none;
            height: 4px;
            border-radius: 2px;
            background: var(--border);
            outline: none;
          }
          input[type="range"].accent-primary::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: var(--primary);
            cursor: pointer;
            border: 2px solid var(--background);
            box-shadow: 0 0 0 1px var(--border);
          }
          input[type="range"].accent-primary::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: var(--primary);
            cursor: pointer;
            border: 2px solid var(--background);
            box-shadow: 0 0 0 1px var(--border);
          }
        `}</style>
      </div>
    </AppLayout>
  );
}

function SettingsCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-foreground">
          {icon}
        </span>
        {title}
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-5">{children}</div>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      {children}
      {hint && (
        <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function themeSwatch(t: string) {
  switch (t) {
    case "mocha":
      return "oklch(0.4 0.08 50)";
    case "forest":
      return "oklch(0.45 0.1 155)";
    case "plum":
      return "oklch(0.42 0.13 315)";
    default:
      return "oklch(0.22 0.03 260)";
  }
}
