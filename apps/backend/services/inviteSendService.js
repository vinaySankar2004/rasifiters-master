// POST /invite — sendInvite (invites SPEC §4, 0.2.0), split out of inviteService.js (it was 334 lines). Faithful authz
// + privacy-safe no-op chain, EXCEPT:
//   D-C4 — the write is ONE managed transaction: supersede an expired pending invite, create the invite, write its
//          program.invite_received notification (createNotification dispatches SSE/push afterCommit).
//   D-C5 — every no-op returns its reason; routes/invites.js logs it and still answers "Invitation sent".
//   D-C6 — a non-string username / non-UUID program_id is a 400 (both used to be swallowed 200s).
const crypto = require("crypto");
const { Member, Program, ProgramMembership, ProgramInvite, ProgramInviteBlock } = require("../models");
const { sequelize } = require("../config/database");
const { AppError } = require("../utils/response");
const { createNotification } = require("../utils/notifications");

const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // F6: hard-coded 30-day expiry (faithful)
const PENDING_INVITE_INDEX = "uniq_program_invites_program_username_pending"; // sql/001_schema.sql:277
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const noop = (reason) => ({ sent: false, reason });

// A concurrent send for the same username won the partial unique index — the same no-op as an existing invite.
const isPendingInviteRace = (err) =>
    err?.parent?.code === "23505" && err.parent.constraint === PENDING_INVITE_INDEX;

async function sendInvite({ program_id, username } = {}, requester) {
    if (typeof program_id !== "string" || !UUID_RE.test(program_id) || typeof username !== "string" || !username) {
        throw new AppError(400, "program_id and username are required.");
    }

    const isGlobalAdmin = requester?.global_role === "global_admin";
    if (!isGlobalAdmin) {
        const pm = await ProgramMembership.findOne({
            where: { program_id, member_id: requester?.id, role: "admin", status: "active" }
        });
        if (!pm) throw new AppError(403, "Admin privileges required for this program.");
    }

    const program = await Program.findOne({ where: { id: program_id, is_deleted: false } });
    if (!program) return noop("program_not_found");

    const normalizedUsername = username.trim().toLowerCase();
    const targetMember = await Member.findOne({
        where: sequelize.where(sequelize.fn("LOWER", sequelize.col("username")), normalizedUsername)
    });
    if (!targetMember) return noop("unknown_username");

    const existingMembership = await ProgramMembership.findOne({
        where: { program_id, member_id: targetMember.id }
    });
    if (existingMembership && existingMembership.status !== "removed") return noop("already_member");

    const blocked = await ProgramInviteBlock.findOne({
        where: { program_id, member_id: targetMember.id }
    });
    if (blocked) return noop("blocked");

    const existingInvite = await ProgramInvite.findOne({
        where: { program_id, invited_username: targetMember.username, status: "pending" }
    });
    const isExpired = existingInvite?.expires_at && new Date(existingInvite.expires_at) < new Date();
    if (existingInvite && !isExpired) return noop("pending_invite");

    try {
        await sequelize.transaction(async (transaction) => {
            if (existingInvite) await existingInvite.update({ status: "expired" }, { transaction });
            await ProgramInvite.create({
                program_id,
                invited_by: requester.id,
                invited_username: targetMember.username,
                token_hash: crypto.randomBytes(32).toString("hex"),
                status: "pending",
                max_uses: 1,
                uses_count: 0,
                expires_at: new Date(Date.now() + INVITE_TTL_MS)
            }, { transaction });
            await createNotification({
                type: "program.invite_received",
                programId: program_id,
                actorMemberId: requester?.id || null,
                title: "Program invitation",
                body: `You've been invited to join ${program.name}.`,
                recipientIds: [targetMember.id],
                transaction
            });
        });
    } catch (err) {
        if (isPendingInviteRace(err)) return noop("pending_invite");
        throw err;
    }

    return { sent: true, reason: null };
}

module.exports = { sendInvite };
