/**
 * Deployment record store.
 *
 * Two backends:
 *  - InMemoryDb: fallback for local dev (no env vars required). State is
 *    lost on dev-server restart but persists within a single process.
 *  - KvDb: Vercel KV (Redis). Used in production where serverless
 *    cold-starts wipe the in-memory Map. Selected automatically when
 *    KV_REST_API_URL + KV_REST_API_TOKEN are set in the environment
 *    (Vercel injects these when a KV store is linked to the project).
 *
 * The Db interface is the swap point — consumers (route handlers and
 * the agent detail page) are oblivious.
 */

import { kv } from "@vercel/kv";

import type { DeploymentRecord } from "./types";

export interface Db {
  insert(record: DeploymentRecord): Promise<void>;
  update(id: string, patch: Partial<DeploymentRecord>): Promise<void>;
  get(id: string): Promise<DeploymentRecord | null>;
}

declare global {
  // eslint-disable-next-line no-var
  var __secretClawDb: Map<string, DeploymentRecord> | undefined;
}

function store(): Map<string, DeploymentRecord> {
  if (!globalThis.__secretClawDb) {
    globalThis.__secretClawDb = new Map<string, DeploymentRecord>();
  }
  return globalThis.__secretClawDb;
}

class InMemoryDb implements Db {
  async insert(record: DeploymentRecord): Promise<void> {
    store().set(record.deployment_id, record);
  }

  async update(id: string, patch: Partial<DeploymentRecord>): Promise<void> {
    const current = store().get(id);
    if (!current) {
      throw new Error(`db.update: deployment ${id} not found`);
    }
    store().set(id, { ...current, ...patch });
  }

  async get(id: string): Promise<DeploymentRecord | null> {
    return store().get(id) ?? null;
  }
}

function kvKey(id: string): string {
  return `secret-claw:deployment:${id}`;
}

class KvDb implements Db {
  async insert(record: DeploymentRecord): Promise<void> {
    // 24h TTL — long enough for demo deployments to complete and the
    // user to bookmark the URL; short enough that abandoned records
    // self-clean. Bump if real users start hitting it.
    await kv.set(kvKey(record.deployment_id), record, { ex: 60 * 60 * 24 });
  }

  async update(id: string, patch: Partial<DeploymentRecord>): Promise<void> {
    const current = await this.get(id);
    if (!current) {
      throw new Error(`db.update: deployment ${id} not found`);
    }
    await kv.set(kvKey(id), { ...current, ...patch }, { ex: 60 * 60 * 24 });
  }

  async get(id: string): Promise<DeploymentRecord | null> {
    const value = await kv.get<DeploymentRecord>(kvKey(id));
    return value ?? null;
  }
}

function isKvConfigured(): boolean {
  return !!(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  );
}

export const db: Db = isKvConfigured() ? new KvDb() : new InMemoryDb();
