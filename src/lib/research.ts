import { searxngSearch, formatSearchContext, type SearchResult } from "./searxng";
import { streamChat } from "./ollama";
import type { Settings, Citation } from "./storage";

export interface ResearchProgress {
  phase: "planning" | "searching" | "synthesizing" | "opencode" | "done";
  message: string;
  step?: number;
  total?: number;
}

interface RunOpts {
  query: string;
  settings: Settings;
  signal?: AbortSignal;
  onProgress: (p: ResearchProgress) => void;
  onDelta?: (s: string) => void;
}

/** OpenCode path: spawns a fresh `opencode serve` per request, uses the
 *  currently selected Ollama model, then tears it down. */
async function runOpenCodeResearch(opts: RunOpts): Promise<{
  content: string;
  citations: Citation[];
}> {
  const { settings, query, signal, onProgress, onDelta } = opts;

  onProgress({ phase: "opencode", message: "Spinning up OpenCode instance…" });
  const startRes = await fetch("/api/opencode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      action: "start",
      ollamaBaseUrl: settings.ollamaBaseUrl,
    }),
  });
  if (!startRes.ok) {
    const t = await startRes.text().catch(() => "");
    throw new Error(`Could not start OpenCode: ${t || startRes.status}`);
  }
  const { id: instanceId, url: base } = (await startRes.json()) as {
    id: string;
    url: string;
  };

  const stop = async () => {
    try {
      await fetch("/api/opencode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", id: instanceId }),
        keepalive: true,
      });
    } catch {
      /* ignore */
    }
  };

  try {
    onProgress({
      phase: "opencode",
      message: `Sending task to OpenCode (${settings.ollamaModel})…`,
    });

    // Create a session.
    const sessRes = await fetch(`${base}/session`, { method: "POST", signal });
    if (!sessRes.ok) throw new Error(`OpenCode /session ${sessRes.status}`);
    const session = await sessRes.json();
    const sessionId: string = session.id ?? session.session?.id;
    if (!sessionId) throw new Error("OpenCode: no session id returned");

    // Send the research prompt using the currently selected Ollama model.
    const msgRes = await fetch(`${base}/session/${sessionId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        providerID: "ollama",
        modelID: settings.ollamaModel,
        parts: [{ type: "text", text: buildResearchPrompt(query) }],
      }),
    });
    if (!msgRes.ok) {
      const t = await msgRes.text().catch(() => "");
      throw new Error(`OpenCode message failed: ${msgRes.status} ${t}`);
    }
    const reply = await msgRes.json();
    const text = extractOpenCodeText(reply);
    onDelta?.(text);
    return { content: text, citations: [] };
  } finally {
    void stop();
  }
}

function buildResearchPrompt(q: string) {
  return `You are a deep research agent. Investigate the following question, browse the web as needed, and produce a well-cited markdown report with sections, key findings, and a sources list.

Question: ${q}`;
}

function extractOpenCodeText(reply: any): string {
  if (!reply) return "";
  if (typeof reply === "string") return reply;
  const parts = reply.parts ?? reply.message?.parts ?? [];
  if (Array.isArray(parts)) {
    return parts
      .map((p: any) => (p?.type === "text" ? p.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return reply.text ?? reply.content ?? JSON.stringify(reply);
}

/** Native Ollama + SearXNG iterative research loop. */
async function runOllamaResearch(opts: RunOpts): Promise<{
  content: string;
  citations: Citation[];
}> {
  const { query, settings, signal, onProgress, onDelta } = opts;
  const depth = Math.max(1, Math.min(5, settings.researchDepth));

  // 1. Plan: generate sub-queries
  onProgress({ phase: "planning", message: "Planning research questions…" });
  const planText = await collectText(
    streamChat({
      baseUrl: settings.ollamaBaseUrl,
      model: settings.ollamaModel,
      signal,
      messages: [
        {
          role: "system",
          content:
            "You generate web search queries. Output ONLY a JSON array of strings, no prose.",
        },
        {
          role: "user",
          content: `Break the following research question into ${depth} distinct, complementary web search queries:\n\n${query}`,
        },
      ],
      onDelta: () => {},
    })
  );
  let subqueries: string[] = [];
  try {
    const match = planText.match(/\[[\s\S]*\]/);
    if (match) subqueries = JSON.parse(match[0]);
  } catch {
    /* fall back */
  }
  if (!subqueries.length) subqueries = [query];
  subqueries = subqueries.slice(0, depth);

  // 2. Search each
  const allResults: SearchResult[] = [];
  for (let i = 0; i < subqueries.length; i++) {
    if (signal?.aborted) throw new Error("aborted");
    onProgress({
      phase: "searching",
      message: `Searching: ${subqueries[i]}`,
      step: i + 1,
      total: subqueries.length,
    });
    try {
      const r = await searxngSearch(
        settings.searxngUrl,
        subqueries[i],
        settings.webSearchResults
      );
      allResults.push(...r);
    } catch (e) {
      console.error("Search error", e);
    }
  }

  // Dedupe by url
  const seen = new Set<string>();
  const deduped = allResults.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  // 3. Synthesize
  onProgress({
    phase: "synthesizing",
    message: "Synthesizing a report from sources…",
  });
  const context = formatSearchContext(deduped);
  let full = "";
  await streamChat({
    baseUrl: settings.ollamaBaseUrl,
    model: settings.ollamaModel,
    signal,
    messages: [
      {
        role: "system",
        content: `You are a careful research analyst. Write a comprehensive markdown report. Use the sources below. Cite inline as [n] referring to source numbers. End with a "## Sources" section listing each used source as a numbered link.`,
      },
      {
        role: "user",
        content: `Research question:\n${query}\n\nSources:\n${context}\n\nWrite the report now.`,
      },
    ],
    onDelta: (d) => {
      full += d;
      onDelta?.(d);
    },
  });

  return { content: full, citations: deduped };
}

export async function runDeepResearch(opts: RunOpts) {
  const result = opts.settings.opencodeEnabled
    ? await runOpenCodeResearch(opts)
    : await runOllamaResearch(opts);
  opts.onProgress({ phase: "done", message: "Done" });
  return result;
}

async function collectText(p: Promise<string>): Promise<string> {
  return p;
}
