/** E.164 validation + the optional toll-fraud destination allowlist. */

/** Strip spaces, hyphens, dots and parens so "+44 7555 174731" → "+447555174731". */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s().-]/g, "");
}

export function isE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

/** Comma-separated allowed E.164 prefixes in ALLOWED_CALL_PREFIXES, e.g. "+44,+1". */
export function destinationAllowed(phone: string): boolean {
  const raw = process.env.ALLOWED_CALL_PREFIXES?.trim();
  if (!raw) return true; // not configured → no prefix restriction
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .some((prefix) => phone.startsWith(prefix));
}
