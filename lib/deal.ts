/**
 * Maps a raw Attio record from the `ac_deals` object into a typed Deal.
 * Attio returns every attribute as an array of value objects; for our
 * single-value text/timestamp attributes we read `[0].value`.
 */
import { queryRecords, DEALS_OBJECT, type AttioRecord } from "./attio";
import { AGENT_STATUS } from "./deal-schema";

export interface Deal {
  recordId: string;
  name: string;
  stage: string;
  contactName: string;
  contactPhone: string;
  companyName: string;
  agentStatus: string;
  lastCallOutcome: string;
  nextStep: string;
  lastActivity: string | null;
}

function text(record: AttioRecord, slug: string): string {
  const v = record.values[slug] as Array<{ value?: unknown }> | undefined;
  const raw = v?.[0]?.value;
  return typeof raw === "string" ? raw : "";
}

export function parseDeal(record: AttioRecord): Deal {
  return {
    recordId: record.id.record_id,
    name: text(record, "name"),
    stage: text(record, "stage"),
    contactName: text(record, "contact_name"),
    contactPhone: text(record, "contact_phone"),
    companyName: text(record, "company_name"),
    agentStatus: text(record, "agent_status"),
    lastCallOutcome: text(record, "last_call_outcome"),
    nextStep: text(record, "next_step"),
    lastActivity: text(record, "last_activity") || null,
  };
}

/** All deals, stalest first (oldest last_activity ranks highest). */
export async function listDealsByStaleness(): Promise<Deal[]> {
  const records = await queryRecords(DEALS_OBJECT, { limit: 100 });
  return records
    .map(parseDeal)
    .sort((a, b) => (a.lastActivity ?? "").localeCompare(b.lastActivity ?? ""));
}

/** The best deal to call now: stalest one not already done or mid-call. */
export function pickNextDeal(deals: Deal[]): Deal | undefined {
  return deals.find(
    (d) =>
      d.agentStatus !== AGENT_STATUS.done &&
      d.agentStatus !== AGENT_STATUS.calling &&
      Boolean(d.contactPhone),
  );
}

/** A short context blurb fed into the call agent's prompt. */
export function dealSummary(deal: Deal): string {
  return [
    `Stage: ${deal.stage || "unknown"}.`,
    deal.lastCallOutcome && `History: ${deal.lastCallOutcome}`,
    deal.nextStep && `Planned next step: ${deal.nextStep}`,
  ]
    .filter(Boolean)
    .join(" ");
}
