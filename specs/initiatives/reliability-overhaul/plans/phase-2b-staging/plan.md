# Phase 2 track B — plan

# PLAN: Reliability overhaul Phase 2, track B (staging): staging schema and role, free Render service, Vercel branch alias, client env switches, login-change guard, seeding (revision 2)

**Brief accepted**: yes, 24 files, all from the brief's list.
- The new `RaSi-Fiters-App-Staging.xcscheme` is the sibling scheme the brief allows (open question 8).
- `members/SPEC.md` and `program-memberships/SPEC.md` are the brief's conditional entries. Their admin calls now go through the choke point, so each gets a one-line pointer to D-C12.
- Not touched: `memberService.js`, `membershipService.js` (the choke point covers them), the existing `RaSi-Fiters-App.xcscheme`, `config/database.js`, `render.yaml`.

**Feature/version prediction**: auth v0.10.0 → v0.11.0. This is a MINOR bump: the new D-C12 behaviour runs only when `APP_ENV=staging`, and auth gains two `reference_impl` paths. If track A bumps auth first, B becomes v0.12.0.

**Surfaces in scope**: [backend, ios, android, web (docs + console only), shared tools/docs]. The file sets don't overlap. The shared-docs set must be serialized with tracks A, C and D.

## Changes from revision 1 (one line per verdict item)
1. **Blocking item (seeded emails that bounce)**:
   - The staging-email shape is now `name+stg@…` or `name+stg-<tag>@…`.
   - The seeder registers `<inbox>+stg-<username>@<domain>` from a real inbox the user supplies in `TESTBED_STAGING_MAILBOX`.
   - `mayEmailFromHere` also refuses `@rasifiters.com`, which has no MX record.
   - Every "no mail is ever sent" claim is removed.
2. The seeder runs wake and register only when the base is exactly the staging URL (a positive match).
3. The boot check is now two-way:
   - On staging, the server refuses to boot unless the schema is `staging`.
   - Off staging, it refuses only if the schema is `staging`.
   - Prod can never be falsely blocked, and there is no prod-role assumption.
4. Every edit is anchored on text. Line numbers are hints only. The hook, gradle and ENV_RUNBOOK anchors are corrected.
5. The ENV_RUNBOOK `CORS_ALLOWED_ORIGINS` row and every other `CORS_ALLOWED_ORIGINS` mention are left to track A. B only inserts two new rows after that row.
6. `apps/backend/.env.example` and `.claude/skills/android-build/SKILL.md` are outside the fence. They are listed as orchestrator follow-ups with the exact text to apply.
7. The git-version mapping is stated explicitly (step 23). That includes the reference_impl propagation stop and `sql/008` added to auth's paths.
8. Drift checks now run on both sides of 008:
   - **P0** (before 008): extra tables, triggers and functions in `public`.
   - **C1-V5** (right after 008, before any staging use): a definition-level diff of columns, constraints, indexes and triggers.
9. The README says "007 and every migration from 009 on".
10. The members and program-memberships SPECs each get a no-bump pointer to D-C12, in a separate docs commit.
11. `wake()` requires the body text `Rasi Fiters API is running!`.

## Decisions resolved (the user confirms these by approving the plan)
- **Q1:** B = `008_staging_schema.sql`; track A = 007.
- **Q2:** 008 does not contain A's tables. A's 007 must be schema-neutral. Right after 008, the user runs 007 again with `SET search_path TO staging;`.
- **Q3:** a hand-written baseline (001 + 003 + 005 + 006), checked by P0 and C1-V5.
- **Q4:** 008 copies the `workouts_library` reference catalog (workout names only, no member data). This goes past the board's "schema only" wording. It is recorded in D-C12, and the user's approval of this plan covers it.
- **Q5:** the Render staging service and the Vercel alias both build from git branch `staging`. "Deploy on demand" means pushing to `staging`.
- **Q6:**
  - The env flag is `APP_ENV=staging`.
  - A staging account is an email matching `^[^\s@+]+\+stg(-[^\s@+]+)?@…`.
  - The testbed uses `<inbox-local>+stg-<username>@<inbox-domain>` (`TESTBED_STAGING_MAILBOX`). Reset tests land in the user's real inbox.
- **Q7:**
  - The choke point is `config/supabase.js`, which wraps admin `createUser`, `updateUserById` and `deleteUser` on staging only.
  - A refused create or update returns 403. A refused delete is skipped, because all 6 `deleteUser` call sites are best-effort `try/catch`.
  - There are explicit checks for link, unlink, forgot-password, and logout scope.
- **Q8:** a sibling shared scheme `RaSi-Fiters-App-Staging` whose Run uses Debug. The main scheme stays Run = Release (prod).
- **Q9:** Vercel Authentication stays on for previews.
- **Q10:** the render MCP creates the service; `render.yaml` is not touched.
- **Q11:** accepted. Signing in on staging is allowed; every login-level change for a non-`+stg` account is refused or skipped. For link tests on staging, use a dedicated test Google account.

## Steps: backend
Files in this set:
- `apps/backend/sql/008_staging_schema.sql`
- `apps/backend/utils/stagingGuard.js`
- `apps/backend/config/supabase.js`
- `apps/backend/services/authService.js`
- `apps/backend/server.js`
- `apps/backend/sql/README.md`
- `apps/backend/CONTEXT.md`

1. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/008_staging_schema.sql`:
```sql
-- 008_staging_schema.sql — STAGING schema + dedicated login role (reliability-overhaul Phase 2, track B).
--
-- Design: specs/initiatives/reliability-overhaul/DESIGN_BOARD.md §8 (approved 2026-10-11) · auth SPEC D-C12.
--
-- WHAT
--   1. Schema `staging` with the SAME table names as `public` (R5 — no prefixes), created ONCE at today's shape:
--      001 + 003 + 005 + 006 merged. Checked against prod read-only before (P0) and after (C1-V5) the run.
--   2. Login role `rasifiters_staging` (search_path = staging, extensions). The staging API (Render
--      `rasifiters-api-staging`) connects as it, so its unqualified SQL lands in `staging`. It gets NO privilege on
--      any `public` table — it cannot read or write prod data.
--   3. DML grants on `staging` + default privileges, so tables that later migrations add to `staging` are covered.
--   4. A copy of the `workouts_library` REFERENCE catalog (workout names only — no member data) so the workout
--      pickers and the HealthKit type map behave on staging as on prod. Nothing else is copied (auth D-C12).
--
-- NOT HERE (the repo is public — DESIGN_BOARD §0.6): the role's password. After running this file, run ONCE by
-- hand in the SQL editor:   ALTER ROLE rasifiters_staging WITH PASSWORD '<output of: openssl rand -hex 24>';
--
-- FK note: staging.members.auth_user_id → auth.users(id) — ONE Supabase Auth shared by prod + staging. Postgres
-- runs RI checks as the owner of the referenced/referencing table, so the staging role needs no grant on `auth`.
--
-- IDEMPOTENT: CREATE … IF NOT EXISTS, a guarded CREATE ROLE, re-runnable GRANTs, ON CONFLICT DO NOTHING.
-- 007 and every migration from 009 on are schema-neutral and run once per schema (sql/README.md §Staging schema).
--
-- WHO RUNS IT: the USER (Supabase SQL editor as `postgres`, or psql) — never Claude (CLAUDE.md DB-write policy).

-- ---------------------------------------------------------------------------
-- 1. Schema + role
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS staging;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rasifiters_staging') THEN
        CREATE ROLE rasifiters_staging LOGIN NOINHERIT;
    END IF;
END
$$;

ALTER ROLE rasifiters_staging SET search_path = staging, extensions;
GRANT CONNECT ON DATABASE postgres TO rasifiters_staging;

-- ---------------------------------------------------------------------------
-- 2. Base tables (= public today)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staging.members (
    id            uuid NOT NULL,
    username      character varying(255) NOT NULL,
    first_name    character varying(255) NOT NULL,
    last_name     character varying(255) NOT NULL,
    gender        character varying(32),
    global_role   text DEFAULT 'standard'::text NOT NULL,
    status        text DEFAULT 'active'::text NOT NULL,
    created_at    timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at    timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    auth_user_id  uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT members_pkey PRIMARY KEY (id),
    CONSTRAINT members_username_key UNIQUE (username),
    CONSTRAINT members_global_role_check1 CHECK ((global_role = ANY (ARRAY['standard'::text, 'global_admin'::text]))),
    CONSTRAINT members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);

CREATE TABLE IF NOT EXISTS staging.workouts_library (
    id          uuid DEFAULT gen_random_uuid() NOT NULL,
    name        text NOT NULL,
    created_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT workouts_library_pkey PRIMARY KEY (id),
    CONSTRAINT workouts_library_name_key UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS staging.programs (
    id                     uuid DEFAULT gen_random_uuid() NOT NULL,
    name                   text NOT NULL,
    start_date             date,
    end_date               date,
    status                 text DEFAULT 'planned'::text NOT NULL,
    description            text,
    created_by             uuid NOT NULL,
    created_at             timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at             timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_deleted             boolean DEFAULT false NOT NULL,
    admin_only_data_entry  boolean DEFAULT false NOT NULL,
    CONSTRAINT programs_pkey1 PRIMARY KEY (id),
    CONSTRAINT programs_status_check1 CHECK ((status = ANY (ARRAY['planned'::text, 'active'::text, 'completed'::text]))),
    CONSTRAINT programs_created_by_fkey FOREIGN KEY (created_by) REFERENCES staging.members(id)
);

CREATE TABLE IF NOT EXISTS staging.program_memberships (
    program_id  uuid NOT NULL,
    member_id   uuid NOT NULL,
    role        text DEFAULT 'member'::text NOT NULL,
    status      text DEFAULT 'active'::text NOT NULL,
    joined_at   timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    left_at     timestamp with time zone,
    CONSTRAINT program_memberships_pkey1 PRIMARY KEY (program_id, member_id),
    CONSTRAINT program_memberships_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'logger'::text, 'member'::text]))),
    CONSTRAINT program_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'invited'::text, 'requested'::text, 'removed'::text]))),
    CONSTRAINT program_memberships_program_id_fkey1 FOREIGN KEY (program_id) REFERENCES staging.programs(id) ON DELETE CASCADE,
    CONSTRAINT program_memberships_member_id_fkey1 FOREIGN KEY (member_id) REFERENCES staging.members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staging.program_workouts (
    id                  uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id          uuid NOT NULL,
    library_workout_id  uuid,
    workout_name        text NOT NULL,
    created_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_hidden           boolean DEFAULT false NOT NULL,
    CONSTRAINT program_workouts_pkey PRIMARY KEY (id),
    CONSTRAINT program_workouts_program_id_workout_name_key UNIQUE (program_id, workout_name),
    CONSTRAINT program_workouts_program_id_fkey FOREIGN KEY (program_id) REFERENCES staging.programs(id) ON DELETE CASCADE,
    CONSTRAINT program_workouts_library_workout_id_fkey FOREIGN KEY (library_workout_id) REFERENCES staging.workouts_library(id)
);

CREATE TABLE IF NOT EXISTS staging.workout_logs (
    program_id          uuid NOT NULL,
    member_id           uuid NOT NULL,
    program_workout_id  uuid NOT NULL,
    log_date            date NOT NULL,
    duration            integer,
    created_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at          timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT workout_logs_pkey PRIMARY KEY (program_id, member_id, program_workout_id, log_date),
    CONSTRAINT workout_logs_program_id_member_id_fkey FOREIGN KEY (program_id, member_id) REFERENCES staging.program_memberships(program_id, member_id) ON DELETE CASCADE,
    CONSTRAINT workout_logs_program_workout_id_fkey FOREIGN KEY (program_workout_id) REFERENCES staging.program_workouts(id)
);

CREATE TABLE IF NOT EXISTS staging.daily_health_logs (
    program_id    uuid NOT NULL,
    member_id     uuid NOT NULL,
    log_date      date NOT NULL,
    sleep_hours   numeric(4,2),
    diet_quality  smallint,
    created_at    timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at    timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    steps         integer,
    CONSTRAINT daily_health_logs_pkey PRIMARY KEY (program_id, member_id, log_date),
    CONSTRAINT daily_health_logs_at_least_one_check CHECK (sleep_hours IS NOT NULL OR diet_quality IS NOT NULL OR steps IS NOT NULL),
    CONSTRAINT daily_health_logs_diet_quality_check CHECK (((diet_quality >= 0) AND (diet_quality <= 5))),
    CONSTRAINT daily_health_logs_sleep_hours_check CHECK (((sleep_hours >= (0)::numeric) AND (sleep_hours <= (24)::numeric))),
    CONSTRAINT daily_health_logs_steps_check CHECK (steps >= 0),
    CONSTRAINT daily_health_logs_member_id_fkey FOREIGN KEY (member_id) REFERENCES staging.members(id) ON DELETE CASCADE,
    CONSTRAINT daily_health_logs_program_id_fkey FOREIGN KEY (program_id) REFERENCES staging.programs(id) ON DELETE CASCADE,
    CONSTRAINT daily_health_logs_program_membership_fkey FOREIGN KEY (program_id, member_id) REFERENCES staging.program_memberships(program_id, member_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staging.member_emails (
    id           uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id    uuid NOT NULL,
    email        text NOT NULL,
    is_primary   boolean DEFAULT true NOT NULL,
    verified_at  timestamp with time zone,
    created_at   timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at   timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT member_emails_pkey PRIMARY KEY (id),
    CONSTRAINT member_emails_email_key UNIQUE (email),
    CONSTRAINT member_emails_member_id_fkey FOREIGN KEY (member_id) REFERENCES staging.members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staging.member_push_tokens (
    id            uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id     uuid NOT NULL,
    device_token  character varying(512) NOT NULL,
    platform      character varying(16) DEFAULT 'ios'::character varying NOT NULL,
    device_id     character varying(256),
    created_at    timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at    timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT member_push_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT member_push_tokens_device_token_key UNIQUE (device_token),
    CONSTRAINT member_push_tokens_member_id_fkey FOREIGN KEY (member_id) REFERENCES staging.members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staging.program_invites (
    id                uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id        uuid NOT NULL,
    invited_by        uuid NOT NULL,
    invited_username  text,
    invited_email     text,
    token_hash        text NOT NULL,
    status            text DEFAULT 'pending'::text NOT NULL,
    max_uses          integer DEFAULT 1 NOT NULL,
    uses_count        integer DEFAULT 0 NOT NULL,
    expires_at        timestamp with time zone,
    created_at        timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT program_invites_pkey PRIMARY KEY (id),
    CONSTRAINT program_invites_token_hash_key UNIQUE (token_hash),
    CONSTRAINT program_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'expired'::text, 'revoked'::text]))),
    CONSTRAINT program_invites_program_id_fkey FOREIGN KEY (program_id) REFERENCES staging.programs(id) ON DELETE CASCADE,
    CONSTRAINT program_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES staging.members(id)
);

CREATE TABLE IF NOT EXISTS staging.program_invite_blocks (
    id          uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id  uuid NOT NULL,
    member_id   uuid NOT NULL,
    created_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT program_invite_blocks_pkey PRIMARY KEY (id),
    CONSTRAINT program_invite_blocks_program_id_member_id_key UNIQUE (program_id, member_id),
    CONSTRAINT program_invite_blocks_program_id_fkey FOREIGN KEY (program_id) REFERENCES staging.programs(id) ON DELETE CASCADE,
    CONSTRAINT program_invite_blocks_member_id_fkey FOREIGN KEY (member_id) REFERENCES staging.members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staging.notifications (
    id               uuid DEFAULT gen_random_uuid() NOT NULL,
    type             text NOT NULL,
    program_id       uuid,
    actor_member_id  uuid,
    title            text NOT NULL,
    body             text NOT NULL,
    created_at       timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT notifications_program_id_fkey FOREIGN KEY (program_id) REFERENCES staging.programs(id) ON DELETE SET NULL,
    CONSTRAINT notifications_actor_member_id_fkey FOREIGN KEY (actor_member_id) REFERENCES staging.members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS staging.notification_recipients (
    notification_id  uuid NOT NULL,
    member_id        uuid NOT NULL,
    acknowledged_at  timestamp with time zone,
    CONSTRAINT notification_recipients_pkey PRIMARY KEY (notification_id, member_id),
    CONSTRAINT notification_recipients_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES staging.notifications(id) ON DELETE CASCADE,
    CONSTRAINT notification_recipients_member_id_fkey FOREIGN KEY (member_id) REFERENCES staging.members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staging.member_program_order (
    member_id   uuid NOT NULL,
    program_id  uuid NOT NULL,
    position    integer NOT NULL,
    updated_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT member_program_order_pkey PRIMARY KEY (member_id, program_id),
    CONSTRAINT member_program_order_member_id_fkey FOREIGN KEY (member_id) REFERENCES staging.members(id) ON DELETE CASCADE,
    CONSTRAINT member_program_order_program_id_fkey FOREIGN KEY (program_id) REFERENCES staging.programs(id) ON DELETE CASCADE
);

-- Secondary indexes (same as public)
CREATE INDEX IF NOT EXISTS idx_members_auth_user_id ON staging.members USING btree (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_member_emails_member_id ON staging.member_emails USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_member_push_tokens_member_id ON staging.member_push_tokens USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_member_push_tokens_platform ON staging.member_push_tokens USING btree (platform);
CREATE INDEX IF NOT EXISTS idx_program_memberships_member_id ON staging.program_memberships USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_program_memberships_program_id ON staging.program_memberships USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_program_workouts_library_workout_id ON staging.program_workouts USING btree (library_workout_id);
CREATE INDEX IF NOT EXISTS idx_program_workouts_program_id ON staging.program_workouts USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_log_date ON staging.workout_logs USING btree (log_date);
CREATE INDEX IF NOT EXISTS idx_workout_logs_member_id ON staging.workout_logs USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_program_id ON staging.workout_logs USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_program_workout_id ON staging.workout_logs USING btree (program_workout_id);
CREATE INDEX IF NOT EXISTS idx_daily_health_logs_log_date ON staging.daily_health_logs USING btree (log_date);
CREATE INDEX IF NOT EXISTS idx_daily_health_logs_member_id ON staging.daily_health_logs USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_daily_health_logs_program_id ON staging.daily_health_logs USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_program_invite_blocks_member_id ON staging.program_invite_blocks USING btree (member_id);
CREATE INDEX IF NOT EXISTS idx_program_invite_blocks_program_id ON staging.program_invite_blocks USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_program_invites_invited_by ON staging.program_invites USING btree (invited_by);
CREATE INDEX IF NOT EXISTS idx_program_invites_program_id ON staging.program_invites USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_notifications_actor_member_id ON staging.notifications USING btree (actor_member_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON staging.notifications USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_program_id ON staging.notifications USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_ack ON staging.notification_recipients USING btree (member_id, acknowledged_at);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_member_id ON staging.notification_recipients USING btree (member_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_program_invites_program_username_pending
    ON staging.program_invites USING btree (program_id, invited_username)
    WHERE ((invited_username IS NOT NULL) AND (status = 'pending'::text));

-- ---------------------------------------------------------------------------
-- 3. Grants — the staging role gets DML on staging only (nothing on public)
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA staging TO rasifiters_staging;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA staging TO rasifiters_staging;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA staging TO rasifiters_staging;
ALTER DEFAULT PRIVILEGES IN SCHEMA staging
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rasifiters_staging;
ALTER DEFAULT PRIVILEGES IN SCHEMA staging
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO rasifiters_staging;

-- ---------------------------------------------------------------------------
-- 4. Reference catalog copy (workout names only; ids preserved; re-runs add only new names)
-- ---------------------------------------------------------------------------
INSERT INTO staging.workouts_library (id, name, created_at, updated_at)
SELECT id, name, created_at, updated_at FROM public.workouts_library
ON CONFLICT DO NOTHING;
```

2. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/stagingGuard.js`:
```js
// Staging-only guards — reliability-overhaul Phase 2 track B (DESIGN_BOARD §8; auth SPEC D-C12).
//
// The staging API (Render `rasifiters-api-staging`, APP_ENV=staging) runs this same code against the `staging`
// Postgres schema but the SAME Supabase project, so `auth.users` is shared with prod. These helpers make sure a
// staging request can never create, change or delete a REAL login: only staging accounts — an email whose local
// part is `<name>+stg` or `<name>+stg-<tag>` — may be touched. With APP_ENV unset (prod) every helper is a no-op,
// except the boot check, which only refuses a prod process that is connected to the `staging` schema.
const { AppError } = require("./response");

const STAGING_EMAIL_RE = /^[^\s@+]+\+stg(-[^\s@+]+)?@[^\s@]+\.[^\s@]+$/i;
// Our own domain has no MX record: a reset mail there hard-bounces at Resend — the SMTP sender prod shares.
const UNDELIVERABLE_RE = /@rasifiters\.com$/i;
const REFUSAL =
    "Not allowed on staging: only +stg test accounts (name+stg@… or name+stg-tag@…) can be created or changed here.";

const isStaging = () => (process.env.APP_ENV || "").trim().toLowerCase() === "staging";

const isStagingEmail = (email) => STAGING_EMAIL_RE.test((email || "").trim());

// Throws 403 on staging unless `email` is a staging account. Never logs the email (PII).
function assertStagingAccount(email) {
    if (!isStaging() || isStagingEmail(email)) return;
    console.warn("[staging-guard] refused a login-level change for a non-+stg account");
    throw new AppError(403, REFUSAL);
}

// May this server send an auth email (password reset) to `email`? Always true off staging. On staging: only a
// staging account, and never our own MX-less domain (a bounce would hurt the sender prod relies on).
function mayEmailFromHere(email) {
    if (!isStaging()) return true;
    const ok = isStagingEmail(email) && !UNDELIVERABLE_RE.test((email || "").trim());
    if (!ok) console.warn("[staging-guard] skipped an auth email to a non-+stg or undeliverable address");
    return ok;
}

// Wrap the three admin calls that MUTATE auth.users, once at boot, on staging only. Callers keep their existing
// error handling: createUser / updateUserById run outside try/catch, so a refusal surfaces as the 403 above; every
// deleteUser call site is best-effort (try/catch), so a refused delete only skips the auth-user part while the
// staging rows are still removed.
function guardAdminAuth(admin) {
    if (!isStaging()) return;
    const original = {
        createUser: admin.createUser.bind(admin),
        updateUserById: admin.updateUserById.bind(admin),
        deleteUser: admin.deleteUser.bind(admin),
        getUserById: admin.getUserById.bind(admin)
    };
    const assertUserIsStaging = async (uid) => {
        const { data, error } = await original.getUserById(uid);
        assertStagingAccount(error ? null : data?.user?.email);
    };
    admin.createUser = async (attributes = {}) => {
        assertStagingAccount(attributes.email);
        return original.createUser(attributes);
    };
    admin.updateUserById = async (uid, attributes = {}) => {
        await assertUserIsStaging(uid);
        if (attributes.email !== undefined) assertStagingAccount(attributes.email);
        return original.updateUserById(uid, attributes);
    };
    admin.deleteUser = async (uid, shouldSoftDelete) => {
        await assertUserIsStaging(uid);
        return original.deleteUser(uid, shouldSoftDelete);
    };
    console.log("[staging] APP_ENV=staging — login-change guard active");
}

// Boot check, both directions: a staging API must be on the `staging` schema, and a non-staging (prod) API must
// NOT be — so a DATABASE_URL pasted into the wrong Render service fails the deploy (Render keeps the previous
// deploy live) instead of serving the wrong data. One SELECT at boot; no request-path effect.
async function assertDatabaseSchema() {
    const { sequelize } = require("../config/database");
    const [rows] = await sequelize.query("SELECT current_schema() AS schema");
    const schema = rows?.[0]?.schema;
    if (isStaging() && schema !== "staging") {
        throw new Error(`APP_ENV=staging but the database schema is "${schema}" — DATABASE_URL must log in as rasifiters_staging`);
    }
    if (!isStaging() && schema === "staging") {
        throw new Error('DATABASE_URL logs in as the staging role but APP_ENV is not "staging" — refusing to boot');
    }
    if (isStaging()) console.log("[staging] database schema = staging");
}

module.exports = {
    isStaging,
    isStagingEmail,
    assertStagingAccount,
    mayEmailFromHere,
    guardAdminAuth,
    assertDatabaseSchema
};
```

3. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/config/supabase.js`:
   - (a) Directly after the header line `//   • POST /auth/refresh uses no client: services/supabaseTokenRefresh.js calls the token endpoint directly.`, insert:
     ```js
     //   • On staging (APP_ENV=staging) supabaseAdmin's createUser / updateUserById / deleteUser are wrapped once by
     //     utils/stagingGuard.guardAdminAuth (SPEC D-C12) — only +stg accounts may be touched. A no-op in prod.
     ```
   - (b) Replace `const { createClient } = require("@supabase/supabase-js");` with:
     ```js
     const { createClient } = require("@supabase/supabase-js");
     const { guardAdminAuth } = require("../utils/stagingGuard");
     ```
   - (c) Directly after `const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, serverClientOptions);`, insert:
     ```js
     guardAdminAuth(supabaseAdmin.auth.admin); // staging only (D-C12); returns immediately in prod
     ```

4. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/authService.js`:
   - (a) Directly after the header line `//                    SPEC D-C1) then deletes the Supabase auth user.`, insert:
     ```js
     //   • staging      → utils/stagingGuard (APP_ENV=staging only): login-level changes only for +stg accounts,
     //                    no reset mail to other addresses, local-scope logout (SPEC D-C12). No-ops in prod.
     ```
   - (b) Directly after `const { AppError } = require("../utils/response");`, insert:
     ```js
     const { isStaging, assertStagingAccount, mayEmailFromHere } = require("../utils/stagingGuard");
     ```
   - (c) In `logout`, replace
     ```js
             if (!error && data?.session) {
                 await client.auth.signOut();
             }
     ```
     with
     ```js
             if (!error && data?.session) {
                 // Staging (SPEC D-C12): this device only — a global sign-out could end a real login's prod sessions
                 // (auth.users is shared). Prod keeps the default global scope (Phase 3 changes it).
                 await client.auth.signOut(isStaging() ? { scope: "local" } : undefined);
             }
     ```
   - (d) In `linkProvider`, replace the two-line block below. The first line on its own also appears in `setPassword`, so match it together with the comment line.
     ```js
         const { member } = await getAuthUser(memberId);

         // Bind an EPHEMERAL client to the caller's OWN session, then link the id_token identity onto that user.
     ```
     with
     ```js
         const { member, user } = await getAuthUser(memberId);
         assertStagingAccount(user.email); // staging only (SPEC D-C12) — never re-bind a real login's identities

         // Bind an EPHEMERAL client to the caller's OWN session, then link the id_token identity onto that user.
     ```
   - (e) In `unlinkProvider`, replace
     ```js
         const { member, user } = await getAuthUser(memberId);
         const identities = user.identities || [];
     ```
     with
     ```js
         const { member, user } = await getAuthUser(memberId);
         assertStagingAccount(user.email); // staging only (SPEC D-C12)
         const identities = user.identities || [];
     ```
   - (f) In `requestPasswordReset`, replace `    if (email && EMAIL_RE.test(email)) {` with:
     ```js
         // Staging (SPEC D-C12): reset mail only to +stg addresses, never @rasifiters.com; the response stays the same 200.
         if (email && EMAIL_RE.test(email) && mayEmailFromHere(email)) {
     ```

5. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/server.js` (**SHARED with A and C**). Anchor on text. Track C's commit lands first and inserts its own `require("./middleware/versionGate")` after the errorHandler line; B does not use that anchor.
   - (a) Directly after the line `require("./models/index");`, insert:
     ```js
     const { assertDatabaseSchema } = require("./utils/stagingGuard");
     ```
   - (b1) Immediately above the line `app.use(cors({`, insert:
     ```js
     // Staging (auth SPEC D-C12): CORS_EXTRA_ORIGINS (comma-separated — the Vercel staging branch alias) is appended
     // to the fixed list below. Unset (prod) → the list is exactly the hard-coded origins.
     const extraCorsOrigins = (process.env.CORS_EXTRA_ORIGINS || "")
         .split(",")
         .map((origin) => origin.trim())
         .filter(Boolean);

     ```
   - (b2) Inside that `cors({ … })` call, replace
     ```js
             "https://www.rasifiters.com"
         ],
     ```
     with
     ```js
             "https://www.rasifiters.com",
             ...extraCorsOrigins
         ],
     ```
     Leave every other key in the object as it is, including track A's `maxAge` if it is already there.
   - (c) In `startServer`, replace `        await connectDB();` with:
     ```js
             await connectDB();
             await assertDatabaseSchema(); // auth D-C12: staging must be on `staging`; prod must not be
     ```

6. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/README.md`:
   - (a) Directly after the table row that starts ``| `004_seed_healthkit_workout_types.sql` |``, add:
     ```md
     | `005_member_program_order.sql` | Creates `member_program_order` (per-member program-card order for the picker surfaces; `programs` 0.2.0). |
     | `006_add_steps_to_daily_health_logs.sql` | Adds `daily_health_logs.steps` (+ `CHECK steps >= 0`) and lets steps-only rows satisfy the at-least-one check (steps feature). |
     | `008_staging_schema.sql` | **Staging** (reliability-overhaul Phase 2 B, auth D-C12): schema `staging` + login role `rasifiters_staging` (`search_path = staging, extensions`, no access to `public`) + the base tables at today's shape (001+003+005+006) + grants/default privileges + a copy of the `workouts_library` reference catalog. Staging-only — never re-run against `public`. Run once; the role password is set by hand (§Staging schema). |
     ```
   - (b) Immediately before the line `## Data + auth migration (historical)`, insert:
     ````md
     ## Staging schema (reliability-overhaul Phase 2 B — DESIGN_BOARD §8, auth SPEC D-C12)

     One Supabase project holds both environments: `public` (prod) and `staging` (Render `rasifiters-api-staging`).
     Same table names (R5). **`auth.users` is shared.**

     1. **Once:** run `008_staging_schema.sql` (SQL editor → paste → Run). Then, if `007_*.sql` already ran on
        `public` before `staging` existed, run 007 once more with `SET search_path TO staging;` as its first line.
     2. **Once, by hand (never in a file — the repo is public):** generate a password locally with
        `openssl rand -hex 24` (hex needs no URL-encoding) and run in the SQL editor
        `ALTER ROLE rasifiters_staging WITH PASSWORD '<that value>';`
     3. **Staging `DATABASE_URL`** = your prod `DATABASE_URL` with the user and password replaced: on the pooler
        host (`*.pooler.supabase.com`) the user is `rasifiters_staging.kpadxjekpiwfkqcxtrio`; on the direct host
        (`db.kpadxjekpiwfkqcxtrio.supabase.co`) it is `rasifiters_staging`. Same host, port, database. You paste it
        into the Render staging service yourself.
     4. **007 and every migration from 009 on are schema-neutral** (no `public.` / `staging.` in them) and run
        **twice, staging first**:
        - SQL editor: first line `SET search_path TO staging;` + the file → Run; then again with
          `SET search_path TO public;`.
        - psql: `psql "$SUPABASE_DATABASE_URL" -c "SET search_path TO staging" -f apps/backend/sql/NNN.sql`, then the
          same with `public`.
        Tables a migration adds to `staging` get the staging role's grants automatically (008's default
        privileges); re-running 008 re-applies them anyway.
     5. **Verify (read-only):**
        ```sql
        SELECT count(*) AS staging_tables FROM pg_tables WHERE schemaname = 'staging';                  -- 14 (+ later tables)
        SELECT rolcanlogin, rolconfig FROM pg_roles WHERE rolname = 'rasifiters_staging';               -- t | {"search_path=staging, extensions"}
        SELECT has_table_privilege('rasifiters_staging', 'public.members', 'SELECT')  AS reads_prod,    -- f
               has_table_privilege('rasifiters_staging', 'staging.members', 'INSERT') AS writes_staging; -- t
        SELECT (SELECT count(*) FROM staging.workouts_library) AS staging_lib,
               (SELECT count(*) FROM public.workouts_library)  AS prod_lib;                             -- equal
        ```
     ````

7. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/CONTEXT.md`: immediately before the line `## Runtime + observability (as of 2026-10-10)`, insert:
```md
## Staging (reliability-overhaul Phase 2 B — DESIGN_BOARD §8, auth SPEC D-C12)
- **Service:** Render web service `rasifiters-api-staging` (**free**, region `virginia`, branch `staging`,
  auto-deploy on commit, `apps/backend`, `npm ci` / `npm start`) → `https://rasifiters-api-staging.onrender.com`.
  Created via the render MCP — not in `render.yaml`. Sleeps after 15 min idle: **wake it before a test session**
  (open `https://rasifiters-api-staging.onrender.com/`, wait for "Rasi Fiters API is running!", ~1 min cold).
- **Deploy on demand:** push the commit to test to the `staging` branch (`git push origin main:staging`, or
  `git push --force-with-lease origin <branch>:staging` for unmerged work). The Vercel staging alias
  (`https://rasifiters-git-staging-personal-vinayak.vercel.app`) builds from the same branch.
- **Data:** the `staging` Postgres schema (`sql/008`), reached by `DATABASE_URL` logging in as role
  `rasifiters_staging` (`search_path = staging, extensions`; no privilege on `public`). Backend JS never names a
  schema. Boot check (both services): staging refuses to start unless `current_schema()` = `staging`; prod refuses
  to start if it is `staging`.
- **Env (staging only):** `APP_ENV=staging` (turns on `utils/stagingGuard.js`), `CORS_EXTRA_ORIGINS`,
  `APNS_PRODUCTION=false`, `PASSWORD_RESET_REDIRECT_URL` → the staging alias; the rest equals prod
  (`ENV_RUNBOOK.md` §Staging). **Never set `APP_ENV` on prod.**
- **Shared auth:** one `auth.users` for both. Staging accounts use `name+stg@…` / `name+stg-tag@…` emails; the guard
  refuses (create / update → 403) or skips (delete) every login-level change for any other account, and sends reset
  mail only to `+stg` addresses outside `@rasifiters.com` (auth SPEC D-C12).
- **Seed:** `tools/testbed/seed.mjs` with `TESTBED_API_BASE=https://rasifiters-api-staging.onrender.com/api` and
  `TESTBED_STAGING_MAILBOX` (wakes the service, registers missing `+stg-<username>` accounts, seeds) —
  `tools/testbed/README.md` §Staging.
```

## Steps: web
Files in this set: `apps/web/CONTEXT.md` only. No app code changes: `src/lib/config.ts` already reads `NEXT_PUBLIC_API_ENV`, `NEXT_PUBLIC_API_BASE_URL_PROD` and `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

8. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/CONTEXT.md`: after the paragraph that starts `Env (Production, from \`src/lib/config.ts\`)` and ends `…so no edge secret is needed.`, insert a blank line and then:
```md
**Staging (reliability-overhaul Phase 2 B — auth SPEC D-C12):** git branch **`staging`** builds a Vercel Preview whose
fixed branch alias is the staging web address — `https://rasifiters-git-staging-personal-vinayak.vercel.app`.
No app code: three **Preview** env vars scoped to git branch `staging` feed the same `config.ts` —
`NEXT_PUBLIC_API_ENV=prod`, `NEXT_PUBLIC_API_BASE_URL_PROD=https://rasifiters-api-staging.onrender.com/api`,
`NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` (same value as Production). Other preview branches get none of these (→ the
`127.0.0.1` local default); Production env is unchanged. Vercel Authentication stays on for previews
(`ssoProtection: all_except_custom_domains`): sign in to Vercel once in each browser that opens the alias — do it
**before** clicking a staging password-reset link, or the login detour drops the link's `#access_token` fragment.
The alias is in the staging API's `CORS_EXTRA_ORIGINS`, the Google Web OAuth client's JavaScript origins, and
Supabase Auth's Redirect URLs (`…/reset-password`).
```

## Steps: ios
Files in this set:
- `apps/ios/RaSi-Fiters-App/Config/APIConfig.swift`
- `apps/ios/RaSi-Fiters-App.xcodeproj/xcshareddata/xcschemes/RaSi-Fiters-App-Staging.xcscheme` (NEW)
- `apps/ios/CONTEXT.md`

Do not touch `project.pbxproj` or `RaSi-Fiters-App.xcscheme`.

9. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Config/APIConfig.swift`:
   - (a) Directly after the line `static let renderBaseURL = URL(string: "https://rasifiters-api.onrender.com/api")!`, insert:
     ```swift

         // STAGING — the free Render service `rasifiters-api-staging` (the `staging` Postgres schema; shared Supabase
         // Auth). DEBUG builds (the "RaSi-Fiters-App-Staging" scheme's Run) talk to it; Release stays on renderBaseURL.
         // Wake it before a test session (it sleeps after 15 min idle) — reliability-overhaul board §8, auth D-C12.
         static let stagingBaseURL = URL(string: "https://rasifiters-api-staging.onrender.com/api")!
     ```
   - (b) Replace the whole block from `    // Active base URL; debug uses local endpoints, release uses Render.` through the `}` that closes `activeBaseURL` with:
     ```swift
         // Active base URL: DEBUG → staging, Release → Render prod. (simulatorBaseURL / deviceBaseURL stay for ad-hoc
         // local-backend runs — swap one in here temporarily.)
         static var activeBaseURL: URL {
             #if DEBUG
             return stagingBaseURL
             #else
             return renderBaseURL
             #endif
         }
     ```

10. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App.xcodeproj/xcshareddata/xcschemes/RaSi-Fiters-App-Staging.xcscheme`:
    - Make a byte-for-byte copy of the sibling `RaSi-Fiters-App.xcscheme` with `cp`.
    - In the copy, change only the `buildConfiguration` line inside `<LaunchAction` (line 34) from `buildConfiguration = "Release"` to `buildConfiguration = "Debug"`.
    - Check: `diff RaSi-Fiters-App.xcscheme RaSi-Fiters-App-Staging.xcscheme` must print exactly one changed line (34: `Release` → `Debug`).

11. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/CONTEXT.md`: immediately before the line `## Auth screens port (run 51, 2026-06-30)`, insert:
```md
## Staging (debug builds — reliability-overhaul Phase 2 B, auth D-C12)
- `Config/APIConfig.swift`: `#if DEBUG` → `stagingBaseURL` (`https://rasifiters-api-staging.onrender.com/api`);
  Release → `renderBaseURL` (prod). The loopback constants stay for ad-hoc local-backend runs.
- **Shared schemes:** `RaSi-Fiters-App` — Run = **Release** → **prod** (unchanged); `RaSi-Fiters-App-Staging` —
  Run = **Debug** → **staging**. Archive = Release (prod) in both. Pick the scheme in Xcode's scheme menu; the
  project file is unchanged (Debug/Release differ only by the `DEBUG` flag + `-Onone`).
- Wake the staging API first (open `https://rasifiters-api-staging.onrender.com/`, wait for the reply), then sign in
  with a `+stg` staging account (testbed: `ava.rivera` + the shared test password). Sign out before switching
  schemes — tokens are valid on both (one Supabase project) but map to different members.
- Push: Xcode builds hold sandbox APNs tokens; staging runs `APNS_PRODUCTION=false`, so staging pushes reach them.
```

## Steps: android
Files in this set: `apps/android/app/build.gradle.kts` and `apps/android/CONTEXT.md`.

12. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/build.gradle.kts`, inside `debug {` (currently lines 48-52). Replace
```kotlin
            // We ALWAYS develop/test against the main live backend (Render → live Supabase Auth/DB),
            // even in dev — so debug points at the same prod API as release, not a local loopback.
            // (Local-backend testing is the exception: temporarily swap to "http://10.0.2.2:5001/api",
            // the emulator's alias for the host Mac's localhost.)
            buildConfigField("String", "API_BASE_URL", "\"https://rasifiters-api.onrender.com/api\"")
```
with
```kotlin
            // Debug builds talk to STAGING (reliability-overhaul board §8 / auth D-C12): the free Render service
            // rasifiters-api-staging → the `staging` Postgres schema (shared Supabase Auth). Release stays on prod.
            // Wake it first (open https://rasifiters-api-staging.onrender.com/ and wait for the reply — it sleeps after
            // 15 min idle). Local-backend testing is the exception: temporarily swap to "http://10.0.2.2:5001/api",
            // the emulator's alias for the host Mac's localhost.
            buildConfigField("String", "API_BASE_URL", "\"https://rasifiters-api-staging.onrender.com/api\"")
```
The `release {` block is unchanged.

13. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/CONTEXT.md`: replace the bullet that starts ``- `local.properties` (gitignored) carries `sdk.dir`. Base URL`` and ends `…the emulator's alias for the host Mac's localhost).` with:
```md
- `local.properties` (gitignored) carries `sdk.dir`. Base URL (`BuildConfig.API_BASE_URL`): **debug → staging**
  `https://rasifiters-api-staging.onrender.com/api` (reliability-overhaul Phase 2 B, auth D-C12 — supersedes
  "debug tests against the live backend"); **release → prod** `https://rasifiters-api.onrender.com/api`. Wake the
  staging API before a session (open its `/`, wait ~1 min) and sign in with a `+stg` staging account. The debug
  build shares `com.app.rasifiters` with the Play build — uninstall the Play build first (signature mismatch).
  Local-backend testing is the exception: temporarily swap debug to `http://10.0.2.2:5001/api` (the emulator's
  alias for the host Mac's localhost).
```

## Steps: shared tools/docs
One implementer, run after the backend steps. Serialize with tracks A, C and D at git-version.

Files in this set:
- `tools/testbed/seed.mjs`
- `tools/testbed/README.md`
- `.claude/skills/deploy/SKILL.md`
- `ENV_RUNBOOK.md`
- `CONTEXT.md`
- `specs/features/auth/SPEC.md`
- `specs/features/members/SPEC.md`
- `specs/features/program-memberships/SPEC.md`
- `specs/features/registry.json` and `specs/features/REGISTRY.md` (at git-version)
- The hook, in C7.

14. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/tools/testbed/seed.mjs`:
   - (a) Replace the comment line `// apps/backend/CLAUDE.md DB-write policy.` with `// the repo-root CLAUDE.md DB-write policy.`
   - (b) Directly after `//   TESTBED_PASSWORD='...' node tools/testbed/seed.mjs --reset`, insert:
     ```js
     //
     // STAGING: TESTBED_API_BASE=https://rasifiters-api-staging.onrender.com/api TESTBED_PASSWORD='...' \
     //          TESTBED_STAGING_MAILBOX='you@gmail.com' node tools/testbed/seed.mjs --reset
     //   Only against that exact base: wakes the free instance, and registers a missing test account (401 on login)
     //   with the staging-only email you+stg-<username>@gmail.com (auth SPEC D-C12). Never against prod or a local API.
     ```
   - (c) Replace `const BASE = process.env.TESTBED_API_BASE || "https://rasifiters-api.onrender.com/api";` with:
     ```js
     const BASE = process.env.TESTBED_API_BASE || "https://rasifiters-api.onrender.com/api";
     // STAGING (auth SPEC D-C12) — matched POSITIVELY: wake + register run only against this exact base, never against
     // prod or a local backend (whose DATABASE_URL may be the live prod DB).
     const STAGING_BASE = "https://rasifiters-api-staging.onrender.com/api";
     const IS_STAGING = BASE.replace(/\/+$/, "") === STAGING_BASE;
     // A real inbox you own (no "+"), e.g. name@gmail.com. A missing staging account is registered as
     // name+stg-<username>@gmail.com — the staging-only email shape the staging API accepts, delivered to that inbox so
     // a staging password-reset test never bounces. Read only when an account has to be registered.
     const STAGING_MAILBOX = (process.env.TESTBED_STAGING_MAILBOX || "").trim().toLowerCase();
     ```
   - (d) Directly after the closing `}` of `async function login(username) { … }`, insert:
     ```js

     // Staging only: register a missing test account through the public register endpoint (the path the apps use).
     function namesFor(username) {
       const parts = username.split(/[._]/).filter(Boolean);
       const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
       return { first_name: cap(parts[0] || username), last_name: cap(parts.slice(1).join(" ") || "Tester") };
     }

     async function bootstrap(username) {
       if (!/^[^\s@+]+@[^\s@]+\.[^\s@]+$/.test(STAGING_MAILBOX)) {
         log(`  ✗ ${username} — missing on staging; set TESTBED_STAGING_MAILBOX (a real inbox you own, no "+") to register it`);
         return false;
       }
       const [local, domain] = STAGING_MAILBOX.split("@");
       const { first_name, last_name } = namesFor(username);
       const r = await api("POST", "/auth/register", null, {
         username, password: PASSWORD, first_name, last_name, email: `${local}+stg-${username}@${domain}`,
       });
       log(r.ok ? `  ＋ ${username} registered on staging (+stg-${username} address)`
                : `  ✗ ${username} — REGISTER FAILED (${r.status} ${r.data?.error || ""})`);
       return r.ok;
     }

     // Free Render instances sleep after 15 min idle and take ~1 min to wake: poll GET / (the health route) for up to
     // 180 s until it answers with the API's own banner (not a platform placeholder page).
     async function wake() {
       const root = BASE.replace(/\/api\/?$/, "/");
       const deadline = Date.now() + 180_000;
       while (Date.now() < deadline) {
         try {
           const res = await fetch(root, { signal: AbortSignal.timeout(60_000) });
           const text = await res.text();
           if (res.ok && text.includes("Rasi Fiters API is running!")) { log(`  ✓ ${root} awake`); return true; }
         } catch { /* still waking */ }
         await sleep(5000);
       }
       log(`  ✗ ${root} did not answer within 180 s`);
       return false;
     }
     ```
   - (e) In `loginAll`, replace
     ```js
         const s = await login(u);
         sessions[u] = s;
     ```
     with
     ```js
         let s = await login(u);
         // Staging only (D-C12): a missing test account is registered with a +stg email, then logged in again.
         if (!s.ok && s.status === 401 && IS_STAGING && (await bootstrap(u))) s = await login(u);
         sessions[u] = s;
     ```
   - (f) In `main`, directly after the line that starts `` log(`RaSi test-bed — mode=``, insert:
     ```js
       if (IS_STAGING) {
         log("── WAKE (staging API) ──");
         if (!(await wake())) process.exit(1);
         log("");
       }
     ```

15. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/tools/testbed/README.md`:
   - (a) Replace `` this respects `apps/backend/CLAUDE.md`'s DB-write policy `` with `` this respects the repo-root `CLAUDE.md` DB-write policy ``.
   - (b) Replace the two lines starting `Optional env: \`TESTBED_SEED_DAYS\`` with:
     ```md
     Optional env: `TESTBED_SEED_DAYS` (default 14), `TESTBED_END_DAYS` (default 90),
     `TESTBED_API_BASE` (default the prod Render API), `TESTBED_STAGING_MAILBOX` (staging only — see below).

     ## Staging (reliability-overhaul Phase 2 B)

     The same script seeds the **staging** API (schema `staging`, shared Supabase Auth) — still API-only:

     ```bash
     TESTBED_API_BASE=https://rasifiters-api-staging.onrender.com/api TESTBED_PASSWORD='<pw>' \
       TESTBED_STAGING_MAILBOX='<a real inbox you own, no "+">' node tools/testbed/seed.mjs --reset
     ```

     Only when `TESTBED_API_BASE` is exactly that URL, it first **wakes** the API (polls `GET /` for up to 180 s
     until it answers "Rasi Fiters API is running!" — the free instance sleeps after 15 min idle). When a test account
     can't log in (401) it **registers** it via `POST /auth/register` with the staging-only email
     `<inbox-local>+stg-<username>@<inbox-domain>` (names derived from the username) and logs in again — the staging
     API accepts only `+stg` emails (auth SPEC D-C12). Registering sends no email; a staging forgot-password for these
     accounts arrives in that inbox. Use `--reset` the first time, then the default refresh. Against prod or any other
     base, neither step runs.
     ```

16. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/.claude/skills/deploy/SKILL.md`: immediately before the line `### Result`, insert:
```md
### C. Staging → Render free service + Vercel branch alias (reliability-overhaul Phase 2 B)
- **What:** Render `rasifiters-api-staging` (free, `virginia`, branch `staging`, `apps/backend`, `npm ci` /
  `npm start`, auto-deploy on commit) + the Vercel Preview for git branch `staging` (alias
  `https://rasifiters-git-staging-personal-vinayak.vercel.app`). Created via the render MCP — NOT in `render.yaml`.
  Env: `ENV_RUNBOOK.md` §Staging. Its service id is allow-listed in `deploy-scope-guard.sh` and recorded in
  `apps/backend/CONTEXT.md` §Staging.
- **Deploy on demand:** `git push origin main:staging` (or `git push --force-with-lease origin <branch>:staging` for
  unmerged work) — every push with the user's OK. Render rebuilds on every push; Vercel only when `apps/web/**`
  changed since the branch's last deployment (the project's ignore step).
- **Wake before every test session:** `curl -s -m 120 https://rasifiters-api-staging.onrender.com/` until it prints
  "Rasi Fiters API is running!" (~1 min cold start).
- **Verify a deploy:** the staging service's `GET …/deploys?limit=1` shows a NEW id with `status: live`; its logs
  show `[staging] APP_ENV=staging — login-change guard active` and `[staging] database schema = staging`.
- **Seed:** `tools/testbed/README.md` §Staging.
- **Never** give the prod service the staging role's URL or `APP_ENV` (prod refuses to boot on the staging schema;
  Render keeps the previous deploy live).
```

17. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/ENV_RUNBOOK.md` (**SHARED**; anchor on text only). Do not edit any text containing `CORS_ALLOWED_ORIGINS`; that row, the §4 host-migration note and the §6 STAYS line belong to track A.
   - (a) §3: directly after the table row whose first cell is `` `CORS_ALLOWED_ORIGINS` `` (whatever its text is after track A's edit), insert:
     ```md
     | `CORS_EXTRA_ORIGINS` | comma-separated browser origins appended to the CORS origin list hard-coded in `server.js` | no | **NEW (auth D-C12, 2026-10)** — staging service only (= the Vercel staging alias, §Staging). Unset on prod → the CORS list is exactly the hard-coded one. |
     | `APP_ENV` | `staging` marks the staging service | no | **NEW (auth D-C12, 2026-10)** — turns on `utils/stagingGuard.js` (login-change guard, staging-only reset mail, local-scope logout, staging-schema boot check). **Never set on prod** (prod refuses to boot if its `DATABASE_URL` is the staging role). §Staging. |
     ```
   - (b) §4: replace the four rows that start `` | `NEXT_PUBLIC_API_BASE_URL` | ``, `` | `NEXT_PUBLIC_SUPABASE_URL` | ``, `` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `` and `` | ~~`NEXT_PUBLIC_API_ENV`~~ | `` with the rows below. Keep the `NEXT_PUBLIC_APP_URL` row and the struck-through `JWT_SECRET` row where they are.
     ```md
     | `NEXT_PUBLIC_API_ENV` | `prod` → use `NEXT_PUBLIC_API_BASE_URL_PROD`; anything else/unset → `NEXT_PUBLIC_API_BASE_URL_LOCAL` | no | Read by `apps/web/src/lib/config.ts` (live — earlier drafts here wrongly called it retired). Production = `prod`; Preview for branch `staging` = `prod` (§Staging). |
     | `NEXT_PUBLIC_API_BASE_URL_PROD` | API base the web calls when `NEXT_PUBLIC_API_ENV=prod` | no | Production = `https://rasifiters-api.onrender.com/api` (also the code default); Preview `staging` = `https://rasifiters-api-staging.onrender.com/api`. |
     | `NEXT_PUBLIC_API_BASE_URL_LOCAL` | local backend base | no | Unset on Vercel → `http://127.0.0.1:5001/api` (so other preview branches call loopback). |
     | `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google Web OAuth client id (web "Continue with Google") | no | Production + Preview `staging`, same value. |
     | ~~`NEXT_PUBLIC_SUPABASE_URL`~~ / ~~`NEXT_PUBLIC_SUPABASE_ANON_KEY`~~ | — | — | **Not used / not set** — the web has no Supabase dependency; all auth goes through the backend proxy (`apps/web/CONTEXT.md`). |
     ```
   - (c) §5: in the `API base URL` row, replace `` Point at the deployed Render backend. Mirrors web's `NEXT_PUBLIC_API_BASE_URL`. `` with `` `Config/APIConfig.swift`: Release → prod (mirrors web's `NEXT_PUBLIC_API_BASE_URL_PROD`); DEBUG → staging (§Staging). ``
   - (d) §6:
     - Replace `` - **NEW** `NEXT_PUBLIC_API_BASE_URL` (+ optional `NEXT_PUBLIC_SUPABASE_*`) on the web — R1/R4. `` with `` - Web API selection: `NEXT_PUBLIC_API_ENV=prod` + `NEXT_PUBLIC_API_BASE_URL_PROD` (the legacy switch was kept, not retired — §4); no `NEXT_PUBLIC_SUPABASE_*`. ``
     - On the `**RETIRED:**` line, delete `` `NEXT_PUBLIC_API_ENV`, ``.
   - (e) Append at the end of the file:
     ```md

     ## Staging (reliability-overhaul Phase 2 B — DESIGN_BOARD §8, auth SPEC D-C12)

     Same Supabase project (schema `staging` + role `rasifiters_staging` — `apps/backend/sql/008` + `sql/README.md`
     §Staging schema); **`auth.users` is shared with prod**. Release builds and `rasifiters.com` never touch staging.

     **Render `rasifiters-api-staging`** (free) — every var the prod service has, with these differences:

     | Var | Staging value | Secret? |
     |---|---|---|
     | `APP_ENV` | `staging` (never set on prod) | no |
     | `DATABASE_URL` | prod's URL with user `rasifiters_staging.kpadxjekpiwfkqcxtrio` (pooler) + the staging role's password — **user pastes** | **secret** |
     | `CORS_EXTRA_ORIGINS` | `https://rasifiters-git-staging-personal-vinayak.vercel.app` | no |
     | `PASSWORD_RESET_REDIRECT_URL` | `https://rasifiters-git-staging-personal-vinayak.vercel.app/reset-password` (also in Supabase Auth Redirect URLs) | no |
     | `APNS_PRODUCTION` | `false` (Xcode debug builds hold sandbox tokens) | no |
     | same as prod (non-secret) | `SUPABASE_URL`, `MIN_IOS_VERSION`, `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, `APPLE_SERVICES_ID`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID` | no |
     | same as prod (secret — **user pastes**) | `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_WEB_CLIENT_SECRET`, `APNS_KEY`, `FIREBASE_SERVICE_ACCOUNT` | **secret** |
     | left unset | the version-gate vars (`LATEST_IOS_VERSION`, `MIN_ANDROID_VERSION_CODE`, `LATEST_ANDROID_VERSION_CODE`, `BLOCK_UNVERSIONED_ANDROID`) → nobody blocked/nudged; set one only for a test that needs it | no |

     **Vercel** — Preview env scoped to git branch `staging`: `NEXT_PUBLIC_API_ENV=prod`,
     `NEXT_PUBLIC_API_BASE_URL_PROD=https://rasifiters-api-staging.onrender.com/api`, `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`
     = the Production value. Production env untouched.

     **Clients** — iOS: scheme `RaSi-Fiters-App-Staging` (Run = Debug → `APIConfig.stagingBaseURL`); Android: the
     `debug` build type's `API_BASE_URL`; web: the alias above. Release builds stay on prod.

     **Outside the app** — Google Cloud Web OAuth client: the alias is an Authorized JavaScript origin. Supabase Auth
     `uri_allow_list` holds the staging reset URL. Staging accounts use `name+stg@…` / `name+stg-tag@…` emails
     (testbed: `<inbox-local>+stg-<username>@<inbox-domain>` from `TESTBED_STAGING_MAILBOX`); the staging API refuses
     or skips every login-level change for any other account and mails resets only to `+stg` addresses outside
     `@rasifiters.com`. Supabase Auth settings, the 30 emails/hour SMTP limit and the refresh rate limits are shared
     with prod.
     ```

18. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/CONTEXT.md` (**SHARED**): immediately before the bullet that starts `- **Auth email → Resend**`, insert:
```md
- **Staging** (reliability-overhaul Phase 2 B, DESIGN_BOARD §8) — Render **free** service `rasifiters-api-staging`
  (`https://rasifiters-api-staging.onrender.com`, branch `staging`; wake before use) → the `staging` Postgres schema in
  the same Supabase project (role `rasifiters_staging`; **shared `auth.users`**, guarded — auth SPEC D-C12) + the
  Vercel branch alias `https://rasifiters-git-staging-personal-vinayak.vercel.app`. Debug iOS/Android builds point at
  it; release builds + `rasifiters.com` stay on prod. Detail: `apps/backend/CONTEXT.md` §Staging, `ENV_RUNBOOK.md`
  §Staging.
```

19. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/auth/SPEC.md`:
   - (a) §6: directly after the row that starts ``| — (new) | — | **`PASSWORD_RESET_REDIRECT_URL`**``, add:
     ```md
     | — (new) | — | **`APP_ENV`** (D-C12) — `staging` on the Render staging service only; turns on `utils/stagingGuard.js`. Unset in prod → every staging path is a no-op (the boot check only refuses a prod process on the `staging` schema). |
     | — (new) | — | **`CORS_EXTRA_ORIGINS`** (D-C12) — comma-separated origins appended to the hard-coded CORS list (`server.js`); staging = the Vercel branch alias. Unset in prod. |
     ```
   - (b) §9: directly after the `| **D-C11** |` row (before `| **D-REF** |`), add:
     ```md
     | **D-C12** | **Deliberate change (0.11.0) — staging environment + login-change guard (reliability-overhaul Phase 2 track B; DESIGN_BOARD §8, D-10).** A second backend, Render `rasifiters-api-staging` (free), runs the same code with `APP_ENV=staging` against the `staging` Postgres schema (role `rasifiters_staging`, `search_path = staging, extensions`; `sql/008`) in the SAME Supabase project, so **`auth.users` is shared with prod**. Every staging behaviour is gated on `APP_ENV === "staging"` (`utils/stagingGuard.js`); unset (prod) → every request-path helper is a no-op. A **staging account** = an email whose local part is `<name>+stg` or `<name>+stg-<tag>`. On staging: (a) `supabaseAdmin.auth.admin.createUser` / `updateUserById` / `deleteUser` are wrapped once at boot (`config/supabase.js` → `guardAdminAuth`): create needs a staging email; update/delete look the user up (`getUserById`) and need a staging email (an email change also needs a staging new email). Create/update refusals surface as `403 {error:"Not allowed on staging: only +stg test accounts (name+stg@… or name+stg-tag@…) can be created or changed here."}` (register, `POST /members`, program-memberships create-and-enroll, `/change-password`, `/reset-password`, `/set-password`, `PUT /email`); every `deleteUser` call site is best-effort, so a refused delete **skips only the auth-user part** — `DELETE /account`, member delete and the register / `/oauth/complete` / create clean-ups still remove the staging rows and leave the real login untouched. (b) `/link` + `/unlink` → 403 unless the member's auth email is a staging email. (c) `/forgot-password` sends a reset mail only to a staging email outside `@rasifiters.com` (no MX — a bounce would count against the Resend sender prod shares); otherwise no mail, same generic 200. (d) `/logout` signs out with `scope:'local'` (prod keeps `global` until Phase 3). (e) **Boot check (both services):** staging refuses to start unless `current_schema()` = `staging`; a non-staging process refuses to start if it is `staging` (a mis-pasted `DATABASE_URL` fails the deploy; Render keeps the previous one live) — prod's request path is unchanged. (f) `CORS_EXTRA_ORIGINS` is appended to the CORS list. **Accepted, not guarded:** signing IN on staging (password / Google / Apple); a real provider sign-in can create a staging member linked to that person's real (shared) auth user, and a brand-new provider user created via staging stays in `auth.users` — every login-level change for such members is refused/skipped by (a)–(b); linking a provider to a staging account binds that real identity to the staging login until unlinked on staging (use a dedicated test Google account). **Reference data:** `sql/008` copies `public.workouts_library` (workout names only) into staging — the only prod rows copied. **Clients:** web staging = Vercel Preview env for git branch `staging` (no code); iOS DEBUG → `APIConfig.stagingBaseURL` via the shared scheme `RaSi-Fiters-App-Staging` (Run = Debug; the main scheme stays Run = Release → prod); Android `debug` `API_BASE_URL` → staging; every release build + `rasifiters.com` stay on prod. MINOR (no prod route/shape/behaviour change → zero dependent re-version). | DESIGN_BOARD §8 + D-10; BRIEF §6/§7; `utils/stagingGuard.js`; `config/supabase.js`; `services/authService.js` (`logout`, `linkProvider`, `unlinkProvider`, `requestPasswordReset`); `server.js`; `sql/008_staging_schema.sql`. |
     ```
   - (c) The header version, the §11 row and the registry entries are done at git-version (step 23).

20. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/members/SPEC.md` §8 (a pointer only, no bump). In the `**Upstream:**` bullet, replace `` the routes; Supabase admin API + `members.auth_user_id` (created by the migrator) power the `createMember`\n  change. `` with:
```md
  the routes; Supabase admin API + `members.auth_user_id` (created by the migrator) power the `createMember`
  change. On the staging API (`APP_ENV=staging`) those admin calls pass through auth's staging guard — see
  [auth D-C12](../auth/SPEC.md) (no-op in prod).
```

21. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/program-memberships/SPEC.md` §8 (a pointer only, no bump). Replace `` - **Upstream:** [`auth`](../auth/SPEC.md) (`authenticateToken`, the program-admin authz pattern); `` with:
```md
- **Upstream:** [`auth`](../auth/SPEC.md) (`authenticateToken`, the program-admin authz pattern; on the staging API
  `createMemberAndEnroll`'s Supabase admin calls pass through auth's staging guard — [auth D-C12](../auth/SPEC.md),
  no-op in prod);
```

## Console actions
Every action needs the user's explicit yes. The user pastes all secrets; Claude never types them. Run them in this order.

- **P0. Read-only pre-flight drift check** (Claude, supabase MCP `execute_sql`; before the user runs 008):
  ```sql
  SELECT 'table' AS kind, tablename AS name FROM pg_tables
   WHERE schemaname = 'public' AND tablename NOT IN ('members','workouts_library','programs','program_memberships',
     'program_workouts','workout_logs','daily_health_logs','member_emails','member_push_tokens','program_invites',
     'program_invite_blocks','notifications','notification_recipients','member_program_order')
  UNION ALL
  SELECT 'trigger', tg.tgrelid::regclass::text || '.' || tg.tgname FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid WHERE c.relnamespace = 'public'::regnamespace AND NOT tg.tgisinternal
  UNION ALL
  SELECT 'function', p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
  ORDER BY 1, 2;
  ```
  Pass: 0 rows, or only objects defined in `apps/backend/sql/007_*.sql` (track A) if that file has already run. Any other row: STOP and do not run 008; send the rows back to the planner.

  > **AMENDED P0 (impl review A2, 2026-10-12) — run THIS version, not the query above.** The repo copy is
  > `apps/backend/sql/README.md` §Staging schema step 0: the query above with
  > `AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')` appended to the function
  > branch (skips extension-owned functions). Expect `app_events` as the only extra table (007 is on prod).

- **C1. Supabase SQL editor (USER):**
  1. Run `008_staging_schema.sql`.
  2. If `007_*.sql` already ran on `public`, run it again with `SET search_path TO staging;` as its first line.
  3. Run `openssl rand -hex 24` locally, then `ALTER ROLE rasifiters_staging WITH PASSWORD '<value>';`.

  Then Claude, read-only via the MCP:
  - **C1-V1 to V4:** the `sql/README.md` §Staging step-5 queries. Expected: 14 (+ A's tables); `t | 10 | {"search_path=staging, extensions",statement_timeout=30s}` (amended, review A3); `f | t`; equal library counts; plus step 5's isolation block (review A2): `f | f | f`, 0 rows, 0 rows.
  - **C1-V5:** the definition-level diff below. Pass: 0 rows. Any row: STOP before C3; the planner writes a staging-only follow-up migration.
    ```sql
    WITH t(name) AS (VALUES ('members'),('workouts_library'),('programs'),('program_memberships'),('program_workouts'),
      ('workout_logs'),('daily_health_logs'),('member_emails'),('member_push_tokens'),('program_invites'),
      ('program_invite_blocks'),('notifications'),('notification_recipients'),('member_program_order')),
    objs AS (
      SELECT n.nspname AS sch, cl.relname AS tbl, 'constraint' AS kind, con.conname AS name,
             replace(replace(pg_get_constraintdef(con.oid), 'public.', ''), 'staging.', '') AS def
      FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE n.nspname IN ('public','staging') AND cl.relname IN (SELECT name FROM t) AND con.contype IN ('p','u','f','c','x')
      UNION ALL
      SELECT schemaname, tablename, 'index', indexname, replace(replace(indexdef, 'public.', ''), 'staging.', '')
      FROM pg_indexes WHERE schemaname IN ('public','staging') AND tablename IN (SELECT name FROM t)
      UNION ALL
      SELECT n.nspname, c.relname, 'column', a.attname,
             format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
               || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '')
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE n.nspname IN ('public','staging') AND c.relname IN (SELECT name FROM t) AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped
      UNION ALL
      SELECT n.nspname, c.relname, 'trigger', tg.tgname, ''
      FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public','staging') AND c.relname IN (SELECT name FROM t) AND NOT tg.tgisinternal
    )
    (SELECT 'only_in_public' AS side, tbl, kind, name, def FROM objs WHERE sch = 'public'
     EXCEPT SELECT 'only_in_public', tbl, kind, name, def FROM objs WHERE sch = 'staging')
    UNION ALL
    (SELECT 'only_in_staging', tbl, kind, name, def FROM objs WHERE sch = 'staging'
     EXCEPT SELECT 'only_in_staging', tbl, kind, name, def FROM objs WHERE sch = 'public')
    ORDER BY 2, 3, 4;
    ```
  - **C1-V6:** Claude records `SELECT count(*) FROM public.members` as the baseline for C11.

- **C3b-1. Create the branch before B's code reaches it** (user OKs the push):
  1. Run `git fetch origin && git push origin origin/main:refs/heads/staging`. This must happen before C3a, so the branch sits on the old `main`.
  2. Vercel builds a throwaway preview with no staging env (loopback API, behind Vercel login). That is harmless.

- **C4. Read the alias (read-only)** after that build finishes:
  1. Run `tools/ops-get.sh vercel '/v6/deployments?projectId=prj_Eqd5XmbgXDkRRhKJPASBOcIqKF6u&target=preview&limit=10'` and pick the deployment whose `meta.githubCommitRef` is `staging`.
  2. Run `tools/ops-get.sh vercel '/v13/deployments/<uid>'` and read its `alias` list.
  3. The expected alias is `rasifiters-git-staging-personal-vinayak.vercel.app`. If it differs, use the actual value as `<alias>` from here on, and fix the docs in C7.

- **C2. Vercel Preview env for branch `staging`.** The branch now exists. Claude runs these from the repo root; the values are not secret; one OK per command:
  ```
  printf '%s' 'prod' | vercel env add NEXT_PUBLIC_API_ENV preview staging --scope personal-vinayak
  printf '%s' 'https://rasifiters-api-staging.onrender.com/api' | vercel env add NEXT_PUBLIC_API_BASE_URL_PROD preview staging --scope personal-vinayak
  printf '%s' '938606130476-9vhk5o43c2g0ib4a167l1o4mmnt52f9b.apps.googleusercontent.com' | vercel env add NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID preview staging --scope personal-vinayak
  ```

- **C3a. Push `main` (prod deploy of B's code)** (user OKs). Verify:
  - a NEW prod deploy is `live`;
  - `curl -s https://rasifiters-api.onrender.com/` returns 200;
  - the prod logs have no `[staging]` lines and no `refusing to boot`;
  - this preflight still returns `Access-Control-Allow-Origin: https://rasifiters.com`:
    ```
    curl -s -D - -o /dev/null -X OPTIONS https://rasifiters-api.onrender.com/api/auth/login/global -H 'Origin: https://rasifiters.com' -H 'Access-Control-Request-Method: POST'
    ```

- **C3b-2. Push B's code to staging** (user OKs):
  1. Run `git push origin main:staging` (a fast-forward).
  2. B's commit touches `apps/web/CONTEXT.md`, so the ignore step's `git diff "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- .` is non-empty and the preview rebuilds with the C2 env in place.
  3. Check that the new preview deployment is `READY`.

- **C5. Render MCP `create_web_service`** (workspaceId `tea-cv3u7a3tq21c73ald2ig`):
  - name `rasifiters-api-staging`, runtime node, repo `https://github.com/vinaySankar2004/rasifiters-master`, branch `staging`;
  - plan `free`, region `virginia`, autoDeploy on;
  - rootDir `apps/backend` with `npm ci` / `npm start`. If the tool has no rootDir field, use build `cd apps/backend && npm ci` and start `cd apps/backend && npm start`;
  - healthCheckPath `/` if the tool accepts it.

  Record the returned `srv-…` id. The first deploy fails until C6; that is expected.

- **C7. Hook allow-list (repo, before any Bash command that names the new id next to "render")**, in `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/.claude/hooks/deploy-scope-guard.sh`:
  1. Replace the line `RENDER_SERVICE="srv-d90tgmv7f7vs73cudptg"   # rasifiters-api (the only Render service we own)` with:
     ```bash
     RENDER_SERVICE="srv-d90tgmv7f7vs73cudptg"   # rasifiters-api (prod)
     RENDER_STAGING_SERVICE="<the srv- id from C5>"   # rasifiters-api-staging (free; reliability-overhaul Phase 2 B)
     ```
  2. Replace the line `  bad=$(printf '%s' "$cmd" | grep -oE 'srv-[a-z0-9]+' | grep -vx "$RENDER_SERVICE" || true)` with:
     ```bash
       bad=$(printf '%s' "$cmd" | grep -oE 'srv-[a-z0-9]+' | grep -vx -e "$RENDER_SERVICE" -e "$RENDER_STAGING_SERVICE" || true)
     ```
  3. In the echo line, replace `Only $RENDER_SERVICE is allowed.` with `Only $RENDER_SERVICE and $RENDER_STAGING_SERVICE are allowed.`
  4. Directly after the header line `#   backend: Render web service \`rasifiters-api\` = srv-d90tgmv7f7vs73cudptg (PROVISIONED 2026-06-28)`, add `#            + \`rasifiters-api-staging\` = <id> (free staging, PROVISIONED <date>)`.
  5. Append `` (`<id>`) `` after the first `rasifiters-api-staging` in `apps/backend/CONTEXT.md` §Staging and in the deploy SKILL §C. If C4 found a different alias, replace `rasifiters-git-staging-personal-vinayak.vercel.app` in every B doc.

- **C6. Render env:**
  1. Claude sets the non-secret values via MCP `update_environment_variables`:
     ```
     APP_ENV=staging
     APNS_PRODUCTION=false
     SUPABASE_URL=https://kpadxjekpiwfkqcxtrio.supabase.co
     MIN_IOS_VERSION=1.2.0
     CORS_EXTRA_ORIGINS=https://<alias>
     PASSWORD_RESET_REDIRECT_URL=https://<alias>/reset-password
     GOOGLE_WEB_CLIENT_ID=938606130476-9vhk5o43c2g0ib4a167l1o4mmnt52f9b.apps.googleusercontent.com
     GOOGLE_IOS_CLIENT_ID=938606130476-if8tb58822r2d75l7fq90v2jiqek6bkh.apps.googleusercontent.com
     GOOGLE_ANDROID_CLIENT_ID=938606130476-9env4iuuajogs7k03asn4ghcm27ugsdu.apps.googleusercontent.com
     APPLE_SERVICES_ID=com.app.rasifiters.signin
     APNS_KEY_ID=RA353TA52W
     APNS_TEAM_ID=VSTTF2AM22
     APNS_BUNDLE_ID=com.app.rasifiters
     ```
  2. The USER pastes the secrets in the dashboard: `DATABASE_URL` (staging role, README §Staging step 3), `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_WEB_CLIENT_SECRET`, `APNS_KEY`, `FIREBASE_SERVICE_ACCOUNT`.
  3. Deploy. Verify a NEW deploy id is `live` and the logs contain both `[staging] …` lines.

- **C8. Supabase Auth redirect allow-list:**
  1. Read-only: `tools/ops-get.sh supabase '/v1/projects/kpadxjekpiwfkqcxtrio/config/auth'` and read `uri_allow_list`.
  2. Admin token (token-guard asks the user): `PATCH /v1/projects/kpadxjekpiwfkqcxtrio/config/auth` with body `{"uri_allow_list":"<existing value verbatim>,https://<alias>/reset-password"}`.
  3. Read it back.

- **C9. Google Cloud** (browser pane, user yes): APIs & Services → Credentials → Web client `938606130476-9vhk5o43c2g0ib4a167l1o4mmnt52f9b` → Authorized JavaScript origins → add `https://<alias>` → Save.

- **C10. Wake and seed.** The user runs this, or gives an OK and supplies the password and inbox:
  ```
  TESTBED_API_BASE=https://rasifiters-api-staging.onrender.com/api TESTBED_PASSWORD='<pw>' TESTBED_STAGING_MAILBOX='<inbox>' node tools/testbed/seed.mjs --reset
  ```
  Pass: 7 accounts `＋ registered`, then logged in; VERIFY lists the 3 programs with ava as admin, logger and member.

- **C11. Staging smoke:**
  1. A preflight against staging with `Origin: https://<alias>` returns that origin in `Access-Control-Allow-Origin`. The same origin against prod returns no `Access-Control-Allow-Origin` header.
  2. The guard refuses a non-`+stg` register. Expect 403 with the refusal message:
     ```
     curl -s -X POST https://rasifiters-api-staging.onrender.com/api/auth/register -H 'Content-Type: application/json' -d '{"username":"stg.guardcheck","password":"Guardcheck1","first_name":"Guard","last_name":"Check","email":"guardcheck@rasifiters.com"}'
     ```
  3. Read-only: `SELECT count(*) FROM staging.members` returns 7, and `public.members` equals the C1-V6 baseline.
  4. USER checks:
     - forgot-password for `ava.rivera`'s staging address on the alias (after signing in to Vercel in that browser) arrives in the inbox, and the reset completes;
     - the iOS Staging scheme and the Android debug build log in as `ava.rivera`;
     - prod (`rasifiters.com` and the store apps) is unaffected.

## Endgame
22. **Compile-check:**
   - **backend**, run in `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend`:
     - Syntax: `node --check server.js && node --check utils/stagingGuard.js && node --check config/supabase.js && node --check services/authService.js`
     - Prod no-op on the admin API (must print `0`):
       ```
       SUPABASE_URL=https://example.supabase.co SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x node -e "const s=require('./config/supabase');console.log(['createUser','updateUserById','deleteUser'].filter(k=>Object.prototype.hasOwnProperty.call(s.supabaseAdmin.auth.admin,k)).length)"
       ```
     - Staging refuses a non-`+stg` create and passes a `+stg` one (stdout must be `refused 403` then `passed guard`):
       ```
       APP_ENV=staging SUPABASE_URL=https://example.supabase.co SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x node -e "const a=require('./config/supabase').supabaseAdmin.auth.admin;const t=(e)=>a.createUser({email:e,password:'x'}).then(()=>'passed guard').catch(x=>x.statusCode===403?'refused 403':'passed guard');(async()=>{console.log(await t('someone@gmail.com'));console.log(await t('me+stg-ava.rivera@gmail.com'))})()"
       ```
     - Staging email rules (stdout must be `true true false false true false false`):
       ```
       APP_ENV=staging node -e "const g=require('./utils/stagingGuard');console.log(g.isStagingEmail('me+stg-ava.rivera@gmail.com'),g.isStagingEmail('ava.rivera+stg@rasifiters.com'),g.isStagingEmail('ava.rivera@gmail.com'),g.isStagingEmail('me+stgx@gmail.com'),g.mayEmailFromHere('me+stg-ava.rivera@gmail.com'),g.mayEmailFromHere('ava.rivera+stg@rasifiters.com'),g.mayEmailFromHere('a@b.co'))"
       ```
     - Prod no-op (must print `true false`):
       ```
       node -e "const g=require('./utils/stagingGuard');g.assertStagingAccount('a@b.co');console.log(g.mayEmailFromHere('a@b.co'),g.isStaging())"
       ```
     - The real boot checks are the Render deploys in C3a (prod) and C6 (staging).
   - **tools:**
     - `node --check /Users/vinayaksankaranarayanan/Developer/rasifiters-master/tools/testbed/seed.mjs`
     - `bash -n /Users/vinayaksankaranarayanan/Developer/rasifiters-master/.claude/hooks/deploy-scope-guard.sh`
     - Hook behaviour after C7: use the Write tool to create two JSON files in the scratchpad, `{"tool_input":{"command":"render x <staging id>"}}` and the same with `srv-aaaaaaaaaaaaaaaaaaaa`. Run `.claude/hooks/deploy-scope-guard.sh < <file>; echo $?` on each; expect `0` and `2`. The Bash command itself must not contain the word "render".
   - **web:** docs only; no build.
   - **android:**
     1. `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android && ./gradlew :app:assembleDebug && grep -h API_BASE_URL app/build/generated/source/buildConfig/debug/com/app/rasifiters/BuildConfig.java` → the staging URL.
     2. `./gradlew :app:generateReleaseBuildConfig && grep -h API_BASE_URL app/build/generated/source/buildConfig/release/com/app/rasifiters/BuildConfig.java` → the prod URL.
     - If the build fails on iCloud ` 2`/` 3` duplicate files, `rm -rf app/build build` and rebuild.
   - **ios:**
     - The user selects the `RaSi-Fiters-App-Staging` scheme in Xcode; Claude runs `mcp__xcode__BuildProject` (tab id from `XcodeListWindows`), then repeats with `RaSi-Fiters-App`.
     - If the xcode MCP isn't connected, the user builds both schemes in Xcode (⌘B).
     - **iOS compile and all visual/live testing are the USER's.** There are no test suites and no staging test suite; the user verifies on staging and prod.

**Migration:** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/008_staging_schema.sql`. The USER runs it (C1) and then sets the role password by hand. Claude makes no DB writes.

23. **git-version** (serialize with tracks A, C and D; apply C's `server.js` / `ENV_RUNBOOK.md` hunks first). There are three commits.
   - **Commit 1: `feat(auth): staging environment — login-change guard, staging schema migration, client env switches`.** It contains every B file except the members/program-memberships SPECs and the hook.
     - **Mapping:**
       - `config/supabase.js`, `services/authService.js` → **auth**.
       - `server.js` matches 14 features' `reference_impl`; **only auth bumps**. B's `server.js` hunks (the env-gated CORS append and the boot schema check) are owned by auth D-C12. No route or shape of members, programs, program-memberships, notifications, invites, workouts, program-workouts, workout-logs, daily-health-logs, analytics, analytics-v2, member-analytics or app-config changes, so they get no bump.
       - Client, tool and doc files map to no feature.
     - **Contract change:**
       - Add `"utils/stagingGuard.js"` and `"sql/008_staging_schema.sql"` to auth's `reference_impl.paths` (the precedent is 005 → programs and 006 → daily-health-logs).
       - This is a `reference_impl` change, so git-version step 4 stops for propagation acknowledgment.
       - Pre-stated answer: the dependents are [members, programs, program-memberships, notifications, invites, workouts, program-workouts, workout-logs, daily-health-logs, analytics, analytics-v2, member-analytics, apple-health, health-connect]. None re-versions, because there is no prod route, shape or behaviour change. The user confirms at the stop.
     - **Records:**
       - auth SPEC header `**Version:** 0.11.0` and `registry.json` `auth.version` → `0.11.0`.
       - REGISTRY.md auth row → `0.11.0`, and add `` `utils/stagingGuard.js` ``, `` `sql/008_staging_schema.sql` `` to its file list.
       - Insert this row as the first data row of auth §11 (above `| 0.10.0 |`):
         ```md
         | 0.11.0 | <commit date> | **D-C12 — staging environment + login-change guard (reliability-overhaul Phase 2 track B; DESIGN_BOARD §8 / D-10).** New `utils/stagingGuard.js` (no-ops unless `APP_ENV=staging`): on staging, `supabaseAdmin.auth.admin` create/update/delete are wrapped at boot (`config/supabase.js`) and need a `+stg` / `+stg-<tag>` account email (create/update → 403; delete → skipped by the existing best-effort call sites); `/link` + `/unlink` → 403 for non-`+stg` accounts; `/forgot-password` mails only `+stg` addresses outside `@rasifiters.com` (same generic 200); `/logout` → `scope:'local'`; boot check: staging must be on schema `staging`, prod must not be. `server.js`: `CORS_EXTRA_ORIGINS` appended to the CORS list. Migration `sql/008_staging_schema.sql` (+ `workouts_library` reference copy). Clients: iOS DEBUG → staging via the new `RaSi-Fiters-App-Staging` scheme; Android `debug` → staging; web via Vercel Preview env (branch `staging`). Prod: no route/shape/behaviour change → **MINOR**, zero dependent re-version. |
         ```
     - Tag `feature/auth@v0.11.0`. If track A lands an auth bump first, this becomes 0.12.0 with the same content.
   - **Commit 2: `docs(members,program-memberships): cross-ref auth D-C12 staging guard`.** No bump and no tag: these are cross-ref pointers into dependents' prose (git-version converged lesson).
   - **Commit 3 (after C5/C7): `chore(ops): allow-list + record the staging Render service`.** No bump.

## Risks the implementer must watch
- **Files shared with other tracks:**
  - `server.js`: track C commits first and inserts at the errorHandler anchor; track A adds `maxAge` and request-log middleware. Use only B's text anchors (step 5) and don't overwrite their hunks.
  - `authService.js`: track A may add events in `logout`.
  - `APIConfig.swift` and `build.gradle.kts`: track D.
  - `ENV_RUNBOOK.md` (C owns the `MIN_IOS_VERSION` rows; A owns every `CORS_ALLOWED_ORIGINS` text), `CONTEXT.md`, `registry.json`, `REGISTRY.md`.
  - The `ENV_RUNBOOK.md` section is unnumbered (`## Staging …`) on purpose, so numbering can't collide with other tracks.
- **Cross-track migrations (FLAG for A):**
  - Track A's 007 must contain no `public.` or `staging.` names, or staging never gets `app_events`.
  - A's event and request-log writes must be best-effort, so staging works before 007 is re-run there.
  - A's `pg_cron` cleanup job is schema-bound: staging's `app_events` won't be pruned. That is accepted (one user, low volume).
- **Prod must not change:**
  - Every request-path change is behind `APP_ENV`, and `signOut(undefined)` keeps auth-js's default global scope.
  - The only prod addition is one boot-time `SELECT current_schema()`, which refuses only the schema `staging`.
  - Never set `APP_ENV` or `CORS_EXTRA_ORIGINS` on prod.
  - No live binary is affected (iOS 1.4.2 (56), TestFlight 1.4.3 (57), Android 1.0.0 (4)).
- **Shared email budget:**
  - Staging forgot-password uses the same Resend sender and Supabase's 30 emails per hour as prod.
  - Test resets only against `+stg-<username>` inbox addresses. `@rasifiters.com` is refused, because it has no MX record.
- **Guard edge cases (accepted in D-C12):**
  - A real Google/Apple sign-in on staging touches the shared `auth.users`.
  - Linking a personal Google account to a staging account would make prod "Continue with Google" for that identity hit the D-C8 409 until it is unlinked on staging. Use a dedicated test Google account for link tests.
- **Branch-order trap:**
  - C3b-1 must create `staging` on the old `main` before C3a.
  - If B's commit reaches `staging` before the Preview env exists, its web preview builds against loopback. The ignore step then skips later pushes until `apps/web/**` changes again.
  - Recovery in that case: push any `apps/web/**` doc change to `staging`.
- **Switching between prod and staging builds:**
  - Tokens are valid on both but map to different members; sign out before switching.
  - Android debug and Play builds share an application id (uninstall first).
  - The same sandbox APNs token can sit in both databases.
- **Cold start:** wake staging before every session, because the clients' 10–15 s timeouts are shorter than a free-instance wake.
- **Scope-guard hook:** until C7, use only the MCP for the new service. Any Bash command that puts "render" next to the new `srv-` id is blocked.
- **Outside B's fence (orchestrator follow-ups, exact text):**
  - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/.env.example` (after track C's append), append:
    ```
    # --- Staging only (auth SPEC D-C12) — NEVER set on prod ---------------------------------------------
    # APP_ENV=staging                    # turns on utils/stagingGuard.js (login-change guard, local logout, schema check)
    # CORS_EXTRA_ORIGINS=https://rasifiters-git-staging-personal-vinayak.vercel.app   # comma-separated, appended to CORS
    ```
  - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/.claude/skills/android-build/SKILL.md:47-49`: replace the text from `` `BuildConfig.API_BASE_URL = https://rasifiters-api.onrender.com/api` for **both`` through `` is the temporary exception); `` with:
    ```
    `BuildConfig.API_BASE_URL`: **debug → staging** `https://rasifiters-api-staging.onrender.com/api`, **release →
      prod** `https://rasifiters-api.onrender.com/api` (auth D-C12; local loopback `http://10.0.2.2:5001/api` is the
      temporary exception);
    ```
  - Members SPEC §6 drift ("when un-deferred"; `deleteMember` is already wired at `memberService.js:180`). This is a future members PATCH.
  - Update the memory note `dev-tests-against-live-backend`: debug builds now go to staging, while the main iOS scheme's Run still hits prod.
  - Update `HANDOFF.md` and `PROGRESS.md`.
