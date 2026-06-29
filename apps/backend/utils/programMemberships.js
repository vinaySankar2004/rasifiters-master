// handleMemberExit — the member-exit cascade. See specs/features/program-memberships/SPEC.md §4.
// FAITHFUL 1:1 to legacy utils/programMemberships.js: when the last active member leaves, soft-delete the
// program (optionally null created_by); when the last active admin leaves but members remain, promote the
// OLDEST active membership (joined_at ASC, member_id ASC) to admin. The notification emits are DEFERRED
// (D-C4) via the deferred utils/notifications stub (createNotification = no-op). getActiveProgramMemberIds
// is the real pure-DB query.
const { Op } = require("sequelize");
const { Program, ProgramMembership, Member } = require("../models");
const { createNotification, getActiveProgramMemberIds } = require("./notifications");

const findOldestActiveMembership = async ({
    programId,
    excludeMemberId,
    role,
    transaction
}) => {
    const where = {
        program_id: programId,
        status: "active"
    };
    if (excludeMemberId) {
        where.member_id = { [Op.ne]: excludeMemberId };
    }
    if (role) {
        where.role = role;
    }

    return ProgramMembership.findOne({
        where,
        include: [
            {
                model: Member,
                attributes: ["id", "member_name", "global_role"]
            }
        ],
        order: [
            ["joined_at", "ASC"],
            ["member_id", "ASC"]
        ],
        transaction
    });
};

const handleMemberExit = async ({
    programId,
    exitingMemberId,
    transaction,
    updateCreatedBy = false,
    notificationActorId,
    includeExitingMemberInRecipients = true
}) => {
    const actorId = notificationActorId !== undefined ? notificationActorId : exitingMemberId;
    const program = await Program.findByPk(programId, { transaction });
    if (!program || program.is_deleted) {
        return { programDeleted: false };
    }

    const remainingMembersCount = await ProgramMembership.count({
        where: {
            program_id: programId,
            status: "active",
            member_id: { [Op.ne]: exitingMemberId }
        },
        transaction
    });

    if (remainingMembersCount === 0) {
        const updatePayload = { is_deleted: true, updated_at: new Date() };
        if (updateCreatedBy && program.created_by === exitingMemberId) {
            updatePayload.created_by = null;
        }
        await program.update(updatePayload, { transaction });
        const activeMemberIds = await getActiveProgramMemberIds(programId, transaction);
        const baseRecipients = includeExitingMemberInRecipients
            ? [...activeMemberIds, exitingMemberId]
            : activeMemberIds.filter((id) => id !== exitingMemberId);
        const recipients = Array.from(new Set(baseRecipients.filter(Boolean)));
        if (recipients.length > 0) {
            await createNotification({
                type: "program.deleted",
                programId,
                actorMemberId: actorId || null,
                title: "Program deleted",
                body: `${program.name} was deleted because no members remain.`,
                recipientIds: recipients,
                transaction
            });
        }
        return { programDeleted: true };
    }

    const remainingAdminsCount = await ProgramMembership.count({
        where: {
            program_id: programId,
            status: "active",
            role: "admin",
            member_id: { [Op.ne]: exitingMemberId }
        },
        transaction
    });

    let promotedMembership = null;
    if (remainingAdminsCount === 0) {
        promotedMembership = await findOldestActiveMembership({
            programId,
            excludeMemberId: exitingMemberId,
            transaction
        });

        if (promotedMembership && promotedMembership.role !== "admin") {
            await promotedMembership.update({ role: "admin" }, { transaction });
        }
    }

    if (promotedMembership) {
        await createNotification({
            type: "program.role_changed",
            programId,
            actorMemberId: actorId || null,
            title: "Role updated",
            body: `Your role in ${program.name} is now admin.`,
            recipientIds: [promotedMembership.member_id],
            transaction
        });

        const activeMemberIds = await getActiveProgramMemberIds(programId, transaction);
        const adminTransferRecipients = includeExitingMemberInRecipients
            ? activeMemberIds
            : activeMemberIds.filter((id) => id !== exitingMemberId);
        if (adminTransferRecipients.length > 0) {
            await createNotification({
                type: "program.admin_transferred",
                programId,
                actorMemberId: promotedMembership.member_id,
                title: "New admin assigned",
                body: `${promotedMembership.Member?.member_name || "A member"} is now an admin of ${program.name}.`,
                recipientIds: adminTransferRecipients,
                transaction
            });
        }
    }

    if (updateCreatedBy && program.created_by === exitingMemberId) {
        await program.update(
            { created_by: null, updated_at: new Date() },
            { transaction }
        );
    }

    return {
        programDeleted: false,
        newAdminMemberId: promotedMembership?.member_id || null,
        newAdminMemberName: promotedMembership?.Member?.member_name || null
    };
};

module.exports = {
    handleMemberExit
};
