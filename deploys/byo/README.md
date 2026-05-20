# deploys/byo — Secret Claw BYO deployment template

Parameterized SecretVM deployment template for the Secret Claw v1 demo's
**BYO API** tier. The wizard renders this template with user-specific
values and submits the resulting `docker-compose.yml` to the SecretAI
portal via `POST /api/vm/create` (see
`../../docs/secretvm-provisioning-research.md` for portal API details).

## What this directory is

A template + a renderer. The renderer takes a JSON config of user-specific
values and writes one `docker-compose.yml` plus two sidecar files
(`deployment_id.txt`, `gateway_token.txt`) that the wizard captures for the
completion screen. Everything else — `openclaw.json`, the cron jobs, the
workspace bootstrap markdown — is base64-inlined into that single compose
file as heredoc blobs in a `configs.content: |` block, so the upload is
one file and per-user state seals into the named docker volume on first
boot inside the TEE.

## What it deploys

A single OpenClaw 2026.5.12 gateway on SecretVM, pinned to the
validated image digest, configured for one user:

- **Agent name:** `Secret Agent` (hardcoded for v1 — no parameterization).
- **LLM:** Anthropic Claude Sonnet 4.6 (`anthropic/claude-sonnet-4-6`),
  200K context, prompt caching with the default short retention.
- **Channel:** Telegram, gated to one chat (optional in v1 — see below).
- **Routines (cron jobs seeded into `~/.openclaw/cron/jobs.json`):**
  - `welcome-once` — fires once at first boot (deterministic past
    timestamp + `deleteAfterRun: true`), introduces Secret Agent.
  - `morning-news` — daily 13:00 UTC, fetches HN front page and
    summarizes the top 3-5 AI/tech stories.
  - `evening-crypto` — daily 21:00 UTC, fetches BTC/ETH/SCRT spot
    prices from CoinGecko.
  - **When Telegram is disabled** (see below), all three jobs render
    with `enabled: false`. The user re-enables them via the web UI
    once they add Telegram credentials.
- **Diet:** `tools.allow: [read, write, edit, exec, dir_list, web_fetch,
  message]`, `skills: []`, `bootstrapMaxChars=2000`,
  `bootstrapTotalMaxChars=8000`, per-turn forced compaction.
- **Structural fixes baked in:** update phone-home disabled, Bonjour off
  via env, named docker volumes only, `controlUi.allowedOrigins` includes
  the public origin, no Traefik router labels (SecretVM's compose
  rewriter injects them at upload time), gateway HTTP API auth-gated by
  a random per-render token.

## Files

```
deploys/byo/
  README.md                          # this file
  .env.example                       # placeholder values, env-var shape
  .gitignore
  example-config/
    user.example.json                # Telegram-on placeholder config
    user.no-telegram.example.json    # Telegram-off placeholder config
    user.tomato-rat-test.json        # legacy SSH-push test config (not for production)
  scripts/
    render.py                        # the substitution mechanism
    build_test_onvm_compose.py       # test-only, splices Traefik for SSH-push
  templates/
    docker-compose.yml               # compose template
    openclaw.json                    # config template
    cron-jobs.json                   # cron store template, 3 jobs
    workspace/                       # AGENTS, IDENTITY, SOUL, USER markdown
```

## Config schema

`scripts/render.py` reads a JSON config with these fields:

| Field                | Required | Example                                    |
| -------------------- | -------- | ------------------------------------------ |
| `VM_HOSTNAME`        | yes      | `"amber-otter.vm.scrtlabs.com"`             |
| `ANTHROPIC_API_KEY`  | yes      | `"sk-ant-..."`                              |
| `TELEGRAM_BOT_TOKEN` | optional | `"123456789:ABC..."` or `""`               |
| `TELEGRAM_CHAT_ID`   | optional | `"587534846"` / `"-1001234567890"` or `""` |

Both Telegram fields must be set together or both empty. If both are
empty, the rendered compose disables the Telegram plugin in
`openclaw.json`, drops the channel and `ownerAllowFrom` entries, and
flips all three cron jobs to `enabled: false`. The agent still boots
healthy and is reachable via the web UI at `https://{VM_HOSTNAME}/`.

## Rendering

```bash
python scripts/render.py --config user.json --out ./out
```

Outputs in `./out/`:

```
docker-compose.yml                  # THE artifact the wizard uploads
deployment_id.txt                   # UUID4 (also baked into the compose)
gateway_token.txt                   # 32-byte hex (also in rendered openclaw.json)
openclaw.rendered.json              # inspection copy
cron-jobs.rendered.json             # inspection copy
AGENTS.md / IDENTITY.md / SOUL.md / USER.md   # inspection copies
```

**The wizard uploads only `docker-compose.yml`** to the SecretAI portal.
It reads `deployment_id.txt` to record the deployment in its database and
`gateway_token.txt` to show on the completion screen. Everything else in
`./out/` is inspection / audit only — those files are already embedded
inside the compose.

## Non-determinism (changed from v0)

**Re-rendering with the same input now produces a different compose.**
Both the deployment ID (UUID4) and the gateway token (32 random bytes)
are generated fresh per render. This is intentional:

- Every wizard submission gets a unique deployment ID so the wizard
  backend can track it independently of VM lifecycle events.
- Random gateway tokens are harder to guess from the input config than
  SHA-256-derived ones; entropy is now real entropy.
- The wizard captures both sidecar files at render time. The user sees
  the gateway token on the completion screen and can re-fetch it from
  the rendered compose on the VM later (same trust boundary as the
  Anthropic key).

The welcome-message schedule remains anchored to a deterministic past
timestamp + `deleteAfterRun: true`, so cron catches it on first boot and
fires it exactly once.

## How the wizard uses this template

Sequence per `../../ARCHITECTURE.md`:

1. Wizard collects `VM_HOSTNAME`, `ANTHROPIC_API_KEY`, and optionally
   `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` from the user.
2. Wizard writes them to a JSON config and runs `render.py`
   (server-side or browser-side — see ARCHITECTURE for the decision
   surface).
3. Wizard captures `deployment_id.txt` and `gateway_token.txt`.
4. Wizard POSTs `docker-compose.yml` to `/api/vm/create` on the SecretAI
   portal, authenticated by the user's Keplr-signed session cookie.
5. Wizard polls `/api/background-job/<jobId>` until provisioning
   completes.
6. SecretVM rewrites the compose to inject Traefik labels, brings up
   the gateway, the seed script populates the state volume on first
   boot, the gateway exposes `https://{VM_HOSTNAME}/healthz` (200) and
   (if Telegram is enabled) sends the welcome message within ~60s of
   healthy.

## Design decisions

- **`configs.content: |` seed pattern** survives SecretVM's compose
  rewriter, unlike `command: |` with embedded heredocs (which the
  rewriter folds via `|→>`, breaking shell heredocs). Locked from the
  tomato-rat test deploy (2026-05-19).
- **No bind mounts.** Cyan-fox's lesson: host paths that don't exist
  on the SecretVM cause silent compose-up failures. Named volumes only.
- **Anthropic key at rest in compose.** Inside the TEE attestation
  boundary on the VM. Documented in `../../FINDINGS.md` as a privacy
  property worth re-confirming for the public privacy story.
- **`message` tool in `tools.allow`.** Routines deliver Telegram
  messages via the `message` tool from isolated agent runs.

## Validation history

- 2026-05-19 — tomato-rat SSH-push test (under previous shape with
  `AGENT_NAME` parameter); end-to-end healthy, welcome cron staged
  correctly.
- _New v1 schema not yet re-deployed to a SecretVM. Validation pending
  per build plan Chunk 5._

## Related

- `../../docs/secretvm-provisioning-research.md` — SecretAI portal API
- `../../FINDINGS.md` — SecretVM gotcha catalog
- `../../docs/runbook-byo.md` — post-deploy operations runbook
- `../../docs/troubleshooting.md` — known failure modes
