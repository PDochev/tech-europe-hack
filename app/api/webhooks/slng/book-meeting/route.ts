/**
 * book_meeting tool webhook — invoked by the in-call LLM when the prospect
 * agrees a slot. Payload is just the LLM-extracted parameters; we stash the
 * booking for the call_end webhook to claim (see lib/call-store).
 *
 * The JSON we return is read back to the LLM so it can confirm to the prospect.
 */
import { setPendingBooking } from "@/lib/call-store";
import { isAuthorized } from "@/lib/webhook-auth";

interface BookMeetingBody {
  meeting_iso8601?: string;
  notes?: string;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: BookMeetingBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.meeting_iso8601) {
    return Response.json(
      { status: "error", message: "meeting_iso8601 is required" },
      { status: 200 }, // 200 so the LLM hears the guidance and re-asks
    );
  }

  const when = new Date(body.meeting_iso8601);
  if (Number.isNaN(when.getTime())) {
    return Response.json(
      { status: "error", message: "Could not parse that date/time, please confirm it." },
      { status: 200 },
    );
  }

  setPendingBooking({ iso8601: when.toISOString(), notes: body.notes });

  return Response.json({
    status: "booked",
    confirmed_for: when.toISOString(),
    message: "Meeting recorded. Confirm the date and time back to the prospect.",
  });
}
