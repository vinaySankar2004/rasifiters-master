// The notifications emit engine — see specs/features/notifications/SPEC.md §3.
// REPLACES the former deferred stub (programs D-C1 / program-memberships D-C4): createNotification now does
// the real DB write + SSE dispatch + APNs push. The cross-feature emit call sites (programs / memberships /
// invites) call createNotification + getActiveProgramMemberIds by name UNCHANGED — they now light up.
const {
    Notification,
    NotificationRecipient,
    ProgramMembership,
    MemberPushToken
} = require("../models");
const { sendNotificationToMember } = require("./notificationStreams");
const { sendPushToMembers } = require("./pushNotifications");

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
    const uniqueRecipients = Array.from(new Set((recipientIds || []).filter(Boolean)));
    if (uniqueRecipients.length === 0) {
        return null;
    }

    const notification = await Notification.create({
        type,
        program_id: programId,
        actor_member_id: actorMemberId,
        title,
        body
    }, { transaction });

    const recipientRows = uniqueRecipients.map((memberId) => ({
        notification_id: notification.id,
        member_id: memberId,
        acknowledged_at: null
    }));

    await NotificationRecipient.bulkCreate(recipientRows, { transaction });

    const payload = buildNotificationPayload(notification);

    const dispatch = () => {
        uniqueRecipients.forEach((memberId) => sendNotificationToMember(memberId, payload));
        sendPushToMembers(uniqueRecipients, {
            id: payload.id,
            title: payload.title,
            body: payload.body
        }).catch((err) => console.error("[push] sendPushToMembers error:", err));
    };

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
