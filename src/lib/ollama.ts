import type { Message } from "./storage";
import { searxngSearch, type SearchResult } from "./searxng";
import type { Citation } from "./storage";

export interface OllamaModel {
  name: string;
  size?: number;
  modified_at?: string;
}

export async function listOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`);
  if (!res.ok) throw new Error(`Ollama /api/tags failed: ${res.status}`);
  const data = await res.json();
  return (data.models ?? []) as OllamaModel[];
}

const VISION_NAME_RE =
  /(llava|bakllava|moondream|vision|-vl\b|vl-|qwen2\.5vl|qwen2-vl|qwen3-vl|minicpm-v|gemma3|llama3\.2-vision|pixtral|cogvlm|internvl|granite.*vision)/i;

const _capCache = new Map<string, string[]>();
export async function getModelCapabilities(
  baseUrl: string,
  model: string
): Promise<string[]> {
  const key = `${baseUrl}::${model}`;
  if (_capCache.has(key)) return _capCache.get(key)!;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (res.ok) {
      const data = await res.json();
      const caps: string[] = Array.isArray(data?.capabilities)
        ? data.capabilities
        : [];
      _capCache.set(key, caps);
      return caps;
    }
  } catch {
    /* ignore */
  }
  const caps = VISION_NAME_RE.test(model) ? ["vision"] : [];
  _capCache.set(key, caps);
  return caps;
}

export async function modelSupportsVision(
  baseUrl: string,
  model: string
): Promise<boolean> {
  if (VISION_NAME_RE.test(model)) return true;
  const caps = await getModelCapabilities(baseUrl, model);
  return caps.includes("vision");
}

export interface StreamOptions {
  baseUrl: string;
  model: string;
  messages: { role: string; content: string }[];
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  onDone?: () => void;
}

export async function streamChat(opts: StreamOptions): Promise<string> {
  const res = await fetch(
    `${opts.baseUrl.replace(/\/$/, "")}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: true,
      }),
      signal: opts.signal,
    }
  );
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(`Ollama chat failed: ${res.status} ${t}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const s = line.trim();
      if (!s) continue;
      try {
        const obj = JSON.parse(s);
        const delta = obj?.message?.content ?? "";
        if (delta) {
          full += delta;
          opts.onDelta(delta);
        }
        if (obj?.done) opts.onDone?.();
      } catch {
        /* ignore */
      }
    }
  }
  return full;
}

// ---- Tool-calling chat (web_search) ----

export interface ToolCallOptions {
  baseUrl: string;
  model: string;
  messages: any[];
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  onToolStart?: (name: string, args: any) => void;
  onToolResult?: (name: string, results: SearchResult[]) => void;
  searxngUrl?: string;
  webSearchResults?: number;
  maxSteps?: number;
}

const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the live web for up-to-date information. Use this whenever the user asks about current events, recent data, prices, news, or anything that may have changed after your training cutoff.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
};

/**
 * Stream a chat completion that can invoke the web_search tool.
 * Loops: call /api/chat (non-streaming) to detect tool calls. If none, do a
 * streaming call for the final answer. If tool calls present, execute and feed back.
 */
export async function streamChatWithTools(opts: ToolCallOptions): Promise<{
  text: string;
  citations: Citation[];
}> {
  const tools = opts.searxngUrl ? [WEB_SEARCH_TOOL] : undefined;
  const messages = [...opts.messages];
  const citations: Citation[] = [];
  const maxSteps = opts.maxSteps ?? 4;

  for (let step = 0; step < maxSteps; step++) {
    // Probe (non-streaming) so we can read tool_calls reliably.
    const probe = await fetch(
      `${opts.baseUrl.replace(/\/$/, "")}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: opts.signal,
        body: JSON.stringify({
          model: opts.model,
          messages,
          stream: false,
          tools,
        }),
      }
    );
    if (!probe.ok) {
      const t = await probe.text().catch(() => "");
      throw new Error(`Ollama chat failed: ${probe.status} ${t}`);
    }
    const data = await probe.json();
    const msg = data?.message ?? {};
    const toolCalls: any[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

    if (toolCalls.length === 0) {
      // Final answer — re-issue as a streaming call for nice UX.
      const full = await streamChat({
        baseUrl: opts.baseUrl,
        model: opts.model,
        messages,
        signal: opts.signal,
        onDelta: opts.onDelta,
      });
      // If streaming returned empty (some models don't replay), fall back to probe content.
      const finalText = full || String(msg.content ?? "");
      if (!full && finalText) opts.onDelta(finalText);
      return { text: finalText, citations };
    }

    // Record assistant message that requested the tools.
    messages.push({
      role: "assistant",
      content: msg.content ?? "",
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const fn = call?.function ?? {};
      const name = String(fn.name ?? "");
      let args: any = fn.arguments ?? {};
      if (typeof args === "string") {
        try {
          args = JSON.parse(args);
        } catch {
          args = { query: args };
        }
      }
      if (name === "web_search" && opts.searxngUrl) {
        const query = String(args.query ?? "");
        opts.onToolStart?.(name, { query });
        try {
          const results = await searxngSearch(
            opts.searxngUrl,
            query,
            opts.webSearchResults ?? 5
          );
          opts.onToolResult?.(name, results);
          for (const r of results) {
            if (!citations.find((c) => c.url === r.url)) citations.push(r);
          }
          const ctx = results
            .map(
              (r, i) =>
                `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet ?? ""}`
            )
            .join("\n\n");
          messages.push({
            role: "tool",
            content: ctx || "No results.",
            name,
          });
        } catch (e: any) {
          messages.push({
            role: "tool",
            content: `Search failed: ${e?.message ?? "unknown error"}`,
            name,
          });
        }
      } else {
        messages.push({
          role: "tool",
          content: `Tool ${name} not available.`,
          name,
        });
      }
    }
  }

  return { text: "", citations };
}

export function toApiMessages(messages: Message[], systemPrompt?: string) {
  const out: { role: string; content: string }[] = [];
  if (systemPrompt) out.push({ role: "system", content: systemPrompt });
  for (const m of messages) {
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

export async function generateTitle(
  baseUrl: string,
  model: string,
  firstUserMessage: string
): Promise<string> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "Return a 3-6 word title (no quotes, no punctuation at end) for this user message.",
          },
          { role: "user", content: firstUserMessage.slice(0, 500) },
        ],
      }),
    });
    if (!res.ok) return firstUserMessage.slice(0, 40);
    const data = await res.json();
    const title = String(data?.message?.content ?? "")
      .replace(/^["'\s]+|["'\s]+$/g, "")
      .split("\n")[0]
      .slice(0, 60);
    return title || firstUserMessage.slice(0, 40);
  } catch {
    return firstUserMessage.slice(0, 40);
  }
}
