// Auth service — the /api/auth/* business logic.
// MIGRATION DELTA (R1 / SPEC §7): credentials + tokens move to Supabase Auth; Express PROXIES it.
//   • login        → resolve identifier→member→primary email, then Supabase signInWithPassword.
//   • refresh      → Supabase refreshSession (Supabase owns refresh-token rotation; refresh_tokens retires).
//   • logout       → revoke the session via Supabase.
//   • register     → Supabase admin createUser + members + member_emails (+ backfill auth_user_id).
//   • changePass   → Supabase admin updateUserById.
//   • deleteAccount→ runs the cross-feature member-exit cascade (owned by program-memberships,
//                    SPEC D-C1) then deletes the Supabase auth user.
// Response shapes are preserved 1:1 so the web + iOS clients are unchanged (D-C3).
const { sequelize } = require("../config/database");
const { Member, MemberEmail, MemberPushToken } = require("../models");
const { supabaseAuth, supabaseAdmin, makeEphemeralAuthClient } = require("../config/supabase");
const { cascadeMemberDeletion } = require("../utils/programMemberships");
const { AppError } = require("../utils/response");

const formatMemberName = (member) => member?.member_name || "";

const normalizeEmail = (email) => (email || "").trim().toLowerCase();

// Loose, defensive email-shape check (the web client validates format inline; this is a backstop so
// we don't make a pointless Supabase call on obvious garbage). Existence is NEVER checked here.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Where the Supabase recovery email's link lands — our OWN web /reset-password page (R1: clients never
// embed Supabase; that page forwards the recovery token back through Express). Unset → Supabase falls
// back to its configured Site URL. The /reset-password page + POST /auth/reset-password land next run.
const passwordResetRedirectUrl = () => {
    const url = (process.env.PASSWORD_RESET_REDIRECT_URL || "").trim();
    return url || null;
};

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

// NET-NEW (auth SPEC D-C5, revised): self-service password recovery — RESET (consume) step via a typed
// 6-digit OTP CODE rather than a magic link. WHY the change: the recovery email's single-use link was
// being pre-fetched + consumed by email scanners (Microsoft Defender "Safe Links" on Outlook), so the
// user's click hit an already-used → "otp_expired" link. A code can't be "clicked" by a scanner, and with
// no link there's also no redirect to misconfigure. The forgot step is unchanged (resetPasswordForEmail);
// the "Reset Password" email template is edited in the Supabase dashboard to present {{ .Token }} (the
// code) instead of {{ .ConfirmationURL }}. Privacy-safe: a wrong/expired code 401s identically whether or
// not the email maps to an account (no enumeration). Clients never embed Supabase (R1) — this runs here.
async function resetPasswordWithOtp({ email, code, new_password }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !code || !new_password) {
        throw new AppError(400, "email, code, and new_password are required.");
    }

    const passwordError = validatePassword(new_password);
    if (passwordError) throw new AppError(400, passwordError);

    // Verify + consume the single-use recovery OTP. Any failure → a single generic 401.
    const { data, error } = await supabaseAuth.auth.verifyOtp({
        email: normalizedEmail,
        token: String(code).trim(),
        type: "recovery"
    });
    if (error || !data?.user) {
        throw new AppError(401, "Invalid or expired code.");
    }

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
        password: new_password
    });
    if (updateErr) throw new AppError(400, "Server error during password reset.");

    return { message: "Password reset successfully." };
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

// NET-NEW (auth SPEC / profile page): self-service email change. Has no legacy equivalent — email was
// fixed at registration. DIRECT change (no verification email, email_confirm:true) to stay consistent
// with register/createMember, and PASSWORD-CONFIRMED (re-auth the current password) since it is a
// sensitive account change. Email lives in BOTH Supabase auth.users AND member_emails (login resolves
// the member's email from member_emails), so both must move together. Compensating order mirrors
// register: do the Supabase update first, then the DB update, and best-effort revert Supabase if the DB
// write fails — so the two never drift. The current session JWT stays valid (sub/auth_user_id unchanged).
async function changeEmail(memberId, newEmailRaw, password) {
    const newEmail = normalizeEmail(newEmailRaw);
    if (!newEmail || !EMAIL_RE.test(newEmail)) {
        throw new AppError(400, "A valid email address is required.");
    }
    if (!password) throw new AppError(400, "Current password is required.");

    const member = await Member.findByPk(memberId);
    if (!member || !member.auth_user_id) throw new AppError(404, "Account not found.");

    // Re-auth: verify the current password against the member's current email.
    const currentEmail = await resolvePrimaryEmail(member.id);
    if (!currentEmail) throw new AppError(404, "Account email not found.");
    const { data: signInData, error: signInError } =
        await supabaseAuth.auth.signInWithPassword({ email: currentEmail, password });
    if (signInError || !signInData?.session) {
        throw new AppError(401, "Current password is incorrect.");
    }

    if (newEmail === currentEmail) {
        throw new AppError(400, "This is already your email.");
    }

    // Uniqueness: reject if the email belongs to a different member.
    const existingEmail = await MemberEmail.findOne({ where: { email: newEmail } });
    if (existingEmail && existingEmail.member_id !== member.id) {
        throw new AppError(400, "Email already in use.");
    }

    // Apply to Supabase first (email_confirm:true → no verification step, parity with register).
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(member.auth_user_id, {
        email: newEmail,
        email_confirm: true
    });
    if (updateErr) throw new AppError(400, "Email already in use.");

    // Then move the primary member_emails row. If this fails, revert Supabase so the two stay in sync.
    const primary = await MemberEmail.findOne({
        where: { member_id: member.id, is_primary: true }
    });
    const transaction = await sequelize.transaction();
    try {
        if (primary) {
            await primary.update({ email: newEmail }, { transaction });
        } else {
            await MemberEmail.create(
                { member_id: member.id, email: newEmail, is_primary: true },
                { transaction }
            );
        }
        await transaction.commit();
    } catch (err) {
        await transaction.rollback();
        try {
            await supabaseAdmin.auth.admin.updateUserById(member.auth_user_id, {
                email: currentEmail,
                email_confirm: true
            });
        } catch (_) { /* best-effort revert */ }
        throw new AppError(500, "Failed to update email.");
    }

    return { message: "Email updated successfully.", email: newEmail };
}

// NET-NEW (auth SPEC v0.3.0 / D-C4): self-service password recovery — request step. Privacy-safe by
// design (forgot-password page D-PLAN): ALWAYS returns the same generic 200 message, never revealing
// whether the email maps to an account (no enumeration). Supabase is asked to send the recovery email
// (it only does so when the email exists); any Supabase error is swallowed so nothing leaks. The reset
// itself runs through a separate POST /auth/reset-password (next run) — clients never embed Supabase (R1).
async function requestPasswordReset(emailRaw) {
    const email = normalizeEmail(emailRaw);
    if (email && EMAIL_RE.test(email)) {
        const redirectTo = passwordResetRedirectUrl();
        try {
            await supabaseAuth.auth.resetPasswordForEmail(
                email,
                redirectTo ? { redirectTo } : undefined
            );
        } catch (_) {
            // Swallow — never surface delivery/existence status to the caller.
        }
    }
    return { message: "If an account with that email exists, a password reset link has been sent." };
}

// WIRED (SPEC D-C1): faithful self-service account deletion. The DB-side cross-feature cascade (destroy
// outbound invites + actored notifications, run handleMemberExit per active membership/created program,
// notify remaining members, destroy the member) is single-sourced in
// utils/programMemberships.cascadeMemberDeletion — byte-identical to the legacy deleteMember body, hence
// shared. After the transaction commits we best-effort delete the Supabase auth user (the migration delta
// vs legacy). An orphaned auth.users row maps to no member, so post-commit deletion is the safe ordering.
async function deleteAccount(memberId) {
    const transaction = await sequelize.transaction();
    let authUserId = null;
    try {
        const member = await Member.findByPk(memberId, { transaction });
        if (!member) {
            await transaction.rollback();
            throw new AppError(404, "Account not found.");
        }
        if (member.global_role === "global_admin") {
            await transaction.rollback();
            throw new AppError(403, "Global admin accounts cannot be deleted through this endpoint.");
        }

        authUserId = member.auth_user_id;
        await cascadeMemberDeletion({ member, transaction });
        await transaction.commit();
    } catch (err) {
        if (err instanceof AppError) throw err;
        await transaction.rollback();
        throw err;
    }

    if (authUserId) {
        try { await supabaseAdmin.auth.admin.deleteUser(authUserId); } catch (_) { /* best-effort */ }
    }

    return { message: "Account deleted successfully." };
}

module.exports = {
    loginLegacy,
    loginGlobal,
    refreshAccessToken,
    logout,
    register,
    changePassword,
    resetPasswordWithOtp,
    changeEmail,
    requestPasswordReset,
    deleteAccount,
    upsertPushToken,
    removePushToken,
    // shared auth-policy helpers (reused by memberService.createMember — SPEC members §7 / D-C2,
    // so the password policy + email normalization are single-sourced).
    validatePassword,
    normalizeEmail
};
