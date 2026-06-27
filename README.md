# AutoCloser — Autonomous Voice SDR on Attio

An agentic CRM build for the **Attio "Agentic CRM"** hackathon track. AutoCloser is an autonomous
agent that, on a schedule or a button press, picks the highest-priority lead/deal in **Attio**,
has **Gemini** decide who to call and draft a script, places a **live phone call** through **SLNG**,
books a meeting, and writes the outcome back to Attio — with no human in the loop. A thin **Next.js**
dashboard shows it happening live.

> **North star:** can the agent close a deal without a human in the loop?

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

| Service                                           | Role in AutoCloser                          | Side challenge |
| ------------------------------------------------- | ------------------------------------------- | -------------- |
| [Attio](https://attio.com)                        | CRM, system of record, write-back target    | Track prize    |
| [SLNG](https://slng.ai)                           | Outbound voice call to the lead             | LEGO           |
| [Gemini / Google DeepMind](https://ai.google.dev) | Prioritize, decide, draft script, summarize | —              |

[Neon](https://neon.tech) (Postgres) is used as infrastructure — it stores call run-state so the
`dispatch → book_meeting → call_end` webhooks (three separate requests) correlate to the right deal.
Not a judged partner tech.

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
