import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { ChatView } from "@/components/ChatView";

export const Route = createFileRoute("/c/$chatId")({
  component: ChatPage,
});

function ChatPage() {
  const { chatId } = Route.useParams();
  return (
    <AppLayout>
      <ChatView key={chatId} chatId={chatId} />
    </AppLayout>
  );
}
