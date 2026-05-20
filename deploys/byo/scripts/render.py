#!/usr/bin/env python3
"""Render a Secret Claw BYO SecretVM deployment package.

Given a JSON config of user-specific values, produce a ready-to-upload
deployment package containing a single docker-compose.yml that the wizard
submits to the SecretAI portal via `POST /api/vm/create`.

Required input fields:
  VM_HOSTNAME          public TLS hostname (e.g. "amber-otter.vm.scrtlabs.com")
  ANTHROPIC_API_KEY    the user's Anthropic API key (sk-ant-...)

Optional input fields:
  TELEGRAM_BOT_TOKEN   Telegram bot token from BotFather (may be empty/missing)
  TELEGRAM_CHAT_ID     user's signed-integer chat ID (may be empty/missing)

Telegram is optional: when both fields are empty or missing, the rendered
compose disables the Telegram plugin, drops the Telegram channel, clears
ownerAllowFrom, and disables the welcome + recurring routines (they remain
in the cron store so the user can re-enable later via the web UI once they
add Telegram credentials).

The agent's name is hardcoded to "Secret Agent" — there is no AGENT_NAME
field in v1.

Each render also produces:
  - a fresh DEPLOYMENT_ID (random UUID4) emitted to out/deployment_id.txt and
    threaded into the compose as the container_name suffix and as the
    `secret-claw.deployment_id` Docker label
  - a fresh gateway token (32 random bytes hex) emitted to out/gateway_token.txt
    and embedded into the rendered openclaw.json's gateway.auth.token

Re-rendering with the same input is NOT byte-deterministic anymore (both the
deployment id and the gateway token are random per run). This is intentional:
the wizard backend captures both files at render time and shows the gateway
token to the user on the completion screen.

Usage:
  python render.py --config user.json --out ./out
  python render.py --config user.json --out ./out --welcome-at-iso 2026-05-19T20:30:00Z

If --welcome-at-iso is omitted, the welcome job is scheduled at an anchor
60s past 2026-01-01T00:00:00Z so cron catches it up on first boot.
`deleteAfterRun: true` guarantees exactly-once delivery.

Output shape:
  The rendered openclaw.json, cron-jobs.json, and four workspace markdown
  files are base64-encoded and embedded as heredoc blobs inside the seed
  script that the gateway runs on first boot. The seed script itself rides
  inside the compose `configs:` block as `content: |` -- that shape is
  preserved verbatim by SecretVM's compose rewriter, unlike `command:`
  block scalars which the rewriter rewrites |->> (folded), corrupting any
  embedded shell heredoc.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import secrets
import sys
import textwrap
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = REPO_ROOT / "templates"

REQUIRED_FIELDS = ("VM_HOSTNAME", "ANTHROPIC_API_KEY")
OPTIONAL_TELEGRAM_FIELDS = ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID")

TELEGRAM_CHAT_ID_RE = re.compile(r"^-?\d+$")
HOSTNAME_RE = re.compile(r"^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,253}\.)+[a-zA-Z]{2,}$")

# Seed script lives inside `configs.openclaw_seed.content: |`, indented 6
# spaces under the YAML anchor. base64 lines are wrapped at 76 chars (well
# under any plausible rewriter wrap point).
YAML_BLOCK_INDENT = 6
B64_WRAP_COLS = 76


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", required=True, type=Path, help="path to input JSON config")
    parser.add_argument("--out", required=True, type=Path, help="output directory (created if missing)")
    parser.add_argument("--welcome-at-iso", default=None, help="override welcome job schedule (ISO8601 UTC)")
    return parser.parse_args()


def load_config(path: Path) -> dict:
    if not path.is_file():
        sys.exit(f"render.py: config file not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        sys.exit(f"render.py: config file is not valid JSON: {exc}")
    if not isinstance(data, dict):
        sys.exit("render.py: config root must be a JSON object")
    return data


def normalize(cfg: dict) -> dict:
    out = {k: (cfg.get(k) or "").strip() for k in REQUIRED_FIELDS + OPTIONAL_TELEGRAM_FIELDS}
    return out


def validate(cfg: dict) -> bool:
    """Returns True if Telegram is enabled, False if disabled."""
    for key in REQUIRED_FIELDS:
        if not cfg[key]:
            sys.exit(f"render.py: required field {key!r} missing or empty")
    if not HOSTNAME_RE.match(cfg["VM_HOSTNAME"]):
        sys.exit(f"render.py: VM_HOSTNAME {cfg['VM_HOSTNAME']!r} does not look like a DNS hostname")
    if not cfg["ANTHROPIC_API_KEY"].startswith("sk-ant-"):
        sys.exit("render.py: ANTHROPIC_API_KEY should start with 'sk-ant-'")

    tg_token = cfg["TELEGRAM_BOT_TOKEN"]
    tg_chat = cfg["TELEGRAM_CHAT_ID"]
    if not tg_token and not tg_chat:
        return False
    if bool(tg_token) != bool(tg_chat):
        sys.exit("render.py: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be both set or both empty")
    if ":" not in tg_token:
        sys.exit("render.py: TELEGRAM_BOT_TOKEN should be in the form <bot_id>:<secret>")
    if not TELEGRAM_CHAT_ID_RE.match(tg_chat):
        sys.exit("render.py: TELEGRAM_CHAT_ID must be a signed integer string")
    return True


def derive_welcome_at(cfg: dict) -> str:
    """Anchor the welcome timestamp 60s past 2026-01-01T00:00:00Z so cron
    catches it on first boot regardless of when the VM provisions.
    deleteAfterRun guarantees the job runs exactly once."""
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return (base + timedelta(seconds=60)).strftime("%Y-%m-%dT%H:%M:%SZ")


def render_str(template: str, replacements: dict[str, str]) -> str:
    """Replace every __KEY__ token in template with replacements[KEY]."""
    out = template
    for key, val in replacements.items():
        out = out.replace(f"__{key}__", val)
    remaining = re.findall(r"__[A-Z][A-Z0-9_]+__", out)
    if remaining:
        sys.exit(f"render.py: unsubstituted tokens remain in rendered output: {sorted(set(remaining))}")
    return out


def b64_for_yaml_block(body: str) -> str:
    """Body base64-encoded, line-wrapped, and indented for the seed script's
    heredoc inside the compose YAML `content: |` block. First line lands at
    the substitution point (which already carries YAML_BLOCK_INDENT spaces);
    subsequent lines are pre-padded with YAML_BLOCK_INDENT spaces."""
    encoded = base64.b64encode(body.encode("utf-8")).decode("ascii")
    wrapped_lines = textwrap.wrap(encoded, B64_WRAP_COLS, break_long_words=True, break_on_hyphens=False)
    if not wrapped_lines:
        return ""
    pad = " " * YAML_BLOCK_INDENT
    head = wrapped_lines[0]
    tail = "\n".join(pad + line for line in wrapped_lines[1:])
    return head + ("\n" + tail if tail else "")


def render_openclaw_json(cfg: dict, gateway_token: str, telegram_enabled: bool) -> str:
    """Substitute placeholders, then post-process the parsed JSON to drop
    Telegram-related keys if Telegram is disabled. Returns the final JSON
    string."""
    tmpl = (TEMPLATES / "openclaw.json").read_text(encoding="utf-8")
    # Use safe placeholders for Telegram fields when disabled so substitution
    # never leaves an unresolved token. The post-process step deletes the
    # containing keys before serialization.
    intermediate = render_str(tmpl, {
        "VM_HOSTNAME": cfg["VM_HOSTNAME"],
        "ANTHROPIC_API_KEY": cfg["ANTHROPIC_API_KEY"],
        "TELEGRAM_BOT_TOKEN": cfg["TELEGRAM_BOT_TOKEN"] or "DISABLED",
        "TELEGRAM_CHAT_ID": cfg["TELEGRAM_CHAT_ID"] or "0",
        "GATEWAY_TOKEN": gateway_token,
    })
    try:
        data = json.loads(intermediate)
    except json.JSONDecodeError as exc:
        sys.exit(f"render.py: rendered openclaw.json is not valid JSON: {exc}")

    if not telegram_enabled:
        plugins = data.get("plugins", {}).get("entries", {})
        plugins.pop("telegram", None)
        data.get("channels", {}).pop("telegram", None)
        if not data.get("channels"):
            data.pop("channels", None)
        data.setdefault("commands", {})["ownerAllowFrom"] = []

    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def render_cron_jobs(cfg: dict, welcome_at: str, telegram_enabled: bool) -> str:
    """Render cron jobs. If Telegram is disabled, set the three jobs'
    `enabled` to false (the user can re-enable via the web UI once Telegram
    is added). Always substitute placeholders to avoid unresolved tokens."""
    tmpl = (TEMPLATES / "cron-jobs.json").read_text(encoding="utf-8")
    intermediate = render_str(tmpl, {
        "TELEGRAM_CHAT_ID": cfg["TELEGRAM_CHAT_ID"] or "0",
        "WELCOME_AT_ISO": welcome_at,
    })
    try:
        data = json.loads(intermediate)
    except json.JSONDecodeError as exc:
        sys.exit(f"render.py: rendered cron-jobs.json is not valid JSON: {exc}")

    if not telegram_enabled:
        for job in data.get("jobs", []):
            job["enabled"] = False

    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def render_workspace(cfg: dict, telegram_enabled: bool) -> dict[str, str]:
    """Render the four workspace markdown files. AGENTS.md and USER.md
    receive a __TELEGRAM_STATUS__ / __TELEGRAM_CHAT_ID__ substitution that
    reflects whether Telegram is connected."""
    if telegram_enabled:
        telegram_status = "Telegram IS configured -- use it."
        telegram_chat = cfg["TELEGRAM_CHAT_ID"]
    else:
        telegram_status = "Telegram is NOT configured -- web UI only."
        telegram_chat = "(not configured)"

    subs = {
        "TELEGRAM_STATUS": telegram_status,
        "TELEGRAM_CHAT_ID": telegram_chat,
    }
    out: dict[str, str] = {}
    for name in ("AGENTS.md", "IDENTITY.md", "SOUL.md", "USER.md"):
        tmpl = (TEMPLATES / "workspace" / name).read_text(encoding="utf-8")
        out[name] = render_str(tmpl, subs)
    return out


def render_compose(*, deployment_id: str, openclaw_json: str, cron_jobs: str, md_files: dict[str, str]) -> str:
    compose_tmpl = (TEMPLATES / "docker-compose.yml").read_text(encoding="utf-8")
    return render_str(compose_tmpl, {
        "DEPLOYMENT_ID": deployment_id,
        "DEPLOYMENT_ID_SHORT": deployment_id.split("-")[0],
        "OPENCLAW_JSON_B64": b64_for_yaml_block(openclaw_json),
        "CRON_JOBS_B64": b64_for_yaml_block(cron_jobs),
        "AGENTS_MD_B64": b64_for_yaml_block(md_files["AGENTS.md"]),
        "IDENTITY_MD_B64": b64_for_yaml_block(md_files["IDENTITY.md"]),
        "SOUL_MD_B64": b64_for_yaml_block(md_files["SOUL.md"]),
        "USER_MD_B64": b64_for_yaml_block(md_files["USER.md"]),
    })


def main() -> None:
    args = parse_args()
    cfg = normalize(load_config(args.config))
    telegram_enabled = validate(cfg)

    deployment_id = str(uuid.uuid4())
    gateway_token = secrets.token_hex(32)
    welcome_at = args.welcome_at_iso or derive_welcome_at(cfg)

    openclaw_rendered = render_openclaw_json(cfg, gateway_token, telegram_enabled)
    cron_rendered = render_cron_jobs(cfg, welcome_at, telegram_enabled)
    md_files = render_workspace(cfg, telegram_enabled)
    compose_rendered = render_compose(
        deployment_id=deployment_id,
        openclaw_json=openclaw_rendered,
        cron_jobs=cron_rendered,
        md_files=md_files,
    )

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "docker-compose.yml").write_text(compose_rendered, encoding="utf-8", newline="\n")
    (args.out / "openclaw.rendered.json").write_text(openclaw_rendered, encoding="utf-8", newline="\n")
    (args.out / "cron-jobs.rendered.json").write_text(cron_rendered, encoding="utf-8", newline="\n")
    for name, body in md_files.items():
        (args.out / name).write_text(body, encoding="utf-8", newline="\n")
    (args.out / "deployment_id.txt").write_text(deployment_id + "\n", encoding="utf-8", newline="\n")
    (args.out / "gateway_token.txt").write_text(gateway_token + "\n", encoding="utf-8", newline="\n")

    print(f"Rendered Secret Agent deployment package for {cfg['VM_HOSTNAME']}")
    print(f"  -> {args.out / 'docker-compose.yml'} (the wizard uploads this)")
    print(f"  -> deployment_id.txt : {deployment_id}")
    print(f"  -> gateway_token.txt : {gateway_token[:16]}... (full token in this file)")
    print(f"  telegram : {'enabled' if telegram_enabled else 'disabled (routines disabled, web UI only)'}")
    print(f"  welcome  : {welcome_at}")


if __name__ == "__main__":
    main()
