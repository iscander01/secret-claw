# Secret Claw

A web product that lets a user deploy their own private AI agent on
SecretVM in under five minutes. The user generates an API key in the
SecretAI portal, pastes it into the wizard along with their Anthropic
key and optional Telegram credentials, and lands on an agent detail
page that transitions in place from provisioning to running. The
deployed agent runs inside an attested confidential compute
environment with an optional Telegram channel for proactive interaction.
The wizard never holds user credentials persistently — it's a UI layer
over the SecretAI portal API, calling the portal with the user's own
bearer token. Users provision into their own SecretAI portal account;
the project owner is never in the loop.

This repo holds the v1 demo build: a clean restructure of the working
deploy template, a wizard frontend (Chunk 3, pending), and a minimal
backend for deployment records (Chunk 4, pending). The product surface
shows two tiers from the start — **BYO API** (enabled for the demo;
Anthropic Claude Sonnet 4.6) and **Secret** (greyed "coming soon",
waiting on qwen3.6 on SecretAI). Only BYO is wired in v1.

## Where things live

- **`docs/secret-claw-v1-demo-scope.md`** — the v1 demo scope (what's
  in, what's out, open decisions for Alex)
- **`docs/secret-claw-v1-build-plan.md`** — the four-chunk build
  sequence; this repo is Chunk 1
- **`docs/secretvm-provisioning-research.md`** — the SecretAI portal
  API research that confirmed Pattern B (self-service provisioning via
  API-key bearer auth against the portal's HTTP API)
- **`docs/runbook-byo.md`** — post-deploy operations runbook
- **`docs/troubleshooting.md`** — known failure modes
- **`ARCHITECTURE.md`** — how wizard, deploy template, and SecretAI
  portal interact
- **`FINDINGS.md`** — SecretVM gotcha catalog
- **`deploys/byo/`** — the working BYO deployment template (Chunk 1, complete)
- **`deploys/secret/`** — placeholder for the SecretAI-tier template
  (Chunk 1 deferred; activated when qwen3.6 is hosted in production)
- **`wizard/`** — frontend (Chunk 3, pending)
- **`backend/`** — minimal deployment record store (Chunk 4, pending)

## Status (May 19 2026)

Chunk 1 complete: repo restructured, deploy template simplified
(hardcoded "Secret Agent", random per-render gateway tokens, fresh
UUID4 deployment IDs, optional Telegram). Renderer validated locally;
on-VM validation of the simplified template is the next gate before
Chunk 2 starts. See `docs/secret-claw-v1-build-plan.md` for the
sequence.
