# Feature: `people` — program People list, person profiles, kudos and "Hide my activity"

> **Status:** 🚀 deployed (backend live — `d8f8eee`, `sql/012` on staging + public 2026-10-13; web live since
> 2026-10-13 — `PEOPLE_LIVE = true`, kept as a kill switch; iOS / Android in the Phase 4 store builds, per-channel state
> in [`RELEASES.md`](../../../RELEASES.md)) · **Version:** 0.1.1 · **Apps (`consumed_by`):** `web`, `ios`, `android`
> **Provenance:** **NET-NEW** (no legacy equivalent). Decisions: [`phase-4/DECISIONS.md`](../../initiatives/reliability-overhaul/phase-4/DECISIONS.md)
> (D-P1–D-P11); amendments [`phase-4-np-amendments.md`](../../initiatives/reliability-overhaul/plans/phase-4-np-amendments.md)
> §2 (S1-1–S1-5), §3 (R8–R13), §6 (S1R-1–S1R-3); plans `phase-4-p-server/plan.md` (revision 3) and the three Track C
> client plans; board [`DESIGN_BOARD.md`](../../initiatives/reliability-overhaul/DESIGN_BOARD.md) §10.
> **Depends on:** [`auth`](../auth/SPEC.md) · [`members`](../members/SPEC.md) (`members.hide_activity`, D-C4) ·
> [`programs`](../programs/SPEC.md) · [`program-memberships`](../program-memberships/SPEC.md) (`utils/memberVisibility.js`,
> D-C5/D-C6) · [`program-workouts`](../program-workouts/SPEC.md) · [`workout-logs`](../workout-logs/SPEC.md) ·
> [`member-analytics`](../member-analytics/SPEC.md) (`computeStreaks`) · [`notifications`](../notifications/SPEC.md)
> (C8: `getTimeZones`, `localParts` / `dayLabel`, `getContentProvider`, `createNotification`) ·
> [`observability`](../observability/SPEC.md) (`utils/rateLimit.js`).

---

## 1. What it is

The program's people:
- A **list** of the current program's active members, for every role, with the caller first ("You") and initials only
  (no photos).
- A **person's profile**, which shows workouts only: streaks, active days this month, the last 10 workouts and last
  active.
- **Kudos**: one per giver per recipient per recipient-local day, undoable, a count only (no text).
- **"Hide my activity"**: one switch per member that hides their activity from plain co-members.

Backend: `GET /api/people`, `GET /api/people/:memberId`, `POST` + `DELETE /api/people/:memberId/kudos`
(`routes/people.js` → `services/{peopleService,kudosService}.js`), `members.hide_activity` + the `kudos` table
(`sql/012`), and the "Hide my activity" rule inside the shared `utils/memberVisibility.js` (program-memberships D-C6),
applied to every per-person read (§5).

## 2. Why it exists

The Members tab is a one-person dashboard. People adds a social layer that is limited to your own programs and puts
privacy first (board §10, D-14). Phase 4 S0 shipped the one visibility rule; S1 fills its "Hide my activity" hook and
applies it to every per-person read (§5), so the switch can't lie.

## 3. The contract (People server S1 revision 3 — the source of truth for the web / iOS / Android builds)

**§A Conventions**
- **Base URL:** prod `https://rasifiters-api.onrender.com/api`; staging `https://rasifiters-api-staging.onrender.com/api`.
- **Auth:** every route requires `Authorization: Bearer <access token>`.
  - 401 `{error}` = invalid or expired token.
  - 503 `{error, code:"auth_unavailable"}` + `Retry-After`.
  - 426 = a header-less Android build (app-config gate).
- **Error body:** `{ "error": "<plain-language sentence>", "code": "<machine code>" }`. The status decides the
  frontend-kit kind; `code` is carried but never decisive.
- **Formats:** response ids are lowercase UUID strings. Request ids on `/api/people` accept any letter case
  (normalized); anything that isn't one UUID → 400 `invalid_request`. Dates are `YYYY-MM-DD`; timestamps are ISO-8601
  UTC. JSON keys are snake_case.
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
- `people` = ACTIVE members only. The `is_you` row comes first (absent when the viewer is a global admin who isn't a
  member), then first name A→Z, then last name A→Z.
- `program_role` ∈ `admin|logger|member`. `initials`: 1–2 uppercase letters, or `"?"`.
- `last_active`: the latest workout date in this program. It is `null` when there is none, or when `activity_visible`
  is false.
- `viewer.is_staff` = staff (§A).
- Errors: 400 `invalid_request` (programId missing or not a UUID); 403 `not_program_member` (not an active member and
  not a global admin); 404 `program_not_found`; 500 `server_error`.

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
- `stats`: streaks use the same window and semantics as GET /api/member-streaks (stale-streak caveat F1);
  `active_days_this_month` counts the current UTC month; `last_active` may be null.
- `recent_workouts`: at most 10, ordered by date descending, then type A→Z. It may be `[]`.
- `kudos`: `count` = all-time received, across all programs; `given_today` = the viewer already gave kudos on the
  recipient's current local day; `can_give` = not self, and the viewer is an ACTIVE member of this program (a global
  admin only where they are one).
- `can_open_full_stats` = the viewer is staff. "Open full stats" uses the existing member routes (member-history,
  member-streaks, member-recent, member-metrics?memberId) with no new data.
- Errors: 400 `invalid_request` (programId or memberId not a UUID); 403 `not_program_member`; 404 `program_not_found`;
  404 `member_not_in_program` (the target isn't an ACTIVE member); 500 `server_error`.

**§D POST /api/people/:memberId/kudos** — body `{ "program_id": "<uuid>" }`
- 201 = new kudos; 200 = already given today (idempotent). Both return `{ "kudos": { "count": 13, "given_today": true } }`.
- Day = the recipient's local calendar day: their time zone as stored by the Notifications server, or UTC if unknown.
- Errors, in check order: 400 `invalid_request` (memberId or program_id missing or not a UUID); 400 `kudos_self`;
  403 `not_program_member` (the giver isn't an ACTIVE member of program_id); 404 `program_not_found`;
  404 `member_not_in_program`; 403 `activity_hidden` (plain giver, hidden recipient — re-fetch the profile);
  429 `rate_limited` + `Retry-After` (60 kudos writes per member per 10 min, POST + DELETE combined, or 6 per
  giver→recipient per 24 h); 500 `server_error`.
- Side effect: only on 201, the notification in §F may be created.

**§E DELETE /api/people/:memberId/kudos** — undo today's kudos (no body, no programId)
- 200 always (idempotent): `{ "kudos": { "given_today": false, "removed": true } }`.
  - `removed: false` means there was nothing for the recipient's current day (already undone, or the day rolled over).
  - There is **no `count`**. Clients that showed a count decrement it by 1 when `removed` is true, or re-fetch §C.
- It removes the caller's kudos to that member for the recipient's current day, together with its notification while
  that is still unread.
- Errors: 400 `invalid_request`; 429 `rate_limited` + `Retry-After` (same limits as §D); 500 `server_error`.

**§F Changed existing routes and the notification** (all additive or restrictive; live binaries are unaffected)
- **GET /api/members/:id** adds `"hide_activity": true|false` ONLY when the requester is that member or a global admin
  (the same rule as `email`). The key is absent otherwise.
- **PUT /api/members/:id**: the body may include `"hide_activity": true|false` (a JSON boolean). The response adds
  `"hide_activity"`. 400 `{ "error": "hide_activity must be true or false." }`; 403 `{ "error": "You can only change
  your own activity visibility." }` (another member's profile, including for a global admin). Neither error carries a
  `code`. The existing 403 `You can only update your own profile.` still comes first for non-admins.
- **GET /api/members**: never includes `hide_activity`.
- **GET /api/member-metrics**: rows of members hidden from the viewer are omitted. `total` counts every active member;
  `filtered` counts the returned rows.
- **GET /api/member-history | member-streaks | member-recent?memberId=<hidden>** (plain viewer): 403 `{ "error": "This
  member keeps their activity private." }`, with no `code`.
- **GET /api/analytics/workouts/types** and the 4 **/api/analytics-v2/workouts/types/*** routes with `memberId`:
  403 `{ "error": "This member keeps their activity private.", "code": "activity_hidden" }` for a hidden member viewed
  by a plain viewer. These 5 routes, plus **/api/analytics/health/timeline** and **/health/steps**, answer 400
  `{ "error": "memberId must be a valid id.", "code": "invalid_request" }` for a memberId that isn't one UUID.
- **GET /api/analytics/summary**: `top_performers` omits members hidden from the viewer, so it may hold fewer than 5.
  Totals are unchanged.
- **Notification `activity.kudos_received`** ([notifications](../notifications/SPEC.md) D-C29):
  - Category `activity`, target `inbox` (notifications §3.4).
  - Delivered as an inbox item (notifications §3.5) through `GET /api/notifications/inbox`, the `?inbox=1` stream, and
    push. **Never** on `GET /api/notifications/unacknowledged` or a plain (non-inbox) stream.
  - Push custom keys (notifications §3.2): `notification_id`, `type`, `category: "activity"`, `target: "inbox"`,
    `program_id`. iOS `aps.thread-id` = `activity`. Android channel `rasi_activity` on installs registered with
    `inbox: true`, else `rasi_default`.
  - `title` / `body` are rendered by the Notifications content provider (the KUDOS variants, notifications §3.7), e.g.
    `You got kudos, Liam!` / `Zoe gave you kudos for your workout today.`. Clients display them as sent.
    `actor_member_id` = the giver; `program_id` = the kudos program.
  - It is created only while the recipient's Activity category is on (default on). When off, nothing is created, but
    the kudos still counts.
  - **Live binaries** (iOS 1.4.2/1.5.0, Android 1.0.0/1.1.0, web before the Phase 4 inbox) get a push banner only, with
    no pop-up.
  - An undo removes it while unread. The item then disappears on the next inbox load. `POST /inbox/read {ids}` with a
    removed id is harmless (`updated: 0`). A live binary acknowledging a removed id gets 404 and drops it.

## 4. Server behavior

**4.1 Activity rule.**
- Activity means a member's workouts, workout stats (streaks, active days, last active) and kudos.
- It is decided ONLY by `utils/memberVisibility.js` `canView(viewer, memberId, "workouts")` (program-memberships
  D-C5/D-C6): self — always; a global admin — always; an ACTIVE admin or logger of that program — always; an ACTIVE
  co-member — only while the target isn't in `viewer.hiddenMemberIds`.
- `loadViewer` fills `hiddenMemberIds` from `members.hide_activity` with one query over the program's **ACTIVE**
  memberships, for plain active members only (every "workouts" output is active-only already).
- Ids compare canonically (`canonicalId`); any other spelling fails closed. Without a viewer, nothing is visible.
- Callers OMIT what it refuses (§5). Program aggregates count hidden members on purpose.

**4.2 List and profile.**
- Access uses `loadViewer` + `hasProgramAccess` (a global admin, or an ACTIVE member).
- Active memberships only. Order: caller first, then first name A→Z, then last name A→Z.
- `initials` = the first letter of the first name plus the first letter of the last name, uppercased; "?" if both are
  empty.
- `last_active` = the latest workout `log_date` in this program. Hidden members are never queried.
- Profile streaks use the `/member-streaks` window (program start → today UTC) and the same semantics (F1).
- `active_days_this_month` = distinct log dates in the current UTC month.
- `recent_workouts` = the latest 10, ordered by date descending, then type A→Z.
- `can_open_full_stats` = staff (a global admin, or an ACTIVE admin/logger).

**4.3 Kudos.**
- **Day:** the recipient's local calendar date, `localParts((await getTimeZones([id])).get(id) || "UTC")`
  (notifications C8). UTC is used when the zone is absent or invalid.
- **Key:** UNIQUE (giver, recipient, day). Never to yourself.
- **Who:** the giver must be an ACTIVE member of `program_id` (`isActiveGiver`; a global admin only where they are one),
  and the recipient an ACTIVE member. A plain giver can't give to a hidden member (403 `activity_hidden`).
- **Give:** idempotent (201 new / 200 already). A new kudos renders its title and body through
  `getContentProvider().render("activity.kudos_received", { first_name, actor_first_name, day_label },
  "<recipient>|<giver>|<date>")` and calls `createNotification` inside the insert transaction. A concurrent duplicate
  loses on the UNIQUE key and answers like "already given today".
- **Undo:** deletes today's row, plus its notification while the recipient hasn't read it. It is idempotent and
  ungated, and returns only `{given_today, removed}`.
- **Count:** all-time received, across all programs. It is shown only where the recipient's activity is visible to the
  viewer.

## 5. Route checklist (every per-person output; the switch is only honest if every row holds) + verification

Viewer types: **P** = plain co-member; **H** = the hidden member themself; **S** = active program admin or logger;
**G** = global admin. H's rows are visible to H, S and G on every route. Ids are compared canonically, so any other
spelling fails closed.

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

**GET inventory** — all **39** GET routes after the Phase 4 Notifications and People servers. The coverage guard is
`grep -nE '^[a-zA-Z0-9]+\.get\("' routes/*.js` (run in `apps/backend/`); its hit list must match this table exactly,
plus any classified addition.

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
- **Non-route readers:** `services/memberActivityStats.js` (notifications) puts the recipient's own activity into
  their own notification, plus the global-admin composer preview.
- **Future rule:** any later output that names another member's activity (a digest leaderboard, merge fields shown to
  others) must use `canView(…, "workouts")` and gets a row here.
- **Verification notes (S1R-3):** "someone else's flag → 403" asserts the exact `You can only update your own
  profile.` text (a plain member's PUT on another profile). The global-admin branch (`You can only change your own
  activity visibility.`) is unverified on staging (no global admin there); a boot-check stub asserts the guard's
  condition instead.

## 6. Data / schema — `apps/backend/sql/012_people_hide_activity_kudos.sql`

- `members.hide_activity boolean NOT NULL DEFAULT false` (owned by [members](../members/SPEC.md) D-C4; read only by
  `utils/memberVisibility.js`).
- `kudos (id uuid PK, giver_id → members CASCADE, recipient_id → members CASCADE, program_id → programs CASCADE,
  kudos_date date, notification_id → notifications SET NULL, created_at)`, with `CHECK (giver_id <> recipient_id)` and
  `UNIQUE (giver_id, recipient_id, kudos_date)`.
- Indexes: (recipient_id, kudos_date), (program_id), (notification_id).
- RLS on the public copy only; staging grants for `rasifiters_staging`.
- Model `models/Kudos.js` has no associations and isn't registered in `models/index.js`.
- The SQL is independent of `011`; the S1 **code** requires `011` on the schema first (kudos reads
  `notification_preferences` through `getTimeZones` and `createNotification`).

## 7. Flags / env

- **Backend:** no env vars. The kudos write limits are constants in `routes/people.js` (process memory — a deploy
  resets them, observability F3):
  - 60 kudos writes (POST + DELETE) per member per 10 min;
  - 6 per giver→recipient per 24 h (`maxKeys: 100000`).
  - A malformed `:memberId` is rejected with `400 invalid_request` **before** both limiters, so junk ids never create
    pair keys.
- **Web:** `PEOPLE_LIVE` — a compile-time constant in `apps/web/src/lib/api/people.ts`; `true` since 2026-10-13, kept as
  a kill switch (`false` turns every web People surface off, D-C13).

## 8. Rollout + live binaries

- **Order:** Notifications server live (`011` on staging + public) → `012` on staging + public → S1 backend (staging
  branch, then `main`) → web Pass B (dark) and the phone builds → clients go live together with the store release
  (NP-U5 / U-3; this overrides DECISIONS "web ships as each part is reviewed" for People). *(Web went live 2026-10-13
  with Android 1.2.0's public release, ahead of the iOS release — user decision.)*
- **Revert order (S1R-2):** if the Notifications server is reverted, revert S1 first or in the same revert (S1 requires
  Notifications modules at boot). The `012` column and table stay.
- **Live binaries:** iOS 1.4.2 (56) / 1.5.0 (58) and Android 1.0.0 (4) / 1.1.0 (5).
  - They never call `/api/people`.
  - Plain-member apps request only their own `memberId`, and their own row is never omitted.
  - Staff are never filtered.
  - `GET` and `PUT /members/:id` changes are additive keys.
- **Kudos notifications:** a push banner only, with no pop-up. They never reach `/unacknowledged` or a plain stream
  (notifications D-C20). Android installs without the inbox receive them on `rasi_default`.
- **Store disclosures** (the USER's console work): App Privacy / Data safety / Health Connect declaration answers and
  the App Review note per the S1 plan's "Privacy, consent and store disclosures" §C.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | Scope (S1, backend): `/api/people` (list, profile, kudos give/undo), `members.hide_activity`, `kudos`, and S0's visibility module filled for "Hide my activity" (program-memberships D-C6) and applied to every per-person read (§5). The clients join `consumed_by` with Track C (D-C13 / D-C14). | DECISIONS D-P1–D-P3; S1 plan rev 3. |
| **D-C2** | One rule: `canView(viewer, id, "workouts")` in `utils/memberVisibility.js`. There is no People-local rule. Hidden rows are omitted, never zeroed or redacted. Aggregates count everyone. `hiddenMemberIds` covers the program's **active** memberships only (every output is already active-only). Ids are canonical; any other spelling fails closed. Any later output that names another member's activity must use this rule and add a §5 row. | NP amendments S1-1, S1R-1. |
| **D-C3** | "Hide my activity" is one switch per member covering all programs, default off. Only the member sets it (`PUT /members/:id`, own profile; never a global admin for someone else). `GET /members/:id` shows it under the `email` rule (self or a global admin). | DECISIONS D-P6/D-P7; members D-C4. |
| **D-C4** | Kudos day = the recipient's local day (§4.3). One per giver → recipient per day, never to self. The giver and recipient must both be ACTIVE members of `program_id`; a global admin gives only where they are one (`isActiveGiver`, eligibility, not visibility). `program_id` is context and not part of the key. | DECISIONS D-P4/D-P5. |
| **D-C5** | Give is idempotent and emits `activity.kudos_received` inside the insert transaction **through notifications C8**: the content provider renders title and body (the KUDOS variants; seed `<recipient>\|<giver>\|<date>`), then `createNotification`. There is no fixed text. A `null` return (Activity off) leaves `notification_id` null. | NP amendments S1-3; notifications D-C29. |
| **D-C6** | Undo deletes the kudos and its notification while it is unread. It is idempotent and ungated, and returns `{given_today, removed}` only (no count — a count would bypass the rule). | S1 plan rev 3. |
| **D-C7** | Kudos `count` = all-time received across programs, shown only where activity is visible. `given_today` = the viewer's kudos for the recipient's current day. `can_give` = not self and `isActiveGiver`. | S1 plan rev 3. |
| **D-C8** | Rate limits, in process memory: 60 kudos writes (POST + DELETE) per member per 10 min, plus 6 per giver→recipient per 24 h (at most 3 kudos notifications per pair per day; the pair limiter holds at most 100,000 keys). `:memberId` is validated before both limiters. Reads are not limited. | health-sync D-C12 shape; observability F3. |
| **D-C9** | Initials are computed server-side for parity (D-P10). The profile shows workouts only (D-P3). `can_open_full_stats` = staff (D-P11). No photos and no feed. | DECISIONS D-P3, D-P10, D-P11. |
| **D-C10** | Not built: person-to-person blocking (D-P9); membership editing from a profile on the server (D-P11 stays global-admin only, through the existing membership routes); any streak semantic change (F1); an activity feed. | DECISIONS D-P9, D-P11. |
| **D-C11** | Seams: S0's module (`loadViewer`, `hasProgramAccess`, `canView`, `canonicalId`, `ACTIVITY_HIDDEN_MESSAGE`) and notifications **C8 only**: `getTimeZones` (`services/notificationPreferenceService.js`), `localParts`/`dayLabel` (`utils/localTime.js`), `getContentProvider` (`utils/notificationTemplates.js`) and `createNotification`. `utils/notifications.js` is unchanged by People. | NP amendments S1-2, N-1. |
| **D-C12** | Disclosure of synced Apple Health / Health Connect workouts to co-members follows U-1 (b) (NP-U5): policy text, purpose string and store answers, plus a one-time "Who can see your activity" notice ([Keep visible] / [Hide my activity]) in every People client before it first shows other people, and once after the update on phones that already sync. The "seen" flag is **per member**; it is skipped when the member is already hidden and counts as seen only once the choice landed (R10). | NP-U5; NP amendments R10; S1 plan "Privacy, consent and store disclosures". |
| **D-C13** | **Shared client rules + the web realization (0.1.0; NP amendments R8–R11, R13; web Track C Pass B).** **Copy (R8, all three):** `People` · `Search people` (name or username) · `No one in this program yet.` / `No one matches your search.`; `Invite member` · `Send an invite by username` (program admins and global admins, top of the list — NP-U1); Program-tab row `People` · `<n> enrolled`; row status `Active today` · `Active yesterday` · `Last active Oct 12` · `Last active Oct 12, 2025` · `No workouts yet` · `Activity hidden`; markers `You` · `Admin` · `Logger`; hidden profile `This member keeps their activity private.`; stats `Current streak` / `Longest streak` → `N days`, `This month` → `N days`, `Last active` → `Today` / `Yesterday` / `Oct 12` / `—`; `Recent workouts` · `No workouts logged yet.`; kudos `N kudos` with ONE toggle `Give kudos` ↔ `Kudos given` and `You gave kudos today. Tap again to undo.`; staff rows `Open full stats` · `History, streaks, health`, global admins `Edit membership` · `Joined date, status, remove`. **429 (R9):** `You've changed kudos too many times. Try again later.`; a 403 `activity_hidden` re-fetches the profile; an undo decrements the shown count only when `removed`. **Notice (R10):** title `Who can see your activity`, body per D-C12, buttons `Keep visible` / `Hide my activity`; shown before People first shows other people; skipped (and marked seen) when the member is already hidden. **Hide my activity (R11):** My Profile, directly above "Sign out everywhere"; hint `Hides your workouts, streaks and kudos from other members of your programs. Program admins and loggers still see them.`; a 200 without the `hide_activity` echo is a failure. **Web:** `PEOPLE_LIVE` (compile-time in `lib/api/people.ts`; *`true` since 2026-10-13, kept as a kill switch — the roster stays as its fallback*) — while false `/members/list` runs today's roster verbatim (`RosterList`), `/members/person` redirects to `/members/list`, the Hide toggle on `/program/profile` is hidden, the Program-tab row keeps `View Members` / `<n> active` and the Members tab keeps its Invite pill; the **People privacy text ships now** (both privacy pages); release day flips the constant (then the dark roster is deleted). Live: `/members/list` = `PeopleList`, `/members/person?memberId=` = the profile, the Members-tab People pill replaces the Invite pill for admins (NP-U1). Notice flag `localStorage` `rasi.fiters.activityNotice.<memberId>`, shown on the first People open. **Open full stats:** admins / global admins set the view-as key `rf:members:view-as:<programId>:<viewerId>` and open `/members`; **loggers open `/members/workouts?memberId=&name=`** (a logger's Members overview is always themselves — a sanctioned web divergence, R13). `Edit membership` (global admins) → `/members/detail?memberId=`. Files: `app/members/{list,person}/page.tsx`, `components/people/{KudosButton,HideActivityToggle,ActivityVisibilityNotice}.tsx`, `lib/api/people.ts`. | NP amendments R8–R13; web plan W1–W7; S1 plan Privacy §A–§B. |
| **D-C14** | **Phone realization (0.1.0; iOS + Android Track C).** **Entry (NP-U1):** the Members-tab header button opens People for **every role** — iOS swaps the admin header's `envelope.badge.person.crop` GlassButton (and the standard/logger roster push) for `person.2` → `PeopleListView`; Android's header button becomes `People` (Group icon) for every role (the admin MailOutline Invite button is gone) → `PeopleListScreen`. The Program-tab row reads `People` / `<n> enrolled`. The old roster screens are deleted (iOS `ProgramMembersListView`, Android `ProgramMembersListScreen`). **Profile:** iOS `PersonProfileView` (a 404 on refresh dismisses it), Android `PersonProfileScreen` (route `members/person`). **Open full stats** opens the five Members cards for that person — iOS `MemberFullStatsView` (its own `MemberCardsOwner` token), Android `MemberFullStatsScreen` (route `members/full-stats`, in `MemberManagementScreens.kt`); both follow the member-analytics D-C12 recipe. **Edit membership (R6):** iOS shows the row only after this screen's own membership-details load for the profile's program (`detailsProgramId == profile.programId`); Android renders the editor only once its own load finished (`remember` keyed on `(memberId, loaded)`). **Notice:** iOS — one `.alert` presenter on `AppRootView` that yields to the covers (widget form, forced update, Health review) and returns ~0.5 s after they clear; offered when People opens and after the launch health sync; never while notification permission is undetermined; flag `UserDefaults` `people.activityVisibilityNoticeSeen.<memberId>`; a failed Hide shows `Couldn't hide your activity` / `<kit message> You can turn on Hide my activity in My Profile.` and asks again next time. Android — prefs `rasi.people` key `activity_notice_seen.<memberId>`; hosts the People list and the picker (only when workout sync is on); deferred while the Health Connect review is pending and until the `POST_NOTIFICATIONS` result; not dismissible by back / outside tap. **Search:** Android keeps the query across navigation (`rememberSaveable`). **Hide my activity:** iOS `Settings/HideActivitySection.swift` (hidden when GET carries no `hide_activity`), Android `ui/program/HideActivitySection.kt` (disabled until GET answers). Files: iOS `Features/Home/People/*`, `Shared/Services/APIClient+People.swift`; Android `ui/people/*`, `core/PeopleStore.kt`, `net/PeopleDtos.kt`. | NP amendments NP-U1, R6, R10, R11; iOS plan TC1/TC8/TC9; Android plan TC-3/TC-4/TC-5/TC-7. |

## 10. Flagged characteristics

| ID | Characteristic | Where | Follow-up? |
|----|----------------|-------|-----------|
| **F1** | The current streak doesn't reset when today is missed (`computeStreaks`, unchanged; undecided), so co-members can see a stale streak. It also differs from the reminder and digest streak (notifications F14: cross-program, resets after a skipped day). | `services/memberAnalyticsService.js` | Undecided (out of scope). |
| **F2** | Re-giving after an undo on the same day notifies again, capped by the pair limit (at most 3 per pair per 24 h). | `routes/people.js` | Accepted. |
| **F3** | Live binaries get `activity.kudos_received` as a push banner only, with no pop-up (notifications D-C20). | notifications | Accepted. |
| **F4** | `GET /analytics/summary` `top_performers` can hold fewer than 5 rows for plain viewers. No client renders it. | `services/analyticsService.js` | Accepted. |
| **F5** | An undo can't recall a push that was already delivered, nor the iOS badge it set. If the day rolled over (or the recipient's zone changed) before the undo, the earlier day's kudos stays (`removed:false`). | `services/kudosService.js` | Accepted. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.1 | 2026-10-13 | **Web goes live.** `PEOPLE_LIVE = true` (`lib/api/people.ts`): `/members/list` = `PeopleList`, `People` labels, admin Invite in the People list, the visibility notice + Hide my activity, `/members/person` reachable. Decided by the user with Android 1.2.0 (7) public and iOS 1.5.2 (60) still in review (iOS App Store users get People with that release). The constant stays as a kill switch, so the roster isn't deleted. PATCH. |
| 0.1.0 | 2026-10-13 | **Initial SPEC — backend S1 (live) + the three Track C clients (reliability-overhaul Phase 4).** `/api/people` (list · profile · kudos give/undo), `members.hide_activity`, `kudos` (`sql/012`), "Hide my activity" through S0's `canView("workouts")` (program-memberships D-C6) + the route checklist and the 39-route GET inventory (§5); kudos content through notifications C8 (D-C29). Revision 3 with S1R-1 (active memberships only), S1R-2 (revert order, §8), S1R-3 (verification notes, §5). Clients: D-C13 (shared copy, notice, Hide toggle, web realization behind `PEOPLE_LIVE = false`), D-C14 (iOS + Android). `consumed_by` = web, ios, android. |
