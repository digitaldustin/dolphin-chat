import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowUp,
  Sparkles,
  MessageSquare,
  Square,
  Loader2,
  ExternalLink,
  FileText,
  Paperclip,
  X,
  Image as ImageIcon,
  Search,
} from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { useModelVision } from "@/hooks/use-model-vision";
import {
  type Chat,
  type Message,
  type ChatMode,
  type Attachment,
  getChat,
  saveChat,
  saveFile,
  saveSettings,
  loadSettings,
  newId,
  saveReport,
} from "@/lib/storage";
import { streamChat, streamChatWithTools, toApiMessages, generateTitle } from "@/lib/ollama";
import { runDeepResearch, type ResearchProgress } from "@/lib/research";
import { Markdown } from "./Markdown";
import { ModelSelector } from "./ModelSelector";
import { emitChatsChanged } from "./AppLayout";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB text
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB image

const TEXT_EXT_RE =
  /\.(txt|md|markdown|json|jsonl|ya?ml|toml|csv|tsv|log|xml|html?|css|scss|sass|less|js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|kts|c|h|cc|cpp|hpp|cs|php|swift|sh|bash|zsh|fish|sql|env|ini|cfg|conf|properties|gradle|dockerfile|gitignore|prettierrc|eslintrc|lock)$/i;

function isLikelyTextFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/") || t.startsWith("video/") || t.startsWith("audio/"))
    return false;
  if (t.startsWith("text/")) return true;
  if (
    t === "application/json" ||
    t === "application/xml" ||
    t === "application/x-yaml" ||
    t === "application/javascript" ||
    t === "application/typescript" ||
    t === "application/x-sh"
  )
    return true;
  if (!t) return TEXT_EXT_RE.test(file.name);
  return TEXT_EXT_RE.test(file.name);
}

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface PendingImage {
  id: string;
  name: string;
  dataUrl: string;
  base64: string;
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function formatAttachmentsForPrompt(atts: Attachment[]): string {
  if (!atts.length) return "";
  return (
    "\n\n--- Attached files ---\n" +
    atts
      .map(
        (a) =>
          `\n### ${a.name}\n\`\`\`\n${a.content.slice(0, 20000)}\n\`\`\``
      )
      .join("\n")
  );
}


export function ChatView({ chatId }: { chatId: string }) {
  const settings = useSettings();
  const visionSupported = useModelVision(
    settings.ollamaBaseUrl,
    settings.ollamaModel
  );
  const navigate = useNavigate();
  const [chat, setChat] = useState<Chat | null>(null);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("chat");
  const [streaming, setStreaming] = useState(false);
  const [progress, setProgress] = useState<ResearchProgress | null>(null);
  const [pendingAtts, setPendingAtts] = useState<Attachment[]>([]);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [webSearchOn, setWebSearchOn] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const added: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} is too large (max 2MB)`);
        continue;
      }
      if (!isLikelyTextFile(file)) {
        toast.error(
          `${file.name} is not a text file. Use the image button for images.`
        );
        continue;
      }
      try {
        const content = await readFileAsText(file);
        const att: Attachment = {
          id: newId(),
          name: file.name,
          type: file.type || "text/plain",
          size: file.size,
          content,
        };
        added.push(att);
        // also save to library
        await saveFile({
          id: att.id,
          name: att.name,
          size: att.size,
          type: att.type,
          content: att.content,
          createdAt: Date.now(),
        });
      } catch {
        toast.error(`Could not read ${file.name}`);
      }
    }
    if (added.length) setPendingAtts((p) => [...p, ...added]);
  };

  const removeAtt = (id: string) =>
    setPendingAtts((p) => p.filter((a) => a.id !== id));

  const handleImages = async (files: FileList | null) => {
    if (!files || !files.length) return;
    if (!visionSupported) {
      toast.error("Current model does not support image input");
      return;
    }
    const added: PendingImage[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name} is too large (max 8MB)`);
        continue;
      }
      try {
        const base64 = await readFileAsBase64(file);
        added.push({
          id: newId(),
          name: file.name,
          dataUrl: `data:${file.type};base64,${base64}`,
          base64,
        });
      } catch {
        toast.error(`Could not read ${file.name}`);
      }
    }
    if (added.length) setPendingImages((p) => [...p, ...added]);
  };

  const removeImage = (id: string) =>
    setPendingImages((p) => p.filter((i) => i.id !== id));

  const setModel = (model: string) => {
    const next = { ...loadSettings(), ollamaModel: model };
    saveSettings(next);
  };


  // Load or init chat
  useEffect(() => {
    let mounted = true;
    (async () => {
      const existing = await getChat(chatId);
      if (!mounted) return;
      if (existing) setChat(existing);
      else
        setChat({
          id: chatId,
          title: "",
          model: settings.ollamaModel,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
    })();
    return () => {
      mounted = false;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat?.messages.length, streaming]);

  const hasMessages = !!chat?.messages.length;

  const persist = async (next: Chat) => {
    next.updatedAt = Date.now();
    await saveChat(next);
    emitChatsChanged();
  };

  const send = async () => {
    if (
      !chat ||
      (!input.trim() && pendingAtts.length === 0 && pendingImages.length === 0) ||
      streaming
    )
      return;
    const text = input.trim();
    const atts = pendingAtts;
    const imgs = pendingImages;
    setInput("");
    setPendingAtts([]);
    setPendingImages([]);

    const attBlock = formatAttachmentsForPrompt(atts);
    const promptText = text + attBlock;

    const userMsg: Message = {
      id: newId(),
      role: "user",
      content: text || "(see attachments)",
      mode,
      attachments: atts.length ? atts : undefined,
      images: imgs.length ? imgs.map((i) => i.base64) : undefined,
      createdAt: Date.now(),
    };
    const asstMsg: Message = {
      id: newId(),
      role: "assistant",
      content: "",
      mode,
      createdAt: Date.now(),
    };
    const isFirst = chat.messages.length === 0;
    const next: Chat = {
      ...chat,
      messages: [...chat.messages, userMsg, asstMsg],
      model: settings.ollamaModel,
    };
    setChat(next);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const updateAssistant = (patch: Partial<Message>) => {
      setChat((c) => {
        if (!c) return c;
        const msgs = c.messages.map((m) =>
          m.id === asstMsg.id ? { ...m, ...patch } : m
        );
        return { ...c, messages: msgs };
      });
    };
    const appendDelta = (d: string) => {
      setChat((c) => {
        if (!c) return c;
        const msgs = c.messages.map((m) =>
          m.id === asstMsg.id ? { ...m, content: m.content + d } : m
        );
        return { ...c, messages: msgs };
      });
    };

    try {
      if (mode === "research") {
        setProgress({ phase: "planning", message: "Starting…" });
        const result = await runDeepResearch({
          query: text,
          settings,
          signal: ctrl.signal,
          onProgress: (p) => setProgress(p),
          onDelta: (d) => appendDelta(d),
        });
        updateAssistant({ citations: result.citations });
        // Save report to library
        const report = {
          id: newId(),
          title: text.slice(0, 80),
          query: text,
          content: result.content,
          citations: result.citations,
          model: settings.ollamaModel,
          createdAt: Date.now(),
        };
        await saveReport(report);
      } else {
        const useWeb = webSearchOn && !!settings.searxngUrl;
        const sys = useWeb
          ? `${settings.systemPrompt}\n\nYou have a web_search(query) tool. Call it whenever the user asks about recent events, news, prices, live data, or anything you may not know. Cite sources using [n] referring to the numbered results returned by the tool.`
          : settings.systemPrompt;
        const history = toApiMessages(chat.messages, sys);
        history.push({
          role: "user",
          content: promptText,
          ...(imgs.length ? { images: imgs.map((i) => i.base64) } : {}),
        });
        const result = await streamChatWithTools({
          baseUrl: settings.ollamaBaseUrl,
          model: settings.ollamaModel,
          messages: history,
          signal: ctrl.signal,
          onDelta: appendDelta,
          searxngUrl: useWeb ? settings.searxngUrl : undefined,
          webSearchResults: settings.webSearchResults,
          onToolStart: (_n, args) =>
            setProgress({
              phase: "searching",
              message: `Searching the web for "${args.query}"…`,
            }),
          onToolResult: (_n, results) => {
            setChat((c) => {
              if (!c) return c;
              const msgs = c.messages.map((m) => {
                if (m.id !== asstMsg.id) return m;
                const prev = m.citations ?? [];
                const merged = [...prev];
                for (const r of results) {
                  if (!merged.find((x) => x.url === r.url)) merged.push(r);
                }
                return { ...m, citations: merged };
              });
              return { ...c, messages: msgs };
            });
            setProgress({ phase: "synthesizing", message: "Reading sources…" });
          },
        });
        if (result.citations.length) updateAssistant({ citations: result.citations });
      }

      // Persist & title
      setChat((c) => {
        if (!c) return c;
        const finalChat = { ...c };
        persist(finalChat);
        if (isFirst) {
          generateTitle(
            settings.ollamaBaseUrl,
            settings.ollamaModel,
            text
          ).then((t) => {
            setChat((cur) => {
              if (!cur) return cur;
              const updated = { ...cur, title: t };
              persist(updated);
              return updated;
            });
          });
        }
        return finalChat;
      });
    } catch (e: any) {
      if (e?.name === "AbortError") {
        toast.info("Stopped");
      } else {
        toast.error(e?.message ?? "Something went wrong");
        updateAssistant({
          content: `**Error:** ${e?.message ?? "Unknown error"}`,
        });
      }
    } finally {
      setStreaming(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center border-b border-border px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {chat?.title || "New chat"}
          </span>
        </div>
      </header>

      <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto">
        {!hasMessages ? (
          <EmptyHero />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-8">
            {chat!.messages.map((m) => (
              <MessageBlock key={m.id} message={m} />
            ))}
            {progress && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {progress.message}
                {progress.step && progress.total
                  ? ` (${progress.step}/${progress.total})`
                  : ""}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-background">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <div
            className="rounded-2xl border border-border bg-card shadow-sm transition focus-within:border-ring/60"
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            const images = files.filter((f) => f.type.startsWith("image/"));
            const others = files.filter((f) => !f.type.startsWith("image/"));
            if (images.length) {
              const dt = new DataTransfer();
              images.forEach((f) => dt.items.add(f));
              handleImages(dt.files);
            }
            if (others.length) {
              const dt = new DataTransfer();
              others.forEach((f) => dt.items.add(f));
              handleFiles(dt.files);
            }
            }}
          >
          {(pendingAtts.length > 0 || pendingImages.length > 0) && (
              <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                {pendingAtts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-1 pl-2 pr-1 text-xs"
                  >
                    <FileText className="h-3 w-3 opacity-70" />
                    <span className="max-w-[160px] truncate">{a.name}</span>
                    <button
                      onClick={() => removeAtt(a.id)}
                      className="rounded-full p-0.5 hover:bg-accent"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              {pendingImages.map((im) => (
                <div
                  key={im.id}
                  className="relative overflow-hidden rounded-lg border border-border bg-muted/50"
                >
                  <img
                    src={im.dataUrl}
                    alt={im.name}
                    className="h-14 w-14 object-cover"
                  />
                  <button
                    onClick={() => removeImage(im.id)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 hover:bg-background"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={
                mode === "research"
                  ? "Ask a deep research question…"
                  : "Message Dolphin"
              }
              rows={1}
              className="block max-h-48 min-h-[52px] w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] outline-none placeholder:text-muted-foreground"
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                handleFiles(e.target.files);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            <input
              ref={imageInputRef}
              type="file"
              multiple
              hidden
              accept="image/*"
              onChange={(e) => {
                handleImages(e.target.files);
                if (imageInputRef.current) imageInputRef.current.value = "";
              }}
            />
            <div className="flex items-center justify-between gap-2 px-2 pb-2">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
                  title="Attach text files"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={!visionSupported}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition",
                    visionSupported
                      ? "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      : "cursor-not-allowed text-muted-foreground/40"
                  )}
                  title={
                    visionSupported
                      ? "Attach image"
                      : "Current model does not support vision"
                  }
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!settings.searxngUrl) {
                      toast.error("Set SearXNG URL in Settings first");
                      return;
                    }
                    setWebSearchOn((v) => !v);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition",
                    webSearchOn
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                  title={
                    webSearchOn ? "Web search enabled" : "Enable web search"
                  }
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
                <ModelSelector
                  baseUrl={settings.ollamaBaseUrl}
                  value={settings.ollamaModel}
                  onChange={setModel}
                />
                <span className="mx-1 h-4 w-px bg-border" />
                <ModeBtn
                  active={mode === "chat"}
                  onClick={() => setMode("chat")}
                  icon={<MessageSquare className="h-3.5 w-3.5" />}
                  label="Chat"
                />
                <ModeBtn
                  active={mode === "research"}
                  onClick={() => setMode("research")}
                  icon={<Sparkles className="h-3.5 w-3.5" />}
                  label="Deep research"
                />
              </div>

              <button
                onClick={streaming ? stop : send}
                disabled={
                  !streaming &&
                  !input.trim() &&
                  pendingAtts.length === 0 &&
                  pendingImages.length === 0
                }
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full transition",
                  streaming
                    ? "bg-destructive text-destructive-foreground hover:opacity-90"
                    : "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30"
                )}
              >
                {streaming ? (
                  <Square className="h-4 w-4 fill-current" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function MessageBlock({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {message.images && message.images.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {message.images.map((b64, i) => (
              <img
                key={i}
                src={`data:image/*;base64,${b64}`}
                alt="attachment"
                className="h-24 w-24 rounded-lg border border-border object-cover"
              />
            ))}
          </div>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {message.attachments.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground"
              >
                <FileText className="h-3 w-3" />
                <span className="max-w-[180px] truncate">{a.name}</span>
              </div>
            ))}
          </div>
        )}
        {message.content && (
          <div className="max-w-[85%] rounded-2xl bg-accent px-4 py-2.5 text-[15px] text-accent-foreground">
            {message.content}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {message.mode === "research" && <Sparkles className="h-3 w-3" />}
        {message.mode === "research" ? "Deep research" : "Assistant"}
      </div>
      {message.content ? (
        <Markdown>{message.content}</Markdown>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
        </div>
      )}
      {message.citations && message.citations.length > 0 && (
        <div className="mt-1 flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <FileText className="h-3 w-3" /> Sources
          </div>
          {message.citations.map((c, i) => (
            <a
              key={c.url + i}
              href={c.url}
              target="_blank"
              rel="noreferrer noopener"
              className="group flex items-start gap-2 text-sm hover:text-foreground"
            >
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-background text-[10px] font-mono text-muted-foreground">
                {i + 1}
              </span>
              <span className="flex-1 truncate text-muted-foreground group-hover:text-foreground">
                {c.title || c.url}
              </span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyHero() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="font-serif text-5xl tracking-tight">Dolphin</div>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        A private chat for your local Ollama models. Switch modes below to
        search the web or run deep research.
      </p>
    </div>
  );
}
