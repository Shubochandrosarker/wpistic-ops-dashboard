import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { TimeText } from "@/components/time-text";
import { Button, Notice, Pill } from "@/components/ui";
import { contactFor, useDesk, type Channel, type DeskMessage } from "@/lib/desk-store";
import { pullInboxFn, sendSmsFn, sendWhatsappTextFn, windowFn } from "@/lib/fns";
import { SAMPLE_MESSAGES } from "@/lib/sample";
import { digits, formatPhone, smsSegments, toE164 } from "@/lib/phone";

type Thread = {
  id: string;
  channel: Channel;
  peer: string;
  title: string;
  messages: DeskMessage[];
};

export function Inbox() {
  const connected = useDesk((state) => Boolean(state.apiKey));
  const apiKey = useDesk((state) => state.apiKey);
  const from = useDesk((state) => state.businessNumber);
  const profileId = useDesk((state) => state.profileId);
  const token = useDesk((state) => state.deskToken);
  const messages = useDesk((state) => state.messages);
  const contacts = useDesk((state) => state.contacts);
  const quickReplies = useDesk((state) => state.quickReplies);
  const mergeEvents = useDesk((state) => state.mergeEvents);
  const addMessage = useDesk((state) => state.addMessage);
  const updateMessage = useDesk((state) => state.updateMessage);
  const upsertContact = useDesk((state) => state.upsertContact);
  const setOptOut = useDesk((state) => state.setOptOut);

  const source = connected ? messages : SAMPLE_MESSAGES;
  const threads = useMemo(() => buildThreads(source, contacts), [source, contacts]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [query, setQuery] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [draftChannel, setDraftChannel] = useState<Channel>("sms");
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [windowState, setWindowState] = useState<{ active: boolean; expires: string | null } | null>(null);
  useEffect(() => {
    if (selectedId || composing || threads.length === 0) return;
    if (window.matchMedia("(min-width: 768px)").matches) setSelectedId(threads[0].id);
  }, [threads, selectedId, composing]);
  const scroller = useRef<HTMLDivElement>(null);
  const since = useRef("1970-01-01T00:00:00.000Z");

  const visible = threads.filter((thread) => {
    const hay = `${thread.title} ${thread.peer} ${thread.messages.at(-1)?.text ?? ""}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });
  const selected = threads.find((thread) => thread.id === selectedId) ?? null;
  const activeChannel = selected?.channel ?? draftChannel;
  const activePeer = selected?.peer ?? toE164(draftTo);
  const contact = activePeer ? contactFor(contacts, activePeer) : undefined;
  const showThread = Boolean(selected || composing);

  useEffect(() => {
    if (!connected || !token) return;
    let stop = false;
    let timer = 0;
    const tick = async () => {
      try {
        const result = await pullInboxFn({ data: { token, since: since.current } });
        if (result.events.length) {
          mergeEvents(result.events);
          const latest = result.events.reduce(
            (max, event) => (event.at > max ? event.at : max),
            since.current,
          );
          since.current = latest;
        }
      } catch {
        /* next poll retries */
      }
      if (!stop) timer = window.setTimeout(() => void tick(), 4000);
    };
    void tick();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [connected, token, mergeEvents]);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [selectedId, selected?.messages.length, text]);

  useEffect(() => {
    if (!connected || activeChannel !== "whatsapp" || !activePeer) {
      setWindowState(null);
      return;
    }
    let cancel = false;
    void windowFn({ data: { apiKey, from, to: activePeer } })
      .then((result) => {
        if (!cancel) setWindowState({ active: result.window_active, expires: result.window_expires_at });
      })
      .catch(() => {
        if (!cancel) setWindowState(null);
      });
    return () => {
      cancel = true;
    };
  }, [connected, activeChannel, activePeer, apiKey, from]);

  useEffect(() => {
    setNameDraft(contact?.name ?? selected?.title ?? "");
  }, [contact?.name, selected?.id, selected?.title]);

  async function onSend() {
    setError("");
    if (!connected) {
      setError("Connect your Telnyx API key in Settings before sending.");
      return;
    }
    const to = activePeer;
    if (!to) {
      setError("Enter the recipient number in international format.");
      return;
    }
    const body = text.trim();
    if (!body) return;
    if (activeChannel === "sms" && contact?.optedOut) {
      setError("This contact texted STOP. Clear the opt-out only if they opted back in.");
      return;
    }
    if (activeChannel === "whatsapp" && windowState && !windowState.active) {
      setError("The 24-hour WhatsApp window is closed. Send an approved template instead.");
      return;
    }
    const localId = crypto.randomUUID();
    addMessage({
      id: localId,
      channel: activeChannel,
      direction: "outbound",
      peer: to,
      peerName: contact?.name,
      text: body,
      status: "sending",
      at: new Date().toISOString(),
    });
    setText("");
    setBusy(true);
    try {
      const result =
        activeChannel === "whatsapp"
          ? await sendWhatsappTextFn({ data: { apiKey, from, to, text: body } })
          : await sendSmsFn({
              data: { apiKey, from, to, text: body, mediaUrl, profileId },
            });
      updateMessage(localId, { status: result.status || "queued", telnyxId: result.id });
      if (!selected) {
        setSelectedId(`${activeChannel}:${digits(to)}`);
        setComposing(false);
      }
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Send failed";
      updateMessage(localId, { status: "failed", error: message });
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  function saveName() {
    if (!activePeer) return;
    upsertContact({
      phone: activePeer,
      name: nameDraft.trim(),
      optedOut: contact?.optedOut ?? false,
    });
  }

  const segments = smsSegments(text);

  return (
    <div className="flex h-full min-h-0 flex-1">
      <section
        className={`${showThread ? "hidden md:flex" : "flex"} w-full min-w-0 flex-col border-line md:w-80 md:border-r`}
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search threads"
            className="min-h-11 w-full rounded-md border border-line bg-bg px-3 text-base text-fg outline-none placeholder:text-faint"
          />
          <Button
            className="shrink-0"
            onClick={() => {
              setComposing(true);
              setSelectedId(null);
              setError("");
            }}
          >
            New
          </Button>
        </div>
        {!connected ? (
          <div className="px-4 pb-3">
            <Notice>
              Preview threads only. Nothing is sent.{" "}
              <Link to="/settings" className="text-fg underline">
                Connect Telnyx
              </Link>{" "}
              to use +1 505 520 1914.
            </Notice>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="px-4 text-sm text-muted">No threads yet.</p>
          ) : (
            visible.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => {
                  setSelectedId(thread.id);
                  setComposing(false);
                  setError("");
                }}
                className={`flex w-full flex-col gap-1 border-t border-line px-4 py-3 text-left ${
                  thread.id === selectedId ? "bg-raised" : "hover:bg-surface"
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">{thread.title}</span>
                  <span className="shrink-0 text-xs text-faint">
                    <TimeText iso={thread.messages.at(-1)?.at ?? ""} />
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Pill>{thread.channel === "whatsapp" ? "WhatsApp" : "SMS"}</Pill>
                  <span className="truncate text-sm text-muted">{thread.messages.at(-1)?.text}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className={`${showThread ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <button
            type="button"
            className="min-h-11 text-sm text-muted md:hidden"
            onClick={() => {
              setSelectedId(null);
              setComposing(false);
            }}
          >
            Back
          </button>
          <div className="min-w-0 flex-1">
            {selected ? (
              <>
                <p className="truncate text-sm font-medium">{selected.title}</p>
                <p className="font-mono text-xs text-faint">{formatPhone(selected.peer)}</p>
              </>
            ) : (
              <p className="text-sm font-medium">New message</p>
            )}
          </div>
          {activeChannel === "whatsapp" && windowState ? (
            <Pill tone={windowState.active ? "ok" : "warn"}>
              {windowState.active ? "Session open" : "Template only"}
            </Pill>
          ) : (
            <Pill>{activeChannel === "whatsapp" ? "WhatsApp" : "SMS"}</Pill>
          )}
        </header>

        {selected ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder="Save a name"
              className="min-h-11 flex-1 rounded-md border border-line bg-bg px-3 text-sm text-fg outline-none"
            />
            <Button variant="ghost" onClick={saveName}>
              Save name
            </Button>
            {contact?.optedOut ? (
              <Button variant="ghost" onClick={() => setOptOut(activePeer, false)}>
                Clear opt-out
              </Button>
            ) : null}
          </div>
        ) : null}

        <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {!selected && !composing ? (
            <p className="text-sm text-muted">Choose a thread or start a new one.</p>
          ) : null}
          {selected?.messages.map((message) => (
            <article
              key={message.id}
              className={`max-w-[36rem] rounded-lg px-3 py-2 text-sm leading-6 ${
                message.direction === "outbound"
                  ? "ml-auto bg-accent text-accent-fg"
                  : "bg-raised text-fg"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.text}</p>
              <p
                className={`mt-1 text-xs ${
                  message.direction === "outbound" ? "text-accent-fg/70" : "text-faint"
                }`}
              >
                <TimeText iso={message.at} /> · {message.status}
                {message.error ? ` · ${message.error}` : ""}
              </p>
            </article>
          ))}
        </div>

        <form
          className="border-t border-line px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            void onSend();
          }}
        >
          {error ? (
            <div className="mb-3">
              <Notice tone="bad">{error}</Notice>
            </div>
          ) : null}
          {!selected ? (
            <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={draftTo}
                onChange={(event) => setDraftTo(event.target.value)}
                placeholder="To, +1…"
                className="min-h-11 rounded-md border border-line bg-bg px-3 font-mono text-base text-fg outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                {(["sms", "whatsapp"] as const).map((channel) => (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => setDraftChannel(channel)}
                    className={`min-h-11 rounded-md border px-3 text-sm ${
                      draftChannel === channel
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-line text-muted"
                    }`}
                  >
                    {channel === "sms" ? "SMS" : "WhatsApp"}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {quickReplies.length ? (
            <div className="mb-3 flex gap-2 overflow-x-auto">
              {quickReplies.map((reply) => (
                <button
                  key={reply}
                  type="button"
                  onClick={() => setText(reply)}
                  className="shrink-0 rounded-full border border-line px-3 py-2 text-xs text-muted"
                >
                  {reply.length > 42 ? `${reply.slice(0, 42)}…` : reply}
                </button>
              ))}
            </div>
          ) : null}
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              activeChannel === "whatsapp"
                ? "WhatsApp reply inside the open session"
                : "Text message"
            }
            rows={3}
            className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-3 text-base text-fg outline-none placeholder:text-faint"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-faint">
              {activeChannel === "sms"
                ? `${text.length} characters · about ${segments.parts} SMS part${segments.parts === 1 ? "" : "s"}${segments.unicode ? " · unicode" : ""}`
                : `${text.length} / 4096`}
            </p>
            <Button type="submit" disabled={busy || !text.trim()}>
              {busy ? "Sending…" : connected ? "Send" : "Connect to send"}
            </Button>
          </div>
          {activeChannel === "sms" && (selected || composing) ? (
            <input
              value={mediaUrl}
              onChange={(event) => setMediaUrl(event.target.value)}
              placeholder="Optional MMS media URL, https://"
              className="mt-2 min-h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg outline-none placeholder:text-faint"
            />
          ) : null}
        </form>
      </section>
    </div>
  );
}

function buildThreads(
  messages: DeskMessage[],
  contacts: { phone: string; name: string }[],
): Thread[] {
  const groups = new Map<string, DeskMessage[]>();
  for (const message of messages) {
    const id = `${message.channel}:${digits(message.peer)}`;
    const list = groups.get(id) ?? [];
    list.push(message);
    groups.set(id, list);
  }
  return [...groups.entries()]
    .map(([id, list]) => {
      const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at));
      const last = sorted.at(-1)!;
      const contact = contacts.find((item) => digits(item.phone) === digits(last.peer));
      return {
        id,
        channel: last.channel,
        peer: last.peer,
        title: contact?.name || last.peerName || formatPhone(last.peer),
        messages: sorted,
      };
    })
    .sort((a, b) => (b.messages.at(-1)?.at ?? "").localeCompare(a.messages.at(-1)?.at ?? ""));
}
