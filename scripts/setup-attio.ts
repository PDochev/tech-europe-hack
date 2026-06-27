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
import { DEAL_ATTRIBUTES } from "../lib/deal-schema";
import { SEED_DEALS } from "../lib/seed-deals";

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
