import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { ChatView } from "@/components/ChatView";
import { newId } from "@/lib/storage";
import { useMemo } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Odyssey · Local AI Chat" },
      {
        name: "description",
        content:
          "A private chat app for local Ollama models with web search and deep research.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  // Stable per-mount id so reloads don't keep stacking blank chats.
  const id = useMemo(() => newId(), []);
  return (
    <AppLayout>
      <ChatView chatId={id} />
    </AppLayout>
  );
}
