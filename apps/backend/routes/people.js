// /api/people — People list, person profile, kudos give / undo (specs/features/people/SPEC.md §3; phase-4 S1).
// Thin router: id validation → services. Errors are `{ error, code }` (frontend-kit §4: the status decides the kind;
// never a Sequelize 500 for a bad id). Mounted in server.js after express.json() + app-config's blockUnversionedAndroid.
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { rateLimit } = require("../utils/rateLimit");
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");
const { canonicalId } = require("../utils/memberVisibility");
const peopleService = require("../services/peopleService");
const kudosService = require("../services/kudosService");

const router = express.Router();

// The kudos rate-limit rule — process memory; a deploy resets both (observability F3).
// Per member: 60 kudos writes (POST + DELETE) / 10 min — abuse protection (the health-sync D-C12 shape).
const limitKudosWrites = rateLimit({ windowMs: 10 * 60 * 1000, max: 60, keyFn: (req) => req.user.id });
// Per giver → recipient: 6 writes / 24 h — bounds give/undo churn to at most 3 kudos notifications per pair per day.
const limitKudosPair = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 6,
    maxKeys: 100000,
    keyFn: (req) => `${req.user.id}:${canonicalId(req.params.memberId)}`
});

const requireId = (value, field) => {
    const id = canonicalId(value);
    if (!id) throw new AppError(400, `${field} must be a valid id.`, { code: "invalid_request" });
    return id;
};

// Rejects a malformed :memberId BEFORE the limiters, so junk ids can't create pair keys.
const validMemberParam = (req, res, next) => {
    if (canonicalId(req.params.memberId)) return next();
    return res.status(400).json({ error: "memberId must be a valid id.", code: "invalid_request" });
};

const handle = (tag, fallback, run) => async (req, res) => {
    try {
        const { status = 200, body } = await run(req);
        res.status(status).json(body);
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
        logError(`[people] ${tag} failed:`, err);
        return res.status(500).json({ error: fallback, code: "server_error" });
    }
};

router.get("/", authenticateToken, handle("list", "Failed to load people.", async (req) => ({
    body: await peopleService.listPeople({
        user: req.user,
        programId: requireId(req.query.programId, "programId")
    })
})));

router.get("/:memberId", authenticateToken, handle("profile", "Failed to load this profile.", async (req) => ({
    body: await peopleService.getPersonProfile({
        user: req.user,
        programId: requireId(req.query.programId, "programId"),
        memberId: requireId(req.params.memberId, "memberId")
    })
})));

router.post("/:memberId/kudos", authenticateToken, validMemberParam, limitKudosWrites, limitKudosPair,
    handle("kudos give", "Failed to send kudos.", async (req) => {
        const result = await kudosService.giveKudos({
            user: req.user,
            recipientId: requireId(req.params.memberId, "memberId"),
            programId: requireId(req.body?.program_id, "program_id")
        });
        return { status: result.created ? 201 : 200, body: { kudos: result.kudos } };
    }));

router.delete("/:memberId/kudos", authenticateToken, validMemberParam, limitKudosWrites, limitKudosPair,
    handle("kudos undo", "Failed to undo kudos.", async (req) => ({
        body: {
            kudos: await kudosService.undoKudos({
                user: req.user,
                recipientId: requireId(req.params.memberId, "memberId")
            })
        }
    })));

module.exports = router;
