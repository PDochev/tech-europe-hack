# AutoCloser — Autonomous Voice SDR on Attio

An agentic CRM build for the **Attio "Agentic CRM"** hackathon track. AutoCloser is an autonomous
agent that, on a schedule or a button press, picks the highest-priority lead/deal in **Attio**,
has **Gemini** decide who to call and draft a script, places a **live phone call** through **SLNG**,
books a meeting, and writes the outcome back to Attio — with no human in the loop. The whole loop is
orchestrated in **n8n**, and a thin **Next.js** dashboard shows it happening live via **Supabase** realtime.

> **North star:** can the agent close a deal without a human in the loop?

## Architecture

```
                 ┌──────────── Attio (system of record) ────────────┐
                 │  People/Companies · Deals · Notes · Activities    │
                 └─────────▲──────────────────────────────▲─────────┘
                  (2) fetch │                  (7) write back│
   schedule/webhook ──► n8n autonomous loop ───────────────┘
                          │  (3)Gemini prioritize  (4)Gemini draft  (5)SLNG call  (6)Gemini summarize
                          └──► run-state rows ──► Supabase ──realtime──► Next.js dashboard
```

## Partner technologies

| Service                                           | Role in AutoCloser                           | Side challenge |
| ------------------------------------------------- | -------------------------------------------- | -------------- |
| [Attio](https://attio.com)                        | CRM, system of record, write-back target     | Track prize    |
| [SLNG](https://slng.ai)                           | Outbound voice call to the lead              | LEGO           |
| [n8n](https://n8n.io)                             | Autonomous loop, scheduling, webhook trigger | 1yr Pro + $500 |
| [Gemini / Google DeepMind](https://ai.google.dev) | Prioritize, decide, draft script, summarize  | —              |

Supabase is used as infrastructure (live run-state store), not as a judged partner tech.

---

## Where to register & get API keys

You need accounts and keys for **five** services. Budget ~20 minutes total. Put every value into a
local `.env` file (copy from `.env.example`).

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
3. Set `SLNG_API_KEY`. Auth is `Authorization: Bearer <key>`; base URL `https://api.slng.ai/v1/`.
4. **BYOK note:** SLNG is bring-your-own-key by default — it routes through your own STT/TTS/LLM
   providers (OpenAI, Anthropic, Deepgram, ElevenLabs, etc.). If your call flow needs one, add the
   relevant provider key in the SLNG dashboard and/or as an env var. Confirm the exact outbound-call
   endpoint and any telephony number setup in the docs.
   - Docs: https://docs.slng.ai

### 3. Gemini (Google DeepMind)

1. Go to **Google AI Studio**: **https://aistudio.google.com** and sign in with a Google account.
2. Click **Get API key** → **Create API key** (in a new or existing Google Cloud project).
3. Set `GEMINI_API_KEY`. Use model `gemini-2.5-pro` (or `gemini-2.5-flash` for cheaper/faster steps).
   - Docs: https://ai.google.dev/gemini-api/docs
   - (Alternative: Vertex AI on Google Cloud if you prefer enterprise auth — not needed for the hackathon.)

### 4. n8n (orchestration)

Pick one:

- **n8n Cloud (fastest):** sign up at **https://n8n.io** → start a cloud trial → your instance lives
  at `https://<your-workspace>.app.n8n.cloud`.
- **Self-host (free, local):** `npx n8n` or `docker run -it --rm -p 5678:5678 n8nio/n8n`, then open
  `http://localhost:5678`.

In n8n you don't use a single global key — instead you add **Credentials** per node (HTTP Header Auth
for Attio/SLNG, a Google/Gemini credential for the AI node). To let the dashboard trigger a run, the
workflow's **Webhook** node exposes a URL — copy it into `N8N_WEBHOOK_URL`. Optionally create an n8n
**API key** (Settings → n8n API) if the dashboard reads execution status; set `N8N_API_KEY`.

- Docs: https://docs.n8n.io

### 5. Supabase (live run-state)

1. Sign up at **https://supabase.com** → **New project** (free tier). Save the DB password.
2. Go to **Project Settings → API** to find:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (used by the browser dashboard)
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (used by n8n to write run-state; **server-only, never ship to the browser**)
3. Create tables `runs` and `run_steps` (SQL provided in `supabase/schema.sql` once added) and enable
   **Realtime** for both under Database → Replication.
   - Docs: https://supabase.com/docs

---

## Environment variables

Copy `.env.example` to `.env.local` (Next.js) and fill in the values. n8n credentials are configured
inside the n8n UI, but keep the same secrets handy there.

```bash
cp .env.example .env.local
```

| Variable                        | Used by            | Where to get it                          |
| ------------------------------- | ------------------ | ---------------------------------------- |
| `ATTIO_API_KEY`                 | n8n                | Attio → Workspace settings → Developers  |
| `SLNG_API_KEY`                  | n8n                | app.slng.ai/api-keys                     |
| `GEMINI_API_KEY`                | n8n                | aistudio.google.com → Get API key        |
| `N8N_WEBHOOK_URL`               | Next.js dashboard  | n8n Webhook node URL                     |
| `N8N_API_KEY`                   | Next.js (optional) | n8n → Settings → n8n API                 |
| `NEXT_PUBLIC_SUPABASE_URL`      | Next.js + n8n      | Supabase → Settings → API                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Next.js (browser)  | Supabase → Settings → API (anon)         |
| `SUPABASE_SERVICE_ROLE_KEY`     | n8n (server)       | Supabase → Settings → API (service_role) |

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

The n8n workflow runs separately (cloud or `http://localhost:5678`). Import the workflow JSON (added
under `n8n/` during the build), wire up the credentials above, and copy the webhook URL into your env.

## Voice agent (SLNG): provision & place a call

The calling agent lives in `lib/` and `app/api/`:

| File                                 | Purpose                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `lib/slng.ts`                        | Typed client for the SLNG Voice Agents API (create/replace agent, dispatch call, get call)            |
| `lib/autocloser-agent.ts`            | The AutoCloser agent definition — system prompt + `book_meeting` tool + `call_end` transcript webhook |
| `scripts/provision-slng-agent.ts`    | Creates/updates the agent in SLNG                                                                     |
| `app/api/agent/dispatch`             | POST → dispatch an outbound call                                                                      |
| `app/api/webhooks/slng/book-meeting` | The in-call LLM calls this when it secures a meeting                                                  |
| `app/api/webhooks/slng/call-end`     | SLNG posts the transcript here when the call ends (write-back point)                                  |

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

Put the printed id in `SLNG_AGENT_ID`.

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
When the prospect agrees a slot the agent calls `book_meeting`; when the call ends, `call_end`
delivers the transcript. Write-back to Attio is stubbed (`writeOutcomeToAttio`) pending that step.

## Orchestration endpoints

The agent loop is exposed as HTTP so both the dashboard and n8n can drive it:

| Endpoint                    | Auth                      | Purpose                                                                                 |
| --------------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| `GET /api/agent/candidates` | none (read-only)          | Deal pipeline, stalest first, + suggested next pick                                     |
| `POST /api/agent/run`       | `Bearer DISPATCH_API_KEY` | One autonomous cycle: pick stalest deal → mark `calling` in Attio → place the SLNG call |
| `POST /api/agent/dispatch`  | `Bearer DISPATCH_API_KEY` | Lower-level: call a specific number with explicit context                               |

`POST /api/agent/run` accepts an optional body: `{ "record_id": "...", "phone_override": "+44...", "talking_points": "..." }`.
Use `phone_override` to route the demo call to a real (teammate) phone while keeping the deal's context.

## Run the autonomous loop (ngrok + n8n Cloud)

n8n Cloud can't reach `localhost`, and SLNG must reach your webhooks — so expose the app with a tunnel.

1. **Seed Attio** (once): `npx tsx scripts/setup-attio.ts`.
2. **Env** (`.env.local`): set `SLNG_AGENT_ID`, `SLNG_OUTBOUND_TRUNK_ID`, `SLNG_WEBHOOK_SECRET`,
   `DISPATCH_API_KEY`, and `AGENT_WEBHOOK_BASE_URL` (your ngrok https URL).
3. **Tunnel:** `ngrok http 3000` → copy the https URL.
4. **Provision the SLNG agent** so its `book_meeting`/`call_end` webhooks hit the tunnel:
   `AGENT_WEBHOOK_BASE_URL=https://<ngrok> npx tsx scripts/provision-slng-agent.ts` → set `SLNG_AGENT_ID`.
5. **n8n Cloud:** import `n8n/autocloser-loop.json`. It's a Schedule → HTTP Request workflow.
   Edit the HTTP node: set the URL to `https://<ngrok>/api/agent/run` and the `Authorization` header to
   `Bearer <DISPATCH_API_KEY>`. Activate it for the autonomous loop, or hit **Execute Workflow** to fire once.
   > Note: the SLNG community node (`n8n-nodes-slng`) only works on **self-hosted** n8n, not Cloud — so we
   > call SLNG via our app over HTTP instead.
6. **Fire a cycle manually** (same thing n8n does):
   ```bash
   curl -X POST https://<ngrok>/api/agent/run \
     -H "authorization: Bearer $DISPATCH_API_KEY" \
     -H 'content-type: application/json' \
     -d '{"phone_override":"+44YOURPHONE"}'
   ```
   The agent calls, books a meeting, and the `call_end` webhook advances the deal in Attio.

## Demo flow

1. Open the dashboard — it mirrors the Attio pipeline, including a stale deal.
2. Hit **Run agent** → the timeline lights up: top pick chosen (Gemini) → call script drafted (Gemini).
3. A teammate's phone rings live (SLNG); the agent qualifies the lead and books a meeting.
4. The transcript is summarized and the **Attio record updates itself** — stage advanced, note added,
   next step set. No human touched it.

## Status

Early hackathon build. Setup/registration is documented above; the n8n workflow, Supabase schema, and
dashboard are in progress per the plan.
