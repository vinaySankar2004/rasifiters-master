// Kudos service — give / undo kudos (specs/features/people/SPEC.md §4.3; phase-4 D-P4, D-P5, D-P9).
// One kudos per giver per recipient per RECIPIENT-LOCAL day — UNIQUE (giver_id, recipient_id, kudos_date), sql/012.
// A count only (no text). Who may give: an ACTIVE member of the program (the kudos eligibility rule); whose kudos the
// giver may see: canView(…, "workouts") (utils/memberVisibility). Everything notification-side goes through the
// Notifications server's C8 seam only: the recipient's zone (getTimeZones + localParts), the words
// (getContentProvider) and createNotification — category, preferences and delivery are its job (a null return = not
// created). Undo deletes the kudos and, while the recipient hasn't read it, its notification; it returns no count
// (people SPEC §5 row 13). Never require services/peopleService here (it requires this file).
const { UniqueConstraintError } = require("sequelize");
const { sequelize } = require("../config/database");
const { Member, Program, ProgramMembership, Notification, NotificationRecipient } = require("../models");
const Kudos = require("../models/Kudos");
const { AppError } = require("../utils/response");
const { createNotification } = require("../utils/notifications");
const { getContentProvider } = require("../utils/notificationTemplates");
const { localParts, dayLabel } = require("../utils/localTime");
const { getTimeZones } = require("./notificationPreferenceService");
const { loadViewer, canView, ACTIVITY_HIDDEN_MESSAGE } = require("../utils/memberVisibility");

const KUDOS_NOTIFICATION_TYPE = "activity.kudos_received";

// D-P5 day rule: the recipient's local calendar date; no stored zone (or one Intl rejects) → UTC.
const recipientLocalDate = async (id) =>
    (localParts((await getTimeZones([id])).get(id) || "UTC") || localParts("UTC")).date;

// The kudos eligibility rule: kudos only between ACTIVE members of the program. loadViewer answers that for everyone
// but a global admin (it skips the lookup for them), so a global admin costs one composite-PK read here. Eligibility
// to give — not visibility (that is canView).
async function isActiveGiver(viewer, programId) {
    if (!viewer.isGlobalAdmin) return viewer.isActiveMember;
    const membership = await ProgramMembership.findOne({
        where: { program_id: programId, member_id: viewer.id, status: "active" },
        attributes: ["member_id"]
    });
    return Boolean(membership);
}

const kudosState = async (giverId, recipientId, kudosDate) => {
    const [count, mine] = await Promise.all([
        Kudos.count({ where: { recipient_id: recipientId } }),
        Kudos.count({ where: { giver_id: giverId, recipient_id: recipientId, kudos_date: kudosDate } })
    ]);
    return { count, given_today: mine > 0 };
};

// The profile's kudos block (peopleService adds can_give). Only called after canView(…, "workouts") passed.
const getKudosSummary = async ({ viewerId, recipientId }) =>
    kudosState(viewerId, recipientId, await recipientLocalDate(recipientId));

// Insert once; the notification rides the same transaction (createNotification defers SSE + push to commit). A
// concurrent duplicate loses on the UNIQUE key → the same outcome as "already given today".
const insertKudos = async ({ giverId, actorFirstName, recipient, programId, kudosDate }) => {
    try {
        await sequelize.transaction(async (transaction) => {
            const kudos = await Kudos.create({
                giver_id: giverId,
                recipient_id: recipient.id,
                program_id: programId,
                kudos_date: kudosDate
            }, { transaction });
            // The content seam (C8): the words come from the content provider (the KUDOS variants), never fixed text.
            const content = await getContentProvider().render(KUDOS_NOTIFICATION_TYPE, {
                first_name: recipient.first_name,
                actor_first_name: actorFirstName,
                day_label: dayLabel(kudosDate, kudosDate)
            }, `${recipient.id}|${giverId}|${kudosDate}`);
            const notification = await createNotification({
                type: KUDOS_NOTIFICATION_TYPE,
                programId,
                actorMemberId: giverId,
                title: content.title,
                body: content.body,
                recipientIds: [recipient.id],
                transaction
            });
            if (notification?.id) await kudos.update({ notification_id: notification.id }, { transaction });
        });
        return true;
    } catch (err) {
        if (err instanceof UniqueConstraintError) return false;
        throw err;
    }
};

// POST /api/people/:memberId/kudos — idempotent per recipient-local day → { created, kudos: { count, given_today } }.
async function giveKudos({ user, recipientId, programId }) {
    if (recipientId === user.id) {
        throw new AppError(400, "You can't give kudos to yourself.", { code: "kudos_self" });
    }
    const viewer = await loadViewer(user, programId);
    if (!(await isActiveGiver(viewer, programId))) {
        throw new AppError(403, "You're not a member of this program.", { code: "not_program_member" });
    }
    const [program, membership, giverRow] = await Promise.all([
        Program.findOne({ where: { id: programId, is_deleted: false }, attributes: ["id"] }),
        ProgramMembership.findOne({
            where: { program_id: programId, member_id: recipientId, status: "active" },
            attributes: ["program_id", "member_id"],
            include: [{ model: Member, attributes: ["id", "first_name", "hide_activity"] }]
        }),
        Member.findByPk(user.id, { attributes: ["first_name"] })
    ]);
    if (!program) throw new AppError(404, "This program no longer exists.", { code: "program_not_found" });
    if (!membership?.Member) {
        throw new AppError(404, "This person isn't in this program.", { code: "member_not_in_program" });
    }
    if (!canView(viewer, membership.member_id, "workouts")) {
        throw new AppError(403, ACTIVITY_HIDDEN_MESSAGE, { code: "activity_hidden" });
    }
    const kudosDate = await recipientLocalDate(membership.member_id);
    const existing = await Kudos.findOne({
        where: { giver_id: user.id, recipient_id: membership.member_id, kudos_date: kudosDate },
        attributes: ["id"]
    });
    const created = existing ? false : await insertKudos({
        giverId: user.id,
        actorFirstName: (giverRow?.first_name || "").trim() || user.username,
        recipient: membership.Member,
        programId,
        kudosDate
    });
    return { created, kudos: await kudosState(user.id, membership.member_id, kudosDate) };
}

// DELETE /api/people/:memberId/kudos — undo the caller's kudos for the recipient's current day; idempotent; ungated
// (it only ever removes the caller's own row). Returns ONLY the caller's own state — never the recipient's count, so a
// hidden or unrelated member's kudos can't be read through it. Its notification goes too while unread
// (acknowledged_at IS NULL = unread in the inbox); a read one stays. A push already delivered can't be recalled.
async function undoKudos({ user, recipientId }) {
    const kudosDate = await recipientLocalDate(recipientId);
    const removed = await sequelize.transaction(async (transaction) => {
        const kudos = await Kudos.findOne({
            where: { giver_id: user.id, recipient_id: recipientId, kudos_date: kudosDate },
            transaction
        });
        if (!kudos) return false;
        const notificationId = kudos.notification_id;
        await kudos.destroy({ transaction });
        if (notificationId) {
            const unread = await NotificationRecipient.count({
                where: { notification_id: notificationId, member_id: recipientId, acknowledged_at: null },
                transaction
            });
            // notification_recipients + push_deliveries rows go with it (ON DELETE CASCADE — sql/001, sql/010).
            if (unread > 0) await Notification.destroy({ where: { id: notificationId }, transaction });
        }
        return true;
    });
    return { given_today: false, removed };
}

module.exports = { giveKudos, undoKudos, getKudosSummary, isActiveGiver, KUDOS_NOTIFICATION_TYPE };
