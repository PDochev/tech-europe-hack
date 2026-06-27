/**
 * Idempotently provision the AutoCloser deal pipeline in Attio and seed sample
 * deals. Safe to re-run: existing object/attributes are reused, seeds are only
 * created when the pipeline is empty.
 *
 *   export ATTIO_API_KEY=...
 *   npx tsx scripts/setup-attio.ts
 *
 * Phone numbers use the Ofcom drama-reserved +44 7700 900xxx range so a stray
 * call never reaches a real person. Override the dial target at dispatch time.
 */
import {
  AttioError,
  createAttribute,
  createObject,
  createRecord,
  DEALS_OBJECT,
  getObject,
  listAttributes,
  queryRecords,
} from "../lib/attio";
import { AGENT_STATUS, DEAL_ATTRIBUTES, STAGES } from "../lib/deal-schema";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

const SEED_DEALS = [
  {
    name: "Greenfield Health — Q1 trial",
    stage: STAGES.contacted,
    contact_name: "Maria Alvarez",
    contact_phone: "+447700900123",
    company_name: "Greenfield Health",
    agent_status: AGENT_STATUS.idle,
    last_call_outcome: "Trialled in Q1, went quiet after the pricing call.",
    next_step: "Re-engage on usage-based plan.",
    last_activity: daysAgo(21), // stale → the demo target
  },
  {
    name: "Acme Robotics — new inbound",
    stage: STAGES.new,
    contact_name: "Tom Becker",
    contact_phone: "+447700900124",
    company_name: "Acme Robotics",
    agent_status: AGENT_STATUS.idle,
    next_step: "Initial qualification call.",
    last_activity: daysAgo(2),
  },
  {
    name: "Nimbus Logistics — expansion",
    stage: STAGES.contacted,
    contact_name: "Priya Nair",
    contact_phone: "+447700900125",
    company_name: "Nimbus Logistics",
    agent_status: AGENT_STATUS.idle,
    last_call_outcome: "Champion interested, needs budget sign-off.",
    next_step: "Confirm decision maker.",
    last_activity: daysAgo(14),
  },
  {
    name: "Orbit Fintech — renewal risk",
    stage: STAGES.contacted,
    contact_name: "Daniel Okafor",
    contact_phone: "+447700900126",
    company_name: "Orbit Fintech",
    agent_status: AGENT_STATUS.idle,
    last_call_outcome: "Usage down, no reply to last two emails.",
    next_step: "Check health, offer review call.",
    last_activity: daysAgo(30),
  },
  {
    name: "Vertex Manufacturing — new inbound",
    stage: STAGES.new,
    contact_name: "Sofia Rossi",
    contact_phone: "+447700900127",
    company_name: "Vertex Manufacturing",
    agent_status: AGENT_STATUS.idle,
    next_step: "Qualify fit and timeline.",
    last_activity: daysAgo(1),
  },
];

async function ensureObject() {
  const existing = await getObject(DEALS_OBJECT);
  if (existing) {
    console.log(`• Object "${DEALS_OBJECT}" already exists.`);
    return;
  }
  await createObject({
    api_slug: DEALS_OBJECT,
    singular_noun: "Deal",
    plural_noun: "Deals",
  });
  console.log(`✓ Created object "${DEALS_OBJECT}".`);
}

async function ensureAttributes() {
  const existing = new Set((await listAttributes(DEALS_OBJECT)).map((a) => a.api_slug));
  for (const attr of DEAL_ATTRIBUTES) {
    if (existing.has(attr.api_slug)) continue;
    try {
      await createAttribute(DEALS_OBJECT, {
        title: attr.title,
        api_slug: attr.api_slug,
        type: attr.type,
      });
      console.log(`  ✓ attribute ${attr.api_slug}`);
    } catch (err) {
      if (err instanceof AttioError && err.status === 409) {
        console.log(`  • attribute ${attr.api_slug} already exists`);
      } else {
        throw err;
      }
    }
  }
}

async function seed() {
  const existing = await queryRecords(DEALS_OBJECT, { limit: 1 });
  if (existing.length > 0) {
    console.log("• Pipeline already has records — skipping seed.");
    return;
  }
  for (const deal of SEED_DEALS) {
    const rec = await createRecord(DEALS_OBJECT, deal);
    console.log(`  ✓ seeded ${deal.name} → ${rec.id.record_id}`);
  }
}

async function main() {
  await ensureObject();
  await ensureAttributes();
  await seed();
  console.log("\n✅ Attio pipeline ready.");
}

main().catch((err: unknown) => {
  if (err instanceof AttioError) {
    console.error(`Attio error ${err.status}:`, JSON.stringify(err.body, null, 2));
  } else {
    console.error(err);
  }
  process.exit(1);
});
