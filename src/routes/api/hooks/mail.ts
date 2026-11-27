import { createFileRoute } from "@tanstack/react-router";

/**
 * Hostinger Mail webhook receiver (`message.received`).
 *
 * Registered per mailbox via POST /api/mail/v1/mailboxes/{id}/webhooks with a
 * URL that carries this route plus a shared secret token, so unknown senders
 * cannot trigger IMAP pulls. The delivery payload shape is not documented, so
 * the handler deep-scans the JSON for a recipient address that matches a
 * configured desk mailbox and IMAP-syncs that mailbox; every raw delivery is
 * logged into mail_hook_log for audit.
 */
export const Route = createFileRoute("/api/hooks/mail")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, service: "line-desk-mail-hook" }),
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const expected = process.env.MAIL_HOOK_TOKEN ?? "";
        if (!expected || url.searchParams.get("token") !== expected) {
          return Response.json({ ok: false, error: "bad token" }, { status: 401 });
        }
        const raw = await request.text();
        let payload: unknown = null;
        try {
          payload = JSON.parse(raw || "{}");
        } catch {
          payload = { raw: raw.slice(0, 2000) };
        }
        const { syncMailboxByAddress } = await import("@/lib/support.server");
        const { getSql } = await import("@/lib/db");
        const sql = await getSql();
        let result = "";
        try {
          const address = await findAddress(sql, payload);
          if (address) {
            const synced = await syncMailboxByAddress(address);
            result = `synced ${synced.count} messages for ${address}`;
          } else {
            result = "no matching mailbox address in payload";
          }
          await sql`insert into mail_hook_log (at, payload, result) values (now(), ${raw.slice(0, 8000)}, ${result})`;
        } catch (hookError) {
          const message = hookError instanceof Error ? hookError.message : String(hookError);
          try {
            await sql`insert into mail_hook_log (at, payload, result) values (now(), ${raw.slice(0, 8000)}, ${`error: ${message}`})`;
          } catch {
            /* logging must never mask the response */
          }
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
        return Response.json({ ok: true, result });
      },
    },
  },
});

/** Deep-scan the payload for any @-address that is a configured desk mailbox. */
async function findAddress(sql: import("@/lib/db").Sql, payload: unknown): Promise<string> {
  const rows = await sql<{ address: string }>`
    select lower(address) as address from mailbox
  `;
  const known = rows.map((row) => row.address.toLowerCase());
  if (known.length === 0) return "";
  const found: string[] = [];
  walk(payload);
  function walk(node: unknown): void {
    if (found.length > 4) return;
    if (typeof node === "string") {
      const matches = node.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? [];
      found.push(...matches);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const value of Object.values(node as Record<string, unknown>)) walk(value);
    }
  }
  return found.find((candidate) => known.includes(candidate)) ?? "";
}
