// config.js — load + validate env, parse CLI flags.
import dotenv from "dotenv";
dotenv.config();

function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required env var ${name} (see .env.example)`);
  }
  return v.trim();
}

const flags = new Set(process.argv.slice(2));

export const config = {
  legacyUrl: process.env.LEGACY_DATABASE_URL?.trim(),
  targetUrl: process.env.TARGET_DATABASE_URL?.trim(),
  supabaseUrl: process.env.SUPABASE_URL?.trim(),
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  placeholderDomain: (process.env.PLACEHOLDER_EMAIL_DOMAIN || "no-email.rasifiters.com").trim(),

  // run mode
  verifyOnly: flags.has("--verify-only"),
  copyOnly: flags.has("--copy-only"),
  authOnly: flags.has("--auth-only"),
  dryRun: flags.has("--dry-run"),
};

// Assert only the vars a given mode actually needs, so partial runs work.
// Every mode reads both DBs (copy, the row-count reconcile, and the auth member list all
// touch legacy + target); only the auth import additionally needs the Supabase admin creds.
export function assertConfig() {
  required("LEGACY_DATABASE_URL");
  required("TARGET_DATABASE_URL");
  const authRuns = !config.copyOnly && !config.verifyOnly; // full or --auth-only
  if (authRuns) {
    required("SUPABASE_URL");
    required("SUPABASE_SERVICE_ROLE_KEY");
  }
}
