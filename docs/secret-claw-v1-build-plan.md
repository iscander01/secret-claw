# Secret Claw v1 Demo — Build Plan

**Status:** Working document, May 20 2026 (v0.6)
**Companion to:** `secret-claw-v1-demo-scope.md`
**Purpose:** Define the engineering execution path from current state to "Internal testers have used the demo." Sequences the work, identifies dependencies, captures decisions that affect the build but not the product surface.

---

## Current state (May 19 2026)

What exists:

- **Working deploy template** at `C:\dev\secret-claw\deploys\byo\`. Validated end-to-end on `tomato-rat.vm.scrtlabs.com` (test deploy May 19). Renders OpenClaw + Anthropic Sonnet 4.6 + Telegram + two routines + welcome message into a single uploadable compose. Byte-deterministic rendering of the template; deployment ID and gateway token are random per render.
- **Clean product repo** at `C:\dev\secret-claw\` (committed at e549163, pushed to https://github.com/MrGarbonzo/secret-claw). Chunk 1 complete.
- **Three SecretVM gotchas burned in** to FINDINGS.md (YAML folded-scalar handling, compose interpolation escaping, diagnostics-prometheus schema).
- **Benchmark matrix** validating OpenClaw + Sonnet 4.6 at 100% reliability on supported tests, 13K input tokens per turn average. Documented at `C:\dev\agent-bench\agent-bench-records.md`.
- **Two live SecretVM deploys** for reference: `amethyst-eel` and `beige-ermine`. Both stay running as comparison baselines.
- **SecretAI portal API research** at `C:\dev\secret-claw\docs\secretvm-provisioning-research.md`. Confirms Pattern B is achievable: provisioning is a multipart HTTP POST to `/api/vm/create`.
- **API-key auth path validated** by user (May 19): API keys can be generated in the SecretAI portal UI and used for `vm create` operations via `Authorization: Bearer <key>`.

What doesn't exist:

- The wizard frontend
- A backend for storing deployment records
- The SecretAI API key validation pattern (lightweight authenticated call to confirm a pasted key works)
- The Anthropic API key validation pattern (test call before accepting)
- The Telegram credential validation pattern
- The deploy template's integration with the SecretAI portal API (current template renders a compose; the wizard will submit it via API)

## What "done" looks like for the demo build

A tester receives a URL to the wizard. They go to the SecretAI portal, generate an API key, paste it into the wizard. They paste their Anthropic key. They set up Telegram (or skip). About five minutes later, their agent is deployed under their own SecretAI portal account, reachable both via the SecretVM-provided URL and (if they set it up) Telegram. The next morning, they get a news briefing. Multiple testers do this without the project owner's involvement.

The build is done when this flow works end-to-end, reliably, and the owner isn't in the provisioning loop.

## Build sequence

The work decomposes into four chunks. Chunk 1 is complete. The remaining chunks are simpler than they were at v0.3 because the API-key auth path eliminated the Keplr handshake.

### Chunk 1: Repo restructure and template refinement ✓ DONE (May 19 2026)

Completed at commit e549163. Repo structure created, deploy template simplified ("Secret Agent" hardcoded, random gateway token, optional Telegram), validation passed. See repo README and v0.3 of this build plan for full details.

### Chunk 2: Wizard design + API-key validation prototype (Week 1-2)

**Goal:** Design the six-screen wizard flow in enough detail that Chunk 3's frontend build is unambiguous. Verify the SecretAI portal API works as documented with a real API key.

**What gets produced:**

`C:\dev\secret-claw\docs\wizard-design.md` covering:
- Each screen's layout, copy, validation rules, error states
- Visual style direction (deliberately plain Stripe-style for the demo — no brand commitment)
- The SecretAI API key entry flow (clear walkthrough of where to get one, validation feedback, error states for invalid/expired keys)
- The Anthropic API key validation flow (real-time test call, latency expectations, error states)
- The Telegram setup walkthrough (screenshots of BotFather steps, token paste UX, skip flow)
- The provisioning screen behavior (polling cadence, status updates, what to show during the 5-minute wait)
- The completion screen layout (URL prominent, next-steps guidance)
- Mobile responsive behavior
- The browser-vs-backend compose rendering decision (settled during this chunk)

A small API-validation prototype:
- Standalone HTML page or curl-equivalent that uses a real SecretAI API key
- Validates: `GET /api/auth/session` (or equivalent) returns ok with the bearer token
- Validates: `POST /api/vm/create` with a minimal compose actually provisions a VM
- Validates: `GET /api/background-job/<jobId>` polling works with bearer auth
- Validates: the resulting VM hostname and details can be read back

This is risk mitigation, not full prototype work. Maybe 2-4 hours of focused work to confirm the documented API actually behaves as expected from a browser context (or a Node script if browser CORS for bearer-token GETs is somehow restricted, though that would be unusual).

**Estimated time:** 1-2 days. The design conversation is a day of focused chat. The API validation is hours.

**Risks:** Low. The API key path is well-trodden (it's the same path the portal's Swagger UI uses, per the research doc). The primary remaining unknown is what specific endpoint to use for "is this API key valid?" — a small empirical question.

### Chunk 3: Wizard frontend build (Week 2-3)

**Goal:** Build the actual web application that implements the design from Chunk 2.

**What gets built:**

A Next.js application in `C:\dev\secret-claw\wizard\` deployed to Vercel. Stack choices:

- Framework: Next.js (App Router) — required, not optional. The wizard needs server-side API routes to proxy SecretAI portal calls because the portal serves no CORS headers (empirical Chunk 2 finding; see `wizard/prototypes/api-validation/FINDINGS.md`).
- Styling: Tailwind CSS, system fonts
- Form handling: React Hook Form or similar
- HTTP client: native fetch from the browser to same-origin `/api/portal/*` routes; the route handlers use native fetch from the server to `https://secretai.scrtlabs.com` with the user-supplied bearer token attached
- State: minimal — wizard state held in memory until submission

**Next.js API-route proxy (definite component):** the browser cannot call the SecretAI portal directly. The wizard ships with same-origin proxy routes that forward portal calls server-side. Concretely:

- `POST /api/portal/validate-key` — accepts an API key in the request body, calls `GET https://secretai.scrtlabs.com/api/vm/instances` with `Authorization: Bearer <key>`, returns `{ valid: true, vmCount: N }` on 200 or `{ valid: false }` on 401
- `POST /api/portal/vm-create` — accepts the wizard inputs (API key + Anthropic key + optional Telegram creds) plus the wizard-generated `deployment_id`, renders the compose server-side via the Node renderer (see below), submits `POST /api/vm/create` to the portal as multipart with the bearer token, returns `{ vmId, jobId }`
- `GET /api/portal/job-status/[jobId]` — accepts the API key in a request header, polls `GET https://secretai.scrtlabs.com/api/background-job/<jobId>`, returns the upstream status
- `GET /api/portal/templates` (optional, if used for screen 1) — calls `GET https://secretai.scrtlabs.com/api/templates`, returns the upstream response

The bearer token never persists in the proxy. Each route is single-hop: receive token in request → attach to upstream → return upstream response → forget. No logging of credentials.

**Node/TypeScript compose renderer (definite component):** the existing Python `render.py` at `deploys/byo/scripts/` remains as the canonical local CLI tool for `deploys/byo/`. The wizard backend implements the same rendering logic natively in TypeScript so the Next.js process can render without shelling out to Python. Both renderers must produce equivalent output for the same input; test fixtures under `wizard/tests/renderer/` exercise this with the same template + sample inputs run through both and a byte-diff (modulo intentionally-random fields: `deployment_id`, gateway token). Renderer scope is small — Mustache-style template substitution, UUID + random-token generation, multipart-ready buffer output.

**Deployment-record lifecycle (locked at v0.6):** the deployment record is created at *wizard submission time*, not at provisioning completion. The wizard frontend generates the `deployment_id` (uuid) before any portal call, POSTs to the backend's `/api/record-deployment` with status="submitted", *then* calls `POST /api/portal/vm-create`. As `GET /api/portal/job-status/[jobId]` polling progresses, the wizard PATCHes the deployment record's status through `submitted → provisioning → ready` (or `→ failed` with `error_message`). Screen 5's polling is driven against the local backend's deployment status, which the wizard keeps in sync from portal polling — cleaner separation, and failed deploys persist as observable rows rather than vanishing.

The frontend implements:

- Six screen routes with proper navigation
- SecretAI API key validation via `POST /api/portal/validate-key`
- Form validation matching the design doc
- Real-time API key validation for Anthropic (test call before accepting)
- Real-time Telegram credential validation (getMe call to Telegram before accepting)
- Frontend-generated `deployment_id` (uuid) and POST to `/api/record-deployment` at the moment the user clicks "deploy" on the final input screen
- Multipart submission to the portal via `POST /api/portal/vm-create` (the proxy route renders the compose server-side from the user inputs via the Node renderer)
- Polling `GET /api/portal/job-status/[jobId]` for provisioning status, with each status transition PATCHed to `/api/deployment-status/[deployment_id]`
- Mobile responsive layouts

The `getCurrentUser()` abstraction lives here — returns `{deploymentId: <wizard-generated-uuid>, secretAiApiKey}` after the user pastes their key. Swappable for production auth later. Used in any place the code needs to know "who is this submission for."

**Estimated time:** 4-5 days of focused Claude Code work. Significantly less than the v0.3 estimate because there's no Keplr integration to build.

**Risks:** Medium. Web frontends have a lot of small decisions that compound. The biggest risk is the visual polish ceiling — Claude Code can produce a working wizard quickly but a *polished* one requires careful attention. Plan for an explicit polish pass after the functional build.

### Chunk 4: Backend deployment record + observability (Week 3)

**Goal:** A minimal backend that holds deployment records for the project owner's reference. Same as v0.3 but worth restating since the architecture has settled.

**What gets built:**

A Supabase project (or equivalent) backing the wizard. Table needed:

- `deployments` — wizard submissions. Fields: `deployment_id` (uuid), `vm_id` (returned by portal), `vm_hostname` (returned by portal), `status` (submitted/provisioning/ready/failed), `created_at`, `provisioned_at`, `error_message`, `telegram_enabled` (boolean), `metadata` (jsonb for non-sensitive details)

Note what's NOT in this table: SecretAI API keys, Anthropic API keys, Telegram bot tokens, anything sensitive. Those go directly from the wizard to the portal in the compose submission and are never persisted in our backend. This is a core security property worth preserving.

API endpoints the wizard calls:

- `POST /api/validate-anthropic-key` — tests an Anthropic key with a one-token call, returns ok or invalid (lightweight backend service; doesn't store the key)
- `POST /api/validate-telegram` — tests a Telegram bot token with a getMe call, returns ok with bot username, or invalid
- `POST /api/record-deployment` — accepts the wizard-generated `deployment_id` and a small payload of non-sensitive metadata (telegram_enabled flag, tier, timestamp). Creates the initial row with status="submitted". **Called at wizard submission time, before the portal `vm-create` call** — so even if portal submission fails the deployment row exists for owner observability.
- `PATCH /api/deployment-status/:deployment_id` — updates the deployment record's status as the wizard's polling progresses. Status transitions: `submitted → provisioning → ready` or `submitted → provisioning → failed`. The `failed` patch carries an `error_message`. The `ready` patch carries the `vm_id` and `vm_hostname` returned by the portal.
- `GET /api/deployment-status/:deployment_id` — returns current state; the wizard's screen 5 polls this (not the portal directly) so screen 5's status updates are driven by the local backend; useful for owner observability as well.

SecretAI API key validation does NOT have a backend endpoint — that validation happens via the Next.js portal proxy hitting the SecretAI portal directly. The wizard backend never sees the user's SecretAI key. This keeps user credentials out of our persistent infrastructure entirely.

The owner-side observability includes:
- A read-only dashboard showing recent deployments (status, hostname, timestamp)
- Webhook or email notification on failed deployments

**Estimated time:** 1-2 days of Claude Code work.

**Risks:** Low. Straightforward backend work.

### Chunk 5: End-to-end testing and tester handoff (Week 3-4)

**Goal:** Verify the full flow works from a user's perspective. Hand the demo to Alex and other testers.

**What gets done:**

You test the full flow as if you were a tester. Generate a fresh SecretAI API key, complete the wizard, watch provisioning, see the agent come up.

Fix every rough edge you find. Pay specific attention to:

- The "get your SecretAI API key" walkthrough (this is the new step that didn't exist in Pattern A; testers will be confused if it's unclear)
- Latency expectations during validation
- Error message quality
- The completion screen content
- Mobile experience

Run the flow with another tester who hasn't seen it before you hand it to Alex. Watch what confuses them. Fix what's confusable.

Then send Alex (and others) the wizard URL. Be available over the first hour in case anything breaks. Watch what they do, capture their reactions, take notes.

**Estimated time:** 2-3 days of testing and polish, plus the tester handoff sessions.

**Risks:** Low operationally, high product-wise. The biggest risk isn't technical breakage — it's a tepid reaction.

## Decisions made during the build

### v0.1 — May 19 2026
Initial build plan. Four-chunk sequence locked. Wizard-of-oz provisioning, anonymous wizard, invitation code access.

### v0.2 — May 19 2026
Keplr wallet auth replaces invitation codes for internal testing access.

### v0.3 — May 19 2026
Architecture pivoted to Pattern B (self-service provisioning). Wizard-of-oz manual provisioning eliminated. Chunk 4 becomes much smaller.

### v0.4 — May 19 2026
Architecture simplified again: API-key bearer auth instead of Keplr-in-wizard signing. User generates the key in the SecretAI portal once, pastes into the wizard. Confirmed: API keys can be generated in the portal UI, and they work for `vm create` operations. Chunk 2 shrinks from "Keplr handshake prototype" to "validate documented API works as expected." Chunk 3 shrinks by ~3 days because there's no Keplr integration. Chunk 1 completed at commit e549163.

## Decisions deferred to during or after the build

**Browser-side vs backend-side compose rendering.** **Settled at v0.5: backend-side.** Chunk 2's CORS finding forces a Next.js proxy regardless, so the cost calculus changed — we now have a server-side path that has to exist anyway. Frontend collects inputs; `POST /api/portal/vm-create` receives them, renders the compose, and posts to the portal in one server-side call. The compose YAML never leaves the server before being submitted; the user's bearer token still doesn't persist beyond one request.

**Python `render.py` vs Node port for the wizard backend.** **Settled at v0.6: Node port.** The wizard backend is Node already; shelling out to Python adds a runtime dependency that complicates Vercel deployment and introduces a subprocess boundary across a small, well-defined transformation (templating + UUID + random token + YAML write). The existing `deploys/byo/scripts/render.py` remains as the canonical local CLI tool — useful for `deploys/byo/` testing, manual renders, and as the rendering reference. The wizard's Node renderer is held to byte-equivalent output against the same template + inputs (test fixtures under `wizard/tests/renderer/`, modulo intentionally-random fields).

**Deployment-record creation timing.** **Settled at v0.6: at wizard submission time.** Earlier drafts left this ambiguous (record at completion vs at submission). Settled in favor of submission-time creation because failed provisioning needs to leave an observable row — if the record only existed on success, failed deploys would be invisible to the owner dashboard. Screen 5's status polling is also cleaner against the local backend than against the portal directly. The wizard frontend generates the `deployment_id` (uuid) and POSTs to `/api/record-deployment` *before* calling the portal's `vm-create`. Status flows through PATCHes as polling progresses.

**Specific SecretAI portal endpoint for API-key validation.** **Settled at v0.5: `GET /api/vm/instances` with `Authorization: Bearer <key>`.** Confirmed empirically — returns 200 with a VM list for valid keys, structured 401 for invalid/missing. `/api/auth/session` returns `{}` 200 regardless of bearer-token state (NextAuth quirk) and is unusable. See `wizard/prototypes/api-validation/FINDINGS.md` §2.

**Vercel vs alternative hosting.** Default is Vercel.

**Supabase vs Postgres vs simpler alternatives.** Default is Supabase. Since we're not storing sensitive credentials, plain Supabase tables are fine.

**How to handle a tester whose deployment fails partway through.** With Pattern B + API keys, the portal returns errors as background-job statuses. The wizard surfaces these and the tester can retry by running the wizard again.

## What this build plan deliberately doesn't include

- **Automated SecretAI portal admin operations.** Wizard provisions but doesn't tear down or manage. Users go to the portal directly.
- **Production-grade observability.** Console logs and Supabase dashboard suffice.
- **Multi-environment setup.** Vercel preview deployments serve as staging.
- **CI/CD pipelines.** Manual testing.
- **Comprehensive error handling.** Edge-case errors get a generic "something went wrong" message.
- **Database migrations.** Drop-and-recreate during build.
- **Backup or disaster recovery.** Acceptable for the demo.

## Dependencies and ordering

- **Chunk 2 blocks Chunk 3.** The frontend implements the design. The API validation prototype confirms the integration approach.
- **Chunk 3 and Chunk 4 can run in parallel** once Chunk 2 settles the API contract between them.
- **Chunk 5 depends on Chunks 1-4.**

## Out-of-band work that happens in parallel

**Branding direction conversation with the team.** Triggered whenever Alex is available.

**SecretAI conversation about qwen3.6.** Confirm timeline for qwen3.6 hosting. Ask explicitly for jedi-style hosting configuration.

**Privacy explainer copy.** Drafted iteratively.

**v1 product scope document.** The successor to this demo scope. Drafted after Alex has used the demo.

## Working repository

`C:\dev\secret-claw\` (committed at e549163, pushed to https://github.com/MrGarbonzo/secret-claw)

Structure as defined in the scope doc.

## Version history

- **v0.1 (May 19 2026):** Initial build plan. Anonymous wizard, invitation codes, wizard-of-oz provisioning.
- **v0.2 (May 19 2026):** Keplr auth pivot reflected.
- **v0.3 (May 19 2026):** Pattern B self-service provisioning architecture confirmed.
- **v0.4 (May 19 2026):** API-key auth replaces Keplr-in-wizard signing. Chunk 1 completed. Chunks 2-3 simplified.
- **v0.5 (May 19 2026):** Chunk 2 Part 1 (API validation prototype) complete, findings folded in. `/api/vm/instances` confirmed as validation endpoint. Next.js API-route proxy now a definite Chunk 3 component (portal serves no CORS, so direct browser calls are impossible). Compose-rendering decision settled: backend-side. No user-identity display possible. See commit 360e7ca for the prototype and `wizard/prototypes/api-validation/FINDINGS.md` for empirical detail.
- **v0.6 (May 20 2026):** Two architecture decisions locked before Chunk 3 design conversation begins. (1) Deployment records are created at wizard submission time, not at provisioning completion — the wizard frontend generates the `deployment_id` and POSTs to `/api/record-deployment` before the portal `vm-create` call, then PATCHes status as polling progresses. Failed deploys persist for owner observability. Screen 5's status polling runs against the local backend, kept in sync from portal polling. (2) Compose rendering ports from Python to Node/TypeScript for the wizard backend; `deploys/byo/scripts/render.py` remains as the canonical local CLI tool. Both must produce byte-equivalent output for the same template + inputs (test fixtures cover, modulo intentionally-random fields).
