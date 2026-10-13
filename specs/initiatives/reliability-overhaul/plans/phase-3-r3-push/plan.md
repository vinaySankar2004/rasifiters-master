# Phase 3 track R3 — plan

# PLAN: Reliability overhaul Phase 3, track R3 backend (invite transaction, device registry, push_deliveries, unregister without login, APNs/FCM settings, SSE shutdown)

**Brief accepted**: yes (22 files: 18 backend + 4 docs). The two optional files are not needed: `routes/notificationDevices.js` and the observability SPEC note.

**Revision 2**: fixes every item in the adversary verdict.
1. Install-id storage is now iOS keychain `…ThisDeviceOnly` or Android `noBackupFilesDir` (new flag F13).
2. All three live clients swallow invite errors, so live users see no change. The client plans must remove the swallow.
3. The 60-day prune also requires a stale `updated_at`, so a rollback cannot prune active installs. Steps 29 and 30 run in the same session.
4. The staging iOS test runs on the simulator only.
5. The revert trigger for the 24-hour watch is narrowed.
6. Read-only checks of invites, memberships and blocks run before every device invite.
7. No new error codes: a bad body is the existing `invalid_body`, and 500s carry no `code`.
8. DB errors are scrubbed in `deviceService`, and `PUT /device` logs only the error name and Postgres code.
9. The contract makes unregister and register run one at a time.

**Feature/version prediction**:
- notifications v0.3.1 → v0.4.0 (MINOR): new route, new table, device-registry rules, `reference_impl` grows.
- invites v0.1.0 → v0.2.0 (MINOR): the `POST /invite` error contract changes and `consumed_by` gains android.
- auth: no bump (delegation only).

**Surfaces in scope**: [backend]. web, ios and android get no steps here. Their bundled release is planned later against notifications SPEC §3.1–§3.3 and invites SPEC §3.1, both written by this plan.

## Decisions taken (each becomes a SPEC D-rule; can be overridden at approval)

| Q | Decision (one-line why) |
|---|---|
| 1 | **Reuse `device_id` as the install id.** It is used only when it is a UUID, with a partial unique index. It is already accepted on all three routes, and no live build sends it. Clients store it in iOS keychain `…ThisDeviceOnly` or Android `noBackupFilesDir`, so restores and device transfers never copy it. |
| 2 | **New `POST /api/notifications/device/unregister`**: no login, always 200 for a valid body. The live `DELETE /device` stays byte-identical. |
| 3 | FCM channels: **`rasi_invites`** (high importance) for `program.invite_received`, `program.role_changed`, `program.admin_transferred` and `program.member_removed`; **`rasi_default`** for everything else. FCM TTL = APNs expiry = **604800 s**. |
| 4 | APNs prune reasons stay as today; 410 is now compared as a string. FCM prunes on `registration-token-not-registered` and `invalid-registration-token`. `invalid-argument` is logged and never prunes. |
| 5 | Invite no-op reasons are logged to **console only**, as one JSON line. No server-event helper is shared with R1. |
| 6 | When `platform` is omitted, an **existing row keeps its platform**; a new row gets `ios`. |
| 7 | `android` joins invites `consumed_by` **now**, because Android 1.0.0 already calls `POST /invite`. `type` and `program_id` are added to both push payloads (additive). |
| 8 | **R1 must use `deviceService` for any device unregister.** There is no second path. |
| 9 | **Gate:** implementation and the local commit may start after plan approval. Every live step (migrations, deploys) waits until the watch ends clean on **2026-10-19**, unless the user explicitly waives it. |
| 10 | Bumps: notifications 0.4.0 and invites 0.2.0. auth and observability are untouched. |
| 11 | Staging covers the migration, the registry, FCM payload acceptance (emulator), APNs (simulator) and the SSE shutdown. Prod gets the smoke script plus the user's own devices. |
| 12 | **R3 adds no new error `code`.** A bad body on an unauthenticated route = `400 invalid_body`, the existing client-events code. A 429 = `rate_limited` (existing). A 500 is `{ error }` with no `code`, like every backend 500 today; the frontend-kit derives `server` from the status. |

Code style throughout: 4-space indentation, double quotes, CommonJS. Work on branch **`phase3-r3-backend`** (a worktree off `main`). **Never `git push origin main` before step 30.**

## Steps — backend

### 1. NEW `apps/backend/sql/010_push_deliveries_device_registry.sql`
```sql
-- 010_push_deliveries_device_registry.sql — push delivery records + the device registry (reliability-overhaul
-- Phase 3 track R3; specs/features/notifications/SPEC.md 0.4.0 — D-C11, D-C14, D-C15).
--
-- WHAT
--   PART 1  member_push_tokens.last_seen_at — stamped by every PUT /device (and the login push_token ride-along) once
--           the notifications 0.4.0 backend runs. ORDER MATTERS: the column is added with NO default, THEN the
--           default is set (it applies to new rows only), THEN existing rows are backfilled from updated_at (their last
--           registration). `ADD COLUMN … DEFAULT now()` would stamp every old install as seen today; a row the
--           still-running old backend inserts mid-run gets now() from the default (it was just seen).
--           + uniq_member_push_tokens_device_id: device_id is the install id (one row per installation). Pre-flight P1
--           (sql/README.md, 010 row) must return 0 rows, or this index fails.
--   PART 2  push_deliveries — one row per push attempt (+ one `no_device` row per recipient with no registered device).
--   PART 3  RLS on the `public` copy only; on `staging`: grants for rasifiters_staging + RLS off (008 §5).
--   PART 4  pg_cron, per schema: push_deliveries_retention_<schema> (older than 90 days, 04:22 UTC) and
--           member_push_tokens_prune_<schema> (last_seen_at AND updated_at older than 60 days, 04:27 UTC). The
--           updated_at clause keeps the prune safe if the backend is ever rolled back to pre-0.4.0 code, which bumps
--           updated_at on every registration but never last_seen_at; under 0.4.0 the two move together.
--
-- SCHEMA-NEUTRAL (DESIGN_BOARD §8): no schema names outside PART 3's staging-only branch; every object lands in
-- current_schema(). Run it TWICE, staging first (sql/README.md §Staging schema step 4):
--   SQL editor: first line `SET search_path TO staging;` + this file → Run → the VERIFY block at the end; then the
--               same with `SET search_path TO public;`.
--   psql:       psql "$SUPABASE_DATABASE_URL" -c "SET search_path TO staging" -f apps/backend/sql/010_push_deliveries_device_registry.sql
--               — session pooler / direct connection (port 5432) ONLY; on the transaction pooler (6543)
--               `SET search_path` does not persist and the run silently lands in `public`.
--   If the SQL editor offers "Run and enable RLS", run WITHOUT it (PART 3 sets RLS per schema).
-- ORDER: run + verify on `public` BEFORE the notifications 0.4.0 backend reaches `main` (Render auto-deploys main;
-- its PUT /device writes last_seen_at). Independent of 009 — either may run first.
-- IDEMPOTENT: IF NOT EXISTS everywhere; the backfill touches NULLs only; SET DEFAULT / SET NOT NULL / GRANT / the RLS
-- block / cron.schedule (same job name → updated) all re-run safely.
-- LOCK TIMEOUT: the ALTERs take a brief exclusive lock on member_push_tokens, capped at 5 s. If it fires, nothing is
-- broken (the SQL editor rolls the run back) — wait a moment and re-run the file.
-- WHO RUNS IT: the USER — never Claude (CLAUDE.md DB-write policy). Nothing secret in here (the repo is public).

SET lock_timeout = '5s';

-- ===== PART 1 — device registry ================================================================================

ALTER TABLE member_push_tokens ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone;
ALTER TABLE member_push_tokens ALTER COLUMN last_seen_at SET DEFAULT CURRENT_TIMESTAMP;
UPDATE member_push_tokens SET last_seen_at = updated_at WHERE last_seen_at IS NULL;
ALTER TABLE member_push_tokens ALTER COLUMN last_seen_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_member_push_tokens_last_seen_at ON member_push_tokens USING btree (last_seen_at);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_member_push_tokens_device_id
    ON member_push_tokens USING btree (device_id) WHERE (device_id IS NOT NULL);

-- ===== PART 2 — push_deliveries ================================================================================

CREATE TABLE IF NOT EXISTS push_deliveries (
    id               uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at       timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    notification_id  uuid NOT NULL,
    member_id        uuid NOT NULL,
    push_token_id    uuid,
    platform         character varying(16),
    outcome          character varying(16) NOT NULL,
    error_code       character varying(64),
    CONSTRAINT push_deliveries_pkey PRIMARY KEY (id),
    CONSTRAINT push_deliveries_outcome_check
        CHECK (outcome IN ('sent', 'failed', 'pruned', 'no_device', 'not_configured')),
    -- push_token_id has NO FK on purpose: tokens are pruned, the delivery record stays.
    CONSTRAINT push_deliveries_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
    CONSTRAINT push_deliveries_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_deliveries_created_at ON push_deliveries USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_push_deliveries_member_id_created_at ON push_deliveries USING btree (member_id, created_at);
CREATE INDEX IF NOT EXISTS idx_push_deliveries_notification_id ON push_deliveries USING btree (notification_id);

-- ===== PART 3 — RLS (public) / grants + RLS off (staging) ======================================================
-- public: RLS on, no policies — the posture of every public table (PostgREST reads nothing; the backend is the owner).
-- staging: explicit DML grant for the non-owner staging role, and RLS off for every staging table (008 §5).

DO $$
DECLARE t text;
BEGIN
    IF current_schema() = 'public' THEN
        ALTER TABLE push_deliveries ENABLE ROW LEVEL SECURITY;
    ELSIF current_schema() = 'staging' THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON push_deliveries TO rasifiters_staging;
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'staging' LOOP
            EXECUTE format('ALTER TABLE staging.%I DISABLE ROW LEVEL SECURITY', t);
        END LOOP;
    END IF;
END $$;

-- ===== PART 4 — nightly retention + unseen-token prune (pg_cron is already enabled by 007) ======================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
    'push_deliveries_retention_' || current_schema(),
    '22 4 * * *',
    format('DELETE FROM %I.push_deliveries WHERE created_at < now() - interval %L', current_schema(), '90 days')
);

SELECT cron.schedule(
    'member_push_tokens_prune_' || current_schema(),
    '27 4 * * *',
    format('DELETE FROM %I.member_push_tokens WHERE last_seen_at < now() - interval %L AND updated_at < now() - interval %L',
           current_schema(), '60 days', '60 days')
);

-- ===== VERIFY (read-only — run after each schema's run, with the same `SET search_path TO <schema>;` first) =====
-- SELECT column_default, is_nullable FROM information_schema.columns
--  WHERE table_schema = current_schema() AND table_name = 'member_push_tokens' AND column_name = 'last_seen_at';
--     → CURRENT_TIMESTAMP | NO
-- SELECT count(*) AS total, count(*) FILTER (WHERE last_seen_at = updated_at) AS backfilled FROM member_push_tokens;
--     → backfilled = total (a few fewer only if a device re-registered since the run)
-- SELECT count(*) FROM pg_indexes WHERE schemaname = current_schema() AND indexname IN (
--   'idx_member_push_tokens_last_seen_at', 'uniq_member_push_tokens_device_id', 'push_deliveries_pkey',
--   'idx_push_deliveries_created_at', 'idx_push_deliveries_member_id_created_at', 'idx_push_deliveries_notification_id');
--     → 6
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'push_deliveries'::regclass;     → public: t · staging: f
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname IN
--   ('push_deliveries_retention_' || current_schema(), 'member_push_tokens_prune_' || current_schema()) ORDER BY 1;
--     → member_push_tokens_prune_<schema> | 27 4 * * * | t ;  push_deliveries_retention_<schema> | 22 4 * * * | t
-- staging only:
-- SELECT has_table_privilege('rasifiters_staging', 'staging.push_deliveries', 'INSERT') AS can_insert,
--        (SELECT count(*) FROM pg_class WHERE relnamespace = 'staging'::regnamespace AND relkind = 'r'
--          AND relrowsecurity) AS staging_rls_on;                                   → t | 0
```

### 2. `apps/backend/models/MemberPushToken.js`
- After the `updated_at` attribute (lines 31-34), add a comma after its closing `}` and insert:
```js
    // notifications 0.4.0 (D-C11, sql/010): stamped by every registration (deviceService.registerDevice); the nightly
    // pg_cron prune drops rows unseen for 60 days. device_id (above) is the install id — partial unique index
    // uniq_member_push_tokens_device_id (WHERE device_id IS NOT NULL).
    last_seen_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
```
- In `indexes` (lines 39-43), append `{ fields: ["last_seen_at"] }` after `{ fields: ["platform"] }`, with a comma.

### 3. NEW `apps/backend/models/PushDelivery.js`
```js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// push_deliveries — one row per push attempt (notifications SPEC §5, D-C15; migration sql/010). Written only by
// services/pushDeliveryService.js. No associations — so it is NOT registered in models/index.js (the AppEvent
// pattern). push_token_id has no FK on purpose: tokens are pruned, the delivery record stays.
const PushDelivery = sequelize.define("PushDelivery", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    notification_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    member_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    push_token_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    platform: {
        type: DataTypes.STRING(16),
        allowNull: true
    },
    outcome: {
        type: DataTypes.STRING(16),
        allowNull: false
    },
    error_code: {
        type: DataTypes.STRING(64),
        allowNull: true
    }
}, {
    tableName: "push_deliveries",
    timestamps: false,
    underscored: true
});

module.exports = PushDelivery;
```

### 4. NEW `apps/backend/services/pushDeliveryService.js`
```js
// push_deliveries writer — notifications SPEC §5 (0.4.0, D-C15). ONE bulkCreate per notification send. Fire-and-forget:
// a failed insert is logged (error name + Postgres code only — never the values) and swallowed, so delivery never
// depends on the record.
const PushDelivery = require("../models/PushDelivery");

async function recordDeliveries(rows) {
    if (!rows || rows.length === 0) return;
    try {
        await PushDelivery.bulkCreate(rows);
    } catch (err) {
        console.error("[push] delivery record failed: %s %s", err.name, err.parent?.code || "");
    }
}

module.exports = { recordDeliveries };
```

### 5. NEW `apps/backend/services/deviceService.js`
```js
// Device registry — specs/features/notifications/SPEC.md §3.1 (0.4.0, D-C11/D-C12). One member_push_tokens row per
// installation. EVERY device write goes through here: PUT /device, the login/OAuth push_token ride-along (via
// authService.upsertPushToken), DELETE /device (via authService.removePushToken) and POST /device/unregister.
// R1's sign-out work must call these functions too — never a second path (D-C11).
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
const UPSERT_SQL = `
INSERT INTO member_push_tokens (member_id, device_token, platform, device_id, created_at, updated_at, last_seen_at)
VALUES (:memberId, :pushToken, COALESCE(:platform, 'ios'), :deviceId, now(), now(), now())
ON CONFLICT (device_token) DO UPDATE SET
    member_id    = EXCLUDED.member_id,
    platform     = COALESCE(:platform, member_push_tokens.platform),
    device_id    = COALESCE(EXCLUDED.device_id, member_push_tokens.device_id),
    updated_at   = now(),
    last_seen_at = now()`;

const isUniqueViolation = (err) => err?.parent?.code === "23505";

// Raw SQL inlines its replacements (push token, member id) into err.sql, and callers log errors whole
// (routes/auth.js, DELETE /device) — so a DB error leaves this module scrubbed: name + Postgres code only
// (observability F8). The callers' status codes and response bodies are unchanged (still a non-AppError → 500).
const scrubbed = (err) => {
    const clean = new Error("Device registry write failed.");
    clean.name = `DeviceRegistryError(${err?.name || "Error"})`;
    clean.parent = { code: err?.parent?.code || null };
    return clean;
};

/** PUT /device + the login ride-along. `pushToken` arrives trimmed and non-empty (the callers validate it). */
async function registerDevice({ memberId, pushToken, deviceId, platform }) {
    const replacements = {
        memberId,
        pushToken,
        platform: normalizePlatform(platform),
        deviceId: normalizeDeviceId(deviceId)
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
```

### 6. `apps/backend/services/authService.js` (shared with R1; touch only lines 91-125)
Replace lines 91-125 with the block below. The range runs from the comment `// \`platform\` defaults to "ios" so the LIVE iOS binary…` through the closing `}` of `removePushToken`.
```js
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
```
Leave line 17 (`const { Member, MemberEmail, MemberPushToken } = require("../models");`) **untouched**. R1 owns that region, and an unused import is harmless.

### 7. NEW `apps/backend/utils/push/apns.js`
```js
// APNs sender (iOS) — notifications SPEC §3.2 (0.4.0). getProvider() is the faithful lazy apn.Provider from the
// APNS_* env (null when unset ⇒ every iOS token records `not_configured`, the D-C4 pattern). apn 2.2.0 has no
// request timeout, so send() is raced against APNS_SEND_TIMEOUT_MS (D-C14). Returns one attempt per token —
// { token, outcome: "sent" | "failed" | "pruned" | "not_configured", errorCode } — and never throws.
const apn = require("apn");

const APNS_SEND_TIMEOUT_MS = 10000;
// Dead-token answers (D-C14). apn 2.2.0 (node-http2) reports :status as a STRING ("410"), so compare as strings —
// the pre-0.4.0 numeric `status === 410` never matched (Unregistered still caught those).
const DEAD_TOKEN_REASONS = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

let provider = null;
```
- Then paste **verbatim** the current `function getProvider() { … }` from `apps/backend/utils/pushNotifications.js` lines 14-41.
- Then:
```js
const isDeadToken = (failure) =>
    String(failure.status) === "410" || DEAD_TOKEN_REASONS.has(failure.response?.reason);

// Resolves the send's result, or null when it takes longer than `ms` (a late result is ignored).
const withTimeout = (promise, ms) => {
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const buildNote = (message) => {
    const note = new apn.Notification();
    note.expiry = Math.floor(Date.now() / 1000) + message.ttlSeconds;
    note.sound = "default";
    note.alert = { title: message.title, body: message.body };
    note.topic = process.env.APNS_BUNDLE_ID;
    note.payload = message.data;
    return note;
};

const allTokens = (tokens, outcome, errorCode) => tokens.map((token) => ({ token, outcome, errorCode }));

async function sendApns(tokens, message) {
    if (tokens.length === 0) return [];
    const apnProvider = getProvider();
    if (!apnProvider) {
        console.warn("[push] APNs not configured; skipping iOS.");
        return allTokens(tokens, "not_configured", null);
    }

    let results;
    try {
        results = await withTimeout(
            apnProvider.send(buildNote(message), tokens.map((t) => t.device_token)),
            APNS_SEND_TIMEOUT_MS
        );
    } catch (err) {
        console.error("[push] APNs send error: %s", err.name);
        return allTokens(tokens, "failed", "send_error");
    }
    if (!results) {
        console.warn("[push] APNs send timed out after %d ms.", APNS_SEND_TIMEOUT_MS);
        return allTokens(tokens, "failed", "timeout");
    }

    const byDevice = new Map(tokens.map((t) => [t.device_token, t]));
    const attempts = [];
    for (const ok of results.sent || []) {
        const token = byDevice.get(ok.device);
        if (token) attempts.push({ token, outcome: "sent", errorCode: null });
    }
    for (const fail of results.failed || []) {
        const token = byDevice.get(fail.device);
        if (!token) continue;
        const reason = fail.response?.reason || null;
        console.warn("[push] APNs delivery failed:", { status: fail.status || null, reason });
        attempts.push({
            token,
            outcome: isDeadToken(fail) ? "pruned" : "failed",
            errorCode: reason || (fail.status ? `status_${fail.status}` : "transport_error")
        });
    }
    if (results.sent && results.sent.length > 0) {
        console.log("[push] APNs sent to", results.sent.length, "device(s).");
    }
    return attempts;
}

module.exports = { getProvider, sendApns, isDeadToken };
```

### 8. NEW `apps/backend/utils/push/fcm.js`
```js
// FCM sender (Android) — notifications SPEC §3.2 (0.4.0). getFcmApp() is the faithful lazy, named firebase-admin app
// from FIREBASE_SERVICE_ACCOUNT (null when unset/unparsable ⇒ every Android token records `not_configured`). Every
// message carries an explicit channel id + TTL (D-C13). firebase-admin 12.x already times each send out after 15 s
// (FIREBASE_MESSAGING_TIMEOUT), so no extra timer. Prunes only on dead-token codes; `invalid-argument` is a payload
// bug — logged at error level, token kept (D-C14). Returns one attempt per token —
// { token, outcome: "sent" | "failed" | "pruned" | "not_configured", errorCode } — and never throws.
const admin = require("firebase-admin");

const CHANNEL_DEFAULT = "rasi_default"; // the live Android 1.0.0 channel + its manifest default
const CHANNEL_INVITES = "rasi_invites"; // "Invites & membership", IMPORTANCE_HIGH — created by the next Android build
const INVITE_CHANNEL_TYPES = new Set([
    "program.invite_received",
    "program.role_changed",
    "program.admin_transferred",
    "program.member_removed"
]);
// FCM v1 UNREGISTERED / NOT_FOUND map to registration-token-not-registered (firebase-admin lib/utils/error.js).
const DEAD_TOKEN_CODES = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token"
]);

let fcmApp = null;
```
- Then paste **verbatim** the current comment block plus `function getFcmApp() { … }` from `utils/pushNotifications.js` lines 95-121.
- Then:
```js
const channelIdFor = (type) => (INVITE_CHANNEL_TYPES.has(type) ? CHANNEL_INVITES : CHANNEL_DEFAULT);
const isDeadTokenCode = (code) => DEAD_TOKEN_CODES.has(code);

async function sendFcm(tokens, message) {
    if (tokens.length === 0) return [];
    const app = getFcmApp();
    if (!app) {
        console.warn("[push] FCM not configured; skipping Android.");
        return tokens.map((token) => ({ token, outcome: "not_configured", errorCode: null }));
    }

    let response;
    try {
        response = await admin.messaging(app).sendEachForMulticast({
            tokens: tokens.map((t) => t.device_token),
            // The notification block stays: Android 1.0.0 ignores data-only messages.
            notification: { title: message.title, body: message.body },
            data: message.data,
            android: {
                priority: "high",
                ttl: message.ttlSeconds * 1000, // firebase-admin takes milliseconds
                notification: { channelId: channelIdFor(message.type) }
            }
        });
    } catch (err) {
        console.error("[push] FCM send error: %s", err.code || err.name);
        return tokens.map((token) => ({ token, outcome: "failed", errorCode: err.code || "send_error" }));
    }

    const attempts = response.responses.map((r, i) => {
        const token = tokens[i];
        if (r.success) return { token, outcome: "sent", errorCode: null };
        const code = r.error?.code || "unknown";
        if (code === "messaging/invalid-argument") {
            console.error("[push] FCM invalid-argument — payload bug, token kept: %s", r.error?.message);
        } else {
            console.warn("[push] FCM delivery failed: %s", code);
        }
        return { token, outcome: isDeadTokenCode(code) ? "pruned" : "failed", errorCode: code };
    });
    if (response.successCount > 0) {
        console.log("[push] FCM sent to", response.successCount, "device(s).");
    }
    return attempts;
}

module.exports = { getFcmApp, sendFcm, channelIdFor, isDeadTokenCode };
```

### 9. `apps/backend/utils/pushNotifications.js`: replace the whole file
```js
// Native push facade — specs/features/notifications/SPEC.md §3 + §3.2 (0.4.0). sendPushToMembers is the ONE entry
// point (called by utils/notifications.js after the notification commits):
//   1. one member_push_tokens query for every recipient, both platforms;
//   2. APNs (utils/push/apns.js) and FCM (utils/push/fcm.js) in parallel — 7-day lifetime, explicit FCM channel;
//   3. prune the tokens a provider declared dead (D-C14) — the 60-day unseen prune is pg_cron's (sql/010);
//   4. one push_deliveries row per attempt + one `no_device` row per recipient with no registered device (D-C15).
// Fire-and-forget: never throws. getProvider / getFcmApp stay exported here (unchanged facade surface).
const { MemberPushToken } = require("../models");
const { getProvider, sendApns } = require("./push/apns");
const { getFcmApp, sendFcm } = require("./push/fcm");
const { recordDeliveries } = require("../services/pushDeliveryService");

// APNs apns-expiration and FCM android.ttl (D-C13): 7 days (APNs was 1 h; FCM had none = its 4-week default).
const PUSH_TTL_SECONDS = 7 * 24 * 60 * 60;

// Custom keys on both platforms, all strings (FCM data values must be). Live binaries read only notification_id;
// type + program_id are additive, for tap routing in the next builds (D-C13). program_id is omitted when null.
const buildPushData = ({ id, type, programId }) => {
    const data = { notification_id: String(id || ""), type: String(type || "") };
    if (programId) data.program_id = String(programId);
    return data;
};

const pruneTokens = async (ids) => {
    if (ids.length === 0) return;
    try {
        await MemberPushToken.destroy({ where: { id: ids } });
    } catch (err) {
        console.error("[push] token prune failed: %s %s", err.name, err.parent?.code || "");
    }
};

const attemptRow = (notificationId, { token, outcome, errorCode }) => ({
    notification_id: notificationId,
    member_id: token.member_id,
    push_token_id: token.id,
    platform: token.platform,
    outcome,
    error_code: errorCode ? String(errorCode).slice(0, 64) : null
});

const noDeviceRow = (notificationId, memberId) => ({
    notification_id: notificationId,
    member_id: memberId,
    push_token_id: null,
    platform: null,
    outcome: "no_device",
    error_code: null
});

/**
 * Push one notification to every registered device of the given members (iOS via APNs + Android via FCM) and record
 * every attempt. Payload: { id (notification id), title, body, type, programId }.
 * @param {string[]} memberIds
 * @param {{ id: string, title: string, body: string, type?: string, programId?: string|null }} payload
 */
async function sendPushToMembers(memberIds, payload) {
    const recipients = Array.from(new Set((memberIds || []).filter(Boolean)));
    if (recipients.length === 0 || !payload?.id) return;
    try {
        const tokens = await MemberPushToken.findAll({
            where: { member_id: recipients },
            attributes: ["id", "member_id", "device_token", "platform"],
            raw: true
        });
        const message = {
            title: payload.title || "Notification",
            body: payload.body || "",
            type: payload.type || "",
            data: buildPushData(payload),
            ttlSeconds: PUSH_TTL_SECONDS
        };
        const [apnsAttempts, fcmAttempts] = await Promise.all([
            sendApns(tokens.filter((t) => t.platform === "ios"), message),
            sendFcm(tokens.filter((t) => t.platform === "android"), message)
        ]);
        const attempts = [...apnsAttempts, ...fcmAttempts];
        await pruneTokens(attempts.filter((a) => a.outcome === "pruned").map((a) => a.token.id));

        const rows = attempts.map((attempt) => attemptRow(payload.id, attempt));
        const withDevice = new Set(tokens.map((t) => t.member_id));
        for (const memberId of recipients) {
            if (!withDevice.has(memberId)) rows.push(noDeviceRow(payload.id, memberId));
        }
        await recordDeliveries(rows);
    } catch (err) {
        console.error("[push] sendPushToMembers failed: %s %s", err.name, err.parent?.code || err.code || "");
    }
}

module.exports = { getProvider, getFcmApp, sendPushToMembers, buildPushData, PUSH_TTL_SECONDS };
```

### 10. `apps/backend/utils/notifications.js`: lines 76-80, inside `dispatch`
Replace:
```js
        sendPushToMembers(uniqueRecipients, {
            id: payload.id,
            title: payload.title,
            body: payload.body
        }).catch((err) => console.error("[push] sendPushToMembers error:", err));
```
with:
```js
        // notifications 0.4.0: `type` picks the FCM channel; type + program_id ride in the push data (D-C13).
        sendPushToMembers(uniqueRecipients, {
            id: payload.id,
            title: payload.title,
            body: payload.body,
            type: payload.type,
            programId: payload.program_id
        }).catch((err) => console.error("[push] sendPushToMembers error:", err));
```

### 11. `apps/backend/utils/notificationStreams.js`: replace the whole file
```js
// In-process SSE registry — see specs/features/notifications/SPEC.md §3 (F2: single-instance).
// Maps memberId → the Set of open SSE response streams; sendNotificationToMember writes the
// `event: notification` frame to each, evicting any stream that throws on write.
// 0.4.0 (D-C16): closeAllNotificationStreams ends every stream with a PLAIN close at shutdown (server.js SIGTERM) —
// never a frame: iOS 1.4.x decodes ANY data: frame as a notification. After it runs, a newly registered stream is
// closed at once, so a draining instance holds no stream open.
const streamsByMember = new Map();
let closing = false;

const registerNotificationStream = (memberId, res) => {
    if (closing) {
        res.end();
        return;
    }
    if (!streamsByMember.has(memberId)) {
        streamsByMember.set(memberId, new Set());
    }
    streamsByMember.get(memberId).add(res);
};

const removeNotificationStream = (memberId, res) => {
    const streams = streamsByMember.get(memberId);
    if (!streams) return;
    streams.delete(res);
    if (streams.size === 0) {
        streamsByMember.delete(memberId);
    }
};

const sendNotificationToMember = (memberId, payload) => {
    const streams = streamsByMember.get(memberId);
    if (!streams) return;
    const data = `event: notification\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of streams) {
        try {
            res.write(data);
        } catch (error) {
            removeNotificationStream(memberId, res);
        }
    }
};

// Returns how many streams it closed (logged by server.js).
const closeAllNotificationStreams = () => {
    closing = true;
    let closed = 0;
    for (const streams of streamsByMember.values()) {
        for (const res of streams) {
            try {
                res.end();
                closed += 1;
            } catch (_error) {
                // the socket is already gone
            }
        }
    }
    streamsByMember.clear();
    return closed;
};

module.exports = {
    registerNotificationStream,
    removeNotificationStream,
    sendNotificationToMember,
    closeAllNotificationStreams
};
```

### 12. `apps/backend/routes/notifications.js`
- **12a.** Replace lines 1-11 (the header through `const router = express.Router();`) with:
```js
// /api/notifications routes — see specs/features/notifications/SPEC.md §3.
// MIGRATION DELTA (D-C2): the SSE GET /stream auth (authenticateStream) now lives in middleware/auth.js and
// verifies a Supabase JWT via JWKS (header OR ?token=), replacing the legacy symmetric jwt.verify(JWT_SECRET).
// 0.4.0 (reliability-overhaul R3): PUT /device → services/deviceService (one row per installation, D-C11); net-new
// POST /device/unregister works WITHOUT a login, rate-limited (D-C12); /stream cleans up on either side's close and is
// ended with a plain close on shutdown (D-C16).
const express = require("express");
const { Notification, NotificationRecipient } = require("../models");
const { authenticateToken, authenticateStream } = require("../middleware/auth");
const authService = require("../services/authService");
const deviceService = require("../services/deviceService");
const { rateLimit } = require("../utils/rateLimit");
const { AppError } = require("../utils/response");
const { registerNotificationStream, removeNotificationStream } = require("../utils/notificationStreams");
const { createNotification, getMemberIdsWithPushTokens } = require("../utils/notifications");

const router = express.Router();

// D-C12: the same per-client window as POST /api/client-events (observability D-C4). One call per sign-out is the
// expected rate; a shared NAT still has headroom.
const limitUnregister = rateLimit({ windowMs: 60 * 1000, max: 30 });
```
- **12b.** In `PUT /device`:
  - Replace the line `        await authService.upsertPushToken(req.user.id, pushToken.trim(), req.body.device_id, req.body.platform);` with:
  ```js
          await deviceService.registerDevice({
              memberId: req.user.id,
              pushToken: pushToken.trim(),
              deviceId: req.body.device_id,
              platform: req.body.platform
          });
  ```
  - Replace its catch log line `        console.error("Error registering device:", error);` with:
  ```js
          // Name + Postgres code only — never the push token (observability F8).
          console.error("[push] device register failed: %s %s", error.name, error.parent?.code || "");
  ```
  - The 400 and 500 response lines stay byte-identical.
- **12c.** Directly after the closing `});` of `router.delete("/device", …)`, insert:
```js

// D-C12: unregister WITHOUT a login — the push token and/or the install id prove the device (sign-out paths run
// exactly when the session is gone). 200 for every valid body, matched or not (no existence oracle).
router.post("/device/unregister", limitUnregister, async (req, res) => {
    try {
        await deviceService.unregisterDevice({
            pushToken: req.body?.push_token,
            deviceId: req.body?.device_id
        });
        res.json({ message: "Device unregistered from push notifications." });
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        console.error("[push] device unregister failed: %s %s", error.name, error.parent?.code || "");
        res.status(500).json({ error: "Failed to unregister device." });
    }
});
```
- **12d.** Replace the whole `router.get("/stream", …)` block (current lines 127-146) with:
```js
router.get("/stream", authenticateStream, (req, res) => {
    const memberId = req.user.id;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    res.write(`event: ready\ndata: {}\n\n`);
    registerNotificationStream(memberId, res);

    // Keepalive every 25 s; skipped once the response has ended (the shutdown close, D-C16).
    const pingInterval = setInterval(() => {
        if (!res.writableEnded) res.write(`event: ping\ndata: {}\n\n`);
    }, 25000);

    // Cleanup runs once, on whichever closes first: the client (req) or the server's shutdown close (res).
    let cleanedUp = false;
    const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearInterval(pingInterval);
        removeNotificationStream(memberId, res);
    };
    req.on("close", cleanup);
    res.on("close", cleanup);
});
```
- `DELETE /device`, `/unacknowledged`, `/broadcast` and `/:id/acknowledge` stay byte-identical. `DELETE /device` still logs its error whole, which is now safe because `deviceService` scrubs DB errors.

### 13. `apps/backend/server.js` (shared; R3 edits only the tail)
Replace lines 122-137, from `const PORT = …` to EOF, with:
```js
const PORT = process.env.PORT || 5001;
// notifications 0.4.0 (D-C16): the HTTP server handle, kept for the graceful shutdown at the end of this file.
let server = null;

const startServer = async () => {
    try {
        await connectDB();
        await assertDatabaseSchema(); // auth D-C13: staging must be on `staging`; prod only logs if it is
        console.log("Database connected successfully");
        // Bind 0.0.0.0 explicitly — Render (and most PaaS) require it to route external traffic.
        server = app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
};

startServer();

// notifications 0.4.0 (D-C16) — graceful shutdown. Render sends SIGTERM on every deploy / restart and kills the
// process 30 s later. Order: end every SSE stream with a PLAIN close (never a frame — iOS 1.4.x decodes any data:
// frame as a notification) → stop accepting connections and drop idle keep-alive sockets → exit 2 s after the server
// has closed (lets a just-dispatched push finish) → hard exit at 25 s whatever is still open.
const { closeAllNotificationStreams } = require("./utils/notificationStreams");
const SHUTDOWN_DRAIN_MS = 2000;
const SHUTDOWN_HARD_EXIT_MS = 25000;
let shuttingDown = false;

const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const streamsClosed = closeAllNotificationStreams();
    console.log(JSON.stringify({ type: "shutdown", signal, sse_streams_closed: streamsClosed }));
    setTimeout(() => process.exit(0), SHUTDOWN_HARD_EXIT_MS).unref();
    if (!server) return process.exit(0);
    server.close(() => setTimeout(() => process.exit(0), SHUTDOWN_DRAIN_MS).unref());
    server.closeIdleConnections?.();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

### 14. NEW `apps/backend/services/inviteSendService.js`
```js
// POST /invite — sendInvite (invites SPEC §4, 0.2.0), split out of inviteService.js (it was 334 lines). Faithful authz
// + privacy-safe no-op chain, EXCEPT:
//   D-C4 — the write is ONE managed transaction: supersede an expired pending invite, create the invite, write its
//          program.invite_received notification (createNotification dispatches SSE/push afterCommit).
//   D-C5 — every no-op returns its reason; routes/invites.js logs it and still answers "Invitation sent".
//   D-C6 — a non-string username / non-UUID program_id is a 400 (both used to be swallowed 200s).
const crypto = require("crypto");
const { Member, Program, ProgramMembership, ProgramInvite, ProgramInviteBlock } = require("../models");
const { sequelize } = require("../config/database");
const { AppError } = require("../utils/response");
const { createNotification } = require("../utils/notifications");

const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // F6: hard-coded 30-day expiry (faithful)
const PENDING_INVITE_INDEX = "uniq_program_invites_program_username_pending"; // sql/001_schema.sql:277
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const noop = (reason) => ({ sent: false, reason });

// A concurrent send for the same username won the partial unique index — the same no-op as an existing invite.
const isPendingInviteRace = (err) =>
    err?.parent?.code === "23505" && err.parent.constraint === PENDING_INVITE_INDEX;

async function sendInvite({ program_id, username } = {}, requester) {
    if (typeof program_id !== "string" || !UUID_RE.test(program_id) || typeof username !== "string" || !username) {
        throw new AppError(400, "program_id and username are required.");
    }

    const isGlobalAdmin = requester?.global_role === "global_admin";
    if (!isGlobalAdmin) {
        const pm = await ProgramMembership.findOne({
            where: { program_id, member_id: requester?.id, role: "admin", status: "active" }
        });
        if (!pm) throw new AppError(403, "Admin privileges required for this program.");
    }

    const program = await Program.findOne({ where: { id: program_id, is_deleted: false } });
    if (!program) return noop("program_not_found");

    const normalizedUsername = username.trim().toLowerCase();
    const targetMember = await Member.findOne({
        where: sequelize.where(sequelize.fn("LOWER", sequelize.col("username")), normalizedUsername)
    });
    if (!targetMember) return noop("unknown_username");

    const existingMembership = await ProgramMembership.findOne({
        where: { program_id, member_id: targetMember.id }
    });
    if (existingMembership && existingMembership.status !== "removed") return noop("already_member");

    const blocked = await ProgramInviteBlock.findOne({
        where: { program_id, member_id: targetMember.id }
    });
    if (blocked) return noop("blocked");

    const existingInvite = await ProgramInvite.findOne({
        where: { program_id, invited_username: targetMember.username, status: "pending" }
    });
    const isExpired = existingInvite?.expires_at && new Date(existingInvite.expires_at) < new Date();
    if (existingInvite && !isExpired) return noop("pending_invite");

    try {
        await sequelize.transaction(async (transaction) => {
            if (existingInvite) await existingInvite.update({ status: "expired" }, { transaction });
            await ProgramInvite.create({
                program_id,
                invited_by: requester.id,
                invited_username: targetMember.username,
                token_hash: crypto.randomBytes(32).toString("hex"),
                status: "pending",
                max_uses: 1,
                uses_count: 0,
                expires_at: new Date(Date.now() + INVITE_TTL_MS)
            }, { transaction });
            await createNotification({
                type: "program.invite_received",
                programId: program_id,
                actorMemberId: requester?.id || null,
                title: "Program invitation",
                body: `You've been invited to join ${program.name}.`,
                recipientIds: [targetMember.id],
                transaction
            });
        });
    } catch (err) {
        if (isPendingInviteRace(err)) return noop("pending_invite");
        throw err;
    }

    return { sent: true, reason: null };
}

module.exports = { sendInvite };
```

### 15. `apps/backend/services/inviteService.js`
- **15a.** After line 8 (`// ported notifications engine (no stub; the keystone is already ported).`), insert:
```js
// 0.2.0 (reliability overhaul R3): sendInvite moved to services/inviteSendService.js (one transaction + logged no-op
// reasons — invites D-C4/D-C5); getMyInvites hides expired invites (D-C7).
```
- **15b.** Delete line 9: `const crypto = require("crypto");`.
- **15c.** Delete the whole `async function sendInvite(…) { … }` (current lines 16-85) plus the blank line after it.
- **15d.** In `getMyInvites`, replace `        where: { invited_username: requester.username, status: "pending" },` with:
```js
        where: {
            invited_username: requester.username,
            status: "pending",
            // invites 0.2.0 (D-C7): expired invites are hidden — accepting one would only 400 "expired".
            [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: new Date() } }]
        },
```
- **15e.** Change `module.exports` to `module.exports = {\n    getMyInvites,\n    getAllInvites,\n    respondToInvite\n};`, removing `sendInvite`.
- All other imports stay; they are still used. The file ends at about 265 lines (`respondToInvite` alone is 160). This is accepted.

### 16. `apps/backend/routes/invites.js`
Replace lines 1-22, from the header through the end of `router.post("/invite", …)`, with:
```js
// /api/program-memberships invite routes — faithful to legacy routes/invites.js
// (specs/features/invites/SPEC.md §3). Co-mounted with memberships under /api/program-memberships
// (server.js — inviteRoutes alongside membershipRoutes, mirroring legacy server.js:50). All routes are
// authenticateToken-only at the router; the program-admin / global-admin / self authz lives in the services.
// POST /invite (0.2.0): privacy-safe for every no-op — the client always gets 200 { message: "Invitation sent" }, sent
// or not (F1); the no-op reason is logged server-side, never the username (D-C5). An unexpected failure is a real
// 500 { error } (D-C6 — it used to be a false 200).
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const inviteService = require("../services/inviteService");
const { sendInvite } = require("../services/inviteSendService");
const { AppError } = require("../utils/response");

const router = express.Router();

router.post("/invite", authenticateToken, async (req, res) => {
    try {
        const { reason } = await sendInvite(req.body, req.user);
        if (reason) {
            console.log(JSON.stringify({
                type: "invite_noop",
                request_id: req.id,
                program_id: req.body.program_id,
                reason
            }));
        }
        res.json({ message: "Invitation sent" });
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
        // Name + Postgres error code only — a Sequelize error message can echo the username (observability F8).
        console.error("[invites] send failed: %s %s", err.name, err.parent?.code || "");
        res.status(500).json({ error: "Failed to send invitation." });
    }
});
```
The other three routes are unchanged.

### 17. `apps/backend/sql/README.md` (shared; append one row and edit one comment)
- After the `008_staging_schema.sql` row (line 20), insert:
```markdown
| `010_push_deliveries_device_registry.sql` | **Phase 3 R3** ([`notifications`](../../../specs/features/notifications/SPEC.md) 0.4.0): `member_push_tokens.last_seen_at` (added, default set, backfilled from `updated_at`, then `NOT NULL` — in that order so old installs aren't stamped "now") + partial unique `device_id` (the install id) + `push_deliveries` (one row per push attempt; RLS on `public` only; explicit grants + RLS off on `staging`) + two nightly `pg_cron` jobs per schema (`push_deliveries_retention_<schema>` 90 days at 04:22 UTC; `member_push_tokens_prune_<schema>` at 04:27 UTC when `last_seen_at` AND `updated_at` are both older than 60 days — the second clause keeps a rolled-back backend from pruning active installs). Schema-neutral — run **staging first, then public** (step 4 below), each followed by the VERIFY block at the end of the file. **Pre-flight (read-only):** `SELECT device_id, count(*) FROM member_push_tokens WHERE device_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;` → 0 rows. **Run on `public` before the backend commit reaches `main`** (its `PUT /device` writes `last_seen_at`). Independent of 009. |
```
- On line 85, replace `-- 15 (14 + app_events; + later tables)` with `-- 16 after 007 + 010 (14 + app_events + push_deliveries); + any tables 009 adds`.

### 18. `apps/backend/CONTEXT.md` (shared; append only)
After line 24 (the `app_events` bullet), insert:
```markdown
- **Added (reliability overhaul Phase 3 R3):** `push_deliveries` (one row per push attempt + `no_device`; 90-day `pg_cron` retention) and the device registry on `member_push_tokens` (`last_seen_at`, unique install `device_id`, nightly 60-day unseen prune) — migration `sql/010`, [`notifications`](../../specs/features/notifications/SPEC.md) 0.4.0.
```

### 19. `specs/features/notifications/SPEC.md` (0.3.1 → 0.4.0)
Date cells: write the output of `date +%F` on the day of the edit.

- **19a.** Line 3: `**Version:** 0.3.1` → `**Version:** 0.4.0`.
- **19b.** Line 24: `Legacy ships **6 routes** at \`/api/notifications\` (\`server.js:61\`), all owned here:` → `Legacy ships **6 routes** at \`/api/notifications\` (\`server.js:61\`), all owned here, plus one net-new route (0.4.0, item 4):`
- **19c.** Replace lines 29-30 (item 4) with:
```markdown
4. **Device registry** — `PUT /device` + `DELETE /device` + (0.4.0, net-new) `POST /device/unregister` (no login) —
   the APNs (iOS) + FCM (Android) token lifecycle, one row per installation (`services/deviceService.js`; §3.1,
   D-C11/D-C12).
```
- **19d.** §3 table:
  - Replace row 2 (line 58) with `| 2 | \`PUT /device\` | \`notifications.js:61-73\` | \`authenticateToken\` | Register this installation's push token → \`deviceService.registerDevice\` (§3.1, D-C11). \`400\` if \`push_token\` missing. |`
  - Replace row 3 (line 59) with `| 3 | \`DELETE /device\` | \`notifications.js:75-84\` | \`authenticateToken\` | Unregister → \`authService.removePushToken(req.user.id, push_token?)\` → \`deviceService.unregisterMemberDevices\` (null token = all the member's tokens). Unchanged. |`
  - After row 6 (line 62), add `| 7 | \`POST /device/unregister\` | net-new (0.4.0) | **none** — per-client rate limit (D-C12) | Unregister a device **without a login**: the push token and/or install id prove the device (§3.1). |`
- **19e.** Line 70: replace `(APNs). When called` with `(APNs + FCM + delivery records, §3.2). When called`.
- **19f.** Replace the APNs bullet (lines 76-79) with:
```markdown
- **Native push** (`utils/pushNotifications.js` facade → `utils/push/apns.js` + `utils/push/fcm.js`, 0.4.0) —
  `sendPushToMembers(memberIds, { id, title, body, type, programId })` runs ONE token query for both platforms,
  sends APNs (lazy `apn.Provider` from `APNS_*`) and FCM (lazy `firebase-admin` app from `FIREBASE_SERVICE_ACCOUNT`)
  in parallel with the §3.2 settings, prunes the tokens a provider declared dead (D-C14), and writes one
  `push_deliveries` row per attempt plus one `no_device` row per recipient with no registered device (D-C15). A sender
  whose credentials are unset records `not_configured` (the D-C4 pattern). Never throws.
```
- **19g.** Line 89: replace `- **\`PUT\`/\`DELETE /device\`** → \`{ message }\`.` with `- **\`PUT\`/\`DELETE /device\`** and **\`POST /device/unregister\`** → \`{ message }\` (§3.1).`
- **19h.** After line 97 (the end of "### Error contract (faithful)") and before `## 4.`, insert:
````markdown
(0.4.0: the net-new `POST /device/unregister` carries a `code` on its `400` / `429` — the existing backend codes
`invalid_body` (observability client-events) and `rate_limited` (`utils/rateLimit`). This feature adds **no new
`code`**; its 500s are `{ error }` like every backend 500 — the frontend-kit derives `server` from the status.)

### 3.1 Device registry — client contract (0.4.0, D-C11/D-C12)

All under `/api/notifications`. The next web / iOS / Android builds follow this; live binaries keep working unchanged
(they send no `device_id` and never call `/device/unregister`).

**Install id (`device_id`).** Each installation generates a random UUID v4 once, on first launch, and stores it where
**neither backup/restore nor device-to-device transfer can copy it to another device**:

- **iOS:** a keychain item (`kSecClassGenericPassword`, service `com.app.rasifiters.install-id`) with
  `kSecAttrAccessible = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` — `…ThisDeviceOnly` items never migrate to
  another device (an encrypted backup restores them to the same device only). Never `UserDefaults`,
  `NSUbiquitousKeyValueStore` or a file in the app container: all of those are restored onto a new device. Surviving
  an uninstall/reinstall on the same device is fine.
- **Android:** a file named `install_id` in `Context.noBackupFilesDir` — the platform excludes that directory from
  Auto Backup (all API levels) and from device-to-device transfer (API 31+). Never SharedPreferences / DataStore: the
  app ships `android:allowBackup="true"` with no backup rules (`AndroidManifest.xml:26`), so those are backed up and
  restored.
- **Web:** no native push; sends none.

The server uses `device_id` only when it is a UUID (case-insensitive, stored lower-case); any other value is ignored.
Two live installs sharing one id would evict each other's row on every registration, so push would reach only the
device that registered last (F13). The storage rule above is what prevents that — the server cannot tell the two
devices apart.

**`PUT /device`** — `Authorization: Bearer <access token>` required.

```json
{ "push_token": "<APNs device token (hex) | FCM registration token>", "platform": "android", "device_id": "6f1c2a0e-3b5d-4c1a-9e7f-2a4b6c8d0e1f" }
```

| Field | Rule |
|---|---|
| `push_token` | required — a non-empty string after trim |
| `platform` | `"ios"` or `"android"`; omitted / anything else → `"ios"` for a **new** row, the stored value for an **existing** row |
| `device_id` | optional — the install UUID (above) |

| Status | Body | When |
|---|---|---|
| `200` | `{ "message": "Device registered for push notifications." }` | registered (unchanged) |
| `400` | `{ "error": "push_token is required." }` | `push_token` missing / empty / not a string |
| `401` / `503` | per `authenticateToken` (auth D-C11) | bad / expired token · verifier outage |
| `500` | `{ "error": "Failed to register device." }` | DB failure |

Server effect, one transaction: with a `device_id`, the install's rows holding a different token are deleted (token
rotation); then an upsert on `push_token` re-binds the row to the caller, applies the `platform` rule, keeps the stored
`device_id` when none is sent, and sets `updated_at = last_seen_at = now()`. **Call it** after every sign-in, on every
launch / foreground while signed in with notification permission granted, and on every token rotation (iOS
`didRegisterForRemoteNotificationsWithDeviceToken`, Android `onNewToken`). Repeats are idempotent. The same
registration rides along on `POST /api/auth/login/app`, `POST /api/auth/login/global` and `POST /api/auth/oauth`
(body fields `push_token`, `device_id`, `platform` — identical rules).

**`DELETE /device`** — unchanged: Bearer; body `{ "push_token"?: string }`; removes that one of the caller's tokens, or
all of them; `200 { "message": "Device unregistered from push notifications." }`.

**`POST /device/unregister`** — **no login** (a Bearer, if sent, is ignored). The push token and/or the install id
prove the device. Send `Content-Type: application/json`.

```json
{ "push_token": "<token>", "device_id": "6f1c2a0e-3b5d-4c1a-9e7f-2a4b6c8d0e1f" }
```

At least one must be usable: `push_token` a non-empty string of ≤ 512 chars after trim; `device_id` a UUID. Every row
whose token equals `push_token` **or** whose install id equals `device_id` is deleted, whoever it is bound to.

| Status | Body | When |
|---|---|---|
| `200` | `{ "message": "Device unregistered from push notifications." }` | a valid body — whether or not a row matched (no existence oracle) |
| `400` | `{ "error": "push_token or device_id is required.", "code": "invalid_body" }` | neither field usable (also a body sent without the JSON content type) |
| `429` | `{ "error": "Too many requests. Try again later.", "code": "rate_limited" }` + `Retry-After` | > 30 requests / 60 s from one client (IPv4 address / IPv6 /64) |
| `500` | `{ "error": "Failed to unregister device." }` | DB failure (malformed JSON → `500 { "error": "Internal server error." }` from the global parser — observability F2) |

**Call it** on every sign-out path — voluntary and forced (refresh `401 session_invalid`) — and when notification
permission is revoked, sending both fields. One retry on a network error / 5xx, then drop. **Ordering rule:**
unregister and registration go through ONE serial queue per install. A sign-in's login ride-along / `PUT /device`
starts only after any in-flight unregister has finished (success, or failure after its single retry), and a pending
retry is dropped the moment a sign-in begins. Never send an unregister after the next registration has started — it
would delete the new session's row (same token, same install id). Afterwards forget the cached push token and any
"already registered" memo (e.g. Android's in-memory dedupe), so the next sign-in registers again; keep the install id.
(Account deletion needs no call — the member's rows cascade.)

**Pruning.** A row is deleted when APNs answers `410` / `BadDeviceToken` / `Unregistered` / `DeviceTokenNotForTopic`,
when FCM answers `messaging/registration-token-not-registered` or `messaging/invalid-registration-token`, and nightly
when `last_seen_at` **and** `updated_at` are both older than 60 days (they move together; the second clause keeps a
rolled-back backend from pruning active installs). A pruned install comes back with its next `PUT /device`.

### 3.2 Push delivery (0.4.0, D-C13–D-C15)

| | APNs (iOS) | FCM (Android) |
|---|---|---|
| Visible alert | `aps.alert { title, body }`, `aps.sound "default"` | `notification { title, body }` |
| Custom keys | top-level `notification_id`, `type`, `program_id` | `data { notification_id, type, program_id }` |
| Lifetime | `apns-expiration` = send time + **604800 s (7 days)** (was 1 h) | `android.ttl` = **604800 s** (was unset = FCM's 4-week default) |
| Priority | APNs default (10) | `android.priority "high"` (every message shows a notification) |
| Channel | — | `android.notification.channel_id` (below) |

Custom keys are strings; `program_id` is omitted when the notification has none. Live binaries read only
`notification_id`; `type` + `program_id` are additive, for tap routing.

| Android channel id | Name | Importance | Notification types |
|---|---|---|---|
| `rasi_invites` | Invites & membership | `IMPORTANCE_HIGH` | `program.invite_received`, `program.role_changed`, `program.admin_transferred`, `program.member_removed` |
| `rasi_default` | (existing) | `IMPORTANCE_DEFAULT` | every other type (`program.member_joined`, `program.member_left`, `program.updated`, `program.deleted`, `app.broadcast`, any future type) |

The next Android build creates both channels at startup and keeps `rasi_default` as the manifest default
(`com.google.firebase.messaging.default_notification_channel_id`). Android 1.0.0 has only `rasi_default`; FCM shows a
message whose channel id doesn't exist on the device in the manifest default channel, so its invites keep arriving
there. **Clients (next builds):** a tap reads `notification_id` → `POST /:id/acknowledge` and opens the target
(`type` + `program_id`); Android shows foreground messages. Push is only a hint — state is always re-fetched.

**Delivery record:** every attempt is a `push_deliveries` row (§5) — `sent`; `failed` (token kept; `error_code` = the
APNs reason / FCM code / `timeout` / `send_error`); `pruned` (dead token, row removed); `not_configured` (provider
credentials unset); plus one `no_device` row per recipient with no registered token.

### 3.3 Real-time stream — client contract (0.4.0, D-C16)

`GET /api/notifications/stream` — `Authorization: Bearer <token>` (iOS / Android) **or** `?token=<token>` (web
`EventSource`, which can't set headers — kept; the request log records only the route template, never the URL, so the
token is never logged).

| Frame | When |
|---|---|
| `event: ready` + `data: {}` | once, right after the stream opens |
| `event: ping` + `data: {}` | every 25 s (keepalive) |
| `event: notification` + `data: <the 7-field payload>` | each new notification for this member |

No other event type is ever added — iOS 1.4.x decodes any non-`{}` `data:` frame as a notification. On a deploy or
restart (`SIGTERM`) the server ends every stream with a **plain close** — no frame; a stream opened while the instance
is shutting down gets `ready` and then the close. `401 { "error": … }` on open = missing / bad / expired token (today
also a JWKS / DB outage — F11, moving to `503` in the auth track).

**Clients (next builds):** keep the stream open only in the foreground; treat every close or error as "reconnect": get
a fresh access token first (refresh when it expires within 60 s), reconnect with exponential backoff + full jitter
(values fixed by the client plans), and **after every `ready`** re-fetch `GET /unacknowledged` and merge by `id` (the
stream never replays). Web re-creates its `EventSource` with a fresh `?token=` on every token refresh.
`GET /unacknowledged` is idempotent, per member, oldest-first and unthrottled — safe to call on every (re)connect.
````
- **19i.** §4:
  - Replace the `PUT /device` bullet (lines 104-106) with:
```markdown
- **`PUT /device`** (`:61-73`) — validate non-empty string `push_token`; **0.4.0:** `deviceService.registerDevice({
  memberId, pushToken: push_token.trim(), deviceId: device_id, platform })` (§3.1, D-C11); a failure logs error name +
  Postgres code only. iOS 1.4.x sends `{ push_token }` only and Android 1.0.0 `{ push_token, platform }` — both
  unchanged.
```
  - After the `DELETE /device` bullet (line 107), add:
```markdown
- **`POST /device/unregister`** (0.4.0, net-new) — per-client `rateLimit` (30 / 60 s) → `deviceService.unregisterDevice({
  pushToken, deviceId })`; `400 invalid_body` when neither is usable, else `200` (§3.1, D-C12).
```
  - At the end of the `GET /stream` bullet (line 115, after `+ \`removeNotificationStream\`.`), append: ` **0.4.0:** the ping is skipped once the response has ended; cleanup on \`req\` *or* \`res\` close; ended with a plain close on shutdown (§3.3, D-C16).`
- **19j.** §5:
  - Replace the `member_push_tokens` bullet (lines 132-133) with:
```markdown
- **`member_push_tokens`** (owned — written only by `services/deviceService.js` [`PUT /device`, the login ride-along
  via `authService.upsertPushToken`, `DELETE /device`, `POST /device/unregister`], read by the push facade + broadcast,
  pruned by the facade + `pg_cron`) — `id`, `member_id`, `device_token` (unique), `platform` (default `ios`), `device_id?`
  (**0.4.0: the install id** — UUID-only, partial unique index `uniq_member_push_tokens_device_id`), timestamps,
  **`last_seen_at`** (0.4.0 — `NOT NULL DEFAULT now()`, indexed, backfilled from `updated_at`) (`001_schema.sql:162-172`,
  `sql/010`).
- **`push_deliveries`** (owned, 0.4.0 — `sql/010`, `models/PushDelivery.js`, written only by
  `services/pushDeliveryService.js`) — the table below.
```
  - After the last §5 bullet (line 137) and before `## 6.`, insert:
```markdown

**`push_deliveries`** (RLS on the `public` copy only, no policies; staging copy granted to `rasifiters_staging`):

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` / Sequelize UUIDV4 |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | attempt time — retention + query axis |
| `notification_id` | `uuid NOT NULL` | FK → `notifications(id)` **ON DELETE CASCADE** |
| `member_id` | `uuid NOT NULL` | FK → `members(id)` **ON DELETE CASCADE** |
| `push_token_id` | `uuid` | the `member_push_tokens.id` attempted — **no FK** (tokens are pruned); `null` for `no_device` |
| `platform` | `varchar(16)` | `ios` / `android`; `null` for `no_device` |
| `outcome` | `varchar(16) NOT NULL` | CHECK `sent` · `failed` · `pruned` · `no_device` · `not_configured` |
| `error_code` | `varchar(64)` | APNs reason (`BadDeviceToken`, …) or `status_<n>` / `transport_error`; FCM `messaging/…` code; `timeout`; `send_error`; `null` for `sent` / `no_device` / `not_configured` |

Indexes `created_at`, `(member_id, created_at)`, `notification_id`. Retention: `pg_cron`
`push_deliveries_retention_<schema>` daily 04:22 UTC (> 90 days). Unseen tokens: `member_push_tokens_prune_<schema>`
daily 04:27 UTC (`last_seen_at` and `updated_at` both > 60 days).
```
- **19k.** In §6, before `## 7.`, add:
```markdown
- **Constants (0.4.0 — code, not env; no new env var):** APNs expiry + FCM TTL `PUSH_TTL_SECONDS = 604800` (7 days,
  `utils/pushNotifications.js`); APNs send timeout `10000` ms (`utils/push/apns.js`; FCM = firebase-admin's built-in
  15 s); FCM channels `rasi_default` / `rasi_invites` (`utils/push/fcm.js`); unregister limit 30 / 60 s per client
  (`routes/notifications.js`); shutdown drain `2000` ms + hard exit `25000` ms (`server.js`); retention 90 days /
  unseen prune 60 days (`sql/010` cron). Staging runs `APNS_PRODUCTION=false` (sandbox tokens) and the same Firebase
  project.
```
- **19l.** §9:
  - At the end of the D-REF row's Decision cell (line 208), append ` **Superseded in part:** Android joined with FCM in D-C9; the device-lifecycle contract is D-C11/D-C12 (0.4.0).`
  - After the D-C10 row (line 215), append:
```markdown
| **D-C11** | **Device registry = one row per installation (0.4.0).** The install id is the EXISTING `device_id` field/column (already accepted by `PUT /device` and both login routes; null on all 35 prod rows; no live build sends it), used only when it is a UUID, with partial unique index `uniq_member_push_tokens_device_id`. Clients keep it where backup/restore and device transfer can't copy it — iOS keychain `…ThisDeviceOnly`, Android `noBackupFilesDir` (§3.1, F13). `deviceService.registerDevice`: one transaction — delete the install's rows holding another token (rotation), then an atomic `INSERT … ON CONFLICT (device_token)` that re-binds the token to the caller (faithful) and stamps `last_seen_at` on **every** call, old builds included (`sql/010` backfills it from `updated_at` so old installs aren't pruned); one retry on a `23505` race. `platform` omitted/unknown → `"ios"` for a NEW row only; an existing row keeps its platform (fixes the latent Android OAuth-login flip, `Dtos.kt:74-80`). DB errors leave `deviceService` scrubbed to name + Postgres code (its raw SQL would otherwise put the push token in callers' logs — observability F8). `authService.upsertPushToken`/`removePushToken` now delegate here (exports + login callers unchanged). **Every server-side device write goes through `deviceService` — Phase 3 R1's sign-out work adds no second path.** | DESIGN_BOARD §3.4; W2 E5/F8/F10; user decision (Phase 3 R3 plan). |
| **D-C12** | **Unregister without a login (0.4.0).** New `POST /device/unregister` (no auth): `push_token` and/or `device_id` prove the device; every matching row is deleted whoever owns it; `200` for every valid body (no existence oracle), `400 invalid_body` otherwise (the existing client-events code — no new `code`); per-client `rateLimit` 30 / 60 s (the `utils/rateLimit` primitive, same window as client-events). Clients serialize unregister before the next registration (§3.1 ordering rule). A new route rather than optional auth on `DELETE /device`, so the live binaries' endpoint stays byte-identical. | DESIGN_BOARD §2 client rule 5 + §3.4; observability D-C4. |
| **D-C13** | **Delivery settings (0.4.0).** APNs `apns-expiration` = now + 604800 s (was 3600 — an iPhone offline > 1 h lost the push, W2 F11); FCM `android.ttl` 604800 s + `priority "high"` + an explicit `android.notification.channel_id`: `rasi_invites` for `program.invite_received` / `program.role_changed` / `program.admin_transferred` / `program.member_removed`, `rasi_default` for every other type (Android 1.0.0 has only `rasi_default`; FCM falls back to the manifest default for an unknown id). Custom keys `type` + `program_id` join `notification_id` on both platforms (additive). The FCM `notification` block stays (1.0.0 ignores data-only messages). | DESIGN_BOARD §3.5; W2 §7.4, F11; Android `App.kt:20-27`, `strings.xml:5`, manifest `:82-83`. |
| **D-C14** | **Pruning + send timeouts (0.4.0).** Prune on APNs `410` (now compared as a string — apn 2.2.0's node-http2 reports `:status` as `"410"`, so the old numeric check never matched) / `BadDeviceToken` / `Unregistered` / `DeviceTokenNotForTopic`, and FCM `messaging/registration-token-not-registered` (FCM v1 `UNREGISTERED` / `NOT_FOUND`) / `messaging/invalid-registration-token`. **`messaging/invalid-argument` never prunes** — a payload bug, logged at error level (W2 F9). Plus the nightly unseen prune (`pg_cron`, `sql/010`): `last_seen_at` AND `updated_at` both > 60 days — the `updated_at` clause makes a code rollback safe (pre-0.4.0 code bumps only `updated_at`). APNs `send()` is raced against 10 s (apn 2.2.0 has no request timeout; a late result is ignored and the attempt records `failed`/`timeout`); FCM relies on firebase-admin's built-in 15 s. | DESIGN_BOARD §3.4; W2 F9/F10; `apn/lib/client.js`; firebase-admin `lib/utils/error.js`. |
| **D-C15** | **`push_deliveries` (0.4.0).** `sendPushToMembers` runs ONE token query for both platforms (was one per platform), sends APNs + FCM in parallel, prunes, then writes one row per attempt plus one `no_device` row per recipient with no registered device (was a silent return — W2 F2/E8) in ONE `bulkCreate` (`services/pushDeliveryService.js`; fire-and-forget — a failed insert logs name + pg code and never affects delivery). Schema §5; 90-day `pg_cron` retention like `app_events`; migration `sql/010` (schema-neutral, staging grants). Delivers observability D-C9's deferred `push_deliveries`. | DESIGN_BOARD §3.3 + §7.2; W2 F2/E8; observability D-C9. |
| **D-C16** | **SSE survives deploys cleanly (0.4.0).** `server.js` handles `SIGTERM`/`SIGINT`: `closeAllNotificationStreams()` ends every stream with a plain `res.end()` (never a frame), streams opened afterwards close right after `ready`, `server.close()` + `closeIdleConnections()`, exit 2 s after the server closes, hard exit at 25 s (Render's grace is 30 s); one JSON log line `{"type":"shutdown",…}`. The ping is skipped once the response has ended; cleanup runs on `req` **or** `res` close. Frames, the 25 s ping, `?token=` and `/unacknowledged` are unchanged; `?token=` was already absent from the request log (observability D-C1 logs the route template only) — verified, no change. | DESIGN_BOARD §3.6; W2 F6; Render SIGTERM grace. |
```
- **19m.** §10:
  - In the F3 row (line 223), append to the Characteristic cell ` **Superseded 0.4.0 (D-C11):** \`device_id\` is the install id (UUID-only); still null on every row until the next client builds send it.` and replace its last cell `Kept (faithful).` with `Superseded (D-C11).`
  - After the F6 row (line 228), append:
```markdown
| **F9** | **Shutdown can cut an in-flight push** — `server.js` exits 2 s after the HTTP server closes (hard 25 s); a push dispatched by one of the last requests may lose its send or its `push_deliveries` row. The notification row + `/unacknowledged` backfill still deliver it. | `server.js` shutdown | Accepted. |
| **F10** | **`POST /device/unregister` trusts possession** — whoever holds a push token or an install id can unregister that device (by design: sign-out runs when the login is gone, D-C12). Neither value is shown to other members; the effect is "no push until the device's next `PUT /device`". | `services/deviceService.js` | Accepted. |
| **F11** | **`authenticateStream` answers `401` for a JWKS / DB outage** (`middleware/auth.js:113-115`), unlike `authenticateToken`'s `503` (auth D-C11) — web `EventSource` stops for good on a 401. | `middleware/auth.js` | Yes — Phase 3 R1 (auth track). |
| **F12** | **A malformed FCM token is never pruned on send** — FCM v1 reports it as `INVALID_ARGUMENT`, which D-C14 treats as a payload bug; it stays until the 60-day unseen prune or the install's next registration replaces it. | `utils/push/fcm.js` | Accepted. |
| **F13** | **Two installs sharing one install id evict each other** — `registerDevice` deletes the install's rows holding another token, so a copied id (backup restore / device transfer onto a second device) leaves push on whichever device registered last. The server can't distinguish them; the §3.1 storage rule (keychain `…ThisDeviceOnly` / `noBackupFilesDir`) prevents it. | `services/deviceService.js` | Client plans (storage rule). |
```
- **19n.** In §11, insert above the 0.3.1 row, replacing `YYYY-MM-DD` with `date +%F`:
```markdown
| 0.4.0 | YYYY-MM-DD | **Reliability overhaul Phase 3 R3 (backend) — device registry, push delivery records, unregister without a login, delivery settings, SSE shutdown.** D-C11 one row per installation (install id = the existing `device_id`, UUID-only, partial unique index, kept by clients in keychain `…ThisDeviceOnly` / `noBackupFilesDir`; `last_seen_at` on every registration, backfilled from `updated_at`; rotation replaces the install's old rows; an omitted platform keeps an existing row's value; DB errors scrubbed to name + pg code) in new `services/deviceService.js` (authService's push-token helpers delegate). D-C12 `POST /device/unregister` — no login, push token and/or install id, always 200, `400 invalid_body`, 30 / 60 s per client; clients serialize it before the next registration. D-C13 APNs expiry 1 h → 7 d; FCM TTL 7 d + explicit channel (`rasi_invites` / `rasi_default`); `type` + `program_id` custom keys. D-C14 FCM `invalid-argument` no longer prunes; APNs 410 compared as a string; 60-day unseen prune (`last_seen_at` and `updated_at`); APNs send timeout 10 s. D-C15 `push_deliveries` (one token query; one row per attempt + `no_device`; 90-day retention). D-C16 SIGTERM → plain close of every SSE stream, drain, hard exit at 25 s. No new error `code`. New: `utils/push/{apns,fcm}.js`, `services/{deviceService,pushDeliveryService}.js`, `models/PushDelivery.js`, `sql/010_push_deliveries_device_registry.sql`. Client contract §3.1–§3.3 for the bundled web / iOS / Android release. Flagged F9–F13. MINOR — additive for every live binary (`PUT`/`DELETE /device` bodies + responses, SSE frames, the 7-field payload and `/unacknowledged` unchanged); dependents (programs, program-memberships, invites) unaffected — `createNotification`'s signature is unchanged. Deploy order: `sql/010` on staging → public, then the backend. |
```

### 20. `specs/features/invites/SPEC.md` (0.1.0 → 0.2.0)
- **20a.** Line 3: `**Version:** 0.1.0 · **Apps (\`consumed_by\`):** \`web\`, \`ios\`` → `**Version:** 0.2.0 · **Apps (\`consumed_by\`):** \`web\`, \`ios\`, \`android\``.
- **20b.** After line 13, insert `> **0.2.0 (reliability overhaul R3):** one-transaction send, logged no-op reasons, real 500s, expired invites hidden, one inbox for all three clients — D-C4–D-C8, client contract §3.1.`
- **20c.** §3 table:
  - Replace row 1 (line 56) with `| 1 | \`POST /invite\` | \`invites.js:8-16\` → \`sendInvite\` (\`inviteSendService.js\`, 0.2.0) | program \`admin\` or \`global_admin\` | Invite a member by username. \`200 { message: "Invitation sent" }\` whether sent or a privacy-safe no-op (F1, D-C5); \`500 { error }\` on an unexpected failure (D-C6). Invite + \`program.invite_received\` in one transaction (D-C4). |`
  - Replace row 2 (line 57) with `| 2 | \`GET /my-invites\` | \`invites.js:18-27\` → \`getMyInvites\` (\`inviteService.js:79-100\`) | any authenticated member | The caller's own \`pending\`, **unexpired** invites (by \`invited_username\`; D-C7). |`
- **20d.** Replace line 63 with `- **\`POST /invite\`** (\`inviteSendService.js\`): \`{ message: "Invitation sent" }\` for a sent invite and every no-op (F1); \`500 { error: "Failed to send invitation." }\` on an unexpected failure (D-C6).`
- **20e.** Replace the error-contract paragraph (lines 76-81) with:
```markdown
`AppError(statusCode, message)` → `{ error: message }`. **`POST /invite` (0.2.0):** every privacy-safe no-op is a
`200 { message: "Invitation sent" }` (F1); a non-`AppError` throw is a real `500 { error: "Failed to send
invitation." }` (D-C6 — before 0.2.0 it was swallowed into a 200; no `code`, like every backend 500 — the frontend-kit
derives `server` from the status). The other three routes map unknown throws to a route-generic `500 { error }`.
Status codes: `400` (missing / non-string `username`, missing or non-UUID `program_id`; missing `invite_id`/`action`;
invalid `action` for role; expired invite), `403` (not program admin on send; not global admin on `/all-invites`),
`404` (invite not found / already processed; invited user not found on admin-accept).
```
- **20f.** Insert after it, before `## 4.`:
````markdown

### 3.1 Client contract — one invite inbox for web / iOS / Android (0.2.0, D-C8)

All under `/api/program-memberships`, `Authorization: Bearer <access token>`; `401` / `503` per `authenticateToken`
(auth D-C11). Web (`lib/api/invites.ts:23,34`, `lib/api/members.ts:214`) and iOS (`APIClient+Invites.swift:54,71,94`)
already call these; Android adopts them in its next build (no shim for 1.0.0). Errors are `{ "error": message }`;
the HTTP status decides the frontend-kit error kind.

**`GET /my-invites`** → `200`, newest first, only `pending` invites that have not expired:

```json
[ { "invite_id": "uuid", "program_id": "uuid", "program_name": "RaSi Winter Reset",
    "program_status": "planned", "program_start_date": "2026-10-01", "program_end_date": "2026-12-31",
    "invited_by_name": "Ava Rivera", "invited_at": "2026-10-12T18:04:05.000Z",
    "expires_at": "2026-11-11T18:04:05.000Z" } ]
```
`program_status` ∈ `planned | active | completed`; `program_start_date` / `program_end_date` are `YYYY-MM-DD` or
`null`; `expires_at` may be `null`. `500 { "error": "Failed to fetch invites." }`.

**`PUT /invite-response`** — body `{ "invite_id": "uuid", "action": "accept" | "decline", "block_future": true }`
(`block_future` optional, honoured on `decline`). `200 { "message": "<human text — show it>" }` · `400` (missing field /
invalid action / `"This invite has expired."`) · `404 "Invite not found or already processed."` · `500 { "error":
"Failed to process invite response." }`. Global admins also use `GET /all-invites` and `action: "revoke"` (§3 table,
unchanged).

**`POST /invite`** (program admins) — body `{ "program_id": "uuid", "username": "string" }`.

| Status | Body | Client shows |
|---|---|---|
| `200` | `{ "message": "Invitation sent" }` | "Invitation sent" — also for unknown / blocked / already-member / already-invited usernames (privacy) |
| `400` | `{ "error": "program_id and username are required." }` | the server text (invalidInput) |
| `403` | `{ "error": "Admin privileges required for this program." }` | forbidden |
| `500` | `{ "error": "Failed to send invitation." }` | the kit's server error |
| network / timeout | — | the kit's offline / timeout error |

**Remove the client-side swallow (all three client plans).** Every live client treats ANY non-network error from this
call as success: web `apps/web/src/app/members/invite/page.tsx:37-44`, iOS
`apps/ios/RaSi-Fiters-App/Features/Home/ProgramManagement/InviteMemberView.swift:161-170`, Android
`apps/android/app/src/main/java/com/app/rasifiters/core/ProgramContext.kt:999-1006`. The next builds show "Invitation
sent" only on `200` and route every other status through the frontend-kit (the server keeps the privacy guarantee —
F1). Live binaries see **no visible change** from 0.2.0 (a `400` / `500` still shows "sent" there).

**Refresh the inbox** on program-picker load / pull-to-refresh, on every SSE or push `program.invite_received`, and after
every `/invite-response`. Push and SSE are hints only — the inbox is always `GET /my-invites`.
````
- **20g.** §4:
  - Replace the `sendInvite` bullet (lines 85-92) with:
```markdown
- **`sendInvite({ program_id, username }, requester)`** (`inviteSendService.js`, 0.2.0) — `400` unless `program_id`
  is a UUID and `username` a non-empty string. Authz: `global_admin`, or an `active`/`admin` `ProgramMembership` for
  `program_id` (`403` else). Then the chain of **privacy-safe no-ops** — each returns `{ sent: false, reason }` and
  creates nothing: program missing/deleted (`program_not_found`); username not found (`unknown_username`); target
  already has a non-`removed` membership (`already_member`); target is in `program_invite_blocks` (`blocked`); a
  non-expired `pending` invite already exists (`pending_invite`). Happy path in ONE transaction (D-C4): mark a
  superseded **expired** pending invite `expired`, create a `ProgramInvite` (`token_hash` = 32 random bytes hex,
  `status:'pending'`, `max_uses:1`, `uses_count:0`, `expires_at` = **now + 30 days**), emit
  **`program.invite_received`** to `[targetMember.id]` with the transaction (dispatch after commit). A `23505` on the
  pending-invite index (concurrent duplicate) → `pending_invite`. Returns `{ sent: true, reason: null }`. The route
  answers `200 { message: "Invitation sent" }` either way and logs the reason (D-C5).
```
  - Replace the `getMyInvites` bullet (lines 93-95) with:
```markdown
- **`getMyInvites(requester)`** — `ProgramInvite.findAll({ invited_username: requester.username, status:'pending',
  expires_at IS NULL OR expires_at > now })` (D-C7) include `Program` (id/name/status/start/end) + `InvitedByMember` (the
  `member_name` source), `created_at DESC`; project the inbox shape.
```
- **20h.** Line 145: replace `hardcoded** in \`sendInvite\` (\`inviteService.js:62-64\`)` with `hardcoded** in \`sendInvite\` (\`inviteSendService.js\` \`INVITE_TTL_MS\`)`.
- **20i.** Line 154: replace `the error contract (incl. \`POST /invite\` swallowing throws to a 200).` with `the error contract (except 0.2.0 D-C6: an unexpected \`POST /invite\` failure is a real 500, no longer a 200).`
- **20j.** §9:
  - In the D-REF row (line 198), append ` **Superseded in part 0.2.0 (D-C8):** \`consumed_by\` = \`[web, ios, android]\`.`
  - After the D-S1 row (line 199), append:
```markdown
| **D-C4** | **One transaction per sent invite (0.2.0).** `sendInvite` (moved to `services/inviteSendService.js` — `inviteService.js` was 334 lines) runs its authz + no-op checks, then ONE managed `sequelize.transaction`: mark a superseded expired invite `expired`, create the invite, `createNotification({ …, transaction })` — an invite never exists without its notification row, and SSE/push dispatch runs `afterCommit`. A concurrent duplicate that loses the `uniq_program_invites_program_username_pending` race (`23505`, `001_schema.sql:277`) is the `pending_invite` no-op. | DESIGN_BOARD §3.1; W2 F4. |
| **D-C5** | **No-op reasons are logged, never returned (0.2.0).** `sendInvite` returns `{ sent, reason }`; reasons `program_not_found` · `unknown_username` · `already_member` · `blocked` · `pending_invite`. The route always answers `200 { message: "Invitation sent" }` and logs one stdout line `{"type":"invite_noop","request_id":…,"program_id":…,"reason":…}` — joinable to the request log line (which carries `member_id`), never the username. Console (Render, 7 days), not `app_events` — that table stays for client + R1 auth events; no new server-event helper. | DESIGN_BOARD §3.2 (D-12); W2 F3. |
| **D-C6** | **Real errors (0.2.0).** A non-`AppError` throw from `POST /invite` → `500 { error: "Failed to send invitation." }` (it was swallowed into a 200; no `code`, like every backend 500), logged as error name + Postgres code only (observability F8). A non-string `username` or non-UUID `program_id` → `400 "program_id and username are required."`. **Live binaries: no visible change** — web (`members/invite/page.tsx:37-44`), iOS 1.4.2 (`InviteMemberView.swift:161-170`) and Android 1.0.0 (`ProgramContext.kt:999-1006`) all show "Invitation sent" for any non-network error; the three client plans remove that swallow (§3.1). | DESIGN_BOARD §3.2; D-12. |
| **D-C7** | **The inbox hides expired invites (0.2.0).** `GET /my-invites` adds `expires_at IS NULL OR expires_at > now` (accepting one only returned `400 "This invite has expired."`; 5 prod invites expire ~2026-10-21). `GET /all-invites` is unchanged (admin view). | DESIGN_BOARD §3.1; W2 F12. |
| **D-C8** | **One invite inbox for web / iOS / Android (0.2.0).** `GET /my-invites` + `PUT /invite-response` (+ `POST /invite`) are THE contract for all three (§3.1). Web (`lib/api/invites.ts:23,34`) and iOS (`APIClient+Invites.swift:71,94`) already use them; Android adopts them in its next build — its 1.0.0 picker reads `invited` membership rows that nothing creates (0 in prod, W2 F1/E2); no shim (board ✅). `consumed_by` += `android` now: Android 1.0.0 already calls `POST /invite` (`ApiService.kt:252`). Web's program-card accept path over `program-memberships` (F3) acts only on those never-created rows — the web client plan retires it. | DESIGN_BOARD §3.1; W2 F1/E2. |
```
- **20k.** §10:
  - Replace the F1 row (line 205) with `| **F1** | **\`sendInvite\` is privacy-safe for every no-op** — missing/deleted program, unknown/blocked/already-member target, existing pending invite (incl. a concurrent duplicate) all return the same \`200 { message: "Invitation sent" }\`; the reason is logged server-side only (D-C5). **0.2.0:** unexpected failures are no longer swallowed — \`500 { error }\` (D-C6). | \`inviteSendService.js\`; \`routes/invites.js\` | Kept — a security property; the swallow-to-200 half was removed by D-C6. |`
  - In the F3 row (line 207), replace the last cell `Out of scope (owned by program-memberships).` with `Out of scope (owned by program-memberships) — acts only on \`invited\` membership rows nothing creates; the web client plan retires it (D-C8).`
- **20l.** In §11, insert above the 0.1.0 row, replacing `YYYY-MM-DD` with `date +%F`:
```markdown
| 0.2.0 | YYYY-MM-DD | **Reliability overhaul Phase 3 R3 (backend).** D-C4 `sendInvite` moved to new `services/inviteSendService.js`; supersede-expired + create invite + `program.invite_received` notification in ONE managed transaction (push/SSE after commit); a concurrent duplicate (`23505` on `uniq_program_invites_program_username_pending`) = the pending no-op. D-C5 every no-op returns a reason the route logs as `{"type":"invite_noop","request_id","program_id","reason"}` (never the username). D-C6 unexpected failures → `500 { error: "Failed to send invitation." }` (were a false 200); non-string `username` / non-UUID `program_id` → 400; live binaries show no change (they swallow non-network errors — the client plans remove that). D-C7 `GET /my-invites` hides expired invites. D-C8 one inbox for web / iOS / Android (client contract §3.1); `consumed_by` += `android`. MINOR — owned-interface + `consumed_by` change; response shapes unchanged; dependent program-memberships unaffected. |
```

### 21. `specs/features/registry.json` (shared; only these two rows)
- `notifications`:
  - `"version": "0.4.0"`
  - Set `paths` to `["routes/notifications.js", "utils/notifications.js", "utils/notificationStreams.js", "utils/pushNotifications.js", "utils/push/apns.js", "utils/push/fcm.js", "services/deviceService.js", "services/pushDeliveryService.js", "models/Notification.js", "models/NotificationRecipient.js", "models/MemberPushToken.js", "models/PushDelivery.js", "sql/010_push_deliveries_device_registry.sql", "server.js"]`, one entry per line as in the existing formatting.
- `invites`:
  - `"version": "0.2.0"`
  - `"consumed_by": ["web", "ios", "android"]`
  - Set `paths` to `["routes/invites.js", "services/inviteService.js", "services/inviteSendService.js", "models/ProgramInvite.js", "models/ProgramInviteBlock.js", "server.js"]`

### 22. `specs/features/REGISTRY.md` (shared; only these two rows)
- Replace line 17 with `| \`notifications\` | 0.4.0 | 🚀 | \`web\` \`ios\` \`android\` | \`backend\` (\`routes/notifications.js\`, \`utils/{notifications,notificationStreams,pushNotifications}.js\`, \`utils/push/{apns,fcm}.js\`, \`services/{deviceService,pushDeliveryService}.js\`, \`models/{Notification,NotificationRecipient,MemberPushToken,PushDelivery}.js\`, \`sql/010\`) | [notifications/SPEC.md](notifications/SPEC.md) |`
- Replace line 18 with `| \`invites\` | 0.2.0 | 🚀 | \`web\` \`ios\` \`android\` | \`backend\` (\`routes/invites.js\`, \`services/{inviteService,inviteSendService}.js\`, \`models/{ProgramInvite,ProgramInviteBlock}.js\`) | [invites/SPEC.md](invites/SPEC.md) |`

## Steps — web
None. The bundled client plan follows notifications SPEC §3.1/§3.3 and invites SPEC §3.1. That includes removing the invite-error swallow at `apps/web/src/app/members/invite/page.tsx:37-44`.

## Steps — ios
None. Same contracts, plus the keychain `…ThisDeviceOnly` install id and the swallow removal at `InviteMemberView.swift:161-170`.

## Steps — android
None. Same contracts, plus the §3.2 channel table, the `noBackupFilesDir` install id and the swallow removal at `ProgramContext.kt:999-1006`.

## Endgame

### 23. Compile + boot check (backend; the implementer runs it)
Syntax:
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && for f in server.js routes/notifications.js routes/invites.js services/inviteService.js services/inviteSendService.js services/deviceService.js services/pushDeliveryService.js services/authService.js utils/notifications.js utils/notificationStreams.js utils/pushNotifications.js utils/push/apns.js utils/push/fcm.js models/MemberPushToken.js models/PushDelivery.js; do node --check "$f" || echo "FAIL $f"; done
```
Boot (loads modules only; no server, no DB connection):
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && SUPABASE_URL=https://kpadxjekpiwfkqcxtrio.supabase.co SUPABASE_ANON_KEY=smoke-placeholder SUPABASE_SERVICE_ROLE_KEY=smoke-placeholder node -r dotenv/config -e '
const show=(r)=>{for(const l of r.stack)if(l.route)console.log(`${Object.keys(l.route.methods)} ${l.route.path} ${l.route.stack.map(s=>s.name).join(",")}`);};
show(require("./routes/notifications"));show(require("./routes/invites"));
console.log(Object.keys(require("./services/inviteService")).join(","));
console.log(Object.keys(require("./services/inviteSendService")).join(","));
console.log(Object.keys(require("./services/deviceService")).join(","));
const a=require("./services/authService");console.log(typeof a.upsertPushToken,typeof a.removePushToken);
const p=require("./utils/pushNotifications");console.log(Object.keys(p).join(","),p.PUSH_TTL_SECONDS);
console.log(JSON.stringify([p.buildPushData({id:"n1",type:"program.invite_received",programId:"p1"}),p.buildPushData({id:"n2",type:"app.broadcast",programId:null})]));
const f=require("./utils/push/fcm");
console.log(["program.invite_received","program.role_changed","program.admin_transferred","program.member_removed","program.member_joined","program.updated","app.broadcast",undefined].map(f.channelIdFor).join(","));
console.log(["messaging/registration-token-not-registered","messaging/invalid-registration-token","messaging/invalid-argument","messaging/internal-error"].map(f.isDeadTokenCode).join(","));
const ap=require("./utils/push/apns");
console.log([{status:"410"},{status:"400",response:{reason:"BadDeviceToken"}},{status:"400",response:{reason:"BadCollapseId"}},{error:{}}].map(ap.isDeadToken).join(","));
console.log(Object.keys(require("./models/PushDelivery").rawAttributes).join(","));
console.log(Object.keys(require("./models").MemberPushToken.rawAttributes).join(","));
const s=require("./utils/notificationStreams");const mk=()=>({ended:false,end(){this.ended=true;}});
const r1=mk(),r2=mk(),r3=mk();s.registerNotificationStream("m1",r1);s.registerNotificationStream("m2",r2);
console.log(s.closeAllNotificationStreams(),r1.ended,r2.ended);s.registerNotificationStream("m3",r3);console.log(r3.ended);
process.exit(0)'
```
The output must be exactly these 24 lines:
```
get /unacknowledged authenticateToken,<anonymous>
put /device authenticateToken,<anonymous>
delete /device authenticateToken,<anonymous>
post /device/unregister <anonymous>,<anonymous>
post /broadcast authenticateToken,<anonymous>
post /:id/acknowledge authenticateToken,<anonymous>
get /stream authenticateStream,<anonymous>
post /invite authenticateToken,<anonymous>
get /my-invites authenticateToken,<anonymous>
get /all-invites authenticateToken,<anonymous>
put /invite-response authenticateToken,<anonymous>
getMyInvites,getAllInvites,respondToInvite
sendInvite
registerDevice,unregisterMemberDevices,unregisterDevice
function function
getProvider,getFcmApp,sendPushToMembers,buildPushData,PUSH_TTL_SECONDS 604800
[{"notification_id":"n1","type":"program.invite_received","program_id":"p1"},{"notification_id":"n2","type":"app.broadcast"}]
rasi_invites,rasi_invites,rasi_invites,rasi_invites,rasi_default,rasi_default,rasi_default,rasi_default
true,true,false,false
true,true,false,false
id,created_at,notification_id,member_id,push_token_id,platform,outcome,error_code
id,member_id,device_token,platform,device_id,created_at,updated_at,last_seen_at
2 true true
true
```
- Then `grep -rn 'code: "server"\|invalid_input' routes services utils` → no matches (R3 adds no new code).
- Web, Android and iOS are untouched: no `npm run build`, no `./gradlew :app:assembleDebug`, no Xcode ⌘B. **All live and visual checks are the user's.**

### 24. git-version commit on branch `phase3-r3-backend` (after the impl-adversary passes)
- Stage only the 22 files above.
- Commit: `feat(notifications,invites): R3 backend — device registry, push_deliveries, unregister without login, invite transaction (notifications 0.4.0, invites 0.2.0)`.
- Blast-radius gate (contract change; the user acknowledges it):
  - notifications → dependents [programs, program-memberships, invites] · apps [web, ios, android]
  - invites → dependents [program-memberships] · apps [web, ios, android]
  - Neither dependent re-versions: `createNotification` and the response shapes are unchanged.
- The commit body states "auth: no bump — `authService.js` delegation only; the behavior is notifications D-C11" and "server.js: notifications-owned shutdown block".
- **Tags are created only in step 30**, on the commit that reaches `main`.

### 25. Pre-flight (read-only; the orchestrator runs it via supabase-rasifiters `execute_sql`)
```sql
SELECT 'public' AS s, device_id, count(*) FROM public.member_push_tokens WHERE device_id IS NOT NULL GROUP BY device_id HAVING count(*) > 1
UNION ALL SELECT 'staging', device_id, count(*) FROM staging.member_push_tokens WHERE device_id IS NOT NULL GROUP BY device_id HAVING count(*) > 1;
SELECT platform, count(*) AS tokens, count(*) FILTER (WHERE updated_at < now() - interval '60 days') AS first_prune,
       min(updated_at)::date AS oldest FROM public.member_push_tokens GROUP BY platform ORDER BY platform;
SELECT jobname FROM cron.job WHERE jobname LIKE 'app_events_retention_%' ORDER BY 1;
SELECT table_schema FROM information_schema.tables WHERE table_name = 'push_deliveries';
```
Expected:
1. 0 rows.
2. Report `first_prune` per platform to the user. The first 04:27 UTC job after the public run deletes these rows, including the test account's stale Android tokens from W2 E5.
3. `app_events_retention_public` and `app_events_retention_staging`.
4. 0 rows.

### 26. GATE
Nothing below runs before the Phase 1b watch ends clean (**2026-10-19**), unless the user explicitly waives it at plan approval (BRIEF §7, HANDOFF Next action 3).

### 27. Staging, part 1: migration (USER runs it; staging first)
- **USER:** Supabase SQL editor → first line `SET search_path TO staging;` + the whole of `apps/backend/sql/010_push_deliveries_device_registry.sql` → Run, without "enable RLS".
- **Orchestrator (read-only):**
```sql
SELECT table_schema, column_default, is_nullable FROM information_schema.columns WHERE table_name='member_push_tokens' AND column_name='last_seen_at' ORDER BY 1;
SELECT schemaname, count(*) FROM pg_indexes WHERE indexname IN ('idx_member_push_tokens_last_seen_at','uniq_member_push_tokens_device_id','push_deliveries_pkey','idx_push_deliveries_created_at','idx_push_deliveries_member_id_created_at','idx_push_deliveries_notification_id') GROUP BY 1;
SELECT c.relnamespace::regnamespace AS schema, c.relrowsecurity FROM pg_class c WHERE c.relname='push_deliveries' ORDER BY 1;
SELECT conrelid::regclass, conname, confdeltype FROM pg_constraint WHERE conname IN ('push_deliveries_member_id_fkey','push_deliveries_notification_id_fkey') ORDER BY 1,2;
SELECT jobname, schedule, command, active FROM cron.job WHERE jobname LIKE 'push_deliveries_retention_%' OR jobname LIKE 'member_push_tokens_prune_%' ORDER BY 1;
SELECT has_table_privilege('rasifiters_staging','staging.push_deliveries','INSERT') AS stg_insert,
       (SELECT count(*) FROM pg_class WHERE relnamespace='staging'::regnamespace AND relkind='r' AND relrowsecurity) AS staging_rls_on;
```
- Expected:
  1. `staging | CURRENT_TIMESTAMP | NO`
  2. `staging | 6`
  3. `staging | f`
  4. two `staging.push_deliveries` rows, both with `c`
  5. two `*_staging` jobs (`22 4 * * *` / `27 4 * * *`, active `t`). The prune `command` contains both `last_seen_at <` and `updated_at <`.
  6. `t | 0`

### 28. Staging, part 2: deploy and test
- **Deploy (orchestrator, with the user's OK):**
  - `git push --force-with-lease origin phase3-r3-backend:staging`. Only one track may hold `staging` at a time; check with the other tracks first.
  - Wake the instance with `curl -s -m 90 https://rasifiters-api-staging.onrender.com/`.
  - Confirm the deploy is live via the render MCP (read-only, pass `workspaceId`).
- **Smoke script:**
  - Write the script below to `/private/tmp/claude-501/-Users-vinayaksankaranarayanan-Developer-rasifiters-master/9597ef9d-f5c4-4a1f-91de-0ec959c8e048/scratchpad/phase3-r3-smoke.sh`.
  - Run it as `SMOKE_BASE=https://rasifiters-api-staging.onrender.com/api TESTBED_PASSWORD=… bash <that path>`. The user supplies the password via env; it is never written to a file.
  - It must end with `== 26 passed, 0 failed`. Note the printed `program=` id.
  - Then the staging Render log (read-only) must hold, for `r3-noop-<RUN>`, one request line plus one `{"type":"invite_noop",…,"reason":"unknown_username"}` line that does not contain `r3-nobody`.
```bash
#!/usr/bin/env bash
# Phase 3 R3 smoke (notifications 0.4.0 / invites 0.2.0). Prints PASS/FAIL only — never a token.
#   SMOKE_BASE=https://rasifiters-api-staging.onrender.com/api TESTBED_PASSWORD=… bash phase3-r3-smoke.sh   (or the prod base)
# Logs in as the testbed admin ava.rivera; registers 3 FAKE push tokens on it and removes them again.
set -uo pipefail
: "${SMOKE_BASE:?set SMOKE_BASE}"; : "${TESTBED_PASSWORD:?set TESTBED_PASSWORD}"
A="$SMOKE_BASE"; U="${SMOKE_USER:-ava.rivera}"; RUN=$(date +%s)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; PASS=0; FAIL=0
D=$(uuidgen | tr 'A-Z' 'a-z'); T1="r3-smoke-$RUN-a"; T2="r3-smoke-$RUN-b"; T3="r3-smoke-$RUN-c"
J=(-H 'Content-Type: application/json')
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; PASS=$((PASS+1)); else echo "FAIL  $1 — expected [$3] got [$2]"; FAIL=$((FAIL+1)); fi; }
req() { local u="$1"; shift; curl -s -m 20 -o "$T/body" -D "$T/hdr" -w '%{http_code}' "$@" "$u"; }
body() { jq -c . "$T/body" 2>/dev/null || cat "$T/body"; }
hdr() { grep -i "^$1:" "$T/hdr" | head -1 | cut -d' ' -f2- | tr -d '\r'; }
unreg() { req "$A/notifications/device/unregister" -X POST "${J[@]}" -d "$1"; }
echo "RUN=$RUN  install id=$D  (Render log: request_id r3-noop-$RUN)"
s=$(curl -s -m 90 -o /dev/null -w '%{http_code}' "${A%/api}/"); check "health → 200" "$s" "200"
L=$(curl -s -m 60 "${J[@]}" -X POST "$A/auth/login/app" -d "$(jq -nc --arg u "$U" --arg p "$TESTBED_PASSWORD" '{identifier:$u,password:$p}')"); AT=$(jq -r '.token // empty' <<<"$L" 2>/dev/null)
check "login $U" "$([ -n "$AT" ] && echo yes || echo no)" "yes"; AUTH=(-H "Authorization: Bearer $AT")
echo "== device registry"
s=$(req "$A/notifications/device" -X PUT "${J[@]}" "${AUTH[@]}" -d "{\"push_token\":\"$T1\"}"); check "PUT /device (no platform, no device_id) → 200" "$s" "200"
check "PUT body unchanged" "$(body)" '{"message":"Device registered for push notifications."}'
s=$(req "$A/notifications/device" -X PUT "${J[@]}" "${AUTH[@]}" -d "{\"push_token\":\"$T2\",\"platform\":\"android\",\"device_id\":\"$D\"}"); check "PUT /device with install id → 200" "$s" "200"
s=$(req "$A/notifications/device" -X PUT "${J[@]}" "${AUTH[@]}" -d "{\"push_token\":\"$T3\",\"platform\":\"android\",\"device_id\":\"$D\"}"); check "PUT /device rotated token → 200" "$s" "200"
s=$(req "$A/notifications/device" -X PUT "${J[@]}" "${AUTH[@]}" -d '{}'); check "PUT /device without push_token → 400" "$s" "400"
s=$(unreg '{}'); check "unregister {} → 400" "$s" "400"; check "invalid_body" "$(jq -r .code "$T/body")" "invalid_body"
s=$(unreg '{"device_id":"not-a-uuid"}'); check "unregister non-UUID only → 400" "$s" "400"
s=$(unreg "{\"push_token\":\"$T1\"}"); check "unregister by token, no login → 200" "$s" "200"
check "unregister body" "$(body)" '{"message":"Device unregistered from push notifications."}'
s=$(unreg "{\"device_id\":\"$D\"}"); check "unregister by install id → 200" "$s" "200"
s=$(unreg "{\"device_id\":\"$(uuidgen | tr 'A-Z' 'a-z')\"}"); check "unregister unknown install id → 200 (no oracle)" "$s" "200"
echo "== invites"
P=$(curl -s -m 20 "${AUTH[@]}" "$A/programs" | jq -r '[.[] | select(.my_role=="admin" and .my_status=="active")][0].id // empty')
check "a program $U admins" "$([ -n "$P" ] && echo yes || echo no)" "yes"; echo "program=$P"
s=$(req "$A/program-memberships/invite" -X POST "${J[@]}" "${AUTH[@]}" -H "X-Request-Id: r3-noop-$RUN" -d "{\"program_id\":\"$P\",\"username\":\"r3-nobody-$RUN\"}")
check "invite unknown username → 200" "$s" "200"; check "privacy-safe body" "$(body)" '{"message":"Invitation sent"}'
s=$(req "$A/program-memberships/invite" -X POST "${J[@]}" "${AUTH[@]}" -d '{"program_id":"not-a-uuid","username":"x"}'); check "invite bad program_id → 400" "$s" "400"
s=$(req "$A/program-memberships/my-invites" "${AUTH[@]}"); check "my-invites → 200" "$s" "200"; check "my-invites is an array" "$(jq -r type "$T/body")" "array"
check "my-invites lists no expired invite" "$(jq -r --arg now "$(date -u +%Y-%m-%dT%H:%M:%S)" '[.[] | select(.expires_at != null and .expires_at < $now)] | length' "$T/body")" "0"
echo "== SSE"
curl -s -N -m 4 "${AUTH[@]}" "$A/notifications/stream" > "$T/sse" 2>/dev/null; check "stream opens with event: ready" "$(head -1 "$T/sse" | tr -d '\r')" "event: ready"
curl -s -N -m 4 "$A/notifications/stream?token=$AT" > "$T/sse2" 2>/dev/null; check "?token= still accepted" "$(head -1 "$T/sse2" | tr -d '\r')" "event: ready"
s=$(req "$A/notifications/unacknowledged" "${AUTH[@]}"); check "unacknowledged → 200" "$s" "200"
echo "== cleanup, then rate limit (locks this IP out of unregister for ≤ 60 s)"
for b in "{\"device_id\":\"$D\"}" "{\"push_token\":\"$T1\"}" "{\"push_token\":\"$T2\"}" "{\"push_token\":\"$T3\"}"; do unreg "$b" >/dev/null; done
for i in $(seq 1 31); do s=$(unreg '{"device_id":"00000000-0000-4000-8000-000000000000"}'); [ "$s" = "429" ] && break; done
check "unregister > 30/min → 429" "$s" "429"; check "rate_limited + Retry-After" "$(jq -r .code "$T/body") $([ -n "$(hdr Retry-After)" ] && echo y)" "rate_limited y"
echo "== $PASS passed, $FAIL failed"
```
- **Registry rotation + platform-keep (orchestrator; curl with ava's staging token, then read-only SQL):**
  1. `PUT /device {"push_token":"r3-rot-<RUN>-a","platform":"android","device_id":"<D2>"}`
  2. `PUT /device {"push_token":"r3-rot-<RUN>-b","platform":"android","device_id":"<D2>"}`
  3. `PUT /device {"push_token":"r3-rot-<RUN>-b"}` (no platform)
  4. Query: `SELECT device_token, platform, device_id, last_seen_at > now() - interval '5 minutes' AS fresh FROM staging.member_push_tokens WHERE device_id = '<D2>';` → exactly one row: `r3-rot-<RUN>-b | android | <D2> | t`.
  5. `POST /device/unregister {"device_id":"<D2>"}`, then the same query → 0 rows.
- **Devices (USER).** These use live-binary code paths; there is no R3 client code.
  - **iOS: the simulator only.** Use an Apple-silicon simulator running the `RaSi-Fiters-App-Staging` scheme, signed in as `lucas.b`, notifications allowed; sandbox APNs, staging has `APNS_PRODUCTION=false`. **Not the iPhone:** the Staging scheme builds the same bundle id `com.app.rasifiters` as the App Store app (`project.pbxproj:394/433`), so installing it would replace App Store 1.4.2, which step 31 needs.
  - **Android:** the Pixel_8 emulator (launched with `-dns-server 8.8.8.8`) on the `staging` build type (`cd apps/android && ./gradlew :app:installStaging`), signed in as `aria.shah`, notifications allowed. Not the physical Pixel: it keeps Play 1.0.0 for step 31.
- **Pre-check before inviting (orchestrator, read-only; `<P>` = the smoke's `program=` id):**
```sql
SELECT m.username,
       (SELECT count(*) FROM staging.program_invites i WHERE i.program_id = '<P>' AND i.invited_username = m.username
          AND i.status = 'pending' AND (i.expires_at IS NULL OR i.expires_at > now())) AS live_pending,
       (SELECT pm.status FROM staging.program_memberships pm WHERE pm.program_id = '<P>' AND pm.member_id = m.id) AS membership,
       (SELECT count(*) FROM staging.program_invite_blocks b WHERE b.program_id = '<P>' AND b.member_id = m.id) AS blocked,
       (SELECT count(*) FROM staging.member_push_tokens t WHERE t.member_id = m.id) AS tokens
FROM staging.members m WHERE m.username IN ('lucas.b', 'aria.shah', 'mason.w') ORDER BY 1;
```
  - Required: 3 rows, each `live_pending = 0`, `membership` null or `removed`, `blocked = 0`; `aria.shah` and `lucas.b` `tokens ≥ 1`.
  - `mason.w`: `tokens = 0` → expect `no_device`; `tokens > 0` → expect a token outcome instead.
  - A live pending invite: the orchestrator logs in as that member on staging (same `TESTBED_PASSWORD`) and sends `PUT /program-memberships/invite-response {"invite_id":…,"action":"decline"}`, then re-runs the query.
  - A non-removed membership or a block: STOP and report the row to the user. Never mutate memberships or blocks.
- **Invite:** the orchestrator invites `lucas.b`, `aria.shah` and `mason.w` to `<P>` via `POST /program-memberships/invite` with ava's staging token.
- **Expect:** a banner on the iOS simulator and a notification on the Android emulator.
- **Read-only check:** `SELECT m.username, d.platform, d.outcome, d.error_code FROM staging.push_deliveries d JOIN staging.members m ON m.id = d.member_id WHERE d.created_at > now() - interval '10 minutes' ORDER BY 1;`
  - `aria.shah | android | sent`. This proves FCM accepts the channel + TTL payload; any `messaging/invalid-argument` here = STOP and fix.
  - `lucas.b | ios | sent`.
  - `mason.w | (null) | no_device` (or per the pre-check).
  - lucas then declines in the simulator app. The other two invites may stay pending (throwaway data).
- **SSE shutdown:**
  - The orchestrator runs `curl -s -N -m 180 -H "Authorization: Bearer $AT" https://rasifiters-api-staging.onrender.com/api/notifications/stream > <scratchpad>/sse-stg.log; echo "exit=$?"` with `run_in_background`.
  - The **USER** restarts the staging service: Render dashboard → the staging service → "Manual Deploy" → "Restart service". This needs a per-action user OK.
  - Expect: curl ends on its own within about 60 s with `exit=0`; `sse-stg.log` contains only `event: ready` / `event: ping` frames; the staging log (read-only) contains `{"type":"shutdown","signal":"SIGTERM","sse_streams_closed":N}` with N ≥ 1.

### 29. Migration on public (USER runs it, after step 28 is green; steps 29 and 30 in ONE session)
- SQL editor: first line `SET search_path TO public;` + the whole of `010` → Run.
- The orchestrator re-runs the step-27 queries without the staging-only last one, plus `SELECT has_table_privilege('rasifiters_staging','public.push_deliveries','SELECT') AS stg_reads_prod;`.
- Expected:
  - `public` and `staging` rows in the column query; `public | 6`; `public | t`.
  - 4 FK rows; 4 cron jobs.
  - `stg_reads_prod = f`.
- Go straight on to step 30. 010 is safe under the old code even if delayed: old inserts get the `last_seen_at` default, and the prune also requires a stale `updated_at`, which the old code bumps on every registration. Even so, don't leave public migrated with the code undeployed.

### 30. Prod deploy (orchestrator, right after step 29 verifies, with the user's OK)
1. `git -C <worktree> rebase main`. If main moved, re-run step 23.
2. `git checkout main && git merge --ff-only phase3-r3-backend`.
3. `git tag feature/notifications@v0.4.0 && git tag feature/invites@v0.2.0`.
4. `git push origin main && git push origin feature/notifications@v0.4.0 feature/invites@v0.2.0`.
5. Confirm via the render MCP (read-only) that the prod deploy is `live` and its log shows no boot error.

### 31. Prod smoke (live-binary compatibility)
- **Script:** `SMOKE_BASE=https://rasifiters-api.onrender.com/api TESTBED_PASSWORD=… bash <scratchpad>/phase3-r3-smoke.sh` → `== 26 passed, 0 failed`. Then check the prod Render log (read-only) for the `invite_noop` line of `r3-noop-<RUN>`.
- **USER:** open iOS App Store 1.4.2 on the iPhone and cold-start the Pixel on Play 1.0.0.
  - Read-only: `SELECT platform, max(last_seen_at) FROM public.member_push_tokens GROUP BY 1;` → both ≈ now.
- **Push check:**
  - The user names the username(s) signed in on the iPhone and the Pixel.
  - The orchestrator runs the step-28 pre-check query against `public.*`, with `<P>` = the prod smoke's `program=` id and those usernames. It requires `live_pending = 0`, `membership` null/`removed`, `blocked = 0`, `tokens ≥ 1`. Any failing row: STOP and report it; the user picks another username.
  - The orchestrator invites those username(s) to `<P>` with ava's prod token.
  - The USER confirms the iPhone banner and the Pixel notification, which lands in `rasi_default`.
  - Read-only: `SELECT platform, outcome, error_code FROM public.push_deliveries WHERE created_at > now() - interval '10 minutes';` → `ios sent` + `android sent`.
  - The USER declines the invite(s) on the devices.
- **Expired-invite filter:** covered by the smoke's "no expired" check plus the impl-adversary's code review. The 5 prod pending invites expire around 2026-10-21. Optional read-only follow-up after that date: `SELECT count(*) FROM public.program_invites WHERE status='pending' AND expires_at < now();` should be ≥ 5 while the invitees no longer see them.
- **24-hour watch (read-only):**
  ```sql
  SELECT outcome, platform, error_code, count(*) FROM public.push_deliveries WHERE created_at > now() - interval '24 hours' GROUP BY 1,2,3 ORDER BY 4 DESC;
  ```
  - **Revert trigger:** Android shows 0 `sent` together with ≥ 1 `messaging/invalid-argument`; OR a prod-log `[push] FCM invalid-argument` line whose message does not contain `registration token`.
  - A lone `invalid-argument` while other Android sends succeed is F12 (a malformed token): no action.
- **Rollback (only on that trigger or a prod break):**
  - `git revert <R3 sha>` on main → `git push origin main` (Render redeploys the old code); confirm live via the render MCP.
  - 010 stays in place. It is additive, the old code ignores `push_deliveries`, and the prune cannot touch active installs because the old code still bumps `updated_at`.
  - The tags stay; the revert commit records the rollback.
- **Optional:** SSE across a prod restart. Only if the user wants; it is a prod action the user takes in the Render dashboard.
- **Disk:** delete the scratchpad smoke and SSE files afterwards. Nothing else is generated.

### 32. git-version outcome
| Feature | Bump | Why |
|---|---|---|
| `notifications` | v0.3.1 → **v0.4.0** (MINOR) | New route, `push_deliveries`, device-registry rules, `reference_impl` +6 paths. Backward-compatible. |
| `invites` | v0.1.0 → **v0.2.0** (MINOR) | `POST /invite` error contract, `consumed_by` += android, `reference_impl` + `inviteSendService.js`. |
| `auth` | none | Delegation only. |
| `observability` | none | Not edited; D-C9's deferral stays historically true. |

Tags: `feature/notifications@v0.4.0` and `feature/invites@v0.2.0`, on the commit that reaches `main` (step 30). The orchestrator updates HANDOFF.md and PROGRESS.md at the milestone; these are not the implementer's files.

## Risks the implementer must watch
- **Deploy-order hazard:** `PUT /device` writes `last_seen_at`. If the commit reaches `main` before step 29, every device registration and every login that carries a push token returns 500. Never `git push origin main` before step 30.
- **FCM payload:** one malformed field (`ttl`, `channelId`, a non-string `data` value) makes every Android send fail with `invalid-argument`. Tokens aren't pruned (by design), but no Android push is delivered. That is why step 28 requires the emulator `sent` row before prod.
- **Live binaries must stay byte-identical on these:**
  - `PUT /device` and `DELETE /device` bodies and responses
  - the `ready` / `ping` / `notification` frames and the 7-field payload
  - `/unacknowledged`, `?token=`, and the APNs `notification_id` key
- **Live binaries see no invite change.** All three swallow non-network `POST /invite` errors as "sent". The 500/400 becomes visible only after the client plans remove the swallow (invites §3.1 names the three locations). Expired invites vanish from the iOS and web inboxes. Android 1.0.0 invite pushes stay in `rasi_default` through the manifest fallback.
- **No new error codes:** use `invalid_body` (400) and `rate_limited` (429) only; 500s are `{ error }`. Tell R1/R2 to reuse `invalid_body` for any body-validation 400 on their routes, so the vocabulary stays one set.
- **Log hygiene:**
  - `deviceService` must rethrow DB errors via `scrubbed()`. `routes/auth.js` and `DELETE /device` log errors whole, and the raw-SQL replacements would otherwise put push tokens in Render logs.
  - New log lines carry error name + Postgres code only.
  - The invite no-op line never includes the username.
- **Cross-track edits, kept minimal:**
  - `server.js`: line 130, `let server = null;`, and the tail block only. R2's mount sits in a different hunk.
  - `services/authService.js`: lines 91-125 only; line 17 untouched.
  - R1's logout and forced-sign-out work must call `deviceService` (D-C11), never its own `MemberPushToken` writes.
  - `registry.json` and `REGISTRY.md`: only the notifications and invites rows.
  - `sql/README.md`: R2's 009 row goes between 008 and 010. Whoever merges second reconciles the staging-count comment.
  - `CONTEXT.md`: append only.
  - The `staging` branch holds one track at a time.
- **Install-id storage is load-bearing for the client plans:** iOS keychain `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, Android `noBackupFilesDir`. Android ships `allowBackup="true"` with no rules, so SharedPreferences would be restored onto new phones (F13). Clients must also serialize unregister before the next registration (§3.1 ordering rule).
- **Expected `inviteSendService` behavior changes:** a non-UUID `program_id` or a non-string `username` now gets 400 (both used to be swallowed 200s). Whitespace-only usernames still give the `unknown_username` no-op.
- **File sizes:** `inviteService.js` stays at about 265 lines (`respondToInvite` alone is 160); accepted. `routes/notifications.js` lands at about 195 lines; `deviceService.js` at about 130.
- **No DB statement timeout exists** (pre-existing, outside this track). The new I/O timeouts are APNs at 10 s and FCM's built-in 15 s.
- **Rate limit:** the unregister limit is per IP. A carrier NAT shares 30 per minute, which is ample at one call per sign-out.
- **Simulator APNs:** a remote push to the iOS simulator needs an Apple-silicon Mac on macOS 13+ with an iOS 16+ simulator. If the simulator gets no banner but `push_deliveries` shows `lucas.b | ios | sent`, APNs accepted it; that is enough for the staging gate.
