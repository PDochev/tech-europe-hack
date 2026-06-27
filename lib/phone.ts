/** E.164 validation + the optional toll-fraud destination allowlist. */

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
