// Notification preferences + member time zone — notifications SPEC §3.5 (the preference rule + the time-zone rule). One
// row per member (notification_preferences, sql/011); NO row = the defaults below (= 011's column defaults): program,
// activity and announcements on; reminders + digest OFF (opt-in — App Store 4.5.4, D-N7); reminder at 19:00 local.
// The time zone comes from each Phase 4 client's X-Time-Zone (utils/clientInfo.parseTimeZone, D-N6) and is written only
// when it changed. Old apps send none: such a member gets no reminder / digest (never a guessed time), and an
// announcement's local-time send uses the sender's zone instead.
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const NotificationPreference = require("../models/NotificationPreference");
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");

const DEFAULT_CATEGORIES = { program: true, activity: true, reminders: false, digest: false, announcements: true };
const DEFAULT_REMINDER_TIME = "19:00";
const CATEGORY_KEYS = Object.keys(DEFAULT_CATEGORIES);
const OPT_IN_CATEGORIES = new Set(["reminders", "digest"]);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SELECT_COLUMNS =
    "program, activity, reminders, digest, announcements, to_char(reminder_time, 'HH24:MI') AS reminder_time, time_zone";

const TZ_UPSERT_SQL = `
INSERT INTO notification_preferences (member_id, time_zone) VALUES (:memberId, :timeZone)
ON CONFLICT (member_id) DO UPDATE SET time_zone = EXCLUDED.time_zone, updated_at = now()
WHERE notification_preferences.time_zone IS DISTINCT FROM EXCLUDED.time_zone`;

const invalid = (message) => new AppError(400, message, { code: "invalid_body" });
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toResponse = (row) => ({
    categories: Object.fromEntries(CATEGORY_KEYS.map((key) => [key, row ? row[key] === true : DEFAULT_CATEGORIES[key]])),
    reminder_time: row?.reminder_time || DEFAULT_REMINDER_TIME,
    time_zone: row?.time_zone || null
});

async function saveTimeZone(memberId, timeZone) {
    if (!memberId || !timeZone) return;
    await sequelize.query(TZ_UPSERT_SQL, { replacements: { memberId, timeZone } });
}

/** Request paths: fire-and-forget — never delays or fails the request. */
function rememberTimeZone(memberId, timeZone) {
    if (!memberId || !timeZone) return;
    saveTimeZone(memberId, timeZone).catch((err) => logError("[notifications] time zone save failed:", err));
}

async function getPreferences(memberId, timeZone = null) {
    if (timeZone) {
        await saveTimeZone(memberId, timeZone).catch((err) => logError("[notifications] time zone save failed:", err));
    }
    const rows = await sequelize.query(
        `SELECT ${SELECT_COLUMNS} FROM notification_preferences WHERE member_id = :memberId`,
        { replacements: { memberId }, type: QueryTypes.SELECT }
    );
    return toResponse(rows[0]);
}

// PUT is partial: only the fields sent change. Unknown category keys are ignored (forward-compatible).
const parseUpdate = (body) => {
    if (!isObject(body)) throw invalid("Request body must be a JSON object.");
    const values = {};
    if (body.categories !== undefined) {
        if (!isObject(body.categories)) throw invalid("categories must be an object.");
        for (const key of CATEGORY_KEYS) {
            const value = body.categories[key];
            if (value === undefined) continue;
            if (typeof value !== "boolean") throw invalid(`categories.${key} must be true or false.`);
            values[key] = value;
        }
    }
    if (body.reminder_time !== undefined) {
        if (typeof body.reminder_time !== "string" || !TIME_RE.test(body.reminder_time)) {
            throw invalid("reminder_time must be HH:MM (24-hour).");
        }
        values.reminder_time = body.reminder_time;
    }
    if (Object.keys(values).length === 0) throw invalid("Nothing to update.");
    return values;
};

async function updatePreferences(memberId, body, timeZone = null) {
    const values = parseUpdate(body);
    if (timeZone) values.time_zone = timeZone;
    const columns = Object.keys(values); // only ever the whitelisted column names above
    const sql = `
INSERT INTO notification_preferences (member_id, ${columns.join(", ")})
VALUES (:memberId, ${columns.map((column) => `:${column}`).join(", ")})
ON CONFLICT (member_id) DO UPDATE SET ${columns.map((column) => `${column} = EXCLUDED.${column}`).join(", ")}, updated_at = now()
RETURNING ${SELECT_COLUMNS}`;
    const [rows] = await sequelize.query(sql, { replacements: { memberId, ...values } });
    return toResponse(rows[0]);
}

/** D-N2 (c) input for createNotification: Map memberId → is `category` on (default when no row). */
async function getCategoryPreferences(memberIds, category, transaction) {
    const fallback = DEFAULT_CATEGORIES[category] !== false;
    const enabled = new Map(memberIds.map((memberId) => [memberId, fallback]));
    if (!CATEGORY_KEYS.includes(category) || memberIds.length === 0) return enabled;
    const rows = await NotificationPreference.findAll({
        where: { member_id: memberIds },
        attributes: ["member_id", category],
        raw: true,
        transaction
    });
    for (const row of rows) enabled.set(row.member_id, row[category] === true);
    return enabled;
}

// Reminder / digest candidates: opted in, zone known, member active, in ≥ 1 active membership of a program that isn't
// deleted (no live program → nothing to log; deleting a program leaves its memberships active).
async function listOptedIn(category) {
    if (!OPT_IN_CATEGORIES.has(category)) throw new Error(`listOptedIn: ${category} is not an opt-in category`);
    return sequelize.query(`
SELECT np.member_id, m.first_name, to_char(np.reminder_time, 'HH24:MI') AS reminder_time, np.time_zone
FROM notification_preferences np
JOIN members m ON m.id = np.member_id
WHERE np.${category} = true
  AND np.time_zone IS NOT NULL
  AND m.status = 'active'
  AND EXISTS (
      SELECT 1 FROM program_memberships pm
      JOIN programs p ON p.id = pm.program_id AND p.is_deleted = false
      WHERE pm.member_id = np.member_id AND pm.status = 'active'
  )`,
    { type: QueryTypes.SELECT });
}

/** Map memberId → time zone, for the members that have one. */
async function getTimeZones(memberIds) {
    if (memberIds.length === 0) return new Map();
    const rows = await NotificationPreference.findAll({
        where: { member_id: memberIds },
        attributes: ["member_id", "time_zone"],
        raw: true
    });
    return new Map(rows.filter((row) => row.time_zone).map((row) => [row.member_id, row.time_zone]));
}

module.exports = {
    DEFAULT_CATEGORIES,
    getPreferences,
    updatePreferences,
    saveTimeZone,
    rememberTimeZone,
    getCategoryPreferences,
    listOptedIn,
    getTimeZones
};
