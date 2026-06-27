/**
 * GET /api/agent/candidates
 * Returns the deal pipeline, stalest first, with the agent's suggested next pick.
 * Read-only; powers the dashboard pipeline view.
 */
import { AttioError } from "@/lib/attio";
import { listDealsByStaleness, pickNextDeal } from "@/lib/deal";

export async function GET() {
  try {
    const deals = await listDealsByStaleness();
    const next = pickNextDeal(deals);
    return Response.json({
      deals,
      next_pick_record_id: next?.recordId ?? null,
    });
  } catch (err) {
    if (err instanceof AttioError) {
      return Response.json(
        { error: "Attio query failed", status: err.status, detail: err.body },
        { status: 502 },
      );
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
