// invite service — faithful to legacy services/inviteService.js
// (specs/features/invites/SPEC.md §4) EXCEPT two deliberate cleanups:
//   D-C3a — respondToInvite no longer destructures the vestigial `target_member_id` (read by no path,
//           sent by neither client; the target is resolved server-side).
//   D-C3b — getAllInvites batches the invitee lookup (one Member.findAll + map) instead of an N+1
//           Promise.all(Member.findOne) per invite. Identical response shape.
// The notification emits are wired LIVE (D-C2) — createNotification + getActiveProgramMemberIds are the
// ported notifications engine (no stub; the keystone is already ported).
// 0.2.0 (reliability overhaul R3): sendInvite moved to services/inviteSendService.js (one transaction + logged no-op
// reasons — invites D-C4/D-C5); getMyInvites hides expired invites (D-C7).
const { Op } = require("sequelize");
const { Member, Program, ProgramMembership, ProgramInvite, ProgramInviteBlock } = require("../models");
const { sequelize } = require("../config/database");
const { AppError } = require("../utils/response");
const { createNotification, getActiveProgramMemberIds } = require("../utils/notifications");

async function getMyInvites(requester) {
    const invites = await ProgramInvite.findAll({
        where: {
            invited_username: requester.username,
            status: "pending",
            // invites 0.2.0 (D-C7): expired invites are hidden — accepting one would only 400 "expired".
            [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: new Date() } }]
        },
        include: [
            { model: Program, attributes: ["id", "name", "status", "start_date", "end_date"] },
            { model: Member, as: "InvitedByMember", attributes: ["id", "first_name", "last_name", "username"] }
        ],
        order: [["created_at", "DESC"]]
    });

    return invites.map(inv => ({
        invite_id: inv.id,
        program_id: inv.program_id,
        program_name: inv.Program?.name,
        program_status: inv.Program?.status,
        program_start_date: inv.Program?.start_date,
        program_end_date: inv.Program?.end_date,
        invited_by_name: inv.InvitedByMember?.member_name,
        invited_at: inv.created_at,
        expires_at: inv.expires_at
    }));
}

async function getAllInvites(requester) {
    if (requester?.global_role !== "global_admin") {
        throw new AppError(403, "Global admin privileges required.");
    }

    const invites = await ProgramInvite.findAll({
        where: { status: "pending" },
        include: [
            { model: Program, attributes: ["id", "name", "status", "start_date", "end_date"] },
            { model: Member, as: "InvitedByMember", attributes: ["id", "first_name", "last_name", "username"] }
        ],
        order: [[Program, "name", "ASC"], ["created_at", "DESC"]]
    });

    // D-C3b: resolve every invitee in ONE query (legacy did an N+1 Member.findOne per invite), then map
    // by lowercased username. member_name is a Member VIRTUAL computed from the selected first/last name.
    const usernames = [
        ...new Set(invites.map(inv => inv.invited_username).filter(Boolean).map(u => u.toLowerCase()))
    ];
    const memberByUsername = new Map();
    if (usernames.length > 0) {
        const members = await Member.findAll({
            where: sequelize.where(
                sequelize.fn('LOWER', sequelize.col('username')),
                { [Op.in]: usernames }
            ),
            attributes: ["id", "first_name", "last_name", "username"]
        });
        for (const m of members) {
            memberByUsername.set(m.username.toLowerCase(), m);
        }
    }

    return invites.map(inv => {
        const invitedMember = inv.invited_username
            ? memberByUsername.get(inv.invited_username.toLowerCase())
            : null;

        return {
            invite_id: inv.id,
            program_id: inv.program_id,
            program_name: inv.Program?.name,
            program_status: inv.Program?.status,
            program_start_date: inv.Program?.start_date,
            program_end_date: inv.Program?.end_date,
            invited_by_name: inv.InvitedByMember?.member_name,
            invited_at: inv.created_at,
            expires_at: inv.expires_at,
            invited_username: inv.invited_username,
            invited_member_name: invitedMember?.member_name,
            invited_member_id: invitedMember?.id
        };
    });
}

async function respondToInvite({ invite_id, action, block_future }, requester) {
    if (!invite_id || !action) {
        throw new AppError(400, "invite_id and action are required.");
    }

    const isGlobalAdmin = requester?.global_role === "global_admin";
    const validActions = isGlobalAdmin ? ["accept", "decline", "revoke"] : ["accept", "decline"];
    if (!validActions.includes(action)) {
        throw new AppError(400, `action must be '${validActions.join("', '")}'.`);
    }

    const transaction = await sequelize.transaction();
    try {
        let invite;
        let targetMember;

        if (isGlobalAdmin) {
            invite = await ProgramInvite.findOne({
                where: { id: invite_id, status: "pending" },
                transaction
            });
            if (!invite) {
                await transaction.rollback();
                throw new AppError(404, "Invite not found or already processed.");
            }
            targetMember = await Member.findOne({
                where: sequelize.where(
                    sequelize.fn('LOWER', sequelize.col('username')),
                    invite.invited_username?.toLowerCase()
                ),
                transaction
            });
            if (!targetMember && action === "accept") {
                await transaction.rollback();
                throw new AppError(404, "Invited user not found.");
            }
        } else {
            invite = await ProgramInvite.findOne({
                where: { id: invite_id, invited_username: requester.username, status: "pending" },
                transaction
            });
            if (!invite) {
                await transaction.rollback();
                throw new AppError(404, "Invite not found or already processed.");
            }
            targetMember = requester;
        }

        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
            await invite.update({ status: "expired" }, { transaction });
            await transaction.commit();
            throw new AppError(400, "This invite has expired.");
        }

        const program = await Program.findByPk(invite.program_id, { transaction });
        const programName = program?.name || "the program";

        if (action === "accept") {
            const existingMembership = await ProgramMembership.findOne({
                where: { program_id: invite.program_id, member_id: targetMember.id },
                transaction
            });

            if (existingMembership) {
                if (existingMembership.status === "removed") {
                    await existingMembership.update({ status: "active", left_at: null }, { transaction });
                    await invite.update({ status: "accepted", uses_count: invite.uses_count + 1 }, { transaction });

                    const activeMemberIds = await getActiveProgramMemberIds(invite.program_id, transaction);
                    const recipientIds = activeMemberIds.filter((id) => id !== targetMember.id);
                    if (recipientIds.length > 0) {
                        await createNotification({
                            type: "program.member_joined",
                            programId: invite.program_id,
                            actorMemberId: targetMember.id,
                            title: "Member joined",
                            body: `${targetMember.member_name} joined ${programName}.`,
                            recipientIds,
                            transaction
                        });
                    }

                    await transaction.commit();
                    return {
                        message: isGlobalAdmin
                            ? `Invitation accepted. ${targetMember.member_name} has rejoined ${programName}. Previous data has been restored.`
                            : `Welcome back! You have rejoined ${programName}. Your previous data has been restored.`
                    };
                }

                await invite.update({ status: "accepted", uses_count: invite.uses_count + 1 }, { transaction });
                await transaction.commit();
                return {
                    message: isGlobalAdmin
                        ? `${targetMember.member_name} is already a member of ${programName}.`
                        : `You are already a member of ${programName}.`
                };
            }

            await ProgramMembership.create({
                program_id: invite.program_id,
                member_id: targetMember.id,
                role: "member",
                status: "active",
                joined_at: new Date()
            }, { transaction });

            await invite.update({ status: "accepted", uses_count: invite.uses_count + 1 }, { transaction });

            const activeMemberIds = await getActiveProgramMemberIds(invite.program_id, transaction);
            const recipientIds = activeMemberIds.filter((id) => id !== targetMember.id);
            if (recipientIds.length > 0) {
                await createNotification({
                    type: "program.member_joined",
                    programId: invite.program_id,
                    actorMemberId: targetMember.id,
                    title: "Member joined",
                    body: `${targetMember.member_name} joined ${programName}.`,
                    recipientIds,
                    transaction
                });
            }

            await transaction.commit();
            return {
                message: isGlobalAdmin
                    ? `Invitation accepted. ${targetMember.member_name} is now a member of ${programName}.`
                    : `Invitation accepted. You are now a member of ${programName}.`
            };
        }

        if (action === "decline") {
            await invite.update({ status: "declined" }, { transaction });

            if (block_future === true && targetMember) {
                await ProgramInviteBlock.findOrCreate({
                    where: { program_id: invite.program_id, member_id: targetMember.id },
                    defaults: { program_id: invite.program_id, member_id: targetMember.id },
                    transaction
                });
            }

            await transaction.commit();
            return {
                message: isGlobalAdmin
                    ? `Invitation to ${targetMember?.member_name || invite.invited_username} declined.`
                    : "Invitation declined."
            };
        }

        if (action === "revoke") {
            await invite.update({ status: "revoked" }, { transaction });
            await transaction.commit();
            return {
                message: `Invitation to ${targetMember?.member_name || invite.invited_username} has been revoked.`
            };
        }
    } catch (err) {
        if (err instanceof AppError) throw err;
        await transaction.rollback();
        throw new AppError(500, "Failed to process invite response.");
    }
}

module.exports = {
    getMyInvites,
    getAllInvites,
    respondToInvite
};
