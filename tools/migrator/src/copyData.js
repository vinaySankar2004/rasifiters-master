// copyData.js — generic, idempotent table copy legacy → target.
//
// For each table: SELECT * from legacy, then batched INSERT ... ON CONFLICT (pk) DO UPDATE
// (or DO NOTHING when the table is all-PK). Preserves every value verbatim — UUIDs,
// timestamps, everything — so members.id and all FKs stay identical (R5).
import { legacy, target } from "./db.js";
import { NEVER_OVERWRITE } from "./manifest.js";

const q = (id) => `"${id.replace(/"/g, '""')}"`; // quote identifier

function buildUpsert(table, cols, pk) {
  const protectedCols = new Set(NEVER_OVERWRITE[table] || []);
  const updatable = cols.filter((c) => !pk.includes(c) && !protectedCols.has(c));
  const onConflict = updatable.length
    ? `DO UPDATE SET ${updatable.map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(", ")}`
    : "DO NOTHING";
  return { onConflict };
}

export async function copyTable({ table, pk }, { dryRun }) {
  const src = legacy();
  const dst = target();

  const { rows, fields } = await src.query(`SELECT * FROM public.${q(table)}`);
  const source = rows.length;
  if (source === 0) return { table, source: 0, written: 0 };

  const cols = fields.map((f) => f.name);
  const { onConflict } = buildUpsert(table, cols, pk);
  const colList = cols.map(q).join(", ");
  const pkList = pk.map(q).join(", ");

  if (dryRun) return { table, source, written: 0, dryRun: true };

  // Chunk so we stay well under Postgres' 65535-parameter limit.
  const perChunk = Math.max(1, Math.min(1000, Math.floor(60000 / cols.length)));
  let written = 0;
  for (let i = 0; i < rows.length; i += perChunk) {
    const chunk = rows.slice(i, i + perChunk);
    const values = [];
    const params = [];
    chunk.forEach((row, r) => {
      const ph = cols.map((_, c) => `$${r * cols.length + c + 1}`);
      values.push(`(${ph.join(", ")})`);
      cols.forEach((c) => params.push(row[c]));
    });
    const sql =
      `INSERT INTO public.${q(table)} (${colList}) VALUES ${values.join(", ")} ` +
      `ON CONFLICT (${pkList}) ${onConflict}`;
    const res = await dst.query(sql, params);
    written += res.rowCount || 0;
  }
  return { table, source, written };
}
