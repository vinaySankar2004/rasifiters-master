// Auth middleware — session verification + authorization gates.
// MIGRATION DELTA (R1 / SPEC §7, D-C2): authenticateToken no longer verifies a self-signed JWT
// (jwt.verify(token, JWT_SECRET)). It now verifies a SUPABASE-issued JWT via JWKS, reads `sub`
// (= auth.users.id), looks the member up by members.auth_user_id, and rebuilds the SAME req.user
// shape the rest of the app expects — so the authorization gates below are UNCHANGED from legacy.
const { verifySupabaseJwt, AUTH_RETRY_AFTER_SECONDS } = require("../config/supabase");
const { Member, ProgramMembership } = require("../models");

// Verify a Supabase-issued JWT and rebuild the legacy `req.user` contract (carries BOTH `role` and
// `global_role` so every gate below + every downstream feature reads the same fields it always did).
// Shared by authenticateToken (header) and authenticateStream (header or ?token=, the SSE D-C2 path).
// Returns { user, authUserId } or null if the token is invalid / maps to no member.
const resolveReqUser = async (token) => {
    const payload = await verifySupabaseJwt(token);
    const authUserId = payload.sub;
    if (!authUserId) return null;

    const member = await Member.findOne({ where: { auth_user_id: authUserId } });
    if (!member) return null;

    return {
        authUserId,
        user: {
            id: member.id,
            userId: member.id,
            username: member.username,
            member_name: member.member_name,
            global_role: member.global_role,
            role: member.global_role === "global_admin" ? "admin" : "member",
            date_joined: member.date_joined
        }
    };
};

// D-C11 (auth 0.10.0 — reliability-overhaul D-1): tell an INFRASTRUCTURE failure apart from a bad token.
// JWKS timeout / non-200 / bad JSON (jose ERR_JWKS_TIMEOUT / ERR_JOSE_GENERIC / ERR_JWKS_INVALID), a network/TLS
// error, or a DB (Sequelize) error in the member lookup → 503 + Retry-After, so the client keeps its session
// and retries instead of refreshing and then signing out on a second 401. Every token fault (expired, forged,
// malformed, wrong iss/aud, unknown kid) and anything unclassified stays 401 exactly as before.
const INFRA_JOSE_CODES = new Set(["ERR_JWKS_TIMEOUT", "ERR_JOSE_GENERIC", "ERR_JWKS_INVALID"]);
const NETWORK_ERROR_CODES = new Set([
    "ECONNREFUSED", "ECONNRESET", "ECONNABORTED", "ENOTFOUND", "EAI_AGAIN",
    "ETIMEDOUT", "EPIPE", "EHOSTUNREACH", "ENETUNREACH",
    // TLS handshake / certificate failures on the JWKS fetch (jose uses node:https) — never the token's fault.
    "EPROTO", "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID", "ERR_TLS_CERT_ALTNAME_INVALID",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN"
]);

const isVerifyInfraFailure = (err) => {
    if (!err) return false;
    if (INFRA_JOSE_CODES.has(err.code) || NETWORK_ERROR_CODES.has(err.code)) return true;
    if (typeof err.code === "string" && err.code.startsWith("ERR_SSL_")) return true;
    return typeof err.name === "string" && err.name.startsWith("Sequelize");
};

const sendAuthUnavailable = (res) => {
    res.set("Retry-After", String(AUTH_RETRY_AFTER_SECONDS));
    return res.status(503).json({
        error: "Authentication service temporarily unavailable",
        code: "auth_unavailable"
    });
};

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    try {
        const resolved = await resolveReqUser(token);
        if (!resolved) {
            return res.status(401).json({ error: "Invalid token." });
        }
        req.user = resolved.user;
        req.authUserId = resolved.authUserId;
        next();
    } catch (error) {
        if (isVerifyInfraFailure(error)) {
            console.error("[auth] token verification unavailable: %s", error.code || error.name);
            return sendAuthUnavailable(res);
        }
        return res.status(401).json({ error: "Invalid token." });
    }
};

// SSE stream auth (notifications GET /stream) — MIGRATION DELTA (notifications SPEC §7, D-C2).
// Legacy verified a self-signed JWT (jwt.verify(token, JWT_SECRET)) read from the Authorization header
// OR a ?token= query param (browser EventSource can't set headers). This now verifies a SUPABASE JWT
// via the SAME resolveReqUser path as authenticateToken, keeping the dual token source so the web
// EventSource (?token=) and iOS URLSession (either) clients are unchanged.
const authenticateStream = async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const headerToken = authHeader && authHeader.split(" ")[1];
    const queryToken = req.query?.token;
    const token = headerToken || queryToken;

    if (!token) {
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    try {
        const resolved = await resolveReqUser(token);
        if (!resolved) {
            return res.status(401).json({ error: "Invalid token." });
        }
        req.user = resolved.user;
        req.authUserId = resolved.authUserId;
        next();
    } catch (error) {
        return res.status(401).json({ error: "Invalid token." });
    }
};

const isAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "Authentication required." });
    }

    const isAdminRole = req.user.role === 'admin';
    const isGlobalAdmin = req.user.global_role === 'global_admin';
    if (!isAdminRole && !isGlobalAdmin) {
        return res.status(403).json({ error: "Access denied. Admin privileges required." });
    }

    next();
};

const canModifyLog = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "Authentication required." });
    }

    if (req.user.role === 'admin') {
        return next();
    }

    const logMemberId = req.body.member_id || req.query.member_id || req.params.member_id;

    if (logMemberId) {
        if (req.user.id !== logMemberId) {
            return res.status(403).json({ error: "Access denied. You can only modify your own logs." });
        }
        return next();
    }

    const memberName = req.body.member_name || req.query.member_name || req.params.member_name;

    if (memberName) {
        if (req.user.member_name !== memberName) {
            return res.status(403).json({ error: "Access denied. You can only modify your own logs." });
        }
        return next();
    }

    return res.status(400).json({ error: "Member identification required for this operation." });
};

const requireProgramAdmin = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "Authentication required." });
    }

    if (req.user.global_role === "global_admin") {
        return next();
    }

    const programId = req.body.program_id || req.query.programId || req.params.programId;
    if (!programId) {
        return res.status(400).json({ error: "Program identification required." });
    }

    const pm = await ProgramMembership.findOne({
        where: {
            program_id: programId,
            member_id: req.user.id,
            role: "admin",
            status: "active"
        }
    });

    if (!pm) {
        return res.status(403).json({ error: "Admin privileges required for this program." });
    }

    next();
};

const requireProgramMember = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "Authentication required." });
    }

    if (req.user.global_role === "global_admin") {
        return next();
    }

    const programId = req.body.program_id || req.query.programId || req.params.programId;
    if (!programId) {
        return res.status(400).json({ error: "Program identification required." });
    }

    const pm = await ProgramMembership.findOne({
        where: {
            program_id: programId,
            member_id: req.user.id,
            status: "active"
        }
    });

    if (!pm) {
        return res.status(403).json({ error: "Access denied. Program membership required." });
    }

    req.programMembership = pm;
    next();
};

// observability D-C4 / auth D-C12 (0.11.0): authenticate IF a bearer token is present; NEVER reject. No token, a
// bad/expired token, an unknown member or a JWKS/DB outage all continue signed-out (req.user stays unset). For
// routes that must work without a login — POST /api/client-events, whose sign-in-failure and forced-sign-out
// reports arrive precisely when the session is gone. Header only (never ?token=).
const optionalAuthenticate = async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token) {
        try {
            const resolved = await resolveReqUser(token);
            if (resolved) {
                req.user = resolved.user;
                req.authUserId = resolved.authUserId;
            }
        } catch (_error) {
            // Signed-out by design: neither a token fault nor an infrastructure failure rejects here.
        }
    }
    next();
};

module.exports = { authenticateToken, authenticateStream, optionalAuthenticate, isAdmin, canModifyLog, requireProgramAdmin, requireProgramMember };
