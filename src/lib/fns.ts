import { createServerFn } from "@tanstack/react-start";
import { toE164 } from "@/lib/phone";

function apiKeyOf(value: unknown): string {
  const apiKey = typeof value === "string" ? value.trim() : "";
  if (apiKey.length < 12 || apiKey.length > 400) throw new Error("Enter a Telnyx API key");
  return apiKey;
}

function phoneOf(value: unknown, label: string): string {
  const phone = toE164(typeof value === "string" ? value : "");
  if (!phone) throw new Error(`${label} must be a full phone number, like +15055201914`);
  return phone;
}

export const registerDeskFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; publicKey?: string; number?: string }) => data)
  .handler(async ({ data }) => {
    const { registerDesk } = await import("@/lib/inbox-buffer.server");
    return registerDesk({
      token: data.token,
      publicKey: data.publicKey,
      number: data.number,
    });
  });

export const pullInboxFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; since?: string }) => data)
  .handler(async ({ data }) => {
    const { pullEvents } = await import("@/lib/inbox-buffer.server");
    return { events: pullEvents(data.token, data.since) };
  });

export const loadSnapshotFn = createServerFn({ method: "POST" })
  .validator((data: { apiKey: string; businessNumber: string }) => data)
  .handler(async ({ data }) => {
    const { loadSnapshot } = await import("@/lib/telnyx.server");
    return loadSnapshot(apiKeyOf(data.apiKey), phoneOf(data.businessNumber, "Business number"));
  });

export const listTemplatesFn = createServerFn({ method: "POST" })
  .validator((data: { apiKey: string }) => data)
  .handler(async ({ data }) => {
    const { listTemplates } = await import("@/lib/telnyx.server");
    return { templates: await listTemplates(apiKeyOf(data.apiKey)) };
  });

export const listMdrsFn = createServerFn({ method: "POST" })
  .validator((data: { apiKey: string; businessNumber: string; days: number }) => data)
  .handler(async ({ data }) => {
    const { listMdrs } = await import("@/lib/telnyx.server");
    const days = [1, 7, 30].includes(data.days) ? data.days : 7;
    return {
      records: await listMdrs(
        apiKeyOf(data.apiKey),
        phoneOf(data.businessNumber, "Business number"),
        days,
      ),
    };
  });

export const sendSmsFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      apiKey: string;
      from: string;
      to: string;
      text: string;
      mediaUrl?: string;
      profileId?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const text = data.text?.trim() ?? "";
    if (!text || text.length > 1600) throw new Error("SMS text must be 1–1600 characters");
    const mediaUrl = data.mediaUrl?.trim() ?? "";
    if (mediaUrl && !/^https:\/\/\S+$/i.test(mediaUrl)) {
      throw new Error("MMS media must be a public https URL");
    }
    const { sendSms } = await import("@/lib/telnyx.server");
    return sendSms({
      apiKey: apiKeyOf(data.apiKey),
      from: phoneOf(data.from, "From"),
      to: phoneOf(data.to, "To"),
      text,
      mediaUrl: mediaUrl || undefined,
      profileId: data.profileId?.trim() || undefined,
    });
  });

export const sendWhatsappTextFn = createServerFn({ method: "POST" })
  .validator((data: { apiKey: string; from: string; to: string; text: string }) => data)
  .handler(async ({ data }) => {
    const text = data.text?.trim() ?? "";
    if (!text || text.length > 4096) throw new Error("WhatsApp text must be 1–4096 characters");
    const { sendWhatsappText } = await import("@/lib/telnyx.server");
    return sendWhatsappText({
      apiKey: apiKeyOf(data.apiKey),
      from: phoneOf(data.from, "From"),
      to: phoneOf(data.to, "To"),
      text,
    });
  });

export const sendWhatsappTemplateFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      apiKey: string;
      from: string;
      to: string;
      name: string;
      language: string;
      parameters: string[];
    }) => data,
  )
  .handler(async ({ data }) => {
    const name = data.name?.trim() ?? "";
    if (!/^[a-z0-9_]{1,512}$/i.test(name)) throw new Error("Choose a template");
    const parameters = (data.parameters ?? []).map((item) => item.trim());
    if (parameters.some((item) => !item || item.length > 1024)) {
      throw new Error("Fill every template variable");
    }
    const { sendWhatsappTemplate } = await import("@/lib/telnyx.server");
    return sendWhatsappTemplate({
      apiKey: apiKeyOf(data.apiKey),
      from: phoneOf(data.from, "From"),
      to: phoneOf(data.to, "To"),
      name,
      language: data.language?.trim() || "en_US",
      parameters,
    });
  });

export const windowFn = createServerFn({ method: "POST" })
  .validator((data: { apiKey: string; from: string; to: string }) => data)
  .handler(async ({ data }) => {
    const { conversationWindow } = await import("@/lib/telnyx.server");
    return conversationWindow({
      apiKey: apiKeyOf(data.apiKey),
      from: phoneOf(data.from, "From"),
      to: phoneOf(data.to, "To"),
    });
  });

export const writeWebhookFn = createServerFn({ method: "POST" })
  .validator((data: { apiKey: string; profileId: string; webhookUrl: string; token: string }) => data)
  .handler(async ({ data }) => {
    let url: URL;
    try {
      url = new URL(data.webhookUrl);
    } catch {
      throw new Error("Webhook URL is not valid");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Webhook URL must start with https");
    }
    if (!url.pathname.endsWith("/api/telnyx/webhook")) throw new Error("Unexpected webhook path");
    if (url.searchParams.get("desk") !== data.token) throw new Error("Webhook URL does not match this desk");
    const profileId = data.profileId?.trim() ?? "";
    if (!/^[0-9a-f-]{16,80}$/i.test(profileId)) throw new Error("Missing messaging profile id");
    const { writeWebhook } = await import("@/lib/telnyx.server");
    return writeWebhook({
      apiKey: apiKeyOf(data.apiKey),
      profileId,
      webhookUrl: url.toString(),
    });
  });
