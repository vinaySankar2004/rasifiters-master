// Member service — the /api/members business logic.
// See specs/features/members/SPEC.md. FAITHFUL to legacy services/memberService.js EXCEPT createMember
// (§7 / D-C2): legacy createMember destructured `password` but never persisted it and wrote no email,
// leaving a profile that could never authenticate. The rebuild requires an explicit `email` and
// provisions a real Supabase Auth user (mirroring authService.register) so admin-created members can
// log in. getAllMembers additionally EXCLUDES the migration-added auth_user_id column to preserve the
// exact legacy response shape (D-S1). deleteMember is DEFERRED → 501 (D-C1): its cross-feature cascade
// (invites/notifications/membership-exit) is owned by those features + wired when they are ported.
const { Member, MemberEmail } = require("../models");
const { sequelize } = require("../config/database");
const { supabaseAdmin } = require("../config/supabase");
const { validatePassword, normalizeEmail } = require("./authService");
const { cascadeMemberDeletion } = require("../utils/programMemberships");
const { AppError } = require("../utils/response");

async function getAllMembers() {
    return Member.findAll({
        where: { global_role: "standard" },
        order: [["first_name", "ASC"]],
        // exclude the migration-added auth_user_id so the response matches the legacy shape (D-S1).
        attributes: { exclude: ["auth_user_id"] }
    });
}

async function getMemberById(memberId) {
    const member = await Member.findByPk(memberId);
    if (!member) throw new AppError(404, "Member not found.");

    // Surface the primary email (read-only here; changing it goes through PUT /auth/email, not the
    // updateMember whitelist — SPEC members F6). Email lives in member_emails, not the members row.
    const primaryEmail = await MemberEmail.findOne({
        where: { member_id: memberId, is_primary: true }
    });

    return {
        id: member.id,
        member_name: member.member_name,
        username: member.username,
        gender: member.gender,
        email: primaryEmail?.email ?? null,
        date_joined: member.date_joined,
        global_role: member.global_role,
        created_at: member.created_at,
        updated_at: member.updated_at
    };
}

// CHANGED (§7 / D-C2): create a LOGINABLE member. Requires an explicit `email`; provisions a Supabase
// Auth user + primary member_emails row + backfills auth_user_id. The 201 response shape is unchanged.
async function createMember({ member_name, gender, email, password }) {
    if (!member_name || !password || !email) {
        throw new AppError(400, "member_name, email, and password are required.");
    }

    const passwordError = validatePassword(password);
    if (passwordError) throw new AppError(400, passwordError);

    const username = member_name.toLowerCase().replace(/\s+/g, "");
    const normalizedEmail = normalizeEmail(email);

    // Uniqueness checks first (avoid orphaning a Supabase auth user on the common failure).
    const existingMember = await Member.findOne({ where: { username } });
    if (existingMember) throw new AppError(400, "A user with this username already exists.");

    const existingEmail = await MemberEmail.findOne({ where: { email: normalizedEmail } });
    if (existingEmail) throw new AppError(400, "A user with this email already exists.");

    // Create the Supabase Auth user (it owns the password); email_confirm:true keeps parity with the
    // no-verification legacy flow (auth SPEC §10 F3).
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true
    });
    if (createErr || !created?.user) {
        throw new AppError(400, "A user with this email already exists.");
    }
    const authUserId = created.user.id;

    // Create member + primary email, linked to the auth user. Compensate (delete the auth user) if the
    // DB transaction fails, so we never orphan an auth identity.
    const transaction = await sequelize.transaction();
    try {
        const newMember = await Member.create(
            { member_name, username, gender: gender || null, auth_user_id: authUserId },
            { transaction }
        );

        await MemberEmail.create(
            { member_id: newMember.id, email: normalizedEmail, is_primary: true },
            { transaction }
        );

        await transaction.commit();

        return {
            id: newMember.id,
            member_name: newMember.member_name,
            username: newMember.username,
            gender: newMember.gender,
            date_joined: newMember.date_joined,
            global_role: newMember.global_role
        };
    } catch (err) {
        await transaction.rollback();
        try { await supabaseAdmin.auth.admin.deleteUser(authUserId); } catch (_) { /* best-effort */ }
        if (err instanceof AppError) throw err;
        throw new AppError(500, "Failed to add member.");
    }
}

async function updateMember(memberId, { first_name, last_name, gender }, requester) {
    const transaction = await sequelize.transaction();
    try {
        const member = await Member.findByPk(memberId, { transaction });
        if (!member) {
            await transaction.rollback();
            throw new AppError(404, "Member not found.");
        }

        const isOwnProfile = requester.id === member.id;
        const isGlobalAdmin = requester.global_role === "global_admin";
        if (!isOwnProfile && !isGlobalAdmin) {
            await transaction.rollback();
            throw new AppError(403, "You can only update your own profile.");
        }

        const updateData = {};
        if (first_name !== undefined) updateData.first_name = first_name.trim();
        if (last_name !== undefined) updateData.last_name = last_name.trim();
        if (gender !== undefined) updateData.gender = gender;

        await member.update(updateData, { transaction });
        await transaction.commit();

        return {
            message: "Profile updated successfully.",
            member_name: member.member_name,
            first_name: member.first_name,
            last_name: member.last_name
        };
    } catch (err) {
        if (err instanceof AppError) throw err;
        await transaction.rollback();
        throw new AppError(500, "Failed to update member.");
    }
}

// WIRED (§7 / D-C1): faithful member deletion runs the cross-feature cascade now that
// program-memberships/invites/notifications are ported. The DB-side cascade (destroy outbound invites +
// actored notifications, run handleMemberExit per active membership/created program, notify remaining
// members, destroy the member) is single-sourced in utils/programMemberships.cascadeMemberDeletion (it is
// owned by program-memberships). After the transaction commits we best-effort delete the Supabase auth
// user — the migration delta vs legacy (auth.users replaces member_credentials). An orphaned auth.users
// row maps to no member, so post-commit deletion is the safe ordering.
async function deleteMember(memberId) {
    const transaction = await sequelize.transaction();
    let authUserId = null;
    try {
        const member = await Member.findByPk(memberId, { transaction });
        if (!member) {
            await transaction.rollback();
            throw new AppError(404, "Member not found.");
        }
        if (member.global_role === "global_admin") {
            await transaction.rollback();
            throw new AppError(403, "Cannot delete global admin account.");
        }

        authUserId = member.auth_user_id;
        await cascadeMemberDeletion({ member, transaction });
        await transaction.commit();
    } catch (err) {
        if (err instanceof AppError) throw err;
        await transaction.rollback();
        throw new AppError(500, "Failed to delete member.");
    }

    if (authUserId) {
        try { await supabaseAdmin.auth.admin.deleteUser(authUserId); } catch (_) { /* best-effort */ }
    }

    return { message: "Member deleted successfully." };
}

module.exports = {
    getAllMembers,
    getMemberById,
    createMember,
    updateMember,
    deleteMember
};
