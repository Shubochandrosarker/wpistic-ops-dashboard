import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/telnyx/webhook")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, service: "line-desk" }),
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const desk = url.searchParams.get("desk") ?? "";
        const rawBody = await request.text();
        const { acceptWebhook } = await import("@/lib/inbox-buffer.server");
        const result = await acceptWebhook({
          desk,
          rawBody,
          signature: request.headers.get("telnyx-signature-ed25519"),
          timestamp: request.headers.get("telnyx-timestamp"),
        });
        if (!result.ok) {
          return Response.json({ ok: false, error: result.error }, { status: result.status });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
