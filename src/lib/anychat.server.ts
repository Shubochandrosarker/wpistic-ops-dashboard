const BASE = "https://api.anychat.one/public/v1";

export type AnychatChannel = { id: string; title: string; kind: string };
export type AnychatChat = { id: string; title: string; preview: string; at: string; source: string };
export type AnychatMessage = { id: string; text: string; at: string; mine: boolean };

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function pick(record: Json, keys: string[]): string {
  for (const key of keys) {
    const found = textOf(record[key]);
    if (found) return found;
  }
  return "";
}

function stamp(value: unknown): string {
  if (typeof value === "number" && value > 1_000_000_000) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  const raw = textOf(value);
  if (!raw) return new Date().toISOString();
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}

async function anychat(apiKey: string, path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey,
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { message: raw.slice(0, 300) };
    }
  }
  if (!response.ok) {
    const record = asRecord(payload);
    const message = record ? pick(record, ["message", "error", "detail"]) : "";
    throw new Error(message || `AnyChat returned ${response.status}`);
  }
  return payload;
}

export async function anychatWorkspace(apiKey: string): Promise<{ title: string; channels: AnychatChannel[] }> {
  const payload = asRecord(await anychat(apiKey, "/workspace")) ?? {};
  const list = Array.isArray(payload.channels) ? payload.channels : [];
  const channels = list.flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const id = pick(record, ["guid", "id", "channel_id", "uuid"]);
    if (!id) return [];
    return [
      {
        id,
        title: pick(record, ["title", "name", "label"]) || "Channel",
        kind: pick(record, ["type", "source", "channel_type", "kind"]).toLowerCase(),
      },
    ];
  });
  return { title: pick(payload, ["title", "name"]) || "Workspace", channels };
}

export async function anychatChats(apiKey: string): Promise<AnychatChat[]> {
  const payload = await anychat(apiKey, "/chat?page=1&limit=30");
  const record = asRecord(payload);
  const list = Array.isArray(payload) ? payload : Array.isArray(record?.data) ? record.data : [];
  return list.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const id = pick(row, ["guid", "id", "thread_guid", "chat_id"]);
    if (!id) return [];
    const contact = asRecord(row.contact);
    const last = asRecord(row.last_message) ?? asRecord(row.message);
    return [
      {
        id,
        title:
          (contact && pick(contact, ["name", "full_name", "email", "phone"])) ||
          pick(row, ["title", "name", "subject", "phone"]) ||
          "Conversation",
        preview: (last && pick(last, ["message", "text", "body"])) || pick(row, ["last_message_text", "preview", "message"]),
        at: stamp(row.updated_at ?? row.created_at ?? last?.created_at),
        source: pick(row, ["source", "channel_type", "type"]) || "chat",
      },
    ];
  });
}

export async function anychatMessages(apiKey: string, chatId: string): Promise<AnychatMessage[]> {
  const payload = await anychat(apiKey, `/chat/${encodeURIComponent(chatId)}/message?page=1&limit=40`);
  const record = asRecord(payload);
  const list = Array.isArray(payload) ? payload : Array.isArray(record?.data) ? record.data : [];
  return list
    .flatMap((item) => {
      const row = asRecord(item);
      if (!row) return [];
      const text = pick(row, ["message", "text", "body"]);
      return [
        {
          id: pick(row, ["id", "guid"]) || text.slice(0, 12),
          text,
          at: stamp(row.created_at ?? row.updated_at),
          mine: textOf(row.is_service) === "1" || row.is_bot === true || pick(row, ["direction"]) === "out",
        },
      ];
    })
    .reverse();
}

export async function anychatSend(apiKey: string, chatId: string, message: string): Promise<void> {
  await anychat(apiKey, `/chat/${encodeURIComponent(chatId)}/message`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function anychatStartWhatsapp(
  apiKey: string,
  input: { channel: string; phone: string; message: string },
): Promise<void> {
  await anychat(apiKey, "/chat", {
    method: "POST",
    body: JSON.stringify({
      channel: input.channel,
      phone: input.phone,
      message: input.message,
    }),
  });
}
