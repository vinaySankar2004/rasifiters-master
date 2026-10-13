const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// health_sync_state — server-remembered sync state per (member, program, integration, kind) (health-sync SPEC §5, D-C9;
// migration sql/009). review_done_at = the first-sync review was confirmed; last_success_at = server time of the last
// clean sync run (the clients' catch-up anchor, SPEC §8 rule 4). Clients read review_done_at ACROSS integrations (SPEC
// §8 rule 6). Written only by PUT /api/health-sync/state with the SERVER clock. NOT registered in models/index.js.
const HealthSyncState = sequelize.define("HealthSyncState", {
    member_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    program_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    integration: { type: DataTypes.STRING(16), primaryKey: true, allowNull: false },
    kind: { type: DataTypes.STRING(16), primaryKey: true, allowNull: false },
    review_done_at: { type: DataTypes.DATE, allowNull: true },
    last_success_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
    tableName: "health_sync_state",
    timestamps: false,
    underscored: true
});

HealthSyncState.listForMember = async (memberId, transaction) =>
    HealthSyncState.findAll({
        where: { member_id: memberId },
        order: [["integration", "ASC"], ["program_id", "ASC"], ["kind", "ASC"]],
        raw: true,
        transaction
    });

const UPSERT_SQL = `
INSERT INTO health_sync_state (member_id, program_id, integration, kind, review_done_at, last_success_at, updated_at)
SELECT $memberId::uuid, t.program_id, $integration::varchar, t.kind, t.review_done_at, t.last_success_at, $now::timestamptz
FROM unnest($programIds::uuid[], $kinds::varchar[], $reviewDoneAts::timestamptz[], $lastSuccessAts::timestamptz[])
    AS t(program_id, kind, review_done_at, last_success_at)
ON CONFLICT (member_id, program_id, integration, kind) DO UPDATE SET
    review_done_at = EXCLUDED.review_done_at,
    last_success_at = EXCLUDED.last_success_at,
    updated_at = EXCLUDED.updated_at`;

// entries: [{ program_id, kind, review_done: true | false | undefined, sync_success: boolean }], one per (program, kind).
// review_done true keeps an existing time (first time wins), false clears it, undefined leaves it; sync_success true
// sets last_success_at = now. Read-then-write inside the caller's transaction, which holds the per-member advisory
// lock (healthSyncService putState) so two overlapping writes can't lose review_done_at; one upsert statement.
HealthSyncState.applyUpdates = async (memberId, integration, entries, transaction) => {
    if (entries.length === 0) return;
    const existing = await HealthSyncState.findAll({
        where: { member_id: memberId, integration, program_id: [...new Set(entries.map((e) => e.program_id))] },
        raw: true,
        transaction
    });
    const byKey = new Map(existing.map((row) => [`${row.program_id}|${row.kind}`, row]));
    const now = new Date();
    const iso = (value) => (value ? new Date(value).toISOString() : null);
    const rows = entries.map((e) => {
        const current = byKey.get(`${e.program_id}|${e.kind}`) || {};
        let review = current.review_done_at || null;
        if (e.review_done === true && !review) review = now;
        if (e.review_done === false) review = null;
        return { ...e, review, success: e.sync_success ? now : current.last_success_at || null };
    });
    await sequelize.query(UPSERT_SQL, {
        bind: {
            memberId,
            integration,
            now: now.toISOString(),
            programIds: rows.map((r) => r.program_id),
            kinds: rows.map((r) => r.kind),
            reviewDoneAts: rows.map((r) => iso(r.review)),
            lastSuccessAts: rows.map((r) => iso(r.success))
        },
        transaction
    });
};

module.exports = HealthSyncState;
