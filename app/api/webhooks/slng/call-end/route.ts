/**
 * call_end system webhook — SLNG posts this when the call disconnects, with the
 * call_id and full transcript. This is the authoritative write-back point: we
 * correlate call_id → the dispatched CallRecord, attach the transcript and any
 * booking captured mid-call, then push the outcome to Attio.
 */
import {
  attachMeeting,
  consumePendingBooking,
  findByPhone,
  getCallRecord,
  type CallRecord,
} from "@/lib/call-store";
import { isAuthorized } from "@/lib/webhook-auth";
import { createNote, DEALS_OBJECT, updateRecord } from "@/lib/attio";
import { AGENT_STATUS, STAGES } from "@/lib/deal-schema";
import { summarizeCall } from "@/lib/agent-brain";

interface CallEndBody {
  call_id?: string;
  phone_number?: string;
  call_end_reason?: string;
  transcript?: Array<{ role: string; message: string }>;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: CallEndBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const rec =
    (body.call_id ? getCallRecord(body.call_id) : undefined) ??
    (body.phone_number ? findByPhone(body.phone_number) : undefined);

  if (!rec) {
    // Unknown call (e.g. dev server restarted, in-memory store cleared).
    console.warn("[call-end] no CallRecord for", body.call_id, body.phone_number);
    return Response.json({ status: "ignored", reason: "unknown call" });
  }

  rec.transcript = body.transcript;
  rec.endReason = body.call_end_reason;

  const booking = consumePendingBooking();
  if (booking && body.call_id) attachMeeting(body.call_id, booking);

  await writeOutcomeToAttio(rec);

  return Response.json({ status: "ok", booked: Boolean(rec.meeting) });
}

/**
 * Push the call outcome to Attio: advance the deal stage, set the next step and
 * meeting time, and attach a Note with the transcript. (A Gemini-written summary
 * can replace the raw transcript in the note as a follow-up step.)
 */
async function writeOutcomeToAttio(rec: CallRecord): Promise<void> {
  if (!rec.attioRecordId) {
    console.warn("[call-end] no attioRecordId; skipping write-back", {
      phone: rec.phoneNumber,
    });
    return;
  }

  const { meeting } = rec;
  const values: Record<string, unknown> = {
    stage: meeting ? STAGES.meetingBooked : STAGES.contacted,
    agent_status: AGENT_STATUS.done,
    last_call_outcome: meeting
      ? `Meeting booked for ${meeting.iso8601}${meeting.notes ? ` — ${meeting.notes}` : ""}`
      : `Call ended (${rec.endReason ?? "completed"}).`,
    next_step: meeting
      ? `Prepare for meeting on ${meeting.iso8601}`
      : "Follow up",
    last_activity: new Date().toISOString(),
  };
  if (meeting) values.meeting_time = meeting.iso8601;

  const summary = await summarizeCall(rec.transcript, meeting?.iso8601);

  await updateRecord(DEALS_OBJECT, rec.attioRecordId, values);
  await createNote({
    parent_object: DEALS_OBJECT,
    parent_record_id: rec.attioRecordId,
    title: `AutoCloser call — ${new Date().toISOString().slice(0, 10)}`,
    format: "markdown",
    content: formatNote(rec, summary),
  });
}

function formatNote(rec: CallRecord, summary: string): string {
  const header = [
    `**Contact:** ${rec.contactName ?? "—"} (${rec.companyName ?? "—"})`,
    `**Outcome:** ${rec.meeting ? `meeting booked for ${rec.meeting.iso8601}` : (rec.endReason ?? "completed")}`,
    "",
    "## Summary",
    summary,
    "",
    "## Transcript",
  ];
  const lines =
    rec.transcript?.map((t) => `- **${t.role}:** ${t.message}`) ?? [
      "_No transcript captured._",
    ];
  return [...header, ...lines].join("\n");
}
