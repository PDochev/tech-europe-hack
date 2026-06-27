/**
 * Thin client for the Google Gemini (Google DeepMind) API.
 * Used around the call: generate talking points before dialing, summarise the
 * transcript afterward. The in-call conversation itself runs on SLNG's own LLM.
 *
 * Docs: https://ai.google.dev/gemini-api/docs
 */
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const BASE = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key)
    throw new Error("GEMINI_API_KEY is not set. See README → Gemini setup.");
  return key;
}

/** Single-shot text generation. Returns the model's text, trimmed. */
export async function generateText(
  prompt: string,
  opts: { system?: string; temperature?: number } = {},
): Promise<string> {
  const res = await fetch(`${BASE}/models/${MODEL}:generateContent`, {
    method: "POST",
    // Key in a header, not the URL query string (avoids leaking it into logs).
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      ...(opts.system
        ? { systemInstruction: { parts: [{ text: opts.system }] } }
        : {}),
      generationConfig: { temperature: opts.temperature ?? 0.7 },
    }),
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new GeminiError(`Gemini ${MODEL} → ${res.status}`, res.status, body);
  }

  const out: string | undefined =
    body?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? undefined;
  return (out ?? "").trim();
}
