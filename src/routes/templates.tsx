import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DeskShell } from "@/components/desk-shell";
import { Button, Field, Notice, Panel, Pill, TextInput } from "@/components/ui";
import { useDesk } from "@/lib/desk-store";
import { listTemplatesFn, sendWhatsappTemplateFn } from "@/lib/fns";
import { formatPhone, toE164 } from "@/lib/phone";

type Template = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  rejection_reason: string;
  body: string;
  slots: number;
};

export const Route = createFileRoute("/templates")({
  head: () => ({ meta: [{ title: "Templates · Line Desk" }] }),
  component: TemplatesPage,
});

function TemplatesPage() {
  return (
    <DeskShell>
      <Templates />
    </DeskShell>
  );
}

function Templates() {
  const apiKey = useDesk((state) => state.apiKey);
  const from = useDesk((state) => state.businessNumber);
  const addMessage = useDesk((state) => state.addMessage);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await listTemplatesFn({ data: { apiKey } });
      setTemplates(result.templates);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load templates");
    } finally {
      setLoading(false);
    }
  }

  function open(template: Template) {
    setActiveId(template.id || template.name || "");
    setParams(Array.from({ length: template.slots }, () => ""));
    setNotice("");
    setError("");
  }

  async function send(template: Template) {
    const destination = toE164(to);
    if (!destination) {
      setError("Enter the recipient as +1…");
      return;
    }
    if (params.some((value) => !value.trim())) {
      setError("Fill every template variable.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const result = await sendWhatsappTemplateFn({
        data: {
          apiKey,
          from,
          to: destination,
          name: template.name || "",
          language: template.language || "en_US",
          parameters: params,
        },
      });
      const preview = params.length
        ? `Template ${template.name}: ${params.join(", ")}`
        : `Template ${template.name}`;
      addMessage({
        id: result.id || crypto.randomUUID(),
        channel: "whatsapp",
        direction: "outbound",
        peer: destination,
        text: preview,
        status: result.status || "queued",
        at: new Date().toISOString(),
        telnyxId: result.id,
      });
      setNotice(`Queued to ${formatPhone(destination)}. Status: ${result.status}.`);
      setTo("");
      setParams(params.map(() => ""));
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Template send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto px-4 py-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Templates</h1>
        <p className="mt-1 text-sm text-muted">
          WhatsApp only delivers free text inside 24 hours of the customer’s last message. Outside
          that window, send an approved template. Create templates in the Telnyx portal; Meta reviews
          them.
        </p>
      </div>
      {!apiKey ? (
        <Notice>
          Connect Telnyx in{" "}
          <Link to="/settings" className="text-fg underline">
            Settings
          </Link>
          .
        </Notice>
      ) : (
        <Button className="self-start" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : templates ? "Refresh" : "Load templates"}
        </Button>
      )}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {templates?.length === 0 ? <Notice>No WhatsApp templates on this account yet.</Notice> : null}
      {templates?.map((template) => {
        const id = template.id || template.name || "";
        const openPanel = activeId === id;
        const approved = (template.status || "").toUpperCase() === "APPROVED";
        return (
          <Panel
            key={id}
            title={template.name || "Untitled"}
            action={
              <Pill tone={approved ? "ok" : template.status === "REJECTED" ? "bad" : "warn"}>
                {template.status || "unknown"}
              </Pill>
            }
          >
            <p className="text-sm text-muted">
              {template.category || "Uncategorized"} · {template.language || "language not set"}
            </p>
            <p className="mt-3 text-sm leading-6 whitespace-pre-wrap">{template.body || "No body text on this template."}</p>
            {template.rejection_reason ? (
              <p className="mt-2 text-sm text-danger">{template.rejection_reason}</p>
            ) : null}
            <div className="mt-4">
              <Button variant="ghost" onClick={() => (openPanel ? setActiveId(null) : open(template))} disabled={!approved}>
                {approved ? (openPanel ? "Close" : "Send") : "Not approved"}
              </Button>
            </div>
            {openPanel ? (
              <form
                className="mt-4 grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(template);
                }}
              >
                <Field label="To">
                  <TextInput value={to} onChange={(event) => setTo(event.target.value)} placeholder="+1…" />
                </Field>
                {params.map((value, index) => (
                  <Field key={index} label={`Variable {{${index + 1}}}`}>
                    <TextInput
                      value={value}
                      onChange={(event) =>
                        setParams(params.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                      }
                    />
                  </Field>
                ))}
                <Button type="submit" disabled={sending}>
                  {sending ? "Sending…" : "Send template"}
                </Button>
              </form>
            ) : null}
          </Panel>
        );
      })}
    </div>
  );
}
