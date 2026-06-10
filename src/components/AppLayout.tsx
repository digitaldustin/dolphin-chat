import { Link, useRouter, useMatchRoute } from "@tanstack/react-router";
import {
  MessageSquarePlus,
  Library as LibraryIcon,
  Settings as SettingsIcon,
  Compass,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { listChats, type Chat, newId } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useApplyTheme } from "@/hooks/use-apply-theme";

export function AppLayout({ children }: { children: ReactNode }) {
  useApplyTheme();
  const [chats, setChats] = useState<Chat[]>([]);
  const router = useRouter();
  const matchRoute = useMatchRoute();

  const refresh = () => listChats().then(setChats);
  useEffect(() => {
    refresh();
    const h = () => refresh();
    window.addEventListener("chats:changed", h);
    return () => window.removeEventListener("chats:changed", h);
  }, []);

  const onNewChat = () => {
    const id = newId();
    router.navigate({ to: "/c/$chatId", params: { chatId: id } });
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-5 py-5">
          <Compass className="h-5 w-5" />
          <span className="font-serif text-xl tracking-tight">Odyssey</span>
        </div>

        <button
          onClick={onNewChat}
          className="mx-3 mb-3 flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-sm font-medium transition hover:bg-sidebar-accent"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </button>

        <nav className="mx-3 mb-2 flex flex-col gap-0.5 text-sm">
          <SideLink to="/library" label="Library" icon={<LibraryIcon className="h-4 w-4" />} />
          <SideLink to="/settings" label="Settings" icon={<SettingsIcon className="h-4 w-4" />} />
        </nav>

        <div className="px-5 pt-3 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          Recent
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-4">
          {chats.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No chats yet.</div>
          )}
          {chats.map((c) => {
            const active = matchRoute({ to: "/c/$chatId", params: { chatId: c.id } });
            return (
              <Link
                key={c.id}
                to="/c/$chatId"
                params={{ chatId: c.id }}
                className={cn(
                  "block truncate rounded-md px-3 py-1.5 text-sm transition",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                )}
                title={c.title}
              >
                {c.title || "Untitled"}
              </Link>
            );
          })}
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}

function SideLink({
  to,
  label,
  icon,
}: {
  to: string;
  label: string;
  icon: ReactNode;
}) {
  const matchRoute = useMatchRoute();
  const active = matchRoute({ to });
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 transition",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

export function emitChatsChanged() {
  window.dispatchEvent(new CustomEvent("chats:changed"));
}
