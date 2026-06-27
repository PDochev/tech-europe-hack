/**
 * Dispatch an outbound AutoCloser call.
 *
 *   POST /api/agent/dispatch
 *   {
 *     "phone_number": "+447700900123",
 *     "contact_name": "Maria",
 *     "company_name": "Greenfield",
 *     "attio_record_id": "rec_...",        // optional, for write-back
 *     "deal_summary": "...",               // optional
 *     "talking_points": "..."              // optional (e.g. from Gemini)
 *   }
 */
import { dispatchCall, SlngError } from "@/lib/slng";
import { recordDispatch } from "@/lib/call-store";
import { isDispatchAuthorized } from "@/lib/webhook-auth";
import { destinationAllowed, isE164 } from "@/lib/phone";

interface DispatchBody {
  phone_number?: string;
  contact_name?: string;
  company_name?: string;
  attio_record_id?: string;
  deal_summary?: string;
  talking_points?: string;
}

export async function POST(request: Request) {
  // This route places real phone calls — gate it to prevent toll fraud.
  if (!isDispatchAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const agentId = process.env.SLNG_AGENT_ID;
  if (!agentId) {
    return Response.json(
      { error: "SLNG_AGENT_ID is not set. Run scripts/provision-slng-agent.ts first." },
      { status: 500 },
    );
  }

  let body: DispatchBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.phone_number) {
    return Response.json({ error: "phone_number is required (E.164)" }, { status: 400 });
  }
  if (!isE164(body.phone_number)) {
    return Response.json(
      { error: "phone_number must be E.164, e.g. +447700900123" },
      { status: 400 },
    );
  }
  if (!destinationAllowed(body.phone_number)) {
    return Response.json(
      { error: "destination not in ALLOWED_CALL_PREFIXES" },
      { status: 403 },
    );
  }

  // Per-call template overrides → fill the agent's Handlebars variables.
  const args: Record<string, string> = {};
  if (body.contact_name) args.contact_name = body.contact_name;
  if (body.company_name) args.company_name = body.company_name;
  if (body.deal_summary) args.deal_summary = body.deal_summary;
  if (body.talking_points) args.talking_points = body.talking_points;

  try {
    const result = await dispatchCall(agentId, {
      phone_number: body.phone_number,
      arguments: args,
    });

    await recordDispatch({
      callId: result.call_id,
      phoneNumber: body.phone_number,
      attioRecordId: body.attio_record_id,
      contactName: body.contact_name,
      companyName: body.company_name,
      dispatchedAt: new Date().toISOString(),
    });

    return Response.json({ call_id: result.call_id, status: "dispatched" });
  } catch (err) {
    if (err instanceof SlngError) {
      return Response.json(
        { error: "SLNG dispatch failed", status: err.status, detail: err.body },
        { status: 502 },
      );
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
