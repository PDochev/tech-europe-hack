/**
 * Gemini-powered reasoning around the call. Both functions are best-effort:
 * on any Gemini error they return a sensible fallback so the call / write-back
 * still proceeds (the agent must never be blocked by enrichment).
 */
import { generateText } from "./gemini";
import { dealSummary, type Deal } from "./deal";

const SDR_SYSTEM =
  "You are a sharp B2B sales development rep. Be concise, specific, and never invent facts.";

/** 2–4 short talking points to steer the outbound call for this deal. */
export async function generateTalkingPoints(deal: Deal): Promise<string> {
  try {
    const prompt = `Write 2-4 short talking points (one line each, no preamble) for a cold/follow-up
call to ${deal.contactName || "the contact"} at ${deal.companyName || "the company"}.
Context: ${dealSummary(deal)}
Goal: earn a short discovery conversation and book a meeting. Output only the bullet lines.`;
    const out = await generateText(prompt, { system: SDR_SYSTEM, temperature: 0.6 });
    return out || fallbackTalkingPoints(deal);
  } catch (err) {
    console.warn("[agent-brain] talking points fell back:", err);
    return fallbackTalkingPoints(deal);
  }
}

function fallbackTalkingPoints(deal: Deal): string {
  return deal.nextStep || "Keep it short and discovery-led; confirm fit and book a meeting.";
}

/** A tight summary of the call for the Attio note. */
export async function summarizeCall(
  transcript: Array<{ role: string; message: string }> | undefined,
  meetingIso?: string,
): Promise<string> {
  if (!transcript || transcript.length === 0) {
    return meetingIso ? `Meeting booked for ${meetingIso}. No transcript captured.` : "No transcript captured.";
  }
  const convo = transcript.map((t) => `${t.role}: ${t.message}`).join("\n");
  try {
    const prompt = `Summarise this sales call in 2-3 sentences: outcome, prospect sentiment, and the
concrete next step.${meetingIso ? ` A meeting was booked for ${meetingIso}.` : ""}

Transcript:
${convo}`;
    const out = await generateText(prompt, { system: SDR_SYSTEM, temperature: 0.3 });
    return out || "Call completed.";
  } catch (err) {
    console.warn("[agent-brain] summary fell back:", err);
    return meetingIso ? `Meeting booked for ${meetingIso}.` : "Call completed.";
  }
}
