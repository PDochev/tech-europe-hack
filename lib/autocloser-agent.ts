/**
 * The AutoCloser voice agent definition.
 *
 * The in-call conversation is driven by SLNG's own LLM (configured in `models.llm`).
 * Gemini's role lives *around* the call (pre-call prioritisation + post-call summary)
 * and can inject `talking_points` at dispatch time via call `arguments`.
 *
 * Two webhooks wire the call back into our system:
 *   - `book_meeting`  : the LLM invokes this when the prospect agrees a slot.
 *   - `call_end`      : SLNG posts the full transcript when the call disconnects.
 */
import type { CreateAgentInput, SlngRegion, SlngTool } from "./slng";

// Stable tool ids so re-provisioning (PUT/replace) keeps the same tools.
const TOOL_IDS = {
  hangup: "a0000000-0000-4000-8000-000000000001",
  datetime: "a0000000-0000-4000-8000-000000000002",
  bookMeeting: "a0000000-0000-4000-8000-000000000003",
  callEnd: "a0000000-0000-4000-8000-000000000004",
} as const;

export const AUTOCLOSER_AGENT_NAME = "AutoCloser SDR";

const SYSTEM_PROMPT = `You are {{caller_name}}, an SDR calling on behalf of {{caller_company}}.
You are speaking with {{contact_name}} from {{company_name}}.

Context about this account and deal:
{{deal_summary}}

Your goals, in order:
1. Confirm you are speaking with the right person, warmly and briefly.
2. Reference the relevant context to earn the conversation (use the talking points below).
3. Qualify: surface whether there is a real need and who owns the decision.
4. Book a concrete next meeting. When the prospect agrees on a date and time, call the
   "book_meeting" tool with an ISO-8601 datetime. Use the current_datetime tool to resolve
   relative dates like "next Tuesday".

Talking points:
{{talking_points}}

Style: concise, friendly, never pushy. Keep turns short so it feels like a real call.
If they are not interested, thank them and end the call gracefully. If you reach voicemail,
leave a short message and hang up. Do not invent facts you were not given.`;

const GREETING =
  "Hi {{contact_name}}, this is {{caller_name}} from {{caller_company}} — do you have a quick minute?";

export interface BuildAgentOptions {
  /** Public base URL SLNG can reach for webhooks (e.g. ngrok / n8n / prod). */
  webhookBaseUrl: string;
  /** Shared secret SLNG sends as a bearer token to our webhooks. */
  webhookSecret: string;
  /** Outbound SIP trunk id configured in the SLNG telephony dashboard. */
  sipOutboundTrunkId?: string;
  region?: SlngRegion;
  /** Default sender identity, overridable per call via arguments. */
  callerName?: string;
  callerCompany?: string;
}

export function buildAutoCloserAgent(
  opts: BuildAgentOptions,
): CreateAgentInput {
  const base = opts.webhookBaseUrl.replace(/\/$/, "");

  const tools: SlngTool[] = [
    { type: "template", id: TOOL_IDS.hangup, template: "hangup" },
    { type: "built_in", id: TOOL_IDS.datetime, built_in: "current_datetime" },
    {
      type: "webhook",
      id: TOOL_IDS.bookMeeting,
      name: "book_meeting",
      description:
        "Record an agreed meeting once the prospect commits to a date and time.",
      url: `${base}/api/webhooks/slng/book-meeting`,
      parameters: {
        type: "object",
        properties: {
          meeting_iso8601: {
            type: "string",
            description: "Agreed meeting time in ISO-8601, e.g. 2026-07-02T15:00:00Z",
          },
          notes: {
            type: "string",
            description: "Short note on what was agreed / next steps",
          },
        },
        required: ["meeting_iso8601"],
      },
      auth: { type: "bearer", token: opts.webhookSecret },
      timeout_seconds: 10,
      wait_for_response: true,
      llm_result_instructions:
        "If booking succeeded, confirm the date and time back to the prospect.",
    },
    {
      type: "webhook",
      id: TOOL_IDS.callEnd,
      name: "post_call_transcript",
      description: "Send the transcript to the CRM when the call ends.",
      url: `${base}/api/webhooks/slng/call-end`,
      parameters: { type: "object", properties: {} },
      source: "system",
      wait_for_response: false,
      system: {
        triggers: [{ event: "call_end" }],
        arguments: [
          { name: "call_id", type: "string", required: true, source: { type: "call_id" } },
          { name: "phone_number", type: "string", required: true, source: { type: "phone_number" } },
          { name: "call_end_reason", type: "string", source: { type: "call_end_reason" } },
          {
            name: "transcript",
            type: "transcript_messages",
            required: true,
            source: { type: "transcript_messages", max_messages: 200 },
          },
        ],
      },
    },
  ];

  return {
    name: AUTOCLOSER_AGENT_NAME,
    system_prompt: SYSTEM_PROMPT,
    greeting: GREETING,
    language: "en",
    // "any" (not a pinned region) is what makes the models below available on
    // the hobby tier — verified by reading a dashboard-created agent's config.
    region: opts.region ?? "any",
    models: {
      // These exact ids/tags are what the SLNG API accepts (the docs enum was
      // stale — note the ":latest" tag and the "multi" STT). Override via env.
      stt: process.env.SLNG_AGENT_STT ?? "slng/deepgram/nova:3-multi",
      // GPT-OSS 120B on Groq is the lowest-latency LLM available on this tier.
      llm: process.env.SLNG_AGENT_LLM ?? "groq/openai/gpt-oss-120b:latest",
      tts: process.env.SLNG_AGENT_TTS ?? "slng/deepgram/aura:2-en",
      tts_voice: process.env.SLNG_AGENT_TTS_VOICE ?? "aura-2-thalia-en",
      // gpt-oss emits chain-of-thought by default; "low" slashes time-to-first-token
      // so the agent starts speaking sooner on the call.
      llm_kwargs: { reasoning_effort: "low" },
    },
    enable_interruptions: true,
    sip_outbound_trunk_id: opts.sipOutboundTrunkId,
    template_defaults: {
      caller_name: opts.callerName ?? "Alex",
      caller_company: opts.callerCompany ?? "AutoCloser",
      contact_name: "there",
      company_name: "your team",
      deal_summary: "No additional context provided.",
      talking_points: "Keep it short and discovery-led.",
    },
    tools,
  };
}
