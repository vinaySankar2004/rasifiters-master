// db.js — Postgres pools for the legacy (source) and Supabase (target) databases.
import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

// Render + Supabase both require SSL (self-signed → rejectUnauthorized:false). A DSN with
// `sslmode=disable` (e.g. a local Postgres for dry-runs) opts out — standard libpq convention.
function sslFor(dsn) {
  if (/[?&]sslmode=disable\b/.test(dsn || "")) return false;
  return { require: true, rejectUnauthorized: false };
}

let legacyPool = null;
let targetPool = null;

export function legacy() {
  if (!legacyPool) {
    legacyPool = new Pool({ connectionString: config.legacyUrl, ssl: sslFor(config.legacyUrl), max: 4 });
  }
  return legacyPool;
}

export function target() {
  if (!targetPool) {
    targetPool = new Pool({ connectionString: config.targetUrl, ssl: sslFor(config.targetUrl), max: 4 });
  }
  return targetPool;
}

export async function closeAll() {
  if (legacyPool) await legacyPool.end();
  if (targetPool) await targetPool.end();
  legacyPool = targetPool = null;
}
