const { DataTypes, QueryTypes, Op } = require("sequelize");
const { sequelize } = require("../config/database");

// health_sync_samples — the PERMANENT per-sample workout ledger of health sync v2 (health-sync SPEC §5, D-C2; migration
// sql/009). One row per (member, program, integration, Health sample id) the server applied ("applied") or adopted from
// an old build's device ledger ("legacy"). A Health deletion sets deleted_at and never removes the row, so a re-sent,
// re-read or restored sample can never count twice. No associations — NOT registered in models/index.js (AppEvent
// precedent); the health-sync services require it directly.
const HealthSyncSample = sequelize.define("HealthSyncSample", {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    member_id: { type: DataTypes.UUID, allowNull: false },
    program_id: { type: DataTypes.UUID, allowNull: false },
    integration: { type: DataTypes.STRING(16), allowNull: false },
    sample_id: { type: DataTypes.STRING(128), allowNull: false },
    origin: { type: DataTypes.STRING(255), allowNull: true },
    program_workout_id: { type: DataTypes.UUID, allowNull: true },
    log_date: { type: DataTypes.DATEONLY, allowNull: false },
    start_at: { type: DataTypes.DATE, allowNull: true },
    end_at: { type: DataTypes.DATE, allowNull: true },
    minutes: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "applied" },
    applied_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: "health_sync_samples",
    timestamps: false,
    underscored: true
});

// Every row (applied or legacy, deleted or not) of this integration with these sample ids — the duplicate + deletion lookup.
HealthSyncSample.findBySampleIds = async (memberId, integration, sampleIds, transaction) =>
    (sampleIds.length === 0 ? [] : HealthSyncSample.findAll({
        where: { member_id: memberId, integration, sample_id: sampleIds },
        raw: true,
        transaction
    }));

// Live (not deleted) rows of ANY integration in these programs between two dates — the overlap + day-cap working set.
HealthSyncSample.findLiveInRange = async (memberId, programIds, fromDate, toDate, transaction) =>
    HealthSyncSample.findAll({
        where: {
            member_id: memberId,
            program_id: programIds,
            deleted_at: null,
            log_date: { [Op.between]: [fromDate, toDate] }
        },
        attributes: ["program_id", "integration", "sample_id", "origin", "log_date", "start_at", "end_at", "minutes"],
        raw: true,
        transaction
    });

const INSERT_SQL = `
INSERT INTO health_sync_samples
    (member_id, program_id, integration, sample_id, origin, program_workout_id, log_date, start_at, end_at, minutes, status)
SELECT $memberId::uuid, t.program_id, $integration::varchar, t.sample_id, t.origin, t.program_workout_id, t.log_date,
       t.start_at, t.end_at, t.minutes, t.status
FROM unnest($programIds::uuid[], $sampleIds::varchar[], $origins::varchar[], $programWorkoutIds::uuid[],
            $logDates::date[], $startAts::timestamptz[], $endAts::timestamptz[], $minutes::int[], $statuses::varchar[])
    AS t(program_id, sample_id, origin, program_workout_id, log_date, start_at, end_at, minutes, status)
ON CONFLICT (member_id, program_id, integration, sample_id) DO NOTHING
RETURNING id, program_id, sample_id`;

// Bulk insert of { program_id, sample_id, origin, program_workout_id, log_date, start_at (Date), end_at (Date), minutes,
// status }. A row whose (member, program, integration, sample) already exists is skipped; returns ONLY the inserted rows
// ({ id, program_id, sample_id }) — anything not returned was a concurrent duplicate.
HealthSyncSample.insertMany = async (memberId, integration, rows, transaction) => {
    if (rows.length === 0) return [];
    const col = (key) => rows.map((row) => row[key] ?? null);
    const instant = (key) => rows.map((row) => (row[key] ? row[key].toISOString() : null));
    return sequelize.query(INSERT_SQL, {
        bind: {
            memberId,
            integration,
            programIds: col("program_id"),
            sampleIds: col("sample_id"),
            origins: col("origin"),
            programWorkoutIds: col("program_workout_id"),
            logDates: col("log_date"),
            startAts: instant("start_at"),
            endAts: instant("end_at"),
            minutes: col("minutes"),
            statuses: col("status")
        },
        type: QueryTypes.SELECT,
        transaction
    });
};

HealthSyncSample.markDeleted = async (ids, transaction) => {
    if (ids.length > 0) await HealthSyncSample.update({ deleted_at: new Date() }, { where: { id: ids }, transaction });
};

module.exports = HealthSyncSample;
