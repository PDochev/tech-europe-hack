/**
 * Provision (create or update) the AutoCloser voice agent in SLNG.
 *
 *   export SLNG_API_KEY=...
 *   export AGENT_WEBHOOK_BASE_URL=https://<ngrok-or-n8n-or-prod>
 *   export SLNG_WEBHOOK_SECRET=some-shared-secret
 *   export SLNG_OUTBOUND_TRUNK_ID=<from SLNG telephony dashboard>   # required for real calls
 *
 *   npx tsx scripts/provision-slng-agent.ts            # create new
 *   SLNG_AGENT_ID=<id> npx tsx scripts/provision-slng-agent.ts      # update existing
 *
 * Prints the agent id — put it in SLNG_AGENT_ID for the dispatch route.
 */
import { buildAutoCloserAgent } from "../lib/autocloser-agent";
import { createAgent, replaceAgent, SlngError } from "../lib/slng";

async function main() {
  const webhookBaseUrl = process.env.AGENT_WEBHOOK_BASE_URL;
  if (!webhookBaseUrl) {
    throw new Error(
      "AGENT_WEBHOOK_BASE_URL is required (public URL SLNG can reach for webhooks).",
    );
  }

  const webhookSecret = process.env.SLNG_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error(
      "SLNG_WEBHOOK_SECRET is required — it authenticates SLNG's webhook calls.",
    );
  }

  const input = buildAutoCloserAgent({
    webhookBaseUrl,
    webhookSecret,
    sipOutboundTrunkId: process.env.SLNG_OUTBOUND_TRUNK_ID,
    region: (process.env.SLNG_REGION as never) || undefined,
    callerName: process.env.AGENT_CALLER_NAME,
    callerCompany: process.env.AGENT_CALLER_COMPANY,
  });

  const existingId = process.env.SLNG_AGENT_ID;
  const agent = existingId
    ? await replaceAgent(existingId, input)
    : await createAgent(input);

  console.log(`✅ Agent ${existingId ? "updated" : "created"}: ${agent.id}`);
  console.log(`   Set SLNG_AGENT_ID=${agent.id} in your env.`);
  if (!input.sip_outbound_trunk_id) {
    console.warn(
      "⚠️  No SLNG_OUTBOUND_TRUNK_ID set — outbound calls will fail until a trunk is configured.",
    );
  }
}

main().catch((err: unknown) => {
  if (err instanceof SlngError) {
    console.error(`SLNG error ${err.status}:`, JSON.stringify(err.body, null, 2));
  } else {
    console.error(err);
  }
  process.exit(1);
});
