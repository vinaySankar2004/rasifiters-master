# PLAN — People server slice S1, revision 3: "Hide my activity" built on S0's rule, People list and profile, kudos through C8, migration 012, API contract

**Brief accepted**: yes. 23 files: 14 backend (including `sql/README.md` and `CONTEXT.md`) and 9 docs.
- **Added versus the brief:** `specs/features/program-memberships/SPEC.md`. Verdict #2 requires it, and the amendments' preamble sanctions it ("for every verdict objection not named here, the orchestrator takes the verdict's fix").
- **No longer touched (were in revision 2):**
  - `models/index.js`: `Kudos` follows N-SRV's D2 pattern, so it is required directly and not registered.
  - `routes/members.js`: S0 already passes `req.user` there (`:26`).

**Feature/version prediction**:
- `people`: new at v0.1.0.
- `members` v0.4.0 → v0.5.0.
- `member-analytics` v0.6.0 → v0.7.0.
- `analytics` v0.5.0 → v0.6.0.
- `analytics-v2` v0.2.1 → v0.3.0.
- `program-memberships` v0.3.0 → v0.4.0. Verdict #2 requires this because the owned `utils/memberVisibility.js` interface changes. **The amendments' §5 S1 row leaves it out, so the orchestrator adds it.**
- `notifications` v0.6.0 → v0.6.1. This is a PATCH above N-SRV: a new emitter is documented, and the interface it uses (C8) is unchanged.
- No bump for:
  - `auth`: `models/Member.js` is shared, and the column belongs to members' D-rule.
  - `daily-health-logs`: FYI only. It imports the module, and the case-insensitive self check is backward-compatible.
  - The other features that list `server.js`.
- No app version bumps.

**Surfaces in scope**: [backend, docs]. Web, iOS and Android are untouched in S1. Their People work is Track C. Before building People, they diff their DTOs against the **API CONTRACT** at the end of this plan (web E4, iOS §F, Android G-P).

**Binding inputs**:
- `phase-4-np-amendments.md` §2: S1-1 to S1-5 and N-1.
- `phase-4-p-server/verdict.md` #2 to #8 (the amendments' preamble).
- N-SRV contract C8.
- The shipped S0 code (`5e76113`).

## What changed from revision 2
| # | Source | Change |
|---|---|---|
| 1 | S1-1 / P#1 | **The second rule is removed.** Gone: `viewerActiveRole`, `isActivityStaff`, the WeakMap cache, `canSeeActivity`, `filterActivityRows`, `assertActivityVisible`, `requireActivityVisible` and the S-1 seam `canViewRoster`. **The only rule is S0's `canView(viewer, id, "workouts")`.** `loadViewer` fills `hiddenMemberIds` with one query and skips it for staff and global admins. People, the profile and kudos use `loadViewer`, `hasProgramAccess` and `canView(…, "workouts")`. |
| 2 | S1-1 | `getMemberMetrics` omits rows with `canView(viewer, row.member_id, "workouts")`. `getSummary` filters `top_performers` with the same call. Neither zeroes anything. S0's "redaction" header comment now says rows are omitted. |
| 3 | S1-1 | `requireWorkoutsView` stays the **only** guard on the 5 `/workouts/types` routes. `requireMemberView(kind, message, code?)` gains an optional `code`, so the workouts guard answers `{ error: "This member keeps their activity private.", code: "activity_hidden" }`. `assertMemberAccess` uses the same message. |
| 4 | S1-1 | `GET /members/:id` `hide_activity` is gated by the existing `showEmail = canView(…, "email")`. |
| 5 | S1-1, interpretation | "Every caller passes the user" is implemented as passing `req.viewer` to `getSummary`. That is `loadViewer(req.user, programId)`, which `requireProgramAccess` has already computed, and it matches verdict #1's fix. This avoids a second lookup. Without a viewer the filter returns no rows (fails closed). |
| 6 | NEW: hardening of the one rule | `canView` compares ids in canonical form through a new export `canonicalId` (lowercase 8-4-4-4-12).<br>**Why:** PostgreSQL reads `ABC…`, `{…}` and un-hyphenated forms as the same uuid. Without this, a plain member could bypass the hide check with `?memberId=<H upper-cased>`, or with a repeated `?memberId=H&memberId=me`, which gives an array and a `member_id IN (…)`.<br>`requireMemberView` now answers **400 `invalid_request`** for a `memberId` that is not one well-formed id. This applies to the 5 workouts routes and the 2 health routes. It was a 500 before, or a pass for an array.<br>Live clients send canonical ids from server JSON (iOS `APIClient+Members.swift:242` passes the String it received). |
| 7 | NEW: one-word widening of S1-1 | **The hidden-member query includes every membership status**, not only "active". A member who left a program would otherwise have their workout history there readable through `/workouts/types?memberId=` (that route doesn't require the target to be active). It is the same single query. Flagged for the adversary and the user. |
| 8 | S1-2 / P#2 | The time zone comes from C8 `getTimeZones` and `localParts`. `localDateIn` and its boot line are deleted. `utils/notifications.js` is **not** edited. |
| 9 | S1-3 / P#3 | Kudos title and body come from `getContentProvider().render("activity.kudos_received", { first_name, actor_first_name, day_label: dayLabel(kudosDate, kudosDate) }, seed)` inside the insert transaction. First names are loaded. No fixed text. |
| 10 | S1-4 / P#3 | Contract §F: delivery is through `/notifications/inbox`, `?inbox=1` and push, with C5 `category`/`target`, and **never** on `/unacknowledged`. §8/F3: live binaries get a **push banner only**. The matrix reads `GET /notifications/inbox?limit=50` and asserts that the note **exists before** it asserts that undo removed it. |
| 11 | S1-5 / P#22 | `server.js` uses text anchors after N-SRV's lines. `sql/README.md` count becomes "22 after 012". The 012 row reads "SQL independent of 011; S1 code requires 011 on the schema first". The GET inventory is **39**. Coverage guard (d) adds `services/memberActivityStats.js` and `utils/memberVisibility.js` (verdict #4). |
| 12 | NEW: kudos eligibility | `isActiveGiver(viewer, programId)` in kudosService. `loadViewer` skips the membership read for global admins, so a global admin who is also an active member gets one composite-PK read. This keeps D-C4 ("active members of `program_id`") true for the owner's account. It is eligibility to give, not visibility. |
| 13 | Verdict #2 | Bump program-memberships 0.4.0 and add new **D-C6**. The D-C5 "redaction inside `redactMetricsRow`" sentence is marked superseded. `people.reference_impl` drops `memberVisibility.js`. No `depends_on: people` edges. |
| 14 | Verdict #3 | `memberService.js` grows from 200 to about 213 lines. **Accepted explicitly** (one cohesive service). |
| 15 | Verdict #5 / NP-U5 | U-1/U-2/U-3 are resolved by NP-U5. U-3 ("People goes live with the store release") explicitly overrides `phase-4/DECISIONS.md:8` "web ships as each part is reviewed" for People. |
| 16 | Verdict #6 | The privacy text adds gender, join date and program join date. |
| 17 | Verdict #7 | Matrix #10 uses `period=year` and asserts H is **present** for S before asserting H is absent for P. |
| 18 | Verdict #8 | N-SRV keeps the zone in `notification_preferences`, so `Member.js` is not shared. Shared with N-SRV: `server.js`, `sql/README.md` and `CONTEXT.md` only. |
| 19 | R10 | D-C12: the notice's "seen" flag is **per member** (not per device). |

## User decisions (resolved by NP-U5 unless the user changes them at approval)
- **U-1 → (b)**, the one-time "Who can see your activity" notice ([Keep visible] / [Hide my activity]).
  - The seen flag is per member and only counts once the choice landed (R10).
  - If the user picks (c) instead: step 1 PART 1 becomes `DEFAULT true`, step 5 becomes `defaultValue: true`, and the VERIFY `hidden_members` value equals the member count.
- **U-2 → Activity ON** (N-SRV's default).
- **U-3 → People goes live with the store release on all clients.**
  - This **overrides** `phase-4/DECISIONS.md:8` ("web ships as each part is reviewed") for People only.
  - The S1 backend can deploy at any time, because no live client calls `/api/people`.

## Preconditions and seams (G0 verifies; never guess or rename)
| Seam | Symbols S1 calls | Owner / state |
|---|---|---|
| S-1 | `loadViewer(user, programId)`, `hasProgramAccess(viewer)`, `canView(viewer, id, kind)`, `requireMemberView(kind, message)` in `apps/backend/utils/memberVisibility.js` | S0 (program-memberships D-C5), live since `5e76113` |
| S-2 | `getTimeZones(memberIds)` → `Map` in `services/notificationPreferenceService.js`; `localParts(zone, now)` and `dayLabel(date, today)` in `utils/localTime.js` | N-SRV contract C8 |
| S-3 | `getContentProvider().render(type, vars, seedKey)` → `{title, body}` in `utils/notificationTemplates.js`; `createNotification({…, transaction})` in `utils/notifications.js` (unchanged) | N-SRV contract C8 |

**Before step 4, N-SRV must be merged on `main` and live,** with 011 run on staging and public (N-SRV step 31). S1 code requires 011 on the schema, because kudos reads `notification_preferences` through `getTimeZones` and `createNotification`.

## Steps — backend

### Phase A: migration first (no S1 code exists until step 3 completes)

1. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/012_people_hide_activity_kudos.sql`
```sql
-- 012_people_hide_activity_kudos.sql — People server slice S1 (reliability-overhaul Phase 4;
-- specs/features/people/SPEC.md §6; phase-4 DECISIONS D-P4–D-P7).
--
-- WHAT
--   PART 1  members.hide_activity — "Hide my activity" (D-P6/D-P7). boolean NOT NULL DEFAULT false: every existing member
--           stays visible. A constant default is a catalog-only change on PostgreSQL 11+ (no table rewrite).
--   PART 2  kudos — one row per giver per recipient per RECIPIENT-LOCAL day (D-P4/D-P5): UNIQUE (giver_id, recipient_id,
--           kudos_date) + CHECK giver_id <> recipient_id. program_id = the program it was given in (context + deep link
--           only; not part of the key). notification_id = its activity.kudos_received notification (SET NULL when the
--           notification is deleted — retention or undo).
--   PART 3  RLS on the `public` copy only; on `staging`: grants for rasifiters_staging + RLS off for every staging table.
--   PART 4  verification row.
--
-- SCHEMA-NEUTRAL (DESIGN_BOARD §8) — no schema names; every object lands in current_schema(). Run TWICE, STAGING FIRST:
--   SQL editor: first line `SET search_path TO staging;` + this whole file → Run; then the same with
--               `SET search_path TO public;`. If the editor offers "Run and enable RLS", run WITHOUT it.
--   psql:       psql "$SUPABASE_DATABASE_URL" -c "SET search_path TO staging" -f apps/backend/sql/012_people_hide_activity_kudos.sql
--               then the same with public — SESSION pooler or direct connection (port 5432) ONLY.
-- ORDER: run + verify on BOTH schemas BEFORE any People S1 code is committed. The backend's Member model reads
--   members.hide_activity on EVERY authenticated request (the auth middleware's member lookup) — a backend that has the
--   attribute without the column answers every call 503. The running backend ignores the new column, so running this
--   early is safe. SQL independent of 011 (either order); the S1 CODE requires 011 on the schema first (kudos reads the
--   recipient's time zone from notification_preferences and emits through createNotification).
-- IDEMPOTENT: IF NOT EXISTS everywhere; the RLS / GRANT block re-runs safely.
-- LOCK TIMEOUT: the ALTER on members takes a brief exclusive lock, capped at 5 s. On "canceling statement due to lock
--   timeout" nothing changed — wait a moment and re-run the file.
-- WHO RUNS IT: the USER — never Claude (CLAUDE.md DB-write policy). Nothing secret in here (the repo is public).

SET lock_timeout = '5s';

-- ===== PART 1 — Hide my activity ==================================================================================
ALTER TABLE members ADD COLUMN IF NOT EXISTS hide_activity boolean DEFAULT false NOT NULL;

-- ===== PART 2 — kudos =============================================================================================
CREATE TABLE IF NOT EXISTS kudos (
    id               uuid DEFAULT gen_random_uuid() NOT NULL,
    giver_id         uuid NOT NULL,
    recipient_id     uuid NOT NULL,
    program_id       uuid NOT NULL,
    kudos_date       date NOT NULL,
    notification_id  uuid,
    created_at       timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT kudos_pkey PRIMARY KEY (id),
    CONSTRAINT kudos_not_self_check CHECK (giver_id <> recipient_id),
    CONSTRAINT kudos_giver_recipient_day_key UNIQUE (giver_id, recipient_id, kudos_date),
    CONSTRAINT kudos_giver_id_fkey FOREIGN KEY (giver_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT kudos_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT kudos_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
    CONSTRAINT kudos_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL
);

-- The profile's count + "given today" reads (recipient first); the UNIQUE key already serves giver-first lookups.
CREATE INDEX IF NOT EXISTS idx_kudos_recipient_id_kudos_date ON kudos USING btree (recipient_id, kudos_date);
-- FK indexes: a program delete / the nightly notification retention never scans kudos.
CREATE INDEX IF NOT EXISTS idx_kudos_program_id ON kudos USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_kudos_notification_id ON kudos USING btree (notification_id);

-- ===== PART 3 — RLS (public) / grants + RLS off (staging) =========================================================
DO $$
DECLARE t text;
BEGIN
    IF current_schema() = 'public' THEN
        ALTER TABLE kudos ENABLE ROW LEVEL SECURITY;
    ELSIF current_schema() = 'staging' THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON kudos TO rasifiters_staging;
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
            EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', current_schema(), t);
        END LOOP;
    END IF;
END $$;

-- ===== PART 4 — verification (read-only; the SQL editor shows this last result) ===================================
SELECT current_schema()                                                          AS schema_name,          -- staging, then public
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'members' AND column_name = 'hide_activity'
           AND is_nullable = 'NO' AND column_default = 'false')                  AS hide_activity_column, -- 1
       (SELECT count(*) FROM members WHERE hide_activity)                        AS hidden_members,       -- 0 on the first run
       to_regclass('kudos') IS NOT NULL                                          AS kudos_table,          -- t
       (SELECT count(*) FROM pg_indexes
         WHERE schemaname = current_schema() AND tablename = 'kudos')            AS kudos_indexes,        -- 5
       (SELECT count(*) FROM pg_constraint
         WHERE conrelid = to_regclass('kudos') AND contype IN ('c', 'u', 'f'))   AS kudos_constraints,    -- 6
       (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('kudos'))    AS rls_on,               -- public t · staging f
       has_table_privilege('rasifiters_staging', to_regclass('kudos'), 'INSERT') AS staging_role_writes;  -- staging t · public f
```

2. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/README.md`. N-SRV has already added its 011 row and its count comment; this step edits on top of them.
   - (a) In the Files table, insert this row directly after the row that starts with ``| `011_``:
```
| `012_people_hide_activity_kudos.sql` | **Phase 4 People S1** ([`people`](../../../specs/features/people/SPEC.md) 0.1.0): `members.hide_activity boolean NOT NULL DEFAULT false` ("Hide my activity"; catalog-only add) + `kudos` (one row per giver → recipient per recipient-local day: `UNIQUE (giver_id, recipient_id, kudos_date)`, `CHECK (giver_id <> recipient_id)`; FKs → `members` / `programs` CASCADE, → `notifications` SET NULL; 3 indexes). Schema-neutral — run **staging first, then public**; RLS on the `public` copy only; staging grants + RLS off. Ends with a verification row (staging: `staging 1 0 t 5 6 f t`; public: `public 1 0 t 5 6 t f`). **Run on BOTH schemas BEFORE the People backend code is committed** — the `Member` model reads `hide_activity` on every authenticated request, so a backend without the column answers every call 503; the running backend ignores the column. SQL independent of 011; S1 code requires 011 on the schema first. |
```
   - (b) Step 5's verify block has a line containing `AS staging_tables`. Replace everything after its `-- ` comment marker with:
     `22 after 012 (14 + app_events + health_sync_samples + health_sync_state + push_deliveries + notification_preferences + notification_send_keys + notification_announcements + kudos); every later migration's tables add to it`

3. **STOP: the USER runs 012.**
   - Run it on `staging` first. The VERIFY row must read `staging | 1 | 0 | t | 5 | 6 | f | t`.
   - Then run it on `public`. The row must read `public | 1 | 0 | t | 5 | 6 | t | f`.
   - The user pastes both rows back.
   - Leave both files uncommitted; they go into the step-28 feat commit.
   - Step 4 starts only after both rows match.

### Phase B: code

4. **Gate G0, the seam check.** It is read-only and makes no DB connection.
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && grep -c -E 'require\("./services/notificationScheduler"\)|app\.use\("/api/member-recent", memberRecentRoutes\);' server.js && DATABASE_URL=postgres://check:check@127.0.0.1:5432/check SUPABASE_URL=https://x.supabase.co SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x node -e '
const v=require("./utils/memberVisibility");
console.log(Object.keys(v).join(","), v.loadViewer.length, v.canView.length, v.requireMemberView.length);
const p=require("./services/notificationPreferenceService"),lt=require("./utils/localTime"),t=require("./utils/notificationTemplates"),n=require("./utils/notifications");
console.log(typeof p.getTimeZones, typeof lt.localParts, typeof lt.dayLabel, typeof t.getContentProvider, typeof n.createNotification, "computeStreaks" in require("./services/memberAnalyticsService"));
const d=new Date("2026-10-13T23:30:00Z");console.log(JSON.stringify(lt.localParts("Not/AZone",d)), lt.localParts("UTC",d).date, lt.localParts("Australia/Sydney",d).date);
t.getContentProvider().render("activity.kudos_received",{first_name:"Liam",actor_first_name:"Zoe",day_label:"today"},"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa|bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb|2026-10-13").then((c)=>{console.log(JSON.stringify(c));process.exit(0);});'
```
   The output must be exactly:
```
2
loadViewer,hasProgramAccess,canView,redactHealth,redactMetricsRow,requireMemberView 2 3 2
function function function function function false
null 2026-10-13 2026-10-14
{"title":"You got kudos, Liam!","body":"Zoe gave you kudos for your workout today."}
```
   On any mismatch, STOP and report to the orchestrator. Common causes: N-SRV is not merged, or S0's names differ.

5. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/models/Member.js`. Insert directly after line 54, the `},` that closes the `auth_user_id` attribute:
```js
    hide_activity: {
        // people 0.1.0 / members D-C4 (phase-4 D-P6/D-P7, migration sql/012): "Hide my activity". The rule that reads it
        // lives in utils/memberVisibility.js only (loadViewer → hiddenMemberIds → canView(…, "workouts")).
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
```

6. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/models/Kudos.js`
```js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// kudos — one row per giver → recipient per recipient-local day (people SPEC §6; migration sql/012). Written only by
// services/kudosService.js, which requires this file directly. No associations — NOT registered in models/index.js
// (the PushDelivery / notifications N-SRV D2 pattern; FKs live in SQL).
const Kudos = sequelize.define("Kudos", {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    giver_id: { type: DataTypes.UUID, allowNull: false },
    recipient_id: { type: DataTypes.UUID, allowNull: false },
    program_id: { type: DataTypes.UUID, allowNull: false },
    kudos_date: { type: DataTypes.DATEONLY, allowNull: false },
    notification_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
    tableName: "kudos",
    timestamps: false,
    underscored: true
});

module.exports = Kudos;
```

7. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/memberVisibility.js`. **Replace the whole file.** The S0 semantics of `email`, `directory`, `roster` and `health` are kept exactly. The only change to them is the canonical id comparison.
```js
// utils/memberVisibility.js — the ONE rule for who may see which member's data.
// program-memberships D-C5 (0.3.0, Phase 4 S0 / People D-P8 a) + D-C6 (0.4.0, People S1 "Hide my activity").
// Every per-person read asks canView(viewer, targetMemberId, kind); the routes keep their own status codes + messages.
//
//   staff        = an ACTIVE program_memberships row with role "admin" or "logger"
//   global admin = members.global_role === "global_admin" — passes every kind
//
//   kind         who may see it (besides a global admin)
//   "email"      the member themselves                       (GET /api/members/:id — email and hide_activity)
//   "directory"  nobody (the rest get only their own row)    (GET /api/members)
//   "roster"     an ACTIVE member of the program             (GET /api/program-memberships/{members,details})
//   "health"     the member themselves, or program staff     (sleep / diet / steps — averages + daily rows)
//   "workouts"   the member themselves, staff, or an ACTIVE  (workouts, workout stats, kudos — every output in
//                co-member the target hasn't hidden from      specs/features/people/SPEC.md §5)
//
// People S1 (people 0.1.0, migration 012): loadViewer fills hiddenMemberIds with the program's members who turned on
// "Hide my activity" — one query, only for a plain ACTIVE member. Callers OMIT what "workouts" refuses, never redact
// or zero it: member-metrics rows and /analytics/summary top_performers entries are dropped, history / streaks /
// recent and the ?memberId analytics routes answer 403, People hides stats / recent workouts / kudos.
// Ids compare in canonical form (canonicalId): PostgreSQL reads upper case, braces or missing hyphens as the same
// uuid, so any non-canonical spelling is never "self" and never a visible co-member (fails closed).
const { Member, ProgramMembership } = require("../models");

const STAFF_ROLES = new Set(["admin", "logger"]);
const HEALTH_FIELDS = ["avg_sleep_hours", "avg_food_quality", "avg_steps"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACTIVITY_HIDDEN_MESSAGE = "This member keeps their activity private.";

/** The canonical (lowercase 8-4-4-4-12) form of an id, or null for anything else — an array included. */
const canonicalId = (id) => {
    if (typeof id !== "string") return null;
    const lower = id.toLowerCase();
    return UUID_RE.test(lower) ? lower : null;
};

/** The viewer's context for one program. One composite-PK lookup — none for a global admin, or when programId is
 *  missing / not a single string (a repeated ?programId is never a membership). programRole is the role on a row
 *  of ANY status (null = no row); isActiveMember / isStaff require status "active". hiddenMemberIds (People S1): the
 *  program's members — any membership status, so a member who left stays hidden in that program's history — whose
 *  members.hide_activity is true; one more query, only for a plain active member (staff and global admins see
 *  everyone; a non-member sees no co-member anyway). */
async function loadViewer(user, programId) {
    const viewer = {
        id: user?.id || null,
        isGlobalAdmin: user?.global_role === "global_admin",
        programRole: null,
        isActiveMember: false,
        isStaff: false,
        hiddenMemberIds: new Set()
    };
    if (viewer.isGlobalAdmin || !viewer.id || typeof programId !== "string" || !programId) return viewer;

    const membership = await ProgramMembership.findOne({
        where: { program_id: programId, member_id: viewer.id },
        attributes: ["role", "status"]
    });
    if (!membership) return viewer;

    viewer.programRole = membership.role;
    viewer.isActiveMember = membership.status === "active";
    viewer.isStaff = viewer.isActiveMember && STAFF_ROLES.has(membership.role);
    if (viewer.isActiveMember && !viewer.isStaff) {
        const hidden = await ProgramMembership.findAll({
            where: { program_id: programId },
            attributes: ["member_id"],
            include: [{ model: Member, attributes: [], where: { hide_activity: true } }]
        });
        viewer.hiddenMemberIds = new Set(hidden.map((row) => String(row.member_id).toLowerCase()));
    }
    return viewer;
}

/** May the viewer read this program at all? A global admin, or an ACTIVE member (any role). */
const hasProgramAccess = (viewer) => Boolean(viewer && (viewer.isGlobalAdmin || viewer.isActiveMember));

/** The single predicate. targetMemberId = whose data (null for the list kinds "directory" / "roster"). */
function canView(viewer, targetMemberId, kind) {
    if (!viewer) return false;
    if (viewer.isGlobalAdmin) return true;
    const target = canonicalId(targetMemberId);
    const isSelf = target !== null && target === canonicalId(viewer.id);
    switch (kind) {
        case "email": return isSelf;
        case "directory": return false;
        case "roster": return viewer.isActiveMember;
        case "health": return isSelf || viewer.isStaff;
        case "workouts":
            return isSelf || viewer.isStaff ||
                (viewer.isActiveMember && target !== null && !viewer.hiddenMemberIds.has(target));
        default:
            throw new Error(`memberVisibility: unknown kind "${kind}"`);
    }
}

/** Null a member-metrics row's sleep / diet / steps averages — same keys, same shape (every client types them
 *  nullable). */
function redactHealth(row) {
    for (const field of HEALTH_FIELDS) row[field] = null;
    return row;
}

/** Every per-kind redaction for one member-metrics row (row.member_id = the target), in place. Health only — rows
 *  "workouts" refuses are omitted by getMemberMetrics, never redacted (program-memberships D-C6). */
function redactMetricsRow(viewer, row) {
    if (!canView(viewer, row.member_id, "health")) redactHealth(row);
    return row;
}

/** Express guard for a ?memberId read. Must run after a middleware that sets req.viewer (analytics'
 *  requireProgramAccess). No programId or no memberId → pass (the service's native 400 / the program aggregate).
 *  A memberId that isn't one well-formed id → 400 invalid_request (D-C6). `code` (optional) rides on the 403. */
const requireMemberView = (kind, message, code) => (req, res, next) => {
    const { programId, memberId } = req.query;
    if (!programId || !memberId) return next();
    if (canonicalId(memberId) === null) {
        return res.status(400).json({ error: "memberId must be a valid id.", code: "invalid_request" });
    }
    if (canView(req.viewer, memberId, kind)) return next();
    return res.status(403).json(code ? { error: message, code } : { error: message });
};

module.exports = {
    loadViewer,
    hasProgramAccess,
    canView,
    canonicalId,
    redactHealth,
    redactMetricsRow,
    requireMemberView,
    ACTIVITY_HIDDEN_MESSAGE
};
```

8. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/memberAnalyticsService.js`
   - (a) Line 5 becomes:
     `const { loadViewer, hasProgramAccess, canView, redactMetricsRow, ACTIVITY_HIDDEN_MESSAGE } = require("../utils/memberVisibility");`
   - (b) Replace lines 9-11 (the `// D-C8 — the access rule…` comment through `…different shape + 403 message).`) with:
```js
// D-C8 — the access rule comes from utils/memberVisibility (global admin, or an ACTIVE membership — was the local
// ensureProgramAccess). D-C11 (0.7.0, People S1): the target must also pass canView(…, "workouts") — a co-member who
// turned on "Hide my activity" → 403 "This member keeps their activity private." for a plain viewer (self, staff and
// global admins always pass). getMemberMetrics keeps its own inline checks (different shape + 403 message).
```
   - (c) Replace the block `if (!canView(viewer, memberId, "workouts")) { throw new AppError(403, "Access denied. Active program membership required."); }` (old lines 20-22) with:
```js
    if (!canView(viewer, memberId, "workouts")) {
        throw new AppError(403, ACTIVITY_HIDDEN_MESSAGE, { code: "activity_hidden" });
    }
```
   - (d) Replace the line `    let result = Array.from(metricsMap.values());` (old :225) with:
```js
    // D-C11 (0.7.0, People S1): rows the viewer may not see — a co-member who turned on "Hide my activity" — are
    // OMITTED, never zeroed (iOS MemberMetricsDTO has non-optional Ints). Before search / filter / sort; `total` still
    // counts every active member, `filtered` counts the returned rows.
    let result = Array.from(metricsMap.values()).filter((row) => canView(viewer, row.member_id, "workouts"));
```
   - (e) In `module.exports` (old :429-434), add `computeStreaks` as the last key, after `getMemberRecentWorkouts`. Its semantics are unchanged.

9. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/analyticsService.js`
   - (a) After line 5, add `const { canView } = require("../utils/memberVisibility");`.
   - (b) Replace line 118, `async function getSummary(period, programId) {`, with:
```js
// analytics D-C10 (0.6.0, People S1): `viewer` = utils/memberVisibility loadViewer's result (the route passes
// req.viewer). top_performers drops members the viewer may not see under canView(…, "workouts"); every other field
// counts everyone. No viewer → no top performers (fails closed).
async function getSummary(period, programId, viewer) {
```
   - (c) Replace the line `        top_performers: topPerformersFormatted,` (old :253) with:
```js
        top_performers: topPerformersFormatted.filter((row) => canView(viewer, row.member_id, "workouts")),
```

10. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/analytics.js`
   - (a) Line 5 becomes:
     `const { loadViewer, hasProgramAccess, requireMemberView, ACTIVITY_HIDDEN_MESSAGE } = require("../utils/memberVisibility");`
   - (b) Replace lines 30-34 (the `// D-C9 (0.5.0…` comment and both `const require…View` lines) with:
```js
// D-C9 (0.5.0, Phase 4 S0 / People D-P8 a): another member's health (?memberId ≠ the viewer) only for staff (an
// ACTIVE program admin/logger) or a global admin. D-C10 (0.6.0, People S1) / analytics-v2 D-C5: the "workouts" guard
// refuses a co-member who turned on "Hide my activity" → 403 { error, code: "activity_hidden" } for a plain viewer.
// Both pass through when memberId is absent (program aggregate); a memberId that isn't one well-formed id → 400
// invalid_request (utils/memberVisibility requireMemberView).
const requireHealthView = requireMemberView("health", "You can only view your own health data.");
const requireWorkoutsView = requireMemberView("workouts", ACTIVITY_HIDDEN_MESSAGE, "activity_hidden");
```
   - (c) In the `/summary` handler, the call becomes:
```js
        const result = await analyticsService.getSummary(
            (req.query.period || "day").toLowerCase(),
            req.query.programId,
            req.viewer
        );
```
   - **No other route changes.** The five `/workouts/types` routes keep `requireWorkoutsView` as their only member guard.

11. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/memberService.js`. S0's email gating stays byte-for-byte. The file ends near 213 lines, which is accepted (verdict #3).
   - (a) Replace lines 26-27 with:
```js
        // exclude the migration-added auth_user_id so the response matches the legacy shape (D-S1), and people 0.1.0's
        // hide_activity (members D-C4 — never in the directory).
        attributes: { exclude: ["auth_user_id", "hide_activity"] }
```
   - (b) In `getMemberById`'s returned object, replace the line `        updated_at: member.updated_at` with:
```js
        updated_at: member.updated_at,
        // members D-C4 (0.5.0, People S1): "Hide my activity" under the email rule — self or a global admin only.
        ...(showEmail ? { hide_activity: member.hide_activity } : {})
```
   - (c) In `updateMember`:
     - The signature becomes `async function updateMember(memberId, { first_name, last_name, gender, hide_activity }, requester) {`.
     - Directly after the closing `}` of the existing `if (!isOwnProfile && !isGlobalAdmin) { … }` block, insert:
```js
        // members D-C4 (0.5.0, People S1): "Hide my activity" — the member's own switch only (never a global admin for
        // someone else), a strict JSON boolean; absent = unchanged (live binaries never send it).
        if (hide_activity !== undefined && (!isOwnProfile || typeof hide_activity !== "boolean")) {
            await transaction.rollback();
            throw isOwnProfile
                ? new AppError(400, "hide_activity must be true or false.")
                : new AppError(403, "You can only change your own activity visibility.");
        }
```
     - After `if (gender !== undefined) updateData.gender = gender;`, add `        if (hide_activity !== undefined) updateData.hide_activity = hide_activity;`.
     - In the returned object, replace `            last_name: member.last_name` with:
```js
            last_name: member.last_name,
            hide_activity: member.hide_activity
```

12. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/kudosService.js`
```js
// Kudos service — give / undo kudos (specs/features/people/SPEC.md §4.3; phase-4 D-P4, D-P5, D-P9).
// One kudos per giver per recipient per RECIPIENT-LOCAL day — UNIQUE (giver_id, recipient_id, kudos_date), sql/012.
// A count only (no text). Who may give: an ACTIVE member of the program (people D-C4); whose kudos the giver may see:
// canView(…, "workouts") (utils/memberVisibility). Everything notification-side goes through the Notifications
// server's C8 seam only (people D-C11): the recipient's zone (getTimeZones + localParts), the words
// (getContentProvider) and createNotification — category, preferences and delivery are its job (a null return = not
// created). Undo deletes the kudos and, while the recipient hasn't read it, its notification; it returns no count
// (people SPEC §5 row 13). Never require services/peopleService here (it requires this file).
const { UniqueConstraintError } = require("sequelize");
const { sequelize } = require("../config/database");
const { Member, Program, ProgramMembership, Notification, NotificationRecipient } = require("../models");
const Kudos = require("../models/Kudos");
const { AppError } = require("../utils/response");
const { createNotification } = require("../utils/notifications");
const { getContentProvider } = require("../utils/notificationTemplates");
const { localParts, dayLabel } = require("../utils/localTime");
const { getTimeZones } = require("./notificationPreferenceService");
const { loadViewer, canView, ACTIVITY_HIDDEN_MESSAGE } = require("../utils/memberVisibility");

const KUDOS_NOTIFICATION_TYPE = "activity.kudos_received";

// D-P5 day rule (people D-C4): the recipient's local calendar date; no stored zone (or one Intl rejects) → UTC.
const recipientLocalDate = async (id) =>
    (localParts((await getTimeZones([id])).get(id) || "UTC") || localParts("UTC")).date;

// people D-C4: kudos only between ACTIVE members of the program. loadViewer answers that for everyone but a global
// admin (it skips the lookup for them), so a global admin costs one composite-PK read here. Eligibility to give —
// not visibility (that is canView).
async function isActiveGiver(viewer, programId) {
    if (!viewer.isGlobalAdmin) return viewer.isActiveMember;
    const membership = await ProgramMembership.findOne({
        where: { program_id: programId, member_id: viewer.id, status: "active" },
        attributes: ["member_id"]
    });
    return Boolean(membership);
}

const kudosState = async (giverId, recipientId, kudosDate) => {
    const [count, mine] = await Promise.all([
        Kudos.count({ where: { recipient_id: recipientId } }),
        Kudos.count({ where: { giver_id: giverId, recipient_id: recipientId, kudos_date: kudosDate } })
    ]);
    return { count, given_today: mine > 0 };
};

// The profile's kudos block (peopleService adds can_give). Only called after canView(…, "workouts") passed.
const getKudosSummary = async ({ viewerId, recipientId }) =>
    kudosState(viewerId, recipientId, await recipientLocalDate(recipientId));

// Insert once; the notification rides the same transaction (createNotification defers SSE + push to commit). A
// concurrent duplicate loses on the UNIQUE key → the same outcome as "already given today".
const insertKudos = async ({ giverId, actorFirstName, recipient, programId, kudosDate }) => {
    try {
        await sequelize.transaction(async (transaction) => {
            const kudos = await Kudos.create({
                giver_id: giverId,
                recipient_id: recipient.id,
                program_id: programId,
                kudos_date: kudosDate
            }, { transaction });
            // notifications C8 / D-C27: the words come from the content provider (the KUDOS variants), never fixed text.
            const content = await getContentProvider().render(KUDOS_NOTIFICATION_TYPE, {
                first_name: recipient.first_name,
                actor_first_name: actorFirstName,
                day_label: dayLabel(kudosDate, kudosDate)
            }, `${recipient.id}|${giverId}|${kudosDate}`);
            const notification = await createNotification({
                type: KUDOS_NOTIFICATION_TYPE,
                programId,
                actorMemberId: giverId,
                title: content.title,
                body: content.body,
                recipientIds: [recipient.id],
                transaction
            });
            if (notification?.id) await kudos.update({ notification_id: notification.id }, { transaction });
        });
        return true;
    } catch (err) {
        if (err instanceof UniqueConstraintError) return false;
        throw err;
    }
};

// POST /api/people/:memberId/kudos — idempotent per recipient-local day → { created, kudos: { count, given_today } }.
async function giveKudos({ user, recipientId, programId }) {
    if (recipientId === user.id) {
        throw new AppError(400, "You can't give kudos to yourself.", { code: "kudos_self" });
    }
    const viewer = await loadViewer(user, programId);
    if (!(await isActiveGiver(viewer, programId))) {
        throw new AppError(403, "You're not a member of this program.", { code: "not_program_member" });
    }
    const [program, membership, giverRow] = await Promise.all([
        Program.findOne({ where: { id: programId, is_deleted: false }, attributes: ["id"] }),
        ProgramMembership.findOne({
            where: { program_id: programId, member_id: recipientId, status: "active" },
            attributes: ["program_id", "member_id"],
            include: [{ model: Member, attributes: ["id", "first_name", "hide_activity"] }]
        }),
        Member.findByPk(user.id, { attributes: ["first_name"] })
    ]);
    if (!program) throw new AppError(404, "This program no longer exists.", { code: "program_not_found" });
    if (!membership?.Member) {
        throw new AppError(404, "This person isn't in this program.", { code: "member_not_in_program" });
    }
    if (!canView(viewer, membership.member_id, "workouts")) {
        throw new AppError(403, ACTIVITY_HIDDEN_MESSAGE, { code: "activity_hidden" });
    }
    const kudosDate = await recipientLocalDate(membership.member_id);
    const existing = await Kudos.findOne({
        where: { giver_id: user.id, recipient_id: membership.member_id, kudos_date: kudosDate },
        attributes: ["id"]
    });
    const created = existing ? false : await insertKudos({
        giverId: user.id,
        actorFirstName: (giverRow?.first_name || "").trim() || user.username,
        recipient: membership.Member,
        programId,
        kudosDate
    });
    return { created, kudos: await kudosState(user.id, membership.member_id, kudosDate) };
}

// DELETE /api/people/:memberId/kudos — undo the caller's kudos for the recipient's current day; idempotent; ungated
// (it only ever removes the caller's own row). Returns ONLY the caller's own state — never the recipient's count, so a
// hidden or unrelated member's kudos can't be read through it. Its notification goes too while unread
// (acknowledged_at IS NULL = unread in the inbox); a read one stays. A push already delivered can't be recalled.
async function undoKudos({ user, recipientId }) {
    const kudosDate = await recipientLocalDate(recipientId);
    const removed = await sequelize.transaction(async (transaction) => {
        const kudos = await Kudos.findOne({
            where: { giver_id: user.id, recipient_id: recipientId, kudos_date: kudosDate },
            transaction
        });
        if (!kudos) return false;
        const notificationId = kudos.notification_id;
        await kudos.destroy({ transaction });
        if (notificationId) {
            const unread = await NotificationRecipient.count({
                where: { notification_id: notificationId, member_id: recipientId, acknowledged_at: null },
                transaction
            });
            // notification_recipients + push_deliveries rows go with it (ON DELETE CASCADE — sql/001, sql/010).
            if (unread > 0) await Notification.destroy({ where: { id: notificationId }, transaction });
        }
        return true;
    });
    return { given_today: false, removed };
}

module.exports = { giveKudos, undoKudos, getKudosSummary, isActiveGiver, KUDOS_NOTIFICATION_TYPE };
```

13. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/peopleService.js`
```js
// People service — the People list + a person's profile (specs/features/people/SPEC.md §3–§4; phase-4 D-P1–D-P3,
// D-P7, D-P10, D-P11). Every rule comes from utils/memberVisibility (program-memberships D-C5/D-C6): loadViewer +
// hasProgramAccess open the program; canView(…, "workouts") decides whose activity shows. This file never re-states a
// rule. Grouped queries, no N+1.
const { Op, fn, col } = require("sequelize");
const { Member, Program, ProgramMembership, ProgramWorkout, WorkoutLog } = require("../models");
const { AppError } = require("../utils/response");
const { loadViewer, hasProgramAccess, canView } = require("../utils/memberVisibility");
const { computeStreaks } = require("./memberAnalyticsService");
const { getKudosSummary, isActiveGiver } = require("./kudosService");

const RECENT_WORKOUTS_LIMIT = 10;
const MEMBER_ATTRS = ["id", "first_name", "last_name", "username"];

const todayUtc = () => new Date().toISOString().slice(0, 10);

// raw MAX(log_date) / grouped log_date may come back as 'YYYY-MM-DD' or a Date depending on the type parser.
const toDateString = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
};

// D-P10: initials only (no photos) — computed here once so web / iOS / Android show the same letters.
const initialsOf = (first, last) =>
    `${[...(first || "").trim()][0] || ""}${[...(last || "").trim()][0] || ""}`.toUpperCase() || "?";

// D-P11: staff = a global admin, or an ACTIVE program admin / logger.
const isStaffViewer = (viewer) => viewer.isGlobalAdmin || viewer.isStaff;

const personBase = (membership, viewer) => {
    const member = membership.Member;
    return {
        member_id: member.id,
        member_name: `${member.first_name || ""} ${member.last_name || ""}`.trim() || "Unknown",
        initials: initialsOf(member.first_name, member.last_name),
        username: member.username || "",
        program_role: membership.role,
        is_you: member.id === viewer.id
    };
};

// Shared prelude: the viewer may open this program (S0's hasProgramAccess — a global admin or an ACTIVE member),
// then the program exists.
async function openProgram(user, programId) {
    const viewer = await loadViewer(user, programId);
    if (!hasProgramAccess(viewer)) {
        throw new AppError(403, "You're not a member of this program.", { code: "not_program_member" });
    }
    const program = await Program.findOne({
        where: { id: programId, is_deleted: false },
        attributes: ["id", "start_date"]
    });
    if (!program) throw new AppError(404, "This program no longer exists.", { code: "program_not_found" });
    return { viewer, program };
}

// GET /api/people?programId — every ACTIVE member; the caller first, then first + last name A→Z.
async function listPeople({ user, programId }) {
    const { viewer } = await openProgram(user, programId);
    const memberships = await ProgramMembership.findAll({
        where: { program_id: programId, status: "active" },
        attributes: ["program_id", "member_id", "role"],
        include: [{ model: Member, attributes: MEMBER_ATTRS }],
        order: [[Member, "first_name", "ASC"], [Member, "last_name", "ASC"]]
    });
    const rows = memberships.filter((membership) => membership.Member);
    const visibleIds = rows.map((membership) => membership.member_id).filter((id) => canView(viewer, id, "workouts"));
    const lastRows = visibleIds.length ? await WorkoutLog.findAll({
        where: { program_id: programId, member_id: { [Op.in]: visibleIds } },
        attributes: ["member_id", [fn("MAX", col("log_date")), "last_active"]],
        group: ["member_id"],
        raw: true
    }) : [];
    const lastActive = new Map(lastRows.map((row) => [row.member_id, toDateString(row.last_active)]));
    const visible = new Set(visibleIds);
    const people = rows.map((membership) => ({
        ...personBase(membership, viewer),
        activity_visible: visible.has(membership.member_id),
        last_active: lastActive.get(membership.member_id) || null // hidden members are never queried
    }));
    people.sort((a, b) => Number(b.is_you) - Number(a.is_you)); // stable: "You" first, A→Z kept
    return {
        program_id: programId,
        viewer: { member_id: viewer.id, is_staff: isStaffViewer(viewer) },
        people
    };
}

// Same streak window + semantics as GET /api/member-streaks (program start → today UTC; people F1) so the profile and
// "Open full stats" agree. Active days this month = distinct log dates in the current UTC month.
const buildStats = (dates, programStart) => {
    const today = todayUtc();
    const start = programStart || "1970-01-01";
    const { current, longest } = computeStreaks(dates.filter((d) => d >= start && d <= today));
    const month = today.slice(0, 7);
    return {
        current_streak: current,
        longest_streak: longest,
        active_days_this_month: dates.filter((d) => d.startsWith(month)).length,
        last_active: dates.length ? dates.reduce((max, d) => (d > max ? d : max)) : null
    };
};

// GET /api/people/:memberId?programId — D-P3 workouts only. Hidden from this viewer → stats / recent / kudos null.
async function getPersonProfile({ user, programId, memberId }) {
    const { viewer, program } = await openProgram(user, programId);
    const membership = await ProgramMembership.findOne({
        where: { program_id: programId, member_id: memberId, status: "active" },
        attributes: ["program_id", "member_id", "role", "joined_at"],
        include: [{ model: Member, attributes: MEMBER_ATTRS }]
    });
    if (!membership?.Member) {
        throw new AppError(404, "This person isn't in this program.", { code: "member_not_in_program" });
    }
    const base = personBase(membership, viewer);
    const visible = canView(viewer, base.member_id, "workouts");
    const profile = {
        program_id: programId,
        ...base,
        joined_at: membership.joined_at,
        activity_visible: visible,
        can_open_full_stats: isStaffViewer(viewer), // D-P11
        stats: null,
        recent_workouts: null,
        kudos: null
    };
    if (!visible) return profile;

    const [dateRows, recentRows, kudos, canGive] = await Promise.all([
        WorkoutLog.findAll({
            where: { program_id: programId, member_id: base.member_id },
            attributes: ["log_date"],
            group: ["log_date"],
            raw: true
        }),
        WorkoutLog.findAll({
            where: { program_id: programId, member_id: base.member_id },
            attributes: ["log_date", "duration"],
            include: [{ model: ProgramWorkout, attributes: ["workout_name"] }],
            order: [["log_date", "DESC"], [ProgramWorkout, "workout_name", "ASC"]],
            limit: RECENT_WORKOUTS_LIMIT
        }),
        getKudosSummary({ viewerId: viewer.id, recipientId: base.member_id }),
        base.is_you ? false : isActiveGiver(viewer, programId)
    ]);
    profile.stats = buildStats(dateRows.map((row) => toDateString(row.log_date)).filter(Boolean), program.start_date);
    profile.recent_workouts = recentRows.map((w) => ({
        workout_type: w.ProgramWorkout?.workout_name || "",
        date: toDateString(w.log_date),
        duration_minutes: Number(w.duration || 0)
    }));
    profile.kudos = { ...kudos, can_give: canGive };
    return profile;
}

module.exports = { listPeople, getPersonProfile };
```

14. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/people.js`
```js
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

// people D-C8 — process memory; a deploy resets both (observability F3).
// Per member: 60 kudos writes (POST + DELETE) / 10 min — abuse protection (the health-sync D-C12 shape).
const limitKudosWrites = rateLimit({ windowMs: 10 * 60 * 1000, max: 60, keyFn: (req) => req.user.id });
// Per giver → recipient: 6 writes / 24 h — bounds give/undo churn to at most 3 kudos notifications per pair per day.
const limitKudosPair = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 6,
    keyFn: (req) => `${req.user.id}:${String(req.params.memberId).toLowerCase()}`
});

const requireId = (value, field) => {
    const id = canonicalId(value);
    if (!id) throw new AppError(400, `${field} must be a valid id.`, { code: "invalid_request" });
    return id;
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

router.post("/:memberId/kudos", authenticateToken, limitKudosWrites, limitKudosPair,
    handle("kudos give", "Failed to send kudos.", async (req) => {
        const result = await kudosService.giveKudos({
            user: req.user,
            recipientId: requireId(req.params.memberId, "memberId"),
            programId: requireId(req.body?.program_id, "program_id")
        });
        return { status: result.created ? 201 : 200, body: { kudos: result.kudos } };
    }));

router.delete("/:memberId/kudos", authenticateToken, limitKudosWrites, limitKudosPair,
    handle("kudos undo", "Failed to undo kudos.", async (req) => ({
        body: {
            kudos: await kudosService.undoKudos({
                user: req.user,
                recipientId: requireId(req.params.memberId, "memberId")
            })
        }
    })));

module.exports = router;
```

15. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/server.js`. This file is shared with N-SRV, which lands first. Add lines only, using text anchors:
   - (a) Directly after the line `const { startNotificationScheduler, stopNotificationScheduler } = require("./services/notificationScheduler");`, insert `const peopleRoutes = require("./routes/people");`.
   - (b) Directly after `app.use("/api/member-recent", memberRecentRoutes);`, insert `app.use("/api/people", peopleRoutes); // people 0.1.0 (phase-4 S1)`.

16. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/CONTEXT.md`. This goes in the docs commit.
   - (a) Under `## Data`, insert directly after the last bullet that starts with `- **Added (reliability overhaul` (and before `- Migrations: `):
     `- **Added (reliability overhaul Phase 4, People S1):** \`members.hide_activity\` ("Hide my activity", default false) + \`kudos\` (one per giver → recipient per recipient-local day; FK cascades; \`notification_id\` SET NULL) — migration \`sql/012\`; routes \`/api/people\` (list · profile · kudos give/undo); the rule stays the shared \`utils/memberVisibility.js\` "workouts" kind ([\`people\`](../../specs/features/people/SPEC.md), [\`program-memberships\`](../../specs/features/program-memberships/SPEC.md) D-C6).`
   - (b) In `## Endpoints`: replace `~13 route groups (` with `~14 route groups (`, and replace `member-analytics). Documented` with `member-analytics, people). Documented`.
   - (c) In `## Status`: replace `All ~13 route groups` with `All ~14 route groups`.

## Steps — docs (they land in git-version's single docs commit; `<date>` = `date +%F` on the day of that commit)

17. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/people/SPEC.md`
````markdown
# Feature: `people` — program People list, person profiles, kudos and "Hide my activity"

> **Status:** 🏗️ built (backend, phase-4 S1) · **Version:** 0.1.0 · **Apps (`consumed_by`):** none yet — web, iOS and Android join with the store release (Phase 4 Track C; NP-U5)
> **Provenance:** **NET-NEW.** Decisions: [`phase-4/DECISIONS.md`](../../initiatives/reliability-overhaul/phase-4/DECISIONS.md) (D-P1–D-P11); amendments [`phase-4-np-amendments.md`](../../initiatives/reliability-overhaul/plans/phase-4-np-amendments.md) §2 (S1-1–S1-5); board [`DESIGN_BOARD.md`](../../initiatives/reliability-overhaul/DESIGN_BOARD.md) §10.
> **Depends on:** [`auth`](../auth/SPEC.md) · [`members`](../members/SPEC.md) (`members.hide_activity`) · [`programs`](../programs/SPEC.md) · [`program-memberships`](../program-memberships/SPEC.md) (`utils/memberVisibility.js`, D-C5/D-C6) · [`program-workouts`](../program-workouts/SPEC.md) · [`workout-logs`](../workout-logs/SPEC.md) · [`member-analytics`](../member-analytics/SPEC.md) (`computeStreaks`) · [`notifications`](../notifications/SPEC.md) (C8: `getTimeZones`, `localParts`/`dayLabel`, `getContentProvider`, `createNotification`) · [`observability`](../observability/SPEC.md) (`utils/rateLimit.js`).

## 1. What it is
The program's people:
- A list of the current program's active members, for every role, with the caller first ("You") and initials only.
- A person's profile, which shows workouts only: streaks, active days this month, the last 10 workouts and last active.
- Kudos: one per giver per recipient per recipient-local day, undoable, a count only.
- "Hide my activity": one switch per member that hides their activity from plain co-members.

## 2. Why it exists
The Members tab is a one-person dashboard. People adds a social layer that is limited to your own programs and puts privacy first (board §10, D-14). S0 shipped the one visibility rule. S1 fills its "Hide my activity" hook and applies it to every per-person read (§5), so the switch can't lie.

## 3. The contract
<Copy the plan's "API CONTRACT" section here verbatim (§A–§F).>

## 4. Server behavior
4.1 **Activity rule.**
- Activity means a member's workouts, workout stats (streaks, active days, last active) and kudos.
- It is decided ONLY by `utils/memberVisibility.js` `canView(viewer, memberId, "workouts")` (program-memberships D-C5/D-C6):
  - self: always;
  - a global admin: always;
  - an ACTIVE admin or logger of that program: always;
  - an ACTIVE co-member: only while the target isn't in `viewer.hiddenMemberIds`.
- `loadViewer` fills `hiddenMemberIds` from `members.hide_activity` with one query, for plain active members only. It covers every membership status in the program.
- Ids compare canonically (`canonicalId`); any other spelling fails closed. Without a viewer, nothing is visible.
- Callers OMIT what it refuses (§5). Program aggregates count hidden members on purpose.

4.2 **List and profile.**
- Access uses `loadViewer` + `hasProgramAccess` (a global admin, or an ACTIVE member).
- Active memberships only. Order: caller first, then first name A→Z, then last name A→Z.
- `initials` = the first letter of the first name plus the first letter of the last name, uppercased; "?" if both are empty.
- `last_active` = the latest workout `log_date` in this program. Hidden members are never queried.
- Profile streaks use the `/member-streaks` window (program start → today UTC) and the same semantics (F1).
- `active_days_this_month` = distinct log dates in the current UTC month.
- `recent_workouts` = the latest 10, ordered by date descending, then type A→Z.
- `can_open_full_stats` = staff (a global admin, or an ACTIVE admin/logger).

4.3 **Kudos.**
- **Day:** the recipient's local calendar date, `localParts((await getTimeZones([id])).get(id) || "UTC")` (notifications C8). UTC is used when the zone is absent or invalid.
- **Key:** UNIQUE (giver, recipient, day). Never to yourself.
- **Who:** the giver must be an ACTIVE member of `program_id` (`isActiveGiver`; a global admin only where they are one), and the recipient an ACTIVE member. A plain giver can't give to a hidden member (403 `activity_hidden`).
- **Give:** idempotent (201 new / 200 already). A new kudos renders its title and body through `getContentProvider().render("activity.kudos_received", { first_name, actor_first_name, day_label }, "<recipient>|<giver>|<date>")` and calls `createNotification` inside the insert transaction.
- **Undo:** deletes today's row, plus its notification while the recipient hasn't read it. It is idempotent and ungated, and returns only `{given_today, removed}`.
- **Count:** all-time received, across all programs. It is shown only where the recipient's activity is visible to the viewer.

## 5. Route checklist (every per-person output) + verification
<Copy the plan's "ROUTE CHECKLIST" section here verbatim, including the GET inventory.>

## 6. Data / schema — `apps/backend/sql/012_people_hide_activity_kudos.sql`
- `members.hide_activity boolean NOT NULL DEFAULT false`.
- `kudos (id uuid PK, giver_id → members CASCADE, recipient_id → members CASCADE, program_id → programs CASCADE, kudos_date date, notification_id → notifications SET NULL, created_at)`, with `CHECK (giver_id <> recipient_id)` and `UNIQUE (giver_id, recipient_id, kudos_date)`.
- Indexes: (recipient_id, kudos_date), (program_id), (notification_id).
- RLS on the public copy only.
- Model `models/Kudos.js` has no associations and isn't registered in `models/index.js`.

## 7. Flags / env
No env vars. The kudos write limits are constants in `routes/people.js`:
- 60 per member per 10 min;
- 6 per giver→recipient per 24 h.

## 8. Rollout + live binaries
- **Order:** N-SRV live (011 on staging + public) → 012 on staging + public → S1 backend (staging branch, then `main`) → clients together with the store release (NP-U5 / U-3; this overrides DECISIONS "web ships as each part is reviewed" for People).
- **Live binaries:** iOS 1.4.2 (56) / 1.5.0 (58) and Android 1.0.0 (4) / 1.1.0 (5).
  - They never call `/api/people`.
  - Plain-member apps request only their own `memberId`, and their own row is never omitted.
  - Staff are never filtered.
  - `GET` and `PUT /members/:id` changes are additive keys.
- **Kudos notifications:** a push banner only, with no pop-up. They never reach `/unacknowledged` or a plain stream (notifications D-C20). Android installs without the inbox receive them on `rasi_default`.

## 9. Decisions made
| ID | Decision |
|----|----------|
| **D-C1** | Scope (S1, backend): `/api/people` (list, profile, kudos give/undo), `members.hide_activity`, `kudos`, and S0's visibility module filled for "Hide my activity" (program-memberships D-C6) and applied to every per-person read (§5). Clients join `consumed_by` with Track C. |
| **D-C2** | One rule: `canView(viewer, id, "workouts")` in `utils/memberVisibility.js`. There is no People-local rule. Hidden rows are omitted, never zeroed or redacted. Aggregates count everyone. `hiddenMemberIds` covers every membership status (a member who left stays hidden in that program's history). Ids are canonical; any other spelling fails closed. Any later output that names another member's activity must use this rule and add a §5 row. |
| **D-C3** | "Hide my activity" is one switch per member covering all programs, default off. Only the member sets it (`PUT /members/:id`, own profile; never a global admin for someone else). `GET /members/:id` shows it under the `email` rule (self or a global admin). |
| **D-C4** | Kudos day = the recipient's local day (§4.3). One per giver → recipient per day, never to self. The giver and recipient must both be ACTIVE members of `program_id`; a global admin gives only where they are one (`isActiveGiver`, eligibility, not visibility). `program_id` is context and not part of the key. |
| **D-C5** | Give is idempotent and emits `activity.kudos_received` inside the insert transaction **through notifications C8**: the content provider renders title and body (the KUDOS variants; seed `<recipient>|<giver>|<date>`), then `createNotification`. There is no fixed text. A `null` return (Activity off) leaves `notification_id` null. |
| **D-C6** | Undo deletes the kudos and its notification while it is unread. It is idempotent and ungated, and returns `{given_today, removed}` only (no count — a count would bypass the rule). |
| **D-C7** | Kudos `count` = all-time received across programs, shown only where activity is visible. `given_today` = the viewer's kudos for the recipient's current day. `can_give` = not self and `isActiveGiver`. |
| **D-C8** | Rate limits, in process memory: 60 kudos writes (POST + DELETE) per member per 10 min, plus 6 per giver→recipient per 24 h (at most 3 kudos notifications per pair per day). Reads are not limited. |
| **D-C9** | Initials are computed server-side for parity (D-P10). The profile shows workouts only (D-P3). `can_open_full_stats` = staff (D-P11). No photos and no feed. |
| **D-C10** | Not built: person-to-person blocking (D-P9); membership editing from a profile on the server (D-P11 stays global-admin only); any streak semantic change (F1); an activity feed. |
| **D-C11** | Seams: S0's module (`loadViewer`, `hasProgramAccess`, `canView`, `canonicalId`, `ACTIVITY_HIDDEN_MESSAGE`) and notifications **C8 only**: `getTimeZones` (`services/notificationPreferenceService.js`), `localParts`/`dayLabel` (`utils/localTime.js`), `getContentProvider` (`utils/notificationTemplates.js`) and `createNotification`. `utils/notifications.js` is unchanged by People. |
| **D-C12** | Disclosure of synced Apple Health / Health Connect workouts to co-members follows U-1 (b) (NP-U5): policy text, purpose string and store answers, plus a one-time "Who can see your activity" notice ([Keep visible] / [Hide my activity]) in every People client before it first shows other people, and once after the update on phones that already sync. The "seen" flag is **per member**; it is skipped when the member is already hidden and counts as seen only once the choice landed (R10). |

## 10. Flagged characteristics
| ID | Characteristic |
|----|----------------|
| **F1** | The current streak doesn't reset when today is missed (`computeStreaks`, unchanged; undecided), so co-members can see a stale streak. It also differs from the reminder and digest streak (notifications F14: cross-program, resets after a skipped day). |
| **F2** | Re-giving after an undo on the same day notifies again, capped by the pair limit (at most 3 per pair per 24 h). |
| **F3** | Live binaries get `activity.kudos_received` as a push banner only, with no pop-up (D-C20). |
| **F4** | `GET /analytics/summary` `top_performers` can hold fewer than 5 rows for plain viewers. No client renders it. |
| **F5** | An undo can't recall a push that was already delivered, nor the iOS badge it set. If the day rolled over (or the recipient's zone changed) before the undo, the earlier day's kudos stays (`removed:false`). |

## 11. Changelog
| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | <date> | Initial SPEC + backend S1 (phase-4): `/api/people` (list · profile · kudos give/undo), `members.hide_activity`, `kudos` (sql/012), "Hide my activity" through S0's `canView("workouts")` (program-memberships D-C6) + the route checklist (§5); kudos content through notifications C8. |
````

18. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/members/SPEC.md`
   - Header `**Version:** 0.4.0` → `**Version:** 0.5.0`.
   - §3: in the line ``- **`GET /:id`** (`memberService.js`): …``, append after `F6 holds).` the text ` People 0.1.0: plus \`hide_activity\` (boolean) under the same rule as \`email\` (self or a global admin); the key is absent otherwise (D-C4).`
   - §3: replace the `PUT /:id` response bullet's text `first_name, last_name }\`.` with `first_name, last_name, hide_activity }\`. Accepts \`hide_activity\` (D-C4).`
   - §5, the `members` bullet: after `` `auth_user_id uuid UNIQUE → auth.users(id)` ``, add ``, and `hide_activity boolean NOT NULL DEFAULT false` (migration `sql/012`, D-C4)``.
   - §9: append this row after D-C3:
     `| **D-C4** | **"Hide my activity" (0.5.0, people 0.1.0 / phase-4 D-P6–D-P7; deliberate, additive).** \`members.hide_activity\` (sql/012). \`PUT /:id\` accepts it — a strict JSON boolean, for the member's OWN profile only (a global admin can't set it for someone else): non-boolean → \`400 { error: "hide_activity must be true or false." }\`; another member's profile → \`403 { error: "You can only change your own activity visibility." }\` (the existing 403 "You can only update your own profile." still comes first for non-admins); the response adds \`hide_activity\`. \`GET /:id\` returns it under the \`email\` rule (\`canView(…, "email")\`: self or global admin); \`GET /\` excludes it (shape unchanged). What it hides: [people SPEC](../people/SPEC.md) §4–§5. \`memberService.js\` is ~213 lines (accepted). Live binaries never send it and ignore the key. | people D-C3; program-memberships D-C6; phase-4 NP amendments S1-1. |`
   - §11: new top row:
     `| 0.5.0 | <date> | **D-C4 — "Hide my activity" (People S1, people 0.1.0).** \`members.hide_activity\` (sql/012); \`PUT /:id\` sets it (own profile only, strict boolean) and echoes it; \`GET /:id\` returns it under the email rule; \`GET /\` excludes it. **MINOR**; additive; backend-only. |`

19. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/member-analytics/SPEC.md`
   - Header `**Version:** 0.6.0` → `0.7.0`.
   - §9 D-C8: after `always true in S0 and the People S1 "Hide my activity" hook`, insert ` *(superseded at 0.7.0 by D-C11)*`.
   - §9: append this row after D-C10:
     `| **D-C11** | **Hide my activity (0.7.0, people 0.1.0; deliberate).** \`getMemberMetrics\` OMITS rows \`canView(viewer, row.member_id, "workouts")\` refuses — never zeroed (iOS \`MemberMetricsDTO\` Ints are non-optional): \`total\` still counts every active member, \`filtered\` the returned rows; applied before search / filter / sort. \`assertMemberAccess\` (history / streaks / recent) → \`403 { error: "This member keeps their activity private." }\` for a hidden target and a plain co-member (the route files echo only \`error\`). Self, staff (ACTIVE admin/logger) and global admins unaffected. \`computeStreaks\` is exported (people reuses it; semantics unchanged). The rule: program-memberships D-C6. | Phase 4 NP amendments S1-1; people D-C2. |`
   - §11: new top row: `| 0.7.0 | <date> | **D-C11 — Hide my activity (People S1).** /member-metrics omits rows hidden from the viewer (total unchanged, filtered recomputed); history / streaks / recent → 403 "This member keeps their activity private."; \`computeStreaks\` exported. **MINOR**; backend-only; live binaries read only their own row. |`

20. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/analytics/SPEC.md`
   - Header `**Version:** 0.5.0` → `0.6.0`.
   - §9 D-C9: after `which always passes in S0 (People S1 hook)`, insert ` *(superseded at 0.6.0 by D-C10)*`.
   - §9: append this row after D-C9:
     `| **D-C10** | **Hide my activity (0.6.0, people 0.1.0; deliberate).** \`getSummary(period, programId, viewer)\` — the route passes \`req.viewer\` (set by \`requireProgramAccess\`); \`top_performers\` drops entries \`canView(viewer, member_id, "workouts")\` refuses (may hold fewer than 5; no client renders it); every other field counts everyone; no viewer → empty list (fails closed). \`/workouts/types\` with \`memberId\`: \`requireMemberView("workouts", "This member keeps their activity private.", "activity_hidden")\` → \`403 { error, code: "activity_hidden" }\` for a hidden member viewed by a plain co-member. Both member guards (also \`/health/timeline\`, \`/health/steps\`) now answer \`400 { error: "memberId must be a valid id.", code: "invalid_request" }\` for a memberId that isn't one well-formed id (was a 500, or a pass for a repeated param); ids compare case-insensitively. The rule: program-memberships D-C6. | Phase 4 NP amendments S1-1; people D-C2. |`
   - §11: new top row: `| 0.6.0 | <date> | **D-C10 — Hide my activity (People S1).** /summary \`top_performers\` filtered by the viewer; /workouts/types?memberId → 403 \`activity_hidden\` for a hidden member; malformed memberId → 400 \`invalid_request\` on the member-guarded routes. **MINOR**; backend-only. |`

21. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/analytics-v2/SPEC.md`
   - Header `**Version:** 0.2.1` → `0.3.0`.
   - The header blockquote line `> **D-C4** (0.2.1, Phase 4 S0): … it is the People S1 hook.`: append ` *(superseded at 0.3.0 by D-C5.)*`.
   - §9 D-C4: append ` *(superseded at 0.3.0 by D-C5)*` to its Decision cell.
   - §9: append this row after D-C4:
     `| **D-C5** | **Hide my activity (0.3.0, people 0.1.0; deliberate).** The 4 \`/workouts/types/{total,most-popular,longest-duration,highest-participation}\` routes keep \`requireWorkoutsView\` as their only member guard, now \`requireMemberView("workouts", "This member keeps their activity private.", "activity_hidden")\`: a hidden member viewed by a plain co-member → \`403 { error, code: "activity_hidden" }\`; a memberId that isn't one well-formed id → \`400 invalid_request\`. \`/participation/mtd\` and memberId-less calls unchanged. | analytics D-C10; program-memberships D-C6. |`
   - §11: new top row: `| 0.3.0 | <date> | **D-C5 — Hide my activity (People S1)** on the 4 \`/workouts/types/*\` routes (403 \`activity_hidden\`, 400 \`invalid_request\`). **MINOR**; backend-only. |`

22. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/notifications/SPEC.md`
   - Header `**Version:** 0.6.0` → `0.6.1`.
   - §9: append this row after D-C28:
     `| **D-C29** | **New emitter — \`activity.kudos_received\` (0.6.1, people 0.1.0).** \`services/kudosService.js\` emits it inside the kudos insert transaction through **C8 only**: title + body from \`getContentProvider().render("activity.kudos_received", { first_name, actor_first_name, day_label }, "<recipient>|<giver>|<date>")\` (the KUDOS variants — not fixed text), then \`createNotification({ type, programId, actorMemberId: giver, title, body, recipientIds: [recipient], transaction })\`; the day = \`localParts(getTimeZones(...) || "UTC")\`. Category activity, target inbox: delivered via \`GET /inbox\`, the \`?inbox=1\` stream and push (C5 keys incl. \`category\` / \`target\`), never on \`/unacknowledged\` or a plain stream (D-C20); Activity off → not created (\`kudos.notification_id\` null). Undo deletes it while the recipient's row is unread. \`utils/notifications.js\` unchanged. | people D-C5/D-C6/D-C11; phase-4 NP amendments S1-3/S1-4. |`
   - §10 F14 row: append ` The People profile streak is per program and never resets (people F1).`
   - §11: new top row: `| 0.6.1 | <date> | **D-C29 — the kudos emitter (People S1)** documented: C8 content + zone, delivery per D-C20/C5, undo while unread. No code change in this feature. **PATCH**. |`

23. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/program-memberships/SPEC.md` (added to the brief by verdict #2)
   - Header `**Version:** 0.3.0` → `0.4.0`.
   - §9 D-C5: wrap the sentence that starts `**People S1 hook:**` and ends `that service changes too.` in `~~…~~` and append ` *(superseded at 0.4.0 by D-C6: rows are omitted, not redacted)*`.
   - §9: append this row after D-C5:
     `| **D-C6** | **People S1 fills the S0 hook (0.4.0, people 0.1.0; deliberate).** \`loadViewer\` fills \`hiddenMemberIds\` with ONE query — the program's members (any membership status, so a member who left stays hidden in that program's history) whose \`members.hide_activity\` is true — only for a plain ACTIVE member (skipped for staff and global admins). \`canView\` compares ids in canonical form via the new export \`canonicalId\` (lowercase 8-4-4-4-12; anything else, arrays included, is never "self" and never a visible co-member — PostgreSQL reads upper case / braces / missing hyphens as the same uuid). \`requireMemberView(kind, message, code?)\`: optional \`code\` on the 403; a memberId that isn't one well-formed id → \`400 { error: "memberId must be a valid id.", code: "invalid_request" }\`. New export \`ACTIVITY_HIDDEN_MESSAGE\` ("This member keeps their activity private."). Callers OMIT what \`"workouts"\` refuses: member-analytics D-C11, analytics D-C10, analytics-v2 D-C5, people D-C2; \`redactMetricsRow\` stays health-only. Cost: +1 indexed query per plain-member read that calls \`loadViewer\` with a \`programId\`. Dependents FYI (backward-compatible): daily-health-logs (an upper-case self id now passes "health"). | Phase 4 NP amendments S1-1; P-SRV verdict #2. |`
   - §11: new top row: `| 0.4.0 | <date> | **D-C6 — "Hide my activity" fills \`hiddenMemberIds\`; canonical id comparison (\`canonicalId\`); \`requireMemberView\` optional \`code\` + 400 on a malformed memberId; \`ACTIVITY_HIDDEN_MESSAGE\`.** D-C5's redaction sentence superseded. **MINOR** (owned interface); dependents members 0.5.0, member-analytics 0.7.0, analytics 0.6.0, analytics-v2 0.3.0 bumped in the same change; daily-health-logs FYI. Backend-only. |`

24. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json` + `REGISTRY.md`
   - (a) **`registry.json`.** Inside `"features"`, directly after the `"health-sync": { … }` entry (add a comma after its closing brace), add:
```json
    "people": {
      "version": "0.1.0",
      "spec": "specs/features/people/SPEC.md",
      "status": "built",
      "consumed_by": [],
      "depends_on": ["auth", "members", "programs", "program-memberships", "program-workouts", "workout-logs", "member-analytics", "notifications", "observability"],
      "reference_impl": {
        "app": "backend",
        "paths": ["routes/people.js", "services/peopleService.js", "services/kudosService.js", "models/Kudos.js", "sql/012_people_hide_activity_kudos.sql", "server.js"]
      }
    }
```
     Then set the versions: members `0.5.0`, member-analytics `0.7.0`, analytics `0.6.0`, analytics-v2 `0.3.0`, program-memberships `0.4.0`, notifications `0.6.1`. Add **no** `"people"` to any other feature's `depends_on`.
   - (b) **`REGISTRY.md`.** Append after the `health-sync` row:
     ``| `people` | 0.1.0 | 🏗️ | — (backend only until Track C) | `backend` (`routes/people.js`, `services/{peopleService,kudosService}.js`, `models/Kudos.js`, `sql/012`, `server.js` [mount]) | [people/SPEC.md](people/SPEC.md) |``
     Then bump the Version cells of the six touched rows.
   - (c) **Status flip.** After the prod deploy is verified, flip `people` to `deployed` / 🚀 with no version bump.

## Steps — web
None in S1. Web People (Pass B) builds against the API CONTRACT after the E4 DTO diff. The privacy-page text is in "Privacy" below.

## Steps — ios
None in S1. iOS People builds against the API CONTRACT after the §F DTO diff.

## Steps — android
None in S1. Android People builds against the API CONTRACT after gate G-P.

## Endgame

25. **Compile, boot and coverage checks.** The implementer runs these on the backend only. There is no web build, gradlew or ⌘B, because no client file changes. All live and visual testing is the user's.
   - (a) **Syntax:**
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && for f in server.js routes/people.js routes/analytics.js services/peopleService.js services/kudosService.js services/memberAnalyticsService.js services/analyticsService.js services/memberService.js utils/memberVisibility.js models/Kudos.js models/Member.js; do node --check "$f" || echo "FAIL $f"; done
```
   - (b) **Boot check** (loads modules only; no server, no DB connection):
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && DATABASE_URL=postgres://check:check@127.0.0.1:5432/check SUPABASE_URL=https://x.supabase.co SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x node -e '
const show=(r)=>{for(const l of r.stack)if(l.route)console.log(`${Object.keys(l.route.methods)} ${l.route.path} ${l.route.stack.map(s=>s.name).join(",")}`);};
show(require("./routes/people"));
const {v1Router,v2Router}=require("./routes/analytics");
for(const l of [...v1Router.stack,...v2Router.stack])if(l.route&&/types|summary|health/.test(l.route.path))console.log(`${l.route.path} ${l.route.stack.map(s=>s.name).join(",")}`);
const v=require("./utils/memberVisibility");console.log(Object.keys(v).join(","));
const H="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",P="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",C="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const plain={id:P,isGlobalAdmin:false,isActiveMember:true,isStaff:false,hiddenMemberIds:new Set([H])};
console.log([v.canView(plain,H,"workouts"),v.canView(plain,H.toUpperCase(),"workouts"),v.canView(plain,H.replace(/-/g,""),"workouts"),v.canView(plain,[H],"workouts"),v.canView(plain,P.toUpperCase(),"workouts"),v.canView({...plain,hiddenMemberIds:new Set([P])},P,"workouts"),v.canView({...plain,isStaff:true},H,"workouts"),v.canView({id:P,isGlobalAdmin:true,hiddenMemberIds:new Set()},H,"workouts"),v.canView(undefined,H,"workouts"),v.canView(plain,C,"workouts")].join(","));
const run=(mw,q,viewer)=>{let out="next";const res={status:(s)=>({json:(b)=>{out=`${s} ${b.code||"-"}`;}})};mw({query:q,viewer},res,()=>{});return out;};
const g=v.requireMemberView("workouts",v.ACTIVITY_HIDDEN_MESSAGE,"activity_hidden");
console.log([run(g,{programId:"t",memberId:H},plain),run(g,{programId:"t",memberId:"nope"},plain),run(g,{programId:"t",memberId:[H,P]},plain),run(g,{programId:"t"},plain),run(g,{programId:"t",memberId:P},plain),run(v.requireMemberView("health","x"),{programId:"t",memberId:H},plain)].join(","));
console.log(typeof require("./services/memberAnalyticsService").computeStreaks);
console.log(Object.keys(require("./services/kudosService")).join(","));
console.log(Object.keys(require("./services/peopleService")).join(","));
console.log(Object.keys(require("./models/Kudos").rawAttributes).join(","),"hide_activity" in require("./models").Member.rawAttributes);
const t=require("./utils/notificationTemplates"),lt=require("./utils/localTime");
t.getContentProvider().render("activity.kudos_received",{first_name:"Liam",actor_first_name:"Zoe",day_label:lt.dayLabel("2026-10-13","2026-10-13")},`${H}|${P}|2026-10-13`).then((c)=>{console.log(JSON.stringify(c));process.exit(0);});'
```
     The output must be exactly these 20 lines:
```
get / authenticateToken,<anonymous>
get /:memberId authenticateToken,<anonymous>
post /:memberId/kudos authenticateToken,<anonymous>,<anonymous>,<anonymous>
delete /:memberId/kudos authenticateToken,<anonymous>,<anonymous>,<anonymous>
/summary authenticateToken,requireProgramAccess,<anonymous>
/health/timeline authenticateToken,requireProgramAccess,<anonymous>,<anonymous>
/health/steps authenticateToken,requireProgramAccess,<anonymous>,<anonymous>
/workouts/types authenticateToken,requireProgramAccess,<anonymous>,<anonymous>
/workouts/types/total authenticateToken,requireProgramAccess,<anonymous>,<anonymous>
/workouts/types/most-popular authenticateToken,requireProgramAccess,<anonymous>,<anonymous>
/workouts/types/longest-duration authenticateToken,requireProgramAccess,<anonymous>,<anonymous>
/workouts/types/highest-participation authenticateToken,requireProgramAccess,<anonymous>,<anonymous>
loadViewer,hasProgramAccess,canView,canonicalId,redactHealth,redactMetricsRow,requireMemberView,ACTIVITY_HIDDEN_MESSAGE
false,false,false,false,true,true,true,true,false,true
403 activity_hidden,400 invalid_request,400 invalid_request,next,next,403 -
function
giveKudos,undoKudos,getKudosSummary,isActiveGiver,KUDOS_NOTIFICATION_TYPE
listPeople,getPersonProfile
id,giver_id,recipient_id,program_id,kudos_date,notification_id,created_at true
{"title":"You got kudos, Liam!","body":"Zoe gave you kudos for your workout today."}
```
   - (c) **Coverage guard 1: the GET inventory.**
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && grep -nE '\.get\("' routes/*.js | sed -E 's/^routes\/([a-zA-Z]+)\.js:[0-9]+:([a-zA-Z0-9]+)\.get\("([^"]*)".*/\1 \2 \3/' | sort
```
     - It must print exactly **39** lines: 33 before Phase 4, plus N-SRV's `announcements router /`, `notificationInbox router /`, `notificationInbox router /unread-count` and `notificationPreferences router /`, plus S1's `people router /` and `people router /:memberId`.
     - The set must equal the GET INVENTORY table.
     - If any line is extra, open its handler:
       - if it returns only the caller's own data, names or program aggregates, add it to the table with its class;
       - if it returns ANOTHER member's workouts, workout stats or kudos to a viewer who may be a plain member, STOP and report.
   - (d) **Coverage guard 2: other readers of workout data.**
```
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && grep -rlE "WorkoutLog|computeStreaks|getSummary|top_performers|workout_logs" routes services utils middleware | sort
```
     - The expected set is exactly these 10 files: `routes/analytics.js`, `routes/logs.js`, `services/analyticsService.js`, `services/healthSyncWorkouts.js`, `services/logService.js`, `services/memberActivityStats.js`, `services/memberAnalyticsService.js`, `services/peopleService.js`, `services/workoutService.js`, `utils/memberVisibility.js`.
     - `services/memberActivityStats.js` (N-SRV) is classified as the recipient's own activity in their own notification (reminder, digest, a per-recipient announcement `{streak}`), plus the global-admin composer preview.
     - For any other file: it is fine if it is self-only or a global-admin preview. STOP if it puts member X's activity into anything a plain member Y ≠ X receives.
   - (e) **Coverage guard 3: callers, and no second rule.**
     - Run `grep -rn "getSummary(" routes services utils middleware`. It must show only the definition (`services/analyticsService.js`) and `routes/analytics.js`, and that call passes `req.viewer`.
     - Run `grep -rnE "canSeeActivity|viewerActiveRole|isActivityStaff|filterActivityRows|assertActivityVisible|requireActivityVisible|canViewRoster|getMemberTimeZone|localDateIn" routes services utils middleware`. It must print **nothing**.
     - Run `grep -rln "hide_activity" routes services utils middleware | sort`. It must print exactly `services/kudosService.js`, `services/memberService.js`, `utils/memberVisibility.js`.
     - Run `git diff --stat HEAD -- utils/notifications.js models/index.js routes/members.js routes/memberAnalytics.js`. It must be empty (all untouched).

26. **Deploy order and the verification matrix.** This change has a migration and touches the auth middleware's model, so staging runs first.
   - (a) Preconditions:
     - N-SRV is live on staging and prod (011 run on both schemas, N-SRV step 31).
     - Step 3 is done.
   - (b) Commit through git-version (step 28).
   - (c) With the user's OK, run `git push --force-with-lease origin main:staging`. Then run `curl -s -m 120 https://rasifiters-api-staging.onrender.com/` and confirm the staging deploy is `live` (deploy skill §C).
   - (d) **The matrix.** Run it against staging. The USER runs it in their zsh Terminal, or the orchestrator does with the user's OK.
     - Accounts in program **RaSi Winter Reset**: S = `ava.rivera` (admin), L = `mia.patel` (logger), P = `zoe.chen` (plain member), H = `ethan.m` (plain member, made hidden).
     - The limits live in memory, so re-run only after a staging redeploy.
     - L's Activity category must be on, which is the default.
```zsh
read -rs "TESTBED_PASSWORD?Testbed password: "; echo
curl -s -m 120 https://rasifiters-api-staging.onrender.com/; echo
TESTBED_PASSWORD="$TESTBED_PASSWORD" node --input-type=module - <<'EOF'
const API = "https://rasifiters-api-staging.onrender.com/api";
const call = async (method, path, token, body) => {
  for (let i = 0; ; i++) {
    const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    if ([502, 503, 504].includes(r.status) && i < 2) { await new Promise((s) => setTimeout(s, 3000)); continue; }
    let data = null; try { data = await r.json(); } catch {}
    return { status: r.status, data, retryAfter: r.headers.get("retry-after") };
  }
};
const login = async (u) => { const r = await call("POST", "/auth/login/app", null, { identifier: u, password: process.env.TESTBED_PASSWORD }); return { token: r.data?.access_token || r.data?.token, id: r.data?.member_id || r.data?.user?.id }; };
let fails = 0;
const check = (label, ok, got) => { console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : " → " + JSON.stringify(got).slice(0, 240)}`); if (!ok) fails += 1; };
const HIDDEN = "This member keeps their activity private.";
const [S, L, P, H] = await Promise.all(["ava.rivera", "mia.patel", "zoe.chen", "ethan.m"].map(login));
const T = (await call("GET", "/programs", S.token)).data.find((p) => p.name === "RaSi Winter Reset").id;
const q = (m) => `programId=${T}&memberId=${m}`;
try {
  let r = await call("PUT", `/members/${H.id}`, H.token, { hide_activity: true });
  check("H hides (PUT 200 + echo)", r.status === 200 && r.data.hide_activity === true, r);
  r = await call("GET", `/members/${H.id}`, H.token); check("H reads own flag", r.status === 200 && r.data.hide_activity === true, r);
  r = await call("GET", `/members/${H.id}`, P.token); check("P can't read H's flag", r.status === 200 && !("hide_activity" in r.data), r);
  r = await call("GET", "/members", P.token); check("GET /members never carries hide_activity", r.status === 200 && Array.isArray(r.data) && r.data.every((m) => !("hide_activity" in m)), r.status);
  r = await call("PUT", `/members/${P.id}`, P.token, { hide_activity: "yes" }); check("non-boolean → 400", r.status === 400, r);
  r = await call("PUT", `/members/${H.id}`, S.token, { hide_activity: false }); check("someone else's flag → 403", r.status === 403, r);
  const mp = await call("GET", `/member-metrics?programId=${T}`, P.token), ms = await call("GET", `/member-metrics?programId=${T}`, S.token);
  check("#1 metrics: H omitted for P, kept for S, total equal", !mp.data.members.some((m) => m.member_id === H.id) && ms.data.members.some((m) => m.member_id === H.id) && mp.data.total === ms.data.total, { p: mp.data?.total, s: ms.data?.total });
  for (const path of ["/member-history", "/member-streaks", "/member-recent"]) {
    const [rp, rs, rl, rh] = await Promise.all([P, S, L, H].map((v) => call("GET", `${path}?${q(H.id)}`, v.token)));
    check(`#2-4 ${path}: P 403 (hidden message) · S/L/H 200`, rp.status === 403 && rp.data?.error === HIDDEN && [rs, rl, rh].every((x) => x.status === 200), [rp.status, rp.data?.error, rs.status, rl.status, rh.status]);
  }
  for (const path of ["/analytics/workouts/types", ...["total", "most-popular", "longest-duration", "highest-participation"].map((s) => `/analytics-v2/workouts/types/${s}`)]) {
    const [rp, rs, rh] = await Promise.all([P, S, H].map((v) => call("GET", `${path}?${q(H.id)}`, v.token)));
    const [up, bad] = await Promise.all([call("GET", `${path}?${q(H.id.toUpperCase())}`, P.token), call("GET", `${path}?${q("not-a-uuid")}`, P.token)]);
    check(`#5-9 ${path}: P 403 activity_hidden (also upper-case id) · S/H 200 · bad id 400`, rp.status === 403 && rp.data?.code === "activity_hidden" && rp.data?.error === HIDDEN && up.status === 403 && rs.status === 200 && rh.status === 200 && bad.status === 400 && bad.data?.code === "invalid_request", [rp.status, up.status, rs.status, rh.status, bad.status]);
  }
  const sp = await call("GET", `/analytics/summary?programId=${T}&period=year`, P.token), ss = await call("GET", `/analytics/summary?programId=${T}&period=year`, S.token);
  check("#10 precondition: H is in S's top_performers (year)", Boolean(ss.data?.top_performers?.some((x) => x.member_id === H.id)), ss.data?.top_performers);
  check("#10 summary: H absent from P's top_performers; member totals equal", !sp.data.top_performers.some((x) => x.member_id === H.id) && JSON.stringify(sp.data.members) === JSON.stringify(ss.data.members), { p: sp.data?.top_performers, s: ss.data?.members });
  for (const path of ["/analytics/health/timeline", "/analytics/health/steps", "/daily-health-logs"]) {
    r = await call("GET", `${path}?${q(H.id)}`, P.token); check(`#11-12 ${path}: P 403 (S0)`, r.status === 403, r.status);
  }
  r = await call("GET", `/people?programId=${T}`, P.token);
  const hRow = r.data?.people?.find((x) => x.member_id === H.id);
  check("#13 list for P: P first, H name-only, not staff", r.status === 200 && r.data.people[0].member_id === P.id && r.data.people[0].is_you && hRow?.activity_visible === false && hRow.last_active === null && r.data.viewer.is_staff === false, r.data);
  r = await call("GET", `/people?programId=${T}`, S.token);
  check("#13 list for S: H visible, staff", r.status === 200 && r.data.people.find((x) => x.member_id === H.id)?.activity_visible === true && r.data.viewer.is_staff === true, r.data);
  r = await call("GET", `/people/${H.id}?programId=${T}`, P.token);
  check("#13 profile for P: stats/recent/kudos null", r.status === 200 && r.data.activity_visible === false && r.data.stats === null && r.data.recent_workouts === null && r.data.kudos === null && r.data.can_open_full_stats === false, r.data);
  r = await call("GET", `/people/${H.id}?programId=${T}`, S.token);
  check("#13 profile for S: visible + full stats", r.status === 200 && r.data.activity_visible === true && r.data.stats !== null && r.data.can_open_full_stats === true, r.data);
  r = await call("POST", `/people/${H.id}/kudos`, P.token, { program_id: T }); check("#13 POST kudos → hidden: 403 activity_hidden", r.status === 403 && r.data?.code === "activity_hidden", r);
  r = await call("DELETE", `/people/${H.id}/kudos`, P.token); check("#13 DELETE kudos → hidden: 200, no count", r.status === 200 && !("count" in (r.data?.kudos || {})) && r.data.kudos.removed === false, r);
  r = await call("POST", `/people/${P.id}/kudos`, P.token, { program_id: T }); check("kudos to self → 400 kudos_self", r.status === 400 && r.data?.code === "kudos_self", r);
  await call("DELETE", `/people/${L.id}/kudos`, P.token);                                                   // write 1 (normalize)
  r = await call("POST", `/people/${L.id}/kudos`, P.token, { program_id: T });                              // write 2
  check("give → 201 given_today", r.status === 201 && r.data.kudos.given_today === true && Number.isInteger(r.data.kudos.count), r);
  r = await call("POST", `/people/${L.id}/kudos`, P.token, { program_id: T });                              // write 3
  check("give again → 200 (idempotent)", r.status === 200 && r.data.kudos.given_today === true, r);
  const pFirst = (await call("GET", `/members/${P.id}`, P.token)).data?.member_name?.split(" ")[0] || "";
  let inbox = await call("GET", "/notifications/inbox?limit=50", L.token);
  const note = inbox.data?.items?.find((n) => n.type === "activity.kudos_received" && n.actor_member_id === P.id);
  check("kudos note in L's inbox: unread, activity/inbox, templated (C8)", Boolean(note) && note.category === "activity" && note.target === "inbox" && note.read_at === null && !/[{}]/.test(`${note.title}${note.body}`) && `${note.title} ${note.body}`.includes(pFirst), note || inbox.status);
  const legacy = await call("GET", "/notifications/unacknowledged", L.token);
  check("kudos never on /unacknowledged", legacy.status === 200 && !legacy.data.some((n) => n.type === "activity.kudos_received"), legacy.status);
  r = await call("DELETE", `/people/${L.id}/kudos`, P.token);                                               // write 4
  check("undo → 200 {given_today:false, removed:true}, no count", r.status === 200 && r.data.kudos.given_today === false && r.data.kudos.removed === true && !("count" in r.data.kudos), r);
  inbox = await call("GET", "/notifications/inbox?limit=50", L.token);
  check("undo removed the unread note", Boolean(note) && inbox.status === 200 && !inbox.data.items.some((n) => n.id === note.id), inbox.status);
  await call("POST", `/people/${L.id}/kudos`, P.token, { program_id: T });                                  // write 5
  await call("DELETE", `/people/${L.id}/kudos`, P.token);                                                   // write 6
  r = await call("POST", `/people/${L.id}/kudos`, P.token, { program_id: T });                              // write 7
  check("pair limit: 7th write → 429 rate_limited + Retry-After", r.status === 429 && r.data?.code === "rate_limited" && Boolean(r.retryAfter), r);
  r = await call("GET", `/people?programId=bad`, P.token); check("bad programId → 400 invalid_request", r.status === 400 && r.data?.code === "invalid_request", r);
} finally {
  const r = await call("PUT", `/members/${H.id}`, H.token, { hide_activity: false });
  console.log(`cleanup: H visible again → ${r.status}`);
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL(S)`);
}
EOF
```
     - The output must end with `ALL PASS`.
     - Rows #11–12 test S0's rule (403). If the #10 precondition fails, the staging testbed has no workout for H this year. Run the testbed refresh only after asking the user.
   - (e) With the user's OK, push `main` (Render auto-deploys).
   - (f) Check that the prod deploy logs show no `[auth] token verification unavailable` and no `[people] … failed` lines.
   - (g) Prod smoke: on the user's own account, `GET /api/people?programId=<one of their programs>` returns 200.

27. **Migration:** `apps/backend/sql/012_people_hide_activity_kudos.sql`. The USER runs it in step 3, staging and then public, before any S1 code is committed. 011 (N-SRV) must already be on both schemas before the S1 code deploys.

28. **git-version**
   - (a) **One `feat(backend)` commit for S1**, containing:
     - `sql/012_people_hide_activity_kudos.sql`, `sql/README.md`
     - `models/Member.js`, `models/Kudos.js`
     - `utils/memberVisibility.js`
     - `services/memberAnalyticsService.js`, `services/analyticsService.js`, `services/memberService.js`, `services/kudosService.js`, `services/peopleService.js`
     - `routes/analytics.js`, `routes/people.js`
     - `server.js`
   - (b) **ONE docs commit after it.** It contains steps 16–24 (`apps/backend/CONTEXT.md`, the 7 SPECs, `registry.json`, `REGISTRY.md`). Bumps:
     - people new v0.1.0
     - members 0.5.0
     - member-analytics 0.7.0
     - analytics 0.6.0
     - analytics-v2 0.3.0
     - program-memberships 0.4.0
     - notifications 0.6.1
   - Tag each feature on that commit and push the tags by name: `feature/people@v0.1.0`, `feature/members@v0.5.0`, `feature/member-analytics@v0.7.0`, `feature/analytics@v0.6.0`, `feature/analytics-v2@v0.3.0`, `feature/program-memberships@v0.4.0`, `feature/notifications@v0.6.1`.
   - (c) The commit body says: "no bump for auth (models/Member.js is shared; the column is owned by members D-C4; auth's code and behavior are unchanged); daily-health-logs FYI (imports memberVisibility; the canonical-id compare only lets an upper-case self id pass — backward-compatible); no bump for the other features listing server.js".
   - (d) `people` flips to 🚀 only after the prod deploy is verified, with no bump.
   - (e) The orchestrator adds `program-memberships 0.4.0` to the amendments' §5 S1 row (verdict #2).

## Privacy, consent and store disclosures (final form per U-1 (b) / NP-U5; the client plans apply these)
**A. Web privacy text.**
- The web client plan applies these edits identically to BOTH `apps/web/src/app/privacy-policy/page.tsx` and `apps/web/src/app/program/privacy/page.tsx`.
- It merges with #48 (BrandMark) and web A19 (NP-U6, time zone and notification categories). Merge, never overwrite.

1. `subtitle="Effective date: …"` → the date the web change ships.
2. "How we use information": in the bullet that starts `Deliver push and in-app notifications (for example program updates, membership or role changes)`, change the parenthesis to `(for example program updates, membership or role changes, and kudos from other members)`.
3. "Connected health data": insert after the bullet `We use data read from Apple Health or Health Connect only…`:
   `<li>Workouts created from Apple Health or Health Connect are part of your program activity: other members of your programs can see them, along with your streaks and active days, unless you turn on Hide my activity in My Profile. Sleep and steps are never shown to other members — only you, your program&apos;s admins and loggers, and RaSi Fiters administrators can see them.</li>`
4. "Sharing of information": insert as the FIRST `<li>` (verdict #6 adds gender and join dates):
   `<li>Other members of your programs: members of a program you belong to can see your name, username, gender, program role, and when you joined RaSi Fiters and the program. They can also see your workouts, workout stats (such as streaks and active days) and the kudos you receive — including workouts synced from Apple Health or Health Connect — unless you turn on Hide my activity in My Profile. Program admins and loggers can always see your activity in their programs. Your sleep, diet and steps are visible only to you, your program&apos;s admins and loggers, and RaSi Fiters administrators. Your email address is never shown to other members.</li>`
5. "Your choices": insert after `<li>Access or update your information in the app.</li>`:
   `<li>Turn on Hide my activity (My Profile) to hide your workouts, workout stats and kudos from other members of your programs. You stay on your programs&apos; member lists by name, program admins and loggers still see your activity, and program totals still include it.</li>`

**B. In-app consent copy** (client plans).
- **iOS:** `NSHealthShareUsageDescription` in project.pbxproj (:381 and :420) becomes `RaSi Fiters reads your workouts, sleep, and steps from Apple Health to log them in your programs. Members of your programs can see your workouts unless you turn on Hide my activity.` This also fixes the #45 typo.
- **iOS `AppleHealthSettingsView` and Android `HealthConnectSettingsScreen`:** one footnote each, `Synced workouts are visible to members of your programs unless you turn on Hide my activity in My Profile.`
- **U-1(b) notice on all three:**
  - Title: `Who can see your activity`.
  - Body: `Members of your programs can see your workouts, streaks and kudos — including workouts synced from Apple Health or Health Connect. Sleep, diet and steps stay private to you and your program's staff.`
  - Buttons: `Keep visible` / `Hide my activity`.
  - The seen flag is per member (R10).

**C. Store answers.** The USER changes these in the consoles. They are recommendations; the console's own help text decides.
- **App Store Connect → App Privacy:** confirm Health & Fitness → **Health** and **Fitness** are declared as collected, Linked to the user, purpose App Functionality, not used for tracking.
- **App Store Connect → App Review notes:** add `People (Members → People): members of a program see each other's workouts and streaks and can send kudos (a count, no text). Synced Apple Health workouts are included; members are told this in a one-time notice and can hide their activity in My Profile → Hide my activity.`
- **Play Console → Data safety:** Fitness info (workouts, steps) and Health info (sleep) Collected = Yes, purpose App functionality. If Play counts visibility to other users as sharing, set Fitness info Shared = Yes.
- **Play Console → Health Connect permissions declaration:**
  - ExerciseSession READ: `Workouts are logged to the user's fitness programs and shown to the other members of those programs after the user is told so in the app; the user can hide them with Hide my activity.`
  - SleepSession and Steps READ: `Shown only to the user and their program's admins and loggers.`

## ROUTE CHECKLIST (every per-person output; the switch is only honest if every row holds)
Viewer types:
- **P** = plain co-member;
- **H** = the hidden member themself;
- **S** = active program admin or logger;
- **G** = global admin.

H's rows are visible to H, S and G on every route. Ids are compared canonically, so any other spelling fails closed.

| # | Output | How it's covered | Verify (P viewing hidden H) |
|---|---|---|---|
| 1 | GET /api/member-metrics | `getMemberMetrics` keeps only rows passing `canView(viewer, row.member_id, "workouts")` (omitted; `total` unchanged, `filtered` recomputed) | H's row absent; `total` the same as for S |
| 2 | GET /api/member-history?memberId=H | `assertMemberAccess` → `canView(…, "workouts")` | 403 `{ error: "This member keeps their activity private." }` |
| 3 | GET /api/member-streaks?memberId=H | same as 2 | 403 |
| 4 | GET /api/member-recent?memberId=H | same as 2 | 403 |
| 5 | GET /api/analytics/workouts/types?memberId=H | `requireWorkoutsView` = `requireMemberView("workouts", ACTIVITY_HIDDEN_MESSAGE, "activity_hidden")` | 403 `activity_hidden` (also with an upper-case id); malformed id 400 |
| 6–9 | GET /api/analytics-v2/workouts/types/{total,most-popular,longest-duration,highest-participation}?memberId=H | same as 5 | same as 5 |
| 10 | GET /api/analytics/summary → `top_performers` | `getSummary(…, req.viewer)` → `canView` filter | H absent (present for S); `members` totals equal |
| 11 | GET /api/analytics/health/timeline and /health/steps ?memberId=H | S0 "health" (self/staff) — strictly stronger | S0's 403 |
| 12 | GET /api/daily-health-logs?memberId=H | S0 "health" via logService — stronger | 403 |
| 13 | /api/people: GET list · GET profile · POST kudos · DELETE kudos | `canView(…, "workouts")` (list, profile, POST); DELETE returns only the caller's own `{given_today, removed}` | list: `activity_visible:false`, `last_active:null` · profile: `stats` / `recent_workouts` / `kudos` null · POST: 403 `activity_hidden` · DELETE: 200 without `count` |

**GET INVENTORY** (all **39** GET routes after N-SRV + S1; step 25(c) must match this exactly, plus any classified additions):

| Router (file) | Paths | Class |
|---|---|---|
| auth | `/me`, `/identities` | self only |
| members | `/`, `/:id` | name-only (S0 rules); `hide_activity` only to self / G |
| programs | `/` | the caller's own programs |
| memberships | `/members`, `/details` | roster, no activity (names, username, gender, join date, global role) |
| invites | `/my-invites`, `/all-invites` | invites, no activity |
| notifications | `/unacknowledged`, `/stream` | the caller's own feed (legacy types only — never kudos) |
| notificationInbox | `/`, `/unread-count` | self only (the caller's own inbox; kudos arrive here) |
| notificationPreferences | `/` | self only |
| announcements | `/` | global admin only |
| workouts, programWorkouts | `/` | the workout catalog |
| logs (dailyHealthLogRouter) | `/` | #12 |
| healthSync | `/state` | self only |
| analytics v1Router | `/summary` | #10 |
| analytics v1Router | `/workouts/types` | #5 with memberId; aggregate without it |
| analytics v1Router | `/health/timeline`, `/health/steps` | #11 (S0) |
| analytics v1Router | `/workouts/total`, `/duration/total`, `/duration/average`, `/timeline`, `/distribution/day` | program aggregates (count hidden members on purpose) |
| analytics v2Router | `/participation/mtd` | program aggregate |
| analytics v2Router | `/workouts/types/{total,most-popular,longest-duration,highest-participation}` | #6–9 with memberId; aggregate without it |
| memberAnalytics | metricsRouter `/`, historyRouter `/`, streaksRouter `/`, recentRouter `/` | #1–4 |
| people | `/`, `/:memberId` | #13 |

- **Write routes** only echo the caller's own write. Kudos POST and DELETE are in #13.
- **Non-route readers** (guard 25(d)): N-SRV `memberActivityStats.js` puts the recipient's own activity into their own notification, plus the global-admin composer preview.
- **Future rule:** any later output that names another member's activity (a digest leaderboard, merge fields shown to others) must use `canView(…, "workouts")` and gets a row here.

## Risks the implementer must watch
- **Outage risk.** Phase A is mandatory. Don't write step 5 (`Member.js`) until the user has pasted both VERIFY rows. The auth middleware selects every `Member` column on every request.
- **N-SRV first.** Kudos calls `getTimeZones` and `createNotification`, which read `notification_preferences`. Without 011 on a schema, every give returns 500. G0 proves N-SRV's code is present; N-SRV step 31 proves 011 has run.
- **One rule only.** Never add a People-local predicate, cache or guard. Guard 25(e) must print nothing for the old rev-2 names. `memberVisibility.js` must not require any `services/*` file (that would be a require cycle).
- **Full-file replacement of an S0 file (step 7).** Keep `email`, `directory`, `roster` and `health` byte-equivalent apart from the canonical self compare. Re-read the S0 callers (`memberService`, `membershipService`, `logService`, `routes/analytics.js`, `memberAnalyticsService`) and confirm no call signature changed.
- **Canonical ids.** Every comparison of a client-supplied id goes through `canonicalId`. Upper-case, braced, hyphen-less or repeated `memberId` must never pass "workouts" for a plain viewer. Boot line 14 and matrix #5–9 test this.
- **New 400.** A malformed `memberId` gets 400 `invalid_request` on 7 analytics routes (5 workouts + 2 health). It used to be a 500, or a pass for an array. Live clients send canonical ids, and `""`/absent still passes through.
- **`getSummary` third argument = the viewer object** (`req.viewer`), not `req.user`. A missing viewer returns an empty `top_performers` list (fails closed).
- **Cost.** There is +1 indexed query (on the `program_memberships` PK prefix, joined to `members` by PK) per plain-member read that calls `loadViewer` with a `programId`: analytics, member-analytics, rosters and daily-health-logs. Staff and global admins pay nothing extra.
- **Metrics rows are OMITTED, never nulled or zeroed.** The iOS `MemberMetricsDTO` Ints are non-optional.
- **Kudos counts appear only behind `canView`** (profile, POST). DELETE never returns `count`.
- **403 bodies on member-history, member-streaks and member-recent carry no `code`.** The `AppError` has one, but `routes/memberAnalytics.js` echoes only `error` and is not touched.
- **Kudos notifications are created only in `kudosService`, via C8 + `createNotification`.** `utils/notifications.js` stays untouched. The template's `{actor_first_name}` has no fallback in N-SRV, so the giver's first name falls back to the username.
- **Shared files: merge, never overwrite.**
  - `server.js`, `sql/README.md` and `CONTEXT.md` are shared with N-SRV; use text anchors after its lines.
  - S0-owned files are touched here (the module, the analytics route and services, `memberService`).
  - The privacy pages are shared with #48 and web A19.
- **`memberService.js` reaches about 213 lines.** Accepted; don't split it (a new file would be outside the brief).
- **Streaks.** `computeStreaks` semantics stay unchanged (F1). Don't "fix" the stale-streak issue.
- **No app version bumps and no client files.**

## API CONTRACT (People server S1, revision 3: the source of truth for the web / iOS / Android People builds)

**§A Conventions**
- **Base URL:** prod `https://rasifiters-api.onrender.com/api`; staging `https://rasifiters-api-staging.onrender.com/api`.
- **Auth:** every route requires `Authorization: Bearer <access token>`.
  - 401 `{error}` = invalid or expired token.
  - 503 `{error, code:"auth_unavailable"}` + `Retry-After`.
  - 426 = a header-less Android build (app-config gate).
- **Error body:** `{ "error": "<plain-language sentence>", "code": "<machine code>" }`. The status decides the frontend-kit kind; `code` is carried but never decisive.
- **Formats:** response ids are lowercase UUID strings. Request ids on `/api/people` accept any letter case (normalized); anything that isn't one UUID → 400 `invalid_request`. Dates are `YYYY-MM-DD`; timestamps are ISO-8601 UTC. JSON keys are snake_case.
- **Staff** = a global admin, or an ACTIVE `admin` / `logger` of the program.
- **Activity visible** = the viewer is self, or staff, or the target hasn't turned on Hide my activity.

**§B GET /api/people?programId=<uuid>** — the People list
- 200:
```json
{
  "program_id": "6f1c…",
  "viewer": { "member_id": "a1b2…", "is_staff": false },
  "people": [
    { "member_id": "a1b2…", "member_name": "Ava Rivera", "initials": "AR", "username": "ava.rivera",
      "program_role": "member", "is_you": true,  "activity_visible": true,  "last_active": "2026-10-12" },
    { "member_id": "c3d4…", "member_name": "Liam Kim",   "initials": "LK", "username": "liam.kim",
      "program_role": "admin",  "is_you": false, "activity_visible": false, "last_active": null }
  ]
}
```
- `people` = ACTIVE members only. The `is_you` row comes first (absent when the viewer is a global admin who isn't a member), then first name A→Z, then last name A→Z.
- `program_role` ∈ `admin|logger|member`.
- `initials`: 1–2 uppercase letters, or `"?"`.
- `last_active`: the latest workout date in this program. It is `null` when there is none, or when `activity_visible` is false.
- `viewer.is_staff` = staff (§A).
- Errors:
  - 400 `invalid_request` (programId missing or not a UUID);
  - 403 `not_program_member` (not an active member and not a global admin);
  - 404 `program_not_found`;
  - 500 `server_error`.

**§C GET /api/people/:memberId?programId=<uuid>** — a person's profile
- 200:
```json
{
  "program_id": "6f1c…", "member_id": "c3d4…", "member_name": "Liam Kim", "initials": "LK",
  "username": "liam.kim", "program_role": "member", "is_you": false,
  "joined_at": "2026-07-01T17:02:11.000Z",
  "activity_visible": true,
  "can_open_full_stats": false,
  "stats": { "current_streak": 3, "longest_streak": 9, "active_days_this_month": 6, "last_active": "2026-10-12" },
  "recent_workouts": [ { "workout_type": "Running", "date": "2026-10-12", "duration_minutes": 30 } ],
  "kudos": { "count": 12, "given_today": false, "can_give": true }
}
```
- When `activity_visible` is false, `stats`, `recent_workouts` and `kudos` are all `null`; render the name only.
- `stats`:
  - streaks use the same window and semantics as GET /api/member-streaks (stale-streak caveat F1);
  - `active_days_this_month` counts the current UTC month;
  - `last_active` may be null.
- `recent_workouts`: at most 10, ordered by date descending, then type A→Z. It may be `[]`.
- `kudos`:
  - `count` = all-time received, across all programs;
  - `given_today` = the viewer already gave kudos on the recipient's current local day;
  - `can_give` = not self, and the viewer is an ACTIVE member of this program (a global admin only where they are one).
- `can_open_full_stats` = the viewer is staff. "Open full stats" uses the existing member routes (member-history, member-streaks, member-recent, member-metrics?memberId) with no new data.
- Errors:
  - 400 `invalid_request` (programId or memberId not a UUID);
  - 403 `not_program_member`;
  - 404 `program_not_found`;
  - 404 `member_not_in_program` (the target isn't an ACTIVE member);
  - 500 `server_error`.

**§D POST /api/people/:memberId/kudos** — body `{ "program_id": "<uuid>" }`
- 201 = new kudos; 200 = already given today (idempotent). Both return `{ "kudos": { "count": 13, "given_today": true } }`.
- Day = the recipient's local calendar day: their time zone as stored by the Notifications server, or UTC if unknown.
- Errors, in check order:
  - 400 `invalid_request` (memberId or program_id missing or not a UUID);
  - 400 `kudos_self`;
  - 403 `not_program_member` (the giver isn't an ACTIVE member of program_id);
  - 404 `program_not_found`;
  - 404 `member_not_in_program`;
  - 403 `activity_hidden` (plain giver, hidden recipient — re-fetch the profile);
  - 429 `rate_limited` + `Retry-After` (60 kudos writes per member per 10 min, POST + DELETE combined, or 6 per giver→recipient per 24 h);
  - 500 `server_error`.
- Side effect: only on 201, the notification in §F may be created.

**§E DELETE /api/people/:memberId/kudos** — undo today's kudos (no body, no programId)
- 200 always (idempotent): `{ "kudos": { "given_today": false, "removed": true } }`.
  - `removed: false` means there was nothing for the recipient's current day (already undone, or the day rolled over).
  - There is **no `count`**. Clients that showed a count decrement it by 1 when `removed` is true, or re-fetch §C.
- It removes the caller's kudos to that member for the recipient's current day, together with its notification while that is still unread.
- Errors: 400 `invalid_request`; 429 `rate_limited` + `Retry-After` (same limits as §D); 500 `server_error`.

**§F Changed existing routes and the notification** (all additive or restrictive; live binaries are unaffected)
- **GET /api/members/:id** adds `"hide_activity": true|false` ONLY when the requester is that member or a global admin (the same rule as `email`). The key is absent otherwise.
- **PUT /api/members/:id**: the body may include `"hide_activity": true|false` (a JSON boolean).
  - The response adds `"hide_activity"`.
  - 400 `{ "error": "hide_activity must be true or false." }`.
  - 403 `{ "error": "You can only change your own activity visibility." }` (another member's profile, including for a global admin).
  - Neither error carries a `code`. The existing 403 `You can only update your own profile.` still comes first for non-admins.
- **GET /api/members**: never includes `hide_activity`.
- **GET /api/member-metrics**: rows of members hidden from the viewer are omitted. `total` counts every active member; `filtered` counts the returned rows.
- **GET /api/member-history | member-streaks | member-recent?memberId=<hidden>** (plain viewer): 403 `{ "error": "This member keeps their activity private." }`, with no `code`.
- **GET /api/analytics/workouts/types** and the 4 **/api/analytics-v2/workouts/types/*** routes with `memberId`:
  - 403 `{ "error": "This member keeps their activity private.", "code": "activity_hidden" }` for a hidden member viewed by a plain viewer.
  - These 5 routes, plus **/api/analytics/health/timeline** and **/health/steps**, answer 400 `{ "error": "memberId must be a valid id.", "code": "invalid_request" }` for a memberId that isn't one UUID.
- **GET /api/analytics/summary**: `top_performers` omits members hidden from the viewer, so it may hold fewer than 5. Totals are unchanged.
- **Notification `activity.kudos_received`** (notifications D-C29):
  - Category `activity`, target `inbox` (notifications C2).
  - Delivered as a C3 inbox item through `GET /api/notifications/inbox`, the `?inbox=1` stream, and push. **Never** on `GET /api/notifications/unacknowledged` or a plain (non-inbox) stream.
  - Push custom keys (C5): `notification_id`, `type`, `category: "activity"`, `target: "inbox"`, `program_id`.
    - iOS `aps.thread-id` = `activity`.
    - Android channel `rasi_activity` on installs registered with `inbox: true`, else `rasi_default`.
  - `title` / `body` are rendered by the Notifications content provider (C8 KUDOS variants), e.g. `You got kudos, Liam!` / `Zoe gave you kudos for your workout today.`. Clients display them as sent. `actor_member_id` = the giver; `program_id` = the kudos program.
  - It is created only while the recipient's Activity category is on (default on). When off, nothing is created, but the kudos still counts.
  - **Live binaries** (iOS 1.4.2/1.5.0, Android 1.0.0/1.1.0, web before N3) get a push banner only, with no pop-up.
  - An undo removes it while unread. The item then disappears on the next inbox load. `POST /inbox/read {ids}` with a removed id is harmless (`updated: 0`). A live binary acknowledging a removed id gets 404 and drops it.
