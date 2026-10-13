// Announcement request validation — notifications SPEC §3.8 (the announcement rule). Pure: the body + the sender's
// X-Time-Zone in, a normalized request out, or a 400 invalid_body naming the first problem. The kit shows a 400's text
// word for word, so anything the admin can type or pick reads as plain language.
const { AppError } = require("../utils/response");
const { findMergeFields, MERGE_FIELDS } = require("../utils/notificationTemplates");
const { localParts, isValidDate, addDaysToDate } = require("../utils/localTime");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TITLE_MAX = 100;
const BODY_MAX = 500;
const MEMBERS_MAX = 200;
const SCHEDULE_MAX_DAYS = 30;

const invalid = (message) => new AppError(400, message, { code: "invalid_body" });
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseText = (value, field, max) => {
    if (typeof value !== "string" || !value.trim()) throw invalid(`${field} is required.`);
    const text = value.trim();
    if (text.length > max) throw invalid(`${field} must be at most ${max} characters.`);
    return text;
};

function parseTarget(target) {
    if (!isObject(target)) throw invalid("target is required.");
    if (target.kind === "everyone") return { kind: "everyone", programId: null, memberIds: null };
    if (target.kind === "program") {
        if (typeof target.program_id !== "string" || !UUID_RE.test(target.program_id)) {
            throw invalid("target.program_id must be a program id.");
        }
        return { kind: "program", programId: target.program_id.toLowerCase(), memberIds: null };
    }
    if (target.kind === "members") {
        const ids = target.member_ids;
        if (!Array.isArray(ids) || ids.length === 0 || ids.length > MEMBERS_MAX
            || ids.some((id) => typeof id !== "string" || !UUID_RE.test(id))) {
            throw invalid(`target.member_ids must list 1-${MEMBERS_MAX} member ids.`);
        }
        return { kind: "members", programId: null, memberIds: [...new Set(ids.map((id) => id.toLowerCase()))] };
    }
    throw invalid('target.kind must be "program", "members" or "everyone".');
}

function parseDelivery(delivery, senderTimeZone) {
    if (delivery === undefined || (isObject(delivery) && delivery.mode === "now")) {
        return { mode: "now", sendDate: null, sendTime: null, fallbackTimeZone: senderTimeZone || null };
    }
    if (!isObject(delivery) || delivery.mode !== "local") throw invalid('delivery.mode must be "now" or "local".');
    if (!senderTimeZone) {
        throw invalid("Couldn't read your time zone, so this can't be scheduled. Reload and try again, or send it now.");
    }
    if (!isValidDate(delivery.date)) throw invalid("delivery.date must be YYYY-MM-DD.");
    if (typeof delivery.time !== "string" || !TIME_RE.test(delivery.time)) {
        throw invalid("delivery.time must be HH:MM (24-hour).");
    }
    const today = localParts(senderTimeZone).date;
    if (delivery.date < today || delivery.date > addDaysToDate(today, SCHEDULE_MAX_DAYS)) {
        throw invalid(`Pick a date within the next ${SCHEDULE_MAX_DAYS} days.`);
    }
    return { mode: "local", sendDate: delivery.date, sendTime: delivery.time, fallbackTimeZone: senderTimeZone };
}

/** { target, title, body, delivery } from a composer request body. */
function parseAnnouncementRequest(body, senderTimeZone) {
    if (!isObject(body)) throw invalid("Request body must be a JSON object.");
    const target = parseTarget(body.target);
    const title = parseText(body.title, "title", TITLE_MAX);
    const text = parseText(body.body, "body", BODY_MAX);
    const fields = findMergeFields(`${title} ${text}`);
    const unknown = fields.find((field) => !MERGE_FIELDS.includes(field));
    if (unknown) throw invalid(`Unknown merge field {${unknown}}. Use {first_name}, {streak} or {program_name}.`);
    if (fields.includes("program_name") && target.kind !== "program") {
        throw invalid("{program_name} only works when you send to a program.");
    }
    return { target, title, body: text, delivery: parseDelivery(body.delivery, senderTimeZone) };
}

module.exports = { parseAnnouncementRequest, invalid, UUID_RE };
