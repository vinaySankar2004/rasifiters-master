// Health sync v2 — the sleep + steps half (health-sync SPEC §4.3, D-C6/D-C7). SET semantics: the day's total replaces the
// stored value (apple-health F5 kept — a synced value overwrites a manual one for that field; diet is never touched) and
// stamps <field>_source = the integration. A day whose stored value AND source already match is "unchanged" and not
// written — this replaces the old POST→409→PUT round trip. "created" = the field had no value before, "updated" = it
// was replaced. Raw SQL on purpose: the DailyHealthLog model does not map the provenance columns, so every old
// /daily-health-logs response stays byte-identical (D-C7).
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const READ_SQL = `
SELECT program_id, log_date::text AS log_date, sleep_hours, steps, sleep_source, steps_source
FROM daily_health_logs
WHERE member_id = $memberId::uuid AND program_id = ANY($programIds::uuid[]) AND log_date = ANY($dates::date[])`;

// Column names come only from the fixed table below — never from input.
const upsertSql = (valueColumn, sourceColumn, cast) => `
INSERT INTO daily_health_logs (program_id, member_id, log_date, ${valueColumn}, ${sourceColumn})
SELECT t.program_id, $memberId::uuid, t.log_date, t.value, $integration::varchar
FROM unnest($programIds::uuid[], $dates::date[], $values::${cast}[]) AS t(program_id, log_date, value)
ON CONFLICT (program_id, member_id, log_date) DO UPDATE SET
    ${valueColumn} = EXCLUDED.${valueColumn},
    ${sourceColumn} = EXCLUDED.${sourceColumn},
    updated_at = CURRENT_TIMESTAMP`;

const KINDS = {
    sleep: { value: "sleep_hours", source: "sleep_source", sql: upsertSql("sleep_hours", "sleep_source", "numeric") },
    steps: { value: "steps", source: "steps_source", sql: upsertSql("steps", "steps_source", "int") }
};

async function applyDaily({ memberId, integration, access, transaction, entries }) {
    for (const e of entries) e.status = access.blockFor(e.program_id);
    const open = entries.filter((e) => !e.status);
    if (open.length === 0) return;

    const current = await sequelize.query(READ_SQL, {
        bind: {
            memberId,
            programIds: [...new Set(open.map((e) => e.program_id))],
            dates: [...new Set(open.map((e) => e.date))]
        },
        type: QueryTypes.SELECT,
        transaction
    });
    const byDay = new Map(current.map((row) => [`${row.program_id}|${row.log_date}`, row]));

    for (const [kind, field] of Object.entries(KINDS)) {
        const writes = [];
        for (const e of open.filter((item) => item.kind === kind)) {
            const row = byDay.get(`${e.program_id}|${e.date}`);
            const stored = row && row[field.value] !== null ? Number(row[field.value]) : null;
            if (stored === e.value && row[field.source] === integration) {
                e.status = "unchanged";
            } else {
                e.status = stored === null ? "created" : "updated";
                writes.push(e);
            }
        }
        if (writes.length === 0) continue;
        await sequelize.query(field.sql, {
            bind: {
                memberId,
                integration,
                programIds: writes.map((e) => e.program_id),
                dates: writes.map((e) => e.date),
                values: writes.map((e) => e.value)
            },
            transaction
        });
    }
}

module.exports = { applyDaily };
