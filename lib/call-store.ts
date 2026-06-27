/**
 * Correlates a dispatched call_id back to the Attio record + context it was for,
 * so the call_end webhook can write the outcome to the right place.
 *
 * Backed by the Neon `ac_calls` table so state survives across separate webhook
 * invocations (dispatch → book_meeting → call_end each arrive as their own HTTP
 * request, potentially on different serverless instances). An in-memory Map
 * could not be shared across them.
 */
import { db } from "./db";

export interface CallRecord {
  callId: string;
  phoneNumber: string;
  /** Attio deal/record id this call advances (if known). */
  attioRecordId?: string;
  contactName?: string;
  companyName?: string;
  dispatchedAt: string;
  meeting?: { iso8601: string; notes?: string };
  transcript?: Array<{ role: string; message: string }>;
  endReason?: string;
}

/** Shape of a row in the `ac_calls` table. */
interface CallRow {
  call_id: string;
  phone_number: string;
  attio_record_id: string | null;
  contact_name: string | null;
  company_name: string | null;
  dispatched_at: string | Date;
  meeting_iso8601: string | Date | null;
  meeting_notes: string | null;
  transcript: Array<{ role: string; message: string }> | null;
  end_reason: string | null;
  ended_at: string | Date | null;
}

/** Postgres timestamps come back as Date (or string); normalise to ISO-8601. */
function iso(value: string | Date | null | undefined): string | undefined {
  if (value == null) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toRecord(row: CallRow): CallRecord {
  return {
    callId: row.call_id,
    phoneNumber: row.phone_number,
    attioRecordId: row.attio_record_id ?? undefined,
    contactName: row.contact_name ?? undefined,
    companyName: row.company_name ?? undefined,
    dispatchedAt: iso(row.dispatched_at) ?? new Date().toISOString(),
    meeting: row.meeting_iso8601
      ? { iso8601: iso(row.meeting_iso8601)!, notes: row.meeting_notes ?? undefined }
      : undefined,
    transcript: row.transcript ?? undefined,
    endReason: row.end_reason ?? undefined,
  };
}

export async function recordDispatch(rec: CallRecord): Promise<void> {
  await db()`
    INSERT INTO ac_calls
      (call_id, phone_number, attio_record_id, contact_name, company_name, dispatched_at)
    VALUES
      (${rec.callId}, ${rec.phoneNumber}, ${rec.attioRecordId ?? null},
       ${rec.contactName ?? null}, ${rec.companyName ?? null}, ${rec.dispatchedAt})
    ON CONFLICT (call_id) DO NOTHING
  `;
}

export async function getCallRecord(
  callId: string,
): Promise<CallRecord | undefined> {
  const rows = (await db()`
    SELECT * FROM ac_calls WHERE call_id = ${callId} LIMIT 1
  `) as CallRow[];
  return rows[0] ? toRecord(rows[0]) : undefined;
}

export async function findByPhone(
  phoneNumber: string,
): Promise<CallRecord | undefined> {
  const rows = (await db()`
    SELECT * FROM ac_calls
    WHERE phone_number = ${phoneNumber}
    ORDER BY dispatched_at DESC
    LIMIT 1
  `) as CallRow[];
  return rows[0] ? toRecord(rows[0]) : undefined;
}

/**
 * The book_meeting tool webhook fires mid-call and carries no call_id, so we
 * attach the agreed slot to the most recent call that has not yet ended — the
 * one live call. (Correct for one outbound call at a time, which is how the
 * orchestrator dispatches.) The subsequent call_end webhook then reads it back.
 */
export async function attachBookingToActiveCall(meeting: {
  iso8601: string;
  notes?: string;
}): Promise<CallRecord | undefined> {
  const rows = (await db()`
    UPDATE ac_calls
    SET meeting_iso8601 = ${meeting.iso8601}, meeting_notes = ${meeting.notes ?? null}
    WHERE call_id = (
      SELECT call_id FROM ac_calls
      WHERE ended_at IS NULL
      ORDER BY dispatched_at DESC
      LIMIT 1
    )
    RETURNING *
  `) as CallRow[];
  return rows[0] ? toRecord(rows[0]) : undefined;
}

/**
 * Mark a call finished: persist transcript + end reason and stamp ended_at so it
 * is no longer the "active" call. Returns the full record (including any meeting
 * attached mid-call) for write-back.
 */
export async function finalizeCall(
  callId: string,
  transcript: Array<{ role: string; message: string }> | undefined,
  endReason: string | undefined,
): Promise<CallRecord | undefined> {
  const rows = (await db()`
    UPDATE ac_calls
    SET transcript = ${transcript ? JSON.stringify(transcript) : null}::jsonb,
        end_reason = ${endReason ?? null},
        ended_at = now()
    WHERE call_id = ${callId}
    RETURNING *
  `) as CallRow[];
  return rows[0] ? toRecord(rows[0]) : undefined;
}
