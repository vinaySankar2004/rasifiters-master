// DEFERRED STUB — see specs/features/program-memberships/SPEC.md D-C4 (and programs D-C1).
// The real `notifications` feature (SSE streams + APNs push) is not ported yet. Until it is, this stub
// lets the membership + program-exit code call createNotification / getActiveProgramMemberIds by name
// (faithful to legacy utils/notifications.js) without dragging in the streams/push machinery:
//   • getActiveProgramMemberIds is the REAL pure-DB query (no SSE/push) — callers use it for recipient
//     lists + logic, so it stays accurate.
//   • createNotification is a NO-OP — the alert side-effect is deferred.
// When `notifications` is ported, REPLACE this file with the real implementation (buildNotificationPayload,
// the Notification/NotificationRecipient writes, the SSE dispatch + push). The call sites stay unchanged.
const { ProgramMembership } = require("../models");

const getActiveProgramMemberIds = async (programId, transaction) => {
    const memberships = await ProgramMembership.findAll({
        where: { program_id: programId, status: "active" },
        attributes: ["member_id"],
        transaction
    });
    return memberships.map((membership) => membership.member_id);
};

const createNotification = async (/* { type, programId, actorMemberId, title, body, recipientIds, transaction } */) => {
    // TODO(notifications): emit via SSE (notificationStreams) + APNs (pushNotifications) once ported.
    return null;
};

module.exports = {
    getActiveProgramMemberIds,
    createNotification
};
