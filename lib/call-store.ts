/**
 * Correlates a dispatched call_id back to the Attio record + context it was for,
 * so the call_end webhook can write the outcome to the right place.
 *
 * Dev-only in-memory store. In production this is the Supabase `runs` / `run_steps`
 * table (see the plan); swap the implementation, keep the interface.
 */
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

const calls = new Map<string, CallRecord>();

export function recordDispatch(rec: CallRecord): void {
  calls.set(rec.callId, rec);
}

export function getCallRecord(callId: string): CallRecord | undefined {
  return calls.get(callId);
}

export function attachMeeting(
  callId: string,
  meeting: { iso8601: string; notes?: string },
): CallRecord | undefined {
  const rec = calls.get(callId);
  if (rec) rec.meeting = meeting;
  return rec;
}

export function findByPhone(phoneNumber: string): CallRecord | undefined {
  for (const rec of calls.values()) {
    if (rec.phoneNumber === phoneNumber) return rec;
  }
  return undefined;
}

/**
 * The book_meeting tool webhook fires mid-call and carries no call_id, so we
 * stash the booking here and let the subsequent call_end webhook (which does
 * have the call_id) claim it. Single-slot: correct for one live call at a time.
 */
let pendingBooking: { iso8601: string; notes?: string } | undefined;

export function setPendingBooking(meeting: { iso8601: string; notes?: string }): void {
  pendingBooking = meeting;
}

export function consumePendingBooking(): { iso8601: string; notes?: string } | undefined {
  const m = pendingBooking;
  pendingBooking = undefined;
  return m;
}
