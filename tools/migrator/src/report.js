// report.js — write a migration-report.json next to the tool + a console summary.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const reportPath = join(here, "..", "migration-report.json");

export function writeReport(report) {
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

export function printSummary(report) {
  const line = "-".repeat(56);
  console.log(`\n${line}\nRaSi Fiters migration — summary (${report.mode})\n${line}`);

  if (report.copy) {
    console.log("\nData copy (legacy → target):");
    for (const r of report.copy) {
      console.log(`  ${r.table.padEnd(24)} source=${String(r.source).padStart(5)}  written=${r.written}`);
    }
  }
  if (report.counts) {
    console.log("\nRow-count reconciliation:");
    for (const c of report.counts) {
      const mark = c.match ? "ok " : "MISMATCH";
      console.log(`  ${mark} ${c.table.padEnd(24)} legacy=${String(c.legacy).padStart(5)} target=${String(c.target).padStart(5)}`);
    }
  }
  if (report.auth) {
    const tally = report.auth.reduce((a, r) => ((a[r.action] = (a[r.action] || 0) + 1), a), {});
    console.log("\nAuth import (members → auth.users):");
    for (const [action, n] of Object.entries(tally)) console.log(`  ${action.padEnd(16)} ${n}`);
    const placeholders = report.auth.filter((r) => r.placeholder);
    if (placeholders.length) {
      console.log(`  placeholder emails synthesized: ${placeholders.length}`);
      for (const p of placeholders) console.log(`    - ${p.username} → ${p.email}`);
    }
    const errors = report.auth.filter((r) => r.action === "error");
    if (errors.length) {
      console.log(`  ERRORS: ${errors.length}`);
      for (const e of errors) console.log(`    - ${e.username} (${e.email}): ${e.error}`);
    }
  }
  if (report.authStats) {
    console.log(`\nLinked: ${report.authStats.linked}/${report.authStats.total} members have auth_user_id.`);
  }
  console.log(`\nFull report → ${report.reportPath}\n`);
}
