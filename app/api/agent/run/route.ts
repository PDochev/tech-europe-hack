/**
 * POST /api/agent/run  — one autonomous agent cycle (auth-gated, for n8n / external).
 *
 * Body (all optional): { record_id, phone_override, talking_points }
 * Auth: Bearer DISPATCH_API_KEY (places real calls).
 */
import { runAgentCycle } from "@/lib/orchestrator";
import { isDispatchAuthorized } from "@/lib/webhook-auth";

interface RunBody {
  record_id?: string;
  phone_override?: string;
  talking_points?: string;
}

export async function POST(request: Request) {
  if (!isDispatchAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: RunBody = {};
  try {
    body = (await request.json()) as RunBody;
  } catch {
    /* empty body is fine — auto-pick */
  }

  const result = await runAgentCycle({
    recordId: body.record_id,
    phoneOverride: body.phone_override,
    talkingPoints: body.talking_points,
  });
  const { httpStatus, ...payload } = result;
  return Response.json(payload, { status: httpStatus });
}
