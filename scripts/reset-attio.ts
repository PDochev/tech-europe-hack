/**
 * Wipe the AutoCloser deal pipeline and re-seed it for clean testing.
 *
 *   # load .env.local (for ATTIO_API_KEY), then run:
 *   set -a && source .env.local && set +a && npx tsx scripts/reset-attio.ts
 *   # or: npx tsx --env-file=.env.local scripts/reset-attio.ts
 *
 * Deletes every record in the deals object (and their notes), then recreates the
 * sample deals from lib/seed-deals.ts. Record IDs change. Destructive — only run
 * against a test workspace.
 *
 * Tip: also clear the call run-state with `npx tsx scripts/setup-neon.ts` after a
 * `DELETE FROM ac_calls`, or just delete rows in the Neon console.
 */
import { createRecord, DEALS_OBJECT, deleteRecord, queryRecords, AttioError } from "../lib/attio";
import { SEED_DEALS } from "../lib/seed-deals";

async function deleteAll(): Promise<number> {
  let deleted = 0;
  // Query/delete in pages until the pipeline is empty.
  for (;;) {
    const batch = await queryRecords(DEALS_OBJECT, { limit: 100 });
    if (batch.length === 0) break;
    for (const rec of batch) {
      await deleteRecord(DEALS_OBJECT, rec.id.record_id);
      deleted++;
    }
  }
  return deleted;
}

async function main() {
  const deleted = await deleteAll();
  console.log(`🗑️  Deleted ${deleted} deal record(s).`);

  for (const deal of SEED_DEALS) {
    const rec = await createRecord(DEALS_OBJECT, deal);
    console.log(`  ✓ seeded ${deal.name} → ${rec.id.record_id}`);
  }
  console.log(`\n✅ Re-seeded ${SEED_DEALS.length} clean deals.`);
}

main().catch((err: unknown) => {
  if (err instanceof AttioError) {
    console.error(`Attio error ${err.status}:`, JSON.stringify(err.body, null, 2));
  } else {
    console.error(err);
  }
  process.exit(1);
});
