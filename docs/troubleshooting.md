# Troubleshooting — known failure modes

Catalog of failure modes seen in development and their fixes. Append
new entries at the bottom as they surface. For platform-level gotchas
(SecretVM rewriter quirks, compose interpolation traps), see
`../FINDINGS.md`. This file is for runtime / deployment-time issues
the user or operator might hit.

---

## Seed didn't populate the state volume

**Symptom:** Gateway crash-loops. `docker logs openclaw-gateway-...`
shows `ENOENT` or "openclaw.json not found".

**Cause:** Either (a) the named volume already existed with stale
content from a previous deploy, so the seed's idempotence check
skipped it; or (b) the seed script itself errored before writing
files (look earlier in the logs for `[seed]` and shell errors).

**Fix:**
- (a) Wipe the named volumes (`openclaw_state`,
  `openclaw_auth_secrets`) and restart. On SecretVM this means
  redeploying since you can't `docker volume rm` from outside.
- (b) Compare the rendered compose's `configs.openclaw_seed.content`
  against the canonical template. Most common cause is a stray
  `$VAR` that compose interpolated to empty (see FINDINGS #3).

---

## Gateway won't start (config malformed)

**Symptom:** Gateway logs show OpenClaw refusing to start with a
schema error pointing at `openclaw.json`.

**Cause:** Almost always a template-drift or an unsubstituted
placeholder making it through render. `render.py` has a guard that
exits on any remaining `__TOKEN__` after substitution, but a typo in
a key name will bypass it.

**Fix:** Read the schema error carefully; pinpoint the field; check
the template at `deploys/byo/templates/openclaw.json` and the
substitution map in `scripts/render.py`. Re-render and redeploy.

Known schema rejections:
- `plugins.entries.diagnostics-prometheus.path: Unrecognized key` —
  see FINDINGS #4.

---

## Telegram returns 401

**Symptom:** Gateway boots healthy, but the welcome message never
arrives. Logs show `Telegram API 401` or `Unauthorized`.

**Cause:** Bot token wrong, revoked, or pasted with surrounding
whitespace.

**Fix:** User regenerates the bot via BotFather (or rotates the token
if BotFather supports it) and updates the credentials via the
OpenClaw web UI (Settings → Channels → Telegram). No re-render or
redeploy needed — the gateway picks up the new token from the
persisted config.

---

## Welcome message didn't fire

**Symptom:** Gateway healthy, Telegram pairing succeeds (verifiable
via `/getMe` from a curl), but no welcome message lands.

**Cause:** The welcome-once job's `at` schedule is anchored at
`2026-01-01T00:01:00Z` so cron catches it on first boot.
`deleteAfterRun: true` removes the job after one delivery. If the job
already fired (and got deleted) on a previous boot of the same
volume, it won't fire again. If the job exists but `enabled: false`,
the render produced a no-telegram variant.

**Fix:**
- Check `/home/node/.openclaw/cron/jobs.json` on the VM. If
  `welcome-once` is missing, it already fired and was deleted.
- If `welcome-once` exists with `enabled: false`, the user's wizard
  submission had no Telegram credentials. Re-render is the wrong
  fix; instead, add Telegram via the web UI and re-enable the job.

---

## VM unreachable after deploy

**Symptom:** Portal shows VM running, but `https://<vm_hostname>/`
returns connection refused, 502, or 404.

**Cause:** Either the SecretVM platform hasn't finished provisioning
TLS certificates (~1 minute lag post-VM-ready), the Traefik router
labels didn't get injected, or a router-priority conflict pushed our
router to the back.

**Fix:**
- Wait 60s past portal `running` status before declaring unreachable.
- Check the compose on the VM:
  `cat /mnt/secure/docker_wd/docker-compose.yaml` (via portal shell)
  and confirm the rewriter added `traefik.http.routers.openclaw-gateway.*`
  labels. The template asserts `priority=1000` to win against
  rewriter-injected default-priority routers.
- If labels are missing, surface to the SecretAI team with VM ID —
  the rewriter may have skipped a service it didn't recognize.

---

## Background job stuck on "provisioning" for >10 minutes

**Symptom:** Wizard's polling of `/api/background-job/<jobId>` keeps
returning the same in-progress status well past the typical ~5-minute
window.

**Cause:** Almost always a SecretAI portal-side issue. The portal
provisions on a queue; very rare but real.

**Fix:** Don't retry blindly — that just queues another deploy. Surface
the job ID to the SecretAI team. The wizard backend's deployment record
captures enough metadata (job ID, vm_id, wallet) for the platform team
to investigate. Tell the user the deploy is delayed; they can retry
from scratch (different deployment ID), but the original deploy may
still complete and show up in their portal.

---

## Wizard submission rejected: 401/403 at /api/vm/create

**Symptom:** Wizard reaches the submit step, then the portal rejects
with 401 Unauthorized or 403 Forbidden.

**Cause:** Keplr session cookie expired, was scoped to a different
wallet, or was never established (e.g., browser blocked the cookie).

**Fix:** User re-clicks "Connect Keplr". Wizard re-authenticates to
the portal and re-attempts the submission. If it keeps failing, check
that the wizard's origin is in the portal's CORS allowlist (see
research doc §3).

---

## How to append

Each entry: a heading, **Symptom**, **Cause**, **Fix**. If the issue
turns out to be a SecretVM platform behavior rather than a deployment
issue, move it to `../FINDINGS.md` instead.
