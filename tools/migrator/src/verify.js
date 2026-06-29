// verify.js — pre-flight schema check + post-migration row-count reconciliation.
import { legacy, target } from "./db.js";
import { TABLES } from "./manifest.js";

// Confirm the target has every canonical table (i.e. 001_schema.sql was applied) + auth_user_id col.
export async function checkSchema() {
  const dst = target();
  const names = TABLES.map((t) => t.table);
  const { rows } = await dst.query(
    `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [names]
  );
  const present = new Set(rows.map((r) => r.table_name));
  const missing = names.filter((n) => !present.has(n));

  const { rows: col } = await dst.query(
    `SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='members' AND column_name='auth_user_id'`
  );
  return { ok: missing.length === 0 && col.length > 0, missing, hasAuthUserId: col.length > 0 };
}

// Row counts on both sides for each copied table (faithfulness reconciliation).
export async function reconcileCounts() {
  const out = [];
  for (const { table } of TABLES) {
    const [l, t] = await Promise.all([
      legacy().query(`SELECT count(*)::int AS n FROM public.${table}`),
      target().query(`SELECT count(*)::int AS n FROM public.${table}`),
    ]);
    const legacyN = l.rows[0].n;
    const targetN = t.rows[0].n;
    out.push({ table, legacy: legacyN, target: targetN, match: legacyN === targetN });
  }
  return out;
}

// How many members got linked to an auth user.
export async function authLinkStats() {
  const dst = target();
  const { rows } = await dst.query(
    `SELECT count(*)::int AS total,
            count(auth_user_id)::int AS linked
       FROM public.members`
  );
  return rows[0];
}
