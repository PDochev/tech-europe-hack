"use server";

/**
 * Server Action for the dashboard "Run agent" button. Runs server-side so the
 * dispatch credentials never reach the browser. The hardened public entry point
 * for n8n remains POST /api/agent/run (Bearer DISPATCH_API_KEY).
 */
import { runAgentCycle, type RunResult } from "@/lib/orchestrator";

export async function runAgentAction(input: {
  recordId?: string;
  phoneOverride?: string;
}): Promise<RunResult> {
  return runAgentCycle({
    recordId: input.recordId,
    phoneOverride: input.phoneOverride,
  });
}
