import { getSql } from "@/lib/db";
import {
  anychatChats,
  anychatMessages,
  anychatSend,
  anychatStartWhatsapp,
  anychatWorkspace,
  type AnychatChannel,
  type AnychatChat,
  type AnychatMessage,
} from "@/lib/anychat.server";
import { readInbox, sendMail, type MailboxConn } from "@/lib/mail.server";

import type { DeskCard, MailboxCard, MailCard } from "@/lib/support-types";

type DeskRow = {
  id: string;
  name: string;
  join_code: string;
  role: string;
  anychat_key: string | null;
  anychat_channel: string | null;
};

function card(row: DeskRow): DeskCard {
  return {
    id: row.id,
    name: row.name,
    joinCode: row.join_code,
    role: row.role,
    anychatConnected: Boolean(row.anychat_key),
    channelId: row.anychat_channel ?? "",
  };
}

function joinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

async function deskFor(userId: string): Promise<DeskRow | null> {
  const sql = await getSql();
  const rows = await sql<DeskRow>`
    select d.id, d.name, d.join_code, m.role, d.anychat_key, d.anychat_channel
    from desk_member m
    join desk d on d.id = m.desk_id
    where m.user_id = ${userId}
    order by m.created_at asc
    limit 1
  `;
  return rows[0] ?? null;
}

async function requireDesk(userId: string): Promise<DeskRow> {
  const desk = await deskFor(userId);
  if (!desk) throw new Error("Create or join the team desk first.");
  return desk;
}

export async function currentDesk(userId: string): Promise<DeskCard | null> {
  const desk = await deskFor(userId);
  return desk ? card(desk) : null;
}

export async function createDesk(userId: string, name: string): Promise<DeskCard> {
  const existing = await deskFor(userId);
  if (existing) return card(existing);
  const sql = await getSql();
  const id = crypto.randomUUID();
  const code = joinCode();
  const title = name.trim() || "WordPressistic";
  await sql`
    insert into desk (id, name, join_code, created_by)
    values (${id}, ${title}, ${code}, ${userId})
  `;
  await sql`
    insert into desk_member (desk_id, user_id, role)
    values (${id}, ${userId}, 'owner')
  `;
  const desk = await deskFor(userId);
  if (!desk) throw new Error("Could not create the desk.");
  return card(desk);
}

export async function joinDesk(userId: string, code: string): Promise<DeskCard> {
  const existing = await deskFor(userId);
  if (existing) return card(existing);
  const sql = await getSql();
  const found = await sql<{ id: string }>`
    select id from desk where join_code = ${code.trim().toUpperCase()} limit 1
  `;
  const deskId = found[0]?.id;
  if (!deskId) throw new Error("That team code does not match a desk.");
  await sql`
    insert into desk_member (desk_id, user_id, role)
    values (${deskId}, ${userId}, 'agent')
    on conflict (desk_id, user_id) do nothing
  `;
  const desk = await deskFor(userId);
  if (!desk) throw new Error("Could not join the desk.");
  return card(desk);
}

export async function saveAnychat(userId: string, apiKey: string, channelId: string): Promise<DeskCard> {
  const desk = await requireDesk(userId);
  const key = apiKey.trim();
  if (key && key.length < 8) throw new Error("Paste the AnyChat API key from Settings → API settings.");
  if (key) await anychatWorkspace(key);
  const sql = await getSql();
  await sql`
    update desk
    set anychat_key = ${key || desk.anychat_key},
        anychat_channel = ${channelId.trim() || null}
    where id = ${desk.id}
  `;
  const next = await deskFor(userId);
  if (!next) throw new Error("Desk missing.");
  return card(next);
}

export async function anychatStatus(userId: string): Promise<{ title: string; channels: AnychatChannel[] }> {
  const desk = await requireDesk(userId);
  if (!desk.anychat_key) throw new Error("Add the AnyChat API key first.");
  return anychatWorkspace(desk.anychat_key);
}

export async function listChats(userId: string): Promise<AnychatChat[]> {
  const desk = await requireDesk(userId);
  if (!desk.anychat_key) return [];
  return anychatChats(desk.anychat_key);
}

export async function chatThread(userId: string, chatId: string): Promise<AnychatMessage[]> {
  const desk = await requireDesk(userId);
  if (!desk.anychat_key) throw new Error("Add the AnyChat API key first.");
  return anychatMessages(desk.anychat_key, chatId);
}

export async function replyChat(userId: string, chatId: string, message: string): Promise<void> {
  const desk = await requireDesk(userId);
  if (!desk.anychat_key) throw new Error("Add the AnyChat API key first.");
  const text = message.trim();
  if (!text) throw new Error("Write a reply first.");
  await anychatSend(desk.anychat_key, chatId, text);
}

export async function openWhatsapp(userId: string, phone: string, message: string): Promise<void> {
  const desk = await requireDesk(userId);
  if (!desk.anychat_key) throw new Error("Add the AnyChat API key first.");
  if (!desk.anychat_channel) throw new Error("Pick the WhatsApp channel after testing the key.");
  const text = message.trim();
  if (!text) throw new Error("Write the first message.");
  const normalized = phone.trim();
  if (!/^\+\d{8,15}$/.test(normalized)) throw new Error("Use the full number, like +15055550198.");
  await anychatStartWhatsapp(desk.anychat_key, {
    channel: desk.anychat_channel,
    phone: normalized,
    message: text,
  });
}

type MailboxRow = MailboxCard & { secret: string; desk_id: string };

function mailboxCard(row: MailboxRow): MailboxCard {
  return {
    id: row.id,
    label: row.label,
    address: row.address,
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    username: row.username,
  };
}

async function mailboxRows(deskId: string): Promise<MailboxRow[]> {
  const sql = await getSql();
  return sql<MailboxRow>`
    select id, desk_id, label, address,
      imap_host as "imapHost", imap_port as "imapPort",
      smtp_host as "smtpHost", smtp_port as "smtpPort",
      username, secret
    from mailbox
    where desk_id = ${deskId}
    order by created_at asc
  `;
}

export async function listMailboxes(userId: string): Promise<MailboxCard[]> {
  const desk = await requireDesk(userId);
  return (await mailboxRows(desk.id)).map(mailboxCard);
}

export async function saveMailbox(
  userId: string,
  input: MailboxCard & { secret: string },
): Promise<MailboxCard> {
  const desk = await requireDesk(userId);
  const address = input.address.trim().toLowerCase();
  if (!address.includes("@")) throw new Error("Enter the full mailbox address.");
  if (!input.imapHost.trim() || !input.smtpHost.trim()) throw new Error("IMAP and SMTP hosts are required.");
  const secret = input.secret.trim();
  if (!secret) throw new Error("Enter the mailbox password or app password.");
  const sql = await getSql();
  const id = input.id || crypto.randomUUID();
  const existing = await sql<{ id: string }>`
    select id from mailbox where id = ${id} and desk_id = ${desk.id} limit 1
  `;
  if (existing[0]) {
    await sql`
      update mailbox
      set label = ${input.label.trim() || address},
          address = ${address},
          imap_host = ${input.imapHost.trim()},
          imap_port = ${input.imapPort},
          smtp_host = ${input.smtpHost.trim()},
          smtp_port = ${input.smtpPort},
          username = ${input.username.trim() || address},
          secret = ${secret}
      where id = ${id} and desk_id = ${desk.id}
    `;
  } else {
    await sql`
      insert into mailbox (
        id, desk_id, label, address, imap_host, imap_port, smtp_host, smtp_port, username, secret
      ) values (
        ${id}, ${desk.id}, ${input.label.trim() || address}, ${address},
        ${input.imapHost.trim()}, ${input.imapPort}, ${input.smtpHost.trim()}, ${input.smtpPort},
        ${input.username.trim() || address}, ${secret}
      )
    `;
  }
  const rows = await mailboxRows(desk.id);
  const saved = rows.find((row) => row.id === id);
  if (!saved) throw new Error("Mailbox was not saved.");
  return mailboxCard(saved);
}

export async function removeMailbox(userId: string, id: string): Promise<void> {
  const desk = await requireDesk(userId);
  const sql = await getSql();
  await sql`delete from mail_message where mailbox_id = ${id} and desk_id = ${desk.id}`;
  await sql`delete from mailbox where id = ${id} and desk_id = ${desk.id}`;
}

function connection(row: MailboxRow): MailboxConn {
  return {
    imapHost: row.imapHost,
    imapPort: Number(row.imapPort),
    smtpHost: row.smtpHost,
    smtpPort: Number(row.smtpPort),
    username: row.username,
    secret: row.secret,
    address: row.address,
  };
}

export async function syncMailbox(userId: string, id: string): Promise<{ count: number }> {
  const desk = await requireDesk(userId);
  const rows = await mailboxRows(desk.id);
  const box = rows.find((row) => row.id === id);
  if (!box) throw new Error("That mailbox is not on this desk.");
  const messages = await readInbox(connection(box));
  const sql = await getSql();
  for (const message of messages) {
    const messageId = `${box.id}:${message.uid}`;
    await sql`
      insert into mail_message (
        id, desk_id, mailbox_id, uid, from_name, from_addr, subject, snippet, body, at
      ) values (
        ${messageId}, ${desk.id}, ${box.id}, ${message.uid}, ${message.fromName},
        ${message.fromAddr}, ${message.subject}, ${message.snippet}, ${message.body}, ${message.at}
      )
      on conflict (mailbox_id, uid) do update
      set subject = excluded.subject,
          snippet = excluded.snippet,
          body = excluded.body,
          from_name = excluded.from_name,
          from_addr = excluded.from_addr
    `;
  }
  return { count: messages.length };
}

/**
 * Webhook-driven sync: pull one mailbox's inbox into `mail_message` without a
 * user session. Used by /api/hooks/mail (Hostinger message.received push), so
 * the desk sees new mail seconds after it lands instead of on next page load.
 */
export async function syncMailboxByAddress(address: string): Promise<{ count: number; deskId: string }> {
  const sql = await getSql();
  const rows = await sql<MailboxRow>`
    select id, desk_id, label, address,
      imap_host as "imapHost", imap_port as "imapPort",
      smtp_host as "smtpHost", smtp_port as "smtpPort",
      username, secret
    from mailbox
    where lower(address) = lower(${address})
    limit 1
  `;
  const box = rows[0];
  if (!box) throw new Error(`No desk mailbox is configured for ${address}`);
  const messages = await readInbox(connection(box));
  for (const message of messages) {
    const messageId = `${box.id}:${message.uid}`;
    await sql`
      insert into mail_message (
        id, desk_id, mailbox_id, uid, from_name, from_addr, subject, snippet, body, at
      ) values (
        ${messageId}, ${box.desk_id}, ${box.id}, ${message.uid}, ${message.fromName},
        ${message.fromAddr}, ${message.subject}, ${message.snippet}, ${message.body}, ${message.at}
      )
      on conflict (mailbox_id, uid) do update
      set subject = excluded.subject,
          snippet = excluded.snippet,
          body = excluded.body,
          from_name = excluded.from_name,
          from_addr = excluded.from_addr
    `;
  }
  return { count: messages.length, deskId: box.desk_id };
}

export async function listMail(userId: string): Promise<MailCard[]> {
  const desk = await requireDesk(userId);
  const sql = await getSql();
  return sql<MailCard>`
    select m.id, m.mailbox_id as "mailboxId", b.label as mailbox,
      m.from_name as "fromName", m.from_addr as "fromAddr",
      m.subject, m.snippet, m.body,
      to_char(m.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at
    from mail_message m
    join mailbox b on b.id = m.mailbox_id and b.desk_id = ${desk.id}
    where m.desk_id = ${desk.id}
    order by m.at desc
    limit 80
  `;
}

export async function replyMail(
  userId: string,
  input: { mailboxId: string; to: string; subject: string; text: string },
): Promise<void> {
  const desk = await requireDesk(userId);
  const rows = await mailboxRows(desk.id);
  const box = rows.find((row) => row.id === input.mailboxId);
  if (!box) throw new Error("Pick the mailbox to send from.");
  const to = input.to.trim();
  if (!to.includes("@")) throw new Error("Reply needs an email address.");
  const text = input.text.trim();
  if (!text) throw new Error("Write the reply first.");
  await sendMail(connection(box), {
    to,
    subject: input.subject.trim() || "Re: Insightistic",
    text,
  });
}
