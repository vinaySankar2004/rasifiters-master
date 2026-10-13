// Send-anytime announcements (D-N16) — notifications SPEC §3.8 (the announcement rule). Global admins only
// (routes/announcements.js gates). Target = one program's active members / chosen members / everyone (every active
// member); the list is resolved ONCE, at compose time, and stored on the audit row (notification_announcements: sender,
// time, target, recipients, counts, status). Delivery: services/announcementDelivery.js (type app.broadcast — category
// announcements: always in the inbox, pushed only where the member's announcements switch is on).
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const NotificationAnnouncement = require("../models/NotificationAnnouncement");
const { AppError } = require("../utils/response");
const { parseAnnouncementRequest, invalid, UUID_RE } = require("./announcementRequest");
const { renderForRecipients, startDelivery } = require("./announcementDelivery");

const LIST_LIMIT = 50;
const OPEN_STATUSES = ["scheduled", "sending"];
const notFound = (message) => new AppError(404, message, { code: "not_found" });
const select = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

const LIST_SQL = `
SELECT a.id, a.created_at, a.sender_member_id, NULLIF(trim(concat_ws(' ', m.first_name, m.last_name)), '') AS sender_name,
       a.target_kind, a.target_program_id, p.name AS target_program_name, a.title_template, a.body_template, a.mode,
       to_char(a.send_date, 'YYYY-MM-DD') AS send_date, to_char(a.send_time, 'HH24:MI') AS send_time,
       a.status, a.recipient_count, a.sent_count, a.completed_at
FROM notification_announcements a
LEFT JOIN members m ON m.id = a.sender_member_id
LEFT JOIN programs p ON p.id = a.target_program_id
ORDER BY a.created_at DESC
LIMIT :limit`;

async function resolveRecipients(target) {
    if (target.kind === "everyone") {
        const rows = await select("SELECT id FROM members WHERE status = 'active'");
        return { memberIds: rows.map((row) => row.id), programName: null };
    }
    if (target.kind === "program") {
        const [program] = await select(
            "SELECT id, name FROM programs WHERE id = :programId AND is_deleted = false",
            { programId: target.programId }
        );
        if (!program) throw notFound("Program not found.");
        const rows = await select(`
SELECT pm.member_id FROM program_memberships pm JOIN members m ON m.id = pm.member_id
WHERE pm.program_id = :programId AND pm.status = 'active' AND m.status = 'active'`, { programId: program.id });
        return { memberIds: rows.map((row) => row.member_id), programName: program.name };
    }
    const rows = await select("SELECT id FROM members WHERE id IN (:memberIds) AND status = 'active'", { memberIds: target.memberIds });
    if (rows.length !== target.memberIds.length) {
        throw invalid("Some of the chosen members are no longer active. Update the list and try again.");
    }
    return { memberIds: rows.map((row) => row.id), programName: null };
}

const toSummary = (row, { senderName = null, programName = null } = {}) => ({
    id: row.id,
    created_at: row.created_at,
    sender_member_id: row.sender_member_id,
    sender_name: senderName,
    target_kind: row.target_kind,
    target_program_id: row.target_program_id,
    target_program_name: programName,
    title: row.title_template,
    body: row.body_template,
    mode: row.mode,
    send_date: row.send_date || null,
    send_time: row.send_time ? String(row.send_time).slice(0, 5) : null,
    status: row.status,
    recipient_count: row.recipient_count,
    sent_count: row.sent_count,
    completed_at: row.completed_at || null
});

async function previewAnnouncement(body, sender, senderTimeZone) {
    const request = parseAnnouncementRequest(body, senderTimeZone);
    const { memberIds, programName } = await resolveRecipients(request.target);
    if (memberIds.length === 0) return { recipient_count: 0, sample: null };
    const asked = typeof body.sample_member_id === "string" ? body.sample_member_id.toLowerCase() : null;
    const sampleId = memberIds.includes(asked) ? asked : (memberIds.includes(sender.id) ? sender.id : memberIds[0]);
    const [sample] = await renderForRecipients({
        titleTemplate: request.title,
        bodyTemplate: request.body,
        programName,
        fallbackTimeZone: request.delivery.fallbackTimeZone
    }, [sampleId]);
    return {
        recipient_count: memberIds.length,
        sample: sample
            ? { member_id: sample.memberId, first_name: sample.firstName, title: sample.title, body: sample.body }
            : null
    };
}

async function createAnnouncement(body, sender, senderTimeZone) {
    const request = parseAnnouncementRequest(body, senderTimeZone);
    const { memberIds, programName } = await resolveRecipients(request.target);
    if (memberIds.length === 0) throw invalid("No active members match this target.");
    const row = await NotificationAnnouncement.create({
        sender_member_id: sender.id,
        target_kind: request.target.kind,
        target_program_id: request.target.programId,
        recipient_ids: memberIds,
        title_template: request.title,
        body_template: request.body,
        mode: request.delivery.mode,
        send_date: request.delivery.sendDate,
        send_time: request.delivery.sendTime,
        fallback_time_zone: request.delivery.fallbackTimeZone,
        status: request.delivery.mode === "now" ? "sending" : "scheduled",
        recipient_count: memberIds.length,
        sent_count: 0
    });
    if (request.delivery.mode === "now") startDelivery(row.id);
    return toSummary(row.get({ plain: true }), { senderName: sender.member_name || null, programName });
}

async function listAnnouncements() {
    const rows = await select(LIST_SQL, { limit: LIST_LIMIT });
    return {
        announcements: rows.map((row) =>
            toSummary(row, { senderName: row.sender_name, programName: row.target_program_name }))
    };
}

async function cancelAnnouncement(id) {
    if (typeof id !== "string" || !UUID_RE.test(id)) throw notFound("Announcement not found.");
    const [updated] = await NotificationAnnouncement.update(
        { status: "cancelled", completed_at: new Date() },
        { where: { id, status: OPEN_STATUSES } }
    );
    if (updated > 0) return { id, status: "cancelled" };
    const existing = await NotificationAnnouncement.findByPk(id, { attributes: ["status"], raw: true });
    if (!existing) throw notFound("Announcement not found.");
    throw new AppError(409, `This announcement is already ${existing.status}.`, { code: "invalid_state" });
}

module.exports = { previewAnnouncement, createAnnouncement, listAnnouncements, cancelAnnouncement };
