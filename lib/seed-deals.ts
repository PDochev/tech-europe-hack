/**
 * The sample AutoCloser deals seeded into Attio. Shared by scripts/setup-attio.ts
 * (initial provision) and scripts/reset-attio.ts (wipe + re-seed for clean tests).
 *
 * Phone numbers use the Ofcom drama-reserved +44 7700 900xxx range so a stray
 * call never reaches a real person. Override the dial target at dispatch time.
 */
import { AGENT_STATUS, STAGES } from "./deal-schema";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

export const SEED_DEALS = [
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
