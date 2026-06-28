/**
 * One autonomous agent cycle, shared by the auth-gated /api/agent/run endpoint
 *
 * Returns a typed result instead of an HTTP Response so callers can decide how
 * to surface it.
 */
import { AttioError, DEALS_OBJECT, updateRecord } from "./attio";
import {
  dealSummary,
  listDealsByStaleness,
  pickNextDeal,
  type Deal,
} from "./deal";
import { generateTalkingPoints } from "./agent-brain";
import { AGENT_STATUS } from "./deal-schema";
import { dispatchCall, SlngError } from "./slng";
import { recordDispatch } from "./call-store";
import { destinationAllowed, isE164, normalizePhone } from "./phone";

export interface RunOptions {
  recordId?: string;
  phoneOverride?: string;
  talkingPoints?: string;
}

export type RunResult =
  | {
      status: "dispatched";
      httpStatus: 200;
      callId: string;
      deal: { recordId: string; name: string; phone: string };
      talkingPoints: string;
    }
  | { status: "idle"; httpStatus: 200; reason: string }
  | { status: "error"; httpStatus: number; error: string; detail?: unknown };

export async function runAgentCycle(opts: RunOptions = {}): Promise<RunResult> {
  const agentId = process.env.SLNG_AGENT_ID;
  if (!agentId) {
    return {
      status: "error",
      httpStatus: 500,
      error:
        "SLNG_AGENT_ID is not set. Run scripts/provision-slng-agent.ts first.",
    };
  }

  let deals: Deal[];
  try {
    deals = await listDealsByStaleness();
  } catch (err) {
    return {
      status: "error",
      httpStatus: err instanceof AttioError ? 502 : 500,
      error: "Attio query failed",
      detail: err instanceof AttioError ? err.body : String(err),
    };
  }

  const deal = opts.recordId
    ? deals.find((d) => d.recordId === opts.recordId)
    : pickNextDeal(deals);

  if (!deal) {
    return { status: "idle", httpStatus: 200, reason: "no actionable deal" };
  }

  const phone = normalizePhone(opts.phoneOverride?.trim() || deal.contactPhone);
  if (!isE164(phone)) {
    return {
      status: "error",
      httpStatus: 422,
      error: `deal has no valid E.164 phone (${phone || "empty"})`,
    };
  }
  if (!destinationAllowed(phone)) {
    return {
      status: "error",
      httpStatus: 403,
      error: "destination not in ALLOWED_CALL_PREFIXES",
    };
  }

  // Mark the deal as mid-call so the loop won't pick it again (best-effort).
  try {
    await updateRecord(DEALS_OBJECT, deal.recordId, {
      agent_status: AGENT_STATUS.calling,
      last_activity: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[orchestrator] failed to mark deal calling:", err);
  }

  // Gemini drafts the talking points (best-effort; falls back internally).
  const talkingPoints =
    opts.talkingPoints || (await generateTalkingPoints(deal));

  try {
    const result = await dispatchCall(agentId, {
      phone_number: phone,
      arguments: {
        contact_name: deal.contactName,
        company_name: deal.companyName,
        deal_summary: dealSummary(deal),
        talking_points: talkingPoints,
      },
    });

    await recordDispatch({
      callId: result.call_id,
      phoneNumber: phone,
      attioRecordId: deal.recordId,
      contactName: deal.contactName,
      companyName: deal.companyName,
      dispatchedAt: new Date().toISOString(),
    });

    return {
      status: "dispatched",
      httpStatus: 200,
      callId: result.call_id,
      deal: { recordId: deal.recordId, name: deal.name, phone },
      talkingPoints,
    };
  } catch (err) {
    return {
      status: "error",
      httpStatus: err instanceof SlngError ? 502 : 500,
      error: "SLNG dispatch failed",
      detail: err instanceof SlngError ? err.body : String(err),
    };
  }
}
