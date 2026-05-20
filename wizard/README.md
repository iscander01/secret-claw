# Wizard frontend (placeholder)

Built in Chunk 3 of the build plan. See
`../docs/secret-claw-v1-build-plan.md`.

Will be a Next.js application implementing the six-screen wizard flow
defined in `../docs/wizard-design.md` (drafted in Chunk 2). Uses Keplr
authentication and the SecretAI portal API documented in
`../docs/secretvm-provisioning-research.md`. Renders the deploy
template at `../deploys/byo/` with user inputs and submits the
resulting compose to the portal.

The `getCurrentUser()` abstraction (defined in `../ARCHITECTURE.md`)
returns `{walletAddress, sessionCookie, deploymentId}` for v1, swappable
for production auth later.

A throwaway Keplr + portal auth prototype lands here first
(`prototypes/auth/`) during Chunk 2 — validates the integration end-to-end
before the full wizard build starts.
