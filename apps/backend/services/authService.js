// Auth service — the /api/auth/* business logic.
// MIGRATION DELTA (R1 / SPEC §7): credentials + tokens move to Supabase Auth; Express PROXIES it.
//   • login        → resolve identifier→member→primary email, then Supabase signInWithPassword.
//   • refresh      → Supabase refreshSession (Supabase owns refresh-token rotation; refresh_tokens retires).
//   • logout       → revoke the session via Supabase.
//   • register     → Supabase admin createUser + members + member_emails (+ backfill auth_user_id).
//   • changePass   → Supabase admin updateUserById.
//   • deleteAccount→ DEFERRED: the cross-feature cascade is owned by program-memberships/notifications
//                    (SPEC D-C1) and is wired when those features are ported.
// Response shapes are preserved 1:1 so the web + iOS clients are unchanged (D-C3).
const { sequelize } = require("../config/database");
const { Member, MemberEmail, MemberPushToken } = require("../models");
const { supabaseAuth, supabaseAdmin, makeEphemeralAuthClient } = require("../config/supabase");
const { AppError } = require("../utils/response");

const formatMemberName = (member) => member?.member_name || "";

const normalizeEmail = (email) => (email || "").trim().toLowerCase();

// Resolve a member from a username OR email (faithful to legacy resolveMemberByIdentifier):
// exact username match first, then normalized-email lookup via member_emails.
const resolveMemberByIdentifier = async (identifier) => {
    const trimmed = (identifier || "").trim();
    if (!trimmed) return null;

    const memberByUsername = await Member.findOne({ where: { username: trimmed } });
    if (memberByUsername) return memberByUsername;

    const email = normalizeEmail(trimmed);
    const memberEmail = await MemberEmail.findOne({
        where: { email },
        include: [{ model: Member }]
    });
    return memberEmail?.Member || null;
};

// The email Supabase Auth knows the member by (the imported primary email; admin uses the placeholder).
const resolvePrimaryEmail = async (memberId) => {
    const primary = await MemberEmail.findOne({
        where: { member_id: memberId, is_primary: true }
    });
    if (primary) return primary.email;
    const any = await MemberEmail.findOne({ where: { member_id: memberId } });
    return any?.email || null;
};

const validatePassword = (password) => {
    if (!password || password.length < 8) {
        return "Password must be at least 8 characters long.";
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
        return "Password must include upper, lower, and a number.";
    }
    return null;
};

// Sign in to Supabase with the member's known email + the supplied password.
const supabaseSignIn = async (member, password) => {
    const email = await resolvePrimaryEmail(member.id);
    if (!email) throw new AppError(401, "Invalid credentials");
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error || !data?.session) throw new AppError(401, "Invalid credentials");
    return data.session;
};

async function upsertPushToken(memberId, deviceToken, deviceId = null) {
    const platform = "ios";
    const existing = await MemberPushToken.findOne({
        where: { device_token: deviceToken }
    });
    const now = new Date();
    if (existing) {
        await existing.update({
            member_id: memberId,
            device_id: deviceId ?? existing.device_id,
            updated_at: now
        });
        return;
    }
    await MemberPushToken.create({
        member_id: memberId,
        device_token: deviceToken,
        platform,
        device_id: deviceId,
        created_at: now,
        updated_at: now
    });
}

async function removePushToken(memberId, deviceToken = null) {
    const where = { member_id: memberId };
    if (deviceToken && typeof deviceToken === "string" && deviceToken.trim()) {
        where.device_token = deviceToken.trim();
    }
    await MemberPushToken.destroy({ where });
}

async function loginLegacy(identifier, password) {
    const member = await resolveMemberByIdentifier(identifier);
    if (!member) throw new AppError(401, "Invalid credentials");

    const session = await supabaseSignIn(member, password);

    return {
        token: session.access_token,
        refresh_token: session.refresh_token,
        username: member.username,
        role: member.global_role === "global_admin" ? "admin" : "member",
        member_name: formatMemberName(member),
        date_joined: member.date_joined,
        message: "Login successful!"
    };
}

async function loginGlobal(identifier, password, options = {}) {
    const member = await resolveMemberByIdentifier(identifier);
    if (!member) throw new AppError(401, "Invalid credentials");

    const session = await supabaseSignIn(member, password);
    const globalRole = member.global_role || "standard";

    const { push_token: pushToken, device_id: deviceId } = options;
    if (pushToken && typeof pushToken === "string" && pushToken.trim()) {
        await upsertPushToken(member.id, pushToken.trim(), deviceId);
    }

    return {
        token: session.access_token,
        refresh_token: session.refresh_token,
        member_id: member.id,
        username: member.username,
        member_name: formatMemberName(member),
        global_role: globalRole,
        message: "Login successful"
    };
}

async function refreshAccessToken(refreshTokenRaw) {
    if (!refreshTokenRaw) throw new AppError(400, "Refresh token required");

    const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshTokenRaw });
    if (error || !data?.session) {
        throw new AppError(401, "Invalid refresh token");
    }

    return {
        token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        message: "Token refreshed"
    };
}

async function logout(refreshTokenRaw) {
    if (!refreshTokenRaw) throw new AppError(400, "Refresh token required");

    // Best-effort revoke (idempotent, faithful to legacy logout): establish the session from the
    // supplied refresh token on a throwaway client, then sign it out. Swallow errors (an
    // already-invalid token is a no-op).
    try {
        const client = makeEphemeralAuthClient();
        const { data, error } = await client.auth.refreshSession({ refresh_token: refreshTokenRaw });
        if (!error && data?.session) {
            await client.auth.signOut();
        }
    } catch (_) {
        // no-op
    }

    return { message: "Logged out" };
}

async function register({ username, password, first_name, last_name, email, gender }) {
    if (!username || !password || !first_name || !last_name || !email) {
        throw new AppError(400, "username, password, first_name, last_name, and email are required.");
    }

    const passwordError = validatePassword(password);
    if (passwordError) throw new AppError(400, passwordError);

    const normalizedEmail = normalizeEmail(email);

    // Uniqueness checks first (avoid orphaning a Supabase auth user on the common failure).
    const existingMember = await Member.findOne({ where: { username } });
    if (existingMember) throw new AppError(400, "Username already exists");

    const existingEmail = await MemberEmail.findOne({ where: { email: normalizedEmail } });
    if (existingEmail) throw new AppError(400, "Email already exists");

    // Create the Supabase Auth user (it owns the password). email_confirm:true keeps parity with the
    // legacy flow (no verification step existed — SPEC §10 F3).
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true
    });
    if (createErr || !created?.user) {
        throw new AppError(400, "Email already exists");
    }
    const authUserId = created.user.id;

    // Create the member + email rows, linked to the auth user. Compensate (delete the auth user) if
    // the DB transaction fails, so we never orphan an auth identity.
    const transaction = await sequelize.transaction();
    try {
        const newMember = await Member.create({
            username,
            first_name,
            last_name,
            gender: gender || null,
            auth_user_id: authUserId
        }, { transaction });

        await MemberEmail.create({
            member_id: newMember.id,
            email: normalizedEmail,
            is_primary: true
        }, { transaction });

        await transaction.commit();

        return {
            message: "Account created successfully",
            member_id: newMember.id,
            username: newMember.username,
            member_name: formatMemberName(newMember)
        };
    } catch (err) {
        await transaction.rollback();
        try { await supabaseAdmin.auth.admin.deleteUser(authUserId); } catch (_) { /* best-effort */ }
        if (err instanceof AppError) throw err;
        throw err;
    }
}

async function changePassword(memberId, newPassword) {
    if (!newPassword) throw new AppError(400, "new_password is required.");

    const passwordError = validatePassword(newPassword);
    if (passwordError) throw new AppError(400, passwordError);

    const member = await Member.findByPk(memberId);
    if (!member || !member.auth_user_id) throw new AppError(404, "Credentials not found.");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(member.auth_user_id, {
        password: newPassword
    });
    if (error) throw new AppError(400, "Server error during password change.");

    return { message: "Password changed successfully." };
}

async function deleteAccount(_memberId) {
    // DEFERRED (SPEC D-C1): faithful account deletion runs a cross-feature cascade — delete the
    // member's program_invites + notifications, run handleMemberExit for every active membership and
    // created program (reassign created_by / delete empty programs / notify remaining members), then
    // destroy the member AND the Supabase auth user. That cascade is owned by the program-memberships
    // + notifications features and is wired here once they are ported. Until then this endpoint is a
    // documented temporary gap rather than a partial (and unsafe) delete. See PROGRESS.md.
    throw new AppError(501, "Account deletion is not available yet in this rebuild.");
}

module.exports = {
    loginLegacy,
    loginGlobal,
    refreshAccessToken,
    logout,
    register,
    changePassword,
    deleteAccount,
    upsertPushToken,
    removePushToken,
    // shared auth-policy helpers (reused by memberService.createMember — SPEC members §7 / D-C2,
    // so the password policy + email normalization are single-sourced).
    validatePassword,
    normalizeEmail
};
