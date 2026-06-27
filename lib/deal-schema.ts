/**
 * Schema for the AutoCloser deal pipeline (custom Attio object `ac_deals`).
 * Single source of truth shared by the setup script and the write-back code.
 * Stage/agent_status are modelled as plain text to avoid select-option setup.
 */
export interface AttrDef {
  api_slug: string;
  title: string;
  type: "text" | "timestamp";
}

export const DEAL_ATTRIBUTES: AttrDef[] = [
  { api_slug: "name", title: "Name", type: "text" },
  { api_slug: "stage", title: "Stage", type: "text" },
  { api_slug: "contact_name", title: "Contact name", type: "text" },
  { api_slug: "contact_phone", title: "Contact phone", type: "text" },
  { api_slug: "company_name", title: "Company name", type: "text" },
  { api_slug: "agent_status", title: "Agent status", type: "text" },
  { api_slug: "last_call_outcome", title: "Last call outcome", type: "text" },
  { api_slug: "next_step", title: "Next step", type: "text" },
  { api_slug: "meeting_time", title: "Meeting time", type: "timestamp" },
  { api_slug: "last_activity", title: "Last activity", type: "timestamp" },
];

export const STAGES = {
  new: "New",
  contacted: "Contacted",
  meetingBooked: "Meeting Booked",
  won: "Won",
  lost: "Lost",
} as const;

export const AGENT_STATUS = {
  idle: "idle",
  calling: "calling",
  done: "done",
} as const;
