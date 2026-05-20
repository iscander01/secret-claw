# Secret Claw — v1 Demo Scope

**Status:** Working document, May 20 2026 (v0.8)
**Owner:** Garbonzo
**Purpose:** Define the deliberately narrow scope of the first demonstrable product, for internal testers (including Alex) to use and react to. Anchors engineering work. Surfaces decisions that need Alex's input before broader v1.

---

## What this is

A web product that lets a user deploy their own AI agent on SecretVM in under five minutes. The user authenticates to SecretAI's existing portal (one time, in the portal itself) and generates an API key there. They paste that key into a single configuration form along with their Anthropic API key and optional Telegram credentials, click "Create," and land on the agent's detail page — initially showing provisioning state, transitioning in place to the running agent's full details (URL, gateway token, Telegram bot username) once the SecretAI portal reports ready.

The wizard is visually indistinguishable from the SecretAI Developer Portal (https://secretai.scrtlabs.com) — same color palette, type system, spacing, and component patterns (selection cards, status pills, form sections, dark-mode layout with orange-red accent). This is a deliberate **Position A** design choice: the wizard reads as a contiguous extension of the portal so that internal testers (and any future portal acquisition of the wizard surface) experience zero visual context-switch. Honest scope on the chrome: the wizard ships a minimal portal-style header (Secret AI Developer Portal logo, page title, "Back to portal" link pointing at https://secretai.scrtlabs.com) but does not recreate the portal's full sidebar, profile dropdown, balance indicator, or VM-fleet list — those reflect concepts the wizard has no equivalent for. Users wanting to manage agents across browser sessions go to the SecretAI portal directly; agents are real VMs in the user's portal account, so the portal's fleet view is authoritative.

The deployed agent runs Anthropic Claude Sonnet 4.6 inside an attested confidential compute environment, with an optional Telegram channel for proactive interaction. Agent name is fixed to "Secret Agent" for v1; personality and identity customization come later.

Users own their VMs in their own SecretAI portal accounts. The wizard is a UI layer over SecretAI's existing portal API — it never holds user credentials persistently, never owns user VMs, and never sits between users and their infrastructure as a permanent dependency.

This is an internal-testing demo. Initial testers will be crypto-native users (since SecretAI portal authentication currently requires Keplr), but the wizard itself is auth-method-agnostic: it accepts an API key regardless of how the user obtained that key. When the portal eventually supports non-Keplr auth methods, the wizard works unchanged.

## What this is not

- Not the full v1 product
- Not monetized (free during demo)
- Not branded (uses SecretVM-provided URLs, working product name)
- Not the SecretAI-tier offering (waits for qwen3.6 on SecretAI)
- Not OpenAI-compatible yet (Anthropic only)
- Not directly integrated with the SecretAI portal — it's a separate web app that calls the portal API

## Product surface

### Two tiers visible, one enabled

The landing page shows both tiers from the start so the product positioning is clear:

**BYO API (enabled for demo):** User provides their own Anthropic API key. Agent runs in attested compute, makes inference calls to Anthropic. Privacy story: the agent runs in your private compute environment; inference goes to Anthropic.

**Secret (greyed out, "coming soon"):** SecretAI hosts the model on attested infrastructure. End-to-end dual attestation. No third-party API dependency. Waiting on qwen3.6 availability on SecretAI.

### Wizard flow (two views)

The product surface is two pages, not a multi-step flow. Structurally and visually they mirror the SecretAI portal's "Create New SecretVM" page (for View 1) and "VM detail" page (for View 2). The wizard does not include an "agents list" view of its own — users land directly on the configuration form, and the SecretAI portal's authoritative VM list serves as the cross-session fleet view via the header's "Back to portal" link.

**View 1 — `/create-agent` (single configuration form, one scrollable page).** Sections laid out vertically, validation progressive (each section reaches a `valid ✓` state as the user completes it, with errors surfaced inline). No "advance to next screen" gating between sections — the user can scroll back and forth and edit anything. A single "Create" button at the bottom submits the whole form.

   Sections in order:
   1. **Tier selection.** Two selection cards matching the portal's selection-card pattern: BYO API (enabled, selected by default) and Secret (greyed "coming soon" — waiting on qwen3.6 on SecretAI).
   2. **SecretAI Portal API Key.** Text input. Walkthrough: "Go to [SecretAI portal link] → sign in with Keplr → generate an API key → paste it here." Real-time validation against `GET /api/vm/instances` with `Authorization: Bearer <key>` — the empirically-confirmed validation endpoint (200 with the user's VM list for a valid key, 401 for invalid or missing). On success the section shows "API key valid ✓" and optionally surfaces the existing-VM count as soft confirmation ("Looks like you've deployed N VMs here before") if N > 0. **No "Connected as `<wallet>`" display:** the portal does not expose user identity to bearer-token callers (no `ownerSub`, no email, no wallet address). If the key is invalid, surface the error clearly with a "regenerate your key" prompt.
   3. **Anthropic API Key.** Text input with paste-friendly UX. Real-time validation against Anthropic's API (one-token test call) before showing `valid ✓`. Helper text confirms "Powered by Claude Sonnet 4.6 from Anthropic."
   4. **Telegram (optional).** Selection card pattern: "Enable Telegram" / "Skip — I'll add this later" with the explicit explanation "Without Telegram, your agent will only be reachable through its web URL." When enabled, expands to show the BotFather walkthrough, bot-token input, and chat-ID input. Validation against Telegram's API (getMe) before showing `valid ✓`.
   5. **Submit.** "Create" button. Disabled until all required sections (tier, SecretAI key, Anthropic key) reach `valid ✓`. Telegram is optional. On click, the wizard generates the `deployment_id`, records the deployment, submits to the portal, and navigates the browser to `/agents/<deployment_id>` (the detail page).

**View 2 — `/agents/<deployment_id>` (agent detail page).** Mirrors the SecretAI portal's VM detail page structurally. Page title shows the agent name. Below the title is a tab strip with two tabs (functional subset of the portal's tab structure — the portal's Upgrade History, Resources, Compose File, Network, Attestation, and Code tabs are VM-specific concepts that don't translate to the agent abstraction and are deliberately not recreated):

   - **Overview tab (default).**
     - **While Provisioning:** status pill ("Provisioning" — yellow/orange), what's already known (agent name, tier, telegram-enabled flag, creation time, deployment ID), and a progress indicator with sub-status text reflecting the portal's background-job phases ("Submitting your configuration," "Creating your secure compute environment," "Installing your agent," "Connecting to Telegram" if applicable). The page polls the wizard backend's `/api/deployment-status/<id>` endpoint, which the wizard keeps in sync from portal polling.
     - **When Ready:** status pill flips to "Running" (green). The page updates in place — same URL, same layout — to reveal the agent's URL prominently, the gateway token, the Telegram bot username (if Telegram was set up), and a brief "what to do next" section: "Open your agent's URL to chat directly," and if Telegram is set up, "Your agent will message you on Telegram in about a minute. Tomorrow at 7am UTC you'll receive your first daily news briefing." A note clarifies that the user can manage their VM directly through the SecretAI portal — the agent isn't locked inside our wizard.
     - **If Failed:** status pill flips to "Failed" (red). The page shows the error message and a "Try again" link back to `/create-agent`.
   - **Logs tab.** Fetched on tab activation (not live-streamed). Recent gateway logs from the agent's OpenClaw container — a simple scrollable text view. Empty state during provisioning ("Logs will appear after the agent boots"). Useful for debugging when something looks wrong.

### What the deployed agent does

The agent comes with two routines pre-configured:

**Morning news briefing.** Daily at 13:00 UTC. Fetches top AI/tech stories from HN, summarizes the top 3-5 concisely, posts to Telegram. If Telegram is skipped, the routine still fires but with no delivery channel.

**Evening crypto summary.** Daily at 21:00 UTC. Fetches BTC, ETH, and SCRT prices from CoinGecko, posts a clean summary to Telegram. Same skip behavior as morning news.

**Welcome message (one-shot, on first boot).** If Telegram is connected, the agent sends a welcome message introducing itself and mentioning the upcoming morning briefing. Fires exactly once via deterministic past-timestamp cron + deleteAfterRun pattern.

**Web UI.** The OpenClaw control UI is reachable at the SecretVM-provided URL. User authenticates with the gateway token (visible on the agent detail page once status flips to Running). They can chat with the agent through the web interface even without Telegram.

### Agent identity

Fixed to "Secret Agent" for v1 demo. References to the agent's name thread through the workspace bootstrap files (AGENTS.md, IDENTITY.md, SOUL.md, USER.md) so the agent introduces itself consistently. Personality, custom names, and identity choice come in post-demo iterations.

## Infrastructure shape

### Deployment architecture

Single-service Docker Compose, OpenClaw 2026.5.12 (pinned digest), deployed via the SecretAI portal API. Configuration seeded into named Docker volumes by an inline seed script using the `configs.content` pattern (Phase 2 finding — the only pattern that survives SecretVM's compose rewriter cleanly).

Per-user state stays inside the TEE-encrypted boundary: gateway token, API key, Telegram credentials, agent workspace, cron job records. Nothing user-specific stored outside the VM except in the wizard backend's deployment record during provisioning.

### Provisioning architecture (self-service via Pattern B with API-key auth)

The wizard provisions on behalf of the user using a SecretAI portal API key the user has generated themselves. The user owns their VM in their own SecretAI portal account.

Concrete flow:

1. User lands at `/create-agent` (the wizard's root entry point).
2. User pastes their SecretAI portal API key into the form's SecretAI section. The section validates the key against the portal (a lightweight authenticated call) and shows `valid ✓` on success.
3. User completes the remaining sections: Anthropic API key (validated in place) and Telegram (enabled or skipped via selection card; if enabled, bot token and chat ID validated in place).
4. User clicks "Create" at the bottom of the form. The wizard frontend generates a `deployment_id` (uuid) and creates a deployment record in our backend with status="submitted" via `POST /api/record-deployment`. The record holds non-sensitive metadata only (deployment_id, tier, telegram_enabled flag, gateway_token, timestamp).
5. The wizard frontend immediately navigates the browser to `/agents/<deployment_id>` — the agent detail page. The Overview tab renders in "Provisioning" state showing what's already known (name, tier, telegram flag, creation time, deployment ID) and a polling progress indicator.
6. In parallel, the wizard's backend renders the deploy template with user-specific values (server-side via the Next.js portal proxy) and submits `POST /api/vm/create` to the SecretAI portal with `Authorization: Bearer <api_key>` and the rendered compose attached as multipart form data.
7. The backend polls `/api/background-job/<jobId>` (with bearer auth) until status transitions. As status transitions, the backend updates the deployment record (`submitted → provisioning → ready` on success; `→ failed` with `error_message` on failure). The `ready` update carries `vm_id` and `vm_hostname`.
8. The agent detail page polls `/api/deployment-status/<deployment_id>` on a short interval (e.g. every 3 seconds) while status is `submitted` or `provisioning`. When the response transitions to `ready` (or `failed`), the page updates in place — same URL, same layout — to show the full agent details (URL, gateway token, Telegram bot username if applicable) or the failure error message.

Key properties:

- **Deployment records persist regardless of outcome.** A row is created at submission time, before the portal is even called. If portal submission fails or provisioning errors out mid-flight, the row remains with status="failed" and `error_message` set — visible in the owner dashboard. The successful path adds `vm_id` and `vm_hostname`. The owner dashboard therefore shows every attempted deployment, not just successful ones.
- **The wizard's backend never holds the user's SecretAI, Anthropic, or Telegram credentials.** API keys, Anthropic keys, and Telegram credentials all flow from the wizard's form into the portal API call in a single transaction and are then discarded. The deployment record holds: `deployment_id`, `tier`, `telegram_enabled` flag, `gateway_token`, timestamps, `vm_id`, `vm_hostname`, `error_message`. No bearer tokens, no Anthropic keys, no Telegram bot tokens.
- **The `gateway_token` is the one user-facing credential the wizard persists.** It's generated by the renderer per-deployment and baked into the OpenClaw config inside the user's TEE-encrypted VM; the user needs it to access the OpenClaw control UI. Persisting it in the deployment record lets the agent detail page redisplay it on subsequent visits (matching the portal's pattern of showing VM credentials repeatedly). It's not a credential to *our* infrastructure or to the SecretAI portal — it's the user's access token to their own VM's UI, conceptually similar to `vm_hostname`.
- The wizard is auth-method-agnostic. It accepts an API key from whoever generated it; the portal's auth method (currently Keplr) is invisible to the wizard. When the portal supports additional auth methods, the wizard works unchanged.
- **The wizard frontend cannot call the SecretAI portal directly from the browser.** Empirical Chunk 2 finding: the portal returns no CORS response headers on any path, so every cross-origin preflight is blocked by the browser. The wizard ships with a thin Next.js API-route proxy (under `wizard/app/api/portal/*`) that forwards portal calls server-side, attaching the user-supplied bearer token to each upstream request. The token never persists in the proxy — single-hop forwarding only — which preserves the "no user credentials persisted in our infrastructure" property.
- **Compose rendering happens in Node/TypeScript inside the wizard backend.** The existing Python renderer at `deploys/byo/scripts/render.py` remains as the canonical local CLI tool for direct `deploys/byo/` work; the wizard's Node renderer is the production path. Both must produce byte-equivalent output for the same inputs (modulo intentionally-random fields like deployment_id and gateway token).

Reference: `docs/secretvm-provisioning-research.md` documents the SecretAI portal API in detail based on reading the `secretvm-cli` source code. The `Authorization: Bearer <api_key>` path is documented in `src/services/apiClient.ts:85-87`.

### Authentication

The wizard uses SecretAI portal API keys (bearer auth). Users obtain these from the SecretAI portal directly — the wizard never participates in the user's auth-to-portal flow.

For the v1 demo:
- Internal testers are crypto-native (Keplr-authenticated to the portal). The friction of "go to portal, sign in with Keplr, generate API key, paste here" is acceptable for this audience.
- The wizard does not maintain user accounts. Each wizard run is one-shot: paste credentials, deploy, done.
- The wizard's own database tracks deployments but not users.

For the eventual production product:
- When the SecretAI portal supports additional auth methods (Gmail, email, etc.), the wizard works unchanged. Users authenticate to the portal however they prefer, generate an API key, paste it into the wizard.
- The wizard could eventually add its own user accounts on top, separate from the portal's auth. Or it could remain stateless. That decision waits until the post-demo product scoping.

The `getCurrentUser()` abstraction returns `{deploymentId, secretAiApiKey}` for v1. Production auth swaps it later if needed; the swap point is small because the wizard's relationship to the portal is just "I have a bearer token."

### Hosting

Wizard frontend on Vercel or similar — placeholder domain for the demo period. Backend on the same platform or Supabase for the deployment record table. The SecretAI portal handles all actual VM provisioning, lifecycle management, and (eventually) billing.

The wizard does NOT host VMs, hold inference credentials, or process user agent traffic. It's strictly a configuration tool that submits to the portal API.

## Explicit non-goals for the demo

These are deliberate gaps. Each becomes part of the conversation with Alex after he's used the demo:

- **No portal auth integration.** The wizard doesn't authenticate users to the SecretAI portal; users do that themselves and bring an API key.
- **No payment integration.** Free during demo.
- **No agent customization.** Fixed name, fixed personality, fixed model.
- **No model choice.** Sonnet 4.6 only. No Haiku/Opus dropdown, no other providers.
- **No Slack or other channels.** Telegram is the only channel option.
- **No document storage.** Despite being the most uniquely-attested-compute-y feature, it's deferred.
- **No mobile app.** Web wizard + Telegram is the entire user surface.
- **No persistent user accounts in the wizard backend.** Each wizard run is one-shot; user manages their VMs in the SecretAI portal.
- **No support automation.** Failures show an error and a contact link.
- **No analytics.** No tracking. No telemetry. No usage stats beyond what the gateway logs internally.
- **No multi-VM management.** One deployment per wizard run; users wanting multiple agents run the wizard multiple times (their portal will show all of them).
- **No Traefik toggle.** The deploy template ships with the Traefik configuration we've validated. No client-side compose YAML mutation.
- **No contract-based KMS for secrets in v0.** Default to non-contract KMS provider (portal handles key wrapping server-side).
- **No recreation of the full SecretAI portal chrome.** The wizard uses a minimal portal-style header only (logo + page title + "Back to portal" link). No sidebar, no profile dropdown, no balance indicator, no portal-wide navigation. The wizard is portal-*aligned* visually, not a portal *clone*.
- **No agents list / fleet view in the wizard.** Solving "which deployments belong to this user" without a persistent user concept would require either localStorage scoping (breaks across browsers/private mode), API-key-hash scoping (disproportionate engineering for marginal demo value), or showing all deployments (privacy violation). The SecretAI portal already provides the authoritative fleet view — users own their VMs in their portal account, and the portal's VM list shows them. The wizard's header "Back to portal" link is the path to that view.
- **No portal tabs beyond Overview + Logs on the agent detail page.** The portal's VM detail page has Upgrade History, Resources, Compose File, Network, Attestation, and Code tabs. These reflect VM-as-VM operations; the wizard treats the deployment as "an agent," so the additional tabs are deliberately not implemented. Users wanting those views go to the SecretAI portal directly.

## Open decisions Alex needs to make

These are blocking for the broader v1 product but not for the demo. The demo's purpose is partly to surface them concretely.

**Who is the v1 audience?** The internal demo targets users who can navigate the SecretAI portal (currently crypto-native via Keplr; eventually broader as the portal adds auth methods). The earlier "regular non-technical users at $30-40/month" framing implies the broader product needs the portal to support non-crypto auth first. The audience question and the portal-auth-evolution question are coupled.

**Standalone product or SecretAI portal feature?** The wizard currently exists as a standalone web app calling the SecretAI portal API. An alternative architecture has the wizard integrated directly into the portal as a feature — at which point users wouldn't need to manage API keys at all, since they're already authenticated. Standalone gives brand independence and faster iteration; portal-feature gives smoother UX. Worth a conversation with Alex about which trajectory makes sense.

**BYO tier pricing.** SecretAI tier is at $30-40/month per Alex's framing. BYO tier — where users pay their own LLM costs on top of your service fee — could be priced lower, higher, or the same. Affects positioning.

**Branding direction.** "Secret Claw" / "Secret Agent" as the v1 names is workable for the demo but loaded for a launch. Branding work needs to start before public visibility.

**Anthropic API key at rest in the rendered compose on the VM.** Technically inside the TEE attestation boundary, so the privacy story holds. Worth Alex's explicit understanding of where exactly the key lives and what attestation does and doesn't protect against.

## Timeline

This is the demo, not the launch. Rough estimate from current state:

**Week 1:** Repo restructure into `C:\dev\secret-claw\` (DONE — Chunk 1 committed at e549163). Deploy template refined for fixed "Secret Agent" name and simplified parameterization (DONE).

**Week 2:** Wizard design conversation (chat-iterative). API-key validation pattern prototyped. Compose rendering decision (browser vs backend) settled. Significantly less engineering risk than the previously-planned Keplr-signing prototype.

**Week 3:** Wizard frontend built. Multipart upload + background-job polling implemented. End-to-end flow tested with a real SecretAI API key submitting to the actual SecretAI portal.

**Week 4:** Alex and other testers use the demo. Reactions captured. Open decisions surfaced and answered. Iteration based on what surprised them.

Four weeks from now to "Internal testers have used Secret Claw and have opinions about what it should become." The API-key architecture removes the Keplr-handshake risk from Chunk 2-3, so the timeline is more confident than it was at v0.3.

## Success criteria for the demo

The demo succeeds if:

1. A tester (Alex or otherwise) deploys their agent in under 10 minutes start-to-finish — including the "go to portal, generate API key" step
2. The agent works end-to-end — chat via web UI, chat via Telegram, morning briefing arrives the next day, evening summary arrives that night
3. The "get an API key from the portal" step doesn't trip people up; the walkthrough is clear enough that users find their way without help
4. Multiple testers deploy without the project owner's involvement (the "remove me from the loop" goal)
5. Alex has substantive reactions about the open decisions above, with enough specificity that we know what to build next

The demo fails if:

1. The wizard breaks somewhere and testers need help to recover
2. The deployed agent has visible quality issues (compaction hallucinations, tool errors, wrong outputs)
3. The API key generation step blocks testers (they can't find it, they get confused)
4. Testers complete the wizard but don't engage with the deployed agent afterward
5. Open decisions stay open because the demo didn't surface them concretely

## Working repository

`C:\dev\secret-claw\` (committed at e549163, pushed to https://github.com/MrGarbonzo/secret-claw)

```
secret-claw/
├── README.md
├── ARCHITECTURE.md
├── FINDINGS.md
├── docs/
│   ├── secret-claw-v1-demo-scope.md
│   ├── secret-claw-v1-build-plan.md
│   ├── secretvm-provisioning-research.md
│   ├── runbook-byo.md
│   └── troubleshooting.md
├── deploys/
│   ├── byo/
│   └── secret/
├── wizard/
└── backend/
```

## Version history

- **v0.1 (May 19 2026):** Initial scope. Anonymous wizard + invitation codes, wizard-of-oz provisioning under owner's SecretVM account.
- **v0.2 (May 19 2026):** Keplr wallet authentication adopted for internal testing demo.
- **v0.3 (May 19 2026):** Pattern B self-service provisioning architecture confirmed by research. Wizard becomes a UI layer over the SecretAI portal API.
- **v0.4 (May 19 2026):** Architecture simplified from Keplr-in-wizard signing to SecretAI portal API-key bearer auth. CLI docs confirmed API keys are a first-class auth mechanism for all VM operations. User generates the key in the portal once, pastes it into the wizard. Removes the Keplr handshake complexity entirely. Wizard is now auth-method-agnostic and forward-compatible with future portal auth methods.
- **v0.5 (May 19 2026):** API validation prototype findings folded in. `/api/vm/instances` confirmed as validation endpoint. No user-identity display possible (bearer callers get null identity fields). CORS finding: portal does not implement preflight; wizard requires Next.js proxy routes for portal calls. See `wizard/prototypes/api-validation/FINDINGS.md` and commit 360e7ca.
- **v0.6 (May 20 2026):** Architecture decisions locked before Chunk 3 design conversation. Deployment record lifecycle clarified: rows are created at wizard submission time (before the portal `vm-create` call) and status-tracked through `submitted → provisioning → ready`/`failed` as polling progresses. Failed deploys persist as observable rows in the owner dashboard. Compose rendering ports from Python to Node/TypeScript in the wizard backend; `deploys/byo/scripts/render.py` remains as the canonical local CLI tool. Both renderers held to byte-equivalent output.
- **v0.7 (May 20 2026):** Structural pivot following design conversation. Wizard restructured from a six-screen multi-step flow to a single-page configuration form plus a dedicated agent detail page, mirroring the SecretAI portal's "Create New SecretVM" and "VM detail" page patterns. Position A visual alignment: wizard adopts the portal's full design language (colors, type, components, spacing) but explicitly does not recreate the full portal chrome — minimal portal-style header only (logo + page title + "Your Agents" link). Two-view product surface: `/create-agent` (single form with sections: tier / SecretAI key / Anthropic key / Telegram / Submit) and `/agents/<deployment_id>` (Overview + Logs tabs, functional subset of the portal's tab structure). Post-submission flow: submit redirects to the agent detail page in "Provisioning" state, polls the local backend, and updates in place to "Running" state. Minimal `/agents` list page serves as entry point. `gateway_token` added to the deployment record so the detail page can redisplay it on subsequent visits.
- **v0.8 (May 20 2026):** Three follow-up decisions after v0.7. (1) `/agents` list page dropped from scope — solving "which deployments belong to this user" without a persistent user concept was disproportionate work for marginal demo value, and the SecretAI portal's VM list is the authoritative cross-session fleet view anyway. The "Your Agents" header link becomes "Back to portal" pointing at https://secretai.scrtlabs.com. The detail page at `/agents/<deployment_id>` is unchanged. (2) Async portal handler pattern locked: the submit endpoint creates the deployment record synchronously and returns the `deployment_id` to the browser; backend continues the portal interaction asynchronously via Vercel's `waitUntil` (keeps the serverless function alive after the response is sent). Polling-driven progression documented as fallback if `waitUntil` proves unreliable on Vercel's runtime. (3) README's stale "Keplr-authenticated user" language updated to reflect API-key bearer auth from the SecretAI portal.
