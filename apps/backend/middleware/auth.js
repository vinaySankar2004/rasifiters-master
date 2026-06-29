// Auth middleware — session verification + authorization gates.
// MIGRATION DELTA (R1 / SPEC §7, D-C2): authenticateToken no longer verifies a self-signed JWT
// (jwt.verify(token, JWT_SECRET)). It now verifies a SUPABASE-issued JWT via JWKS, reads `sub`
// (= auth.users.id), looks the member up by members.auth_user_id, and rebuilds the SAME req.user
// shape the rest of the app expects — so the authorization gates below are UNCHANGED from legacy.
const { verifySupabaseJwt } = require("../config/supabase");
const { Member, ProgramMembership } = require("../models");

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    try {
        const payload = await verifySupabaseJwt(token);
        const authUserId = payload.sub;
        if (!authUserId) {
            return res.status(401).json({ error: "Invalid token." });
        }

        const member = await Member.findOne({ where: { auth_user_id: authUserId } });
        if (!member) {
            return res.status(401).json({ error: "Invalid token." });
        }

        // Rebuild the legacy req.user contract (carries BOTH `role` and `global_role` so every gate
        // below + every downstream feature reads the same fields it always did).
        req.user = {
            id: member.id,
            userId: member.id,
            username: member.username,
            member_name: member.member_name,
            global_role: member.global_role,
            role: member.global_role === "global_admin" ? "admin" : "member",
            date_joined: member.date_joined
        };
        req.authUserId = authUserId;
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

module.exports = { authenticateToken, isAdmin, canModifyLog, requireProgramAdmin, requireProgramMember };
