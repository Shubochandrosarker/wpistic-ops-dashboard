import { createFileRoute } from "@tanstack/react-router";
import { DeskShell } from "@/components/desk-shell";
import { Inbox } from "@/components/inbox";

export const Route = createFileRoute("/sms")({
  head: () => ({ meta: [{ title: "Texts · Line Desk" }] }),
  component: SmsPage,
});

function SmsPage() {
  return (
    <DeskShell>
      <Inbox />
    </DeskShell>
  );
}
