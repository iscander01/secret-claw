/**
 * Byte-equivalence test for lib/render.ts vs deploys/byo/scripts/render.py.
 *
 * Strategy:
 *  1. Write a small Python wrapper that imports render.py and calls its
 *     pure-function helpers with FIXED deployment_id, gateway_token, and
 *     welcome_at_iso so the otherwise-random fields are pinned.
 *  2. Run the wrapper, capture the rendered docker-compose.yml,
 *     openclaw.rendered.json, cron-jobs.rendered.json, and four markdown
 *     workspace files as the source of truth.
 *  3. Render the same package via lib/render.ts using the same fixed
 *     inputs.
 *  4. Compare each file string-by-string.
 *
 * Requires Python 3.10+ on PATH.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { render } from "../lib/render";

// `npm test` runs from the wizard/ directory, so cwd is wizard/. Resolve
// up to secret-claw/ then into deploys/byo/.
const REPO_ROOT = path.resolve(process.cwd(), "..");
const DEPLOYS_BYO = path.join(REPO_ROOT, "deploys", "byo");
const RENDER_PY = path.join(DEPLOYS_BYO, "scripts", "render.py");

const FIXED_DEPLOYMENT_ID = "11111111-2222-3333-4444-555555555555";
const FIXED_GATEWAY_TOKEN = "a".repeat(64);
const FIXED_WELCOME_AT_ISO = "2026-01-01T00:01:00Z";

interface Fixture {
  name: string;
  vmHostname: string;
  anthropicApiKey: string;
  telegramBotToken: string;
  telegramChatId: string;
  expectedTelegramEnabled: boolean;
}

const FIXTURES: Fixture[] = [
  {
    name: "telegram-enabled",
    vmHostname: "amber-otter.vm.scrtlabs.com",
    anthropicApiKey: "sk-ant-FIXTURE_KEY_ENABLED",
    telegramBotToken: "0000000000:EXAMPLE_BOT_TOKEN_FROM_BOTFATHER",
    telegramChatId: "-1001234567890",
    expectedTelegramEnabled: true,
  },
  {
    name: "telegram-skipped",
    vmHostname: "amber-otter.vm.scrtlabs.com",
    anthropicApiKey: "sk-ant-FIXTURE_KEY_SKIPPED",
    telegramBotToken: "",
    telegramChatId: "",
    expectedTelegramEnabled: false,
  },
];

const PY_WRAPPER = `
import json
import os
import sys
from pathlib import Path

DEPLOY_DIR = Path(${JSON.stringify(DEPLOYS_BYO).replace(/\\/g, "\\\\")})
sys.path.insert(0, str(DEPLOY_DIR / "scripts"))

import render as r

input_path = Path(sys.argv[1])
out_dir = Path(sys.argv[2])
deployment_id = sys.argv[3]
gateway_token = sys.argv[4]
welcome_at_iso = sys.argv[5]

cfg = r.normalize(r.load_config(input_path))
telegram_enabled = r.validate(cfg)

openclaw_rendered = r.render_openclaw_json(cfg, gateway_token, telegram_enabled)
cron_rendered = r.render_cron_jobs(cfg, welcome_at_iso, telegram_enabled)
md_files = r.render_workspace(cfg, telegram_enabled)
compose_rendered = r.render_compose(
    deployment_id=deployment_id,
    openclaw_json=openclaw_rendered,
    cron_jobs=cron_rendered,
    md_files=md_files,
)

out_dir.mkdir(parents=True, exist_ok=True)
(out_dir / "docker-compose.yml").write_text(compose_rendered, encoding="utf-8", newline="\\n")
(out_dir / "openclaw.rendered.json").write_text(openclaw_rendered, encoding="utf-8", newline="\\n")
(out_dir / "cron-jobs.rendered.json").write_text(cron_rendered, encoding="utf-8", newline="\\n")
for name, body in md_files.items():
    (out_dir / name).write_text(body, encoding="utf-8", newline="\\n")
print(json.dumps({"telegram_enabled": telegram_enabled}))
`;

function pythonCommand(): string {
  // Prefer "python" on Windows; "python3" elsewhere.
  if (process.platform === "win32") {
    return process.env.PYTHON || "python";
  }
  return process.env.PYTHON || "python3";
}

function runPython(scriptPath: string, args: string[]): string {
  return execFileSync(pythonCommand(), [scriptPath, ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function ensurePythonAvailable(): boolean {
  try {
    execFileSync(pythonCommand(), ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

for (const fixture of FIXTURES) {
  test(`render.ts matches render.py for ${fixture.name}`, () => {
    if (!ensurePythonAvailable()) {
      console.warn("Python not available — skipping byte-equivalence test for", fixture.name);
      return;
    }
    if (!fs.existsSync(RENDER_PY)) {
      throw new Error(`render.py not found at ${RENDER_PY}`);
    }

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "secret-claw-render-test-"));
    const configPath = path.join(tmpRoot, "config.json");
    const pyOutDir = path.join(tmpRoot, "py-out");
    const wrapperPath = path.join(tmpRoot, "wrap.py");

    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          VM_HOSTNAME: fixture.vmHostname,
          ANTHROPIC_API_KEY: fixture.anthropicApiKey,
          TELEGRAM_BOT_TOKEN: fixture.telegramBotToken,
          TELEGRAM_CHAT_ID: fixture.telegramChatId,
        },
        null,
        2,
      ),
      "utf-8",
    );
    fs.writeFileSync(wrapperPath, PY_WRAPPER, "utf-8");

    runPython(wrapperPath, [
      configPath,
      pyOutDir,
      FIXED_DEPLOYMENT_ID,
      FIXED_GATEWAY_TOKEN,
      FIXED_WELCOME_AT_ISO,
    ]);

    const tsResult = render({
      tier: "byo",
      vmHostname: fixture.vmHostname,
      anthropicApiKey: fixture.anthropicApiKey,
      telegramBotToken: fixture.telegramBotToken,
      telegramChatId: fixture.telegramChatId,
      deploymentId: FIXED_DEPLOYMENT_ID,
      gatewayToken: FIXED_GATEWAY_TOKEN,
      welcomeAtIso: FIXED_WELCOME_AT_ISO,
    });

    assert.equal(tsResult.telegramEnabled, fixture.expectedTelegramEnabled);

    const filesToCompare: Array<{ label: string; pyName: string; tsValue: string }> = [
      { label: "docker-compose.yml", pyName: "docker-compose.yml", tsValue: tsResult.compose },
      { label: "openclaw.rendered.json", pyName: "openclaw.rendered.json", tsValue: tsResult.openclawJson },
      { label: "cron-jobs.rendered.json", pyName: "cron-jobs.rendered.json", tsValue: tsResult.cronJobsJson },
      { label: "AGENTS.md", pyName: "AGENTS.md", tsValue: tsResult.workspace["AGENTS.md"]! },
      { label: "IDENTITY.md", pyName: "IDENTITY.md", tsValue: tsResult.workspace["IDENTITY.md"]! },
      { label: "SOUL.md", pyName: "SOUL.md", tsValue: tsResult.workspace["SOUL.md"]! },
      { label: "USER.md", pyName: "USER.md", tsValue: tsResult.workspace["USER.md"]! },
    ];

    for (const { label, pyName, tsValue } of filesToCompare) {
      const pyContent = fs.readFileSync(path.join(pyOutDir, pyName), "utf-8");
      if (pyContent !== tsValue) {
        // Write artifacts for debugging.
        const diffDir = path.join(tmpRoot, "diff");
        fs.mkdirSync(diffDir, { recursive: true });
        fs.writeFileSync(path.join(diffDir, `${label}.py`), pyContent, "utf-8");
        fs.writeFileSync(path.join(diffDir, `${label}.ts`), tsValue, "utf-8");
        assert.equal(
          tsValue,
          pyContent,
          `Mismatch for ${label} (fixture ${fixture.name}). Artifacts: ${diffDir}`,
        );
      }
    }

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });
}
