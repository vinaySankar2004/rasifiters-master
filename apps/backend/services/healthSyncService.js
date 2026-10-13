// Health sync v2 — validation + orchestration for /api/health-sync (specs/features/health-sync/SPEC.md §3–§4).
// SELF-ONLY (D-C11): the member is always the token's member — no item names a member. One bad item never fails the
// batch (status "invalid" + error); only a malformed batch is a 400 (code "invalid_batch"). Every DB call runs in a
// transaction with an explicit statement timeout (withTimeout); a batch and a state write also take a per-member
// advisory lock, so two runs of one member (two triggers, two devices) serialize instead of racing the ledger, and two
// overlapping state writes can't drop each other's review_done_at (read-then-upsert).
const { sequelize } = require("../config/database");
const { Program, ProgramMembership } = require("../models");
const HealthSyncSample = require("../models/HealthSyncSample");
const HealthSyncState = require("../models/HealthSyncState");
const { AppError } = require("../utils/response");
const { isValidDateString } = require("./logService");
const { applyWorkouts } = require("./healthSyncWorkouts");
const { applyDaily } = require("./healthSyncDaily");

const MAX_ITEMS = 300;
const MAX_STATE_ENTRIES = 60;
const MAX_WORKOUT_VALUE = 100000;
const MAX_STEPS = 200000;
const INTEGRATIONS = new Set(["healthkit", "health_connect"]);
const KINDS = new Set(["workout", "sleep", "steps"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAMPLE_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const ORIGIN_RE = /^[A-Za-z0-9._:-]{1,255}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
// Input bounds (SPEC §3.2): an out-of-range date or a local / huge-year instant would reach Postgres as an unparsable
// value and fail the WHOLE batch — so they are per-item "invalid" instead.
const MIN_DATE = "2000-01-01";
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);
const latestDate = () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const toInstant = (v) => {
    const time = typeof v === "string" && INSTANT_RE.test(v) ? Date.parse(v) : NaN;
    const year = Number.isNaN(time) ? 0 : new Date(time).getUTCFullYear();
    return year >= 2000 && year <= 2100 ? new Date(time) : null;
};
const iso = (v) => (v ? new Date(v).toISOString() : null);

// The explicit I/O bound (D-C11): every statement of `work` is capped at 10 s. A lock wait over 2 s (lockMember) is
// 503 "busy" + Retry-After instead, so a queued run frees its pool connection quickly.
const withTimeout = async (work) => {
    try {
        return await sequelize.transaction(async (transaction) => {
            await sequelize.query("SET LOCAL statement_timeout = '10s'", { transaction });
            return work(transaction);
        });
    } catch (err) {
        if (err.parent?.code !== "55P03") throw err; // 55P03 = lock_not_available (lock_timeout)
        throw new AppError(503, "Another health sync is still running. Try again shortly.", { code: "busy", retryAfter: 2 });
    }
};

// Held until the transaction ends; the batch and PUT /state share the key (D-C11).
const lockMember = async (memberId, transaction) => {
    await sequelize.query("SET LOCAL lock_timeout = '2s'", { transaction });
    await sequelize.query("SELECT pg_advisory_xact_lock(hashtextextended($key::text, 0))", {
        bind: { key: `health_sync:${memberId}` }, transaction
    });
};

function fillWorkout(raw, e) {
    if (typeof raw.sample_id !== "string" || !SAMPLE_ID_RE.test(raw.sample_id)) {
        return "sample_id is required (1-128 characters: letters, digits, . _ : -).";
    }
    e.sample_id = raw.sample_id;
    if (raw.deleted === true) { e.op = "delete"; return null; }
    e.op = raw.legacy === true ? "legacy" : "add";
    if (typeof raw.origin !== "string" || !ORIGIN_RE.test(raw.origin)) return "origin is required (1-255 characters: letters, digits, . _ : -).";
    const name = typeof raw.workout_name === "string" ? raw.workout_name.trim() : "";
    if (!name || name.length > 100 || CONTROL_RE.test(name)) return "workout_name is required (1-100 characters).";
    if (!Number.isInteger(raw.value) || raw.value <= 0 || raw.value > MAX_WORKOUT_VALUE) return `value must be whole minutes between 1 and ${MAX_WORKOUT_VALUE}.`;
    const start = toInstant(raw.start_at);
    const end = toInstant(raw.end_at);
    if (!start || !end || end <= start) {
        return "start_at and end_at must be ISO-8601 times with a Z or ±hh:mm offset (years 2000-2100), end_at after start_at.";
    }
    Object.assign(e, { origin: raw.origin, workout_name: name, value: raw.value, start_at: start, end_at: end });
    return null;
}

function fillEntry(raw, e) {
    if (!KINDS.has(raw.kind)) return "kind must be workout, sleep or steps.";
    e.kind = raw.kind;
    if (e.kind === "workout" && raw.deleted === true) return fillWorkout(raw, e);
    if (!isUuid(raw.program_id)) return "program_id must be a UUID.";
    if (!isValidDateString(raw.date) || raw.date < MIN_DATE || raw.date > latestDate()) {
        return `date must be a valid YYYY-MM-DD date from ${MIN_DATE} to 2 days after today.`;
    }
    Object.assign(e, { program_id: raw.program_id.toLowerCase(), date: raw.date });
    if (e.kind === "workout") return fillWorkout(raw, e);
    e.op = "set";
    if (e.kind === "sleep") {
        if (typeof raw.value !== "number" || !(raw.value >= 0 && raw.value <= 24)) return "value must be hours between 0 and 24.";
        e.value = Math.round(raw.value * 100) / 100;
        return null;
    }
    if (!Number.isInteger(raw.value) || raw.value < 0 || raw.value > MAX_STEPS) return `value must be whole steps between 0 and ${MAX_STEPS}.`;
    e.value = raw.value;
    return null;
}

// In-batch conflicts → "invalid": a second sleep/steps item for one program + date, and an add/legacy item for a sample
// the same batch deletes (send only the deletion). A repeated workout sample is the ledger pass's "duplicate".
function markBatchConflicts(entries) {
    const deleted = new Set(entries.filter((e) => !e.status && e.op === "delete").map((e) => e.sample_id));
    const days = new Set();
    for (const e of entries) {
        if (e.status) continue;
        const dayKey = `${e.kind}|${e.program_id}|${e.date}`;
        if (e.op === "set" && days.has(dayKey)) Object.assign(e, { status: "invalid", error: "Duplicate item for this program and date." });
        else if (e.op === "set") days.add(dayKey);
        else if (e.op !== "delete" && deleted.has(e.sample_id)) Object.assign(e, { status: "invalid", error: "This sample is also deleted in this batch." });
    }
}

function validateBatch(body) {
    const bad = (message) => new AppError(400, message, { code: "invalid_batch" });
    if (!isPlainObject(body)) throw bad("Body must be a JSON object.");
    if (!INTEGRATIONS.has(body.integration)) throw bad("integration must be healthkit or health_connect.");
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_ITEMS) {
        throw bad(`items must be an array of 1-${MAX_ITEMS} items.`);
    }
    const entries = body.items.map((raw, index) => {
        const e = { index, status: null };
        const error = isPlainObject(raw) ? fillEntry(raw, e) : "Each item must be an object.";
        return error ? Object.assign(e, { status: "invalid", error }) : e;
    });
    markBatchConflicts(entries);
    return { integration: body.integration, entries };
}

// The token member's write access per program — the old routes' rules (active membership; admin_only_data_entry needs a
// program admin or a global admin) applied per item: two indexed queries per batch, never one per item (D-C11).
async function loadAccess(requester, programIds, transaction) {
    const memberships = programIds.length === 0 ? [] : await ProgramMembership.findAll({
        where: { member_id: requester.id, program_id: programIds },
        attributes: ["program_id", "role", "status"], raw: true, transaction
    });
    const lockedPrograms = memberships.length === 0 ? [] : await Program.findAll({
        where: { id: memberships.map((m) => m.program_id), admin_only_data_entry: true },
        attributes: ["id"], raw: true, transaction
    });
    const locked = new Set(lockedPrograms.map((p) => p.id));
    const isGlobalAdmin = requester.global_role === "global_admin";
    const byProgram = new Map(memberships.map((m) => [m.program_id, {
        active: m.status === "active",
        locked: locked.has(m.program_id) && !isGlobalAdmin && m.role !== "admin"
    }]));
    return {
        hasMembership: (programId) => byProgram.has(programId),
        blockFor: (programId) => {
            const access = byProgram.get(programId);
            if (!access || !access.active) return "skipped_not_member";
            return access.locked ? "skipped_locked" : null;
        }
    };
}

async function syncBatch({ body, requester }) {
    const { integration, entries } = validateBatch(body);
    const open = entries.filter((e) => !e.status);
    if (open.length > 0) {
        await withTimeout(async (transaction) => {
            await lockMember(requester.id, transaction);
            const workouts = open.filter((e) => e.kind === "workout");
            const known = await HealthSyncSample.findBySampleIds(
                requester.id, integration, [...new Set(workouts.map((e) => e.sample_id))], transaction
            );
            const programIds = [...new Set([...open.map((e) => e.program_id), ...known.map((r) => r.program_id)].filter(Boolean))];
            const access = await loadAccess(requester, programIds, transaction);
            const context = { memberId: requester.id, integration, access, transaction };
            await applyWorkouts({ ...context, entries: workouts, known });
            await applyDaily({ ...context, entries: open.filter((e) => e.kind !== "workout") });
            if (open.some((e) => !e.status)) throw new Error("health-sync: an item finished without a status");
        });
    }
    const counts = {};
    const results = entries.map(({ index, status, error }) => {
        counts[status] = (counts[status] || 0) + 1;
        return error ? { index, status, error } : { index, status };
    });
    return { integration, results, counts };
}

function validateState(body) {
    const bad = (message) => new AppError(400, message, { code: "invalid_state" });
    if (!isPlainObject(body) || !INTEGRATIONS.has(body.integration)) throw bad("integration must be healthkit or health_connect.");
    if (!Array.isArray(body.entries) || body.entries.length === 0 || body.entries.length > MAX_STATE_ENTRIES) {
        throw bad(`entries must be an array of 1-${MAX_STATE_ENTRIES} items.`);
    }
    const seen = new Set();
    const entries = body.entries.map((raw) => {
        if (!isPlainObject(raw) || !isUuid(raw.program_id) || !KINDS.has(raw.kind)) {
            throw bad("Each entry needs a program_id (UUID) and a kind (workout, sleep or steps).");
        }
        if (raw.review_done !== undefined && typeof raw.review_done !== "boolean") throw bad("review_done must be true or false.");
        if (raw.sync_success !== undefined && raw.sync_success !== true) throw bad("sync_success can only be true.");
        if (raw.review_done === undefined && raw.sync_success !== true) throw bad("Each entry needs review_done or sync_success.");
        const key = `${raw.program_id.toLowerCase()}|${raw.kind}`;
        if (seen.has(key)) throw bad("Duplicate entry for this program and kind.");
        seen.add(key);
        return { program_id: raw.program_id.toLowerCase(), kind: raw.kind, review_done: raw.review_done, sync_success: raw.sync_success === true };
    });
    return { integration: body.integration, entries };
}

async function readState(memberId, transaction) {
    const rows = await HealthSyncState.listForMember(memberId, transaction);
    return {
        server_time: new Date().toISOString(),
        states: rows.map((r) => ({
            integration: r.integration, program_id: r.program_id, kind: r.kind,
            review_done_at: iso(r.review_done_at), last_success_at: iso(r.last_success_at)
        }))
    };
}

const getState = (memberId) => withTimeout((transaction) => readState(memberId, transaction));

// Entries for programs without an ACTIVE membership are ignored (state rows FK to the membership).
async function putState({ body, requester }) {
    const { integration, entries } = validateState(body);
    return withTimeout(async (transaction) => {
        await lockMember(requester.id, transaction);
        const active = await ProgramMembership.findAll({
            where: { member_id: requester.id, program_id: [...new Set(entries.map((e) => e.program_id))], status: "active" },
            attributes: ["program_id"], raw: true, transaction
        });
        const activeIds = new Set(active.map((m) => m.program_id));
        await HealthSyncState.applyUpdates(requester.id, integration, entries.filter((e) => activeIds.has(e.program_id)), transaction);
        return readState(requester.id, transaction);
    });
}

module.exports = { syncBatch, getState, putState };
