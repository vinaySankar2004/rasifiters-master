// Auth middleware — session verification + authorization gates.
// MIGRATION DELTA (R1 / SPEC §7, D-C2): authenticateToken no longer verifies a self-signed JWT
// (jwt.verify(token, JWT_SECRET)). It now verifies a SUPABASE-issued JWT via JWKS, reads `sub`
// (= auth.users.id), looks the member up by members.auth_user_id, and rebuilds the SAME req.user
// shape the rest of the app expects — so the authorization gates below are UNCHANGED from legacy.
const { verifySupabaseJwt } = require("../config/supabase");
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

module.exports = { authenticateToken, authenticateStream, isAdmin, canModifyLog, requireProgramAdmin, requireProgramMember };
