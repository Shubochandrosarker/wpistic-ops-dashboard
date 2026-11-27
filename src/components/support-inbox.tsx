import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TeamGate } from "@/components/team-gate";
import { Button, Notice, TextArea } from "@/components/ui";
import { TimeText } from "@/components/time-text";
import {
  chatThreadFn,
  listChatsFn,
  listMailFn,
  replyChatFn,
  replyMailFn,
} from "@/lib/support-fns";
import type { MailCard } from "@/lib/support-types";
import type { AnychatChat, AnychatMessage } from "@/lib/anychat.server";

const MACROS = [
  "Thanks for writing about Insightistic. Reply with the email on your AppSumo purchase and what you see on screen.",
  "Redeem the AppSumo code inside Insightistic, then connect Google Search Console with the Google account that owns the property.",
  "AppSumo refunds are requested from your AppSumo account during their refund window. We cannot refund an AppSumo purchase from this desk.",
];

type Filter = "all" | "mail" | "whatsapp";

export function SupportInbox() {
  return (
    <TeamGate>
      {(desk) => <InboxDesk connected={desk.anychatConnected} />}
    </TeamGate>
  );
}

function InboxDesk({ connected }: { connected: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [mail, setMail] = useState<MailCard[]>([]);
  const [chats, setChats] = useState<AnychatChat[]>([]);
  const [selectedMail, setSelectedMail] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [thread, setThread] = useState<AnychatMessage[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    async function loadAll() {
      void listMailFn()
        .then((rows) => {
          if (!cancel) setMail(rows);
        })
        .catch((loadError: unknown) => {
          if (!cancel) setError(loadError instanceof Error ? loadError.message : "Mail did not load");
        });
      if (connected) {
        void listChatsFn()
          .then((rows) => {
            if (!cancel) setChats(rows);
          })
          .catch((loadError: unknown) => {
            if (!cancel) setError(loadError instanceof Error ? loadError.message : "AnyChat did not load");
          });
      }
    }
    void loadAll();
    // Hostinger webhooks push mail into the DB; poll so new items surface fast.
    const timer = setInterval(() => void loadAll(), 20000);
    return () => {
      cancel = true;
      clearInterval(timer);
    };
  }, [connected]);

  const mailRow = mail.find((item) => item.id === selectedMail) ?? null;
  const chat = chats.find((item) => item.id === selectedChat) ?? null;
  const showThread = Boolean(mailRow || chat);

  async function openChat(id: string) {
    setSelectedMail(null);
    setSelectedChat(id);
    setError("");
    setThread([]);
    try {
      setThread(await chatThreadFn({ data: { chatId: id } }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not open the chat");
    }
  }

  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError("");
    try {
      if (chat) {
        await replyChatFn({ data: { chatId: chat.id, message: body } });
        setThread(await chatThreadFn({ data: { chatId: chat.id } }));
      } else if (mailRow) {
        await replyMailFn({
          data: {
            mailboxId: mailRow.mailboxId,
            to: mailRow.fromAddr,
            subject: mailRow.subject.startsWith("Re:") ? mailRow.subject : `Re: ${mailRow.subject}`,
            text: body,
          },
        });
      }
      setText("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      <section className={`${showThread ? "hidden md:flex" : "flex"} w-full min-w-0 flex-col border-line md:w-96 md:border-r`}>
        <div className="flex items-center gap-2 px-4 py-4">
          {(["all", "mail", "whatsapp"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setFilter(item);
                setSelectedMail(null);
                setSelectedChat(null);
              }}
              className={`min-h-11 rounded-md px-3 text-sm capitalize ${filter === item ? "bg-raised text-fg" : "text-muted"}`}
            >
              {item === "whatsapp" ? "WhatsApp" : item}
            </button>
          ))}
        </div>
        {!connected ? (
          <div className="px-4 pb-3">
            <Notice>
              AnyChat is not connected.{" "}
              <Link to="/whatsapp" className="text-fg underline">
                Add the API key
              </Link>{" "}
              to pull WhatsApp chats.
            </Notice>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filter !== "whatsapp"
            ? mail.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedChat(null);
                    setSelectedMail(item.id);
                    setThread([]);
                  }}
                  className="block w-full border-b border-line px-4 py-3 text-left"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{item.fromName || item.fromAddr}</span>
                    <TimeText iso={item.at} />
                  </span>
                  <span className="mt-1 block truncate text-sm text-muted">{item.subject}</span>
                  <span className="mt-1 block text-xs text-faint">{item.mailbox}</span>
                </button>
              ))
            : null}
          {filter !== "mail"
            ? chats.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void openChat(item.id)}
                  className="block w-full border-b border-line px-4 py-3 text-left"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{item.title}</span>
                    <TimeText iso={item.at} />
                  </span>
                  <span className="mt-1 block truncate text-sm text-muted">{item.preview || item.source}</span>
                </button>
              ))
            : null}
          {mail.length === 0 && chats.length === 0 ? (
            <p className="px-4 text-sm text-muted">
              No messages yet. Add a hosting mailbox under Mail and sync it, or connect AnyChat.
            </p>
          ) : null}
        </div>
      </section>
      <section className={`${showThread ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        {!showThread ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <p className="text-sm text-muted">Select a mail or WhatsApp thread.</p>
              <p className="mt-2 text-sm text-faint">Insightistic AppSumo replies start from the macros below once a thread is open.</p>
            </div>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-line px-4 py-3">
              <button
                type="button"
                className="min-h-11 text-sm text-muted md:hidden"
                onClick={() => {
                  setSelectedMail(null);
                  setSelectedChat(null);
                }}
              >
                Back
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {mailRow ? mailRow.subject : chat?.title}
                </p>
                <p className="truncate text-xs text-faint">
                  {mailRow ? `${mailRow.fromAddr} · ${mailRow.mailbox}` : chat?.source}
                </p>
              </div>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {mailRow ? (
                <article className="rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-6">
                  {mailRow.body || mailRow.snippet || "No body stored."}
                </article>
              ) : (
                thread.map((item) => (
                  <article
                    key={item.id}
                    className={`max-w-lg rounded-lg px-4 py-3 text-sm leading-6 ${item.mine ? "ml-auto bg-accent text-accent-fg" : "bg-surface"}`}
                  >
                    {item.text || "Attachment or empty message"}
                  </article>
                ))
              )}
            </div>
            {error ? (
              <div className="px-4">
                <Notice tone="bad">{error}</Notice>
              </div>
            ) : null}
            <div className="border-t border-line px-4 py-3">
              <div className="mb-2 flex gap-2 overflow-x-auto">
                {MACROS.map((macro) => (
                  <button
                    key={macro}
                    type="button"
                    onClick={() => setText(macro)}
                    className="shrink-0 rounded-md border border-line px-3 py-2 text-left text-xs text-muted"
                  >
                    {macro.slice(0, 42)}…
                  </button>
                ))}
              </div>
              <TextArea value={text} onChange={(event) => setText(event.target.value)} placeholder="Reply" />
              <Button className="mt-2" type="button" onClick={() => void send()} disabled={busy}>
                {busy ? "Sending…" : "Send"}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
