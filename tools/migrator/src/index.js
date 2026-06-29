// index.js — orchestrate the RaSi Fiters migration.
//
//   npm run migrate     copy data → import auth → reconcile → report   (full run, re-runnable)
//   npm run verify      schema check + row-count reconcile + auth-link stats (read-only)
//   npm run copy        data copy only
//   npm run auth        auth import only
//   npm run dry-run     plan only — no writes
//
// Idempotent: data copy upserts on PK; auth import skips already-linked members. Safe to re-run.
import { config, assertConfig } from "./config.js";
import { closeAll } from "./db.js";
import { TABLES } from "./manifest.js";
import { copyTable } from "./copyData.js";
import { importAuthUsers } from "./importAuth.js";
import { checkSchema, reconcileCounts, authLinkStats } from "./verify.js";
import { writeReport, printSummary } from "./report.js";

async function main() {
  assertConfig();
  const mode = config.verifyOnly ? "verify" : config.copyOnly ? "copy" : config.authOnly ? "auth" : "full";
  const report = { mode, dryRun: config.dryRun, startedAt: new Date().toISOString() };

  // Pre-flight: the schema must exist (001_schema.sql applied) for everything except a pure plan.
  const schema = await checkSchema();
  report.schema = schema;
  if (!schema.ok && !config.dryRun) {
    console.error(
      `\nTarget schema not ready. Missing tables: [${schema.missing.join(", ")}]` +
        `${schema.hasAuthUserId ? "" : ", and members.auth_user_id"}.` +
        `\nApply apps/backend/sql/001_schema.sql to the Supabase project first.\n`
    );
    process.exitCode = 2;
    return;
  }

  if (config.verifyOnly) {
    report.counts = await reconcileCounts();
    report.authStats = await authLinkStats();
  } else {
    const doCopy = mode === "full" || mode === "copy";
    const doAuth = mode === "full" || mode === "auth";

    if (doCopy) {
      report.copy = [];
      for (const t of TABLES) {
        const r = await copyTable(t, { dryRun: config.dryRun });
        console.log(`  copied ${t.table}: source=${r.source} written=${r.written}${r.dryRun ? " (dry-run)" : ""}`);
        report.copy.push(r);
      }
    }
    if (doAuth) {
      report.auth = await importAuthUsers({ dryRun: config.dryRun });
    }
    if (!config.dryRun) {
      report.counts = await reconcileCounts();
      report.authStats = await authLinkStats();
    }
  }

  report.finishedAt = new Date().toISOString();
  report.reportPath = writeReport(report);
  printSummary(report);

  // Non-zero exit if anything looks off, so CI / the operator notices.
  const mismatch = (report.counts || []).some((c) => !c.match);
  const authErr = (report.auth || []).some((r) => r.action === "error");
  if (mismatch || authErr) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("\nMigration failed:", err.message);
    process.exitCode = 1;
  })
  .finally(closeAll);
