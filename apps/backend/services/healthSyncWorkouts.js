// Health sync v2 — the workout half (health-sync SPEC §4.2). Inside the caller's transaction (per-member advisory lock
// held), in this order: Health deletions (subtract, floored at 0, a row reaching 0 is deleted — D-C2) → legacy adoption
// (ledger only, totals unchanged — D-C8) → new samples (duplicate → 12 h bound → overlap → 24 h day cap → apply —
// D-C4/D-C5). Decisions are made in memory against the permanent ledger, then written in bulk: one ledger insert + one
// workout_logs upsert. resolveProgramWorkout runs once per distinct (program, workout name), never per item.
// A skipped sample is NOT recorded: if it is sent again it is checked again (D-C4).
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const HealthSyncSample = require("../models/HealthSyncSample");
const { resolveProgramWorkout } = require("./logService");

const MAX_WORKOUT_MINUTES = 720; // board D-7: a single synced workout longer than 12 h is skipped
const DAY_CAP_MINUTES = 1440;    // board D-7: synced minutes per member + program + day never exceed 24 h
const DAY_MS = 24 * 60 * 60 * 1000;

const shiftDate = (ymd, days) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const ms = (value) => new Date(value).getTime();
const overlaps = (a, b) => ms(a.start_at) < ms(b.end_at) && ms(b.start_at) < ms(a.end_at);
const sampleKey = (programId, sampleId) => `${programId}|${sampleId}`;

const ADD_SQL = `
INSERT INTO workout_logs (program_id, member_id, program_workout_id, log_date, duration)
SELECT t.program_id, $memberId::uuid, t.program_workout_id, t.log_date, t.minutes
FROM unnest($programIds::uuid[], $programWorkoutIds::uuid[], $logDates::date[], $minutes::int[])
    AS t(program_id, program_workout_id, log_date, minutes)
ON CONFLICT (program_id, member_id, program_workout_id, log_date)
DO UPDATE SET duration = COALESCE(workout_logs.duration, 0) + EXCLUDED.duration, updated_at = CURRENT_TIMESTAMP
RETURNING program_id, program_workout_id, log_date::text AS log_date, (xmax = 0) AS inserted`;

const SUBTRACT_SQL = `
UPDATE workout_logs w
SET duration = GREATEST(COALESCE(w.duration, 0) - t.minutes, 0), updated_at = CURRENT_TIMESTAMP
FROM unnest($programIds::uuid[], $programWorkoutIds::uuid[], $logDates::date[], $minutes::int[])
    AS t(program_id, program_workout_id, log_date, minutes)
WHERE w.program_id = t.program_id AND w.member_id = $memberId::uuid
  AND w.program_workout_id = t.program_workout_id AND w.log_date = t.log_date`;

const DELETE_EMPTY_SQL = `
DELETE FROM workout_logs w
USING unnest($programIds::uuid[], $programWorkoutIds::uuid[], $logDates::date[], $minutes::int[])
    AS t(program_id, program_workout_id, log_date, minutes)
WHERE w.program_id = t.program_id AND w.member_id = $memberId::uuid
  AND w.program_workout_id = t.program_workout_id AND w.log_date = t.log_date
  AND COALESCE(w.duration, 0) <= 0`;

// Legacy samples were already summed by the old build into an existing program workout: look it up, never create one.
const LOOKUP_SQL = `
SELECT pw.program_id, pw.id, pw.workout_name, wl.name AS library_name
FROM program_workouts pw
LEFT JOIN workouts_library wl ON wl.id = pw.library_workout_id
WHERE pw.program_id = ANY($programIds::uuid[])
  AND (pw.workout_name = ANY($names::text[]) OR wl.name = ANY($names::text[]))`;

// One total per (program, program workout, date): a single UPDATE … FROM / ON CONFLICT may touch each row only once.
function groupMinutes(items) {
    const groups = new Map();
    for (const item of items) {
        const key = `${item.program_id}|${item.program_workout_id}|${item.log_date}`;
        const group = groups.get(key) || { key, ...item, minutes: 0, entries: [] };
        group.minutes += item.minutes;
        if (item.entry) group.entries.push(item.entry);
        groups.set(key, group);
    }
    const list = [...groups.values()];
    const bind = {
        programIds: list.map((g) => g.program_id),
        programWorkoutIds: list.map((g) => g.program_workout_id),
        logDates: list.map((g) => g.log_date),
        minutes: list.map((g) => g.minutes)
    };
    return { list, bind };
}

async function applyDeletions({ memberId, access, transaction, entries, known }) {
    if (entries.length === 0) return;
    const live = new Map(); // sample_id → live ledger rows (any program) not yet removed in this batch
    for (const row of known) if (!row.deleted_at) live.set(row.sample_id, [...(live.get(row.sample_id) || []), row]);
    const removed = [];
    for (const e of entries) {
        const rows = live.get(e.sample_id) || [];
        const blocks = rows.map((row) => access.blockFor(row.program_id));
        const writable = rows.filter((_, i) => !blocks[i]);
        if (rows.length === 0) e.status = "not_found";
        // Atomic per sample: one copy in an admin-locked program holds the whole deletion (non-final — re-sent later).
        else if (blocks.includes("skipped_locked")) e.status = "skipped_locked";
        else if (writable.length === 0) e.status = "skipped_not_member";
        else {
            e.status = "removed"; // copies in programs the member left stay — nobody may write there for them
            removed.push(...writable);
            live.set(e.sample_id, rows.filter((_, i) => blocks[i]));
        }
    }
    if (removed.length === 0) return;
    for (const row of removed) row.deleted_at = new Date(); // a later add of the same sample stays "duplicate"
    const subtract = removed.filter((row) => row.program_workout_id && row.minutes > 0).map((row) => ({
        program_id: row.program_id, program_workout_id: row.program_workout_id, log_date: row.log_date, minutes: row.minutes
    }));
    if (subtract.length > 0) {
        const { bind } = groupMinutes(subtract);
        await sequelize.query(SUBTRACT_SQL, { bind: { ...bind, memberId }, transaction });
        await sequelize.query(DELETE_EMPTY_SQL, { bind: { ...bind, memberId }, transaction });
    }
    await HealthSyncSample.markDeleted(removed.map((row) => row.id), transaction);
}

async function adoptLegacy({ access, transaction, entries, seen }) {
    const accepted = [];
    for (const e of entries) {
        const key = sampleKey(e.program_id, e.sample_id);
        if (!access.hasMembership(e.program_id)) e.status = "skipped_not_member";
        else if (seen.has(key)) e.status = "duplicate";
        else { seen.add(key); accepted.push(e); }
    }
    if (accepted.length === 0) return accepted;
    const rows = await sequelize.query(LOOKUP_SQL, {
        bind: {
            programIds: [...new Set(accepted.map((e) => e.program_id))],
            names: [...new Set(accepted.map((e) => e.workout_name))]
        },
        type: QueryTypes.SELECT,
        transaction
    });
    for (const e of accepted) {
        const mine = rows.filter((row) => row.program_id === e.program_id);
        const hit = mine.find((row) => row.library_name === e.workout_name) || mine.find((row) => row.workout_name === e.workout_name);
        e.program_workout_id = hit ? hit.id : null;
    }
    return accepted;
}

// D-C4: two samples of one program clash when they overlap in time AND come from a different app OR a different
// integration (the same app on an iPhone and an Android phone records one session twice).
const clashes = (row, e, integration) => row.program_id === e.program_id && row.start_at && row.end_at
    && (row.integration !== integration || row.origin !== e.origin) && overlaps(row, e);

async function screenAdds({ memberId, integration, access, transaction, entries, seen, adopted }) {
    const pending = [];
    for (const e of entries) {
        const key = sampleKey(e.program_id, e.sample_id);
        e.status = access.blockFor(e.program_id)
            || (seen.has(key) ? "duplicate" : null)
            || (e.value > MAX_WORKOUT_MINUTES ? "skipped_too_long" : null);
        if (!e.status) { seen.add(key); pending.push(e); }
    }
    if (pending.length === 0) return [];
    const dates = pending.map((e) => e.date).sort();
    const programIds = [...new Set(pending.map((e) => e.program_id))];
    const live = await HealthSyncSample.findLiveInRange(
        memberId, programIds, shiftDate(dates[0], -1), shiftDate(dates[dates.length - 1], 1), transaction
    );
    const asPeer = (e) => ({ program_id: e.program_id, integration, origin: e.origin, log_date: e.date,
        start_at: e.start_at, end_at: e.end_at, minutes: e.value });
    const peers = [...live, ...adopted.map(asPeer)];
    const dayTotals = new Map();
    for (const row of peers) {
        const dayKey = `${row.program_id}|${row.log_date}`;
        dayTotals.set(dayKey, (dayTotals.get(dayKey) || 0) + (row.minutes || 0));
    }
    const accepted = [];
    pending.sort((a, b) => ms(a.start_at) - ms(b.start_at) || a.index - b.index); // first counted wins (D-C4)
    for (const e of pending) {
        const dayKey = `${e.program_id}|${e.date}`;
        const total = (dayTotals.get(dayKey) || 0) + e.value;
        if (peers.some((row) => clashes(row, e, integration))) e.status = "skipped_overlap";
        else if (total > DAY_CAP_MINUTES) e.status = "skipped_day_cap";
        else { dayTotals.set(dayKey, total); peers.push(asPeer(e)); accepted.push(e); }
    }
    return accepted;
}

async function addMinutes(memberId, entries, transaction) {
    if (entries.length === 0) return;
    const { list, bind } = groupMinutes(entries.map((e) => ({
        program_id: e.program_id, program_workout_id: e.program_workout_id, log_date: e.date, minutes: e.value, entry: e
    })));
    const rows = await sequelize.query(ADD_SQL, { bind: { ...bind, memberId }, type: QueryTypes.SELECT, transaction });
    const created = new Set(rows.filter((row) => row.inserted).map((row) => `${row.program_id}|${row.program_workout_id}|${row.log_date}`));
    for (const group of list) for (const e of group.entries) e.status = created.has(group.key) ? "created" : "updated";
}

async function applyWorkouts({ memberId, integration, access, transaction, entries, known }) {
    if (entries.length === 0) return;
    await applyDeletions({ memberId, access, transaction, known, entries: entries.filter((e) => e.op === "delete") });
    const seen = new Set(known.map((row) => sampleKey(row.program_id, row.sample_id)));
    const adopted = await adoptLegacy({ access, transaction, seen, entries: entries.filter((e) => e.op === "legacy") });
    const accepted = await screenAdds({
        memberId, integration, access, transaction, seen, adopted, entries: entries.filter((e) => e.op === "add")
    });
    const workoutIds = new Map(); // `${program}|${name}` → program_workouts.id (resolved/created once per pair)
    for (const e of accepted) {
        const key = `${e.program_id}|${e.workout_name}`;
        if (!workoutIds.has(key)) workoutIds.set(key, (await resolveProgramWorkout(e.program_id, e.workout_name, transaction)).id);
        e.program_workout_id = workoutIds.get(key);
    }
    const toRow = (e, status) => ({
        program_id: e.program_id, sample_id: e.sample_id, origin: e.origin, program_workout_id: e.program_workout_id,
        log_date: e.date, start_at: e.start_at, end_at: e.end_at, minutes: e.value, status
    });
    const inserted = await HealthSyncSample.insertMany(memberId, integration,
        [...adopted.map((e) => toRow(e, "legacy")), ...accepted.map((e) => toRow(e, "applied"))], transaction);
    const insertedKeys = new Set(inserted.map((row) => sampleKey(row.program_id, row.sample_id)));
    for (const e of adopted) e.status = insertedKeys.has(sampleKey(e.program_id, e.sample_id)) ? "recorded" : "duplicate";
    const applied = accepted.filter((e) => insertedKeys.has(sampleKey(e.program_id, e.sample_id)));
    for (const e of accepted) if (!applied.includes(e)) e.status = "duplicate";
    await addMinutes(memberId, applied, transaction);
}

module.exports = { applyWorkouts };
