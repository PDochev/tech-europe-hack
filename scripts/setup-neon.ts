/**
 * Create the `ac_calls` run-state table in Neon.
 *
 *   export DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"
 *   npx tsx scripts/setup-neon.ts
 *
 * Idempotent — safe to re-run. Backs lib/call-store.ts.
 */
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required (Neon connection string).");
  const sql = neon(url);

  await sql`
    CREATE TABLE IF NOT EXISTS ac_calls (
      call_id          text PRIMARY KEY,
      phone_number     text NOT NULL,
      attio_record_id  text,
      contact_name     text,
      company_name     text,
      dispatched_at    timestamptz NOT NULL DEFAULT now(),
      meeting_iso8601  timestamptz,
      meeting_notes    text,
      transcript       jsonb,
      end_reason       text,
      ended_at         timestamptz
    )
  `;

  // findByPhone: latest call for a number.
  await sql`
    CREATE INDEX IF NOT EXISTS ac_calls_phone_idx
      ON ac_calls (phone_number, dispatched_at DESC)
  `;

  // attachBookingToActiveCall: most recent not-yet-ended call.
  await sql`
    CREATE INDEX IF NOT EXISTS ac_calls_active_idx
      ON ac_calls (dispatched_at DESC) WHERE ended_at IS NULL
  `;

  console.log("✅ ac_calls table ready.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
