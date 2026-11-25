const TELNYX = "https://api.telnyx.com/v2";

export type MessagingNumber = {
  phone_number: string;
  messaging_profile_id: string | null;
  type?: string;
  country_code?: string;
  traffic_type?: string;
  messaging_product?: string;
  health?: {
    message_count?: number;
    inbound_outbound_ratio?: number;
    success_ratio?: number;
    spam_ratio?: number;
  };
  features?: {
    sms?: {
      domestic_two_way?: boolean;
      international_inbound?: boolean;
      international_outbound?: boolean;
    } | null;
    mms?: {
      domestic_two_way?: boolean;
      international_inbound?: boolean;
      international_outbound?: boolean;
    } | null;
  };
};

export type ProfileInfo = {
  id: string;
  name: string;
  enabled?: boolean;
  webhook_url: string | null;
  webhook_api_version?: string;
};

export type WaNumber = {
  phone_number?: string;
  phone_number_id?: string;
  display_name?: string;
  status?: string;
  quality_rating?: string;
};

export type Waba = {
  id?: string;
  waba_id?: string;
  name?: string;
  status?: string;
  business_verification_status?: string;
  account_review_status?: string;
};

export type Campaign = {
  phoneNumber?: string;
  assignmentStatus?: string;
  campaignId?: string;
  brandId?: string;
  tcrCampaignId?: string;
  tcrBrandId?: string;
  failureReasons?: string;
};

export type TemplateCard = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  rejection_reason: string;
  body: string;
  slots: number;
};

export type Mdr = {
  id?: string;
  created_at?: string;
  direction?: string;
  cli?: string;
  cld?: string;
  status?: string;
  message_type?: string;
  parts?: number;
  cost?: string;
  currency?: string;
};

export type DeskSnapshot = {
  balance: { balance: string; currency: string; available: string } | null;
  balanceError?: string;
  number: MessagingNumber | null;
  numberError?: string;
  profile: ProfileInfo | null;
  profileError?: string;
  profiles: { id: string; name: string }[];
  whatsappNumbers: WaNumber[];
  whatsappError?: string;
  wabas: Waba[];
  campaign: Campaign | null;
  campaignError?: string;
};

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Json;
}

function extractError(json: unknown, fallback: string): string {
  const record = asRecord(json);
  const errors = record?.errors;
  if (Array.isArray(errors) && errors[0] && typeof errors[0] === "object") {
    const error = errors[0] as Json;
    const parts = [error.title, error.detail, error.code].filter(
      (part) => typeof part === "string" && part,
    );
    if (parts.length) return parts.join(" — ");
  }
  return fallback;
}

async function telnyx(apiKey: string, path: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${TELNYX}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const text = await response.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!response.ok) {
      throw new Error(extractError(json, `Telnyx returned ${response.status}`));
    }
    return json;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Telnyx took too long to respond");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function dataOf(json: unknown): unknown {
  const record = asRecord(json);
  if (record && "data" in record) return record.data;
  return json;
}

function listOf(json: unknown): Json[] {
  const data = dataOf(json);
  if (Array.isArray(data)) return data.map(asRecord).filter((item): item is Json => !!item);
  return [];
}

async function tryCall<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string }> {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Request failed" };
  }
}

export async function loadSnapshot(apiKey: string, businessNumber: string): Promise<DeskSnapshot> {
  const encoded = encodeURIComponent(businessNumber);
  const [balanceR, numberR, waNumbersR, wabaR, campaignR, profilesR] = await Promise.all([
    tryCall(() => telnyx(apiKey, "/balance")),
    tryCall(() => telnyx(apiKey, `/phone_numbers/messaging?filter%5Bphone_number%5D=${encoded}`)),
    tryCall(() => telnyx(apiKey, "/whatsapp/phone_numbers?page%5Bsize%5D=50")),
    tryCall(() => telnyx(apiKey, "/whatsapp/business_accounts?page%5Bsize%5D=20")),
    tryCall(() => telnyx(apiKey, `/10dlc/phone_number_campaigns/${encoded}`)),
    tryCall(() => telnyx(apiKey, "/messaging_profiles?page%5Bsize%5D=30")),
  ]);

  if (numberR.error && balanceR.error && profilesR.error) {
    throw new Error(numberR.error || balanceR.error || "Could not reach Telnyx");
  }

  const numbers = numberR.value ? listOf(numberR.value) : [];
  const number = (numbers[0] as MessagingNumber | undefined) ?? null;
  const profileId = number?.messaging_profile_id ?? "";

  let profile: ProfileInfo | null = null;
  let profileError: string | undefined;
  if (profileId) {
    const profileR = await tryCall(() => telnyx(apiKey, `/messaging_profiles/${profileId}`));
    profileError = profileR.error;
    const raw = asRecord(dataOf(profileR.value));
    if (raw && typeof raw.id === "string") {
      profile = {
        id: raw.id,
        name: typeof raw.name === "string" ? raw.name : "Messaging profile",
        enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
        webhook_url: typeof raw.webhook_url === "string" ? raw.webhook_url : null,
        webhook_api_version:
          typeof raw.webhook_api_version === "string" ? raw.webhook_api_version : undefined,
      };
    }
  }

  const profiles = (profilesR.value ? listOf(profilesR.value) : [])
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      name: typeof item.name === "string" ? item.name : "Profile",
    }))
    .filter((item) => item.id);

  const balanceRaw = asRecord(dataOf(balanceR.value));
  const balance = balanceRaw
    ? {
        balance: String(balanceRaw.balance ?? ""),
        currency: String(balanceRaw.currency ?? "USD"),
        available: String(balanceRaw.available_credit ?? ""),
      }
    : null;

  const campaignRaw = asRecord(dataOf(campaignR.value)) ?? asRecord(campaignR.value);

  return {
    balance,
    balanceError: balanceR.error,
    number,
    numberError: numberR.error,
    profile,
    profileError,
    profiles,
    whatsappNumbers: waNumbersR.value ? (listOf(waNumbersR.value) as WaNumber[]) : [],
    whatsappError: waNumbersR.error,
    wabas: wabaR.value ? (listOf(wabaR.value) as Waba[]) : [],
    campaign: campaignRaw
      ? {
          phoneNumber: typeof campaignRaw.phoneNumber === "string" ? campaignRaw.phoneNumber : undefined,
          assignmentStatus:
            typeof campaignRaw.assignmentStatus === "string" ? campaignRaw.assignmentStatus : undefined,
          campaignId: typeof campaignRaw.campaignId === "string" ? campaignRaw.campaignId : undefined,
          brandId: typeof campaignRaw.brandId === "string" ? campaignRaw.brandId : undefined,
          tcrCampaignId:
            typeof campaignRaw.tcrCampaignId === "string" ? campaignRaw.tcrCampaignId : undefined,
          tcrBrandId: typeof campaignRaw.tcrBrandId === "string" ? campaignRaw.tcrBrandId : undefined,
          failureReasons:
            typeof campaignRaw.failureReasons === "string" ? campaignRaw.failureReasons : undefined,
        }
      : null,
    campaignError: campaignR.error,
  };
}

export async function listTemplates(apiKey: string): Promise<TemplateCard[]> {
  const json = await telnyx(apiKey, "/whatsapp/message_templates?page%5Bsize%5D=50");
  return listOf(json).map((item) => {
    const components = Array.isArray(item.components) ? item.components : [];
    const bodyComponent = components.find((entry) => {
      const record = asRecord(entry);
      return record && String(record.type ?? "").toUpperCase() === "BODY";
    });
    const bodyRecord = asRecord(bodyComponent);
    const body = bodyRecord && typeof bodyRecord.text === "string" ? bodyRecord.text : "";
    const slots = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
    return {
      id: typeof item.id === "string" ? item.id : typeof item.name === "string" ? item.name : "",
      name: typeof item.name === "string" ? item.name : "",
      language: typeof item.language === "string" ? item.language : "en_US",
      status: typeof item.status === "string" ? item.status : "",
      category: typeof item.category === "string" ? item.category : "",
      rejection_reason: typeof item.rejection_reason === "string" ? item.rejection_reason : "",
      body,
      slots: slots.length ? Math.max(...slots) : 0,
    };
  });
}

export async function listMdrs(apiKey: string, businessNumber: string, days: number): Promise<Mdr[]> {
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const range = `start_date=${encodeURIComponent(start.toISOString())}&end_date=${encodeURIComponent(end.toISOString())}`;
  const encoded = encodeURIComponent(businessNumber);
  const [out, inn] = await Promise.all([
    tryCall(() => telnyx(apiKey, `/reports/mdrs?${range}&cli=${encoded}`)),
    tryCall(() => telnyx(apiKey, `/reports/mdrs?${range}&cld=${encoded}`)),
  ]);
  if (out.error && inn.error) throw new Error(out.error || inn.error || "Could not load message records");
  const rows = [...(out.value ? listOf(out.value) : []), ...(inn.value ? listOf(inn.value) : [])] as Mdr[];
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      const id = row.id ?? `${row.created_at}-${row.cli}-${row.cld}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export type SendResult = {
  id: string;
  status: string;
  to: string;
  cost?: string;
  rawType?: string;
};

function sendResult(json: unknown, fallbackTo: string): SendResult {
  const data = asRecord(dataOf(json));
  if (!data) throw new Error("Telnyx did not return a message");
  const toList = Array.isArray(data.to) ? asRecord(data.to[0]) : null;
  return {
    id: typeof data.id === "string" ? data.id : "",
    status: toList && typeof toList.status === "string" ? toList.status : "queued",
    to: toList && typeof toList.phone_number === "string" ? toList.phone_number : fallbackTo,
    cost: asRecord(data.cost) && typeof asRecord(data.cost)?.amount === "string"
      ? String(asRecord(data.cost)?.amount)
      : undefined,
    rawType: typeof data.type === "string" ? data.type : undefined,
  };
}

export async function sendSms(input: {
  apiKey: string;
  from: string;
  to: string;
  text: string;
  mediaUrl?: string;
  profileId?: string;
}): Promise<SendResult> {
  const body: Json = {
    from: input.from,
    to: input.to,
    text: input.text,
    type: input.mediaUrl ? "MMS" : "SMS",
  };
  if (input.mediaUrl) body.media_urls = [input.mediaUrl];
  if (input.profileId) body.messaging_profile_id = input.profileId;
  const json = await telnyx(input.apiKey, "/messages", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
  return sendResult(json, input.to);
}

export async function sendWhatsappText(input: {
  apiKey: string;
  from: string;
  to: string;
  text: string;
}): Promise<SendResult> {
  const json = await telnyx(input.apiKey, "/messages/whatsapp", {
    method: "POST",
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      whatsapp_message: {
        type: "text",
        text: { body: input.text, preview_url: false },
      },
    }),
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
  return sendResult(json, input.to);
}

export async function sendWhatsappTemplate(input: {
  apiKey: string;
  from: string;
  to: string;
  name: string;
  language: string;
  parameters: string[];
}): Promise<SendResult> {
  const template: Json = {
    name: input.name,
    language: { policy: "deterministic", code: input.language || "en_US" },
  };
  if (input.parameters.length) {
    template.components = [
      {
        type: "body",
        parameters: input.parameters.map((text) => ({ type: "text", text })),
      },
    ];
  }
  const json = await telnyx(input.apiKey, "/messages/whatsapp", {
    method: "POST",
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      whatsapp_message: { type: "template", template },
    }),
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
  return sendResult(json, input.to);
}

export async function conversationWindow(input: {
  apiKey: string;
  from: string;
  to: string;
}): Promise<{ window_active: boolean; window_expires_at: string | null }> {
  const json = await telnyx(
    input.apiKey,
    `/whatsapp/phone_numbers/${encodeURIComponent(input.from)}/conversation_window?destination_number=${encodeURIComponent(input.to)}`,
  );
  const data = asRecord(dataOf(json));
  return {
    window_active: data?.window_active === true,
    window_expires_at: typeof data?.window_expires_at === "string" ? data.window_expires_at : null,
  };
}

export async function writeWebhook(input: {
  apiKey: string;
  profileId: string;
  webhookUrl: string;
}): Promise<{ webhook_url: string | null }> {
  const json = await telnyx(input.apiKey, `/messaging_profiles/${input.profileId}`, {
    method: "PATCH",
    body: JSON.stringify({
      webhook_url: input.webhookUrl,
      webhook_api_version: "2",
    }),
  });
  const data = asRecord(dataOf(json));
  return { webhook_url: typeof data?.webhook_url === "string" ? data.webhook_url : input.webhookUrl };
}
