# Architecture

How the wizard, the deploy template, and the SecretAI portal interact.
Reads top-down: the user flow first, then where each component sits,
then the key abstractions that future code hooks into.

## Pattern B: self-service provisioning

The wizard provisions on behalf of the user using their own Keplr
identity. The user owns the resulting VM in their own SecretAI portal
account. The wizard is a configuration-and-deployment UI layer over the
portal's existing HTTP API — not a hosting service, not a permanent
dependency, and not a credential holder.

This pattern emerged from the SecretAI portal API research in
`docs/secretvm-provisioning-research.md`. The portal exposes a multipart
HTTP API (`POST /api/vm/create`) authenticated by a NextAuth session
cookie that Keplr signs into. There is no on-chain provisioning
transaction. The wizard simply replays what the `secretvm-cli` does
from a browser context.

## End-to-end flow

1. **User opens the wizard.** Landing page shows the two tiers (BYO
   enabled, Secret greyed). User clicks Continue on BYO.
2. **User connects Keplr.** Wallet extension prompts, user approves,
   wallet address captured.
3. **Wizard authenticates to the SecretAI portal in the background.**
   `GET /api/auth/csrf` → ask Keplr to `signArbitrary` an auth challenge
   → `POST /api/auth/callback/keplr` with `{walletAddress, signature,
   message, csrfToken, json: true}` → portal returns a NextAuth session
   cookie scoped to the user's wallet. (Fallback path documented in the
   research doc: popup-redirect via `/sign-in?cliCallbackPort=...` if
   CORS or SameSite blocks the programmatic path.)
4. **User completes the wizard.** Three remaining screens:
   - Anthropic API key (validated against Anthropic's API in real-time)
   - Telegram credentials (optional, validated against `getMe` in
     real-time; skip flow available)
   - "Setting up your Secret Agent…" provisioning screen
5. **Wizard renders the deploy template.** Inputs from the wizard form
   plus a freshly-minted UUID4 deployment ID and a fresh 32-byte hex
   gateway token. Rendering produces one `docker-compose.yml` plus
   sidecar files (`deployment_id.txt`, `gateway_token.txt`) that the
   wizard captures.
   - **Open decision:** browser-side or backend-side rendering.
     Browser-side keeps user credentials entirely in the user's
     session and out of the wizard's infrastructure (best privacy
     story). Backend-side simplifies the frontend. Settled in Chunk 2.
6. **Wizard submits to the portal.** Multipart `POST /api/vm/create`
   with `dockercompose` field set to the rendered compose, the user's
   wallet's session cookie attached. Portal returns a job ID + VM ID.
7. **Wizard polls `/api/background-job/<jobId>`** every ~3 seconds,
   updating the screen ("Creating your secure compute environment",
   "Installing your agent", "Connecting to Telegram") as the job
   transitions. ~5 minute typical end-to-end.
8. **Completion screen.** Agent URL prominent, gateway token displayed
   for web UI auth, bot username shown if Telegram was set up, wallet
   address shown so the user knows the agent is associated with their
   Keplr identity. Note that the user can manage their VM directly
   through the SecretAI portal.

## Component boundaries

```
┌─────────────────────┐    ┌──────────────────┐   ┌──────────────────┐
│   wizard (Next.js)  │───▶│   secret-claw    │   │  SecretAI portal │
│   keplr signing     │    │   backend        │   │ (secretai...com) │
│   compose rendering │    │  (deployment     │   │                  │
└─────────┬───────────┘    │   records only)  │   │  /api/auth/*     │
          │                └──────────────────┘   │  /api/vm/create  │
          │ session cookie                        │  /api/background │
          └──────────────────────────────────────▶│   -job/<jobId>   │
                                                  └────────┬─────────┘
                                                           │
                                                           ▼
                                                  ┌──────────────────┐
                                                  │   SecretVM (TEE) │
                                                  │   openclaw-gateway│
                                                  │   one per user   │
                                                  └──────────────────┘
```

The **wizard** is a Next.js SPA. It owns the form, the Keplr handshake,
the compose rendering (probably — pending Chunk 2 decision), and the
portal calls. It never stores user credentials beyond the user's own
browser session.

The **secret-claw backend** is intentionally minimal. It stores
deployment records (deployment_id, wallet address, vm_id, vm_hostname,
status, timestamps) for owner-side observability. It does *not* store
API keys, Telegram tokens, or any other user secrets — those go
straight from the wizard to the portal in the compose submission. It
exposes two validation helpers (Anthropic key check, Telegram token
check) and a deployment-records CRUD surface.

The **SecretAI portal** is the source of truth for VM lifecycle. The
wizard hands off and walks away; the user manages their VM at the
portal directly thereafter.

The **deploy template** at `deploys/byo/` is what the wizard renders.
Single-service compose, single OpenClaw 2026.5.12 gateway, base64-inlined
seed script that populates per-user state on first boot inside the TEE.
Per-user state seals into named docker volumes; nothing user-specific
crosses the TEE boundary in cleartext post-provisioning.

## Key abstractions

### `getCurrentUser()`

The wizard uses a single helper to answer "who is this submission
for?". For v1 it returns:

```ts
type CurrentUser = {
  walletAddress: string;       // from Keplr
  sessionCookie: string;       // from /api/auth/callback/keplr
  deploymentId: string;        // freshly-minted UUID4 per wizard run
};
```

Production auth (whatever it becomes — Gmail, email, custom) swaps the
implementation but keeps the shape. Any place in the wizard that needs
to know "whose submission is this" calls `getCurrentUser()` rather than
threading wallet address through every prop. The Keplr-specific bits
stay isolated to the connection step.

### Compose rendering boundary

The render contract is small: input is the JSON config schema
documented in `deploys/byo/README.md`; output is one
`docker-compose.yml` plus `deployment_id.txt` and `gateway_token.txt`.
Whoever does the render (browser or backend) sees the user's
credentials. Whoever doesn't render never sees them. This is the
explicit knob the Chunk 2 decision adjusts.

### Wizard backend ↔ portal split

The wizard backend never talks to the SecretAI portal. All portal calls
happen from the user's browser, authenticated by the user's session
cookie. The backend's only job is recording what happened, not making
it happen. This keeps the trust surface small: a compromised backend
loses deployment-record metadata, not user secrets.

## Trust boundaries

- **User's Keplr** — root of trust. Owns the wallet, signs auth
  challenges, controls the SecretAI portal session.
- **User's browser session** — holds the Keplr-signed session cookie,
  sees user credentials during rendering (if browser-side rendering
  wins in Chunk 2).
- **SecretAI portal** — accepts authenticated compose submissions,
  provisions VMs, returns metadata. Inside Secret Labs' trust boundary
  but not the project owner's.
- **SecretVM TEE** — runs the gateway, holds per-user state inside the
  attested encrypted region. The Anthropic API key sits at rest here;
  see `FINDINGS.md` for the privacy implications.
- **Wizard backend** — sees only non-sensitive deployment metadata
  (wallet address, vm_id, hostname, status, timestamps). Compromise
  loses traceability but no secrets.

## What this architecture is not

- **Not on-chain.** Provisioning is not a Secret Network transaction.
  The portal handles VM lifecycle off-chain. Keplr is used only to
  sign the auth challenge.
- **Not a hosting service.** The wizard provisions and walks away.
  The user owns the VM at the portal level.
- **Not a credential vault.** No long-term storage of API keys or bot
  tokens anywhere in the wizard's infrastructure.
- **Not a multi-tenant platform.** One wizard submission = one VM. No
  shared resources across users. No cross-user state.

## References

- `docs/secretvm-provisioning-research.md` — portal API protocol details
- `docs/secret-claw-v1-demo-scope.md` — product surface
- `docs/secret-claw-v1-build-plan.md` — engineering sequence
- `deploys/byo/README.md` — deploy template internals
- `FINDINGS.md` — SecretVM-platform gotchas burned in to date
