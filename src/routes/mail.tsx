import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DeskShell } from "@/components/desk-shell";
import { TeamGate } from "@/components/team-gate";
import { Button, Field, Notice, Panel, TextInput } from "@/components/ui";
import { listMailboxesFn, removeMailboxFn, saveMailboxFn, syncMailboxFn } from "@/lib/support-fns";
import type { MailboxCard } from "@/lib/support-types";

export const Route = createFileRoute("/mail")({
  head: () => ({ meta: [{ title: "Mail · Line Desk" }] }),
  component: MailPage,
});

function MailPage() {
  return (
    <DeskShell>
      <TeamGate>{() => <MailManager />}</TeamGate>
    </DeskShell>
  );
}

const EMPTY = {
  id: "",
  label: "",
  address: "",
  imapHost: "",
  imapPort: 993,
  smtpHost: "",
  smtpPort: 587,
  username: "",
  secret: "",
};

function MailManager() {
  const [boxes, setBoxes] = useState<MailboxCard[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    setBoxes(await listMailboxesFn());
  }

  useEffect(() => {
    void reload().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Could not list mailboxes");
    });
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await saveMailboxFn({ data: form });
      setForm(EMPTY);
      setStatus("Mailbox saved. Sync pulls the latest 20 inbox messages.");
      await reload();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function sync(id: string) {
    setBusy(true);
    setError("");
    try {
      const result = await syncMailboxFn({ data: { id } });
      setStatus(`Synced ${result.count} messages into the inbox.`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto px-4 py-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Hosting mail</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Add one mailbox per site. Use the host from cPanel or your mail provider. IMAP 993 and SMTP 587
          are the usual ports. The password stays on the desk.
        </p>
      </div>
      {status ? <Notice>{status}</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <Panel title="Connected mailboxes">
        {boxes.length === 0 ? (
          <p className="text-sm text-muted">None yet. Support@, hello@, and billing@ each get a row.</p>
        ) : (
          <ul className="grid gap-3">
            {boxes.map((box) => (
              <li key={box.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-3 py-3">
                <div>
                  <p className="text-sm font-medium">{box.label}</p>
                  <p className="font-mono text-xs text-muted">{box.address}</p>
                  <p className="text-xs text-faint">
                    {box.imapHost}:{box.imapPort} · {box.smtpHost}:{box.smtpPort}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => void sync(box.id)}>
                    Sync
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy}
                    onClick={() => void removeMailboxFn({ data: { id: box.id } }).then(reload)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Add a mailbox">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Label">
            <TextInput value={form.label} onChange={(event) => set("label", event.target.value)} placeholder="Insightistic support" />
          </Field>
          <Field label="Address">
            <TextInput value={form.address} onChange={(event) => set("address", event.target.value)} placeholder="support@insightistic.com" />
          </Field>
          <Field label="IMAP host">
            <TextInput value={form.imapHost} onChange={(event) => set("imapHost", event.target.value)} placeholder="mail.insightistic.com" />
          </Field>
          <Field label="IMAP port">
            <TextInput value={String(form.imapPort)} onChange={(event) => set("imapPort", Number(event.target.value) || 993)} />
          </Field>
          <Field label="SMTP host">
            <TextInput value={form.smtpHost} onChange={(event) => set("smtpHost", event.target.value)} placeholder="mail.insightistic.com" />
          </Field>
          <Field label="SMTP port">
            <TextInput value={String(form.smtpPort)} onChange={(event) => set("smtpPort", Number(event.target.value) || 587)} />
          </Field>
          <Field label="Username">
            <TextInput value={form.username} onChange={(event) => set("username", event.target.value)} placeholder="Usually the full address" />
          </Field>
          <Field label="Password">
            <TextInput type="password" value={form.secret} onChange={(event) => set("secret", event.target.value)} />
          </Field>
        </div>
        <Button className="mt-4" type="button" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save mailbox"}
        </Button>
      </Panel>
    </div>
  );
}
