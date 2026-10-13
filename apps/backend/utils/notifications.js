// The notifications emit engine — see specs/features/notifications/SPEC.md §3 + §3.4.
// REPLACES the former deferred stub (programs D-C1 / program-memberships D-C4): createNotification does the real DB
// write + live in-app + push delivery. Callers — programs, memberships, invites, broadcast, announcements, the scheduler
// jobs and People's kudos — call createNotification + getActiveProgramMemberIds by name; the signature is FIXED.
// Phase 4 (the category rule + the preference rule): the type's category (utils/notificationCategories.js) and each
// recipient's switch for it decide (D-N2 c): activity / reminders / digest OFF → no notification for that member;
// program / announcements OFF → still created (it is in the inbox) but not pushed. Delivery runs through
// utils/notificationChannels.js.
const {
    Notification,
    NotificationRecipient,
    ProgramMembership,
    MemberPushToken
} = require("../models");
const { categoryFor, DROP_WHEN_OFF } = require("./notificationCategories");
const { deliverToChannels } = require("./notificationChannels");
const { getCategoryPreferences } = require("../services/notificationPreferenceService");

const buildNotificationPayload = (notification) => ({
    id: notification.id,
    type: notification.type,
    program_id: notification.program_id,
    actor_member_id: notification.actor_member_id,
    title: notification.title,
    body: notification.body,
    created_at: notification.created_at
});

const getActiveProgramMemberIds = async (programId, transaction) => {
    const memberships = await ProgramMembership.findAll({
        where: { program_id: programId, status: "active" },
        attributes: ["member_id"],
        transaction
    });
    return memberships.map((membership) => membership.member_id);
};

/** Returns all member IDs that have at least one device in member_push_tokens (for broadcast). */
const getMemberIdsWithPushTokens = async () => {
    const rows = await MemberPushToken.findAll({
        attributes: ["member_id"],
        raw: true
    });
    return [...new Set(rows.map((r) => r.member_id))];
};

const createNotification = async ({
    type,
    programId = null,
    actorMemberId = null,
    title,
    body,
    recipientIds,
    transaction
}) => {
    // Lower-case once: preference rows come back lower-case, and Postgres compares uuids case-insensitively.
    const uniqueRecipients = Array.from(new Set((recipientIds || []).filter(Boolean).map((id) => String(id).toLowerCase())));
    if (uniqueRecipients.length === 0) {
        return null;
    }

    // D-N2 (c) — read inside the caller's transaction (same connection). sql/011 must exist before this code runs.
    const category = categoryFor(type);
    const enabled = await getCategoryPreferences(uniqueRecipients, category, transaction);
    const inboxRecipients = DROP_WHEN_OFF.has(category)
        ? uniqueRecipients.filter((memberId) => enabled.get(memberId))
        : uniqueRecipients;
    if (inboxRecipients.length === 0) {
        return null;
    }
    const pushRecipients = inboxRecipients.filter((memberId) => enabled.get(memberId));

    const notification = await Notification.create({
        type,
        program_id: programId,
        actor_member_id: actorMemberId,
        title,
        body
    }, { transaction });

    const recipientRows = inboxRecipients.map((memberId) => ({
        notification_id: notification.id,
        member_id: memberId,
        acknowledged_at: null
    }));

    await NotificationRecipient.bulkCreate(recipientRows, { transaction });

    const payload = buildNotificationPayload(notification);
    const dispatch = () => deliverToChannels({ payload, recipientIds: inboxRecipients, pushRecipientIds: pushRecipients });

    // When emitted inside a DB transaction, defer the alert until commit — no notification for a
    // rolled-back write. Otherwise dispatch immediately.
    if (transaction && typeof transaction.afterCommit === "function") {
        transaction.afterCommit(dispatch);
    } else {
        dispatch();
    }

    return notification;
};

module.exports = {
    buildNotificationPayload,
    getActiveProgramMemberIds,
    getMemberIdsWithPushTokens,
    createNotification
};
