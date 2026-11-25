import { ImapFlow } from "imapflow";

export type MailDraft = {
  uid: string;
  fromName: string;
  fromAddr: string;
  subject: string;
  snippet: string;
  body: string;
  at: string;
};

export type MailboxConn = {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  secret: string;
  address: string;
};

function snippetOf(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

function decodeSource(source: Buffer | undefined): { snippet: string; body: string } {
  if (!source) return { snippet: "", body: "" };
  const raw = source.toString("utf8");
  const split = raw.split(/\r?\n\r?\n/);
  const body = (split.slice(1).join("\n\n") || raw).replace(/=\r?\n/g, "").slice(0, 8000);
  const plain = body.replace(/<[^>]+>/g, " ");
  return { snippet: snippetOf(plain), body: plain.trim().slice(0, 8000) };
}

export async function readInbox(conn: MailboxConn): Promise<MailDraft[]> {
  const client = new ImapFlow({
    host: conn.imapHost,
    port: conn.imapPort,
    secure: conn.imapPort !== 143,
    auth: { user: conn.username, pass: conn.secret },
    logger: false,
  });
  const drafts: MailDraft[] = [];
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const status = await client.status("INBOX", { messages: true });
    const total = status && typeof status === "object" ? (status.messages ?? 0) : 0;
    if (!total) return [];
    const start = Math.max(1, total - 19);
    for await (const message of client.fetch(`${start}:*`, {
      uid: true,
      envelope: true,
      internalDate: true,
      source: { start: 0, maxLength: 12000 },
    })) {
      const from = message.envelope?.from?.[0];
      const decoded = decodeSource(message.source);
      drafts.push({
        uid: String(message.uid),
        fromName: from?.name || "",
        fromAddr: from?.address || "unknown",
        subject: message.envelope?.subject || "(no subject)",
        snippet: decoded.snippet,
        body: decoded.body,
        at: new Date(message.internalDate ?? Date.now()).toISOString(),
      });
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return drafts;
}

export async function sendMail(
  conn: MailboxConn,
  input: { to: string; subject: string; text: string },
): Promise<void> {
  const nodemailer = (await import("nodemailer")).default as {
    createTransport: (options: Record<string, unknown>) => {
      sendMail: (mail: Record<string, unknown>) => Promise<unknown>;
    };
  };
  const transport = nodemailer.createTransport({
    host: conn.smtpHost,
    port: conn.smtpPort,
    secure: conn.smtpPort === 465,
    auth: { user: conn.username, pass: conn.secret },
  });
  await transport.sendMail({
    from: conn.address,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
}
