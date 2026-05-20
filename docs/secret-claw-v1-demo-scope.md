# Secret Claw — v1 Demo Scope

**Status:** Working document, May 20 2026 (v0.6)
**Owner:** Garbonzo
**Purpose:** Define the deliberately narrow scope of the first demonstrable product, for internal testers (including Alex) to use and react to. Anchors engineering work. Surfaces decisions that need Alex's input before broader v1.

---

## What this is

A wizard-driven web experience that lets a user deploy their own AI agent on SecretVM in under five minutes. The user authenticates to SecretAI's existing portal (one time, in the portal itself) and generates an API key there. They paste that key into the wizard along with their Anthropic API key and optional Telegram credentials. The wizard provisions the agent on the user's behalf via the SecretAI portal API, under the user's own portal account.

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

### Wizard flow (six screens)

1. **Land + tier selection.** Two tier cards, BYO selectable, Secret greyed. One CTA to continue.
2. **SecretAI portal API key.** Text input. Walkthrough: "Go to [SecretAI portal link] → sign in with Keplr → generate an API key → paste it here." Real-time validation against `GET /api/vm/instances` with `Authorization: Bearer <key>` — the empirically-confirmed validation endpoint (200 with the user's VM list for a valid key, 401 for invalid or missing). On success the wizard shows "API key valid ✓" and optionally surfaces the existing-VM count as soft confirmation ("Looks like you've deployed N VMs here before") if N > 0. **No "Connected as `<wallet>`" display:** the portal does not expose user identity to bearer-token callers (no `ownerSub`, no email, no wallet address), so the wizard has no identifier to show. If the key is invalid, surface the error clearly with a "regenerate your key" prompt.
3. **Anthropic API key.** Text input with paste-friendly UX. Real-time validation against Anthropic's API (one-token test call) before allowing progression. Displayed text confirms "Powered by Claude Sonnet 4.6 from Anthropic."
4. **Telegram setup (encouraged, skippable).** Walkthrough of BotFather with screenshots. User pastes bot token and chat ID. Validation against Telegram's API. Prominent "Skip — I'll add this later" option with explanation: "Without Telegram, your agent will only be reachable through its web URL."
5. **Provisioning screen.** "Setting up your Secret Agent... about 5 minutes." Status updates throughout: "Submitting your configuration," "Creating your secure compute environment," "Installing your agent," "Connecting to Telegram" (if applicable). Backed by real polling of the SecretAI portal's background job endpoint.
6. **Completion screen.** Agent URL prominent. Bot username prominent (if Telegram was set up). Brief "what to do next": "Open your agent's URL to chat directly," and if Telegram is set up, "Your agent will message you on Telegram in about a minute. Tomorrow at 7am UTC you'll receive your first daily news briefing." Note that the user can manage their VM directly through the SecretAI portal — your agent isn't locked inside our wizard.

### What the deployed agent does

The agent comes with two routines pre-configured:

**Morning news briefing.** Daily at 13:00 UTC. Fetches top AI/tech stories from HN, summarizes the top 3-5 concisely, posts to Telegram. If Telegram is skipped, the routine still fires but with no delivery channel.

**Evening crypto summary.** Daily at 21:00 UTC. Fetches BTC, ETH, and SCRT prices from CoinGecko, posts a clean summary to Telegram. Same skip behavior as morning news.

**Welcome message (one-shot, on first boot).** If Telegram is connected, the agent sends a welcome message introducing itself and mentioning the upcoming morning briefing. Fires exactly once via deterministic past-timestamp cron + deleteAfterRun pattern.

**Web UI.** The OpenClaw control UI is reachable at the SecretVM-provided URL. User authenticates with the gateway token (visible on the completion screen). They can chat with the agent through the web interface even without Telegram.

### Agent identity

Fixed to "Secret Agent" for v1 demo. References to the agent's name thread through the workspace bootstrap files (AGENTS.md, IDENTITY.md, SOUL.md, USER.md) so the agent introduces itself consistently. Personality, custom names, and identity choice come in post-demo iterations.

## Infrastructure shape

### Deployment architecture

Single-service Docker Compose, OpenClaw 2026.5.12 (pinned digest), deployed via the SecretAI portal API. Configuration seeded into named Docker volumes by an inline seed script using the `configs.content` pattern (Phase 2 finding — the only pattern that survives SecretVM's compose rewriter cleanly).

Per-user state stays inside the TEE-encrypted boundary: gateway token, API key, Telegram credentials, agent workspace, cron job records. Nothing user-specific stored outside the VM except in the wizard backend's deployment record during provisioning.

### Provisioning architecture (self-service via Pattern B with API-key auth)

The wizard provisions on behalf of the user using a SecretAI portal API key the user has generated themselves. The user owns their VM in their own SecretAI portal account.

Concrete flow:

1. User pastes their SecretAI portal API key into the wizard.
2. Wizard validates the key against the portal (a lightweight authenticated call).
3. User completes the rest of the wizard, providing their Anthropic API key and (optionally) Telegram credentials.
4. On clicking "deploy" on the final input screen, the wizard frontend generates a `deployment_id` (uuid) and creates a deployment record in our backend with status="submitted" via `POST /api/record-deployment`. The record holds non-sensitive metadata only (deployment_id, tier, telegram_enabled flag, timestamp).
5. Wizard renders the deploy template with user-specific values (server-side, via the wizard's Next.js portal proxy).
6. Wizard submits `POST /api/vm/create` to the SecretAI portal with `Authorization: Bearer <api_key>` and the rendered compose attached as multipart form data.
7. Wizard polls `/api/background-job/<jobId>` (also with bearer auth) until status transitions. As status transitions, the wizard PATCHes the deployment record (`submitted → provisioning → ready` on success; `→ failed` with `error_message` on failure). The `ready` patch carries `vm_id` and `vm_hostname`.
8. Screen 5 polls the local backend's deployment record (not the portal directly), so its progress display is driven from a single source of truth that the owner dashboard also reads.
9. On completion, the wizard reads the VM details from the deployment record and shows them on the completion screen.

Key properties:

- **Deployment records persist regardless of outcome.** A row is created at submission time, before the portal is even called. If portal submission fails or provisioning errors out mid-flight, the row remains with status="failed" and `error_message` set — visible in the owner dashboard. The successful path adds `vm_id` and `vm_hostname`. The owner dashboard therefore shows every attempted deployment, not just successful ones.
- **The wizard's backend never holds user credentials persistently.** API keys, Anthropic keys, and Telegram credentials all flow from the wizard's form into the portal API call in a single transaction. The deployment record holds only non-sensitive metadata (deployment_id, tier, telegram_enabled flag, timestamps, vm_id, vm_hostname, error_message). No bearer tokens, no Anthropic keys, no Telegram bot tokens.
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
