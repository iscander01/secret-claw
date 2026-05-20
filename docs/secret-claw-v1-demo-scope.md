# Secret Claw — v1 Demo Scope

**Status:** Working document, May 19 2026 (v0.3)
**Owner:** Garbonzo
**Purpose:** Define the deliberately narrow scope of the first demonstrable product, for internal crypto-native testers (including Alex) to use and react to. Anchors engineering work. Surfaces decisions that need Alex's input before broader v1.

---

## What this is

A wizard-driven web experience that lets a Keplr-authenticated user provision their own AI agent on SecretVM in under five minutes. The deployed agent runs Anthropic Claude Sonnet 4.6 (user provides their own API key) inside an attested confidential compute environment, with an optional Telegram channel for proactive interaction. Agent name is fixed to "Secret Agent" for v1; personality and identity customization come later.

Users provision under their own Keplr identity into their own SecretVM account. The wizard is a UI layer over SecretAI's existing portal API — it never holds user credentials persistently, never owns user VMs, and never sits between users and their infrastructure as a permanent dependency.

This is an internal-testing demo for crypto-native users (people who already have Keplr installed and understand wallet-based auth). The purpose is to make the product real, surface design questions concretely, and let testers deploy without the project owner's involvement.

## What this is not

- Not the full v1 product
- Not for the broad consumer audience yet (Keplr is a barrier for non-crypto users; that audience question stays open)
- Not monetized (free during demo)
- Not branded (uses SecretVM-provided URLs, working product name)
- Not the SecretAI-tier offering (waits for qwen3.6 on SecretAI)
- Not OpenAI-compatible yet (Anthropic only)

## Product surface

### Two tiers visible, one enabled

The landing page shows both tiers from the start so the product positioning is clear:

**BYO API (enabled for demo):** User provides their own Anthropic API key. Agent runs in attested compute, makes inference calls to Anthropic. Privacy story: the agent runs in your private compute environment; inference goes to Anthropic.

**Secret (greyed out, "coming soon"):** SecretAI hosts the model on attested infrastructure. End-to-end dual attestation. No third-party API dependency. Waiting on qwen3.6 availability on SecretAI.

### Wizard flow (six screens)

1. **Land + tier selection.** Two tier cards, BYO selectable, Secret greyed. One CTA to continue.
2. **Connect Keplr.** Standard Cosmos-ecosystem connection flow. User clicks "Connect Keplr," wallet extension prompts, user approves. Wallet address captured. The wizard authenticates to the SecretAI portal in the background using the Keplr signature pattern documented in `docs/secretvm-provisioning-research.md`.
3. **Anthropic API key.** Text input with paste-friendly UX. Real-time validation against Anthropic's API (one-token test call) before allowing progression. Displayed text confirms "Powered by Claude Sonnet 4.6 from Anthropic."
4. **Telegram setup (encouraged, skippable).** Walkthrough of BotFather with screenshots. User pastes bot token and chat ID. Validation against Telegram's API. Prominent "Skip — I'll add this later" option with explanation: "Without Telegram, your agent will only be reachable through its web URL."
5. **Provisioning screen.** "Setting up your Secret Agent... about 5 minutes." Status updates throughout: "Signing you in," "Submitting your configuration," "Creating your secure compute environment," "Installing your agent," "Connecting to Telegram" (if applicable). Backed by real polling of the SecretAI portal's background job endpoint. Includes a Keplr signature prompt for the auth challenge — handled smoothly with a "we need you to approve this in Keplr" UX moment.
6. **Completion screen.** Agent URL prominent. Bot username prominent (if Telegram was set up). Wallet address shown so user knows the agent is associated with their Keplr identity. Brief "what to do next": "Open your agent's URL to chat directly," and if Telegram is set up, "Your agent will message you on Telegram in about a minute. Tomorrow at 7am UTC you'll receive your first daily news briefing." Note that the user can manage their VM directly through the SecretAI portal — your agent isn't locked inside our wizard.

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

### Provisioning architecture (self-service via Pattern B)

The wizard provisions on behalf of the user using their Keplr identity. The user owns their VM in their own SecretAI portal account; the wizard is a configuration-and-deployment UI layer, not a hosting service.

Concrete flow:

1. User connects Keplr in the wizard. Wallet address captured.
2. Wizard authenticates to the SecretAI portal: requests a CSRF token from `/api/auth/csrf`, asks Keplr to sign the auth challenge, posts the signature to `/api/auth/callback/keplr`. Portal returns a session cookie scoped to the user's wallet.
3. User completes the wizard, providing their Anthropic API key and (optionally) Telegram credentials.
4. Wizard renders the deploy template with user-specific values.
5. Wizard submits `POST /api/vm/create` to the SecretAI portal with the rendered compose attached as multipart form data.
6. Wizard polls `/api/background-job/<jobId>` until status transitions to completed. Surfaces progress to the user.
7. On completion, wizard reads the VM details (hostname, status, attestation URL) from the portal and shows them on the completion screen.

Key property: the wizard's backend never holds user credentials persistently. The Keplr session cookie is the user's own auth; the API key and Telegram credentials get rendered into the compose and submitted to the portal in a single transaction. After provisioning completes, the wizard's database only tracks the deployment ID and the resulting VM hostname for the user's reference.

Reference: `docs/secretvm-provisioning-research.md` documents the SecretAI portal API in detail based on reading the `secretvm-cli` source code.

### Authentication

Keplr wallet authentication for internal testing demo. The wizard requires Keplr connection before proceeding. Wallet identity flows through to the SecretAI portal for VM ownership. The wizard's own backend doesn't maintain user accounts beyond the deployment record — the user's "account" is their Keplr wallet and their SecretAI portal session.

This is internal-testing auth. The production auth model for the broader consumer audience is a separate decision deferred until post-demo. The architectural assumption is that whatever production auth becomes — Gmail, email, custom flow — it would mediate to the same SecretAI portal API beneath. The wizard's current Keplr-only flow becomes one of multiple supported auth paths in the eventual product.

The `getCurrentUser()` abstraction returns `{walletAddress, sessionCookie, deploymentId}` for v1. Production auth swaps it later.

### Hosting

Wizard frontend on Vercel or similar — placeholder domain for the demo period. Backend on the same platform or Supabase for the deployment record table. The SecretAI portal handles all actual VM provisioning, lifecycle management, and (eventually) billing.

The wizard does NOT host VMs, hold inference credentials, or process user agent traffic. It's strictly a configuration tool that submits to the portal API.

## Explicit non-goals for the demo

These are deliberate gaps. Each becomes part of the conversation with Alex after he's used the demo:

- **No non-Keplr auth.** Crypto-native testers only. The non-crypto audience waits.
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
- **No contract-based KMS for secrets in v0.** Default to non-contract KMS provider (portal handles key wrapping server-side). The X25519/AES-SIV encryption code from the CLI is reusable but not required for the demo.

## Open decisions Alex needs to make

These are blocking for the broader v1 product but not for the demo. The demo's purpose is partly to surface them concretely.

**Who is the v1 audience?** The internal demo targets crypto-native users (Keplr is the auth). The earlier "regular non-technical users at $30-40/month" framing implied consumer SaaS, which Keplr is a barrier for. Either the demo's success reframes the audience toward crypto-native sovereignty buyers, or the post-demo product gains a non-Keplr auth path for the mass-market audience. The audience question and the auth question are coupled.

**Standalone product or SecretAI portal feature?** The wizard currently exists as a standalone web app calling the SecretAI portal API. An alternative architecture has the wizard integrated directly into the portal as a feature of the existing SecretAI offering. Standalone gives brand independence and faster iteration; portal-feature gives user-flow integration and inherits the portal's account model. Worth a conversation with Alex about which trajectory makes sense.

**BYO tier pricing.** SecretAI tier is at $30-40/month per Alex's framing. BYO tier — where users pay their own LLM costs on top of your service fee — could be priced lower (less inference cost to you), higher (premium tier for users who want strongest models), or the same. Affects positioning.

**Branding direction.** "Secret Claw" / "Secret Agent" as the v1 names is workable for the demo but loaded for a launch. Branding work needs to start before public visibility.

**Anthropic API key at rest in the rendered compose on the VM.** Technically inside the TEE attestation boundary, so the privacy story holds. Worth Alex's explicit understanding of where exactly the key lives and what attestation does and doesn't protect against.

**Whether the wizard's compose rendering happens browser-side or backend-side.** Browser-side keeps user credentials entirely in their session and out of your infrastructure. Backend-side simplifies the wizard's frontend complexity. Trade-off worth deciding consciously rather than by default during Chunk 2 design.

## Timeline

This is the demo, not the launch. Rough estimate from current state:

**Week 1:** Repo restructure into `C:\dev\secret-claw\`. Deploy template refined for fixed "Secret Agent" name and simplified parameterization. Documentation polished. Research doc on SecretAI portal API moved into the repo.

**Week 2:** Wizard design conversation (chat-iterative). Keplr connection + portal auth integration prototyped. Compose rendering decision (browser vs backend) settled.

**Week 3:** Wizard frontend built. Multipart upload + background-job polling implemented. End-to-end flow tested with a real Keplr account submitting to the actual SecretAI portal.

**Week 4:** Alex and other crypto-native testers use the demo. Reactions captured. Open decisions surfaced and answered. Iteration based on what surprised them.

Four weeks from now to "Internal testers have used Secret Claw and have opinions about what it should become." After that, decisions about the broader v1 happen based on real product feedback rather than abstract planning.

## Success criteria for the demo

The demo succeeds if:

1. A tester (Alex or otherwise) deploys their agent in under 10 minutes start-to-finish (target: under 5)
2. The agent works end-to-end — chat via web UI, chat via Telegram, morning briefing arrives the next day, evening summary arrives that night
3. The provisioning flow feels polished — Keplr signature prompts are well-explained, error states are handled gracefully, the user understands what's happening at each step
4. Multiple testers deploy without the project owner's involvement (the "remove me from the loop" goal)
5. Alex has substantive reactions about the open decisions above, with enough specificity that we know what to build next

The demo fails if:

1. The wizard breaks somewhere and testers need help to recover
2. The deployed agent has visible quality issues (compaction hallucinations, tool errors, wrong outputs)
3. Testers complete the wizard but don't engage with the deployed agent afterward
4. Open decisions stay open because the demo didn't surface them concretely
5. The Keplr auth flow is confusing enough to discourage testers from completing the wizard

## Working repository

`C:\dev\secret-claw\`

```
secret-claw/
├── README.md                          # what this is, where pieces fit
├── ARCHITECTURE.md                    # how wizard, templates, portal interact
├── FINDINGS.md                        # SecretVM gotchas + future findings
├── docs/
│   ├── secret-claw-v1-demo-scope.md   # this document
│   ├── secret-claw-v1-build-plan.md   # companion build plan
│   └── secretvm-provisioning-research.md   # SecretAI portal API research
├── deploys/
│   ├── byo/                           # the working deploy template
│   └── secret/                        # placeholder for SecretAI tier
├── wizard/                            # frontend (built week 2-3)
└── backend/                           # minimal deployment record store (week 3)
```

## Version history

- **v0.1 (May 19 2026):** Initial scope, post benchmark-matrix decisions and post first test-deploy validation. Anonymous wizard + invitation codes, wizard-of-oz provisioning under owner's SecretVM account.
- **v0.2 (May 19 2026):** Keplr wallet authentication adopted for internal testing demo. Replaces anonymous + invitation code access. Production auth model deferred.
- **v0.3 (May 19 2026):** Architecture clarified to Pattern B (self-service provisioning). Research confirmed SecretAI portal exposes a multipart HTTP API authenticated by Keplr signature; provisioning is not an on-chain transaction. Wizard becomes a UI layer over the existing portal API. Wizard-of-oz manual provisioning replaced by direct portal API calls on the user's behalf.
