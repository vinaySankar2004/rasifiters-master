// The notification inbox — notifications SPEC §3.5 (the inbox rule). Reads the existing notifications /
// notification_recipients tables (no new table): newest first, keyset-paged, last 90 days (sql/011's nightly retention
// deletes older rows). Read = acknowledged_at (D-N5). The badge counts an invite ONCE: unread items except
// program.invite_received, plus the member's pending, unexpired invites (the GET /my-invites rule — exact username).
// Daily reminders and weekly digests stay in `unread` but never in `badge` (an ignored nudge must not make it climb).
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const { NotificationRecipient } = require("../models");
const { AppError } = require("../utils/response");
const { inboxFields, BADGE_EXCLUDED_TYPES } = require("../utils/notificationCategories");

const INBOX_DAYS = 90;
const PAGE_DEFAULT = 30;
const PAGE_MAX = 50;
const READ_IDS_MAX = 100;
const INVITE_TYPE = "program.invite_received";
const UNBADGED_TYPES = [INVITE_TYPE, ...BADGE_EXCLUDED_TYPES];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR_RE =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const invalid = (message) => new AppError(400, message, { code: "invalid_body" });

const listSql = (withCursor) => `
SELECT n.id, n.type, n.program_id, n.actor_member_id, n.title, n.body, n.created_at, nr.acknowledged_at AS read_at,
       to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
FROM notification_recipients nr
JOIN notifications n ON n.id = nr.notification_id
WHERE nr.member_id = :memberId
  AND n.created_at > now() - interval '${INBOX_DAYS} days'
  ${withCursor ? "AND (n.created_at, n.id) < (CAST(:cursorAt AS timestamptz), CAST(:cursorId AS uuid))" : ""}
ORDER BY n.created_at DESC, n.id DESC
LIMIT :limit`;

const COUNTS_SQL = `
SELECT m.id AS member_id, u.unread, u.unbadged, p.pending_invites
FROM members m
CROSS JOIN LATERAL (
    SELECT count(*)::int AS unread,
           count(*) FILTER (WHERE n.type IN (:unbadgedTypes))::int AS unbadged
    FROM notification_recipients nr
    JOIN notifications n ON n.id = nr.notification_id
    WHERE nr.member_id = m.id AND nr.acknowledged_at IS NULL AND n.created_at > now() - interval '${INBOX_DAYS} days'
) u
CROSS JOIN LATERAL (
    SELECT count(*)::int AS pending_invites
    FROM program_invites pi
    WHERE pi.invited_username = m.username AND pi.status = 'pending'
      AND (pi.expires_at IS NULL OR pi.expires_at > now())
) p
WHERE m.id IN (:memberIds)`;

// An answered invite's items, wherever they sit in the paged inbox (client rule C7.7).
const READ_PROGRAM_INVITES_SQL = `
UPDATE notification_recipients nr SET acknowledged_at = now()
FROM notifications n
WHERE n.id = nr.notification_id AND nr.member_id = :memberId AND nr.acknowledged_at IS NULL
  AND n.type = :type AND n.program_id = :programId`;

const parseLimit = (raw) => {
    if (raw === undefined) return PAGE_DEFAULT;
    const limit = Number(raw);
    if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX) throw invalid(`limit must be 1-${PAGE_MAX}.`);
    return limit;
};

async function listInbox(memberId, query = {}) {
    const limit = parseLimit(query.limit);
    let cursor = null;
    if (query.before !== undefined) {
        const match = typeof query.before === "string" ? CURSOR_RE.exec(query.before) : null;
        if (!match) throw invalid("before must be a next_cursor value.");
        cursor = { cursorAt: match[1], cursorId: match[2].toLowerCase() };
    }
    const rows = await sequelize.query(listSql(Boolean(cursor)), {
        replacements: { memberId, limit: limit + 1, ...(cursor || {}) },
        type: QueryTypes.SELECT
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
        items: page.map((row) => ({
            id: row.id,
            type: row.type,
            ...inboxFields(row.type),
            program_id: row.program_id,
            actor_member_id: row.actor_member_id,
            title: row.title,
            body: row.body,
            created_at: row.created_at,
            read_at: row.read_at
        })),
        next_cursor: rows.length > limit && last ? `${last.cursor_at}_${last.id}` : null
    };
}

/** Map memberId → { unread, pending_invites, badge } — ONE query (also the push badge, utils/pushNotifications.js). */
async function getBadgeCounts(memberIds) {
    const counts = new Map();
    if (memberIds.length === 0) return counts;
    const rows = await sequelize.query(COUNTS_SQL, {
        replacements: { memberIds, unbadgedTypes: UNBADGED_TYPES },
        type: QueryTypes.SELECT
    });
    for (const row of rows) {
        counts.set(row.member_id, {
            unread: row.unread,
            pending_invites: row.pending_invites,
            badge: row.unread - row.unbadged + row.pending_invites
        });
    }
    return counts;
}

async function getUnreadCounts(memberId) {
    return (await getBadgeCounts([memberId])).get(memberId) || { unread: 0, pending_invites: 0, badge: 0 };
}

const isInviteProgramBody = (body) =>
    body?.type === INVITE_TYPE && typeof body.program_id === "string" && UUID_RE.test(body.program_id);

/**
 * { all: true }, { ids: [...] } or { type: "program.invite_received", program_id } → marks them read
 * (acknowledged_at = now); idempotent; returns fresh counts.
 */
async function markRead(memberId, body) {
    if (isInviteProgramBody(body)) {
        const [, updated] = await sequelize.query(READ_PROGRAM_INVITES_SQL, {
            replacements: { memberId, type: INVITE_TYPE, programId: body.program_id.toLowerCase() },
            type: QueryTypes.UPDATE
        });
        return { updated, ...(await getUnreadCounts(memberId)) };
    }
    const where = { member_id: memberId, acknowledged_at: null };
    const ids = body?.ids;
    if (body?.all === true) {
        // every unread item
    } else if (Array.isArray(ids) && ids.length > 0 && ids.length <= READ_IDS_MAX
        && ids.every((id) => typeof id === "string" && UUID_RE.test(id))) {
        where.notification_id = ids.map((id) => id.toLowerCase());
    } else {
        throw invalid(`Send { "all": true }, { "ids": [...] } with 1-${READ_IDS_MAX} notification ids, `
            + `or { "type": "${INVITE_TYPE}", "program_id": "..." }.`);
    }
    const [updated] = await NotificationRecipient.update({ acknowledged_at: new Date() }, { where });
    return { updated, ...(await getUnreadCounts(memberId)) };
}

module.exports = { listInbox, getBadgeCounts, getUnreadCounts, markRead };
