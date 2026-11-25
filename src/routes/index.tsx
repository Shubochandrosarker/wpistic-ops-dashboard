import { createFileRoute } from "@tanstack/react-router";
import { DeskShell } from "@/components/desk-shell";
import { SupportInbox } from "@/components/support-inbox";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Inbox · Line Desk" }] }),
  component: function HomePage() {
    return (
      <DeskShell>
        <SupportInbox />
      </DeskShell>
    );
  },
});
