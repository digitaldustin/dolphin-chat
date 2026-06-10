import type { Message } from "./storage";

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
