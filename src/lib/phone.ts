export function digits(input: string): string {
  return input.replace(/\D/g, "");
}

export function toE164(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const d = digits(trimmed);
  if (trimmed.startsWith("+") && d.length >= 8 && d.length <= 15) return `+${d}`;
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (d.length >= 8 && d.length <= 15) return `+${d}`;
  return "";
}

export function formatPhone(input: string): string {
  const e164 = toE164(input) || input.trim();
  const d = digits(e164);
  if (d.length === 11 && d.startsWith("1")) {
    return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  }
  return e164.startsWith("+") ? e164 : input.trim();
}

export function samePhone(a: string, b: string): boolean {
  const da = digits(a);
  const db = digits(b);
  if (!da || !db) return false;
  return da === db || da.endsWith(db) || db.endsWith(da);
}

export function smsSegments(text: string): { parts: number; unicode: boolean } {
  const unicode = /[^\n\r\x20-\x7E£¥èéùìòÇØøÅåΔΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà]/.test(text);
  if (!text) return { parts: 0, unicode };
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  if (text.length <= single) return { parts: 1, unicode };
  return { parts: Math.ceil(text.length / multi), unicode };
}

export const BUSINESS_NUMBER = "+15055201914";
