// Session-bound GoTrue calls — auth SPEC D-C14 (reliability-overhaul Phase 3 R1; DESIGN_BOARD §2 backend 4).
// Every call here is made WITH the user's own access token, straight to GoTrue through gotrueFetch
// (services/supabaseTokenRefresh.js: no SDK client, no stored session, 5 s timeout, no retry, user IP forwarded):
//   • logout            POST /auth/logout       → THIS device's session only (GoTrue /logout?scope=local)
//   • logoutEverywhere  POST /auth/logout-all   → every session of the user (scope=global)
//   • updateOwnPassword PUT /auth/change-password + POST /auth/set-password → GoTrue PUT /user: sets the password and, in
//                       the same transaction, ends the user's OTHER sessions — this device stays signed in.
//   • linkIdToken / deleteIdentity → the identity link grant + unlink for authService.linkProvider / unlinkProvider.
//     No SDK session is restored, so there is no refresh-token rotation the client never sees (resolves F13).
//   • discardSession    ends a session the server opened only to check something (the link grant, the PUT /email
//                       re-auth) — best-effort, that session only.
// GoTrue ends sessions by the session_id inside the access token. Other devices end at their next refresh (401
// session_invalid); access tokens they already hold stay valid until they expire (≤ 1 h — stateless JWTs, D-C2).
// Also here (Phase 3 R1 verdict #8 — keeps authService.js from growing), two admin-API calls: resetPassword
// (POST /auth/reset-password — the admin update, which ends EVERY session) and revertAuthEmail (PUT /auth/email
// compensation).
const { Member } = require("../models");
const { supabaseAdmin } = require("../config/supabase");
const {
    gotrueFetch,
    exchangeRefreshToken,
    classifyUserCall,
    classifyVerifiedCall,
    authUnavailableFor,
    isTransientAuthError,
    readErrorMessage
} = require("./supabaseTokenRefresh");
const { AppError } = require("../utils/response");
const { isStaging, assertStagingAccount } = require("../utils/stagingGuard");

const SAME_PASSWORD_MESSAGE = "New password must be different from your current password.";

// POST /logout?scope=… with the user's access token → "ok" (revoked) · "session" (the token, its session or its user
// is already gone / invalid) · "rejected" (GoTrue refused for another reason). Throws 503 auth_unavailable on a
// network error, the timeout, 408 / 429 / 5xx or a code-less error (and, with classifyVerifiedCall, an API-key fault).
async function revokeSessions(accessToken, scope, ip, { tag = `[logout:${scope}]`, classify = classifyUserCall } = {}) {
    const res = await gotrueFetch(`/logout?scope=${scope}`, { jwt: accessToken, ip, tag });
    const outcome = classify(res);
    if (outcome === "unavailable") throw authUnavailableFor(tag, res);
    return outcome;
}

// POST /auth/logout (D-C14). Best-effort + idempotent like the legacy logout: always { message: "Logged out" } once a
// credential is sent. The Bearer (Android sends one) is used first; if GoTrue rejects it (expired, already revoked)
// and a body refresh_token was sent (iOS sends only that), the refresh token is exchanged for a fresh access token
// first — one rotation of a session that is ending. An outage ends the attempt (no second 5 s call).
async function logout({ refreshToken, accessToken, ip }) {
    if (!refreshToken && !accessToken) throw new AppError(400, "Refresh token required");
    try {
        if (accessToken && (await revokeSessions(accessToken, "local", ip)) === "ok") return { message: "Logged out" };
        if (refreshToken) {
            const session = await exchangeRefreshToken(refreshToken, ip, "[logout]");
            await revokeSessions(session.access_token, "local", ip);
        }
    } catch (_) {
        // A dead token, a timeout or an outage — each already logged where it happened. Logout stays best-effort.
    }
    return { message: "Logged out" };
}

// Verdict #5 (D-C14c): end a session the server opened only to check something — the identity link grant's new
// session, the PUT /email password re-auth — so it never lingers until the inactivity timeout. Best-effort, scope
// local (that session only); a failure is logged where it happened and otherwise ignored.
async function discardSession(accessToken, ip) {
    if (!accessToken) return;
    try {
        await revokeSessions(accessToken, "local", ip, { tag: "[discard]" });
    } catch (_) { /* best-effort */ }
}

// Staging (D-C13; DESIGN_BOARD §8): a login-level change made with the user's own token bypasses guardAdminAuth, so
// the account is checked here — only +stg accounts. Callers invoke it only when isStaging().
async function assertStagingUser(authUserId) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(authUserId);
    if (isTransientAuthError(error)) throw authUnavailableFor("[staging-guard]", error);
    assertStagingAccount(error ? null : data?.user?.email);
}

// POST /auth/logout-all (D-C14): every session of the user, this device's included. A session GoTrue no longer knows
// → 401 so the client refreshes once and retries (if its refresh is rejected too, it is signed out anyway); an API-key
// fault on the just-verified token → 503 (classifyVerifiedCall).
async function logoutEverywhere({ accessToken, authUserId, ip }) {
    if (isStaging()) await assertStagingUser(authUserId);
    const outcome = await revokeSessions(accessToken, "global", ip, { classify: classifyVerifiedCall });
    if (outcome !== "ok") throw new AppError(401, "Invalid token.");
    return { message: "Logged out everywhere" };
}

// GoTrue PUT /user { password } with the user's access token (D-C14b). Returns on success; throws 503 on an outage or
// an API-key fault, 401 when the session behind the token is gone, 400 when GoTrue refuses the password (same password
// → its own text; weak_password → GoTrue's text; anything else → `failMessage`, the route's pre-0.13.0 400 text).
// NOT idempotent: a retry after a change that landed answers the same-password 400 — clients never auto-retry it
// (auth SPEC §3.1 rule 6, F19).
async function updateOwnPassword(accessToken, password, ip, failMessage) {
    const res = await gotrueFetch("/user", {
        method: "PUT",
        jwt: accessToken,
        ip,
        tag: "[password]",
        body: { password }
    });
    const outcome = classifyVerifiedCall(res);
    if (outcome === "ok") return;
    if (outcome === "unavailable") throw authUnavailableFor("[password]", res);
    if (outcome === "session") throw new AppError(401, "Session expired. Sign in again to change your password.");
    if (res.code === "same_password") throw new AppError(400, SAME_PASSWORD_MESSAGE);
    console.warn("[password] rejected: status=%s code=%s", res.status, res.code);
    throw new AppError(400, (res.code === "weak_password" && readErrorMessage(res.body)) || failMessage);
}

// The identity link grant (what auth-js linkIdentityIdToken does, minus the SDK). GoTrue answers with a NEW session for
// the linked identity; the caller discards it (discardSession) — its refresh token never leaves the server (D-C14).
const linkIdToken = (accessToken, { provider, idToken, nonce }, ip) =>
    gotrueFetch("/token?grant_type=id_token", {
        jwt: accessToken,
        ip,
        tag: "[link]",
        body: { provider, id_token: idToken, link_identity: true, ...(nonce ? { nonce } : {}) }
    });

const deleteIdentity = (accessToken, identityId, ip) =>
    gotrueFetch(`/user/identities/${encodeURIComponent(identityId)}`, {
        method: "DELETE",
        jwt: accessToken,
        ip,
        tag: "[unlink]"
    });

// POST /reset-password (D-C5 / D-C14b): the admin update — GoTrue's admin password update ends EVERY session of the
// user, the recovery session included (its refresh token travelled in the email-link URL). Behaviour unchanged since
// 0.4.0; a password write is idempotent, so a 503 is safe to retry.
async function resetPassword(memberId, newPassword) {
    if (!newPassword) throw new AppError(400, "new_password is required.");

    // Required at call time: authService requires this module while it loads, so a top-level require would be a cycle.
    const { validatePassword } = require("./authService");
    const passwordError = validatePassword(newPassword);
    if (passwordError) throw new AppError(400, passwordError);

    const member = await Member.findByPk(memberId);
    if (!member || !member.auth_user_id) throw new AppError(404, "Credentials not found.");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(member.auth_user_id, {
        password: newPassword
    });
    if (isTransientAuthError(error)) throw authUnavailableFor("[reset-password]", error);
    if (error) throw new AppError(400, "Server error during password change.");

    return { message: "Password changed successfully." };
}

// PUT /email compensation (D-C6): set the auth user's email back to `email`. Best-effort, never throws. With `ifNow`
// (verdict #6 — after a TIMED-OUT update) it first reads the auth user back and reverts only when Supabase already
// holds the new address `ifNow` — never a blind revert racing the update. An update that lands after that read is
// auth F18.
async function revertAuthEmail(authUserId, email, { ifNow = null } = {}) {
    try {
        if (ifNow) {
            const { data, error } = await supabaseAdmin.auth.admin.getUserById(authUserId);
            if (error || (data?.user?.email || "").toLowerCase() !== ifNow) return;
        }
        await supabaseAdmin.auth.admin.updateUserById(authUserId, { email, email_confirm: true });
    } catch (_) { /* best-effort revert */ }
}

module.exports = {
    logout,
    logoutEverywhere,
    assertStagingUser,
    updateOwnPassword,
    linkIdToken,
    deleteIdentity,
    discardSession,
    resetPassword,
    revertAuthEmail
};
