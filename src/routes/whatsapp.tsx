import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DeskShell } from "@/components/desk-shell";
import { TeamGate } from "@/components/team-gate";
import { Button, Field, Notice, Panel, TextArea, TextInput } from "@/components/ui";
import { anychatStatusFn, openWhatsappFn, saveAnychatFn } from "@/lib/support-fns";
import type { AnychatChannel } from "@/lib/anychat.server";
import type { DeskCard } from "@/lib/support-types";

export const Route = createFileRoute("/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp · Line Desk" }] }),
  component: WhatsappPage,
});

function WhatsappPage() {
  return (
    <DeskShell>
      <TeamGate>{(desk) => <WhatsappSetup desk={desk} />}</TeamGate>
    </DeskShell>
  );
}

function WhatsappSetup({ desk }: { desk: DeskCard }) {
  const [apiKey, setApiKey] = useState("");
  const [channels, setChannels] = useState<AnychatChannel[]>([]);
  const [channelId, setChannelId] = useState(desk.channelId);
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(
    "Hi, this is WordPressistic support for Insightistic. How can we help with your AppSumo license?",
  );
  const [error, setError] = useState("");
  const [status, setStatus] = useState(
    desk.anychatConnected ? "A key is already saved on the desk." : "No AnyChat key yet.",
  );
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true);
    setError("");
    try {
      if (apiKey.trim()) await saveAnychatFn({ data: { apiKey, channelId } });
      const result = await anychatStatusFn();
      setChannels(result.channels);
      setTitle(result.title);
      const whatsapp = result.channels.find((item) => item.kind.includes("whatsapp") || item.title.toLowerCase().includes("whatsapp"));
      if (whatsapp && !channelId) setChannelId(whatsapp.id);
      setStatus(`${result.title}. ${result.channels.length} channel${result.channels.length === 1 ? "" : "s"}.`);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "AnyChat test failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveChannel() {
    setBusy(true);
    setError("");
    try {
      await saveAnychatFn({ data: { apiKey, channelId } });
      setStatus("WhatsApp channel saved. New chats use this channel.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the channel");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    setError("");
    try {
      await openWhatsappFn({ data: { phone, message } });
      setStatus("WhatsApp chat started. It will show in the inbox.");
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start the chat");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto px-4 py-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Business WhatsApp</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          AnyChat holds the WhatsApp connection. Create the key in AnyChat under Settings → API settings,
          connect the number there first, then paste the key here.
        </p>
      </div>
      {status ? <Notice>{status}</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <Panel title="API key">
        <Field label="x-api-key" hint="Stored on the team desk. Leave blank to keep the saved key.">
          <TextInput type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Key…" />
        </Field>
        <Button className="mt-4" type="button" onClick={() => void test()} disabled={busy}>
          {busy ? "Checking…" : "Save and test"}
        </Button>
        {title ? <p className="mt-3 text-sm text-muted">Workspace: {title}</p> : null}
      </Panel>
      <Panel title="WhatsApp channel">
        {channels.length === 0 ? (
          <p className="text-sm text-muted">
            Test the key to list channels. If WhatsApp is missing, connect it in AnyChat with Facebook login
            or the QR code, then test again.
          </p>
        ) : (
          <div className="grid gap-2">
            {channels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                onClick={() => setChannelId(channel.id)}
                className={`rounded-md border px-3 py-3 text-left text-sm ${channelId === channel.id ? "border-accent bg-raised" : "border-line"}`}
              >
                <span className="font-medium">{channel.title}</span>
                <span className="mt-1 block font-mono text-xs text-faint">{channel.id}</span>
              </button>
            ))}
          </div>
        )}
        <Button className="mt-4" type="button" variant="ghost" onClick={() => void saveChannel()} disabled={busy || !channelId}>
          Use this channel
        </Button>
      </Panel>
      <Panel title="Start a WhatsApp chat">
        <div className="grid gap-4">
          <Field label="Customer number" hint="International format. Template rules still apply outside the 24-hour window.">
            <TextInput value={phone} onChange={(event) => setPhone(event.target.value)} className="font-mono" placeholder="+1…" />
          </Field>
          <Field label="First message">
            <TextArea value={message} onChange={(event) => setMessage(event.target.value)} />
          </Field>
        </div>
        <Button className="mt-4" type="button" onClick={() => void start()} disabled={busy}>
          Start chat
        </Button>
      </Panel>
    </div>
  );
}
