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

> **Attio track fit.** AutoCloser is the _Proactive Relationship Agent_ direction: it monitors pipeline
> staleness, decides who needs attention, acts (a live call), and logs the outcome back to Attio —
> the autonomous loop, no human in the loop. The north star ("close a deal without a human in the
> loop") is the literal flow: stale deal → booked meeting on the calendar, written to the CRM by the agent.

## What we used from each platform

Maps every external capability the project relies on (for jury evaluation).

### Attio — via the **REST API (v2)** · `lib/attio.ts`, `lib/deal.ts`

- **Objects & attributes (schema as code):** creates a custom `ac_deals` object and its attributes
  (`stage`, `contact_name`, `contact_phone`, `company_name`, `agent_status`, `last_call_outcome`,
  `next_step`, `meeting_time`, `last_activity`) — `createObject` / `createAttribute` (`scripts/setup-attio.ts`).
- **Records:** `createRecord` (seed deals), `queryRecords` (pipeline, stalest-first via
  `listDealsByStaleness` / `pickNextDeal`), `updateRecord` (mark `calling`, then write the outcome:
  stage → **Meeting Booked**, `agent_status: done`, `meeting_time`), `deleteRecord` (test reset).
- **Notes:** `createNote` — attaches the Gemini call summary + transcript to the deal.
- **Auth:** `Authorization: Bearer ATTIO_API_KEY`; base `https://api.attio.com/v2/`.

> **Why the REST API (not Attio MCP or Workflows)?** AutoCloser runs fully **headless** on its own
> schedule, outside any user session or in-app surface — so it needs direct programmatic control of the
> entire loop (define the schema, query the pipeline, write back records + notes) from our own
> orchestrator. The REST API gives exactly that with nothing else in the path. Attio MCP and Workflows
> are the right entry points when a human or an in-Attio agent drives the action; our model is the
> opposite — no human in the loop — so the REST API is the cleanest fit.

### SLNG — **Voice Agents API** · `lib/slng.ts`, `lib/autocloser-agent.ts`

- **Agent lifecycle:** `createAgent` / `replaceAgent` / `getAgent` (`/agents`), `dispatchCall`
  (`/agents/{id}/calls`), `getCall` (transcript, tool executions, status — also our debugging window).
- **In-call stack (configurable):** Deepgram Nova STT, Deepgram Aura TTS, Groq GPT-OSS-120B LLM.
- **Agent tools:** built-in `current_datetime`, template `hangup`, an LLM-invoked **`book_meeting`**
  webhook, and a system-triggered **`call_end`** webhook (event `call_end`) — both bearer-authed with
  `webhook_format: raw`.
- **Per-call personalization:** Handlebars template variables (`contact_name`, `company_name`,
  `deal_summary`, `talking_points`) injected at dispatch.

### Gemini (Google DeepMind) · `lib/gemini.ts`, `lib/agent-brain.ts`

- **Model `gemini-2.5-flash`** via `generateContent` (v1beta), `x-goog-api-key` header,
  `systemInstruction` + `temperature`.
- **Two reasoning steps around the call:** talking-points generation before dialing (per-deal, fed into
  the SLNG prompt) and the post-call summary (written into the Attio note). Both best-effort with
  graceful fallbacks so the autonomous loop never blocks on enrichment.

### Neon (infrastructure) · `lib/db.ts`, `lib/call-store.ts`

- Postgres `ac_calls` table correlating the `dispatch → book_meeting → call_end` webhooks to the right
  Attio deal and the booked slot. Accessed via the `@neondatabase/serverless` HTTP driver.

---

## Where to register & get API keys

You need accounts and keys for the three partner services (**Attio**, **SLNG**, **Gemini**) plus a
**Neon** database. Budget ~15 minutes. Put every value into a local `.env.local` (copy from `.env.example`).

### 1. Attio (CRM)

1. Sign up / sign in at **https://app.attio.com** (free workspace; one is provided at the event).
2. You must be a **workspace admin** to create a key.
3. From the dropdown beside your workspace name → **Workspace settings** → **Developers** tab.
4. Click **+ New access token**, name it (e.g. `autocloser`), and grant **read-write** on:
   **Object configuration** (create the deal object + attributes), **Record permissions /
   Records** (create + update deals), and **Notes** (attach call notes). Reads are implied.
   Missing `object_configuration:read-write` is the usual cause of a `403 unauthorized` on setup.
5. Click the token to copy it. Tokens don't expire.
6. Set `ATTIO_API_KEY`. Auth is `Authorization: Bearer <token>`; base URL `https://api.attio.com/v2/`.
   - Docs: https://docs.attio.com/rest-api/overview · Key guide: https://attio.com/help/apps/other-apps/generating-an-api-key

### 2. SLNG (voice AI)

1. Sign up at **https://slng.ai** (generous free tier).
2. Open the dashboard → **API Keys**: **https://app.slng.ai/api-keys** and create a key.
3. Set `SLNG_API_KEY`. Auth is `Authorization: Bearer <key>`.
4. **BYOK note:** SLNG is bring-your-own-key by default — it routes through your own STT/TTS/LLM
   providers. If your call flow needs one, add the relevant provider key in the SLNG dashboard.
   Set up an outbound SIP trunk / number under **Telephony** and copy its id into `SLNG_OUTBOUND_TRUNK_ID`.
   - Docs: https://docs.slng.ai

### 3. Gemini (Google DeepMind)

1. Go to **Google AI Studio**: **https://aistudio.google.com** and sign in with a Google account.
2. Click **Get API key** → **Create API key** (in a new or existing Google Cloud project).
3. Set `GEMINI_API_KEY`. Use model `gemini-2.5-pro` (or `gemini-2.5-flash` for cheaper/faster steps).
   - Docs: https://ai.google.dev/gemini-api/docs

### 4. Neon (Postgres run-state)

1. Sign up at **https://neon.tech** → **New project** (free tier).
2. From the project dashboard → **Connection Details**, copy the **pooled** connection string.
3. Set `DATABASE_URL`, then create the table:
   ```bash
   set -a && source .env.local && set +a && npx tsx scripts/setup-neon.ts
   ```
   Idempotent — it creates the `ac_calls` table that backs `lib/call-store.ts`.
   - Docs: https://neon.tech/docs

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values.

```bash
cp .env.example .env.local
```

| Variable                 | Where to get it                                     |
| ------------------------ | --------------------------------------------------- |
| `ATTIO_API_KEY`          | Attio → Workspace settings → Developers             |
| `SLNG_API_KEY`           | app.slng.ai/api-keys                                |
| `SLNG_AGENT_ID`          | printed by `scripts/provision-slng-agent.ts`        |
| `SLNG_OUTBOUND_TRUNK_ID` | SLNG → Telephony                                    |
| `SLNG_WEBHOOK_SECRET`    | you choose — bearer SLNG sends to our webhooks      |
| `AGENT_WEBHOOK_BASE_URL` | your public https URL (ngrok in dev, prod URL live) |
| `DISPATCH_API_KEY`       | you choose — gates `/api/agent/run` and `/dispatch` |
| `GEMINI_API_KEY`         | aistudio.google.com → Get API key                   |
| `DATABASE_URL`           | Neon → Connection Details (pooled)                  |

See `.env.example` for the full list, including optional STT/TTS/voice/model overrides.

---

## Local development

This repo is a Next.js 16 app (App Router, React 19, Tailwind v4). See `AGENTS.md` — read
`node_modules/next/dist/docs/` before writing framework code, as these versions have breaking changes.

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

**1. Configure telephony.** In the SLNG dashboard → Telephony, set up an outbound SIP trunk /
phone number and copy the trunk id into `SLNG_OUTBOUND_TRUNK_ID`.

**2. Expose your webhooks.** SLNG must reach `book_meeting` / `call_end` over the public internet.
In dev, tunnel your app: `ngrok http 3000`, then set `AGENT_WEBHOOK_BASE_URL` to the https URL.

**3. Provision the agent:**

```bash
export SLNG_API_KEY=...                       # app.slng.ai/api-keys
export AGENT_WEBHOOK_BASE_URL=https://<ngrok>.ngrok.app
export SLNG_WEBHOOK_SECRET=some-shared-secret
export SLNG_OUTBOUND_TRUNK_ID=...             # from the telephony dashboard
npx tsx scripts/provision-slng-agent.ts       # prints the agent id
# re-run with SLNG_AGENT_ID=<id> to update an existing agent
```

Put the printed id in `SLNG_AGENT_ID`. **Re-run this whenever you change `lib/autocloser-agent.ts`** —
the agent's webhook/tool config only updates in SLNG when you re-provision.

**4. Place a call** (rings the number; the agent qualifies and books a meeting):

```bash
curl -X POST http://localhost:3000/api/agent/dispatch \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $DISPATCH_API_KEY" \
  -d '{
    "phone_number": "+447700900123",
    "contact_name": "Maria",
    "company_name": "Greenfield",
    "deal_summary": "Trialled us in Q1, went quiet after the pricing call.",
    "talking_points": "Re-engage on the new usage-based plan; ask who owns the budget."
  }'
```

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
6. **Fire a cycle:**
   ```bash
   curl -X POST https://<ngrok>/api/agent/run \
     -H "authorization: Bearer $DISPATCH_API_KEY" \
     -H 'content-type: application/json' \
     -d '{"phone_override":"+44YOURPHONE"}'
   ```
   The agent calls, books a meeting, and the `call_end` webhook advances the deal in Attio.
   For a recurring loop, hit that endpoint on a timer.

## Demo flow

1. Open the dashboard — it mirrors the Attio pipeline, including a stale deal.
2. Hit **Run agent** → the timeline lights up: top pick chosen (Gemini) → call script drafted (Gemini).
3. A teammate's phone rings live (SLNG); the agent qualifies the lead and books a meeting.
4. The transcript is summarized and the **Attio record updates itself** — stage advanced, note added,
   next step set. No human touched it.

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

---

## 2-minute video demo — what to say & show

Record with Loom (or similar). Aim for ~2:00. Two halves: **explain the solution** (~40s) and a
**live walkthrough** (~80s). Have everything pre-staged so nothing is dead air.

### Before you hit record (pre-flight)

- Reset to clean data: `set -a && source .env.local && set +a && npx tsx scripts/reset-attio.ts`,
  and `DELETE FROM ac_calls;` in Neon.
- `ngrok http 3000` running, SLNG agent provisioned against that URL, `npm run dev` up.
- Tabs open and arranged: **(1)** the dashboard, **(2)** the Attio deal you'll target, **(3)** your
  phone visible (or a teammate's) to show it ringing. Optionally **(4)** the Neon `ac_calls` table.
- Use a `phone_override` to your own phone so the call connects reliably on camera.

### The script

**0:00–0:15 — Hook + problem.**
"This is AutoCloser, an autonomous voice SDR built on Attio. SDRs spend hours chasing stale leads.
AutoCloser does the whole loop itself — picks the lead, calls them, books the meeting, and updates
the CRM. No human in the loop."

**0:15–0:40 — How it works (show the architecture diagram or dashboard).**
Name the four pieces and what each does:

- **Attio** is the system of record (deals, stages, notes).
- **Gemini** prioritizes which deal to call and drafts the talking points.
- **SLNG** places the real phone call and runs the live conversation.
- The outcome is written **back into Attio** automatically; **Neon** correlates the call's webhooks.

**0:40–1:50 — Live walkthrough (the money shot).**

1. Show the dashboard / pipeline with a **stale deal** highlighted as the top pick.
2. Click **Run agent** (or fire `POST /api/agent/run`). Narrate: "Gemini just picked the stalest deal
   and drafted the script."
3. **Your phone rings on camera** — answer it. Have a short scripted exchange and **agree a meeting
   time** ("next Thursday at 6pm works"). Let the agent confirm and hang up.
4. Cut to **Attio** and refresh the deal: stage flips to **Meeting Booked**, `agent_status: done`,
   **Meeting time** is set, and a **summary note** is attached. Say: "No human touched this record."
5. (Optional, 5s) Show the Neon `ac_calls` row with the captured `meeting_iso8601` to prove the
   correlation is real.

**1:50–2:00 — Close.**
"From a stale deal to a booked meeting on the calendar — fully autonomous, end to end, on Attio.
That's AutoCloser."

### Tips

- Keep the phone exchange short and rehearsed; the meeting booking is the climax, so make the
  before/after in Attio unmistakable (split screen or quick cut).
- If a live call is risky, pre-record the call portion and narrate over it — but the Attio
  before→after must be shown live, since that's the judged "agent closes without a human" moment.
- State the partner tech by name (Attio, SLNG, Gemini) — it helps with track/side-challenge judging.
- Drop one line on the deliberate choice: "We built on Attio's **REST API** because the agent is fully
  headless — no human in the loop — so it needs direct programmatic control of the whole loop." Judges
  note intentional entry-point choices (MCP / Workflows / REST API / App SDK).
