// handleMemberExit — the member-exit cascade. See specs/features/program-memberships/SPEC.md §4.
// FAITHFUL 1:1 to legacy utils/programMemberships.js: when the last active member leaves, soft-delete the
// program (optionally null created_by); when the last active admin leaves but members remain, promote the
// OLDEST active membership (joined_at ASC, member_id ASC) to admin. The notification emits are DEFERRED
// (D-C4) via the deferred utils/notifications stub (createNotification = no-op). getActiveProgramMemberIds
// is the real pure-DB query.
const { Op } = require("sequelize");
const { Program, ProgramMembership, Member, MemberEmail, ProgramInvite, Notification } = require("../models");
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

// cascadeMemberDeletion — the full member-removal cascade shared by DELETE /api/members/:id and
// DELETE /api/auth/account (members D-C1 / auth D-C1). FAITHFUL 1:1 to the duplicated legacy bodies in
// memberService.deleteMember + authService.deleteAccount (they are byte-identical), single-sourced here
// because the cascade is owned by program-memberships (it drives handleMemberExit). Order: destroy the
// member's outbound program_invites (by id / username / any of their emails) + the notifications they
// actored, then for every program they actively belong to OR created, run handleMemberExit (reassign
// created_by / delete now-empty programs / promote a new admin) and emit program.member_left to the
// remaining members, then destroy the member row. Runs entirely inside the caller's transaction; the
// caller commits and then best-effort deletes the Supabase auth user (an orphaned auth.users row maps to
// no member, so post-commit is the safe ordering). Caller owns the global-admin guard + the 404.
const cascadeMemberDeletion = async ({ member, transaction }) => {
    const memberEmails = await MemberEmail.findAll({
        where: { member_id: member.id },
        attributes: ["email"],
        transaction
    });
    const emailList = memberEmails.map((row) => row.email).filter(Boolean);
    const inviteFilters = [
        { invited_by: member.id },
        { invited_username: member.username }
    ];
    if (emailList.length > 0) {
        inviteFilters.push({ invited_email: { [Op.in]: emailList } });
    }
    await ProgramInvite.destroy({ where: { [Op.or]: inviteFilters }, transaction });
    await Notification.destroy({ where: { actor_member_id: member.id }, transaction });

    const activeMemberships = await ProgramMembership.findAll({
        where: { member_id: member.id, status: "active" },
        attributes: ["program_id"],
        transaction
    });
    const createdPrograms = await Program.findAll({
        where: { created_by: member.id, is_deleted: false },
        attributes: ["id"],
        transaction
    });

    const programIds = new Set([
        ...activeMemberships.map((m) => m.program_id),
        ...createdPrograms.map((p) => p.id)
    ]);

    for (const programId of programIds) {
        const exitResult = await handleMemberExit({
            programId,
            exitingMemberId: member.id,
            transaction,
            updateCreatedBy: true,
            notificationActorId: null,
            includeExitingMemberInRecipients: false
        });

        if (!exitResult.programDeleted) {
            const remainingMemberIds = await getActiveProgramMemberIds(programId, transaction);
            const recipients = remainingMemberIds.filter((id) => id !== member.id);
            if (recipients.length > 0) {
                const program = await Program.findByPk(programId, { transaction });
                await createNotification({
                    type: "program.member_left",
                    programId,
                    actorMemberId: null,
                    title: "Member left",
                    body: `A member left ${program?.name || "the program"}.`,
                    recipientIds: recipients,
                    transaction
                });
            }
        }
    }

    await member.destroy({ transaction });
};

module.exports = {
    handleMemberExit,
    cascadeMemberDeletion
};
