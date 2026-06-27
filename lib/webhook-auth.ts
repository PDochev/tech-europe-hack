/**
 * Bearer-token auth helpers. Both fail CLOSED (deny when the secret is unset)
 * and use a constant-time comparison to avoid leaking the secret via timing.
 */
import { timingSafeEqual } from "crypto";

function bearerMatches(
  header: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false; // fail closed: no secret configured → deny
  const provided = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/** Verifies the bearer SLNG sends to our webhook tools (SLNG_WEBHOOK_SECRET). */
export function isAuthorized(request: Request): boolean {
  return bearerMatches(
    request.headers.get("authorization"),
    process.env.SLNG_WEBHOOK_SECRET,
  );
}

/** Verifies the caller of the call-dispatch route (DISPATCH_API_KEY). */
export function isDispatchAuthorized(request: Request): boolean {
  return bearerMatches(
    request.headers.get("authorization"),
    process.env.DISPATCH_API_KEY,
  );
}
