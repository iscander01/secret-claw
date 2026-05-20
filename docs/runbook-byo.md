# Runbook — BYO tier operations

**Scope:** Post-provisioning diagnosis and support. With Pattern B,
provisioning is automated by the wizard, so this runbook does NOT
cover manual provisioning steps — refer to `secretvm-provisioning-research.md`
and `ARCHITECTURE.md` for how the wizard provisions on the user's behalf.

## When to consult this runbook

A user's wizard submission succeeded — they saw the completion screen
with a VM hostname — but something downstream is wrong. Examples:

- The user can't reach the agent's web UI.
- Telegram never sent the welcome message.
- The morning brief didn't arrive.
- The wizard backend's deployment record shows `failed` or stuck at
  `provisioning`.

## What to check, in order

### 1. Look up the deployment record

The wizard backend's `deployments` table is the operational index.
Filter by `wallet_address` (if the user has shared it) or
`deployment_id` (if they have it from the completion screen). Each
row has `vm_id`, `vm_hostname`, `status`, `telegram_enabled`,
timestamps, and a `metadata` JSON blob.

### 2. Open the user's VM in the SecretAI portal

The SecretAI portal at `https://secretai.scrtlabs.com/` is the source
of truth for VM lifecycle. Find the VM by `vm_id` from the deployment
record. The portal shows:

- VM status (provisioning / running / stopped / failed)
- Container logs (gateway + injected Traefik service)
- Compose file as actually written to the VM (after the rewriter's
  mutations)
- Attestation status

If the user gave you their Keplr wallet for access, they own the VM
in their portal account; you may need them to share the portal view
directly (screenshare or screenshot) rather than impersonating them.

### 3. Probe the gateway externally

If the VM appears running but the user reports it's unreachable:

```bash
curl -s https://<vm_hostname>/healthz
# Expect: {"ok":true,"status":"live"}
```

If `/healthz` returns 502, the Traefik router probably exists but the
gateway container isn't ready. Check container logs in the portal.

If `/healthz` returns 404 or connection refused, the Traefik router
isn't wired — usually a rewriter bug, surface it to the SecretAI team
with the VM ID.

### 4. Verify the seed completed

In the portal's container logs view for `openclaw-gateway-<short_id>`,
look for the `[seed]` lines:

- `[seed] populating /home/node/.openclaw` — seed running first boot
- `[seed] done` — seed finished
- `[seed] /home/node/.openclaw/openclaw.json already present, skipping`
  — subsequent boots after first

If the seed didn't run, the gateway will crash-loop reading a missing
openclaw.json. The most likely cause is the seed script failing to
parse — check for shell errors above the gateway's `node` lines.

### 5. Verify Telegram pairing (if enabled)

If `telegram_enabled` is true in the deployment record but the user
hasn't received the welcome message within ~2 minutes of `vm_hostname/healthz`
going green:

- Check the gateway logs for `telegram` plugin lines. A 401 means the
  bot token in the rendered compose is wrong or revoked.
- Confirm the user pasted the right `TELEGRAM_CHAT_ID` (signed
  integer). Wrong chat ID = welcome goes nowhere, no error to the
  user.
- The user can fix Telegram credentials post-deploy via the OpenClaw
  web UI (Settings → Channels → Telegram). No re-render needed.

### 6. Verify routines (post-first-day)

Welcome fires within ~60s of healthy. Morning brief at 13:00 UTC,
evening crypto at 21:00 UTC. If a routine didn't fire:

- Check the cron store at `/home/node/.openclaw/cron/jobs.json` via
  the portal's shell-into-container (if available).
- Routines render with `enabled: false` when Telegram was disabled at
  render time; the user re-enables them via the web UI after adding
  Telegram credentials.

## When a wizard submission fails partway through

The wizard updates the deployment record with the failure status from
`/api/background-job/<jobId>`. The user retries by running the wizard
again with the same Keplr wallet. The failed deployment record is
kept for diagnosis — don't delete it. Common failure modes:

- **Compose rewriter rejection** — the portal returns 400 with a YAML
  parse hint. Compare the rendered compose against the canonical
  example in `deploys/byo/templates/docker-compose.yml`; usually a
  template drift.
- **VM creation timeout** — portal-side. Surface to the SecretAI team
  with the `vm_id` and the background job ID.
- **Auth error 401/403 at submission** — the user's Keplr session
  expired. They re-connect Keplr; the wizard re-authenticates to the
  portal.

## Accessing a user's VM for support

The user owns their VM in their Keplr-tied SecretAI account. You
don't have direct admin access. Practical paths to give support:

- **Read-only:** the user shares the portal URL for their VM
  (screenshare or screenshot).
- **Interactive:** the user grants you owner-level access through the
  portal's sharing controls, if any exist; otherwise, talk them
  through it remotely.
- **Last resort:** the user re-runs the wizard from scratch to
  produce a fresh deploy; the failed one stays in their portal until
  they terminate it.

The wizard backend has no direct lever to mutate the user's VM. This
is by design — the trust boundary is the user's Keplr identity, not
the wizard owner's.

## Operational source of truth

- **User VM lifecycle:** SecretAI portal
- **Deployment records:** wizard backend `deployments` table
- **Architectural decisions:** this repo (`ARCHITECTURE.md`, `FINDINGS.md`)
- **Failure-mode catalog:** `troubleshooting.md`

If a finding is recurring, append it to `FINDINGS.md` with date,
symptom, and fix.
