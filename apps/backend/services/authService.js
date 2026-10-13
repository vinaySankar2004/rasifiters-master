// Auth service — the /api/auth/* business logic.
// MIGRATION DELTA (R1 / SPEC §7): credentials + tokens move to Supabase Auth; Express PROXIES it.
//   • login        → resolve identifier→member→primary email, then Supabase signInWithPassword.
//   • refresh      → ONE direct, 5 s-timed, never-retried POST to Supabase's /token endpoint
//                    (services/supabaseTokenRefresh.js — SPEC D-C11; Supabase owns rotation; refresh_tokens retires).
//   • sign-in/oauth/re-auth/recovery → a FRESH per-request client (makeRequestAuthClient — D-C11) that carries
//                    the caller's IP as Sb-Forwarded-For with the secret key (D-C14 per-user rate limits).
//   • logout / sign out everywhere / own-password change / link / unlink → services/authSessionService.js
//                    (D-C14: direct GoTrue calls with the user's own access token — no SDK session).
//   • failures     → Supabase / Google / network trouble = 503 auth_unavailable (D-C15), never a credential error.
//   • register     → Supabase admin createUser + members + member_emails (+ backfill auth_user_id).
//   • changePass   → GoTrue PUT /user with the member's own Bearer (ends the OTHER sessions — D-C14);
//                    resetPassword (recovery step, authSessionService) → admin updateUserById (ends EVERY session).
//   • deleteAccount→ runs the cross-feature member-exit cascade (owned by program-memberships,
//                    SPEC D-C1) then deletes the Supabase auth user.
//   • staging      → utils/stagingGuard (APP_ENV=staging only): login-level changes only for +stg accounts,
//                    no reset mail to other addresses (SPEC D-C13). No-ops in prod.
// Response shapes are preserved 1:1 so the web + iOS clients are unchanged (D-C3).
const { sequelize } = require("../config/database");
const { Member, MemberEmail, MemberPushToken } = require("../models");
const { supabaseAdmin, makeRequestAuthClient, AUTH_HTTP_TIMEOUT_MS } = require("../config/supabase");
const {
    exchangeRefreshToken,
    authUnavailableFor,
    isTransientAuthError,
    classifyVerifiedCall,
    readErrorMessage,
    OAUTH_UNAVAILABLE_CODES
} = require("./supabaseTokenRefresh");
const {
    linkIdToken,
    deleteIdentity,
    updateOwnPassword,
    assertStagingUser,
    discardSession,
    revertAuthEmail
} = require("./authSessionService");
const { cascadeMemberDeletion } = require("../utils/programMemberships");
const { AppError } = require("../utils/response");
const { isStaging, assertStagingAccount, mayEmailFromHere } = require("../utils/stagingGuard");

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

// Sign in to Supabase with the member's known email + the supplied password. D-C15: a Supabase / network failure is
// 503 auth_unavailable — only a real rejection is "Invalid credentials".
const supabaseSignIn = async (member, password, ip) => {
    const email = await resolvePrimaryEmail(member.id);
    if (!email) throw new AppError(401, "Invalid credentials");
    const { data, error } = await makeRequestAuthClient(ip).auth.signInWithPassword({ email, password });
    if (isTransientAuthError(error)) throw authUnavailableFor("[login]", error);
    if (error || !data?.session) throw new AppError(401, "Invalid credentials");
    return data.session;
};

// notifications 0.4.0 (D-C11): the device registry lives in services/deviceService.js — one row per installation,
// last_seen_at on every registration, an omitted platform → "ios" for a NEW row only (the live iOS binary sends
// none). These two wrappers keep the exports and the login / OAuth callers (loginGlobal, socialSignIn) unchanged.
const deviceService = require("./deviceService");

async function upsertPushToken(memberId, deviceToken, deviceId = null, platform = null) {
    await deviceService.registerDevice({ memberId, pushToken: deviceToken, deviceId, platform });
}

async function removePushToken(memberId, deviceToken = null) {
    await deviceService.unregisterMemberDevices(memberId, deviceToken);
}

async function loginLegacy(identifier, password, ip = null) {
    const member = await resolveMemberByIdentifier(identifier);
    if (!member) throw new AppError(401, "Invalid credentials");

    const session = await supabaseSignIn(member, password, ip);

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

    const session = await supabaseSignIn(member, password, options.ip);
    const globalRole = member.global_role || "standard";

    const { push_token: pushToken, device_id: deviceId, platform } = options;
    if (pushToken && typeof pushToken === "string" && pushToken.trim()) {
        await upsertPushToken(member.id, pushToken.trim(), deviceId, platform);
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

async function refreshAccessToken(refreshTokenRaw, ip = null) {
    if (!refreshTokenRaw) throw new AppError(400, "Refresh token required");

    // D-C11: one direct, timed, never-retried token-endpoint call — no shared SDK session machinery. Throws
    // AppError 401 {code:"session_invalid"} or 503 {code:"auth_unavailable", retryAfter} (see routes/auth.js).
    // D-C14: the caller's IP rides along as Sb-Forwarded-For (per-user rate limits).
    const session = await exchangeRefreshToken(refreshTokenRaw, ip);

    // Shape is contract (live iOS/Android/web): exactly { token, refresh_token, message }, in this order.
    return {
        token: session.access_token,
        refresh_token: session.refresh_token,
        message: "Token refreshed"
    };
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
    if (isTransientAuthError(createErr)) throw authUnavailableFor("[register]", createErr);
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

// ---- NET-NEW (SPEC v0.7.0 / D-C8, D-C9): federated (Google/Apple) sign-in ---------------------
// R1-preserving: the CLIENT gets the provider id_token from its native SDK (GSI / Credential Manager /
// ASAuthorization) and POSTs it here; the backend exchanges it via Supabase signInWithIdToken — clients
// NEVER embed Supabase. socialSignIn returns the SAME AuthResponse shape as loginGlobal for an existing
// member (by auth_user_id, else by verified provider email → link if unlinked), or { needs_profile:true,
// prefill, pending session } for a brand-new social user (→ completeSocialRegistration, no password step).
// NOTE: signInWithIdToken uses the per-request client (secret key when set, else anon — D-C14); new-user sign-up stays
// gated by the project "Allow new users to sign up" toggle (unlike register()'s admin.createUser, which bypasses it).
// Exchange a Google OAuth 2.0 authorization code (web auth-code / popup flow, redirect_uri "postmessage")
// for an id_token. WEB uses this flow so it can render its OWN "Continue with Google" button — GSI's
// id_token flow forces Google's branded widget. The browser never holds the client secret (R1: the
// exchange stays server-side). Requires GOOGLE_WEB_CLIENT_SECRET (a real secret — Render env, uncommitted).
async function exchangeGoogleAuthCode(code, rejectStatus = 401) {
    const clientId = process.env.GOOGLE_WEB_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_WEB_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new AppError(500, "Google web sign-in is not configured.");
    let res;
    try {
        res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: "postmessage",
                grant_type: "authorization_code"
            }),
            signal: AbortSignal.timeout(AUTH_HTTP_TIMEOUT_MS) // D-C11
        });
    } catch (err) {
        // D-C15: a timeout / network error reaching Google is 503 auth_unavailable (was 502 "Could not reach Google.").
        throw authUnavailableFor("[google]", err);
    }
    const body = await res.json().catch(() => ({}));
    // D-C15: Google throttling or failing (429 / 5xx, or an OAuth-style server_error / temporarily_unavailable at 400),
    // or a 200 without an id_token (incl. a stalled body), is not the user's fault → 503.
    if (res.status === 429 || res.status >= 500 || (res.ok && !body.id_token) || OAUTH_UNAVAILABLE_CODES.has(body.error)) {
        throw authUnavailableFor("[google]", { status: res.status });
    }
    // A rejected code (expired / reused / wrong client): 401 on /oauth (unchanged); 400 on the authenticated /link
    // (D-C15d — a 401 there reads as an ended session).
    if (!res.ok) throw new AppError(rejectStatus, "Google authorization failed.");
    return body.id_token;
}

// ---- NET-NEW (SPEC v0.9.0 / D-C10): auth phase-2 — link/unlink provider identities in account settings.
// R1-preserving: the CLIENT obtains the provider token exactly like /oauth (native id_token, or a web Google
// auth `code`) and POSTs to these AUTHENTICATED routes. D-C14: link = GoTrue's link grant
// (POST /token?grant_type=id_token, link_identity:true) and unlink = DELETE /user/identities/{id}, both called
// directly with the caller's verified access token (services/authSessionService.js) — no SDK session, no rotation.
// The identity attaches to the member's EXISTING auth user — NO same-email auto-link toggle, so /oauth's D-C8 409
// stays intact. Both require Supabase "Manual linking".
const providerLabel = (p) => (p === "google" ? "Google" : p === "apple" ? "Apple" : "Email");

// GoTrue answers a link of an identity that is ALREADY on the target user with 422 identity_already_exists
// ("Identity is already linked"); one that belongs to someone else says so ("… linked to another user") → 409.
const isOwnIdentityRelink = (res) =>
    res.code === "identity_already_exists" && !/another|different|other user/i.test(readErrorMessage(res.body));

// Normalized identity view for the clients. GoTrue exposes each sign-in method as an identity row; the
// email/password credential is the "email" provider. has_password is derived robustly (identity row and/or
// app_metadata.providers) so it stays consistent across GoTrue versions.
function buildIdentitiesResponse(user, opts = {}) {
    const rawIdentities = user?.identities || [];
    const providers = user?.app_metadata?.providers || [];
    const identities = rawIdentities.map((i) => ({
        provider: i.provider,
        email: i.identity_data?.email || null
    }));
    const hasPassword =
        opts.forcePassword === true ||
        identities.some((i) => i.provider === "email") ||
        providers.includes("email");
    return { identities, has_password: hasPassword };
}

async function getAuthUser(memberId) {
    const member = await Member.findByPk(memberId);
    if (!member || !member.auth_user_id) throw new AppError(404, "Account not found.");
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(member.auth_user_id);
    if (isTransientAuthError(error)) throw authUnavailableFor("[auth-user]", error);
    if (error || !data?.user) throw new AppError(404, "Account not found.");
    return { member, user: data.user };
}

async function listIdentities(memberId) {
    const { user } = await getAuthUser(memberId);
    return buildIdentitiesResponse(user);
}

async function linkProvider(memberId, { provider, id_token, nonce, code, accessToken, ip }) {
    const allowed = ["google", "apple"];
    if (!provider || !allowed.includes(provider)) throw new AppError(400, "Unsupported provider.");
    if (!accessToken) throw new AppError(400, "Session required to link an account.");

    // WEB sends a one-time Google auth `code` (custom-button flow) → exchange for an id_token here. A rejected code is
    // 400 on this authenticated route (D-C15d).
    if (!id_token && code) {
        if (provider !== "google") throw new AppError(400, "Auth-code exchange is Google-only.");
        id_token = await exchangeGoogleAuthCode(code, 400);
    }
    if (!id_token) throw new AppError(400, "Missing provider token.");

    const { member, user } = await getAuthUser(memberId);
    assertStagingAccount(user.email); // staging only (SPEC D-C13) — never re-bind a real login's identities

    // D-C14 (resolves F13): the link grant straight to GoTrue with the caller's verified access token — no SDK session,
    // so no hidden refresh-token rotation. The new session GoTrue answers with is ended (discardSession).
    const res = await linkIdToken(accessToken, { provider, idToken: id_token, nonce }, ip);
    const outcome = classifyVerifiedCall(res);
    if (outcome === "unavailable") throw authUnavailableFor("[link]", res);
    if (outcome === "session") throw new AppError(401, "Session expired. Sign in again to manage linked accounts.");
    if (outcome === "rejected" && isOwnIdentityRelink(res)) {
        // A retry of a link that already landed (e.g. the client timed out): the identity is on THIS user — success.
        console.warn("[linkProvider] provider=%s already linked to this account — answered as linked", provider);
    } else if (outcome === "rejected") {
        const msg = readErrorMessage(res.body);
        console.error("[linkProvider] provider=%s rejected — code=%s status=%s msg=%s",
            provider, res.code, res.status, msg);
        const lower = msg.toLowerCase();
        if (lower.includes("already") || lower.includes("exists") || res.status === 422) {
            throw new AppError(409, `That ${providerLabel(provider)} account is already linked to a different account.`);
        }
        if (res.code === "manual_linking_disabled" || lower.includes("manual linking") ||
            lower.includes("not enabled") || lower.includes("disabled")) {
            throw new AppError(400, "Account linking is not available right now.");
        }
        // D-C15d: 400 (was 401) — the provider token was refused, not the session.
        throw new AppError(400, msg ? `Link failed: ${msg}` : "Could not link that account.");
    } else {
        await discardSession(res.body?.access_token, ip);
    }

    const { data: refreshed } = await supabaseAdmin.auth.admin.getUserById(member.auth_user_id);
    return { message: `${providerLabel(provider)} account linked.`, ...buildIdentitiesResponse(refreshed?.user) };
}

async function unlinkProvider(memberId, { provider, accessToken, ip }) {
    const allowed = ["google", "apple"];
    if (!provider || !allowed.includes(provider)) throw new AppError(400, "Unsupported provider.");
    if (!accessToken) throw new AppError(400, "Session required to unlink.");

    const { member, user } = await getAuthUser(memberId);
    assertStagingAccount(user.email); // staging only (SPEC D-C13)
    const identities = user.identities || [];
    const target = identities.find((i) => i.provider === provider);
    if (!target) throw new AppError(400, `No ${providerLabel(provider)} account is linked.`);

    // Guard: never strip the member's last usable sign-in method. Password counts once (whether or not GoTrue
    // materialized an "email" identity row); federated identities count individually.
    const federatedCount = identities.filter((i) => i.provider !== "email").length;
    const hasPassword = buildIdentitiesResponse(user).has_password;
    const remaining = (federatedCount - 1) + (hasPassword ? 1 : 0);
    if (remaining < 1) throw new AppError(400, "You can't remove your only sign-in method.");

    // D-C14 (resolves F13): DELETE /user/identities/{id} with the caller's verified access token — no SDK session.
    const res = await deleteIdentity(accessToken, target.identity_id, ip);
    const outcome = classifyVerifiedCall(res);
    if (outcome === "unavailable") throw authUnavailableFor("[unlink]", res);
    if (outcome === "session") throw new AppError(401, "Session expired. Sign in again to manage linked accounts.");
    if (outcome === "rejected") throw new AppError(400, readErrorMessage(res.body) || "Could not unlink that account.");

    const { data: refreshed } = await supabaseAdmin.auth.admin.getUserById(member.auth_user_id);
    return { message: `${providerLabel(provider)} account unlinked.`, ...buildIdentitiesResponse(refreshed?.user) };
}

// D-C14b: GoTrue PUT /user with the caller's Bearer — the member's OTHER sessions end, this one stays. (Before 0.13.0
// this was the admin update, which ends EVERY session, this one included.)
async function setPassword(memberId, newPassword, { accessToken = null, ip = null } = {}) {
    const passwordError = validatePassword(newPassword);
    if (passwordError) throw new AppError(400, passwordError);
    const { member, user } = await getAuthUser(memberId);
    assertStagingAccount(user.email); // staging only (SPEC D-C13) — PUT /user bypasses the admin guard
    await updateOwnPassword(accessToken, newPassword, ip, "Could not set password.");
    const { data: refreshed } = await supabaseAdmin.auth.admin.getUserById(member.auth_user_id);
    // Authoritative: we just set the password, so has_password is true regardless of whether GoTrue surfaced
    // an "email" identity row (login via signInWithPassword works on encrypted_password directly).
    return { message: "Password set successfully.", ...buildIdentitiesResponse(refreshed?.user, { forcePassword: true }) };
}

async function socialSignIn({ provider, id_token, nonce, first_name, last_name, code }, options = {}) {
    const allowed = ["google", "apple"];
    if (!provider || !allowed.includes(provider)) throw new AppError(400, "Unsupported provider.");

    // WEB sends a one-time auth `code` (custom-button auth-code flow); exchange it for an id_token here.
    // Native mobile (GoogleSignIn / Credential Manager / ASAuthorization) keeps sending id_token directly.
    if (!id_token && code) {
        if (provider !== "google") throw new AppError(400, "Auth-code exchange is Google-only.");
        id_token = await exchangeGoogleAuthCode(code);
    }
    if (!id_token) throw new AppError(400, "Missing provider token.");

    const { data, error } = await makeRequestAuthClient(options.ip).auth.signInWithIdToken({
        provider,
        token: id_token,
        ...(nonce ? { nonce } : {})
    });
    if (isTransientAuthError(error)) throw authUnavailableFor("[socialSignIn]", error);
    if (error || !data?.session || !data?.user) {
        console.error(
            "[socialSignIn] provider=%s signInWithIdToken rejected — status=%s code=%s msg=%s",
            provider, error?.status, error?.code, error?.message
        );
        // Surface the real Supabase reason (e.g. audience/client-id mismatch) instead of a generic message.
        throw new AppError(401, error?.message ? `Sign-in failed: ${error.message}` : "Federated sign-in failed.");
    }

    const session = data.session;
    const authUserId = data.user.id;
    const providerEmail = normalizeEmail(data.user.email);

    // 1) Already linked to this auth user → straight sign-in.
    let member = await Member.findOne({ where: { auth_user_id: authUserId } });

    // 2) Not linked by auth_user_id, but the verified provider email matches an existing member.
    if (!member && providerEmail) {
        const emailRow = await MemberEmail.findOne({
            where: { email: providerEmail },
            include: [{ model: Member }]
        });
        if (emailRow?.Member) {
            const candidate = emailRow.Member;
            if (!candidate.auth_user_id) {
                // Unlinked member (e.g. legacy import) — safe to adopt this provider identity.
                await candidate.update({ auth_user_id: authUserId });
                member = candidate;
            } else if (candidate.auth_user_id === authUserId) {
                member = candidate;
            } else {
                // BLOCKING-FIX: email already belongs to a DIFFERENT auth user (has an email/password
                // login, or a different provider). Do NOT return this session — its sub maps to no member
                // and would 401 on every protected route. Reject and steer them to their existing login.
                // (Product decision: linking Google to an existing account is a phase-2 account-settings
                // feature, not this endpoint.)
                throw new AppError(409, "An account with this email already exists. Sign in with your password.");
            }
        }
    }

    if (member) {
        const { push_token: pushToken, device_id: deviceId, platform } = options;
        if (pushToken && typeof pushToken === "string" && pushToken.trim()) {
            await upsertPushToken(member.id, pushToken.trim(), deviceId, platform);
        }
        return buildSocialAuthResponse(member, {
            access_token: session.access_token,
            refresh_token: session.refresh_token
        });
    }

    // 3) Brand-new social identity — needs username + gender before a member row can exist. Hand back the
    //    prefill + the (inert-until-completion) Supabase session so /oauth/complete can finish the sign-up.
    //    Google carries the name in user_metadata; Apple carries it ONLY in the client's first-auth
    //    credential, forwarded here as first_name/last_name hints.
    const meta = data.user.user_metadata || {};
    const fullName = (meta.full_name || meta.name || "").trim();
    const parts = fullName ? fullName.split(/\s+/) : [];
    const firstName = meta.given_name || parts.shift() || (first_name || "").trim() || "";
    const lastName = meta.family_name || parts.join(" ") || (last_name || "").trim() || "";
    return {
        needs_profile: true,
        email: providerEmail || "",
        first_name: firstName,
        last_name: lastName,
        token: session.access_token,
        refresh_token: session.refresh_token
    };
}

// Finish a brand-new federated sign-up. The Supabase auth user was ALREADY created by socialSignIn; here
// we only create members + member_emails linked to it (NO createUser, NO password). authUserId comes from
// JWKS-verifying the pending Bearer in the route (the member doesn't exist yet, so authenticateToken can't
// map it). The client re-sends its refresh_token so we echo the SAME session. Mirrors register()'s txn +
// compensation, with a race guard: on a concurrent double-submit we DON'T delete the shared auth user.
async function completeSocialRegistration(authUserId, { username, gender, first_name, last_name }, tokens) {
    if (!authUserId) throw new AppError(401, "Invalid session.");
    const uname = (username || "").trim();
    if (!uname) throw new AppError(400, "username is required.");

    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(authUserId);
    if (isTransientAuthError(userErr)) throw authUnavailableFor("[oauth/complete]", userErr);
    if (userErr || !userData?.user) throw new AppError(401, "Invalid session.");
    const email = normalizeEmail(userData.user.email);
    if (!email) throw new AppError(400, "Provider account has no email.");

    // Idempotency: a double-submit that already created the member just signs in.
    const already = await Member.findOne({ where: { auth_user_id: authUserId } });
    if (already) return buildSocialAuthResponse(already, tokens);

    const existingMember = await Member.findOne({ where: { username: uname } });
    if (existingMember) throw new AppError(400, "Username already exists");
    const existingEmail = await MemberEmail.findOne({ where: { email } });
    if (existingEmail) throw new AppError(400, "Email already exists");

    const transaction = await sequelize.transaction();
    try {
        const newMember = await Member.create({
            username: uname,
            first_name: (first_name || "").trim() || uname,
            last_name: (last_name || "").trim() || "",
            gender: gender || null,
            auth_user_id: authUserId
        }, { transaction });

        await MemberEmail.create({
            member_id: newMember.id,
            email,
            is_primary: true,
            verified_at: new Date()   // provider-verified email
        }, { transaction });

        await transaction.commit();
        return buildSocialAuthResponse(newMember, tokens);
    } catch (err) {
        await transaction.rollback();
        // Race guard: if a concurrent completion already created the member for this auth user, DON'T
        // delete the shared auth user — return that member's session (idempotent recovery).
        const raced = await Member.findOne({ where: { auth_user_id: authUserId } });
        if (raced) return buildSocialAuthResponse(raced, tokens);
        try { await supabaseAdmin.auth.admin.deleteUser(authUserId); } catch (_) { /* best-effort */ }
        throw err;
    }
}

// buildSocialAuthResponse ALWAYS echoes refresh_token (may be the client-re-sent value on /oauth/complete;
// clients must tolerate it being absent). Match the loginGlobal payload shape exactly.
function buildSocialAuthResponse(member, tokens) {
    return {
        token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        member_id: member.id,
        username: member.username,
        member_name: formatMemberName(member),
        global_role: member.global_role || "standard",
        message: "Login successful"
    };
}

// PUT /change-password (D-C14b): GoTrue PUT /user with the member's own Bearer — sets the password and, in the same
// transaction, ends the member's OTHER sessions; this device stays signed in. (Before 0.13.0 this was the admin update,
// which ends EVERY session — this device's too, at its next refresh.) POST /reset-password keeps the admin update:
// authSessionService.resetPassword.
async function changePassword(memberId, newPassword, { accessToken = null, ip = null } = {}) {
    if (!newPassword) throw new AppError(400, "new_password is required.");

    const passwordError = validatePassword(newPassword);
    if (passwordError) throw new AppError(400, passwordError);

    const member = await Member.findByPk(memberId);
    if (!member || !member.auth_user_id) throw new AppError(404, "Credentials not found.");
    if (isStaging()) await assertStagingUser(member.auth_user_id); // D-C13 — PUT /user bypasses the admin guard

    await updateOwnPassword(accessToken, newPassword, ip, "Server error during password change.");
    return { message: "Password changed successfully." };
}

// NET-NEW (auth SPEC / profile page): self-service email change. Has no legacy equivalent — email was
// fixed at registration. DIRECT change (no verification email, email_confirm:true) to stay consistent
// with register/createMember, and PASSWORD-CONFIRMED (re-auth the current password) since it is a
// sensitive account change. Email lives in BOTH Supabase auth.users AND member_emails (login resolves
// the member's email from member_emails), so both must move together. Compensating order mirrors
// register: do the Supabase update first, then the DB update, and best-effort revert Supabase if the DB
// write fails — so the two never drift. The current session JWT stays valid (sub/auth_user_id unchanged).
async function changeEmail(memberId, newEmailRaw, password, ip = null) {
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
        await makeRequestAuthClient(ip).auth.signInWithPassword({ email: currentEmail, password });
    if (isTransientAuthError(signInError)) throw authUnavailableFor("[change-email] re-auth", signInError);
    if (signInError || !signInData?.session) {
        // D-C15d: 400, not 401 — on an authenticated route live clients read a 401 as an ended session.
        throw new AppError(400, "Current password is incorrect.");
    }
    // D-C14c: the re-auth session only proved the password — end it now (best-effort).
    await discardSession(signInData.session.access_token, ip);

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
    if (isTransientAuthError(updateErr)) {
        // D-C15: the update may still land after our timeout. Read the auth user back and put the old email back only
        // if the new one already landed (revertAuthEmail ifNow) — never a blind revert racing the update. One that
        // lands after this read leaves auth.users ahead of member_emails (auth F18).
        await revertAuthEmail(member.auth_user_id, currentEmail, { ifNow: newEmail });
        throw authUnavailableFor("[change-email] update", updateErr);
    }
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
        await revertAuthEmail(member.auth_user_id, currentEmail);
        throw new AppError(500, "Failed to update email.");
    }

    return { message: "Email updated successfully.", email: newEmail };
}

// NET-NEW (auth SPEC v0.3.0 / D-C4): self-service password recovery — request step. Privacy-safe by
// design (forgot-password page D-PLAN): ALWAYS returns the same generic 200 message, never revealing
// whether the email maps to an account (no enumeration). Supabase is asked to send the recovery email
// (it only does so when the email exists); any Supabase error is swallowed so nothing leaks. The reset
// itself runs through a separate POST /auth/reset-password (next run) — clients never embed Supabase (R1).
async function requestPasswordReset(emailRaw, ip = null) {
    const email = normalizeEmail(emailRaw);
    // Staging (SPEC D-C13): reset mail only to +stg addresses, never @rasifiters.com; the response stays the same 200.
    if (email && EMAIL_RE.test(email) && mayEmailFromHere(email)) {
        const redirectTo = passwordResetRedirectUrl();
        let failure = null;
        try {
            const { error } = await makeRequestAuthClient(ip).auth.resetPasswordForEmail(
                email,
                redirectTo ? { redirectTo } : undefined
            );
            failure = error || null;
        } catch (err) {
            // Swallow — never surface delivery/existence status to the caller.
            failure = err;
        }
        // Server-side only, non-identifying (never the email or a token): a timed-out / rejected recover call
        // was otherwise invisible. The caller still gets the same generic 200 below.
        if (failure) {
            console.warn("[auth] password reset request failed", {
                name: failure?.name,
                status: failure?.status,
                code: failure?.code
            });
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
    register,
    socialSignIn,
    completeSocialRegistration,
    listIdentities,
    linkProvider,
    unlinkProvider,
    setPassword,
    changePassword,
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
