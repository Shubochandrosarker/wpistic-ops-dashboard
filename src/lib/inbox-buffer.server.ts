import type { Channel } from "@/lib/desk-store";

export type StoredEvent = {
  id: string;
  at: string;
  kind: "message" | "status";
  channel: Channel;
  direction: "inbound" | "outbound";
  peer: string;
  text: string;
  status: string;
  telnyxId?: string;
  error?: string;
};

type Bucket = {
  events: StoredEvent[];
  publicKey?: string;
  number?: string;
};

type DeskGlobal = { __lineDesk?: Map<string, Bucket> };

function buckets(): Map<string, Bucket> {
  const root = globalThis as typeof globalThis & DeskGlobal;
  if (!root.__lineDesk) root.__lineDesk = new Map();
  return root.__lineDesk;
}

function bucketFor(token: string): Bucket {
  const map = buckets();
  const existing = map.get(token);
  if (existing) return existing;
  const created: Bucket = { events: [] };
  map.set(token, created);
  return created;
}

const TOKEN = /^[a-f0-9]{32,80}$/i;

export function registerDesk(input: { token: string; publicKey?: string; number?: string }) {
  if (!TOKEN.test(input.token)) throw new Error("Invalid desk token");
  const bucket = bucketFor(input.token);
  bucket.publicKey = input.publicKey?.trim() || undefined;
  bucket.number = input.number?.trim() || bucket.number;
  return { ok: true as const };
}

export function pullEvents(token: string, since?: string): StoredEvent[] {
  if (!TOKEN.test(token)) return [];
  const bucket = buckets().get(token);
  if (!bucket) return [];
  const from = since ? Date.parse(since) : 0;
  return bucket.events.filter((event) => !from || Date.parse(event.at) >= from);
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function b64ToBytes(b64: string): Uint8Array {
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/").trim();
  const pad = norm + "=".repeat((4 - (norm.length % 4)) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function verifySignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  publicKey: string,
): Promise<boolean> {
  const skew = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(skew) || skew > 300) return false;
  const keyBytes = b64ToBytes(publicKey);
  const data = new TextEncoder().encode(`${timestamp}|${rawBody}`);
  const signatureBytes = b64ToBytes(signature);
  const format: "raw" | "spki" = keyBytes.byteLength === 32 ? "raw" : "spki";
  const key = await crypto.subtle.importKey(format, copyBuffer(keyBytes), { name: "Ed25519" }, false, [
    "verify",
  ]);
  return crypto.subtle.verify({ name: "Ed25519" }, key, copyBuffer(signatureBytes), data);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function phoneOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return phoneOf(value[0]);
  const record = asRecord(value);
  if (!record) return "";
  if (typeof record.phone_number === "string") return record.phone_number;
  return "";
}

function textOf(payload: Record<string, unknown>): string {
  if (typeof payload.text === "string" && payload.text.trim()) return payload.text;
  const body = payload.body;
  if (typeof body === "string" && body.trim()) return body;
  const record = asRecord(body);
  if (!record) return "";
  if (typeof record.text === "string" && record.text.trim()) return record.text;
  const nested = asRecord(record.text);
  if (nested && typeof nested.body === "string") return nested.body;
  const template = asRecord(record.template);
  if (template && typeof template.name === "string") return `Template: ${template.name}`;
  if (typeof record.caption === "string") return record.caption;
  if (typeof record.type === "string" && record.type !== "text") return `[${record.type}]`;
  return "";
}

function parseEvent(body: unknown): StoredEvent | null {
  const root = asRecord(body);
  const data = asRecord(root?.data);
  if (!data) return null;
  const eventType = String(data.event_type ?? "");
  const payload = asRecord(data.payload);
  if (!payload) return null;
  const direction = String(payload.direction ?? "").toLowerCase() === "inbound" ? "inbound" : "outbound";
  const type = String(payload.type ?? "").toUpperCase();
  const channel: Channel =
    type === "WHATSAPP" || eventType.includes("whatsapp") || eventType === "message.echo"
      ? "whatsapp"
      : "sms";
  const from = phoneOf(payload.from);
  const to = phoneOf(payload.to);
  const peer = direction === "inbound" ? from : to;
  const toRecord = Array.isArray(payload.to) ? asRecord(payload.to[0]) : asRecord(payload.to);
  const status =
    (toRecord && typeof toRecord.status === "string" && toRecord.status) ||
    (direction === "inbound" ? "received" : "sent");
  const errors = Array.isArray(payload.errors) ? asRecord(payload.errors[0]) : null;
  const error = errors
    ? [errors.title, errors.detail].filter((part) => typeof part === "string" && part).join(" — ")
    : undefined;
  const kind = eventType === "message.finalized" ? "status" : "message";
  const telnyxId = typeof payload.id === "string" ? payload.id : undefined;
  const at = typeof data.occurred_at === "string" ? data.occurred_at : new Date().toISOString();
  const id = typeof data.id === "string" ? data.id : `${telnyxId ?? "evt"}-${at}`;
  return {
    id,
    at,
    kind,
    channel,
    direction,
    peer,
    text: textOf(payload),
    status,
    telnyxId,
    error: error || undefined,
  };
}

export async function acceptWebhook(input: {
  desk: string;
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!TOKEN.test(input.desk)) return { ok: false, status: 401, error: "Unknown desk" };
  const bucket = bucketFor(input.desk);
  if (bucket.publicKey) {
    if (!input.signature || !input.timestamp) {
      return { ok: false, status: 401, error: "Missing Telnyx signature" };
    }
    const valid = await verifySignature(
      input.rawBody,
      input.signature,
      input.timestamp,
      bucket.publicKey,
    ).catch(() => false);
    if (!valid) return { ok: false, status: 401, error: "Invalid Telnyx signature" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawBody);
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }
  const event = parseEvent(parsed);
  if (event && (event.peer || event.telnyxId)) {
    bucket.events.push(event);
    if (bucket.events.length > 400) bucket.events.splice(0, bucket.events.length - 400);
  }
  return { ok: true };
}
