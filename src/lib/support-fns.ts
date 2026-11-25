import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

export const deskStateFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { currentDesk } = await import("@/lib/support.server");
    return currentDesk(context.userId);
  });

export const createDeskFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { name: string }) => data)
  .handler(async ({ context, data }) => {
    const { createDesk } = await import("@/lib/support.server");
    return createDesk(context.userId, data.name);
  });

export const joinDeskFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { code: string }) => data)
  .handler(async ({ context, data }) => {
    const { joinDesk } = await import("@/lib/support.server");
    return joinDesk(context.userId, data.code);
  });

export const saveAnychatFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { apiKey: string; channelId: string }) => data)
  .handler(async ({ context, data }) => {
    const { saveAnychat } = await import("@/lib/support.server");
    return saveAnychat(context.userId, data.apiKey, data.channelId);
  });

export const anychatStatusFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { anychatStatus } = await import("@/lib/support.server");
    return anychatStatus(context.userId);
  });

export const listChatsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listChats } = await import("@/lib/support.server");
    return listChats(context.userId);
  });

export const chatThreadFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { chatId: string }) => data)
  .handler(async ({ context, data }) => {
    const { chatThread } = await import("@/lib/support.server");
    return chatThread(context.userId, data.chatId);
  });

export const replyChatFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { chatId: string; message: string }) => data)
  .handler(async ({ context, data }) => {
    const { replyChat } = await import("@/lib/support.server");
    await replyChat(context.userId, data.chatId, data.message);
    return { ok: true as const };
  });

export const openWhatsappFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { phone: string; message: string }) => data)
  .handler(async ({ context, data }) => {
    const { openWhatsapp } = await import("@/lib/support.server");
    await openWhatsapp(context.userId, data.phone, data.message);
    return { ok: true as const };
  });

export const listMailboxesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listMailboxes } = await import("@/lib/support.server");
    return listMailboxes(context.userId);
  });

export const saveMailboxFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (data: {
      id: string;
      label: string;
      address: string;
      imapHost: string;
      imapPort: number;
      smtpHost: string;
      smtpPort: number;
      username: string;
      secret: string;
    }) => data,
  )
  .handler(async ({ context, data }) => {
    const { saveMailbox } = await import("@/lib/support.server");
    return saveMailbox(context.userId, data);
  });

export const removeMailboxFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { removeMailbox } = await import("@/lib/support.server");
    await removeMailbox(context.userId, data.id);
    return { ok: true as const };
  });

export const syncMailboxFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { syncMailbox } = await import("@/lib/support.server");
    return syncMailbox(context.userId, data.id);
  });

export const listMailFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listMail } = await import("@/lib/support.server");
    return listMail(context.userId);
  });

export const replyMailFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { mailboxId: string; to: string; subject: string; text: string }) => data)
  .handler(async ({ context, data }) => {
    const { replyMail } = await import("@/lib/support.server");
    await replyMail(context.userId, data);
    return { ok: true as const };
  });
