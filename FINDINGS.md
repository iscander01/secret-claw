# Findings

SecretVM-platform gotchas burned in during the openclaw-byo-deploy
build and prior validation work. Append new entries at the bottom as
they surface. Each entry: what, why it matters, the fix, and the date
it was confirmed.

---

## 1. Bind mounts of non-existent host paths fail silently (cyan-fox)

**Discovered:** Phase 1 SecretVM trials (pre-2026-05).

**Symptom:** A compose file that bind-mounted a host path which didn't
exist on the SecretVM would `docker compose up` without an error
visible in the portal UI, but the affected service never reached
healthy state. Logs showed nothing actionable. Other services on the
same compose started fine.

**Why it matters:** Templates that reference host-side seed
directories (e.g. `- ./seed:/state/seed`) break on SecretVM even
though they work locally with `docker compose up`.

**Fix:** **Named volumes only.** Never reference a host path unless
the SecretVM platform itself creates it (e.g. `/mnt/secure/cert` for
the rewriter-injected Traefik). Seed data goes into the compose via
`configs.content: |` blocks and gets populated on first boot by the
container itself.

**Status:** Locked. The current BYO template uses zero bind mounts
and seeds state via a base64-inlined init script.

---

## 2. SecretVM's compose rewriter converts `command: |` literal scalars to `>` folded scalars

**Discovered:** 2026-05-19 (tomato-rat test deploy, openclaw-byo-deploy).

**Symptom:** A `command: |` block scalar that held a multi-line shell
script with embedded heredocs (`base64 -d > /path <<'EOF' ... EOF`)
would arrive on the VM with the YAML folded into `>` form. The
rewriter rewraps same-indent lines into a single space-joined line,
which collapses heredocs into shell-invalid one-liners. The
init container would crash with cryptic shell parse errors.

**Why it matters:** Any seeding pattern that relies on `command:` or
`entrypoint:` block scalars to carry a script with structure (heredocs,
multi-line variables, anything indent-sensitive) is fragile under
SecretVM's rewriter.

**Fix:** Deliver the seed script via a `configs:` block instead. The
rewriter preserves `content: |` blocks unchanged — evidenced by its
own injected `tls_config` riding the same shape. Mount the configs
entry at `/etc/openclaw-seed.sh` and set the container's entrypoint to
`sh /etc/openclaw-seed.sh`. The compose template at
`deploys/byo/templates/docker-compose.yml` is the canonical example.

**Status:** Locked. Verified end-to-end on tomato-rat 2026-05-19.

---

## 3. Docker Compose interpolates `$VAR` inside `configs.content`

**Discovered:** 2026-05-19 (tomato-rat first deploy attempt).

**Symptom:** First seed-script-in-configs attempt used a shell
variable `S=/home/node/.openclaw` for path brevity. Container logged
`[seed] populating ` (empty) and `chown: cannot access ''` — the `$S`
inside the configs.content body was being interpolated by
docker-compose at parse time (before the container saw it), and
since no environment variable `S` existed, it became the empty string.

**Why it matters:** Anywhere you write `$VAR` inside a `configs.content`
body, docker-compose treats it as a template variable, *not* shell
syntax. This is true for the seed script, for any other inlined
script content, and for compose-time `command:` strings.

**Fix:** Either hardcode the path (preferred — the seed script is
short) or escape with `$$` to produce a literal `$` in the rendered
config. Production seed script uses fully-qualified
`/home/node/.openclaw/...` paths throughout.

**Status:** Locked. No shell variables in `configs.content` in the
current template.

---

## 4. `plugins.entries.diagnostics-prometheus.path` is rejected by current OpenClaw schema

**Discovered:** 2026-05-19 (tomato-rat first deploy attempt).

**Symptom:** Including `"path": "/api/diagnostics/prometheus"` under
`plugins.entries.diagnostics-prometheus` caused the gateway to log
`plugins.entries.diagnostics-prometheus.path: Unrecognized key` and
refuse to start.

**Why it matters:** Older OpenClaw config snippets floating around
include the `path` override; newer schema rejects it. Anyone copying
config from older deploys will hit this.

**Fix:** Use only `{"enabled": true}` for diagnostics-prometheus.
Verified against amethyst-eel's running config (which had this entry
trimmed to enabled-only).

**Status:** Locked. The BYO template's openclaw.json carries the
correct minimal shape.

---

## 5. Anthropic API key at rest in compose on the VM

**Discovered:** 2026-05-19 (BYO template architecture review).

**Symptom:** Not a failure — a design property that needs explicit
acknowledgment. The user's Anthropic API key gets base64-inlined into
the compose, which the SecretVM rewriter writes to
`/mnt/secure/docker_wd/docker-compose.yaml` on the VM. The file lives
inside the TEE-encrypted region; SecretVM's attestation covers it.

**Why it matters:**
- For the privacy story: "your API key sits in a compose file on the
  VM, inside the TEE attestation boundary." Defensible, but worth the
  user knowing.
- For the trust model: anyone with TEE-bypass capabilities (a
  hypothetical attack on TDX or SGX) would see the key in cleartext.
  Same trust boundary as the user's conversation history and any
  other secrets the agent handles.

**Fix:** None — this is intentional design, not a bug. The privacy
explainer copy (TBD per build plan) should document this so users see
it before they paste their key.

**Status:** Open. Worth Alex's explicit understanding when reviewing
the demo's privacy claims.

---

## 7. Submit-button race: blur-validated form fields create a "click twice" bug

**Discovered:** 2026-05-21 (wizard QA on Vercel-hosted instance).

**Symptom:** On `/create-agent`, clicking the **Create** button the
first time appeared to do nothing visible. Clicking it a second time
submitted the form normally. Verified by users on production
Vercel-deployed wizard.

**Why it matters:** Two real consequences. (1) UX regression — a
silent no-op is the worst kind of button. (2) For
demo-with-Alex-and-other-testers scenarios, the wizard's "submit
should just work" promise breaks immediately at the most important
moment.

**Root cause:** Per the v0.8 design, the wizard validates each form
field on blur, not on every keystroke. When a user filled out the
last input and clicked Create directly (no intermediate click out of
the input), the blur fired in parallel with the click — meaning when
the submit handler ran, the field's validation hadn't completed yet
and the React `validatingState` was still `idle` or `validating`.
`firstInvalidId()` returned a section, the handler silently scrolled
to it and exited. By the second click, validation had completed in
the background and the handler proceeded.

**Fix:** Refactor each `validateX()` function in
`wizard/app/create-agent/page.tsx` to **return** the final
`ValidationState` in addition to setting it on React state. The
submit handler now `await`s each validation (kicking off any that
hadn't run yet) and reads the **returned value** instead of the
stale React state, dodging the async-flush race entirely. The user
sees field highlights, scroll-to-first-invalid, and a Creating…
spinner from the first click forward.

**Status:** Locked at commit on 2026-05-21.

---

## 8. OpenClaw exec tool requires pre-granted approval scopes

**Discovered:** 2026-05-21 (chocolate-boar debug session for Secret
tier routine creation).

**Symptom:** Deployed agents would ask the user to type
`/approve <uuid>` for each privileged operation — running `exec` for
`openclaw cron add`, etc. Breaks the wizard's "deploy and use"
promise: users expect the agent to just work after deployment, not
to gate each tool invocation behind a manual approval.

**Why it matters:** Routines added via chat are the core
demonstration of agent capability ("ask the agent to set up a daily
news brief, see it work"). If the user has to approve each step the
agent takes, the agent isn't really agentic — it's an interactive
shell wrapped in a chat UI.

**Root cause:** OpenClaw's default sandbox policy gates exec behind
per-invocation approval. The config schema requires:

```json
"tools": {
  "exec": {
    "host": "gateway",
    "security": "full",
    "ask": "off"
  }
}
```

…AND a matching `~/.openclaw/exec-approvals.json` file inside the
container:

```json
{"version":1,"defaults":{"security":"full","ask":"off","askFallback":"full"}}
```

Without **both**, exec falls back to per-call prompting.

**Fix:** Added the `tools.exec` config block to both
`deploys/byo/templates/openclaw.json` and
`deploys/secret/templates/openclaw.json`. Added a one-line `echo > `
in the seed script of both `deploys/<tier>/templates/docker-compose.yml`
that writes `exec-approvals.json` at first boot, alongside the
existing base64-blob seeding pattern.

**Trust-model trade-off (worth Alex's review):** Pre-granting
`security: "full"` removes the user-approval safety boundary. For the
v1 demo where the user owns their own attested-compute VM and trusts
their own agent, this is the correct posture — the user has nothing
to be protected *from* in this trust topology. For an eventual
production version with multi-tenant or untrusted-agent scenarios,
this should be constrained — possibly via a per-user "trust this
agent" toggle in the wizard form, or a more granular allowlist of
specific commands the agent may run. Note: gating routine creation
under per-call approval doesn't actually make the system safer
(the agent has the gateway token and can use the OpenClaw HTTP API
directly anyway) — it just adds friction. The architectural
hardening should happen at the *agent* trust layer, not at the *tool
invocation* layer.

**Status:** Locked at commit on 2026-05-21. Production-trust-model
work tracked separately.

---

## How to append

Each entry: a heading with a sequence number + short title; a
**Discovered** line with the date and context; **Symptom**; **Why it
matters**; **Fix**; **Status** (Locked / Open / Pending).
