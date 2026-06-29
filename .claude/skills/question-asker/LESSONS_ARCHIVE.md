# question-asker — LESSONS ARCHIVE (verbose run-by-run history)

> Full run history, moved out of `SKILL.md` to keep it lean (not auto-loaded into context).
> Durable, project-agnostic patterns are distilled in `SKILL.md` → "Converged lessons".
> **Protocol:** append one entry per skill run below; when a pattern proves itself across runs,
> promote it into `SKILL.md` "Converged lessons" and keep this archive as the detailed history.

## Lessons log (append every run — the self-learning loop)
Before ending a run, append what you learned: questions you wish you'd asked, a sweep step that was
missing/mis-ordered, a template that paid off, anything that made the target hard to map. This is
the most valuable 5 minutes of the session.

### 2026-06-28 — Run 1: backend `auth` feature (first SPEC in the repo)
**Target:** the `/api/auth/*` surface + `middleware/auth.js`, documenting the R1 Supabase-Auth migration.
**Sweep:** 3 parallel `Explore` agents (route+service · middleware+authz · models+config+server), then
I re-read the 3 load-bearing files in full (`authService.js`, `middleware/auth.js`, `routes/auth.js`) —
every `file:line` in the SPEC was verified against source, the maps held up 1:1.
**Questions:** 4 in one `AskUserQuestion` call (verify approach · scope cut · clients/proxy · stance);
all came back the faithful/recommended lead option. The genuinely-open one was the **JWT-verify claim
source** (JWKS+DB-lookup vs custom-claims auth-hook vs legacy HS256) — that's the load-bearing decision
for any "self-signed JWT → managed-auth-provider" migration; worth leading with.
**What paid off:** separating *already-locked-by-METHODOLOGY* decisions (proxy model, retire
member_credentials/refresh_tokens, auth_user_id) from *genuinely-open* ones up front — kept the round to 4
real questions instead of re-litigating R1. Surfacing the "legacy verify did NO DB lookup; Supabase `sub`
≠ members.id" tension in §1 framed the whole spec.
**What I'd do differently:** nothing major. For the next backend feature, reuse this SPEC's section
skeleton (it's now the de-facto feature-SPEC template — §B says shipped features are single-file).
**New pattern → promote:** for a migration feature, add a dedicated **"migration delta (what stays / what
changes)"** section (§7 here) — it's the highest-value part and keeps the faithful-vs-changed line crisp.

_Earlier note: this was a fresh ICM repo; `auth` is the first documented feature._

### 2026-06-28 — Run 2: backend `members` feature
**Target:** the five `/api/members` routes + `services/memberService.js` (+ `Member`/`MemberEmail` models).
**Sweep:** read the two load-bearing legacy files in full myself (route + service), then **2 parallel
`Explore` agents** mapped web vs iOS consumption. That consumption sweep was the whole ballgame.
**The payoff finding — "dead routes":** the agents proved **`POST /api/members` and `DELETE /api/members/:id`
are called by NEITHER client** (web creates via `/auth/register`, both manage participation via
`/program-memberships`; "delete" = unenroll, never full member deletion). That reframed a 5-route CRUD
feature into "read + self-profile-update, plus two vestigial admin routes." **Lesson: always run the
cross-app consumption sweep before assuming a backend route is live — a route existing ≠ a route used.**
**Hypothesis-first caught a real bug-shaped oddity:** legacy `createMember` (`memberService.js:38`)
destructures `password` but never persists it + writes no email → admin-created members can't log in. Led
the question with that as the hypothesis; the user chose to **fix it** (change over faithful) — wire
Supabase `admin.createUser`. **Lesson: when the faithful behavior is a latent bug, surface it as a decision
(faithful-keep vs fix-now); the user often picks fix.**
**Follow-up round locked mechanics, not vibes:** "fix createMember" implied a missing input — Supabase
`createUser` needs an **email**, but legacy `createMember` takes none. A second `AskUserQuestion` pinned the
email source (require explicit `email`) + the cleanup scope (createMember only, rest faithful) so the SPEC
stayed prescriptive. **Lesson: a "change/cleanup" answer needs a scope-pinning follow-up or the SPEC drifts
into "fix as needed."**
**Migration-column shape leak (re-sweep catch):** `getAllMembers` returns full rows; the model gained
`auth_user_id` (R1) → a faithful response must now **exclude** it to preserve the legacy shape. Subtle, only
surfaced on the completeness-critic pass. **Lesson: for any "returns full rows" handler, check whether the
migration added a column the legacy response never had.**
**Reused the auth deferral pattern:** `DELETE /:id`'s cross-feature cascade (invites/notifications/
membership-exit) is the same shape as auth `/account` → deferred → 501 under D-C1 ("reference, don't own"),
to ship when `program-memberships`/`notifications` land. Consistent staging across features.
**New pattern → promote:** "**Dead-route check via the consumption sweep**" — before speccing any backend
CRUD feature, confirm which routes each client actually calls; routes called by neither are vestigial and
get flagged (kept for parity), not treated as load-bearing.

### 2026-06-28 — Run 3: backend `programs` feature (3rd SPEC)
**Target:** the four `/api/programs` routes (`routes/programs.js` + `services/programService.js`) — the
program-lifecycle container. **Sweep:** read the route+service+`Program` model in full myself, fanned 2
`Explore` agents over web + iOS consumption. `consumed_by = [web, ios]` (both call all four routes).
**The central decision (scope cut) was a side-effect, not a route:** `updateProgram`/`deleteProgram` emit
`program.updated`/`program.deleted` via `utils/notifications` (`createNotification` +
`getActiveProgramMemberIds`), which drags in SSE streams + APNs push — the whole undocumented
`notifications` feature. Unlike the members `DELETE`→501 deferral (a *whole route* deferred), here the CRUD
stays fully functional and only the **side-effect** defers → a guarded `emitProgramNotification` no-op
(D-C1). **Lesson: the deferred-dependency pattern has two shapes — defer a whole route (501) OR defer a
side-effect inside a working route (guarded no-op). Pick by whether the route's core job needs the
dependency.**
**Cross-app divergence = a web-only field on a shared endpoint:** the agents proved `admin_only_data_entry`
is read+written **only by web** (edit-page toggle); iOS's `ProgramDTO` never decodes or sends it. The
backend faithfully serves/accepts it for both clients regardless — so the divergence is a *client* fact
(D-REF / §10 flag), not a backend change. **Lesson: a shared endpoint can carry a single-client field;
record it as D-REF + flag, don't try to "fix" the backend.**
**Dead-input (not dead-route) caught by the consumption sweep:** the `description` field is the create-time
analog of members' dead routes — `createProgram` persists+returns it, but `updateProgram` can't change it,
`getPrograms` never returns it, and **neither client sends it** (half-wired write-only field). Hypothesis-led
the stance question with it; user chose **change/clean up now** → drop it (D-C2). **Same scope-pinning
follow-up discipline as members:** a second `AskUserQuestion` pinned the mechanic (drop vs fully-wire vs keep)
+ confirmed nothing else changes — so the SPEC stayed prescriptive. **Lesson: the "vestigial surface" check
generalizes from routes to individual request *fields* — sweep what clients actually send, not just which
routes they call.**
**Soft-delete needs no 501:** unlike members `DELETE` (hard cross-feature cascade → deferred), `deleteProgram`
is a soft-delete (`is_deleted=true`, no cascade) → ports fully now. **Lesson: check delete semantics
(soft vs hard-cascade) before assuming a `DELETE` needs the deferral treatment.**
**Re-sweep catches (faithful flags):** `total_members`==`active_members` always (two aliases over the same
`status='active'` count); both clients decode an `enrollments_closed` field `getPrograms` never returns
(resolves undefined/nil). Both kept + flagged (§10 F2/F5) — clients read both keys, so collapsing would
break them. **Lesson: "always-equal" response pairs and "decoded-but-never-served" fields are faithful
flags, not cleanups, once a client depends on the shape.**

### 2026-06-28 — Run 4: backend `program-memberships` feature (4th SPEC)
**Target:** the 8 `/api/program-memberships` routes (`routes/memberships.js` + `membershipService.js`) + the
`handleMemberExit` cascade (`utils/programMemberships.js`). **Sweep:** read all three + the model in full
myself, fanned 2 `Explore` agents over web + iOS. `consumed_by = [web, ios]`.
**Scope cut was a shared-mount-path collision, not a sub-component split:** `inviteRoutes` co-mounts at the
SAME `/api/program-memberships` base path as `membershipRoutes` (server.js:49-50). So the cut wasn't "which
files" but "which of the routes served under this path does THIS feature own" — membership routes here,
invite routes → the `invites` feature. **Lesson: when two Express routers share a mount path, the scope
question is per-route-group, not per-path — grep the server mounts before assuming one path = one feature.**
**The dead-input/dead-route pattern recurred at scale:** the consumption sweep proved 3 of 8 routes are
called by NEITHER client (`POST /` createMemberAndEnroll, `GET /available`, `POST /enroll`) — iOS had dormant
APIClient methods with no call sites; web had no method at all. Same shape as members run 2. **And the same
latent bug recurred:** createMemberAndEnroll passes `password` + non-columns to `Member.create` (Supabase owns
credentials now) → unloggable member. Hypothesis-led it; user chose **fix** (mirror members D-C2). **Lesson:
the members `createMember` bug is a SERVICE-FAMILY bug — any legacy "create a member" path has it; check each.**
**Two changes needed two scope-pins:** the user picked "change/clean up" on BOTH the vestigial-routes
question (→ fix createMemberAndEnroll) AND the stance question. A stance "change" after an already-decided
fix is ambiguous, so a third `AskUserQuestion` enumerated the remaining cleanup candidates → "drop the 2
clean dead routes too" (D-C3). **Lesson: if the user picks "change" on stance AFTER a specific fix is already
decided, they mean ADDITIONAL cleanup — pin it with an enumerated follow-up; don't assume it just re-affirms
the fix.** Divergence from members: members KEPT its vestigial routes (parity); here the user chose to DROP
the 2 clean ones (createMemberAndEnroll kept because it got fixed). **Lesson: "keep-vestigial-for-parity" is
not automatic — ask; a clean dead route with no bug is a fair drop candidate.**
**Deferred-stub beats inline no-op when the dependency is called by NAME across modules:** programs deferred
its single emit with an inline `emitProgramNotification` no-op. But `handleMemberExit` + 3 service fns call
`createNotification`/`getActiveProgramMemberIds` by those exact names (faithful), so I created a deferred STUB
`utils/notifications.js` (real getActiveProgramMemberIds, no-op createNotification) that the `notifications`
feature later REPLACES wholesale — call sites unchanged. **Lesson: inline no-op for a one-off side-effect;
a named-API stub file when multiple faithful modules import the dependency by name (the stub becomes the
seam the real feature drops into).**

---

## Run 5 — `notifications` (backend feature; the keystone) — 2026-06-28

**Target:** the backend `notifications` feature — `routes/notifications.js` (6 routes) + `utils/{notifications,
notificationStreams,pushNotifications}.js` + `models/{Notification,NotificationRecipient,MemberPushToken}.js`.
The keystone: it had been pre-stubbed by a DEFERRED named-API stub (`utils/notifications.js`, run 4 D-C4) that
the programs/program-memberships emit call sites import by name. Porting = **replace the stub wholesale**, call
sites untouched.

**Shape:** confirm-heavy, 4 genuinely-independent decisions in ONE `AskUserQuestion` call (extended past the
tight-3 because the migration delta + the APNs-creds question + the vestigial-route/stance question were all
real and orthogonal). All four answered with the faithful lead option. 2 Explore agents (web + iOS
consumption) ran in parallel; both clients consume the SSE stream + unack/ack, iOS-only owns the APNs device
lifecycle, `POST /broadcast` is called by neither client (vestigial, like members `POST`/`DELETE`).

**The load-bearing decision was the SSE stream's AUTH, not its data.** Legacy `authenticateStream`
(`notifications.js:11-28`) verified a self-signed JWT with **symmetric `jwt.verify(token, JWT_SECRET)`**, read
from the Authorization header **OR a `?token=` query param** (browser `EventSource` can't set headers). Under
Supabase Auth there's no `JWT_SECRET` → this is the same token-verify migration the auth feature already made
(D-C2: JWKS + `sub`→`members.auth_user_id`), but applied to a SECOND endpoint with a query-param token source.
**New durable lesson (promoted): SSE/streaming/EventSource endpoints carry their OWN copy of the
token-verify path, and it's easy to miss because it's a bespoke inline middleware (not the shared
`authenticateToken`). For a "self-signed JWT → managed provider" migration, grep for EVERY verify call
(`jwt.verify`, bespoke `authenticate*` middlewares), not just the main one — each needs the same migration.
The streaming variant additionally needs a query-param token source (EventSource limitation); the faithful
port extracts the shared verify+rebuild helper (`resolveReqUser`) and adds a header-or-query wrapper.**

**APNs creds = a clean third deferral axis.** `pushNotifications.getProvider()` already returns `null` when
`APNS_*` is unset (legacy degrades gracefully: warn + skip). So "port the code now, supply creds later" is a
real, low-risk option distinct from the D-C2 migration — worth surfacing as its own question rather than
folding into stance. **Lesson: a feature can have MULTIPLE independent deferral axes (here: APNs creds,
separate from the SSE-auth migration and the cross-feature emit wiring); ask each as its own decision when the
code already degrades gracefully for it.**

**Stub-replacement confirmed the run-4 prediction.** The named-API stub seam worked exactly as designed: I
replaced `apps/backend/utils/notifications.js` (stub → real `createNotification`) and the programs/memberships
emit call sites lit up with ZERO edits. **Lesson reinforced: the deferred named-API stub is the correct seam
when N faithful modules import the dependency by name — the keystone feature drops in by replacing one file.**

**Scope stayed tight (D-C1 = module only).** The two deferred 501 delete cascades (members/auth) and the
`invites` emit are OTHER features' follow-ups — they don't belong to `notifications` even though they emit
through it. **Lesson: "owns the emit engine" ≠ "owns every emit call site"; the engine feature owns the engine,
the callers own their calls. Resolve this in the scope question so the run doesn't sprawl into wiring 3 other
features.**

---

## Run 6 — `invites` feature (backend; 2026-06-28, pm-12)

**Target:** the co-mounted other half of `/api/program-memberships` — 4 routes (`POST /invite`,
`GET /my-invites`, `GET /all-invites`, `PUT /invite-response`), `services/inviteService.js`, and the
`ProgramInvite`/`ProgramInviteBlock` tables. Faithful rebuild.

**Shape:** the tightest run yet — a clean confirm-heavy faithful rebuild. Read the 4 legacy files in full;
2 `Explore` agents (web · iOS) returned **identical** consumption — `consumed_by=[web,ios]`, all 4 routes
1:1, matching DTOs, matching role gating. **Zero cross-app divergence** (the D-REF that's usually the run's
biggest decision was a one-line confirm). 3-Q core round (scope / emits / stance) + 1 pinning follow-up
(which cleanups). Decisions: D-C1 (scope; inline accept-path join write) / D-C2 (emits LIVE) / D-C3a (drop
`target_member_id`) / D-C3b (fix N+1) / D-REF / D-S1.

**New durable patterns (promoted to Converged lessons):**

- **The "keystone realized" inversion.** notifications (run 5) was the engine; invites is the FIRST consumer
  ported *after* it. So the deferral question **flips**: where programs/program-memberships asked "defer the
  emit via a stub?", invites asks "wire it LIVE?" — and faithful = live (no stub), because the dependency now
  exists. **Lesson: once a keystone dependency is ported, downstream features that consume it have NO deferral
  axis for it — the faithful behavior IS the live behavior. Don't reflexively offer a stub option; confirm
  live.** (This is the mirror image of run 4/5's deferred-stub seam.)

- **A feature's owning tables may already be ported by a neighbor.** invites OWNS `program_invites` +
  `program_invite_blocks`, but program-memberships (run 4) already ported both models + all associations
  (`InvitedByMember`/`SentInvites`/blocks) because its exit cascade *writes* them (that SPEC F5). So the
  invites port was routes+service only — the model work was already done. **Lesson: before treating
  model-porting as work, check whether a neighbor that *writes* your tables already ported the models — the
  exit-cascade / cross-feature-write feature often lands the schema first. Verify with `ls models/` +
  `grep` the associations in `models/index.js`, don't re-port.**

- **The "fix-now" branch needs a pinning follow-up even when small.** User chose "fix some now" over pure
  faithful; the single follow-up locked EXACTLY two cleanups (drop `target_member_id`; batch the N+1) as a
  multiSelect, so everything unselected stays faithful + flagged. Reuses the members-run-2 pattern (a
  scope-pinning follow-up after a fix-vs-faithful decision) — confirmed it generalizes to *quality* cleanups
  (dead param, N+1), not just latent bugs. The fixed-but-recorded N+1 became F7 (the legacy characteristic
  that motivated the change) so the SPEC still documents the "as-was".

- **Dead-PARAM check, alongside the dead-ROUTE check.** The consumption sweep's job isn't only "which routes
  does each client call" (run 2) — it's also "which request FIELDS does each client send". `target_member_id`
  was destructured by the service but sent by neither client AND read by no code path — a vestigial param,
  caught only because both Explore agents enumerated the actual request bodies. **Lesson: have the sweep
  enumerate request-body fields per client, not just endpoints — vestigial params hide in the destructure.**

### 2026-06-28 — Run 7: workouts (the global workout library)
**Shape:** confirm-heavy faithful port, but the consumption sweep produced the run's biggest reframe — a
4-question round (scope cut · consumed_by/dead-routes · delete-guard change-candidate · drop-the-dup), all
leading with faithful. **The dead-route check, escalated to the extreme:** not just *some* routes unused
(members run 2) — here the **entire admin CRUD (`POST`/`PUT`/`DELETE`) is called by NEITHER client, and only
`GET` is live (iOS picker)**. Web's `fetchWorkouts` wrapper is *defined but never imported* — dead
scaffolding, easy to mistake for a live consumer if you grep the api module and stop there. **Lesson: a
defined api-client function is NOT proof of consumption — grep for its CALL SITES (imports/usages), not just
its definition.** That flipped `consumed_by` to a single client `[ios]` even though the backend serves both
and a (dead) web wrapper exists — record consumed_by by *live call sites*, flag the dead wrapper + unused
CRUD as §10 characteristics rather than inventing usage.
**Shared-service-FILE split along the COVERAGE boundary:** `services/workoutService.js` physically holds TWO
features — the global library (this run) and the program-scoped functions (`program-workouts`, the next
feature). COVERAGE already split them (lines 18 vs 19), so the scope cut was pre-drawn; the port splits the
file, taking only the 4 library fns and leaving the rest for the sibling. **Lesson: when one legacy service
file maps to two COVERAGE rows, the scope question is settled — own your half, port-split the file, name the
sibling as the owner of the remainder (§7 scope note + D-C1).**
**Byte-dup route as a clean drop:** `POST /mobile` was character-identical to `POST /` (same one-line body)
and called by no one — unlike members' kept-for-parity dead routes, a pure duplicate has zero behavioral
information, so the cleanup is *removal* (D-C2), not keep-and-flag. **Lesson: distinguish a vestigial-but-
distinct route (keep + flag) from a byte-identical duplicate (drop) — only the latter is safe to remove
under the faithful stance because nothing is lost.**
**Latent-rough-edge offered as a change, user kept faithful:** the bare unguarded `deleteWorkout` relies on
an un-cascaded FK to reject in-use deletes → ugly 500 (vs the sibling `deleteCustomWorkout`'s friendly-400
guard). Surfaced as a faithful-keep-vs-add-guard decision (like members' createMember bug) — user kept
faithful, so it lands as a flagged cleanup candidate (F2), not a silent port. **No migration delta** (model +
schema already ported with earlier features) — the SPEC says so explicitly so the faithful-vs-changed line
stays crisp even when "changed" is empty but for the one route drop.

### 2026-06-28 — Run 8: program-workouts (a program's workout list)

**Shape:** the cleanest faithful run yet — both clients call all 6 routes 1:1 with **zero divergence**
(`consumed_by = [web, ios]`), no dead routes, no byte-dups, no vestigial params, dedup pre-checks +
friendly in-use guard already present. Nothing to clean up. Tight 3-Q round (scope · stance · authz
location), then ONE pinning follow-up. **This is the SECOND half of the same shared service file `workouts`
(run 7) split** — confirming run 7's "port-split along the COVERAGE boundary" lesson from the other side:
the scope was pre-settled, the port just reunited both halves into `apps/backend/services/workoutService.js`.
**The genuinely-open decision wasn't faithful-vs-change in behavior — it was an ARCHITECTURE hoist.** The
legacy repeated an identical inline admin block in all 5 curation functions; the sibling `workouts` had
hoisted *its* (different, global-only `isAdmin`) gate to route middleware. So the real question was *where
authz lives*, and the user chose to hoist (the one deliberate change, D-C2). **Lesson: when a feature
repeats the same authorization block inline across N functions AND a sibling already uses middleware for an
analogous gate, surface "keep inline (faithful) vs hoist to middleware (match sibling)" as a first-class
decision — it's an architecture choice the code can't answer, distinct from the behavior stance.**
**The load-bearing follow-up for an authz hoist is STATUS-CODE FIDELITY.** Legacy ran its inline admin
check *after* the service's validation/lookup/type guards, so non-admins saw 400 (missing fields) / 404
(not found) / 400 (wrong-type) *before* 403. A naive "403-first" middleware silently flips those to 403 —
a non-breaking violation (CLAUDE.md). The faithful hoist is **resolve-or-pass-through**: a middleware
factory `requireProgramAdmin(resolveProgramId)` where each route's resolver returns the target program_id
(gate the 403) or **null to pass through** so the service emits its native pre-admin-check error. The
resolver must mirror *every* guard the legacy fn ran before its inline check (missing body field → null;
`/:id` row not found → null; wrong-type custom/global → null), and for `/:id` routes the resolver loads the
row to find its program_id (the service loads it again — accept the one by-PK read, keep them decoupled).
**Lesson: hoisting inline authz is only faithful if 403 fires at exactly the same point — encode the
legacy's pre-check guards into a per-route resolver and pass through everywhere else, so observable status
codes stay 1:1.**
**Pre-scaffolded generic middleware may not fit — check before reusing.** `middleware/auth.js` already had
a generic `requireProgramAdmin` (pre-ported, unused), but it 400'd on a missing programId and couldn't
resolve the `/:id` routes (program_id lives on the row, not the request). **Lesson: a same-named ported
helper isn't automatically the right tool — grep its usages (here: none) and verify its exact semantics
against the SPEC's decision; a feature-specific guard (loads the feature's model, mirrors the feature's
guard order) belongs co-located in the route file, leaving the generic helper untouched.** No migration
delta (models + schema pre-ported); stated explicitly.

---

## Run 9 — `workout-logs` (backend; the workout-logging write surface)

**Target:** the `workoutLogRouter` half of the shared `routes/logs.js` / `services/logService.js`
(`POST /`, `POST /batch`, `PUT /`, `DELETE /` + the two GET routes) + the `WorkoutLog` model.

**Sweep:** read `routes/logs.js` + the workout-log half of `logService.js` + `models/WorkoutLog.js` in
full; fanned 2 `Explore` agents over web + iOS consumption. Verified `req.user.role` is preserved 1:1
(legacy `authService.js:54` and the new `middleware/auth.js:29` both set
`role = global_role==='global_admin' ? 'admin' : 'member'`) — load-bearing for the `requester.role==='admin'`
gates that were about to be dropped with the GET routes.

**Findings that shaped the decisions:**
- **The file pair holds TWO COVERAGE rows** (workout-logs L20 + daily-health-logs L21) — the scope cut was
  pre-drawn (same as workoutService → workouts/program-workouts). Confirmed the shared HELPERS at the top of
  `logService.js` (`resolveLogPermissions`, `isProgramAdmin`, `assertDataEntryAllowed`,
  `findMemberByDisplayName`, `resolveProgramWorkout`, `isValidDateString`) are used by BOTH halves; the
  daily-health-only `parseOptionalNumber` is not.
- **Both GET routes are dead** — `GET /` (logs by date+programId) and `GET /member/:memberName` are called
  by NEITHER client; web + iOS both read workout history via `/api/member-recent` (member-analytics). The
  Explore agents grepped call sites, not wrapper definitions.
- **`POST /batch` is web-only** — iOS has no batch method; its quick-add widget loops single `POST /` calls
  across program ids (and rolls back with `DELETE /` on partial failure). The add/edit/delete trio is 1:1.

**6 decisions (D-C1 scope+drop, D-C2–D-C5 the four user-chosen cleanups, D-REF, D-S1).** The user opened
the cleanup door ("Faithful + targeted cleanups") and then a **scope-pinning multiSelect** offered the four
concrete oddities I found, each cited + with an honest caveat; the user selected **ALL four** — including
the authz hoist (D-C5) I explicitly advised against. So the port is faithful + 4 deliberate changes:
- **D-C2** single-log duration → positive whole number (was `isNaN`-only + `parseInt`, matched batch).
- **D-C3** collapse `addWorkoutLog`'s member-auth double-check (drop the pre-resolution name-string check,
  keep the authoritative post-resolution id check).
- **D-C4** de-dup the requester-membership lookups — `deleteWorkoutLog` called `resolveLogPermissions`
  twice (`:386` + `:400`); collapsed to one (hoisted above the `member_name` privacy pre-check, so a
  not-enrolled requester's 403 can precede a 404 — accepted, F9). `addWorkoutLog` inlines a single
  requester-membership read (canLogForAny + self-target reuse).
- **D-C5** hoist the `admin_only_data_entry` lock into a co-located `requireDataEntryAllowed`
  resolve-or-pass-through middleware (403 + message preserved; the lock now fires before the handler's
  other 400s, so locked+non-admin+invalid-body → 403 where legacy gave 400 — accepted, F6).

**The key NEW pattern (promoted): not every authz block is hoistable.** Distinguish a **pure pass/fail
gate** (`assertDataEntryAllowed` — throw-or-pass on the program lock → hoistable to middleware, à la
program-workouts) from a **boolean that drives business-logic branching** (`resolveLogPermissions` returns
`canLogForAny`, used inside the fn to decide *which member* you may act on → NOT hoistable; it stays inline).
Surfacing "hoist?" as a cleanup must say which mechanism is hoistable and why; offering to hoist the
boolean would be wrong.

**Other reinforced patterns:**
- The file-pair split extends to the ROUTE file too (`routes/logs.js` holds two routers); the first-ported
  half takes the shared helpers (they live once); the deferred half's helper (`parseOptionalNumber`) and the
  gate the first half hoisted away (`assertDataEntryAllowed`) are simply not ported yet — left for
  daily-health (which must add `assertDataEntryAllowed` back OR adopt the same `requireDataEntryAllowed`
  hoist). Stated as a §7 scope note so the next run knows.
- Dead-route handling by sub-type: the two dead GETs are **distinct** (not byte-dups) → the faithful default
  is keep-and-flag, but the user chose to **drop** them (a sanctioned deliberate change, D-C1) since neither
  client calls them; recorded for the parity audit. (Contrast workouts run 7's `POST /mobile` byte-dup =
  always-drop.)
- When the user takes a cleanup, the changed legacy shape is still recorded as an F-row (F7/F8/F9) so an
  audit sees what diverged from legacy.

**Port:** `services/logService.js` (4 live fns + shared helpers, cleanups applied; 2 GET fns +
`parseOptionalNumber`/`assertDataEntryAllowed` omitted), `routes/logs.js` (`workoutLogRouter` + the
middleware; exports `{ workoutLogRouter }` only), mounted `/api/workout-logs`. Boot check (4-route stack,
no GET, every route `[authenticateToken, requireDataEntryAllowed, handler]`, 5 service fns export, server
loads) passes. No migration delta (model + schema pre-ported).

---

## Run 10 — `daily-health-logs` (backend; the second half of the logs file pair)

**Target:** the `dailyHealthLogRouter` half of `routes/logs.js` + the daily-health functions of
`services/logService.js` (`addDailyHealthLog`/`getDailyHealthLogs`/`updateDailyHealthLog`/
`deleteDailyHealthLog`) + the daily-health-only `parseOptionalNumber` helper + `models/DailyHealthLog.js`.

**Sweep:** reused the full read of the daily-health half of `logService.js` + `routes/logs.js` from run 9;
verified `DailyHealthLog` model + associations pre-ported (composite PK `program_id+member_id+log_date` =
one row/day → the 409-on-dup; `food_quality` ↔ DB column `diet_quality` via the model `field` mapping).
Fanned 2 `Explore` agents over web + iOS.

**Findings — the inversion of run 9's asymmetry:** where workout-logs had 2 dead GET routes + a web-only
batch, **daily-health-logs is fully shared** — all 4 routes (POST/GET/PUT/DELETE) live on BOTH clients, no
dead routes, no divergence, and there's **no batch route at all** (both clients loop single POSTs in their
quick-add widgets). Lesson: don't assume the two halves of a file pair have symmetric consumption — sweep
each independently; one half can be messy (dead routes) and the other clean.

**5 decisions (D-C1 scope, D-C2 lock-reuse, D-C3 PUT-signature cleanup, D-REF, D-S1).** This run **confirmed
run 9's "second-half" lesson** and refined the lead choice:
- **D-C1 — append, reuse.** The first half (workout-logs) landed the shared helpers
  (`resolveLogPermissions`/`isProgramAdmin`) + the `requireDataEntryAllowed` middleware; this port appends
  the 4 daily-health fns + `parseOptionalNumber` and **reuses** those — not re-creating them. The reuse is a
  real `depends_on` edge to the sibling (`daily-health-logs` depends_on `workout-logs`).
- **D-C2 — the lead choice for a gate the first half hoisted is CONSISTENCY, not legacy-literal.** Run 9
  predicted daily-health "re-adds `assertDataEntryAllowed` or adopts the same hoist." Presented both, leading
  with **reuse `requireDataEntryAllowed` (consistency)** — and the user took it. The tell: re-adding the
  inline helper would make ONE file enforce the lock two different ways (inline for one half, middleware for
  the other). When the sibling already hoisted, "consistent with the shipped sibling" beats "literal to
  legacy" — both halves enforce identically. Same accepted ordering nuance carries over (F4).
- **D-C3 — a tiny signature cleanup is a legit user-chosen change.** `updateDailyHealthLog(parsed, requester,
  rawBody)` was called with `req.body` twice (the 3rd arg only for `hasOwnProperty` presence). Tidied to a
  single `(body, requester)` deriving both — behavior identical. Recorded the legacy shape as F6.

**Other:** D-REF settled with no question (all 4 routes 1:1 both clients) — recorded, not asked. The
`food_quality`↔`diet_quality` field mapping flagged (F5) so an audit knows the API field ≠ the column.
Port: appended to the existing file pair (both halves now reunited, like workoutService); boot check (9
service fns export, daily writes guarded + GET ungated, workout router unchanged, server loads) passes. No
migration delta (model + schema pre-ported).

---

## Run 11 — `analytics` (v1) (backend; program-level read aggregations)

**Target:** the `v1Router` half of `routes/analytics.js` + the v1 functions of `analyticsService.js`
(`getSummary`/`getTotalWorkoutsMTD`/`getTotalDurationMTD`/`getAvgDurationMTD`/`getActivityTimeline`/
`getHealthTimeline`/`getDistributionByDay`/`getWorkoutTypes`) + the shared date/bucket helpers + the two
analytics-only utils (`utils/dateRange.js`, `utils/queryHelpers.js`).

**Sweep:** read the full v1 half (1–472) of the 713-line `analyticsService.js` + the v1 route handlers + both
utils; `grep -rl` confirmed `dateRange`/`queryHelpers` are imported by NO other service (analytics-only → they
land with this first-ported half, v2 reuses them). All 6 models pre-ported. Fanned 2 `Explore` agents over
web + iOS.

**Findings:** the file pair holds two COVERAGE rows again (analytics v1 + analytics v2; `routes/analytics.js`
exports `v1Router`+`v2Router`, the service holds v1 fns / v2 fns / shared helpers) — and `memberAnalytics.js`
is a THIRD, separate feature. 8 of 9 v1 endpoints live on both clients 1:1, no divergence; the 9th
(`participation/mtd` v1) is **dead on both** — both call the v2 variant. **A versioned-API supersession is a
new dead-route flavor:** unlike a byte-dup or a never-used route, a v1 endpoint can be dead because a v2
successor (in the SIBLING feature) replaced it on every client. Confirm by sweeping for the v2 URL too.

**6 decisions (D-C1 scope, D-C2 drop-dead, D-C3+D-C4 cleanups, D-REF, D-S1).**
- **D-C1** scope = v1 half + the 2 analytics-only utils; v2 appends to the same files later; member-analytics
  separate. (Third file-pair split this session — logs, then analytics; the pattern is now routine.)
- **D-C2** drop the dead `participation/mtd` v1 route + `getParticipationMTD` (user chose drop). Its v2
  successor ships with `analytics-v2`, so the behavior isn't lost — just relocated to the sibling.
- **D-C3 + D-C4** — the user picked "faithful + cleanups" for a PURE-AGGREGATION feature, then a pinning
  multiSelect surfaced the one real correctness class: **server-local-timezone date formatting**
  (`toLocaleDateString`/`Intl.DateTimeFormat` with NO `timeZone` option, while all the surrounding bucketing
  parses UTC midnight). Split it by IMPACT: D-C3 = the distribution **weekday bucketing** (numeric — which day
  a log counts toward) vs D-C4 = the timeline **labels** (display only). User took both. **Key framing for an
  aggregation feature: a TZ "fix" that is a no-op on the deploy target (Render-UTC) but makes intent explicit
  is low-risk — say so** ("unchanged on UTC, just deterministic"), and scope it precisely (the same root cause
  also lives in `buildMTDDateRanges`/`getPeriodRange`/`resolveTimelineWindow` labels, left UNFIXED + flagged
  F4/F6 because the user pinned only the two sites — don't silently widen the cleanup).
- **D-S1** faithful VERBATIM — analytics is the canonical verbatim-port feature: every `Promise.all`
  aggregation, `activeMembershipInclude` inner join, `fn("COUNT","*")` idiom (F7), and response shape ported
  exactly. The numbers must match legacy, so resist "improving" the SQL.

**Port:** both utils verbatim; `analyticsService.js` = helpers + 8 v1 fns with the 2 UTC fixes (v2 fns +
`getParticipationMTD` omitted); `routes/analytics.js` = `v1Router` 8 routes exporting `{ v1Router }`; mounted
`/api/analytics`. Boot check (8 routes no `participation/mtd`, all `authenticateToken`, 8 fns export, utils
load, 4 `timeZone:"UTC"` present, server loads) passes. No migration delta (read-only; models pre-ported;
utils faithful new files).

---

## Run 12 — `analytics-v2` (backend, the v2 half of the shared analytics file pair)

**Target:** the `v2Router` 6 routes + the 6 `*V2`/workout-type fns of the shared
`routes/analytics.js`/`analyticsService.js` — the OTHER half of the file pair `analytics` (v1, run 11)
created. The shared date/bucket helpers + the 2 utils (`dateRange.js`/`queryHelpers.js`) already landed with
v1, so this half added NO new files — it appended fns to the service + a router to the routes file + one mount.

**Sweep:** read the full legacy v2 half (471–692) + the `v2Router` handlers (124–195) + the already-ported v1
files (to confirm every shared import/helper/util the v2 fns need is present — all were). 2 `Explore` agents
over web + iOS v2 consumption **agreed exactly**: 5 of 6 v2 routes live 1:1 on both clients (participation/mtd
+ the 4 workout-type tiles), and **`GET /summary` (v2) dead on BOTH** — both call the v1 summary.

**Decisions:**
- **D-C1** scope = the v2 half appended to the shared files; reuse helpers/utils (no new files);
  `member-analytics` separate. (v1's D-C1 had already committed this — stated as context, lightly confirmed.)
- **D-C2** (user chose drop) **drop the dead `GET /summary` (v2) + `getSummaryV2`** — both clients use the v1
  summary. Distinct-but-superseded (optional `programId`/global agg, `member_name`, no `program_progress`),
  not a byte-dup. Dropping it also removed the only server-local-TZ `distribution_by_day` site in the v2 half
  → **no UTC cleanup needed in v2** (v1 needed D-C3/D-C4; v2 needed none once summary was gone).
- **D-REF** `[web, ios]` 5 routes 1:1, no divergence.
- **D-S1** faithful verbatim otherwise.

**Flagged F1–F6:** F1 `getParticipationMTDV2` byte-identical to the v1 `getParticipationMTD` v1 dropped (now
the live participation card — two names, one body); F4 `getHighestParticipationWorkoutType`'s member-scoped
branch dead (both clients call it program-wide); F2/F5/F6 inherited from v1 (no per-program read authz, MTD
server-local boundaries, `COUNT('*')`+raw-`DISTINCT "WorkoutLog"."member_id"` idioms).

**Port:** appended the 5 v2 fns to `analyticsService.js` (`getSummaryV2` omitted) + extended exports; appended
the `v2Router` (5 routes, no `/summary`) to `routes/analytics.js` (now `{ v1Router, v2Router }`); mounted
`/api/analytics-v2` in `server.js` (removed the placeholder comment). Boot check (v2 5-route stack no
`/summary`, all `authenticateToken`, 5 fns export + `getSummaryV2` absent, v1 unchanged, server loads) passes.

**New durable lesson — versioned-dead-route supersession is SYMMETRIC / the mirror-drop.** Run 11's lesson said
"a v1 route can be dead because a v2 successor replaced it." Run 12 is the **mirror**: a **v2** route can be
dead because the clients **kept the v1** predecessor (`/summary`). So when you port the SECOND half of a
versioned file pair and the FIRST half already dropped its dead versioned route (v1's D-C2 dropped the dead v1
participation/mtd because clients used v2), the consistency move is to **drop the second half's dead versioned
route too** (drop the dead v2 summary because clients use v1) — each version sheds the half-route its clients
abandoned, and the dead route can point EITHER direction. Confirm by sweeping for BOTH the v1 and v2 URL of the
overlapping endpoint, per client. Bonus: dropping the dead fn can also delete the only instance of an earlier
half's cleanup class (here, the v2 summary held the sole TZ-bucketing site), so the second half may need
**fewer** cleanups than the first, not the same set — don't reflexively mirror the cleanups, only the drop.

## Run 13 — `member-analytics` (backend; the per-member analytics surface — its own file pair)

**Target:** the per-member analytics read API — `routes/memberAnalytics.js` (4 separate routers:
`metricsRouter`/`historyRouter`/`streaksRouter`/`recentRouter`, mounted `/api/member-{metrics,history,streaks,
recent}`) + `services/memberAnalyticsService.js` (`getMemberMetrics`/`getMemberHistory`/`getMemberStreaks`/
`getMemberRecentWorkouts` + helpers `ensureProgramAccess`/`computeStreaks`/`isInCurrentMonth`/`SORTABLE_FIELDS`/
`milestonesList`). A **separate file pair** from analytics/analytics-v2 (one COVERAGE row).

**Sweep:** read both legacy files in full. All 6 models pre-ported; WorkoutLog↔ProgramWorkout uses the default
alias (so `.ProgramWorkout` accessor + `order:[[ProgramWorkout,"workout_name",dir]]` work). 2 `Explore` agents
(web + iOS) agreed **exactly**: all 4 endpoints live on BOTH clients 1:1, **no divergence, no dead routes**
(`member-recent` is the shared workout-history read — the one that made workout-logs drop its 2 GETs; `member-
metrics` is dual-use leaderboard + single-member card on both, via optional `memberId`). All sort/filter
delegated to the backend on both clients.

**Decisions:** D-C1 scope = its own file pair. D-C2 (user chose faithful) re-export the 3 timeline helpers from
`analyticsService.js`. D-C3 + D-C4 (user pinned both via the cleanup multiSelect) = C1 extract the shared
requester-access prelude for history/streaks/recent into `assertMemberAccess` + C2 guard null
`program.start_date` in `getMemberStreaks`. D-REF `[web, ios]` 4 routes 1:1. D-S1 faithful verbatim otherwise;
no UTC cleanup (dates already UTC-correct). F1–F7.

**New durable lesson — the RE-EXPORT wrinkle (the inverse of the file-pair-split lesson).** When an earlier
feature ports a shared service file and trims internal helpers from its `module.exports` because *nothing
consumed them yet* (correct at the time — v1/v2 analytics dropped `resolveTimelineWindow`/`buildBuckets`/
`bucketKey` from exports), a LATER separate-file-pair feature that `require`s those helpers from the sibling
will get `undefined` → runtime crash. The faithful fix is to **re-add the names to the sibling's exports**
(restoring the legacy export surface) — single-sourced, NOT duplicated into the new file (a byte-dup / drift
risk). This is a tiny, additive, NON-behavioral change to an already-built feature → it shows up as a touched
file at commit and warrants a **patch bump** on that sibling. Detect it early: in the opening sweep, grep the
target service's cross-service `require`s and confirm each imported name is actually exported by the *ported*
sibling (not just the legacy one). Surface "re-export (faithful, single-sourced) vs duplicate locally" as a
decision; the re-export is the lead.

**Reinforced — sibling read features need NOT share the same authz posture.** v1/v2 analytics are
`authenticateToken`-only (their F2 = no per-program read gate); `member-analytics` enforces `ensureProgramAccess`
(global-admin OR active membership) on every route. Don't assume a neighboring analytics feature's authz stance
carries over — check each; here it flips from absent → enforced, recorded as the *secure* characteristic (F1),
kept as-is.

**Reinforced (run 9) — don't de-dup checks that target DIFFERENT entities.** Each single-member fn calls
`ensureProgramAccess` (gates the REQUESTER) then a separate `ProgramMembership.findOne` (verifies the TARGET
`memberId` is enrolled → 404). They look like a redundant double-lookup but check different members — collapsing
them would be a correctness regression. So C1 (D-C3) extracts the *shared 3-step prelude* (which keeps BOTH
lookups, just unifies the repeated 400/403/404 sequence across history/streaks/recent) — it does NOT merge the
two membership queries. `getMemberMetrics` was excluded from the extraction (different shape: program-wide,
optional `memberId`, its own `Program.findOne`, and a distinct 403 message "Program membership required." vs the
single-member "Active program membership required.").

**Port + boot check:** re-added the 3 helpers to `analyticsService.js` exports; wrote `memberAnalyticsService.js`
(verbatim + `assertMemberAccess` + the start_date guard) + `routes/memberAnalytics.js` (verbatim) + the 4
`server.js` mounts. Boot check: analyticsService re-exports the 3 helpers (OK), 4 service fns export (OK), 4
routers each `GET /` = `[authenticateToken, handler]` (OK), server.js fully loads (only the bogus-DB connect
fails at runtime, as expected), syntax clean on all 4 files. Runtime smoke-test deferred to the batched
pre-cutover pass.

---

## Run 14 — `app-config` (+ push index) · 2026-06-29 (am-6) · the LAST backend feature; backend coverage complete

**Target:** `app-config` — the inline `GET /api/app-config` (`{ min_ios_version }`) iOS version gate + the
`MIN_IOS_VERSION` env. The 14th and final backend feature, closing `COVERAGE.md` L26 (`app-config (min iOS
version) + push (APNs)`). FEATURE spec, `consumed_by = [ios]`.

**New durable pattern — the DOCUMENTATION-ONLY / already-ported feature.** The carried Next-action flagged that
this feature's code "mostly landed" with prior features. The FIRST move was to *confirm by grep/diff* that
nothing remained to PORT — and it didn't: `GET /api/app-config` was already inline + byte-identical in
`server.js`; the whole push/APNs surface (device routes `PUT`/`DELETE /api/notifications/device`,
`pushNotifications` util, APNs dispatch, `member_push_tokens` table, `APNS_*` env) landed with `notifications`;
`upsert/removePushToken` + the login push-capture landed with `auth`. So the SPEC's job flipped from "port +
document" to "document + index." **Lesson:** when a feature's code is already spread across earlier features,
the run is a *confirmation sweep + a SPEC*, not a port. Verify with grep/diff before assuming there's code work.

**New durable pattern — OWN the undocumented piece, REFERENCE the already-documented piece (don't re-doc → SSOT).**
A bundled COVERAGE row ("app-config + push") can split across what's genuinely undocumented (app-config) vs
what a sibling SPEC already owns (push → `notifications` + `auth`). The scope cut: **own app-config; reference
push via a §6 cross-reference index** (a map of the end-to-end APNs path pointing to the owning SPECs), NOT a
re-documentation. Re-documenting push here would duplicate `notifications`/`auth` — the exact single-source-of-
truth violation `health-check` flags. Lead the scope question with "own X, reference Y"; the §6 index closes the
COVERAGE row without duplication.

**New durable pattern — documentation-only ≠ faithful-only; a doc run can still carry a deliberate change.**
The stance question still offered "change now," and the user took it — a scope-pinning multiSelect locked
exactly 2 cleanups on the OWNED surface (the 3rd, "extract to a route file," left unselected, consistent with
the separate "keep inline" answer): **D-C2** add `Cache-Control: public, max-age=300` (iOS polls the gate on
every launch/foreground/widget-open — 3 triggers, per the sweep) + **D-C3** trim + semver-validate
`MIN_IOS_VERSION` via a new `normalizeMinIosVersion` (`^\d+(\.\d+)*$`, else `null`) so a malformed env yields no
gate rather than a broken client comparison on iOS. **Lesson:** don't assume a doc-only feature is automatically
faithful-1:1; ask the stance, and if the user picks change-now, run the same scope-pinning follow-up
(multiSelect of concrete code-grounded cleanups; unselected stay faithful + flagged) used for porting runs.

**Reinforced — the consumption sweep settles `consumed_by` for BOTH halves, and "iOS-only" is a real answer.**
Two `Explore` agents (web + iOS) agreed: app-config AND push are `consumed_by = [ios]` only. Web consumes
*neither* — no `/api/app-config` call (it has no version to gate; it's served fresh from Vercel) and no
device-token registration (it receives notifications via SSE/`EventSource`, never APNs). The web-ignores-both
is recorded as a flagged characteristic (F5), not a divergence to reconcile. A backend route existing ≠ both
clients calling it; the sweep tells you which client(s) actually do.

**Scope + stance decisions:** D-C1 (own app-config, reference push; keep inline) · D-C2 (Cache-Control) · D-C3
(trim/validate `MIN_IOS_VERSION`) · D-REF (`consumed_by = [ios]`; web consumes neither) · D-S1 (faithful 1:1
except D-C2/D-C3). Flagged F1–F5: `device_id` sent-but-always-nil by iOS (`LoginView.swift:157` passes `nil`;
unique `device_token` is the real key); no explicit logout `DELETE /device` (only on notification-permission
denial); the public no-auth route (gate runs pre-login); operator-managed env not in `render.yaml`; web ignores
both.

**Port + boot check:** applied the 2 changes to `server.js` (added `normalizeMinIosVersion` + `Cache-Control`
header). Boot check: `node --check server.js` OK; `normalizeMinIosVersion` verified (trims, accepts
`1.2.3`/`2`, rejects `v1.2`/`latest`/empty → `null`). Registered in registry.json + REGISTRY.md + COVERAGE
(backend section now fully ticked). Runtime smoke-test deferred to the batched pre-cutover pass. **Backend
feature coverage complete (14 features); next phase is `web`.**

---

## Run 15 — `splash` (web page) — the FIRST page/screen spec (2026-06-29)

**Phase flip: feature SPECs → page/screen SPECs.** With backend feature coverage closed (14 features), this
is the first run under the **page/screen template** (§0), not the feature template. The §0 sections (identity,
why, route, contents-with-`file:line`, components+features-consumed, data/API, **role-based view rules**,
states/edge-cases, §9/§10/§11) all apply; the §9/§10 question loop is shared with feature runs.

**A trivial public leaf page collapses to the 2-Q tight shape — and that's correct, don't manufacture more.**
Splash is a 108-line public page: typewriter intro + `BrandMark` + Sign-in CTA → `/login`, with an
authenticated→`/programs` redirect. It makes **no API call** (consumes only the foundation `useAuth`). The
genuinely-open decisions were exactly two: **stance** (faithful) and **the cross-app brand divergence**. No
scope-cut question (a leaf page owns itself — there's no module boundary to draw), no borderline-UI question
(every control does something). Counting real decisions beat padding to the canonical 3.

**Role-based view rules can be legitimately N/A — but you still fill the dimension.** Splash is pre-auth, so
there is no role when it renders. Rather than skip §7, state it explicitly: a one-row "unauthenticated (any
visitor)" + "any authenticated role → redirected to `/programs`" table, and note `admin_only_data_entry` is
irrelevant. The mandatory dimension is *answered* (N/A with the reason), not omitted.

**Cross-app divergence is still the signature decision on a leaf page — and "flag it as a defect on the OTHER
client" is a distinct answer from "keep as-is".** Web renders the real `BrandMark` (`app-icon.png`); iOS
`SplashView.swift:113-128` renders a placeholder (orange circle + `chart.bar.fill`, accessibility-labeled
"Brand icon placeholder"). The user chose **keep web's real logo (faithful) AND mark the iOS placeholder a
bug to reconcile at the iOS splash port** — so D-REF records "web wins on the brand mark" and F3 is a
**rebuild-cleanup = yes (iOS defect)**, not the usual "kept, faithful". Page-spec divergences can be one-client
defects, tracked as forward open-items for the other client's port, without changing the web port. Two more
divergences kept as plain faithful characteristics: F1 (the authenticated→programs redirect is web-only — iOS
routes signed-in users at the app root) and F4 (42 ms vs 55 ms type speed, cosmetic).

**Page-spec-specific flagged characteristics: the "no loading gate" flash.** The typewriter `useEffect` runs
on mount unconditionally while the redirect waits for `!isBootstrapping` — so a returning authenticated user
briefly glimpses the intro before redirect (F2). This is the page-spec analogue of a backend "vestigial
behavior" flag: a faithful cosmetic oddity, rebuild-candidate (gate render on `isBootstrapping`). Also note
**forward dependencies** explicitly in §8 — splash links to `/login` + redirects to `/programs`, neither built
yet (first page of the auth path); that's expected, not a gap.

**Foundation is ported directly, NOT via question-asker.** Before this run, the web foundation scaffold
(config + all `src/lib/*` + globals + providers + layout + shell + middleware + icons) was ported as
infrastructure (mirrors the backend foundation port) — question-asker is for *pages*. Two foundation seams
that became this run's context (stated, not re-asked): the `NotificationsGate` deferred stub (returns null
until the web notifications feature lands) and the `src/middleware.ts` HS256→ES256 incompatibility (inert —
no protected routes exist yet; open decision for the auth-path SPEC). The auth-path middleware decision is the
real one looming for the `/programs` / login runs.

**Port + build check:** wrote `specs/pages/web/splash/SPEC.md` (the first page spec) + ported
`src/app/splash/page.tsx` + `src/components/BrandMark.tsx` verbatim. `npm run build` ✓ (`/splash` route
prerendered). Registered in `specs/pages/REGISTRY.md` (web table) + COVERAGE (public row → `[~]`, splash
ticked). Decisions: **D-REF** (`consumed_by=[web]`; iOS placeholder divergence) · **D-S1** (faithful 1:1, no
code changes). Flagged F1–F4. Next: `login` (where the auth-path middleware + the real auth round-trip get
exercised).

---

## Run 16 — `login` page (web), 2026-06-29 (the 2nd web page spec; first page with a deliberate addition)

**Target:** the public `/login` sign-in screen + the entry to a net-new auth-recovery path. **Kind:** page
spec (web). **The run's signature:** unlike `splash` (pure faithful 1:1), the user mandated a *new
capability* — Supabase-Auth self-service recovery (forgot/reset-password) + mandatory-validated sign-up
email — so the page is faithful-1:1 **plus ONE scoped addition**.

**Sweep — fan out over BOTH legacy clients AND our own ported stack (the key move).** 3 `Explore` agents:
(1) legacy web login UI, (2) legacy iOS auth, (3) **our ported web foundation + backend auth + the auth
SPEC**. Agent 3 was the high-value one: it revealed what already exists so the work reshaped from "build
everything" to "wire the gap" — our `register` already creates a loginable Supabase user with an email
(members D-C2), and Supabase `resetPasswordForEmail` is available but **no backend route calls it**. Agents
1+2 confirmed forgot-password/reset/email-verification exist on **neither** client (100% net-new). For a
net-new cross-surface capability, always sweep the rebuilt stack too, not just the legacy reference — the
"what's already half-built" finding changes the scope question.

**Decision round — decide-heavy auth shape (4 Qs, all user-answered):**
1. **Scope** — *login page only + plan the rest* (vs whole auth-recovery path now). Chose page-only: the
   forgot-password/reset pages + sign-up email enforcement + the backend `auth` routes each become their own
   follow-up spec/port. Keeps the page spec focused (ICM page-by-page norm).
2. **Reset trigger** — *always-send + always-visible contact link* (vs detect-then-branch vs show-both). The
   user's verbal intent was "detect no-email → show contact," but the always-send path (Supabase replies "if
   an account exists, a link was sent") + an always-visible `mailto:` fallback is **privacy-safe (no account-
   email enumeration)** and simpler. Lesson: lead the option with the user's literal idea, but offer +
   recommend the leak-free default; the user picked it.
3. **Reset path** — *through the Express backend* (vs web embeds Supabase client). R1: clients never embed
   Supabase → new `auth` routes + a MINOR auth-feature bump when built.
4. **Support email** — `vinay.sankara@gmail.com`, an explicit **placeholder that may change** → wire as a
   config/env value (reuses the iOS `APIConfig.supportURL` precedent).

**Output:** ported `apps/web/src/app/login/page.tsx` faithful 1:1 + **D-C1** (one addition: "Forgot your
password?" link → `/forgot-password`, with a comment marking it non-legacy). `npm run build` ✓. SPEC v0.1.0:
**D-REF** (`[web]`; iOS `LoginView` identical bar the new link) · **D-S1** (faithful) · **D-C1** (the
addition) · **D-PLAN** (the whole recovery path's pinned decisions, so the deferred follow-ups inherit them).
Flagged F1–F5 (client JWT decode; no bootstrap gate/form flash; iOS recovery gap; no client rate-limit; no
inline validation). Registered + COVERAGE ticked. Memory saved + updated mid-run when decisions superseded
the initial assumption. **Next:** `forgot-password` page (build the link target + the backend `auth` routes).
