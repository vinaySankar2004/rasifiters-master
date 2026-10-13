// Device registry — specs/features/notifications/SPEC.md §3.1 (0.4.0, D-C11/D-C12). One member_push_tokens row per
// installation. EVERY device write goes through here: PUT /device, the login/OAuth push_token ride-along (via
// authService.upsertPushToken), DELETE /device (via authService.removePushToken) and POST /device/unregister.
// R1's sign-out work must call these functions too — never a second path (D-C11).
// Phase 4 (the per-device push rule): records the installation's inbox capability (supports_inbox) — PUT /device passes
// true/false, the login ride-along passes nothing (= keep).
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const { MemberPushToken } = require("../models");
const { AppError } = require("../utils/response");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PUSH_TOKEN_CHARS = 512; // member_push_tokens.device_token is varchar(512)

// The install id: a client-generated UUID, else nothing. A non-UUID value (no live build sends device_id at all) is
// ignored, so two devices can never collapse into one row through a shared label.
const normalizeDeviceId = (raw) =>
    (typeof raw === "string" && UUID_RE.test(raw.trim()) ? raw.trim().toLowerCase() : null);

// "ios" | "android" when sent; anything else counts as not sent (D-C11: "ios" for a NEW row, the stored value otherwise).
const normalizePlatform = (raw) => (raw === "ios" || raw === "android" ? raw : null);

const normalizePushToken = (raw) => {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    return trimmed && trimmed.length <= MAX_PUSH_TOKEN_CHARS ? trimmed : null;
};

// Token rotation: this install's rows holding a different token are replaced by this registration.
const DELETE_ROTATED_SQL =
    "DELETE FROM member_push_tokens WHERE device_id = :deviceId AND device_token <> :pushToken";

// Atomic upsert keyed on the token (two concurrent registrations can't both INSERT). Re-binds the token to the caller
// (faithful), keeps a stored device_id when none is sent, stamps last_seen_at on EVERY call — old builds included.
// supports_inbox (Phase 4, the per-device push rule): PUT /device always sends true/false (an old build → false, so a
// downgrade turns it off); the login ride-along sends NULL = keep the stored value.
const UPSERT_SQL = `
INSERT INTO member_push_tokens (member_id, device_token, platform, device_id, supports_inbox, created_at, updated_at, last_seen_at)
VALUES (:memberId, :pushToken, COALESCE(:platform, 'ios'), :deviceId, COALESCE(:supportsInbox, false), now(), now(), now())
ON CONFLICT (device_token) DO UPDATE SET
    member_id      = EXCLUDED.member_id,
    platform       = COALESCE(:platform, member_push_tokens.platform),
    device_id      = COALESCE(EXCLUDED.device_id, member_push_tokens.device_id),
    supports_inbox = COALESCE(:supportsInbox, member_push_tokens.supports_inbox),
    updated_at     = now(),
    last_seen_at   = now()`;

const isUniqueViolation = (err) => err?.parent?.code === "23505";

// Raw SQL inlines its replacements (push token, member id) into err.sql — so a DB error leaves this module scrubbed:
// name + Postgres code only (observability F8), whoever logs or inspects it. The callers' status codes and response
// bodies are unchanged (still a non-AppError → 500).
const scrubbed = (err) => {
    const clean = new Error("Device registry write failed.");
    clean.name = `DeviceRegistryError(${err?.name || "Error"})`;
    clean.parent = { code: err?.parent?.code || null };
    clean.code = err?.parent?.code || null; // logError prints err.code
    return clean;
};

/** PUT /device + the login ride-along. `pushToken` arrives trimmed and non-empty (the callers validate it). */
async function registerDevice({ memberId, pushToken, deviceId, platform, supportsInbox }) {
    const replacements = {
        memberId,
        pushToken,
        platform: normalizePlatform(platform),
        deviceId: normalizeDeviceId(deviceId),
        supportsInbox: typeof supportsInbox === "boolean" ? supportsInbox : null
    };
    const write = () => sequelize.transaction(async (transaction) => {
        if (replacements.deviceId) {
            await sequelize.query(DELETE_ROTATED_SQL, { replacements, transaction });
        }
        await sequelize.query(UPSERT_SQL, { replacements, transaction });
    });
    try {
        await write();
    } catch (err) {
        // Two registrations of one install racing on uniq_member_push_tokens_device_id: the retry sees the winner.
        if (!isUniqueViolation(err)) throw scrubbed(err);
        await write().catch((retryErr) => {
            throw scrubbed(retryErr);
        });
    }
}

/** DELETE /device (unchanged semantics): one of the caller's tokens, or all of them when no token is given. */
async function unregisterMemberDevices(memberId, pushToken = null) {
    const where = { member_id: memberId };
    if (pushToken && typeof pushToken === "string" && pushToken.trim()) {
        where.device_token = pushToken.trim();
    }
    await MemberPushToken.destroy({ where }).catch((err) => {
        throw scrubbed(err);
    });
}

/**
 * POST /device/unregister — NO login (D-C12): the push token and/or the install id prove the device. Deletes every
 * row matching either, whoever it is bound to. The route answers 200 whether or not a row matched.
 */
async function unregisterDevice({ pushToken, deviceId }) {
    const token = normalizePushToken(pushToken);
    const installId = normalizeDeviceId(deviceId);
    const match = [];
    if (token) match.push({ device_token: token });
    if (installId) match.push({ device_id: installId });
    if (match.length === 0) {
        throw new AppError(400, "push_token or device_id is required.", { code: "invalid_body" });
    }
    await MemberPushToken.destroy({ where: { [Op.or]: match } }).catch((err) => {
        throw scrubbed(err);
    });
}

module.exports = { registerDevice, unregisterMemberDevices, unregisterDevice };
