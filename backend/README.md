# Wizard backend (placeholder)

Built in Chunk 4 of the build plan. See
`../docs/secret-claw-v1-build-plan.md`.

With Pattern B (self-service provisioning), the backend is intentionally
minimal — deployment records and owner observability only, **no
provisioning logic**. The wizard frontend talks to the SecretAI portal
directly using the user's Keplr-signed session; the backend just stores
non-sensitive metadata about what was deployed.

## What lives here (Chunk 4)

A Supabase project (or equivalent) backing the wizard:

- **`deployments` table:** `deployment_id`, `wallet_address`, `vm_id`,
  `vm_hostname`, `status`, `created_at`, `provisioned_at`,
  `error_message`, `telegram_enabled`, `metadata` (jsonb).
- **What's NOT here:** API keys, Telegram bot tokens, anything
  sensitive. Those go straight from the wizard to the portal in the
  compose submission. This is a core security property of Pattern B.
- **HTTP endpoints:**
  - `POST /api/validate-anthropic-key` — one-token test call, returns
    ok/invalid. Doesn't store the key.
  - `POST /api/validate-telegram` — `getMe` test call, returns ok with
    bot username. Doesn't store the token.
  - `POST /api/record-deployment` — wizard creates a row at submission.
  - `PATCH /api/deployment-status/:deployment_id` — wizard updates as
    provisioning progresses.
  - `GET /api/deployment-status/:deployment_id` — for owner-side
    observability.
- **Owner dashboard:** read-only view of recent deployments
  (wallet, status, hostname, timestamp).

See `../ARCHITECTURE.md` for component boundaries.
