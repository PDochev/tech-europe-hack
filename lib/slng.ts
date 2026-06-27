/**
 * Minimal typed client for the SLNG Voice Agents API.
 *
 * Two SLNG surfaces exist:
 *   - the TTS/STT gateway at https://api.slng.ai/v1
 *   - the Voice Agents API at https://api.agents.slng.ai/v1   <-- this file
 *
 * Docs: https://docs.slng.ai/api-reference/agents/create-agent
 *       https://docs.slng.ai/api-reference/calls/dispatch-call
 *       https://docs.slng.ai/api-reference/calls/get-call
 */

const AGENTS_BASE_URL =
  process.env.SLNG_AGENTS_BASE_URL ?? "https://api.agents.slng.ai/v1";

// "any" lets SLNG place the agent on any available worker (what the dashboard
// "Any (EU worker)" option sends). The us-east/eu-central/ap-south values from
// the docs are region-pinned and gate model availability.
export type SlngRegion = "any" | "us-east" | "eu-central" | "ap-south";

export interface SlngModels {
  stt: string;
  llm: string;
  tts: string;
  tts_voice: string;
  /** Provider-specific LLM params passed through (e.g. gpt-oss reasoning_effort). */
  llm_kwargs?: Record<string, unknown>;
}

/** A tool the in-call LLM can invoke, or a system-triggered webhook. */
export type SlngTool =
  | { type: "template"; id: string; template: "hangup" | "voicemail_detection" }
  | { type: "built_in"; id: string; built_in: "current_datetime" }
  | {
      type: "webhook";
      id: string;
      name: string;
      description: string;
      url: string;
      parameters: Record<string, unknown>;
      auth?:
        | { type: "bearer"; token: string }
        | { type: "hmac"; secret: string };
      timeout_seconds?: number;
      wait_for_response?: boolean;
      show_results_to_llm?: boolean;
      llm_result_instructions?: string;
      /** Present for system-triggered (call_end etc.) webhooks. */
      source?: "system";
      system?: {
        triggers: Array<{ event: string; source_tool_id?: string }>;
        arguments: Array<{
          name: string;
          type: string;
          required?: boolean;
          source: { type: string; max_messages?: number };
        }>;
      };
    };

export interface CreateAgentInput {
  name: string;
  system_prompt: string;
  greeting: string;
  language: string;
  region: SlngRegion;
  models: SlngModels;
  outbound_greeting?: string;
  tools?: SlngTool[];
  sip_outbound_trunk_id?: string;
  template_defaults?: Record<string, string>;
  enable_interruptions?: boolean;
}

export interface Agent extends CreateAgentInput {
  id: string;
  organisation_id: string;
  created_at: string;
  updated_at: string;
}

export interface DispatchCallInput {
  /** Destination in E.164 format, e.g. +14155552671 */
  phone_number: string;
  /** Up to 32 template-variable overrides (values <=1024 chars each). */
  arguments?: Record<string, string>;
}

export interface DispatchCallResult {
  call_id: string;
  message?: string;
}

export class SlngError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "SlngError";
  }
}

function apiKey(): string {
  const key = process.env.SLNG_API_KEY;
  if (!key) {
    throw new Error("SLNG_API_KEY is not set. See README → SLNG setup.");
  }
  return key;
}

async function request<T>(
  path: string,
  init: RequestInit & { method: string },
): Promise<T> {
  const res = await fetch(`${AGENTS_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new SlngError(
      `SLNG ${init.method} ${path} failed: ${res.status}`,
      res.status,
      body,
    );
  }
  return body as T;
}

export function createAgent(input: CreateAgentInput): Promise<Agent> {
  return request<Agent>("/agents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function replaceAgent(
  agentId: string,
  input: CreateAgentInput,
): Promise<Agent> {
  return request<Agent>(`/agents/${agentId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function getAgent(agentId: string): Promise<Agent> {
  return request<Agent>(`/agents/${agentId}`, { method: "GET" });
}

/** Dispatch an outbound call. The agent must have an outbound SIP trunk. */
export function dispatchCall(
  agentId: string,
  input: DispatchCallInput,
): Promise<DispatchCallResult> {
  return request<DispatchCallResult>(`/agents/${agentId}/calls`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getCall(
  agentId: string,
  callId: string,
): Promise<Record<string, unknown>> {
  return request(`/agents/${agentId}/calls/${callId}`, { method: "GET" });
}
