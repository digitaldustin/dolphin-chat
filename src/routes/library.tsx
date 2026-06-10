import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout, emitChatsChanged } from "@/components/AppLayout";
import { useEffect, useState } from "react";
import {
  listChats,
  listReports,
  listFiles,
  deleteChat,
  deleteReport,
  deleteFile,
  saveFile,
  newId,
  type Chat,
  type ResearchReport,
  type LibraryFile,
} from "@/lib/storage";
import { Markdown } from "@/components/Markdown";
import { MessageSquare, FileText, Upload, Trash2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/library")({
  head: () => ({ meta: [{ title: "Library · Odyssey" }] }),
  component: LibraryPage,
});

type Tab = "chats" | "research" | "files";

function LibraryPage() {
  const [tab, setTab] = useState<Tab>("chats");
  const [chats, setChats] = useState<Chat[]>([]);
  const [reports, setReports] = useState<ResearchReport[]>([]);
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [viewing, setViewing] = useState<ResearchReport | LibraryFile | null>(
    null
  );

  const refresh = async () => {
    setChats(await listChats());
    setReports(await listReports());
    setFiles(await listFiles());
  };
  useEffect(() => {
    refresh();
  }, []);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = e.target.files;
    if (!fs) return;
    for (const f of Array.from(fs)) {
      try {
        const content = await f.text();
        await saveFile({
          id: newId(),
          name: f.name,
          size: f.size,
          type: f.type || "text/plain",
          content,
          createdAt: Date.now(),
        });
      } catch (err) {
        toast.error(`Could not read ${f.name} (must be text-based)`);
      }
    }
    refresh();
    toast.success("Saved to library");
    e.target.value = "";
  };

  return (
    <AppLayout>
      <div className="flex h-full flex-col">
        <header className="border-b border-border px-8 py-6">
          <h1 className="font-serif text-3xl tracking-tight">Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your saved chats, research reports, and uploaded files.
          </p>
        </header>

        <div className="border-b border-border px-8">
          <div className="flex gap-1">
            <TabBtn active={tab === "chats"} onClick={() => setTab("chats")}>
              Chats ({chats.length})
            </TabBtn>
            <TabBtn
              active={tab === "research"}
              onClick={() => setTab("research")}
            >
              Research ({reports.length})
            </TabBtn>
            <TabBtn active={tab === "files"} onClick={() => setTab("files")}>
              Files ({files.length})
            </TabBtn>
            <div className="ml-auto py-2">
              {tab === "files" && (
                <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent">
                  <Upload className="h-3.5 w-3.5" /> Upload
                  <input
                    type="file"
                    multiple
                    accept=".txt,.md,.markdown,.json,.csv,.log,.html,.xml,.yaml,.yml,.py,.js,.ts,.tsx,.jsx,.css"
                    className="hidden"
                    onChange={onUpload}
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-8 py-6">
          {tab === "chats" && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {chats.map((c) => (
                <Link
                  key={c.id}
                  to="/c/$chatId"
                  params={{ chatId: c.id }}
                  className="group flex flex-col rounded-xl border border-border bg-card p-4 transition hover:border-ring/40"
                >
                  <div className="flex items-start justify-between">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <button
                      onClick={async (e) => {
                        e.preventDefault();
                        await deleteChat(c.id);
                        emitChatsChanged();
                        refresh();
                      }}
                      className="opacity-0 transition group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                  <div className="mt-2 font-medium">{c.title || "Untitled"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {c.messages.length} messages ·{" "}
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </div>
                </Link>
              ))}
              {chats.length === 0 && <Empty msg="No chats yet." />}
            </div>
          )}

          {tab === "research" && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setViewing(r)}
                  className="group flex flex-col rounded-xl border border-border bg-card p-4 text-left transition hover:border-ring/40"
                >
                  <div className="flex items-start justify-between">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await deleteReport(r.id);
                        refresh();
                      }}
                      className="opacity-0 transition group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                  <div className="mt-2 font-medium">{r.title}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {r.query}
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    {r.citations.length} sources ·{" "}
                    {new Date(r.createdAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
              {reports.length === 0 && <Empty msg="No saved research yet." />}
            </div>
          )}

          {tab === "files" && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {files.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setViewing(f)}
                  className="group flex flex-col rounded-xl border border-border bg-card p-4 text-left transition hover:border-ring/40"
                >
                  <div className="flex items-start justify-between">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await deleteFile(f.id);
                        refresh();
                      }}
                      className="opacity-0 transition group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                  <div className="mt-2 truncate font-medium">{f.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {(f.size / 1024).toFixed(1)} KB
                  </div>
                </button>
              ))}
              {files.length === 0 && <Empty msg="No files uploaded yet." />}
            </div>
          )}
        </div>
      </div>

      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur"
          onClick={() => setViewing(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="font-medium">
                {"name" in viewing ? viewing.name : viewing.title}
              </div>
              <button onClick={() => setViewing(null)}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="scroll-thin overflow-y-auto px-6 py-5">
              {"content" in viewing && "type" in viewing ? (
                <pre className="text-xs whitespace-pre-wrap font-mono">
                  {viewing.content}
                </pre>
              ) : (
                <Markdown>{(viewing as ResearchReport).content}</Markdown>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function TabBtn({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-4 py-3 text-sm transition ${
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="col-span-full py-16 text-center text-sm text-muted-foreground">
      {msg}
    </div>
  );
}
