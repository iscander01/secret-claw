#!/usr/bin/env node
/**
 * Copy canonical deploy templates into wizard/templates/<tier>/ so
 * `lib/render.ts` can find them when the wizard runs on a platform whose
 * build context is wizard/-only (Vercel, Cloudflare Pages, etc.).
 *
 * Source: ../deploys/<tier>/templates/
 * Dest:   ./templates/<tier>/
 *
 * Runs as `prebuild` and `pretest` npm hooks. Behavior:
 *  - If a tier's source exists, copy (overwrite) it. Local-dev and Vercel
 *    paths take this branch.
 *  - If source is missing but ./templates/<tier>/ is already populated,
 *    skip silently. Handles the Docker builder stage, where the Dockerfile
 *    pre-populates ./templates from the build context's deploys/ before
 *    `npm run build` fires.
 *  - If neither exists for a required tier (byo), fail loudly. Optional
 *    tier (secret) is skipped with a warning if absent — that lets the
 *    repo build before deploys/secret/ is populated.
 *
 * wizard/templates/ is .gitignored — it's a build artifact, not source.
 * deploys/<tier>/templates/ remains the canonical source of truth.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(__filename);
const WIZARD_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEPLOYS_ROOT = path.resolve(WIZARD_ROOT, "..", "deploys");
const DEST_ROOT = path.resolve(WIZARD_ROOT, "templates");

/** @type {{tier: string, required: boolean}[]} */
const TIERS = [
  { tier: "byo", required: true },
  { tier: "secret", required: false },
];

for (const { tier, required } of TIERS) {
  const source = path.join(DEPLOYS_ROOT, tier, "templates");
  const dest = path.join(DEST_ROOT, tier);

  if (fs.existsSync(source)) {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(source, dest, { recursive: true });
    console.log(`[copy-templates] ${tier}: ${source} -> ${dest}`);
  } else if (fs.existsSync(path.join(dest, "openclaw.json"))) {
    console.log(`[copy-templates] ${tier}: source missing, using pre-populated ${dest}`);
  } else if (required) {
    console.error(`[copy-templates] ERROR: required tier ${tier} not found at ${source} or ${dest}`);
    process.exit(1);
  } else {
    console.warn(`[copy-templates] WARN: optional tier ${tier} not present at ${source}; skipping`);
  }
}
