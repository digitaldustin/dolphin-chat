import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState } from "react";
import {
  loadSettings,
  saveSettings,
  type Settings,
} from "@/lib/storage";
import { listOllamaModels } from "@/lib/ollama";
import { toast } from "sonner";
import { RefreshCw, Check } from "lucide-react";

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
        <div className="mx-auto max-w-2xl px-8 py-10">
          <h1 className="font-serif text-3xl tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything is stored locally in your browser.
          </p>

          <Section title="Appearance">
            <Field label="Theme">
              <div className="flex flex-wrap gap-2">
                {(["slate", "mocha", "forest", "plum"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => update("theme", t)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs capitalize transition ${
                      s.theme === t
                        ? "border-ring bg-accent"
                        : "border-border hover:bg-accent/50"
                    }`}
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
            <Field label="Mode">
              <div className="flex gap-2">
                {(["light", "dark", "system"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => update("appearance", m)}
                    className={`rounded-md border px-3 py-1.5 text-xs capitalize ${
                      s.appearance === m
                        ? "border-ring bg-accent"
                        : "border-border hover:bg-accent/50"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </Field>
          </Section>

          <Section title="Ollama">
            <Field
              label="Base URL"
              hint="Run Ollama with OLLAMA_ORIGINS='*' so the browser can connect."
            >
              <div className="flex gap-2">
                <input
                  className="input"
                  value={s.ollamaBaseUrl}
                  onChange={(e) => update("ollamaBaseUrl", e.target.value)}
                  placeholder="http://localhost:11434"
                />
                <button
                  className="btn"
                  onClick={fetchModels}
                  disabled={loadingModels}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      loadingModels ? "animate-spin" : ""
                    }`}
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
              <select
                className="input"
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
            </Field>
            <Field label="System prompt">
              <textarea
                className="input min-h-24"
                value={s.systemPrompt}
                onChange={(e) => update("systemPrompt", e.target.value)}
              />
            </Field>
          </Section>

          <Section title="Web search (SearXNG)">
            <Field
              label="SearXNG URL"
              hint="An instance with JSON format enabled."
            >
              <div className="flex gap-2">
                <input
                  className="input"
                  value={s.searxngUrl}
                  onChange={(e) => update("searxngUrl", e.target.value)}
                  placeholder="https://your-searxng.example"
                />
                <button
                  className="btn"
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
                className="input w-24"
                type="number"
                min={1}
                max={20}
                value={s.webSearchResults}
                onChange={(e) =>
                  update("webSearchResults", Number(e.target.value))
                }
              />
            </Field>
          </Section>

          <Section title="Deep Research">
            <Field
              label="Use OpenCode agent"
              hint="When on, deep research is delegated to a local `opencode serve` process. When off, Dolphin runs an Ollama + SearXNG research loop."
            >
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={s.opencodeEnabled}
                  onChange={(e) => update("opencodeEnabled", e.target.checked)}
                />
                Enable OpenCode
              </label>
            </Field>
            <Field
              label="OpenCode server URL"
              hint="Start it with `opencode serve --port 4096`."
            >
              <div className="flex gap-2">
                <input
                  className="input"
                  value={s.opencodeUrl}
                  onChange={(e) => update("opencodeUrl", e.target.value)}
                  placeholder="http://localhost:4096"
                />
                <button
                  className="btn"
                  disabled={testing === "OpenCode"}
                  onClick={() => testEndpoint("OpenCode", s.opencodeUrl, "/app")}
                >
                  Test
                </button>
              </div>
            </Field>
            <Field
              label="Research depth (sub-queries)"
              hint="Used by the Ollama+SearXNG loop."
            >
              <input
                className="input w-24"
                type="number"
                min={1}
                max={5}
                value={s.researchDepth}
                onChange={(e) =>
                  update("researchDepth", Number(e.target.value))
                }
              />
            </Field>
          </Section>
        </div>

        <style>{`
          .input {
            width: 100%;
            border-radius: 0.5rem;
            border: 1px solid var(--border);
            background: var(--card);
            color: var(--foreground);
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
            outline: none;
            transition: border-color .15s;
          }
          .input:focus { border-color: var(--ring); }
          .btn {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            border-radius: 0.5rem;
            border: 1px solid var(--border);
            background: var(--card);
            padding: 0 0.85rem;
            font-size: 0.8rem;
            white-space: nowrap;
            transition: background .15s;
          }
          .btn:hover { background: var(--accent); }
          .btn:disabled { opacity: 0.5; }
        `}</style>
      </div>
    </AppLayout>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5">
        {children}
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
  children: React.ReactNode;
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
