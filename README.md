# AutoCloser - Autonomous Voice SDR on Attio

An agentic CRM build for the **Attio "Agentic CRM"** hackathon track. AutoCloser is an autonomous
agent that, on a schedule or a button press, picks the highest-priority lead/deal in **Attio**,
has **Gemini** decide who to call and draft a script, places a **live phone call** through **SLNG**,
books a meeting, and writes the outcome back to Attio - with no human in the loop. A thin **Next.js**
dashboard shows it happening live.

> An **SDR** (Sales Development Representative) is the outbound rep who works a list of leads, chases
> stale ones, qualifies them on a call, and books meetings. AutoCloser automates that role end to end.

## Architecture

```
                 ┌──────────── Attio (system of record) ────────────┐
                 │  People/Companies · Deals · Notes · Activities    │
                 └─────────▲──────────────────────────────▲─────────┘
                  (2) fetch │                  (6) write back│
   schedule/button ──► Next.js agent loop ──────────────────┘
                          │  (3) Gemini prioritize + draft   (4) SLNG call   (5) Gemini summarize
                          └──► call run-state ──► Neon (Postgres)
```

The loop runs inside the Next.js app (`lib/orchestrator.ts`, exposed at `POST /api/agent/run`). SLNG's
in-call `book_meeting` and end-of-call `call_end` webhooks post back to the app, which correlates them
via a small Neon table and writes the outcome to Attio.

## Partner technologies

| Service                                           | Role in AutoCloser                          |
| ------------------------------------------------- | ------------------------------------------- |
| [Attio](https://attio.com)                        | CRM, system of record, write-back target    |
| [SLNG](https://slng.ai)                           | Outbound voice call to the lead             |
| [Gemini / Google DeepMind](https://ai.google.dev) | Prioritize, decide, draft script, summarize |

[Neon](https://neon.tech) (Postgres) is used as infrastructure — it stores call run-state so the
`dispatch → book_meeting → call_end` webhooks (three separate requests) correlate to the right deal.
[Twilio](https://twilio.com) supplies the outbound phone number, wired into SLNG's telephony as the
caller ID. Both are infrastructure (not judged partner tech) and have no code in the repo.

## What I used from each platform

### Attio - the CRM and source of truth · via the REST API (v2)

- **The pipeline lives in Attio.** I create a custom _Deals_ object (with fields like stage, contact,
  company, agent status, meeting time, and last activity) and seed it with sample deals.
- **The agent reads it** to find the deal that's gone coldest (stalest first).
- **The agent writes back to it:** it marks a deal as _calling_ before dialing, then after the call
  advances the stage to **Meeting Booked**, sets the meeting time, and records the outcome.
- **It leaves a paper trail** by attaching a written call summary as a note on the deal.

_Code: `lib/attio.ts`, `lib/deal.ts`, `scripts/setup-attio.ts`._

### SLNG - the live phone call · Voice Agents API

- **SLNG makes the actual call.** I defined a reusable voice agent (its persona, goals, and greeting)
  and ask SLNG to dial a number; SLNG runs the real-time conversation — hearing the prospect, thinking,
  and speaking back (speech-to-text → in-call LLM → text-to-speech).
- **It books the meeting mid-call.** The agent has a "book meeting" action it triggers the moment the
  prospect agrees a time, which I capture and save to Attio.
- **It tells me when the call ends**, which is my cue to write the result back to the CRM.
- **Every call is personalized** with the contact's name, company, and Gemini-drafted talking points.

_Code: `lib/slng.ts`, `lib/autocloser-agent.ts`. (Voice powered by Deepgram speech models + a Groq LLM.)_

### Gemini (Google DeepMind) - the agent's brain around the call

- **Before the call:** picks the angle and drafts tailored talking points for the chosen deal.
- **After the call:** writes the summary that gets saved as the Attio note.
- Both steps fall back gracefully, so enrichment never blocks the autonomous loop.

_Code: `lib/gemini.ts`, `lib/agent-brain.ts` (model: `gemini-2.5-flash`)._

### Neon (infrastructure) · `lib/db.ts`, `lib/call-store.ts`

- Postgres `ac_calls` table correlating the `dispatch → book_meeting → call_end` webhooks to the right
  Attio deal and the booked slot. Accessed via the `@neondatabase/serverless` HTTP driver.

### Twilio (infrastructure) - telephony number

- Provides the outbound **phone number** purchased in the Twilio console. It's connected to SLNG's
  telephony (outbound SIP trunk) so SLNG places real PSTN calls from it — the number SLNG dials _from_.
  Configured once in the SLNG/Twilio dashboards; there's no Twilio code or API key in this repo.
- **Trial-account caveat:** on a Twilio trial you can only call numbers you've added as **Verified
  Caller IDs**. Add the destination phone (e.g. your own/teammate's number for the demo) under
  Twilio console → **Phone Numbers → Manage → Verified Caller IDs**, or calls will be rejected.

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values.

```bash
cp .env.example .env.local
```

| Variable                 | Where to get it                                     |
| ------------------------ | --------------------------------------------------- |
| `ATTIO_API_KEY`          | Attio → Workspace settings → Developers             |
| `SLNG_API_KEY`           | app.slng.ai/api-keys                                |
| `SLNG_AGENT_ID`          | create an agent att app.slng.ai/agent-infra/new     |
| `SLNG_OUTBOUND_TRUNK_ID` | SLNG → Telephony                                    |
| `SLNG_WEBHOOK_SECRET`    | you choose — bearer SLNG sends to our webhooks      |
| `AGENT_WEBHOOK_BASE_URL` | your public https URL (ngrok in dev, prod URL live) |
| `DISPATCH_API_KEY`       | you choose — gates `/api/agent/run` and `/dispatch` |
| `GEMINI_API_KEY`         | aistudio.google.com → Get API key                   |
| `DATABASE_URL`           | Neon → Connection Details (pooled)                  |

See `.env.example` for the full list, including optional STT/TTS/voice/model overrides.

---

## Local development

This repo is a Next.js 16 app (App Router, React 19, Tailwind v4).

```bash
npm install
npm run dev      # dashboard at http://localhost:3000
npm run build    # production build
npm run lint     # eslint (flat config)
```

## Voice agent (SLNG): provision & place a call

The calling agent lives in `lib/` and `app/api/`:

| File                                 | Purpose                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `lib/slng.ts`                        | Typed client for the SLNG Voice Agents API (create/replace agent, dispatch call, get call)        |
| `lib/autocloser-agent.ts`            | The AutoCloser agent definition — system prompt + `book_meeting` tool + `call_end` system webhook |
| `lib/call-store.ts`                  | Correlates `call_id` → Attio record + booked meeting, in Neon (`ac_calls`)                        |
| `scripts/provision-slng-agent.ts`    | Creates/updates the agent in SLNG                                                                 |
| `app/api/agent/dispatch`             | POST → dispatch an outbound call                                                                  |
| `app/api/webhooks/slng/book-meeting` | The in-call LLM calls this when it secures a meeting                                              |
| `app/api/webhooks/slng/call-end`     | SLNG posts here when the call ends → write-back to Attio                                          |

**1. Configure telephony.** Purchase a phone number in the [Twilio](https://twilio.com) console, then in
the SLNG dashboard → Telephony connect it as an outbound SIP trunk and copy the trunk id into
`SLNG_OUTBOUND_TRUNK_ID`. This Twilio number is the caller ID SLNG dials _from_.
On a Twilio **trial** account you must also add the number you want to call as a **Verified Caller ID**
(Twilio console → Phone Numbers → Manage → Verified Caller IDs) — otherwise the call is rejected.

**2. Expose your webhooks.** SLNG must reach `book_meeting` / `call_end` over the public internet.
In dev, tunnel your app: `ngrok http 3000`, then set `AGENT_WEBHOOK_BASE_URL` to the https URL.

`deal_summary` / `talking_points` feed the agent's prompt (Gemini can generate these per lead).
When the prospect agrees a slot the agent calls `book_meeting`; when the call ends, `call_end` writes
the outcome back to Attio — stage → **Meeting Booked**, `agent_status: done`, `meeting_time` set, and
a summary note attached.

## Orchestration endpoints

The agent loop is exposed as HTTP so the dashboard or any scheduler (cron, Vercel Cron, etc.) can drive it:

| Endpoint                    | Auth                      | Purpose                                                                                 |
| --------------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| `GET /api/agent/candidates` | none (read-only)          | Deal pipeline, stalest first, + suggested next pick                                     |
| `POST /api/agent/run`       | `Bearer DISPATCH_API_KEY` | One autonomous cycle: pick stalest deal → mark `calling` in Attio → place the SLNG call |
| `POST /api/agent/dispatch`  | `Bearer DISPATCH_API_KEY` | Lower-level: call a specific number with explicit context                               |

`POST /api/agent/run` accepts an optional body: `{ "record_id": "...", "phone_override": "+44...", "talking_points": "..." }`.
Use `phone_override` to route the demo call to a real (teammate) phone while keeping the deal's context.

## Run the autonomous loop

SLNG must reach your webhooks, so in dev expose the app with a tunnel; then fire `/api/agent/run` on a
schedule (cron, Vercel Cron, GitHub Actions, or just repeated `curl`).

1. **Seed Attio** (once): `npx tsx scripts/setup-attio.ts`.
2. **Set up Neon** (once): `npx tsx scripts/setup-neon.ts`.
3. **Env** (`.env.local`): set `SLNG_AGENT_ID`, `SLNG_OUTBOUND_TRUNK_ID`, `SLNG_WEBHOOK_SECRET`,
   `DISPATCH_API_KEY`, `DATABASE_URL`, and `AGENT_WEBHOOK_BASE_URL` (your ngrok https URL).
4. **Tunnel:** `ngrok http 3000` → copy the https URL.
5. **Provision the SLNG agent** so its `book_meeting`/`call_end` webhooks hit the tunnel:
   `AGENT_WEBHOOK_BASE_URL=https://<ngrok> npx tsx scripts/provision-slng-agent.ts` → set `SLNG_AGENT_ID`.

   The agent calls, books a meeting, and the `call_end` webhook advances the deal in Attio.
   For a recurring loop, hit that endpoint on a timer.

## Demo flow

1. Open the dashboard — it mirrors the Attio pipeline, including a stale deal.
2. Hit **Run agent** → the timeline lights up: top pick chosen (Gemini) → call script drafted (Gemini).
3. A teammate's phone rings live (SLNG); the agent qualifies the lead and books a meeting.
4. **Attio record updates itself** — stage advanced, note added, next step set. No human touched it.

## Reset test data

After a test run the deals carry call state (stage `Meeting Booked`, `agent_status: done`, a note, etc.).
To wipe and re-seed a clean 5-deal pipeline:

```bash
set -a && source .env.local && set +a && npx tsx scripts/reset-attio.ts
```

(`set -a … set +a` exports the vars from `.env.local` so the script sees `ATTIO_API_KEY`; equivalently
`npx tsx --env-file=.env.local scripts/reset-attio.ts`.) This is **destructive** — it deletes every record
in the `ac_deals` object (and their notes) before re-seeding, so only run it against a test workspace.

To also clear the call run-state, run `DELETE FROM ac_calls;` in the Neon SQL editor (a fresh call
otherwise just adds a new row).
