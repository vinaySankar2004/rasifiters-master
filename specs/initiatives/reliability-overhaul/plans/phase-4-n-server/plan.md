# PLAN: Phase 4 track N-SRV, notifications server (backend only)

**Brief accepted**: yes. The brief allows 33 files: 11 to modify, 20 new code files, plus docs. Four deviations are called out under "Decisions" (D1–D4). None of them adds a file outside the brief's scope. D3 splits the suggested `announcementService.js` into three files.

**Feature/version prediction**:
- notifications v0.5.0 → v0.6.0
- programs v0.2.0 → v0.3.0
- observability v0.3.0 → v0.4.0

All three are MINOR. Each is a pre-1.0 change to an owned interface or behaviour, and all are additive for live binaries. Dependents are FYI only.

**Surfaces in scope**: [backend] only. Web, iOS and Android build later against the **API CONTRACT** at the end (N3/N4/N5).

## Decisions (open questions resolved; each is law for the implementer)

| # | Decision | Why (one line) |
|---|---|---|
| Q1 | The composer sends as **`app.broadcast`**, which stays in LEGACY_TYPES. On old apps an announcement is a pop-up, as `/broadcast` already is. | Only 22/60 members can receive push and iOS ≤ 1.5.0 never asks for permission. A new type would reach most old-app members nowhere. Flipping it later is one constant (`ANNOUNCEMENT_TYPE`) plus a LEGACY_TYPES edit. |
| Q2 | `program.updated` is **not** a legacy type. | Otherwise old apps would show a blocking pop-up on every program edit. The push banner still informs them. |
| Q3 | "Nothing logged today" means workouts only (`workout_logs`). | Auto-synced steps and sleep would otherwise suppress almost every reminder. |
| Q4 | Streak = consecutive local days with ≥1 workout, across programs, ending today if logged, else yesterday. Computed in the new `memberActivityStats.js`. | `computeStreaks` is per-program and never resets. It is out of scope (F14). |
| Q5 | Members with no time zone: reminders and digest are **skipped** (never a guessed time). Local-time announcements fall back to the sender's `X-Time-Zone`, which is **required** for local mode. | New clients always send the header, so only old apps hit the fallback. |
| Q6 | The server returns `{unread, pending_invites, badge}`, where `badge = unread − unread program.invite_received + pending invites`. | Each invite counts exactly once (D-N4). |
| Q7 | The time zone is captured only on the three new routers and `PUT /device`. It is written only when it changes, with an upsert guarded by `WHERE … IS DISTINCT FROM`. | Not on every request: `middleware/auth.js` is owned by auth. |
| Q8 | A reminder or digest may go out up to **120 min late**, otherwise that day is skipped. A reminder window that crosses midnight belongs to the reminder's own day. | Survives deploys and missed ticks without sending twice. |
| Q9 | Retention runs as **pg_cron in 011**, plus a **one-time delete** of notifications older than 90 days inside 011. | Follows the 010 precedent. The backlog is gone before the inbox and badge ship. |
| Q10 | Android: **no `notificationCount`**. The OS draws launcher dots; this is the one platform-idiom divergence. Stacking uses one channel per category. The **replace key** (FCM `tag` on Android, APNs `collapse-id` on iOS, mirrored for parity) is used for reminders and digest only. | FCM `tag` replaces rather than stacks. |
| Q11 / **D1** | The D-N14 badge gate is a **per-installation capability flag**: `PUT /device {"inbox": true}` sets `member_push_tokens.supports_inbox`. There is **no** build-number threshold and **no** `app_version`/`app_build` columns. | Quick-wins test builds 59 / versionCode 6 will ship before N4/N5. A build gate would give them badges they never clear and Android channel ids they never created (foreground posts dropped, mismatch 3). The same flag gates the Android category channels. |
| Q12 | When merge fields are used, each recipient gets their own `notifications` row. Without merge fields, one shared row. "Everyone" means all `members.status='active'`. | Title and body live on `notifications`. About 60 members. |
| Q13 | Kudos type `activity.kudos_received`, target `inbox`, template vars fixed in contract C8. | This freezes the People S1 seam now. |
| **D2** | `models/index.js` is **not modified**. The 3 new models have no associations (the PushDelivery/AppEvent pattern). | One less file shared with People S1. |
| **D3** | The suggested `announcementService.js` becomes `announcementRequest.js` (validation), `announcementService.js` (resolve, preview, create, list, cancel) and `announcementDelivery.js` (sending). | Keeps each file ≤ ~200 lines. |
| **D4** | **No** `NOTIFICATIONS_SCHEDULER_ENABLED` kill switch. | It would need `render.yaml` and ENV_RUNBOOK, which are outside the brief. The send key bounds any damage, reminders and digest are opt-in, announcements can be cancelled, and an emergency stop is a deploy revert. |

## Steps — backend

All paths are relative to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/`.

1. **NEW `sql/011_notifications_inbox_prefs_scheduler.sql`**:
```sql
-- 011_notifications_inbox_prefs_scheduler.sql — notification preferences, the never-send-twice ledger, the announcement
-- audit, the inbox capability on the device registry and 90-day notification retention (reliability-overhaul Phase 4
-- track N-SRV; specs/features/notifications/SPEC.md 0.6.0 — D-C21 … D-C28).
--
-- WHAT
--   PART 1  notification_preferences — one row per member; NO row = the defaults (program, activity, announcements on;
--           reminders + digest OFF; reminder 19:00 local). time_zone = the member's IANA zone (from X-Time-Zone).
--   PART 2  notification_send_keys — the never-send-twice key, PK (member_id, kind, period_key), claimed with
--           INSERT … ON CONFLICT DO NOTHING RETURNING before every scheduled send.
--   PART 3  notification_announcements — the composer's audit + schedule. NO FK to notifications (retention deletes those).
--   PART 4  member_push_tokens.supports_inbox — true once an installation registers from a Phase 4 (inbox) build.
--   PART 5  RLS on the `public` copies only; on `staging`: grants for rasifiters_staging + RLS off (008 §5).
--   PART 6  Retention: ONE-TIME delete of notifications older than 90 days (cascades to notification_recipients and
--           push_deliveries — clears the old unread backlog before the inbox + badge ship, D-N11), then nightly pg_cron per
--           schema: notifications_retention_<schema> 04:32 UTC, notification_send_keys_retention_<schema> 04:37 UTC.
--
-- SCHEMA-NEUTRAL (DESIGN_BOARD §8): no schema names outside PART 5's staging-only branch. Run it TWICE, staging first:
--   SQL editor: first line `SET search_path TO staging;` + this file → Run → VERIFY block; then the same with
--               `SET search_path TO public;`.
--   psql:       psql "$SUPABASE_DATABASE_URL" -c "SET search_path TO staging" -f apps/backend/sql/011_notifications_inbox_prefs_scheduler.sql
--               — session pooler / direct connection (port 5432) ONLY (never the 6543 transaction pooler).
--   If the SQL editor offers "Run and enable RLS", run WITHOUT it.
-- ORDER: on each schema BEFORE the notifications 0.6.0 backend reaches the branch deploying there (`staging`, then
-- `main`): createNotification reads notification_preferences inside every emit transaction — without this table every
-- invite / role change / leave would fail. Safe while the 0.5.0 backend still runs (it never touches PARTS 1–4).
-- IDEMPOTENT: IF NOT EXISTS everywhere; the delete only removes > 90-day rows; GRANT / RLS / cron.schedule re-run safely.
-- LOCK TIMEOUT: the ALTER takes a brief exclusive lock on member_push_tokens, capped at 5 s — if it fires, re-run.
-- WHO RUNS IT: the USER — never Claude (CLAUDE.md DB-write policy). Nothing secret in here (the repo is public).

SET lock_timeout = '5s';

-- ===== PART 1 — notification_preferences =======================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
    member_id      uuid NOT NULL,
    program        boolean DEFAULT true  NOT NULL,
    activity       boolean DEFAULT true  NOT NULL,
    reminders      boolean DEFAULT false NOT NULL,
    digest         boolean DEFAULT false NOT NULL,
    announcements  boolean DEFAULT true  NOT NULL,
    reminder_time  time without time zone DEFAULT '19:00' NOT NULL,
    time_zone      character varying(64),
    created_at     timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at     timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT notification_preferences_pkey PRIMARY KEY (member_id),
    CONSTRAINT notification_preferences_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- ===== PART 2 — notification_send_keys =========================================================================
CREATE TABLE IF NOT EXISTS notification_send_keys (
    member_id   uuid NOT NULL,
    kind        character varying(32) NOT NULL,
    period_key  character varying(64) NOT NULL,
    created_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT notification_send_keys_pkey PRIMARY KEY (member_id, kind, period_key),
    CONSTRAINT notification_send_keys_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notification_send_keys_created_at ON notification_send_keys USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_notification_send_keys_kind_period ON notification_send_keys USING btree (kind, period_key);

-- ===== PART 3 — notification_announcements =====================================================================
CREATE TABLE IF NOT EXISTS notification_announcements (
    id                  uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sender_member_id    uuid,
    target_kind         character varying(16) NOT NULL,
    target_program_id   uuid,
    recipient_ids       uuid[] NOT NULL,
    title_template      text NOT NULL,
    body_template       text NOT NULL,
    mode                character varying(8) NOT NULL,
    send_date           date,
    send_time           time without time zone,
    fallback_time_zone  character varying(64),
    status              character varying(16) NOT NULL,
    recipient_count     integer NOT NULL,
    sent_count          integer DEFAULT 0 NOT NULL,
    completed_at        timestamp with time zone,
    CONSTRAINT notification_announcements_pkey PRIMARY KEY (id),
    CONSTRAINT notification_announcements_target_kind_check CHECK (target_kind IN ('program', 'members', 'everyone')),
    CONSTRAINT notification_announcements_mode_check CHECK (mode IN ('now', 'local')),
    CONSTRAINT notification_announcements_status_check CHECK (status IN ('scheduled', 'sending', 'sent', 'cancelled')),
    CONSTRAINT notification_announcements_local_check
        CHECK (mode = 'now' OR (send_date IS NOT NULL AND send_time IS NOT NULL AND fallback_time_zone IS NOT NULL)),
    CONSTRAINT notification_announcements_sender_fkey FOREIGN KEY (sender_member_id) REFERENCES members(id) ON DELETE SET NULL,
    CONSTRAINT notification_announcements_program_fkey FOREIGN KEY (target_program_id) REFERENCES programs(id) ON DELETE SET NULL
);

-- ===== PART 4 — device registry: inbox capability ==============================================================
ALTER TABLE member_push_tokens ADD COLUMN IF NOT EXISTS supports_inbox boolean DEFAULT false NOT NULL;

-- ===== PART 5 — RLS (public) / grants + RLS off (staging) ======================================================
DO $$
DECLARE t text;
BEGIN
    IF current_schema() = 'public' THEN
        ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
        ALTER TABLE notification_send_keys ENABLE ROW LEVEL SECURITY;
        ALTER TABLE notification_announcements ENABLE ROW LEVEL SECURITY;
    ELSIF current_schema() = 'staging' THEN
        GRANT SELECT, INSERT, UPDATE, DELETE
            ON notification_preferences, notification_send_keys, notification_announcements TO rasifiters_staging;
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'staging' LOOP
            EXECUTE format('ALTER TABLE staging.%I DISABLE ROW LEVEL SECURITY', t);
        END LOOP;
    END IF;
END $$;

-- ===== PART 6 — retention (pg_cron is already enabled by 007) ==================================================
DELETE FROM notifications WHERE created_at < now() - interval '90 days';

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
    'notifications_retention_' || current_schema(),
    '32 4 * * *',
    format('DELETE FROM %I.notifications WHERE created_at < now() - interval %L', current_schema(), '90 days')
);

SELECT cron.schedule(
    'notification_send_keys_retention_' || current_schema(),
    '37 4 * * *',
    format('DELETE FROM %I.notification_send_keys WHERE created_at < now() - interval %L', current_schema(), '90 days')
);

-- ===== VERIFY (read-only — run after each schema's run, with the same `SET search_path TO <schema>;` first) =====
-- SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema()
--    AND table_name IN ('notification_preferences', 'notification_send_keys', 'notification_announcements');   → 3
-- SELECT column_default, is_nullable FROM information_schema.columns WHERE table_schema = current_schema()
--    AND table_name = 'member_push_tokens' AND column_name = 'supports_inbox';                                → false | NO
-- SELECT count(*) FROM notifications WHERE created_at < now() - interval '90 days';                            → 0
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname IN ('notifications_retention_' || current_schema(),
--    'notification_send_keys_retention_' || current_schema()) ORDER BY 1;
--    → notification_send_keys_retention_<schema> | 37 4 * * * | t ; notifications_retention_<schema> | 32 4 * * * | t
-- SELECT relrowsecurity FROM pg_class WHERE oid IN ('notification_preferences'::regclass,
--    'notification_send_keys'::regclass, 'notification_announcements'::regclass);            → public: t t t · staging: f f f
-- staging only:
-- SELECT has_table_privilege('rasifiters_staging', 'staging.notification_preferences', 'INSERT'),
--        has_table_privilege('rasifiters_staging', 'staging.notification_send_keys', 'INSERT'),
--        has_table_privilege('rasifiters_staging', 'staging.notification_announcements', 'INSERT');        → t | t | t
```

2. **`utils/clientInfo.js`** (`X-Time-Zone` parser; observability owns the header contract):
   - (a) After line 10 (the `X-Request-Id` comment line) insert:
```js
//   X-Time-Zone     IANA zone (e.g. America/Vancouver), ≤ 64 chars of [A-Za-z0-9_+-/:] that Intl accepts → its canonical
//                   name (Intl's casing), else null. Read ONLY by the notifications routes (time-zone capture,
//                   notifications D-C23) — never logged, never part of getClientInfo.
```
   - (b) After line 14 (`const REQUEST_ID_RE = …`) insert `const TIME_ZONE_RE = /^[A-Za-z0-9_+\-/:]{1,64}$/;`
   - (c) After line 34 (`const parseRequestId = …`) insert:
```js
const parseTimeZone = (raw) => {
    if (typeof raw !== "string") return null;
    const value = raw.trim();
    if (!TIME_ZONE_RE.test(value)) return null;
    try {
        return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
    } catch (_err) {
        return null; // RangeError: not a zone this runtime knows
    }
};
```
   - (d) Line 51: change the export to `module.exports = { getClientInfo, parsePlatform, parseVersion, parseBuild, parseRequestId, parseTimeZone, platformFromUserAgent };`

3. **NEW `utils/localTime.js`**:
```js
// Local calendar math for an IANA time zone, with Intl only (no dependency) — notifications SPEC §3.6 (0.6.0). Dates are
// "YYYY-MM-DD" strings (they compare correctly as strings); times are "HH:MM"; weekday 1 = Monday … 7 = Sunday (ISO).
const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const formatters = new Map(); // zone → formatter (zones are a small, bounded set)

const formatterFor = (timeZone) => {
    let formatter = formatters.get(timeZone);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hourCycle: "h23",
            weekday: "short",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
        formatters.set(timeZone, formatter);
    }
    return formatter;
};

/** { date, minutes (0–1439), weekday (1–7) } of `now` in `timeZone`; null for a missing zone or one Intl rejects. */
function localParts(timeZone, now = new Date()) {
    if (!timeZone) return null;
    let parts;
    try {
        parts = formatterFor(timeZone).formatToParts(now);
    } catch (_err) {
        return null;
    }
    const value = (type) => parts.find((part) => part.type === type)?.value;
    return {
        date: `${value("year")}-${value("month")}-${value("day")}`,
        minutes: Number(value("hour")) * 60 + Number(value("minute")),
        weekday: WEEKDAYS[value("weekday")]
    };
}

const toMinutes = (time) => {
    const [hours, minutes] = String(time).split(":").map(Number);
    return hours * 60 + minutes;
};

// A real calendar date ("2026-02-30" is not — Date.parse would roll it over).
const isValidDate = (date) =>
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;

const addDaysToDate = (date, days) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};

/** ISO-8601 week of a date, e.g. "2026-W42" — the weekly digest's never-send-twice period. */
function isoWeekKey(date) {
    const d = new Date(`${date}T00:00:00Z`);
    const weekday = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - weekday); // the Thursday of this ISO week decides its year
    const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
    const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** "today" | "yesterday" | "on Oct 12" — copy relative to the recipient's local today (People kudos uses it). */
function dayLabel(date, today) {
    if (date === today) return "today";
    if (date === addDaysToDate(today, -1)) return "yesterday";
    const label = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" })
        .format(new Date(`${date}T00:00:00Z`));
    return `on ${label}`;
}

module.exports = { localParts, toMinutes, isValidDate, addDaysToDate, isoWeekKey, dayLabel };
```

4. **NEW `utils/notificationCategories.js`**:
```js
// Notification categories — notifications SPEC §3.4 (0.6.0, D-C19). The ONE map: notification type → category + deep-link
// target, every per-category delivery setting (Android channel, the replace key; APNs thread = the category) and
// LEGACY_TYPES — the types every pre-inbox client already shows (iOS ≤ 1.5.0 (58), Android ≤ 1.1.0 (5), web before N3).
// Those clients turn ANY item on GET /unacknowledged or a plain stream into a blocking pop-up, so both legacy paths carry
// only LEGACY_TYPES (D-C20). A new type is added HERE (category + target) and nowhere else; an unknown type counts as
// program / inbox.
const CATEGORIES = ["program", "activity", "reminders", "digest", "announcements"];

// D-N2 (c), 2026-10-13: switched OFF, these are never created for that member; program + announcements are still
// created (they stay in the inbox) but not pushed.
const DROP_WHEN_OFF = new Set(["activity", "reminders", "digest"]);

const TYPES = {
    "program.invite_received": { category: "program", target: "invites" },
    "program.member_joined": { category: "program", target: "program" },
    "program.role_changed": { category: "program", target: "program" },
    "program.admin_transferred": { category: "program", target: "program" },
    "program.member_left": { category: "program", target: "program" },
    "program.member_removed": { category: "program", target: "programs" },
    "program.updated": { category: "program", target: "program" },
    "program.deleted": { category: "program", target: "programs" },
    "activity.kudos_received": { category: "activity", target: "inbox" },
    "reminder.daily": { category: "reminders", target: "log_workout" },
    "digest.weekly": { category: "digest", target: "inbox" },
    "app.broadcast": { category: "announcements", target: "inbox" }
};
const FALLBACK = { category: "program", target: "inbox" };

// program.updated is deliberately NOT here: live binaries would pop up a blocking modal on every program edit (D-C20).
const LEGACY_TYPES = new Set([
    "program.invite_received",
    "program.member_joined",
    "program.role_changed",
    "program.admin_transferred",
    "program.member_left",
    "program.member_removed",
    "program.deleted",
    "app.broadcast"
]);

// Android: the two channels every live build has (notifications §3.2) …
const CHANNEL_DEFAULT = "rasi_default";
const CHANNEL_INVITES = "rasi_invites";
const INVITE_CHANNEL_TYPES = new Set([
    "program.invite_received",
    "program.role_changed",
    "program.admin_transferred",
    "program.member_removed"
]);
// … plus one per new category, created only by the inbox-capable Android build (N5). Android 1.1.0 posts a foreground
// push on the message's channel id and Android drops a post to a channel that doesn't exist, so these ids go ONLY to
// installations registered with `inbox: true` (member_push_tokens.supports_inbox — D-C26).
const INBOX_CHANNELS = {
    activity: "rasi_activity",
    reminders: "rasi_reminders",
    digest: "rasi_digest",
    announcements: "rasi_announcements"
};
// Once-a-day / once-a-week kinds REPLACE the previous one on the device (FCM tag + APNs collapse id); the rest stack.
const REPLACE_CATEGORIES = new Set(["reminders", "digest"]);

const describe = (type) => TYPES[type] || FALLBACK;
const categoryFor = (type) => describe(type).category;
const targetFor = (type) => describe(type).target;
const inboxFields = (type) => ({ category: categoryFor(type), target: targetFor(type) });

const androidChannelFor = (type, supportsInbox) => {
    const inboxChannel = INBOX_CHANNELS[categoryFor(type)];
    if (supportsInbox && inboxChannel) return inboxChannel;
    return INVITE_CHANNEL_TYPES.has(type) ? CHANNEL_INVITES : CHANNEL_DEFAULT;
};

const replaceKeyFor = (type) => {
    const category = categoryFor(type);
    return REPLACE_CATEGORIES.has(category) ? category : null;
};

module.exports = {
    CATEGORIES,
    DROP_WHEN_OFF,
    LEGACY_TYPES,
    INBOX_CHANNELS,
    categoryFor,
    targetFor,
    inboxFields,
    androidChannelFor,
    replaceKeyFor
};
```

5. **NEW `utils/notificationTemplates.js`**:
```js
// Personalized notification content — notifications SPEC §3.7 (0.6.0, D-C27; D-N17). THE content seam of the pipeline
// content source → trigger → preferences → channel (DESIGN_BOARD §9 Direction). Every generated notification — daily
// reminder, weekly digest, kudos (People emits it), announcement merge fields — gets its title + body here, filled with
// the recipient's own data. Wording rotates deterministically: sha256(seedKey) picks the variant, so a retry for the
// same member + period renders the same words. A later AI provider implements the same async
// render(type, vars, seedKey) → { title, body } behind getContentProvider(); an email channel plugs in at
// utils/notificationChannels.js. No AI / email code here. Copy: ASCII apostrophes only (frontend-kit §3).
const crypto = require("crypto");

const NAME_FALLBACK = "friend";
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

// {name} → vars.name; a name with no value is left as written (announcement validation rejects unknown names).
const fill = (text, vars) =>
    text.replace(/\{([a-z_]+)\}/g, (match, name) =>
        (vars[name] === undefined || vars[name] === null ? match : String(vars[name])));

const pick = (variants, seedKey) =>
    variants[crypto.createHash("sha256").update(String(seedKey)).digest().readUInt32BE(0) % variants.length];

const REMINDER = [
    { title: "Time to move, {first_name}", body: "Nothing logged yet today. Even 15 minutes counts." },
    { title: "Your workout is waiting", body: "Log today's workout in RaSi Fiters and keep your progress going." },
    { title: "A quick one today, {first_name}?", body: "Fit in a workout today, then log it in RaSi Fiters." }
];
const REMINDER_STREAK = [
    { title: "Keep your {streak}-day streak going", body: "Log a workout today to make it {next_streak} days." },
    { title: "{streak} days in a row, {first_name}!", body: "One workout today keeps your streak alive." },
    { title: "Don't break the chain", body: "You're on a {streak}-day streak. Log a workout today to keep it." }
];
const DIGEST_ACTIVE = [
    { title: "Your week in RaSi Fiters", body: "{workouts_text} on {days_text} last week{minutes_phrase}." },
    { title: "Weekly recap, {first_name}", body: "Last week you logged {workouts_text} on {days_text}{minutes_phrase}. Keep it up!" },
    { title: "Nice work last week, {first_name}", body: "{workouts_text} across {days_text}{minutes_phrase}. Here's to another strong week." }
];
const DIGEST_QUIET = [
    { title: "A fresh week, {first_name}", body: "No workouts logged last week. A new week starts today, so log one when you can." },
    { title: "New week, new start", body: "Last week was quiet. One workout this week gets you moving again." }
];
const DIGEST_STREAK_SUFFIX = " You're on a {streak}-day streak.";
const KUDOS = [
    { title: "{actor_first_name} gave you kudos", body: "For your workout {day_label}. Nice work, {first_name}!" },
    { title: "Kudos from {actor_first_name}", body: "{actor_first_name} cheered your workout {day_label}." },
    { title: "You got kudos, {first_name}!", body: "{actor_first_name} gave you kudos for your workout {day_label}." }
];

// type → (vars) → { variants, vars, suffix } — derived words (plurals, phrases) are computed once, here.
const TEMPLATES = {
    "reminder.daily": (vars) => ({
        variants: vars.streak >= 2 ? REMINDER_STREAK : REMINDER,
        vars: { ...vars, next_streak: vars.streak + 1 }
    }),
    "digest.weekly": (vars) => ({
        variants: vars.workouts > 0 ? DIGEST_ACTIVE : DIGEST_QUIET,
        vars: {
            ...vars,
            workouts_text: plural(vars.workouts, "workout"),
            days_text: plural(vars.active_days, "day"),
            minutes_phrase: vars.minutes > 0 ? ` (${vars.minutes} min)` : ""
        },
        suffix: vars.workouts > 0 && vars.streak >= 2 ? DIGEST_STREAK_SUFFIX : ""
    }),
    "activity.kudos_received": (vars) => ({ variants: KUDOS, vars })
};

/** { title, body } for a templated type; throws for a type without templates (a programming error). */
function renderTemplate(type, vars, seedKey) {
    const build = TEMPLATES[type];
    if (!build) throw new Error(`No notification template for ${type}`);
    const spec = build({ ...vars, first_name: vars.first_name || NAME_FALLBACK });
    const variant = pick(spec.variants, seedKey);
    return { title: fill(variant.title, spec.vars), body: fill(variant.body + (spec.suffix || ""), spec.vars) };
}

// The content-provider contract (D-C27): async render(type, vars, seedKey) → { title, body }. Today: the templates above.
const templateContentProvider = {
    name: "templates",
    render: async (type, vars, seedKey) => renderTemplate(type, vars, seedKey)
};
const getContentProvider = () => templateContentProvider;

// Announcements (D-N16): the sender's own title / body with these merge fields.
const MERGE_FIELDS = ["first_name", "streak", "program_name"];
const findMergeFields = (text) => [...new Set(Array.from(String(text).matchAll(/\{([a-z_]+)\}/g), (m) => m[1]))];
const renderMergeFields = (text, vars) => fill(text, { ...vars, first_name: vars.first_name || NAME_FALLBACK });

module.exports = { getContentProvider, renderTemplate, renderMergeFields, findMergeFields, MERGE_FIELDS };
```

6. **NEW models**. None of the three is registered in `models/index.js` (D2).
   - `models/NotificationPreference.js`:
```js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// notification_preferences — one row per member (notifications SPEC §3.5, sql/011). NO row = the defaults (= the column
// defaults). No associations — NOT registered in models/index.js (the PushDelivery pattern). Upserts are raw SQL in
// services/notificationPreferenceService.js; this model serves the reads.
const NotificationPreference = sequelize.define("NotificationPreference", {
    member_id: { type: DataTypes.UUID, primaryKey: true },
    program: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    activity: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    reminders: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    digest: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    announcements: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    reminder_time: { type: DataTypes.TIME, allowNull: false, defaultValue: "19:00" },
    time_zone: { type: DataTypes.STRING(64), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
    tableName: "notification_preferences",
    timestamps: false,
    underscored: true
});

module.exports = NotificationPreference;
```
   - `models/NotificationSendKey.js`:
```js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// notification_send_keys — the never-send-twice ledger (notifications SPEC §3.6, D-N9; sql/011). A scheduled send is
// CLAIMED (INSERT … ON CONFLICT DO NOTHING RETURNING) before it is sent; only the caller whose insert returned the row
// sends. Safe across restarts and across the two instances a Render deploy briefly runs. At most once: a crash between
// claim and send skips that one send — never a duplicate (F15). Kinds: reminder.daily (period = local date),
// digest.weekly (period = ISO week, e.g. 2026-W42), announcement (period = the announcement id).
// No associations — NOT registered in models/index.js.
const NotificationSendKey = sequelize.define("NotificationSendKey", {
    member_id: { type: DataTypes.UUID, primaryKey: true },
    kind: { type: DataTypes.STRING(32), primaryKey: true },
    period_key: { type: DataTypes.STRING(64), primaryKey: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
    tableName: "notification_send_keys",
    timestamps: false,
    underscored: true
});

const CLAIM_SQL = `
INSERT INTO notification_send_keys (member_id, kind, period_key)
SELECT t.member_id, :kind, t.period_key
FROM unnest(ARRAY[:memberIds]::uuid[], ARRAY[:periodKeys]::varchar[]) AS t(member_id, period_key)
ON CONFLICT DO NOTHING
RETURNING member_id, period_key`;

/** Claims every { memberId, periodKey } it can (ONE statement); returns the Set of "<memberId>|<periodKey>" THIS call won. */
NotificationSendKey.claim = async (kind, entries) => {
    const unique = [...new Map(entries.map((e) => [`${e.memberId}|${e.periodKey}`, e])).values()];
    if (unique.length === 0) return new Set();
    const [rows] = await sequelize.query(CLAIM_SQL, {
        replacements: {
            kind,
            memberIds: unique.map((e) => e.memberId),
            periodKeys: unique.map((e) => e.periodKey)
        }
    });
    return new Set(rows.map((row) => `${row.member_id}|${row.period_key}`));
};

/** Member ids already claimed for one kind + period (announcement progress). */
NotificationSendKey.claimedMemberIds = async (kind, periodKey) => {
    const rows = await NotificationSendKey.findAll({ where: { kind, period_key: periodKey }, attributes: ["member_id"], raw: true });
    return new Set(rows.map((row) => row.member_id));
};

module.exports = NotificationSendKey;
```
   - `models/NotificationAnnouncement.js`:
```js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// notification_announcements — the send-anytime composer's audit + schedule (notifications SPEC §3.8, D-C25; sql/011).
// Written by services/announcementService.js (create, cancel) and services/announcementDelivery.js (progress).
// No associations — NOT registered in models/index.js. No FK to notifications (the 90-day retention deletes those).
const NotificationAnnouncement = sequelize.define("NotificationAnnouncement", {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    sender_member_id: { type: DataTypes.UUID, allowNull: true },
    target_kind: { type: DataTypes.STRING(16), allowNull: false },
    target_program_id: { type: DataTypes.UUID, allowNull: true },
    recipient_ids: { type: DataTypes.ARRAY(DataTypes.UUID), allowNull: false },
    title_template: { type: DataTypes.TEXT, allowNull: false },
    body_template: { type: DataTypes.TEXT, allowNull: false },
    mode: { type: DataTypes.STRING(8), allowNull: false },
    send_date: { type: DataTypes.DATEONLY, allowNull: true },
    send_time: { type: DataTypes.TIME, allowNull: true },
    fallback_time_zone: { type: DataTypes.STRING(64), allowNull: true },
    status: { type: DataTypes.STRING(16), allowNull: false },
    recipient_count: { type: DataTypes.INTEGER, allowNull: false },
    sent_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    completed_at: { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: "notification_announcements",
    timestamps: false,
    underscored: true
});

module.exports = NotificationAnnouncement;
```

7. **`models/MemberPushToken.js`**: replace lines 35-42 (the `last_seen_at` block) with:
```js
    // notifications 0.4.0 (D-C11, sql/010): stamped by every registration (deviceService.registerDevice); the nightly
    // pg_cron prune drops rows unseen for 60 days. device_id (above) is the install id — partial unique index
    // uniq_member_push_tokens_device_id (WHERE device_id IS NOT NULL).
    last_seen_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    // notifications 0.6.0 (D-C26, sql/011): true once this installation registered from a Phase 4 build (PUT /device
    // `inbox: true`). Gates the iOS app-icon badge and the Android category channels.
    supports_inbox: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
```

8. **NEW `services/notificationPreferenceService.js`**:
```js
// Notification preferences + member time zone — notifications SPEC §3.5 (0.6.0, D-C21 / D-C23). One row per member
// (notification_preferences, sql/011); NO row = the defaults below (= 011's column defaults): program, activity and
// announcements on; reminders + digest OFF (opt-in — App Store 4.5.4, D-N7); reminder at 19:00 local.
// The time zone comes from each Phase 4 client's X-Time-Zone (utils/clientInfo.parseTimeZone, D-N6) and is written only
// when it changed. Old apps send none: such a member gets no reminder / digest (never a guessed time), and an
// announcement's local-time send uses the sender's zone instead.
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const NotificationPreference = require("../models/NotificationPreference");
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");

const DEFAULT_CATEGORIES = { program: true, activity: true, reminders: false, digest: false, announcements: true };
const DEFAULT_REMINDER_TIME = "19:00";
const CATEGORY_KEYS = Object.keys(DEFAULT_CATEGORIES);
const OPT_IN_CATEGORIES = new Set(["reminders", "digest"]);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SELECT_COLUMNS =
    "program, activity, reminders, digest, announcements, to_char(reminder_time, 'HH24:MI') AS reminder_time, time_zone";

const TZ_UPSERT_SQL = `
INSERT INTO notification_preferences (member_id, time_zone) VALUES (:memberId, :timeZone)
ON CONFLICT (member_id) DO UPDATE SET time_zone = EXCLUDED.time_zone, updated_at = now()
WHERE notification_preferences.time_zone IS DISTINCT FROM EXCLUDED.time_zone`;

const invalid = (message) => new AppError(400, message, { code: "invalid_body" });
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toResponse = (row) => ({
    categories: Object.fromEntries(CATEGORY_KEYS.map((key) => [key, row ? row[key] === true : DEFAULT_CATEGORIES[key]])),
    reminder_time: row?.reminder_time || DEFAULT_REMINDER_TIME,
    time_zone: row?.time_zone || null
});

async function saveTimeZone(memberId, timeZone) {
    if (!memberId || !timeZone) return;
    await sequelize.query(TZ_UPSERT_SQL, { replacements: { memberId, timeZone } });
}

/** Request paths: fire-and-forget — never delays or fails the request. */
function rememberTimeZone(memberId, timeZone) {
    if (!memberId || !timeZone) return;
    saveTimeZone(memberId, timeZone).catch((err) => logError("[notifications] time zone save failed:", err));
}

async function getPreferences(memberId, timeZone = null) {
    if (timeZone) {
        await saveTimeZone(memberId, timeZone).catch((err) => logError("[notifications] time zone save failed:", err));
    }
    const rows = await sequelize.query(
        `SELECT ${SELECT_COLUMNS} FROM notification_preferences WHERE member_id = :memberId`,
        { replacements: { memberId }, type: QueryTypes.SELECT }
    );
    return toResponse(rows[0]);
}

// PUT is partial: only the fields sent change. Unknown category keys are ignored (forward-compatible).
const parseUpdate = (body) => {
    if (!isObject(body)) throw invalid("Request body must be a JSON object.");
    const values = {};
    if (body.categories !== undefined) {
        if (!isObject(body.categories)) throw invalid("categories must be an object.");
        for (const key of CATEGORY_KEYS) {
            const value = body.categories[key];
            if (value === undefined) continue;
            if (typeof value !== "boolean") throw invalid(`categories.${key} must be true or false.`);
            values[key] = value;
        }
    }
    if (body.reminder_time !== undefined) {
        if (typeof body.reminder_time !== "string" || !TIME_RE.test(body.reminder_time)) {
            throw invalid("reminder_time must be HH:MM (24-hour).");
        }
        values.reminder_time = body.reminder_time;
    }
    if (Object.keys(values).length === 0) throw invalid("Nothing to update.");
    return values;
};

async function updatePreferences(memberId, body, timeZone = null) {
    const values = parseUpdate(body);
    if (timeZone) values.time_zone = timeZone;
    const columns = Object.keys(values); // only ever the whitelisted column names above
    const sql = `
INSERT INTO notification_preferences (member_id, ${columns.join(", ")})
VALUES (:memberId, ${columns.map((column) => `:${column}`).join(", ")})
ON CONFLICT (member_id) DO UPDATE SET ${columns.map((column) => `${column} = EXCLUDED.${column}`).join(", ")}, updated_at = now()
RETURNING ${SELECT_COLUMNS}`;
    const [rows] = await sequelize.query(sql, { replacements: { memberId, ...values } });
    return toResponse(rows[0]);
}

/** D-N2 (c) input for createNotification: Map memberId → is `category` on (default when no row). */
async function getCategoryPreferences(memberIds, category, transaction) {
    const fallback = DEFAULT_CATEGORIES[category] !== false;
    const enabled = new Map(memberIds.map((memberId) => [memberId, fallback]));
    if (!CATEGORY_KEYS.includes(category) || memberIds.length === 0) return enabled;
    const rows = await NotificationPreference.findAll({
        where: { member_id: memberIds },
        attributes: ["member_id", category],
        raw: true,
        transaction
    });
    for (const row of rows) enabled.set(row.member_id, row[category] === true);
    return enabled;
}

// Reminder / digest candidates: opted in, zone known, member active, in ≥ 1 active program (no program → nothing to log).
async function listOptedIn(category) {
    if (!OPT_IN_CATEGORIES.has(category)) throw new Error(`listOptedIn: ${category} is not an opt-in category`);
    return sequelize.query(`
SELECT np.member_id, m.first_name, to_char(np.reminder_time, 'HH24:MI') AS reminder_time, np.time_zone
FROM notification_preferences np
JOIN members m ON m.id = np.member_id
WHERE np.${category} = true
  AND np.time_zone IS NOT NULL
  AND m.status = 'active'
  AND EXISTS (SELECT 1 FROM program_memberships pm WHERE pm.member_id = np.member_id AND pm.status = 'active')`,
    { type: QueryTypes.SELECT });
}

/** Map memberId → time zone, for the members that have one. */
async function getTimeZones(memberIds) {
    if (memberIds.length === 0) return new Map();
    const rows = await NotificationPreference.findAll({
        where: { member_id: memberIds },
        attributes: ["member_id", "time_zone"],
        raw: true
    });
    return new Map(rows.filter((row) => row.time_zone).map((row) => [row.member_id, row.time_zone]));
}

module.exports = {
    DEFAULT_CATEGORIES,
    getPreferences,
    updatePreferences,
    saveTimeZone,
    rememberTimeZone,
    getCategoryPreferences,
    listOptedIn,
    getTimeZones
};
```

9. **NEW `services/notificationInboxService.js`**:
```js
// The notification inbox — notifications SPEC §3.5 (0.6.0, D-C22). Reads the existing notifications /
// notification_recipients tables (no new table): newest first, keyset-paged, last 90 days (sql/011's nightly retention
// deletes older rows). Read = acknowledged_at (D-N5). The badge counts an invite ONCE: unread items except
// program.invite_received, plus the member's pending, unexpired invites (the GET /my-invites rule — exact username).
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const { NotificationRecipient } = require("../models");
const { AppError } = require("../utils/response");
const { inboxFields } = require("../utils/notificationCategories");

const INBOX_DAYS = 90;
const PAGE_DEFAULT = 30;
const PAGE_MAX = 50;
const READ_IDS_MAX = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR_RE =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const invalid = (message) => new AppError(400, message, { code: "invalid_body" });

const listSql = (withCursor) => `
SELECT n.id, n.type, n.program_id, n.actor_member_id, n.title, n.body, n.created_at, nr.acknowledged_at AS read_at,
       to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
FROM notification_recipients nr
JOIN notifications n ON n.id = nr.notification_id
WHERE nr.member_id = :memberId
  AND n.created_at > now() - interval '${INBOX_DAYS} days'
  ${withCursor ? "AND (n.created_at, n.id) < (CAST(:cursorAt AS timestamptz), CAST(:cursorId AS uuid))" : ""}
ORDER BY n.created_at DESC, n.id DESC
LIMIT :limit`;

const COUNTS_SQL = `
SELECT m.id AS member_id, u.unread, u.unread_invites, p.pending_invites
FROM members m
CROSS JOIN LATERAL (
    SELECT count(*)::int AS unread,
           count(*) FILTER (WHERE n.type = 'program.invite_received')::int AS unread_invites
    FROM notification_recipients nr
    JOIN notifications n ON n.id = nr.notification_id
    WHERE nr.member_id = m.id AND nr.acknowledged_at IS NULL AND n.created_at > now() - interval '${INBOX_DAYS} days'
) u
CROSS JOIN LATERAL (
    SELECT count(*)::int AS pending_invites
    FROM program_invites pi
    WHERE pi.invited_username = m.username AND pi.status = 'pending'
      AND (pi.expires_at IS NULL OR pi.expires_at > now())
) p
WHERE m.id IN (:memberIds)`;

const parseLimit = (raw) => {
    if (raw === undefined) return PAGE_DEFAULT;
    const limit = Number(raw);
    if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX) throw invalid(`limit must be 1-${PAGE_MAX}.`);
    return limit;
};

async function listInbox(memberId, query = {}) {
    const limit = parseLimit(query.limit);
    let cursor = null;
    if (query.before !== undefined) {
        const match = typeof query.before === "string" ? CURSOR_RE.exec(query.before) : null;
        if (!match) throw invalid("before must be a next_cursor value.");
        cursor = { cursorAt: match[1], cursorId: match[2].toLowerCase() };
    }
    const rows = await sequelize.query(listSql(Boolean(cursor)), {
        replacements: { memberId, limit: limit + 1, ...(cursor || {}) },
        type: QueryTypes.SELECT
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
        items: page.map((row) => ({
            id: row.id,
            type: row.type,
            ...inboxFields(row.type),
            program_id: row.program_id,
            actor_member_id: row.actor_member_id,
            title: row.title,
            body: row.body,
            created_at: row.created_at,
            read_at: row.read_at
        })),
        next_cursor: rows.length > limit && last ? `${last.cursor_at}_${last.id}` : null
    };
}

/** Map memberId → { unread, pending_invites, badge } — ONE query (also the push badge, utils/pushNotifications.js). */
async function getBadgeCounts(memberIds) {
    const counts = new Map();
    if (memberIds.length === 0) return counts;
    const rows = await sequelize.query(COUNTS_SQL, { replacements: { memberIds }, type: QueryTypes.SELECT });
    for (const row of rows) {
        counts.set(row.member_id, {
            unread: row.unread,
            pending_invites: row.pending_invites,
            badge: row.unread - row.unread_invites + row.pending_invites
        });
    }
    return counts;
}

async function getUnreadCounts(memberId) {
    return (await getBadgeCounts([memberId])).get(memberId) || { unread: 0, pending_invites: 0, badge: 0 };
}

/** { all: true } or { ids: [...] } → marks them read (acknowledged_at = now); idempotent; returns fresh counts. */
async function markRead(memberId, body) {
    const where = { member_id: memberId, acknowledged_at: null };
    const ids = body?.ids;
    if (body?.all === true) {
        // every unread item
    } else if (Array.isArray(ids) && ids.length > 0 && ids.length <= READ_IDS_MAX
        && ids.every((id) => typeof id === "string" && UUID_RE.test(id))) {
        where.notification_id = ids.map((id) => id.toLowerCase());
    } else {
        throw invalid(`Send { "all": true } or { "ids": [...] } with 1-${READ_IDS_MAX} notification ids.`);
    }
    const [updated] = await NotificationRecipient.update({ acknowledged_at: new Date() }, { where });
    return { updated, ...(await getUnreadCounts(memberId)) };
}

module.exports = { listInbox, getBadgeCounts, getUnreadCounts, markRead };
```

10. **`utils/notificationStreams.js`**: replace the whole file:
```js
// In-process SSE registry — see specs/features/notifications/SPEC.md §3 + §3.3 (F2: single-instance).
// Maps memberId → the Set of open SSE response streams; sendNotificationToMember writes the `event: notification` frame
// to each, evicting any stream that throws on write.
// 0.4.0 (D-C16): closeAllNotificationStreams ends every stream with a PLAIN close at shutdown (server.js SIGTERM) —
// never a frame: iOS 1.4.x decodes ANY data: frame as a notification. After it runs, a newly registered stream is
// closed at once, so a draining instance holds no stream open.
// 0.6.0 (D-C20): each stream carries its capability. A stream opened with ?inbox=1 (a Phase 4 client) gets EVERY type
// as an inbox item (the 7 fields + category, target, read_at). Any other stream — every live binary and today's web,
// which turn each frame into a blocking pop-up — gets only LEGACY_TYPES, in the unchanged 7-field payload.
const { LEGACY_TYPES, inboxFields } = require("./notificationCategories");

const streamsByMember = new Map();
let closing = false;

const registerNotificationStream = (memberId, res, { inbox = false } = {}) => {
    if (closing) {
        res.end();
        return;
    }
    res.locals.notificationsInbox = inbox === true;
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

const frame = (data) => `event: notification\ndata: ${JSON.stringify(data)}\n\n`;

const sendNotificationToMember = (memberId, payload) => {
    const streams = streamsByMember.get(memberId);
    if (!streams) return;
    const legacyFrame = LEGACY_TYPES.has(payload.type) ? frame(payload) : null;
    const inboxFrame = frame({ ...payload, ...inboxFields(payload.type), read_at: null });
    for (const res of streams) {
        const data = res.locals?.notificationsInbox === true ? inboxFrame : legacyFrame;
        if (!data) continue;
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

11. **`utils/push/apns.js`**:
   - (a) Append to the header (after line 6): `// 0.6.0 (D-C26): aps.thread-id = the category; apns-collapse-id = the replace key (reminders / digest); aps.badge only when the facade set token.badge (inbox-capable devices). Never an interruption-level (no Time Sensitive — D-N8).`
   - (b) Replace lines 58-66 (`buildNote`) with:
```js
const buildNote = (message, token) => {
    const note = new apn.Notification();
    note.expiry = Math.floor(Date.now() / 1000) + message.ttlSeconds;
    note.sound = "default";
    note.alert = { title: message.title, body: message.body };
    note.topic = process.env.APNS_BUNDLE_ID;
    note.payload = message.data;
    if (message.category) note.threadId = message.category;
    if (message.replaceKey) note.collapseId = message.replaceKey;
    if (Number.isInteger(token.badge)) note.badge = token.badge;
    return note;
};
```
   - (c) Replace lines 107-108 with:
```js
    const attempts = await Promise.all(tokens.map((token) => sendOne(apnProvider, buildNote(message, token), token)));
```

12. **`utils/push/fcm.js`**: replace the whole file:
```js
// FCM sender (Android) — notifications SPEC §3.2. getFcmApp() is the faithful lazy, named firebase-admin app from
// FIREBASE_SERVICE_ACCOUNT (null when unset/unparsable ⇒ every Android token records `not_configured`). Every message
// carries an explicit channel id + TTL (D-C13). 0.6.0 (D-C26): ONE message per token (sendEach) so each device gets its
// own channel — a category channel only when the installation registered as inbox-capable (Android 1.1.0 posts a
// foreground push on the message's channel id and a missing channel drops it) — and `tag` (replace, not stack) for
// reminders + digest. No notification_count: Android shows launcher dots itself (platform idiom). firebase-admin 12.x
// times each send out after 15 s. Prunes only on dead-token codes; `invalid-argument` is a payload bug — logged at error
// level, token kept (D-C14). Returns one attempt per token — { token, outcome, errorCode } — and never throws.
const admin = require("firebase-admin");
const { logError } = require("../logError");
const { androidChannelFor } = require("../notificationCategories");

// FCM v1 UNREGISTERED / NOT_FOUND map to registration-token-not-registered (firebase-admin lib/utils/error.js).
const DEAD_TOKEN_CODES = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token"
]);

let fcmApp = null;

// The service-account credential (Firebase console → Project settings → Service accounts → Generate new
// private key). Provided via FIREBASE_SERVICE_ACCOUNT (base64-encoded JSON preferred; raw JSON also
// accepted) — the secret stays out of git (render.yaml declares it sync:false). Returns null (⇒ FCM
// no-ops) when unset or unparsable — the APNs-deferral pattern, mirrored for Android.
function getFcmApp() {
    if (fcmApp) return fcmApp;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw || !raw.trim()) return null;

    let serviceAccount;
    try {
        const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
        serviceAccount = JSON.parse(text);
    } catch (err) {
        console.warn("[push] FIREBASE_SERVICE_ACCOUNT could not be parsed: %s", err.name); // never the message — JSON.parse quotes the input
        return null;
    }

    try {
        // A named app ("fcm") so this never collides with any other admin.initializeApp() call.
        fcmApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, "fcm");
    } catch (err) {
        console.warn("[push] Firebase admin init failed:", err.message);
        return null;
    }
    return fcmApp;
}

const isDeadTokenCode = (code) => DEAD_TOKEN_CODES.has(code);

const buildMessage = (token, message) => {
    const notification = { channelId: androidChannelFor(message.type, token.supports_inbox === true) };
    if (message.replaceKey) notification.tag = message.replaceKey;
    return {
        token: token.device_token,
        // The notification block stays: Android 1.0.0 ignores data-only messages.
        notification: { title: message.title, body: message.body },
        data: message.data,
        android: {
            priority: "high",
            ttl: message.ttlSeconds * 1000, // firebase-admin takes milliseconds
            notification
        }
    };
};

async function sendFcm(tokens, message) {
    if (tokens.length === 0) return [];
    const app = getFcmApp();
    if (!app) {
        console.warn("[push] FCM not configured; skipping Android.");
        return tokens.map((token) => ({ token, outcome: "not_configured", errorCode: null }));
    }

    let response;
    try {
        // sendEach takes ≤ 500 messages per call — the whole member base is far below it (same cap as the old multicast).
        response = await admin.messaging(app).sendEach(tokens.map((token) => buildMessage(token, message)));
    } catch (err) {
        logError("[push] FCM send error:", err);
        return tokens.map((token) => ({ token, outcome: "failed", errorCode: err.code || "send_error" }));
    }

    const attempts = response.responses.map((r, i) => {
        const token = tokens[i];
        if (r.success) return { token, outcome: "sent", errorCode: null };
        const code = r.error?.code || "unknown";
        if (code === "messaging/invalid-argument") {
            logError("[push] FCM invalid-argument — payload bug, token kept:", r.error);
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

module.exports = { getFcmApp, sendFcm, isDeadTokenCode };
```

13. **`utils/pushNotifications.js`**: replace the whole file:
```js
// Native push facade — specs/features/notifications/SPEC.md §3 + §3.2. sendPushToMembers is the ONE entry point (called
// by the push channel, utils/notificationChannels.js, after the notification commits):
//   1. one member_push_tokens query for every recipient, both platforms;
//   2. APNs (utils/push/apns.js) and FCM (utils/push/fcm.js) in parallel — 7-day lifetime, per-category thread/channel;
//   3. prune the tokens a provider declared dead (D-C14) — the 60-day unseen prune is pg_cron's (sql/010);
//   4. one push_deliveries row per attempt + one `no_device` row per recipient with no registered device (D-C15).
// 0.6.0 (D-C26): custom keys gain `category` + `target`; the replace key rides reminders + digest; an inbox-capable
// iPhone (supports_inbox) also gets aps.badge = its member's badge count — older apps never do (they never clear it).
// Fire-and-forget: never throws. getProvider / getFcmApp stay exported here (unchanged facade surface).
const { MemberPushToken } = require("../models");
const { getProvider, sendApns } = require("./push/apns");
const { getFcmApp, sendFcm } = require("./push/fcm");
const { recordDeliveries } = require("../services/pushDeliveryService");
const { getBadgeCounts } = require("../services/notificationInboxService");
const { categoryFor, targetFor, replaceKeyFor } = require("./notificationCategories");
const { logError } = require("./logError");

// APNs apns-expiration and FCM android.ttl (D-C13): 7 days (APNs was 1 h; FCM had none = its 4-week default).
const PUSH_TTL_SECONDS = 7 * 24 * 60 * 60;

// Custom keys on both platforms, all strings (FCM data values must be). Live binaries read only notification_id (+ type);
// category + target are additive (0.6.0) for the Phase 4 clients' routing. program_id is omitted when null.
const buildPushData = ({ id, type, programId }) => {
    const data = {
        notification_id: String(id || ""),
        type: String(type || ""),
        category: categoryFor(type),
        target: targetFor(type)
    };
    if (programId) data.program_id = String(programId);
    return data;
};

const pruneTokens = async (ids) => {
    if (ids.length === 0) return;
    try {
        await MemberPushToken.destroy({ where: { id: ids } });
    } catch (err) {
        logError("[push] token prune failed:", err);
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

// D-C26: the badge rides only on inbox-capable iPhones; a failed count just omits it (the push still goes).
const withBadges = async (iosTokens) => {
    const memberIds = [...new Set(iosTokens.filter((t) => t.supports_inbox).map((t) => t.member_id))];
    if (memberIds.length === 0) return iosTokens;
    let counts;
    try {
        counts = await getBadgeCounts(memberIds);
    } catch (err) {
        logError("[push] badge count failed:", err);
        return iosTokens;
    }
    return iosTokens.map((t) =>
        (t.supports_inbox && counts.has(t.member_id) ? { ...t, badge: counts.get(t.member_id).badge } : t));
};

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
            attributes: ["id", "member_id", "device_token", "platform", "supports_inbox"],
            raw: true
        });
        const message = {
            title: payload.title || "Notification",
            body: payload.body || "",
            type: payload.type || "",
            category: categoryFor(payload.type),
            replaceKey: replaceKeyFor(payload.type),
            data: buildPushData(payload),
            ttlSeconds: PUSH_TTL_SECONDS
        };
        const iosTokens = await withBadges(tokens.filter((t) => t.platform === "ios"));
        const [apnsAttempts, fcmAttempts] = await Promise.all([
            sendApns(iosTokens, message),
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
        logError("[push] sendPushToMembers failed:", err);
    }
}

module.exports = { getProvider, getFcmApp, sendPushToMembers, buildPushData, PUSH_TTL_SECONDS };
```

14. **NEW `utils/notificationChannels.js`**:
```js
// Delivery channels — notifications SPEC §3.7 (0.6.0, D-C27). Pipeline: content source → trigger → preferences → channel
// (DESIGN_BOARD §9 Direction). The stored notification + recipient rows ARE the inbox; a channel delivers one stored
// notification after its write commits:
//   inbox — the live in-app copy over the SSE registry, to every inbox recipient (the legacy filter lives there)
//   push  — APNs + FCM, only to recipients whose category switch is on (D-N2 c)
// A later channel (email) is one more entry with the same deliver({ payload, recipientIds, pushRecipientIds }) shape and
// its own recipient rule; nothing upstream changes. No email / AI code here.
const { sendNotificationToMember } = require("./notificationStreams");
const { sendPushToMembers } = require("./pushNotifications");
const { logError } = require("./logError");

const inboxChannel = {
    name: "inbox",
    deliver: async ({ payload, recipientIds }) => {
        recipientIds.forEach((memberId) => sendNotificationToMember(memberId, payload));
    }
};

const pushChannel = {
    name: "push",
    deliver: async ({ payload, pushRecipientIds }) => {
        if (pushRecipientIds.length === 0) return; // switched off → no push and no push_deliveries row
        await sendPushToMembers(pushRecipientIds, {
            id: payload.id,
            title: payload.title,
            body: payload.body,
            type: payload.type,
            programId: payload.program_id
        });
    }
};

const CHANNELS = [inboxChannel, pushChannel];

// Fire-and-forget: a channel failure is logged and never reaches the emitter (its write already committed).
const deliverToChannels = (delivery) => {
    for (const channel of CHANNELS) {
        Promise.resolve()
            .then(() => channel.deliver(delivery))
            .catch((err) => logError(`[notifications] ${channel.name} channel failed:`, err));
    }
};

module.exports = { deliverToChannels, CHANNELS };
```

15. **`utils/notifications.js`**: replace the whole file. The signature stays FIXED.
```js
// The notifications emit engine — see specs/features/notifications/SPEC.md §3 + §3.4.
// REPLACES the former deferred stub (programs D-C1 / program-memberships D-C4): createNotification does the real DB
// write + live in-app + push delivery. Callers — programs, memberships, invites, broadcast, announcements, the scheduler
// jobs and People's kudos — call createNotification + getActiveProgramMemberIds by name; the signature is FIXED.
// 0.6.0 (D-C19 / D-C21): the type's category (utils/notificationCategories.js) and each recipient's switch for it decide
// (D-N2 c): activity / reminders / digest OFF → no notification for that member; program / announcements OFF → still
// created (it is in the inbox) but not pushed. Delivery runs through utils/notificationChannels.js.
const {
    Notification,
    NotificationRecipient,
    ProgramMembership,
    MemberPushToken
} = require("../models");
const { categoryFor, DROP_WHEN_OFF } = require("./notificationCategories");
const { deliverToChannels } = require("./notificationChannels");
const { getCategoryPreferences } = require("../services/notificationPreferenceService");

const buildNotificationPayload = (notification) => ({
    id: notification.id,
    type: notification.type,
    program_id: notification.program_id,
    actor_member_id: notification.actor_member_id,
    title: notification.title,
    body: notification.body,
    created_at: notification.created_at
});

const getActiveProgramMemberIds = async (programId, transaction) => {
    const memberships = await ProgramMembership.findAll({
        where: { program_id: programId, status: "active" },
        attributes: ["member_id"],
        transaction
    });
    return memberships.map((membership) => membership.member_id);
};

/** Returns all member IDs that have at least one device in member_push_tokens (for broadcast). */
const getMemberIdsWithPushTokens = async () => {
    const rows = await MemberPushToken.findAll({
        attributes: ["member_id"],
        raw: true
    });
    return [...new Set(rows.map((r) => r.member_id))];
};

const createNotification = async ({
    type,
    programId = null,
    actorMemberId = null,
    title,
    body,
    recipientIds,
    transaction
}) => {
    const uniqueRecipients = Array.from(new Set((recipientIds || []).filter(Boolean)));
    if (uniqueRecipients.length === 0) {
        return null;
    }

    // D-N2 (c) — read inside the caller's transaction (same connection). sql/011 must exist before this code runs.
    const category = categoryFor(type);
    const enabled = await getCategoryPreferences(uniqueRecipients, category, transaction);
    const inboxRecipients = DROP_WHEN_OFF.has(category)
        ? uniqueRecipients.filter((memberId) => enabled.get(memberId))
        : uniqueRecipients;
    if (inboxRecipients.length === 0) {
        return null;
    }
    const pushRecipients = inboxRecipients.filter((memberId) => enabled.get(memberId));

    const notification = await Notification.create({
        type,
        program_id: programId,
        actor_member_id: actorMemberId,
        title,
        body
    }, { transaction });

    const recipientRows = inboxRecipients.map((memberId) => ({
        notification_id: notification.id,
        member_id: memberId,
        acknowledged_at: null
    }));

    await NotificationRecipient.bulkCreate(recipientRows, { transaction });

    const payload = buildNotificationPayload(notification);
    const dispatch = () => deliverToChannels({ payload, recipientIds: inboxRecipients, pushRecipientIds: pushRecipients });

    // When emitted inside a DB transaction, defer the alert until commit — no notification for a
    // rolled-back write. Otherwise dispatch immediately.
    if (transaction && typeof transaction.afterCommit === "function") {
        transaction.afterCommit(dispatch);
    } else {
        dispatch();
    }

    return notification;
};

module.exports = {
    buildNotificationPayload,
    getActiveProgramMemberIds,
    getMemberIdsWithPushTokens,
    createNotification
};
```

16. **`services/deviceService.js`**:
   - (a) Append to the header (after line 4): `// 0.6.0 (D-C26): records the installation's inbox capability (supports_inbox) — PUT /device passes true/false, the login ride-along passes nothing (= keep).`
   - (b) Replace lines 31-41 (the comment and `UPSERT_SQL`) with:
```js
// Atomic upsert keyed on the token (two concurrent registrations can't both INSERT). Re-binds the token to the caller
// (faithful), keeps a stored device_id when none is sent, stamps last_seen_at on EVERY call — old builds included.
// supports_inbox (0.6.0, D-C26): PUT /device always sends true/false (an old build → false, so a downgrade turns it off);
// the login ride-along sends NULL = keep the stored value.
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
```
   - (c) Replace lines 56-63 (the JSDoc, the signature and the `replacements` object) with:
```js
/** PUT /device + the login ride-along. `pushToken` arrives trimmed and non-empty (the callers validate it). */
async function registerDevice({ memberId, pushToken, deviceId, platform, supportsInbox }) {
    const replacements = {
        memberId,
        pushToken,
        platform: normalizePlatform(platform),
        deviceId: normalizeDeviceId(deviceId),
        supportsInbox: typeof supportsInbox === "boolean" ? supportsInbox : null
    };
```
   `authService.upsertPushToken` stays unchanged. It passes no `supportsInbox`, so the stored value is kept.

17. **`routes/notifications.js`**:
   - (a) After line 6 append:
```js
// 0.6.0 (D-C20, D-C23, D-C26): GET /unacknowledged + plain streams carry LEGACY_TYPES only (every live binary turns each
// item into a blocking pop-up); ?inbox=1 opts a stream into every type; PUT /device records the `inbox` capability and
// the caller's X-Time-Zone. Response shapes unchanged.
```
   - (b) After line 16 insert:
```js
const { LEGACY_TYPES } = require("../utils/notificationCategories");
const { parseTimeZone } = require("../utils/clientInfo");
const { rememberTimeZone } = require("../services/notificationPreferenceService");
```
   - (c) Replace lines 29-32 (the `include` array) with:
```js
            include: [{
                model: Notification,
                attributes: ["id", "type", "program_id", "actor_member_id", "title", "body", "created_at"],
                where: { type: Array.from(LEGACY_TYPES) } // D-C20 — new types reach Phase 4 clients via /inbox only
            }],
```
   - (d) Replace lines 62-67 (the `registerDevice` call) with:
```js
        // 0.6.0: a Phase 4 client sends its zone (D-C23) and `inbox: true` (D-C26); live binaries send neither.
        rememberTimeZone(req.user.id, parseTimeZone(req.get("x-time-zone")));
        await deviceService.registerDevice({
            memberId: req.user.id,
            pushToken: pushToken.trim(),
            deviceId: req.body.device_id,
            platform: req.body.platform,
            supportsInbox: req.body.inbox === true
        });
```
   - (e) Replace line 171 (`registerNotificationStream(memberId, res);`) with:
```js
    // D-C20: ?inbox=1 (a Phase 4 client) gets every type as an inbox item; every other stream only the legacy types.
    registerNotificationStream(memberId, res, { inbox: req.query.inbox === "1" });
```

18. **`services/programService.js`** (D-N13):
   - (a) Replace lines 6-8 (the `D-C1` bullet) with:
```js
//   • D-C3 (0.3.0, notifications D-N13) — the program.updated / program.deleted emit is LIVE (was the deferred D-C1
//     no-op): every active member EXCEPT the requester is notified; an emit failure is logged and never fails the
//     update / delete that already succeeded.
```
   - (b) Replace lines 13-23 (the requires and the stub) with:
```js
const { Program, ProgramMembership } = require("../models");
const { sequelize } = require("../config/database");
const { AppError } = require("../utils/response");
const { createNotification, getActiveProgramMemberIds } = require("../utils/notifications");
const { logError } = require("../utils/logError");

// D-C3: notify the program's active members, never the person who made the change. Runs after the write succeeded,
// outside any transaction — a failure is logged and swallowed so the response stays the write's.
async function emitProgramNotification({ type, programId, actorMemberId, title, body }) {
    try {
        const activeMemberIds = await getActiveProgramMemberIds(programId);
        const recipientIds = activeMemberIds.filter((memberId) => memberId !== actorMemberId);
        if (recipientIds.length === 0) return null;
        return await createNotification({ type, programId, actorMemberId, title, body, recipientIds });
    } catch (err) {
        logError(`[notifications] ${type} emit failed:`, err);
        return null;
    }
}
```
   - (c) Old line 175: change the comment to `        // D-C3: program.updated to the active members, except the requester.`
   - (d) Old line 209: change the comment to `    // D-C3: program.deleted to the active members, except the requester.`

19. **NEW `services/memberActivityStats.js`**:
```js
// The member's OWN workout activity for notification content — notifications SPEC §3.6 (0.6.0, D-C24). Workouts only,
// across all programs (workout_logs): auto-synced sleep / steps never count, so a day with only synced steps still gets
// its reminder. Streak = consecutive local days with ≥ 1 workout, ending today if today has one, else yesterday; 0
// otherwise. Deliberately NOT memberAnalyticsService.computeStreaks (per program, never resets after a skipped day) —
// this number can differ from the app's streak cards (notifications F14). Each function is ONE query for many members.
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const { addDaysToDate } = require("../utils/localTime");

const STREAK_LOOKBACK_DAYS = 366;

const DAYS_SQL = `
SELECT member_id, to_char(log_date, 'YYYY-MM-DD') AS day
FROM workout_logs
WHERE member_id IN (:memberIds) AND log_date BETWEEN :fromDate AND :toDate
GROUP BY member_id, log_date`;

// The same workout logged to several programs on one day (multi-program logging) counts once, at its longest duration.
const WEEK_SQL = `
SELECT d.member_id, count(*)::int AS workouts, count(DISTINCT d.log_date)::int AS active_days,
       COALESCE(sum(d.duration), 0)::int AS minutes
FROM (
    SELECT wl.member_id, wl.log_date, lower(pw.workout_name) AS workout, max(wl.duration) AS duration
    FROM workout_logs wl
    JOIN program_workouts pw ON pw.id = wl.program_workout_id
    WHERE wl.member_id IN (:memberIds) AND wl.log_date BETWEEN :fromDate AND :toDate
    GROUP BY wl.member_id, wl.log_date, lower(pw.workout_name)
) d
GROUP BY d.member_id`;

/** Consecutive workout days ending today (when logged) or yesterday. `days` = Set of "YYYY-MM-DD". */
const currentStreak = (days, today) => {
    let cursor = days.has(today) ? today : addDaysToDate(today, -1);
    let streak = 0;
    while (days.has(cursor)) {
        streak += 1;
        cursor = addDaysToDate(cursor, -1);
    }
    return streak;
};

/** entries [{ memberId, today }] → Map memberId → { loggedToday, streak }. */
async function getActivitySnapshots(entries) {
    const snapshots = new Map();
    if (entries.length === 0) return snapshots;
    const todays = entries.map((entry) => entry.today).sort();
    const rows = await sequelize.query(DAYS_SQL, {
        replacements: {
            memberIds: [...new Set(entries.map((entry) => entry.memberId))],
            fromDate: addDaysToDate(todays[0], -STREAK_LOOKBACK_DAYS),
            toDate: todays[todays.length - 1]
        },
        type: QueryTypes.SELECT
    });
    const daysByMember = new Map();
    for (const row of rows) {
        if (!daysByMember.has(row.member_id)) daysByMember.set(row.member_id, new Set());
        daysByMember.get(row.member_id).add(row.day);
    }
    for (const { memberId, today } of entries) {
        const days = daysByMember.get(memberId) || new Set();
        snapshots.set(memberId, { loggedToday: days.has(today), streak: currentStreak(days, today) });
    }
    return snapshots;
}

/** Map memberId → { workouts, activeDays, minutes } for fromDate..toDate inclusive; members with none → zeros. */
async function getWeekStats(memberIds, fromDate, toDate) {
    const stats = new Map(memberIds.map((id) => [id, { workouts: 0, activeDays: 0, minutes: 0 }]));
    if (memberIds.length === 0) return stats;
    const rows = await sequelize.query(WEEK_SQL, {
        replacements: { memberIds, fromDate, toDate },
        type: QueryTypes.SELECT
    });
    for (const row of rows) {
        stats.set(row.member_id, { workouts: row.workouts, activeDays: row.active_days, minutes: row.minutes });
    }
    return stats;
}

module.exports = { getActivitySnapshots, getWeekStats, currentStreak, STREAK_LOOKBACK_DAYS };
```

20. **NEW `services/dailyReminderJob.js`**:
```js
// Daily reminder (D-N7 / D-N8) — notifications SPEC §3.6 (0.6.0, D-C24). Each scheduler tick: members who opted in
// (reminders on, zone known, active, in an active program) whose local reminder time passed less than
// REMINDER_LATE_WINDOW_MINUTES ago are CLAIMED for that local day (never-send-twice key, before anything else); a claimed
// member who logged no workout that day gets ONE reminder — streak wording when the streak is ≥ 2. A member who already
// logged keeps the claim and gets nothing that day. Missing the whole window (deploy, sleeping staging) skips the day.
// Never Time Sensitive (no interruption-level is ever set — utils/push/apns.js).
const NotificationSendKey = require("../models/NotificationSendKey");
const { listOptedIn } = require("./notificationPreferenceService");
const { getActivitySnapshots } = require("./memberActivityStats");
const { getContentProvider } = require("../utils/notificationTemplates");
const { createNotification } = require("../utils/notifications");
const { localParts, toMinutes, addDaysToDate } = require("../utils/localTime");
const { logError } = require("../utils/logError");

const KIND = "reminder.daily";
const REMINDER_LATE_WINDOW_MINUTES = 120;

// The local day a reminder belongs to, or null outside the window (a window crossing midnight belongs to its first day).
const dueReminderDate = (timeZone, reminderTime, now) => {
    const local = localParts(timeZone, now);
    if (!local) return null;
    const start = toMinutes(reminderTime);
    const lateBy = (local.minutes - start + 1440) % 1440;
    if (lateBy >= REMINDER_LATE_WINDOW_MINUTES) return null;
    return local.minutes >= start ? local.date : addDaysToDate(local.date, -1);
};

async function runDailyReminders(now = new Date()) {
    const due = [];
    for (const row of await listOptedIn("reminders")) {
        const day = dueReminderDate(row.time_zone, row.reminder_time, now);
        if (day) due.push({ memberId: row.member_id, periodKey: day, firstName: row.first_name });
    }
    if (due.length === 0) return { claimed: 0, sent: 0 };
    const won = await NotificationSendKey.claim(KIND, due);
    const claimed = due.filter((entry) => won.has(`${entry.memberId}|${entry.periodKey}`));
    if (claimed.length === 0) return { claimed: 0, sent: 0 };

    const snapshots = await getActivitySnapshots(claimed.map((entry) => ({ memberId: entry.memberId, today: entry.periodKey })));
    const provider = getContentProvider();
    let sent = 0;
    for (const entry of claimed) {
        const snapshot = snapshots.get(entry.memberId);
        if (!snapshot || snapshot.loggedToday) continue;
        try {
            const content = await provider.render(
                KIND,
                { first_name: entry.firstName, streak: snapshot.streak },
                `${entry.memberId}|${entry.periodKey}`
            );
            const notification = await createNotification({
                type: KIND,
                title: content.title,
                body: content.body,
                recipientIds: [entry.memberId]
            });
            if (notification) sent += 1;
        } catch (err) {
            logError("[scheduler] daily reminder send failed:", err);
        }
    }
    return { claimed: claimed.length, sent };
}

module.exports = { runDailyReminders, dueReminderDate, REMINDER_LATE_WINDOW_MINUTES };
```

21. **NEW `services/weeklyDigestJob.js`**:
```js
// Weekly digest (N8) — notifications SPEC §3.6 (0.6.0, D-C24). Opt-in. Monday 09:00 local (≤ 120 min late, else that week
// is skipped), claimed per ISO week with the never-send-twice key, built from the member's own previous Monday–Sunday:
// workouts, active days, minutes, current streak (services/memberActivityStats.js), worded by the templates.
const NotificationSendKey = require("../models/NotificationSendKey");
const { listOptedIn } = require("./notificationPreferenceService");
const { getActivitySnapshots, getWeekStats } = require("./memberActivityStats");
const { getContentProvider } = require("../utils/notificationTemplates");
const { createNotification } = require("../utils/notifications");
const { localParts, addDaysToDate, isoWeekKey } = require("../utils/localTime");
const { logError } = require("../utils/logError");

const KIND = "digest.weekly";
const DIGEST_WEEKDAY = 1; // Monday
const DIGEST_START_MINUTES = 9 * 60; // 09:00 local
const DIGEST_LATE_WINDOW_MINUTES = 120;

const dueDigestMonday = (timeZone, now) => {
    const local = localParts(timeZone, now);
    if (!local || local.weekday !== DIGEST_WEEKDAY) return null;
    const lateBy = local.minutes - DIGEST_START_MINUTES;
    return lateBy >= 0 && lateBy < DIGEST_LATE_WINDOW_MINUTES ? local.date : null;
};

async function sendGroup(monday, entries, provider) {
    const memberIds = entries.map((entry) => entry.memberId);
    const [stats, snapshots] = await Promise.all([
        getWeekStats(memberIds, addDaysToDate(monday, -7), addDaysToDate(monday, -1)),
        getActivitySnapshots(entries.map((entry) => ({ memberId: entry.memberId, today: monday })))
    ]);
    let sent = 0;
    for (const entry of entries) {
        try {
            const week = stats.get(entry.memberId);
            const content = await provider.render(KIND, {
                first_name: entry.firstName,
                workouts: week.workouts,
                active_days: week.activeDays,
                minutes: week.minutes,
                streak: snapshots.get(entry.memberId)?.streak ?? 0
            }, `${entry.memberId}|${entry.periodKey}`);
            const notification = await createNotification({
                type: KIND,
                title: content.title,
                body: content.body,
                recipientIds: [entry.memberId]
            });
            if (notification) sent += 1;
        } catch (err) {
            logError("[scheduler] weekly digest send failed:", err);
        }
    }
    return sent;
}

async function runWeeklyDigests(now = new Date()) {
    const due = [];
    for (const row of await listOptedIn("digest")) {
        const monday = dueDigestMonday(row.time_zone, now);
        if (monday) due.push({ memberId: row.member_id, periodKey: isoWeekKey(monday), monday, firstName: row.first_name });
    }
    if (due.length === 0) return { claimed: 0, sent: 0 };
    const won = await NotificationSendKey.claim(KIND, due);
    const claimed = due.filter((entry) => won.has(`${entry.memberId}|${entry.periodKey}`));
    // Grouped by Monday: only members on opposite sides of the date line can differ (almost always one group).
    const byMonday = new Map();
    for (const entry of claimed) {
        if (!byMonday.has(entry.monday)) byMonday.set(entry.monday, []);
        byMonday.get(entry.monday).push(entry);
    }
    const provider = getContentProvider();
    let sent = 0;
    for (const [monday, entries] of byMonday) sent += await sendGroup(monday, entries, provider);
    return { claimed: claimed.length, sent };
}

module.exports = { runWeeklyDigests, dueDigestMonday };
```

22. **NEW `services/announcementRequest.js`**:
```js
// Announcement request validation — notifications SPEC §3.8 (0.6.0, D-C25). Pure: the body + the sender's X-Time-Zone in,
// a normalized request out, or a 400 invalid_body naming the first problem.
const { AppError } = require("../utils/response");
const { findMergeFields, MERGE_FIELDS } = require("../utils/notificationTemplates");
const { localParts, isValidDate, addDaysToDate } = require("../utils/localTime");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TITLE_MAX = 100;
const BODY_MAX = 500;
const MEMBERS_MAX = 200;
const SCHEDULE_MAX_DAYS = 30;

const invalid = (message) => new AppError(400, message, { code: "invalid_body" });
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseText = (value, field, max) => {
    if (typeof value !== "string" || !value.trim()) throw invalid(`${field} is required.`);
    const text = value.trim();
    if (text.length > max) throw invalid(`${field} must be at most ${max} characters.`);
    return text;
};

function parseTarget(target) {
    if (!isObject(target)) throw invalid("target is required.");
    if (target.kind === "everyone") return { kind: "everyone", programId: null, memberIds: null };
    if (target.kind === "program") {
        if (typeof target.program_id !== "string" || !UUID_RE.test(target.program_id)) {
            throw invalid("target.program_id must be a program id.");
        }
        return { kind: "program", programId: target.program_id.toLowerCase(), memberIds: null };
    }
    if (target.kind === "members") {
        const ids = target.member_ids;
        if (!Array.isArray(ids) || ids.length === 0 || ids.length > MEMBERS_MAX
            || ids.some((id) => typeof id !== "string" || !UUID_RE.test(id))) {
            throw invalid(`target.member_ids must list 1-${MEMBERS_MAX} member ids.`);
        }
        return { kind: "members", programId: null, memberIds: [...new Set(ids.map((id) => id.toLowerCase()))] };
    }
    throw invalid('target.kind must be "program", "members" or "everyone".');
}

function parseDelivery(delivery, senderTimeZone) {
    if (delivery === undefined || (isObject(delivery) && delivery.mode === "now")) {
        return { mode: "now", sendDate: null, sendTime: null, fallbackTimeZone: senderTimeZone || null };
    }
    if (!isObject(delivery) || delivery.mode !== "local") throw invalid('delivery.mode must be "now" or "local".');
    if (!senderTimeZone) throw invalid("Sending at local time needs your time zone (X-Time-Zone header).");
    if (!isValidDate(delivery.date)) throw invalid("delivery.date must be YYYY-MM-DD.");
    if (typeof delivery.time !== "string" || !TIME_RE.test(delivery.time)) {
        throw invalid("delivery.time must be HH:MM (24-hour).");
    }
    const today = localParts(senderTimeZone).date;
    if (delivery.date < today || delivery.date > addDaysToDate(today, SCHEDULE_MAX_DAYS)) {
        throw invalid(`delivery.date must be between today and ${SCHEDULE_MAX_DAYS} days from now.`);
    }
    return { mode: "local", sendDate: delivery.date, sendTime: delivery.time, fallbackTimeZone: senderTimeZone };
}

/** { target, title, body, delivery } from a composer request body. */
function parseAnnouncementRequest(body, senderTimeZone) {
    if (!isObject(body)) throw invalid("Request body must be a JSON object.");
    const target = parseTarget(body.target);
    const title = parseText(body.title, "title", TITLE_MAX);
    const text = parseText(body.body, "body", BODY_MAX);
    const fields = findMergeFields(`${title} ${text}`);
    const unknown = fields.find((field) => !MERGE_FIELDS.includes(field));
    if (unknown) throw invalid(`Unknown merge field {${unknown}}. Use {first_name}, {streak} or {program_name}.`);
    if (fields.includes("program_name") && target.kind !== "program") {
        throw invalid("{program_name} needs a program target.");
    }
    return { target, title, body: text, delivery: parseDelivery(body.delivery, senderTimeZone) };
}

module.exports = { parseAnnouncementRequest, invalid, UUID_RE };
```

23. **NEW `services/announcementDelivery.js`**:
```js
// Announcement delivery — notifications SPEC §3.8 (0.6.0, D-C25). Runs right after a "now" announcement is created
// (startDelivery) and on every scheduler tick (processDueAnnouncements) for each announcement still scheduled / sending.
// A recipient is due when the mode is now, or when their local date + time (their zone, else the announcement's
// fallback = the sender's zone) has reached send_date + send_time. Each due recipient is CLAIMED with the never-send-twice
// key (kind "announcement", period = the announcement id) before the send, so the kick-off, a tick and a second instance
// can overlap safely. Status → "sent" once no active recipient is left unclaimed.
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const NotificationAnnouncement = require("../models/NotificationAnnouncement");
const NotificationSendKey = require("../models/NotificationSendKey");
const { getTimeZones } = require("./notificationPreferenceService");
const { getActivitySnapshots } = require("./memberActivityStats");
const { findMergeFields, renderMergeFields } = require("../utils/notificationTemplates");
const { createNotification } = require("../utils/notifications");
const { localParts, toMinutes } = require("../utils/localTime");
const { logError } = require("../utils/logError");

const KIND = "announcement";
// D-C25: announcements reuse the legacy type app.broadcast (category announcements), so every live binary — no inbox —
// still shows them (its usual pop-up) instead of only a push banner most members can't receive.
const ANNOUNCEMENT_TYPE = "app.broadcast";

const OPEN_SQL = `
SELECT id, mode, to_char(send_date, 'YYYY-MM-DD') AS send_date, to_char(send_time, 'HH24:MI') AS send_time,
       fallback_time_zone, recipient_ids::text[] AS recipient_ids, title_template, body_template,
       target_program_id, sender_member_id
FROM notification_announcements
WHERE status IN ('scheduled', 'sending') AND (CAST(:id AS uuid) IS NULL OR id = CAST(:id AS uuid))
ORDER BY created_at ASC`;

const select = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
const loadOpen = (id = null) => select(OPEN_SQL, { id });
const loadActiveMembers = (memberIds) => (memberIds.length === 0
    ? Promise.resolve([])
    : select("SELECT id, first_name FROM members WHERE id IN (:memberIds) AND status = 'active'", { memberIds }));
const programNameOf = async (programId) =>
    (programId ? (await select("SELECT name FROM programs WHERE id = :programId", { programId }))[0]?.name || null : null);

const isDue = (announcement, timeZone, now) => {
    if (announcement.mode === "now") return true;
    const local = localParts(timeZone, now);
    if (!local) return true; // an unusable zone: deliver rather than never
    if (local.date !== announcement.send_date) return local.date > announcement.send_date;
    return local.minutes >= toMinutes(announcement.send_time);
};

/** [{ memberId, firstName, title, body }] for the ACTIVE members among memberIds — merge fields filled per person. */
async function renderForRecipients(spec, memberIds, now = new Date()) {
    const members = await loadActiveMembers(memberIds);
    let snapshots = new Map();
    if (members.length > 0 && findMergeFields(`${spec.titleTemplate} ${spec.bodyTemplate}`).includes("streak")) {
        const zones = await getTimeZones(members.map((m) => m.id));
        snapshots = await getActivitySnapshots(members.map((m) => ({
            memberId: m.id,
            today: (localParts(zones.get(m.id) || spec.fallbackTimeZone, now) || localParts("UTC", now)).date
        })));
    }
    return members.map((m) => {
        const vars = {
            first_name: m.first_name,
            streak: snapshots.get(m.id)?.streak ?? 0,
            program_name: spec.programName || "your program"
        };
        return {
            memberId: m.id,
            firstName: m.first_name,
            title: renderMergeFields(spec.titleTemplate, vars),
            body: renderMergeFields(spec.bodyTemplate, vars)
        };
    });
}

async function sendTo(announcement, memberIds, now) {
    const spec = {
        titleTemplate: announcement.title_template,
        bodyTemplate: announcement.body_template,
        programName: await programNameOf(announcement.target_program_id),
        fallbackTimeZone: announcement.fallback_time_zone
    };
    const base = {
        type: ANNOUNCEMENT_TYPE,
        programId: announcement.target_program_id,
        actorMemberId: announcement.sender_member_id
    };
    if (findMergeFields(`${spec.titleTemplate} ${spec.bodyTemplate}`).length === 0) {
        // No merge fields: one shared notification for every due recipient.
        const notification = await createNotification({ ...base, title: spec.titleTemplate, body: spec.bodyTemplate, recipientIds: memberIds });
        return notification ? memberIds.length : 0;
    }
    let sent = 0;
    for (const item of await renderForRecipients(spec, memberIds, now)) {
        try {
            const notification = await createNotification({ ...base, title: item.title, body: item.body, recipientIds: [item.memberId] });
            if (notification) sent += 1;
        } catch (err) {
            logError("[announcements] send failed:", err);
        }
    }
    return sent;
}

async function processAnnouncement(announcement, now = new Date()) {
    const activeIds = (await loadActiveMembers(announcement.recipient_ids)).map((m) => m.id);
    const done = await NotificationSendKey.claimedMemberIds(KIND, announcement.id);
    const open = activeIds.filter((id) => !done.has(id));
    const zones = announcement.mode === "local" ? await getTimeZones(open) : new Map();
    const due = open.filter((id) => isDue(announcement, zones.get(id) || announcement.fallback_time_zone, now));
    const won = await NotificationSendKey.claim(KIND, due.map((memberId) => ({ memberId, periodKey: announcement.id })));
    const claimed = due.filter((id) => won.has(`${id}|${announcement.id}`));
    const sent = claimed.length > 0 ? await sendTo(announcement, claimed, now) : 0;
    const finished = claimed.length === open.length;
    if (claimed.length > 0 || finished) {
        await NotificationAnnouncement.update({
            status: finished ? "sent" : "sending",
            sent_count: sequelize.literal(`sent_count + ${Number(sent)}`),
            ...(finished ? { completed_at: new Date() } : {})
        }, { where: { id: announcement.id, status: ["scheduled", "sending"] } });
    }
    return { claimed: claimed.length, sent };
}

/** Scheduler job: every open announcement, oldest first. */
async function processDueAnnouncements(now = new Date()) {
    let claimed = 0;
    let sent = 0;
    for (const announcement of await loadOpen()) {
        try {
            const result = await processAnnouncement(announcement, now);
            claimed += result.claimed;
            sent += result.sent;
        } catch (err) {
            logError("[announcements] delivery failed:", err);
        }
    }
    return { claimed, sent };
}

/** Kick off a "now" announcement right after it is created (the next tick finishes anything this misses). */
function startDelivery(announcementId) {
    setImmediate(async () => {
        try {
            const [announcement] = await loadOpen(announcementId);
            if (announcement) await processAnnouncement(announcement);
        } catch (err) {
            logError("[announcements] delivery failed:", err);
        }
    });
}

module.exports = { processDueAnnouncements, startDelivery, renderForRecipients, ANNOUNCEMENT_TYPE };
```

24. **NEW `services/announcementService.js`**:
```js
// Send-anytime announcements (D-N16) — notifications SPEC §3.8 (0.6.0, D-C25). Global admins only (routes/announcements.js
// gates). Target = one program's active members / chosen members / everyone (every active member); the list is resolved
// ONCE, at compose time, and stored on the audit row (notification_announcements: sender, time, target, recipients,
// counts, status). Delivery: services/announcementDelivery.js (type app.broadcast — category announcements: always in
// the inbox, pushed only where the member's announcements switch is on).
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const NotificationAnnouncement = require("../models/NotificationAnnouncement");
const { AppError } = require("../utils/response");
const { parseAnnouncementRequest, invalid, UUID_RE } = require("./announcementRequest");
const { renderForRecipients, startDelivery } = require("./announcementDelivery");

const LIST_LIMIT = 50;
const OPEN_STATUSES = ["scheduled", "sending"];
const notFound = (message) => new AppError(404, message, { code: "not_found" });
const select = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

const LIST_SQL = `
SELECT a.id, a.created_at, a.sender_member_id, NULLIF(trim(concat_ws(' ', m.first_name, m.last_name)), '') AS sender_name,
       a.target_kind, a.target_program_id, p.name AS target_program_name, a.title_template, a.body_template, a.mode,
       to_char(a.send_date, 'YYYY-MM-DD') AS send_date, to_char(a.send_time, 'HH24:MI') AS send_time,
       a.status, a.recipient_count, a.sent_count, a.completed_at
FROM notification_announcements a
LEFT JOIN members m ON m.id = a.sender_member_id
LEFT JOIN programs p ON p.id = a.target_program_id
ORDER BY a.created_at DESC
LIMIT :limit`;

async function resolveRecipients(target) {
    if (target.kind === "everyone") {
        const rows = await select("SELECT id FROM members WHERE status = 'active'");
        return { memberIds: rows.map((row) => row.id), programName: null };
    }
    if (target.kind === "program") {
        const [program] = await select(
            "SELECT id, name FROM programs WHERE id = :programId AND is_deleted = false",
            { programId: target.programId }
        );
        if (!program) throw notFound("Program not found.");
        const rows = await select(`
SELECT pm.member_id FROM program_memberships pm JOIN members m ON m.id = pm.member_id
WHERE pm.program_id = :programId AND pm.status = 'active' AND m.status = 'active'`, { programId: program.id });
        return { memberIds: rows.map((row) => row.member_id), programName: program.name };
    }
    const rows = await select("SELECT id FROM members WHERE id IN (:memberIds) AND status = 'active'", { memberIds: target.memberIds });
    if (rows.length !== target.memberIds.length) throw invalid("Some target.member_ids are unknown or inactive.");
    return { memberIds: rows.map((row) => row.id), programName: null };
}

const toSummary = (row, { senderName = null, programName = null } = {}) => ({
    id: row.id,
    created_at: row.created_at,
    sender_member_id: row.sender_member_id,
    sender_name: senderName,
    target_kind: row.target_kind,
    target_program_id: row.target_program_id,
    target_program_name: programName,
    title: row.title_template,
    body: row.body_template,
    mode: row.mode,
    send_date: row.send_date || null,
    send_time: row.send_time ? String(row.send_time).slice(0, 5) : null,
    status: row.status,
    recipient_count: row.recipient_count,
    sent_count: row.sent_count,
    completed_at: row.completed_at || null
});

async function previewAnnouncement(body, sender, senderTimeZone) {
    const request = parseAnnouncementRequest(body, senderTimeZone);
    const { memberIds, programName } = await resolveRecipients(request.target);
    if (memberIds.length === 0) return { recipient_count: 0, sample: null };
    const asked = typeof body.sample_member_id === "string" ? body.sample_member_id.toLowerCase() : null;
    const sampleId = memberIds.includes(asked) ? asked : (memberIds.includes(sender.id) ? sender.id : memberIds[0]);
    const [sample] = await renderForRecipients({
        titleTemplate: request.title,
        bodyTemplate: request.body,
        programName,
        fallbackTimeZone: request.delivery.fallbackTimeZone
    }, [sampleId]);
    return {
        recipient_count: memberIds.length,
        sample: sample
            ? { member_id: sample.memberId, first_name: sample.firstName, title: sample.title, body: sample.body }
            : null
    };
}

async function createAnnouncement(body, sender, senderTimeZone) {
    const request = parseAnnouncementRequest(body, senderTimeZone);
    const { memberIds, programName } = await resolveRecipients(request.target);
    if (memberIds.length === 0) throw invalid("No active members match this target.");
    const row = await NotificationAnnouncement.create({
        sender_member_id: sender.id,
        target_kind: request.target.kind,
        target_program_id: request.target.programId,
        recipient_ids: memberIds,
        title_template: request.title,
        body_template: request.body,
        mode: request.delivery.mode,
        send_date: request.delivery.sendDate,
        send_time: request.delivery.sendTime,
        fallback_time_zone: request.delivery.fallbackTimeZone,
        status: request.delivery.mode === "now" ? "sending" : "scheduled",
        recipient_count: memberIds.length,
        sent_count: 0
    });
    if (request.delivery.mode === "now") startDelivery(row.id);
    return toSummary(row.get({ plain: true }), { senderName: sender.member_name || null, programName });
}

async function listAnnouncements() {
    const rows = await select(LIST_SQL, { limit: LIST_LIMIT });
    return {
        announcements: rows.map((row) =>
            toSummary(row, { senderName: row.sender_name, programName: row.target_program_name }))
    };
}

async function cancelAnnouncement(id) {
    if (typeof id !== "string" || !UUID_RE.test(id)) throw notFound("Announcement not found.");
    const [updated] = await NotificationAnnouncement.update(
        { status: "cancelled", completed_at: new Date() },
        { where: { id, status: OPEN_STATUSES } }
    );
    if (updated > 0) return { id, status: "cancelled" };
    const existing = await NotificationAnnouncement.findByPk(id, { attributes: ["status"], raw: true });
    if (!existing) throw notFound("Announcement not found.");
    throw new AppError(409, `This announcement is already ${existing.status}.`, { code: "invalid_state" });
}

module.exports = { previewAnnouncement, createAnnouncement, listAnnouncements, cancelAnnouncement };
```

25. **NEW `services/notificationScheduler.js`**:
```js
// The notification scheduler — notifications SPEC §3.6 (0.6.0, D-N9, D-C24). ONE in-process timer: every 15 min it runs
// the daily reminders, the weekly digests and the due announcements, in that order. Never-send-twice comes from the send
// key (models/NotificationSendKey.js), not from the timer — so a restart, a missed tick or the two instances of a
// Render deploy can never double-send. Timers are unref'd and stopped by server.js's shutdown(); a tick still running
// when the next fires is skipped (no overlap). One JSON log line per job that claimed or sent something.
const { runDailyReminders } = require("./dailyReminderJob");
const { runWeeklyDigests } = require("./weeklyDigestJob");
const { processDueAnnouncements } = require("./announcementDelivery");
const { logError } = require("../utils/logError");

const TICK_MS = 15 * 60 * 1000;
const FIRST_TICK_DELAY_MS = 60 * 1000;
const JOBS = [
    ["daily_reminder", runDailyReminders],
    ["weekly_digest", runWeeklyDigests],
    ["announcements", processDueAnnouncements]
];

let firstTimer = null;
let interval = null;
let running = false;

async function tick(now = new Date()) {
    if (running) return;
    running = true;
    try {
        for (const [job, run] of JOBS) {
            const startedAt = Date.now();
            try {
                const result = await run(now);
                if (result && (result.claimed > 0 || result.sent > 0)) {
                    console.log(JSON.stringify({ type: "scheduler", job, ...result, duration_ms: Date.now() - startedAt }));
                }
            } catch (err) {
                logError(`[scheduler] ${job} failed:`, err);
            }
        }
    } finally {
        running = false;
    }
}

function startNotificationScheduler() {
    if (interval) return;
    firstTimer = setTimeout(() => tick(), FIRST_TICK_DELAY_MS);
    firstTimer.unref();
    interval = setInterval(() => tick(), TICK_MS);
    interval.unref();
}

function stopNotificationScheduler() {
    clearTimeout(firstTimer);
    clearInterval(interval);
    firstTimer = null;
    interval = null;
}

module.exports = { startNotificationScheduler, stopNotificationScheduler, tick, TICK_MS };
```

26. **NEW `routes/notificationInbox.js`**:
```js
// /api/notifications/inbox — the notification inbox (D-N3 / D-N4 / D-N5) — notifications SPEC §3.5 (0.6.0, D-C22).
// Self-only: every route acts on the token's member. Read = the existing acknowledged flag (D-N5): an item read here
// leaves every live binary's /unacknowledged queue, and a live binary's acknowledge marks it read here. Each request also
// captures the caller's X-Time-Zone (D-C23, fire-and-forget). Errors are { error, code } (frontend-kit §4).
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { parseTimeZone } = require("../utils/clientInfo");
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");
const { rememberTimeZone } = require("../services/notificationPreferenceService");
const inboxService = require("../services/notificationInboxService");

const router = express.Router();

router.use(authenticateToken, (req, _res, next) => {
    rememberTimeZone(req.user.id, parseTimeZone(req.get("x-time-zone")));
    next();
});

const handle = (tag, fallback, run) => async (req, res) => {
    try {
        res.json(await run(req));
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
        logError(`[notifications] ${tag} failed:`, err);
        return res.status(500).json({ error: fallback, code: "server_error" });
    }
};

router.get("/", handle("inbox list", "Failed to load notifications.",
    (req) => inboxService.listInbox(req.user.id, req.query)));
router.get("/unread-count", handle("unread count", "Failed to load notifications.",
    (req) => inboxService.getUnreadCounts(req.user.id)));
router.post("/read", handle("mark read", "Failed to update notifications.",
    (req) => inboxService.markRead(req.user.id, req.body)));

module.exports = router;
```

27. **NEW `routes/notificationPreferences.js`**:
```js
// /api/notifications/preferences — per-member notification switches + reminder time (D-N10) — notifications SPEC §3.5
// (0.6.0, D-C21). Self-only. GET and PUT both store the caller's X-Time-Zone first (D-C23), so the response's time_zone
// is current. PUT is partial: only the fields sent change. Errors are { error, code } (frontend-kit §4).
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { parseTimeZone } = require("../utils/clientInfo");
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");
const preferenceService = require("../services/notificationPreferenceService");

const router = express.Router();

router.use(authenticateToken);

const handle = (tag, fallback, run) => async (req, res) => {
    try {
        res.json(await run(req));
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
        logError(`[notifications] ${tag} failed:`, err);
        return res.status(500).json({ error: fallback, code: "server_error" });
    }
};

router.get("/", handle("preferences read", "Failed to load notification settings.",
    (req) => preferenceService.getPreferences(req.user.id, parseTimeZone(req.get("x-time-zone")))));
router.put("/", handle("preferences save", "Failed to save notification settings.",
    (req) => preferenceService.updatePreferences(req.user.id, req.body, parseTimeZone(req.get("x-time-zone")))));

module.exports = router;
```

28. **NEW `routes/announcements.js`**:
```js
// /api/notifications/announcements — the send-anytime composer API (D-N16), GLOBAL ADMINS ONLY — notifications SPEC §3.8
// (0.6.0, D-C25). Preview renders for one sample recipient; send = now or at each recipient's local time; every send
// is an audit row. Rate limits per admin (process memory — observability F3): preview 30 / min, send 10 / hour.
// The sender's X-Time-Zone is captured (D-C23) and is the fallback zone of a local-time send.
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { rateLimit } = require("../utils/rateLimit");
const { parseTimeZone } = require("../utils/clientInfo");
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");
const { rememberTimeZone } = require("../services/notificationPreferenceService");
const announcementService = require("../services/announcementService");

const router = express.Router();

const limitPreview = rateLimit({ windowMs: 60 * 1000, max: 30, keyFn: (req) => req.user.id });
const limitSend = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, keyFn: (req) => req.user.id });

const requireGlobalAdmin = (req, res, next) => {
    if (req.user?.global_role === "global_admin") return next();
    return res.status(403).json({ error: "Only global admins can send announcements.", code: "forbidden" });
};

const senderZone = (req) => parseTimeZone(req.get("x-time-zone"));

router.use(authenticateToken, requireGlobalAdmin, (req, _res, next) => {
    rememberTimeZone(req.user.id, senderZone(req));
    next();
});

const handle = (tag, fallback, status, run) => async (req, res) => {
    try {
        res.status(status).json(await run(req));
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
        logError(`[announcements] ${tag} failed:`, err);
        return res.status(500).json({ error: fallback, code: "server_error" });
    }
};

router.get("/", handle("list", "Failed to load announcements.", 200,
    () => announcementService.listAnnouncements()));
router.post("/preview", limitPreview, handle("preview", "Failed to preview the announcement.", 200,
    (req) => announcementService.previewAnnouncement(req.body, req.user, senderZone(req))));
router.post("/", limitSend, handle("send", "Failed to send the announcement.", 201,
    (req) => announcementService.createAnnouncement(req.body, req.user, senderZone(req))));
router.post("/:id/cancel", handle("cancel", "Failed to cancel the announcement.", 200,
    (req) => announcementService.cancelAnnouncement(req.params.id)));

module.exports = router;
```

29. **`server.js`** (shared with People S1, which adds its own router mount in the same block):
   - (a) After line 30 (`const healthSyncRoutes = require("./routes/healthSync");`) insert:
```js
const notificationInboxRoutes = require("./routes/notificationInbox");
const notificationPreferenceRoutes = require("./routes/notificationPreferences");
const announcementRoutes = require("./routes/announcements");
const { startNotificationScheduler, stopNotificationScheduler } = require("./services/notificationScheduler");
```
   - (b) Replace line 107 (`app.use("/api/notifications", notificationRoutes);`) with:
```js
// notifications 0.6.0: inbox, preferences and the announcement composer live under /api/notifications; mounted ahead of
// the legacy router (no path overlaps — keeping them first keeps it that way).
app.use("/api/notifications/inbox", notificationInboxRoutes);
app.use("/api/notifications/preferences", notificationPreferenceRoutes);
app.use("/api/notifications/announcements", announcementRoutes);
app.use("/api/notifications", notificationRoutes);
```
   - (c) Replace line 139 (the `server = app.listen(...)` line) with:
```js
        server = app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running on port ${PORT}`);
            // notifications 0.6.0 (D-N9): the 15-minute reminder / digest / announcement timer — only once we serve.
            startNotificationScheduler();
        });
```
   - (d) In `shutdown()`, after `shuttingDown = true;` (line 159) insert:
```js
    stopNotificationScheduler(); // notifications 0.6.0: no new tick on a draining instance (the send key covers a cut one)
```

## Steps — web
None in this track. N3 builds against the API CONTRACT below.

## Steps — ios
None in this track. N4 builds against the API CONTRACT below.

## Steps — android
None in this track. N5 builds against the API CONTRACT below.

## Endgame

30. **Compile check (backend)**. Claude runs these:
```bash
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend
for f in server.js routes/*.js services/*.js utils/*.js utils/push/*.js models/*.js; do node --check "$f" || echo "SYNTAX FAIL: $f"; done
DATABASE_URL=postgres://check:check@127.0.0.1:5432/check node -e '
for (const n of ["notifications","notificationInbox","notificationPreferences","announcements"]) {
  const r = require("./routes/" + n);
  console.log(n, r.stack.filter((l) => l.route).map((l) => Object.keys(l.route.methods)[0].toUpperCase() + " " + l.route.path).join(", "));
}
const s = require("./services/notificationScheduler"); console.log("scheduler", typeof s.startNotificationScheduler, typeof s.stopNotificationScheduler);
const lt = require("./utils/localTime");
console.log(JSON.stringify(lt.localParts("Asia/Kolkata", new Date("2026-10-12T18:40:00Z"))), lt.isoWeekKey("2026-10-12"), lt.addDaysToDate("2026-03-01", -1), lt.dayLabel("2026-10-11", "2026-10-12"), lt.isValidDate("2026-02-30"));
console.log(require("./services/dailyReminderJob").dueReminderDate("UTC", "23:50", new Date("2026-10-13T00:20:00Z")), require("./services/dailyReminderJob").dueReminderDate("UTC", "19:00", new Date("2026-10-13T21:30:00Z")));
console.log(require("./services/weeklyDigestJob").dueDigestMonday("Africa/Nairobi", new Date("2026-10-12T06:15:00Z")));
const t = require("./utils/notificationTemplates");
console.log(JSON.stringify(t.renderTemplate("reminder.daily", { first_name: "Ava", streak: 5 }, "m|2026-10-12")));
console.log(JSON.stringify(t.renderTemplate("digest.weekly", { first_name: "Ava", workouts: 3, active_days: 2, minutes: 95, streak: 4 }, "m|2026-W42")));
console.log(t.findMergeFields("Hi {first_name}, {streak} {program_name} {first_name}").join(","));
const c = require("./utils/notificationCategories");
console.log(c.androidChannelFor("reminder.daily", false), c.androidChannelFor("reminder.daily", true), c.androidChannelFor("program.role_changed", true), c.replaceKeyFor("digest.weekly"), c.LEGACY_TYPES.has("program.updated"));
'
```
   Expected output, in order:
   - Route lists:
     - `notifications`: `GET /unacknowledged, PUT /device, DELETE /device, POST /device/unregister, POST /broadcast, POST /:id/acknowledge, GET /stream`
     - `notificationInbox`: `GET /, GET /unread-count, POST /read`
     - `notificationPreferences`: `GET /, PUT /`
     - `announcements`: `GET /, POST /preview, POST /, POST /:id/cancel`
   - `scheduler function function`
   - `{"date":"2026-10-13","minutes":10,"weekday":2} 2026-W42 2026-02-28 yesterday false`
   - `2026-10-12 null`
   - `2026-10-12`
   - A reminder whose words contain `5` (the streak variant).
   - A digest body starting with `3 workouts` or `Last week you logged 3 workouts` or ending `… (95 min)…`, then ` You're on a 4-day streak.`
   - `first_name,streak,program_name`
   - `rasi_default rasi_reminders rasi_invites digest false`

   There is no web, iOS or Android compile step: no client files change in this track.

31. **Migration + deploy order. The USER runs every SQL step.** This change is risky (a migration that sits inside every emit transaction), so staging goes first.
   - (a) Pre-flight, read-only, on public: `SELECT count(*) FROM notifications WHERE created_at < now() - interval '90 days';`. Expect about 400; this is what 011 will delete.
   - (b) Run 011 on **staging** (`SET search_path TO staging;`), then its VERIFY block.
   - (c) Push the backend to `staging` (`git push origin main:staging`, or the branch) and wake the service.
   - (d) Staging smoke with testbed `+stg` accounts:
     - `PUT /api/notifications/preferences {"categories":{"reminders":true},"reminder_time":"<now+5 min HH:MM>"}` with `X-Time-Zone`.
     - Within ≤ 20 min, `GET /api/notifications/inbox` shows a `reminder.daily` item. Members with a workout today get none.
     - An invite still pops up on an old-build device.
     - The composer can't be tested here (no global admin on staging).
   - (e) Run 011 on **public**, then VERIFY.
   - (f) Push to `main` (the Render auto-deploy).
   - (g) Prod smoke:
     - The Render log boots cleanly, with no `[scheduler] … failed` line after the first tick (about 60 s).
     - The user's account: `GET /inbox`, `GET /inbox/unread-count`.
     - Editing a test program shows a push banner on an old phone and **no** pop-up.
     - `POST /announcements` with `target {"kind":"members","member_ids":["<own id>"]}` produces an inbox item and a pop-up on old apps.

32. **git-version** (orchestrator, docs commit at landing). Three MINOR bumps:
   - **notifications 0.5.0 → 0.6.0** (owned interface: new routes, stream capability, device field, push keys, schema 011).
   - **programs 0.2.0 → 0.3.0** (D-C1 deferred emit is now live, with the D-N13 rule that the requester is excluded).
   - **observability 0.3.0 → 0.4.0** (owned header contract gains `X-Time-Zone`, additive).

   Dependents of notifications (programs, program-memberships, invites) are FYI with no re-version, because the `createNotification` signature is unchanged. Tags:
   - `feature/notifications@v0.6.0`
   - `feature/programs@v0.3.0`
   - `feature/observability@v0.4.0`

   Docs to update:
   - **`specs/features/notifications/SPEC.md`**:
     - Header to 0.6.0.
     - §1 and the §3 table: add the 9 new routes.
     - §3.2: the new push table (C5).
     - §3.3: legacy filter plus `?inbox=1`.
     - **New §3.4–§3.8 = API CONTRACT C2–C8 below.**
     - §5: the 3 tables, `supports_inbox` and retention.
     - §6 constants: tick 15 min; windows 120 min; digest Mon 09:00; reminder default 19:00; inbox 90 days, page 30/50; read ids ≤100; composer limits 30/min and 10/h; title 100 / body 500; schedule ≤30 days; members ≤200; streak lookback 366 days.
     - §9 D-rules:
       - **D-C19** categories plus the one map.
       - **D-C20** legacy-feed safety: LEGACY_TYPES, `?inbox=1`, `program.updated` excluded, `app.broadcast` kept.
       - **D-C21** preferences and the D-N2(c) filter in `createNotification`.
       - **D-C22** inbox, read = acknowledged, the badge rule.
       - **D-C23** `X-Time-Zone` capture points and the no-zone rules.
       - **D-C24** scheduler, send key, reminder, digest, activity stats.
       - **D-C25** announcements: type `app.broadcast`, snapshot recipients, audit, cancel, limits.
       - **D-C26** push per category: thread, channels, replace key, badge; all gated by `supports_inbox`, which satisfies D-N14 per device.
       - **D-C27** templates and the content-provider/channel seam.
       - **D-C28** 90-day retention plus the one-time delete.
     - §10:
       - **F14** template streak ≠ app streak cards.
       - **F15** claim-then-crash skips one send.
       - **F16** composer limits are in-memory per instance.
       - **F17** header comments in `utils/programMemberships.js:4-6` and `services/membershipService.js:9` still say "stub" (outside this track's files).
     - §11 changelog row.
   - **`specs/features/programs/SPEC.md`**: D-C1 marked "superseded at 0.3.0 by D-C3"; a new D-C3 row; changelog.
   - **`specs/features/observability/SPEC.md`**: §4.1 gains an `X-Time-Zone` row (format per step 2); a new D-C13; changelog.
   - **`specs/features/registry.json`** and **`REGISTRY.md`**:
     - Versions updated.
     - notifications `reference_impl.paths` += the 20 new files plus `sql/011_notifications_inbox_prefs_scheduler.sql`.
     - observability paths are unchanged (`utils/clientInfo.js` is already listed).
   - **`apps/backend/CONTEXT.md`**: a §Data bullet for the 3 new tables plus `supports_inbox` (sql/011), and a §Runtime bullet for the in-process 15-min scheduler.
   - **`apps/backend/sql/README.md`**: a 011 row (what it does, staging then public, the pre-flight count, "before the backend reaches the branch"). Step 5's count comment changes to "21 after 011".

## Risks the implementer must watch

- **Deploy order is load-bearing.**
  - `createNotification` reads `notification_preferences` inside every invite, role, leave and remove transaction.
  - The push facade selects `supports_inbox`.
  - If 011 is missing on a schema, those transactions fail.
  - Run 011 on a schema before the code reaches the branch that deploys there.
- **What a live-binary user sees for each new type.** "Live" here also means iOS 1.5.0 (58) and Android 1.1.0 (5).

  | Type | Feed / stream (pop-up) | Push |
  |---|---|---|
  | `activity.kudos_received` | none | banner (category channel only on inbox devices; else `rasi_default`) |
  | `reminder.daily` / `digest.weekly` | none; created only for members who opted in from a Phase 4 client or web | banner on all their devices; replaces the previous one |
  | `app.broadcast` (composer) | **pop-up** (as today's `/broadcast`) | banner if Announcements is on |
  | `program.updated` | none | banner |
  | `program.deleted` (`deleteProgram`) | pop-up (same as the existing exit path) | banner |

  - In the foreground with the stream connected, iOS 1.5.0 (`willPresent` → `[.badge]`, no badge sent) and Android 1.1.0 (no tray post) show **nothing** for new types.
  - Tapping a banner acknowledges the item, which marks it read in the inbox.
  - With Program switched off, old apps still show legacy pop-ups through their feed. That is the old app's "inbox".
- **Quick-wins builds (iOS 59 / Android 6) get no badge and no new channels** until they send `inbox: true`. That is intended (D1). N4/N5 must send it. The client rule in C7 is to re-register once after an app update.
- **Shared files.**
  - `server.js` is shared with People S1: adjacent mount lines, so merge carefully.
  - People S1 must **not** edit `utils/notifications.js`. It calls `createNotification` and `getContentProvider()` (C8).
  - `models/index.js` is untouched by this track.
  - Nothing is shared with privacy S0 or quick-wins.
- **Streak mismatch (F14).** Reminder and digest streaks are cross-program and reset on a skipped day, so they can differ from the app's per-program streak cards. This is known and out of scope.
- **At most once, not exactly once.**
  - A crash between claim and send skips that member for that day or week. This is preferred over a duplicate.
  - The shutdown cuts an in-flight tick the same way (F9 analogue).
- **The 011 one-time DELETE immediately removes notifications older than 90 days (about 400) from live users' feeds.** This is intended (D-N11) and clears old pop-up backlogs. Run the pre-flight count.
- **Web before N3 sees no new types**, because its stream and feed are legacy. `program.updated` and later kudos are invisible on web until N3 ships.
- **Composer.**
  - Global-admin only and untestable on staging.
  - "Everyone" includes the sender.
  - Recipients are snapshotted at compose time, so later joiners are excluded.
  - Scheduled sends can be cancelled until finished; a cancel doesn't stop a batch already in flight.
- **No new error `code` is decisive** (frontend-kit: the status decides). The new codes are `forbidden`, `not_found` and the existing `invalid_state`.

---

# API CONTRACT — notifications 0.6.0 (clients N3 web · N4 iOS · N5 Android; People S1 server)

Base `https://rasifiters-api.onrender.com/api` (staging `https://rasifiters-api-staging.onrender.com/api`). JSON is snake_case. Every route needs `Authorization: Bearer <access token>`:
- `401 {error[, code:"session_invalid"]}` means a bad or expired token.
- `503 {error, code:"auth_unavailable"}` plus `Retry-After` means the verifier is down.

The stream also accepts `?token=`.

### C1. Header
| Header | Value | Read by |
|---|---|---|
| `X-Time-Zone` | IANA zone. iOS `TimeZone.current.identifier`; Android `ZoneId.systemDefault().id`; web `Intl.DateTimeFormat().resolvedOptions().timeZone`. Send it on **every** request in the same header set as `X-App-*`. | `/notifications/inbox/*`, `/notifications/preferences`, `/notifications/announcements/*`, `PUT /notifications/device`. Stored only when changed. Invalid or missing is ignored, except the 400 for a local-time announcement. CORS needs no change. |

### C2. Categories and types
| Category key | Label (all 3 clients) | Default | OFF means |
|---|---|---|---|
| `program` | Program & invites | on | inbox only, no push |
| `activity` | Activity | on | never created |
| `reminders` | Reminders | **off** (opt-in) | never created |
| `digest` | Weekly digest | **off** (opt-in) | never created |
| `announcements` | Announcements | on | inbox only, no push |

| Type | Category | Target | Legacy (old apps show it) |
|---|---|---|---|
| `program.invite_received` | program | `invites` | yes |
| `program.member_joined` / `program.role_changed` / `program.admin_transferred` / `program.member_left` | program | `program` | yes |
| `program.member_removed` / `program.deleted` | program | `programs` | yes |
| `program.updated` | program | `program` | **no** |
| `activity.kudos_received` | activity | `inbox` | no |
| `reminder.daily` | reminders | `log_workout` | no |
| `digest.weekly` | digest | `inbox` | no |
| `app.broadcast` (announcements) | announcements | `inbox` | yes |

Targets:
- `invites`: the "+" sheet on its Inbox/Invites tab.
- `program`: open `program_id`.
- `programs`: the program picker.
- `log_workout`: the workout-log form.
- `inbox`: the inbox.

Unknown type → category `program`. Unknown target → `inbox`.

### C3. Inbox item (`GET /inbox` items and `?inbox=1` stream frames)
```json
{ "id": "uuid", "type": "program.role_changed", "category": "program", "target": "program",
  "program_id": "uuid|null", "actor_member_id": "uuid|null", "title": "Role updated",
  "body": "Your role in Morning Crew is now logger.", "created_at": "2026-10-13T17:02:11.482Z", "read_at": null }
```

### C4. Routes (all under `/api/notifications`)
| Method + path | Request | 200/201 response | Errors |
|---|---|---|---|
| `GET /inbox?limit=1..50&before=<next_cursor>` | limit defaults to 30. Newest first, last 90 days. | `{ "items": [C3…], "next_cursor": "2026-10-13T17:02:11.482913Z_<uuid>" \| null }`. The cursor is opaque. | 400 `invalid_body` |
| `GET /inbox/unread-count` | — | `{ "unread": 3, "pending_invites": 1, "badge": 3 }`. `badge` = unread excluding invite items + pending invites; it is both the "+" badge and the app-icon badge. | — |
| `POST /inbox/read` | `{ "ids": ["uuid", …] }` (1–100) **or** `{ "all": true }`. Idempotent. | `{ "updated": 1, "unread": 2, "pending_invites": 1, "badge": 2 }` | 400 `invalid_body` |
| `GET /preferences` | — | `{ "categories": { "program": true, "activity": true, "reminders": false, "digest": false, "announcements": true }, "reminder_time": "19:00", "time_zone": "Africa/Nairobi" \| null }` | — |
| `PUT /preferences` | Partial: `{ "categories": { "reminders": true }, "reminder_time": "07:30" }` (24-hour `HH:MM`; unknown category keys ignored). | The full preferences, same shape as GET. | 400 `invalid_body` (e.g. `Nothing to update.`) |
| `GET /announcements` | global admin | `{ "announcements": [Summary…] }`, newest 50 | 403 `forbidden` |
| `POST /announcements/preview` | Body as below, plus optional `sample_member_id` | `{ "recipient_count": 23, "sample": { "member_id", "first_name", "title", "body" } \| null }` | 400 `invalid_body` · 403 · 404 `not_found` (program) · 429 `rate_limited` (30/min) |
| `POST /announcements` | Body as below | **201** Summary | 400 · 403 · 404 · 429 (10/hour) |
| `POST /announcements/:id/cancel` | — | `{ "id", "status": "cancelled" }` | 403 · 404 `not_found` · 409 `invalid_state` |
| `GET /stream?inbox=1` | Bearer, or `?token=…&inbox=1` | `ready` / `ping` unchanged. Every `event: notification` `data` is a **C3 item**, for every type. | 401 / 503 as today |
| `PUT /device` | Today's body plus `"inbox": true` | unchanged | unchanged |

The announcement request body:
```json
{ "target": { "kind": "program", "program_id": "uuid" } | { "kind": "members", "member_ids": ["uuid"] } | { "kind": "everyone" },
  "title": "Week 3, {first_name}!",
  "body": "{program_name} is halfway. You're on a {streak}-day streak.",
  "delivery": { "mode": "now" } | { "mode": "local", "date": "2026-10-20", "time": "08:00" } }
```

Announcement rules:
- Merge fields are `{first_name}`, `{streak}` and `{program_name}`. `{program_name}` is allowed for program targets only.
- Title is at most 100 characters, body at most 500.
- Local mode needs `X-Time-Zone`, and the date must fall between today and +30 days in the sender's zone.

Announcement Summary:
```json
{ "id", "created_at", "sender_member_id", "sender_name", "target_kind", "target_program_id", "target_program_name",
  "title", "body", "mode", "send_date", "send_time", "status": "scheduled|sending|sent|cancelled",
  "recipient_count", "sent_count", "completed_at" }
```

Error body is always `{ "error": "<text>", "code": "<code>" }`. Codes:
- `invalid_body` (400): show the server text, as for the kit's invalidInput.
- `forbidden` (403)
- `not_found` (404)
- `invalid_state` (409)
- `rate_limited` (429, plus `Retry-After`)
- `server_error` (500)

**Unchanged legacy routes:** `GET /unacknowledged` (now **legacy types only**), `POST /:id/acknowledge`, `DELETE /device`, `POST /device/unregister`, `POST /broadcast`.

### C5. Push payload
| | APNs (iOS) | FCM (Android) |
|---|---|---|
| Alert | `aps.alert {title, body}`, `aps.sound "default"` | `notification {title, body}` |
| Custom keys (strings) | top-level `notification_id`, `type`, `category`, `target`, `program_id`? | `data` with the same keys |
| Stacking | `aps.thread-id` = category | channel: inbox devices get `rasi_activity` / `rasi_reminders` / `rasi_digest` / `rasi_announcements` for those categories. Program types stay on `rasi_invites` (invite, role, admin, removed) or `rasi_default`. Non-inbox devices get today's channels. |
| Replace | `apns-collapse-id` = `reminders` / `digest` | `android.notification.tag` = same |
| Badge | `aps.badge` = C4 `badge`, **only** on devices registered with `inbox: true` | none. Launcher dots are drawn by the OS (**the platform-idiom divergence**). |
| Lifetime / priority | unchanged (7 days; never Time Sensitive) | unchanged (7 days, high) |

Channels N5 creates, keeping `rasi_default` and `rasi_invites`:

| Channel id | Name | Importance |
|---|---|---|
| `rasi_activity` | Activity | DEFAULT |
| `rasi_reminders` | Reminders | DEFAULT |
| `rasi_digest` | Weekly digest | LOW |
| `rasi_announcements` | Announcements | DEFAULT |

### C6. Server effects clients can rely on
- Read is the acknowledged flag, so reading on one device clears it everywhere, including old apps.
- Reminders are sent at most once per local day: at or after `reminder_time` (≤ 120 min late), only if no workout was logged that local day, with streak wording at ≥ 2.
- The digest is sent Monday 09:00 local.
- A member without a known zone gets neither.
- Web has no push, so web-only members see reminders only in the inbox.

### C7. Client rules (N3 / N4 / N5 — keep everything sent today)
1. Send `X-Time-Zone` (C1).
2. Open the stream with `inbox=1`.
3. Stop using `/unacknowledged` and the blocking modal queue (D-N3).
4. `PUT /device` with `"inbox": true` (mobile). Re-register once on the first launch of a new build (memo keyed by build) so the capability lands at once.
5. On a stream item:
   - Refresh the unread count.
   - Show the toast ("<title> · View") only if `categories[item.category]` is on in the cached preferences.
   - For an invite item, also refresh `GET /program-memberships/my-invites`.
6. Push tap: `POST /inbox/read {"ids":[notification_id]}`, then route by `target`.
7. After accepting or declining an invite, mark that program's unread `program.invite_received` items read.
8. iOS sets the app-icon badge to `badge` on launch, on foreground and after every read. Android shows no count.

### C8. Server-internal contract for People S1 (kudos)
```js
const { createNotification } = require("../utils/notifications");
const { getContentProvider } = require("../utils/notificationTemplates");
const { getTimeZones } = require("../services/notificationPreferenceService");
const { localParts, dayLabel } = require("../utils/localTime");
// receiverToday = localParts(zones.get(receiverId) || "UTC").date ; kudosDate = the "YYYY-MM-DD" day kudosed
const content = await getContentProvider().render("activity.kudos_received",
    { first_name: receiver.first_name, actor_first_name: giver.first_name, day_label: dayLabel(kudosDate, receiverToday) },
    `${receiverId}|${giverId}|${kudosDate}`);
await createNotification({ type: "activity.kudos_received", programId, actorMemberId: giverId,
    title: content.title, body: content.body, recipientIds: [receiverId] });
```
- Activity switched OFF means `createNotification` returns `null` and nothing is created.
- People adds **no** preference columns.
- Undoing a kudos does not retract the notification, unless People deletes it itself.
