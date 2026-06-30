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

---

## Run 17 — `forgot-password` page (web) + the net-new `POST /auth/forgot-password` (2026-06-29)

**Target:** the `/forgot-password` page (login SPEC D-C1's link destination) — recovery step 1 of 2. The
**third web page spec**, and the **first 100%-net-new page** (run 16 already confirmed recovery exists on
neither client). Page mode.

**Pre-locked vs genuinely-open — the short-round discipline paid off again.** Login's D-PLAN had already
resolved almost everything (always-send + always-visible `mailto:` fallback; support = `vinay.sankara@gmail.com`
placeholder via config; reset-through-Express). And METHODOLOGY R1 locks "clients never embed Supabase" → the
reset link MUST land on our own `/reset-password` page, not Supabase's hosted one — so I **stated that as
context, did not ask it** (presenting "use Supabase's hosted page" would offer something R1 forbids). After
removing the locked + pre-decided items, only **2 genuinely-open decisions** remained → one 2-Q round.

**The 2 real decisions:**
1. **Scope** — *"Page + forgot route only"* (vs page + both backend routes, vs page only). User chose the
   minimal by-page vertical slice: build the forgot-password page + the **one** route it calls
   (`POST /auth/forgot-password`, auth MINOR → 0.3.0); **`reset-password` page + `POST /auth/reset-password`
   = next run** (auth → 0.4.0). New lesson: **cut a multi-step net-new flow BY PAGE — each page paired with
   the single route it calls** — rather than "all backend now, pages later." Two small reviewable slices,
   each builds something that works end-to-end, at the cost of two MINOR bumps (cheap; the changelog records
   both). The "one MINOR bump for both routes" wording in D-PLAN was a guess that the per-page cut improved on.
2. **Email field** — *add inline email-format validation* (vs match login's no-validation F5). User added it:
   this field is **email-only**, unlike login's username-or-email identifier, so format validation is
   meaningful here where it'd be misleading on login. New lesson: **a sibling page's flagged "kept-as-is"
   characteristic (login F5) is NOT automatically inherited — re-evaluate it against THIS page's input
   semantics.** Recorded as a deliberate divergence (D-C2), cross-referencing login F5.

**Privacy-safe by construction (the always-200 contract).** `requestPasswordReset` always returns the same
generic `200 { message }` regardless of existence/validity/delivery, swallows Supabase errors, and only calls
`resetPasswordForEmail` when the email is format-valid — no account-enumeration. The client mirrors it: a
genuine network/500 failure shows a **neutral** retry message (a 500 is not existence info), and success shows
a fixed generic banner, not the server text. The **always-visible `mailto:` fallback** (shown in BOTH the form
and success states) is the path back in for migrated **placeholder no-email accounts** that literally can't
receive a reset email — the structural reason it's always visible, not conditional.

**Net-new ≠ no reference patterns.** With no legacy file to port, faithfulness was to the **sibling auth pages'
chrome** (D-S1): reused login/splash's `BrandMark`, `motion.div` fade-in, `input-shell`/`button-primary--dark-white`,
`rf-*` tokens, and the already-authed→`/programs` redirect verbatim. Net-new pages still get a "faithful"
stance — to the established in-repo design language, not to legacy.

**Forward-dependency wiring done right.** The reset link's `redirectTo` (`PASSWORD_RESET_REDIRECT_URL`,
committed in `render.yaml` = `https://rasifiters.com/reset-password`) points at a page that lands next run, and
web isn't on Vercel yet — so the route is **inert until web deploys + a real user triggers it** (mirrors login →
`/programs`). Code degrades gracefully (unset env → Supabase Site URL fallback). Flagged as F4 (resolved next
run), not hidden.

**Output:** backend `requestPasswordReset` + public `POST /forgot-password` + `PASSWORD_RESET_REDIRECT_URL`;
web `SUPPORT_EMAIL` + `requestPasswordReset()` + `app/forgot-password/page.tsx`. Boot check ✓ (public route,
1 handler), `npm run build` ✓ (`/forgot-password` prerendered, 3.94 kB). SPEC v0.1.0 (D-REF net-new / D-SCOPE
/ D-C1 / D-C2 / D-C3 / D-S1; F1–F5). Auth SPEC → 0.3.0 (route #9, D-C4, changelog) + registry/REGISTRY/page
REGISTRY/COVERAGE. **Next:** `reset-password` page + `POST /auth/reset-password` (auth → 0.4.0).

---

## Run 18 — `reset-password` page (web) + NET-NEW `POST /auth/reset-password` (auth → 0.4.0)

The **reset/consume half** of the by-page recovery slice that run 17 (`forgot-password`) started — the email
link's destination. Page mode. 4th web page, 2nd net-new. **The recovery path is now end-to-end** (forgot →
email → reset → login). Stance pre-locked by the run-17 D-PLAN/D-SCOPE (this page was explicitly named "next
run"); a tight **3-Q** round on the genuinely-open decisions, all answered with the recommended lead option.

**The flow type is the load-bearing, code-determined fact — grep the client default before designing the
token transport.** supabase-js 2.108.2 defaults to the **implicit** flow, so `resetPasswordForEmail` lands the
recovery session in the URL **fragment** (`#access_token=…&type=recovery`), consumable by any browser. PKCE is
**architecturally unusable here**: the backend INITIATES the reset (`resetPasswordForEmail`) but an ARBITRARY
BROWSER (the locked-out user's, at `/reset-password`) COMPLETES it — a PKCE code verifier would be stranded on
the server-side initiating client (`persistSession:false`), so the user's browser could never exchange the
`?code=`. So implicit isn't a preference, it's forced by the "backend initiates, arbitrary browser completes"
shape. Pinned `flowType: "implicit"` explicitly in `config/supabase.js` (already the default — defensive
against a future supabase-js flip; no effect on signInWithPassword/refreshSession, which aren't code-exchange
flows). **Generalizable:** for any managed-auth provider where the server starts a flow a different client
finishes, the implicit/fragment path is the one that survives — verify the SDK default + pin it.

**The second half of a by-page net-new slice can REUSE an existing backend service fn — don't reflexively add
a new one.** The recovery `access_token` is a normal Supabase access JWT (aud=authenticated), so
`authenticateToken` already JWKS-verifies it + maps `sub`→member — meaning `POST /auth/reset-password` is just
`authenticateToken` + the **existing** `changePassword(req.user.id, new_password)`. No bespoke `resetPassword`
service fn; the password update + policy stay single-sourced (the recovery token simply substitutes for the
authed bearer). The lead option in the backend-design question was this reuse ("Bearer + reuse changePassword")
vs a parallel bespoke service path; reuse won. Run-17's "each page paired with the SINGLE backend route it
calls" still holds — but the route can be a 7-line handler delegating to a shared fn, not new logic.

**Don't auto-inherit a sibling's KEPT-AS-IS choice — re-evaluate against THIS page's semantics (the run-17
lesson, applied again, opposite direction).** Run 17 ADDED inline validation that login (F5) lacked, because
its field is email-only. Run 18: the set-new-password screen warrants a **confirm field + an inline policy
hint** (mirroring the server `validatePassword`: ≥8/upper/lower/digit) + a match hint — neither present on the
single-password login/forgot fields, because a password a user can't see-and-retype is a typo waiting to lock
them back out. The lead/recommended option, picked.

**Post-recovery destination: keep recovery SEPARATE from login (R1 fit).** Chose in-page success → redirect
to `/login?reason=password-reset` (a new green positive banner case alongside login's amber session-loss
banners — login SPEC patch 0.1.0→0.1.1) over auto-login → `/programs`. Auto-login would mean embedding the
Supabase recovery tokens as a client session, but those are Supabase-shaped, not our legacy login payload —
extra plumbing + mild R1 tension. Redirect-to-login is the clean default: the user signs in fresh with the new
password. **The patch bump on a SIBLING page** (login gained one banner case) is the cheap, honest record of a
cross-page ripple — same shape as run-13's re-export patch bump, but for a page spec.

**Edge handling for a token-bearing page (faithful defaults, flagged not asked):** parse the fragment in a
mount effect, then **scrub it from the address bar** (`history.replaceState`) so the token doesn't linger in
history (F5). Three paths collapse to one "invalid/expired link → request a new one → `/forgot-password`"
state: (a) `#error=…` in the fragment, (b) no `access_token` (direct visit), (c) a **401** at submit (token
expired between landing and submitting — `ApiError.status === 401`). And the already-authed→`/programs`
redirect is **suppressed when a recovery token is present** (a logged-in user who clicked a reset link still
intends to reset — F4) — a small but real divergence from the siblings' unconditional redirect.

**Output:** backend `POST /auth/reset-password` (reuses `authenticateToken` + `changePassword`) +
`flowType:"implicit"` pin; web `resetPassword()` + `app/reset-password/page.tsx` + the login `password-reset`
banner. Boot check ✓ (route mounted, mw=2 = authenticateToken + handler), `npm run build` ✓ (`/reset-password`
prerendered, 4.28 kB). SPEC v0.1.0 (D-REF net-new / D-SCOPE / D-C1 Bearer-reuse / D-C2 success→login / D-C3
confirm+policy / D-C4 implicit-fragment / D-S1 sibling chrome; F1–F6). Auth SPEC → 0.4.0 (route #10, §4/§6,
D-C5, changelog); login SPEC → 0.1.1 (banner); registry/REGISTRY/page REGISTRY/COVERAGE. **The recovery path
is end-to-end. Next:** `create-account` page + sign-up-email-mandatory (D-PLAN item 3).

---

## Run 19 — `create-account` (web sign-up page, 5th web page) — 2026-06-29

**Target:** the public `/create-account` sign-up page — the last leg of the public/auth path
(splash → login → forgot → reset → **create-account**). Carried D-PLAN item 3 ("sign-up email mandatory +
format-validated, forward-only"). Faithful port of the legacy web page + sign-off cleanups.

**Sweep:** 3 `Explore` agents — legacy web create-account · our ported web foundation + sibling auth pages ·
backend register route. Then verified the legacy page, our `api/auth.ts`, the forgot-password page (for the
inline-validation pattern), and `Select`/`SelectMobile` myself.

**The headline finding — a D-PLAN mandate already satisfied SERVER-SIDE; the delta was client-only.** D-PLAN
item 3 read "sign-up email mandatory + format-validated." The backend-stack agent confirmed `authService.register`
(and its twin `memberService.createMember`, members D-C2) **already require + normalize + format-validate email**
and enforce the password policy + create the Supabase Auth user. So "email mandatory" was *already true
end-to-end*; the ONLY gap was the **client page's** inline format validation (legacy validated email only as
non-empty + HTML5 `type="email"`, no regex). This is run-16's "fan an agent over your OWN rebuilt stack, not just
legacy" paying off again: the finding reshaped the mandate from "make email mandatory" (sounds like backend work)
to "add one client-side regex gate" (a tiny page deviation). **Always confirm where a mandate already holds
before implementing it — the work is often smaller and located elsewhere than the phrasing implies.**

**`register` returns no token → the faithful flow is register-THEN-auto-login.** The legacy page calls
`registerAccount()` then immediately `login()` with the same credentials (the register response carries
`member_id`/`username`/`member_name` but no JWT — auth SPEC §3). Ported verbatim; flagged the two-call
no-rollback-on-login-leg as F2 (recoverable — the account exists, the user can sign in via `/login`).

**A page port can drag in shared UI-component dependencies that aren't page-specific — port them verbatim.**
The gender dropdown uses `Select` (which delegates to `SelectMobile` on mobile via the foundation
`useIsMobile`); neither was in the ported foundation. Ported both byte-for-byte into `src/components/` as the
dependency (they're generic, reusable across future pages — programs/members forms will want them). Confirm a
component's transitive deps exist in the foundation (here `useIsMobile` did) before porting.

**The "NO feature bump" page.** Unlike runs 17/18 (each added a backend route → an auth MINOR bump), this page
consumes only the **already-existing** `POST /auth/register` + the already-present `registerAccount()` client
fn. So no feature SPEC version changed — the only versioned artifact is the new page SPEC at v0.1.0. Not every
page port ripples into a feature bump; say so explicitly (it's the clean, expected case).

**Don't auto-inherit a sibling's redirect-or-not either — but here consistency WON over legacy-literal.** Legacy
create-account had **no** already-authenticated redirect, yet all three sibling auth pages (login faithfully,
forgot/reset by our addition) redirect authed visitors to `/programs`. Offered faithful-omit (lead) vs
add-for-consistency; the user picked **add** (D-C2). The reverse of run-18's "keep recovery separate" judgment:
when the WHOLE sibling set already diverged one way, matching them is the better consistency call than matching
a lone legacy file — recorded as a deliberate D-row, not a flag.

**Reconciling mutually-exclusive multiSelect picks — take the superset, note the merge, don't re-ask.** The
cleanup multiSelect offered "conditional password hint" AND "live password checklist" with a note to pick one;
the user selected **both** (plus autoFocus + muted mismatch hint). Reconciled by implementing the **richer**
option (the live ✓/○ checklist) which *subsumes* the conditional-hint behavior (it appears on first keystroke),
and documented the merge in D-C3 rather than bouncing a clarifying question back. When two selected options
overlap, the superset usually satisfies both intents — implement it and record the reconciliation.

**Output:** `apps/web/src/app/create-account/page.tsx` (faithful + D-C1…D-C5) + `src/components/{Select,SelectMobile}.tsx`.
`npm run build` ✓ (`/create-account` prerendered, 6.25 kB). SPEC v0.1.0 (D-REF `[web]` / D-S1 faithful port +
5 deviations / D-C1 inline email regex (D-PLAN item 3) / D-C2 authed→/programs redirect / D-C3 live password
checklist / D-C4 muted mismatch hint / D-C5 autoFocus; F1–F6: client JWT decode, register-then-login no-rollback,
bootstrap form flash, no client rate-limit, no client username rules, cleanups web-first/iOS gap). Page REGISTRY +
COVERAGE ticked. **No feature bump.** The public/auth path is COMPLETE. **Next:** the `programs` hub (first
protected route — resolve the `middleware.ts` HS256→ES256 decision first).

## Run 20 — `programs` hub (web, 6th page) — the FIRST PROTECTED route + resolving a deferred migration decision (2026-06-29)

**Target.** The post-login `programs` hub — the first route the edge `middleware.ts` actually gates. Legacy
`../rasifiters-webapp/src/app/programs/page.tsx` (1022 lines incl. inline subcomponents: `ProgramCard`,
`InvitesTab`/`InviteCard`, `CreateProgramTab`, `EditProgramModal`, `AccountRow`). Page mode. Carried a
pre-flagged open decision (the `middleware.ts` HS256→ES256 mismatch) that HAD to be resolved as part of the run.

**Sweep.** 3 `Explore` agents — legacy web hub · our ported web foundation + `middleware.ts` · backend
programs/memberships/invites contract — then I verified the load-bearing files myself (`middleware.ts` full,
the 1022-line page full, legacy `api/{programs,invites}.ts`, `useAuthGuard`, the 5 legacy `ui/` components +
their transitive deps). The backend agent's "notification emits deferred" note was STALE (notifications is
ported, emits live) — a reminder that agent maps can carry old code comments; didn't matter for a page spec but
worth noting.

**Decisions (tight 3-Q, all user-answered):**
- **D-C1 — the deferred migration decision.** Middleware = **decode + expiry only**. The faithful HS256-verify
  port is *non-viable* against Supabase ES256 (would redirect-loop every real session), so "faithful-literal"
  wasn't on the table — this is the auth-run-1 pattern (a migration-FORCED decision where the lead option is
  "closest-to-faithful-intent," not "faithful-literal"). Framed the three concrete options (decode+expiry /
  ES256-JWKS-at-edge / remove middleware) and led with decode+expiry because it preserves the middleware's
  faithful ROLE (a UX redirect gate) while the backend stays the security boundary (JWKS-verifies every call +
  owns authz — CLAUDE.md, not RLS). User took it. Dropped the `JWT_SECRET` edge dependency entirely.
- **D-C2 — dependency port (run-19 pattern, bigger).** The page dragged in **2 api modules** (`lib/api/{programs,
  invites}.ts`) **+ 5 `ui/` components** (`PageShell`/`GlassCard`/`Modal`/`ConfirmDialog`/`StatusBadge`) absent
  from the foundation. Verified the transitive deps (`cn` from `lib/utils`, `formatInviteDate` from `format.ts`)
  were ALREADY ported → no gap. Decision: port the **whole** api modules (shared infra later pages reuse) but
  **only the 5** `ui/` components this page uses (not all 12 legacy `ui/` files — the rest belong to their own
  pages). `cp`'d verbatim for byte-fidelity, then applied edits.
- **D-C3 — stance.** Faithful 1:1 + **reuse `useAuthGuard({requireProgram:false})`** in place of the inline
  login-redirect `useEffect`. `requireProgram:false` is load-bearing: the hub is WHERE you pick the active
  program, so it must not bounce to itself (the guard's default `requireProgram:true` redirects to `/programs`).

**Durable patterns promoted to SKILL.md:**
1. A **pre-flagged deferred decision becomes a run's D-C1** when its blocking page lands — and when the faithful
   port is non-viable (migration-forced), lead with the closest-to-faithful-INTENT option, not faithful-literal.
2. The run-19 "page drags in shared deps" pattern recurs and SCALES (here 7 deps) — the discipline is: verify
   transitive deps are already ported, port WHOLE shared modules but only the SPECIFIC leaf components used.
3. A page port can **reuse a foundation hook the legacy file predated** (`useAuthGuard`) — a legit reuse cleanup,
   recorded as a D-row; check the foundation for a hook/util that subsumes inline page logic before porting it verbatim.

**Output:** `apps/web/src/{lib/api/{programs,invites}.ts, components/ui/{PageShell,GlassCard,Modal,ConfirmDialog,
StatusBadge}.tsx, app/programs/page.tsx}` + rewrote `src/middleware.ts` (decode+expiry). `npm run build` ✓
(`/programs` 11.3 kB; Middleware 27.2 kB — now active). SPEC v0.1.0 (D-REF `[web]` / D-S1 / D-C1 / D-C2 / D-C3;
F1–F6). Page REGISTRY + COVERAGE ticked; `apps/web/CONTEXT.md` + PROGRESS open-question flipped to RESOLVED. **No
feature bump** (consumes existing `programs`/`program-memberships`/`invites`/`auth` routes). **Next:** `program`
overview / the first workspace tab `/summary`.

---

## Run 21 — `summary` page (web), the first WORKSPACE TAB (2026-06-29)

**Target.** `specs/pages/web/summary/SPEC.md` — the program-overview dashboard at `/summary`, the first
bottom-nav workspace tab, reached from the hub via `saveActiveProgram` → `router.push("/summary")`. 7th web
page; first protected workspace surface; the first web screen to consume the analytics (read) + logging (write)
backend.

**Sweep.** 3 `Explore` agents (legacy web summary cluster · our ported web foundation · backend API contract),
then I verified the load-bearing files myself: legacy 606-line `summary/page.tsx`, `lib/api/{summary,logs,
program-workouts}.ts`, the 3 `forms/*`, `ui/{Input,Button,ErrorState}`, and our foundation's `shell.tsx`/
`permissions.ts`/`storage.ts`/`chart-theme.ts`/`client.ts`/`config.ts`.

**Key code-grounded findings.** (1) `/summary` is a **top-level route** reading the active program from
`localStorage`, NOT a `[id]` route (the rebuild flattened the legacy workspace). (2) charts are **inline
Recharts** — no chart components to port; our `chart-theme.ts` already exports all 5 imported tokens. (3)
`shell.tsx` already activates the bottom-nav for `/summary`. (4) **all 11 backend endpoints the page consumes
are already ported + mounted** (`server.js:73-76`) — the backend-coverage-complete phase paid off: zero backend
work this run. (5) the page drags in 4 not-yet-ported deps (3 api modules + `ui/{ErrorState,Input,Button}` + 3
`forms/*`), all transitive deps present.

**Decisions (tight 3-Q round, all user-answered).**
- **D-SCOPE — the master cut for an oversized page.** This was the central decision: `/summary` is the largest
  page yet (~1,700 LoC incl. a 500-line `BulkLogWorkoutForm`). Offered 3 cuts: (A) landing + the 3 log-form
  modals [lead] · (B) read-only overview, defer forms · (C) whole bundle incl. 6 sub-routes. User took **A** —
  the "one coherent page that WORKS end-to-end (desktop)" slice. The 6 sibling sub-route pages (3 detail:
  activity/distribution/workout-types; 3 mobile log fallbacks) are **separate inventory rows** → deferred,
  links to them are forward-nav (F2). B was rejectable because it leaves the 3 action cards non-functional (an
  awkward half-page); C is one mega-run.
- **D-S1 — faithful 1:1.** Ported the page + 3 forms + 3 api modules + 3 UI components verbatim (`cp`), whole
  api modules even where this page uses a subset (later pages reuse the rest).
- **D-C1 — one typed cleanup.** `ProgramProgressCard` prop `summary?: any` → `AnalyticsSummary` (the type
  already exists in `summary.ts`). The cleanup was **pre-named in the stance question option**, so no separate
  scope-pinning multiSelect was needed — the user endorsed the specific cleanup by selecting the option.
- **Role rules — confirmed, not asked open.** Fully code-determined (`canLogForAny` lines 51-54 +
  `isDataEntryLocked` line 55); presented my reading as a confirm (global_admin/admin/logger see Bulk-add + log
  for any member; member sees Add+Health + logs for self; lock → disabled cards), user confirmed faithful.

**Durable patterns (promote to SKILL.md).**
1. **The scope cut IS the run when a page is oversized.** For a page that drags in a 500-line form + a write
   path + 6 sub-routes, the highest-value decision is "what does THIS page SPEC own vs defer." Lead with the
   "one page that works end-to-end" slice (landing + its embedded modals), defer separately-listed sub-routes
   as their own rows (forward-nav F2). Don't offer a read-only slice that leaves core action controls dead.
2. **A pre-named cleanup needs no pinning round.** When the stance question's chosen option already names the
   exact cleanup ("type ProgramProgressCard's prop"), the user has endorsed it — apply it as a D-row; skip the
   scope-pinning multiSelect (which is for when "change now" is selected without a named target).
3. **"Backend coverage complete" pays off at the consuming page.** When the backend phase finished all features
   first, a web page that consumes 11 endpoints needs ZERO backend work — the sweep's job is just to confirm
   each endpoint is mounted (`server.js`), not to port. State "all endpoints already mounted" explicitly.
4. **The rebuild can flatten a legacy nested workspace to top-level routes** — confirm the route shape from the
   navigation call site (`saveActiveProgram` + `router.push("/summary")`), not from the legacy directory tree.

**Output.** `apps/web/src/{lib/api/{summary,logs,program-workouts}.ts, components/ui/{ErrorState,Input,Button}.tsx,
components/forms/{LogWorkoutForm,BulkLogWorkoutForm,LogDailyHealthForm}.tsx, app/summary/page.tsx}` (+ the D-C1
edit). `npm run build` ✓ (`/summary` prerendered, 107 kB — Recharts; Middleware 27.2 kB active). SPEC v0.1.0
(D-REF `[web]` / D-SCOPE / D-S1 / D-C1; F1–F7). Page REGISTRY + COVERAGE ticked (summary ✓; logging forms ✓ as
modals). **No feature bump** (consumes existing analytics/analytics-v2/workout-logs/daily-health-logs/program-
workouts/program-memberships/auth routes). **Next:** the 6 deferred `/summary` sub-routes and/or the sibling
workspace tabs (`/members`, `/lifestyle`, `/program` settings).

---

## Run 22 — `members` (web page, second workspace tab) · 2026-06-29

**Target.** `apps/web/src/app/members/page.tsx` — the `/members` bottom-nav tab. **Page spec.** Faithful 1:1
port of legacy `rasifiters-webapp/src/app/members/page.tsx` (833 lines) + 2 small cleanups. `consumed_by=[web]`.

**Opening sweep.** Fanned 3 `Explore` agents (legacy members cluster · our ported web foundation+deps ·
backend members/analytics API contract), then verified the load-bearing files myself: the full 833-line
landing `page.tsx`, the legacy `lib/api/members.ts`, and our foundation (`programs.ts` `fetchProgramMembers`,
`format.ts`, icons, `chart-theme`, `useAuthGuard`, session/Program shapes).

**Key findings.** (1) **The name lies** — `/members` is NOT a roster-management screen; it's a per-member
overview dashboard with a role-gated **"view as"** picker. The roster/CRUD lives in deferred sub-routes
(`/members/list` + `/members/detail`). One Explore agent *inferred* "roster management" and listed
`fetchMembershipDetails`/`updateMembership`/`removeMembership` as the page's deps — **my own read of the
landing file corrected it** (those serve the deferred sub-routes; the landing uses only `fetchProgramMembers`
for the picker + 5 member-analytics reads). The "agents map, I verify" discipline earned its keep. (2) Only
**one** new dep — `lib/api/members.ts`; everything else (programs.ts/`fetchProgramMembers`, PageShell/GlassCard/
Modal, FlameIcon/IconMail, chart-theme, format helpers, useAuthGuard, the shell `/members` nav tab) already
ported. (3) **All endpoints already mounted** (member-{metrics,history,streaks,recent} + daily-health-logs +
program-memberships) — backend coverage complete, the page needed zero backend work (sweep = confirm, not
port). (4) 8 forward-nav sub-routes → deferred (the recurring F2). (5) read-only page → `admin_only_data_entry`
**N/A** (no data entry here).

**Decision round (tight 3-Q + a pinning multiSelect).** **D-SCOPE** = landing page only (defer 8 sub-routes) ·
**D-C1** = port whole `lib/api/members.ts` verbatim (run-20/21 pattern) · **D-S1/stance** = faithful + small
cleanups. The user picked "faithful + small cleanups" *without naming a target* → I owed a scope-pinning
multiSelect (per run-21's rule). Offered the genuinely-safe candidates: hoist `formatDuration`→`lib/format.ts`
(recommended) + de-dup the two `MemberPickerModal` blocks (recommended **against** — structural). User
selected **both**.

**Cleanups applied.** **D-C2** hoisted the page-local `formatDuration` (legacy 699-705) into `lib/format.ts`
beside `initials`/`sleepLabel`/`dietLabel` — pure fn, single-sources it for the deferred `/workouts`+`/history`
sub-routes. **D-C3** collapsed the two `MemberPickerModal` render blocks (legacy 419-449) into one render
driven by an `activePicker` discriminant — preserving the exact per-picker differences (`allowNone` =
`isGlobalAdmin` vs `false`; admin stores `member ? id : "none"`, logger stores only on a member). Behavior-
identical because the two pickers are mutually exclusive (admin vs logger branch). When the user picks a
structural de-dup you flagged against, the safe way to honor it is a discriminant over mutually-exclusive state
→ a single render, not a parameterized loop that risks dropping a branch's nuance.

**Role rules — confirmed.** Fully code-determined (lines 45-51): global_admin (view-as + "None", default
none) · admin (view-as, no "None", auto-self) · logger (own cards + a logs-scoped view-as) · member (own cards
+ Metrics-single). Read-only → lock N/A. Presented as a confirm; user's "faithful" stance covered it.

**Durable patterns (promote to SKILL.md).**
1. **A page named like a management/CRUD screen may be a read-only dashboard — verify the landing file
   yourself.** An Explore agent will infer the page's job from its directory name + sibling files and list CRUD
   deps that actually belong to deferred sub-routes. The landing file is the source of truth for what THIS run
   ports; read it in full before trusting the map's "what it does."
2. **When the user picks a structural de-dup you recommended against, honor it behavior-preserving.** Two
   near-identical render blocks gated by mutually-exclusive state → collapse to a single render via an
   `activePicker`-style discriminant that carries each block's exact differences (props, storage side-effects,
   setters). Don't force a `.map()` that flattens the nuances.
3. **For a read-only page with no `any`/typing debt, the clean "small cleanup" is a hoist-to-shared-util.** When
   summary's typed-prop cleanup has no analogue here, the safe pinned cleanup is moving a page-local pure helper
   (`formatDuration`) into the shared `lib/format.ts` — single-sources it for the deferred sub-routes that also
   use it. Offer it as the recommended pick; flag structural de-dups as recommend-against.

**Output.** `apps/web/src/app/members/page.tsx` + `lib/api/members.ts` (new) + `formatDuration` added to
`lib/format.ts`. `npm run build` ✓ (`/members` prerendered, 7.78 kB — Recharts; Middleware 27.3 kB active).
SPEC v0.1.0 (D-REF `[web]` / D-SCOPE / D-S1 / D-C1 / D-C2 / D-C3; F1–F7). Page REGISTRY + COVERAGE ticked
(members ✓). **No feature bump** (consumes existing member-analytics/daily-health-logs/program-memberships/auth
routes). **Next:** the 8 deferred `/members` sub-routes and/or the sibling tabs (`/lifestyle`, `/program`).

---

## Run 23 — `lifestyle` page (web, 3rd workspace tab) · 2026-06-29

**Target.** `specs/pages/web/lifestyle/SPEC.md` — the program workspace **Lifestyle** tab (`/lifestyle`), the
9th web page. User picked it (3rd tab) over the deferred sub-routes / the `/program` tab.

**Sweep.** 3 `Explore` agents (legacy lifestyle cluster · our ported foundation+deps · backend API contract).
Verified the load-bearing files myself: the full 625-line landing `page.tsx`, the new `lib/api/lifestyle.ts`,
and the foundation deps. All three agents confirmed my own read — no drift.

**Findings.** (1) **The name lies again** (run-22 pattern recurs): `/lifestyle` is NOT a sleep/diet *logging*
screen but a **read-only** workout-type-analytics + health-timeline dashboard — a near-twin of the Members tab
(same view-as picker, same `MemberPickerModal` w/ `allowNone`, same role gating). Data-entry (workout-type
CRUD) lives in the deferred `/lifestyle/workouts` sub-route. (2) **2 new deps** — `lib/api/lifestyle.ts` (6 fns
over already-mounted `analytics`/`analytics-v2` routes) + `ui/EmptyState.tsx` (new 10-line primitive);
everything else already ported (shell `/lifestyle` tab, 5 chart tokens, `IconDumbbell`, `fetchProgramMembers`).
(3) **all 6 endpoints already mounted** (`server.js:74-76`) — zero backend, no feature bump. (4) 2 forward-nav
sub-routes deferred (F2). (5) read-only → `admin_only_data_entry` **N/A**.

**Questions — tight 2-Q round** (both user-answered): **D-SCOPE** = landing page only (2 sub-routes deferred) ·
stance = **faithful, port local `MemberPickerModal` verbatim + flag the dup** with Members (F6). User declined
extracting a shared picker component — I recommended against it: the Members picker was de-dup'd (run 22) into a
2-variant `activePicker` form, so a shared component would ADD branches, not remove them.

**Role rules — confirmed (code-determined, lines 51-56).** global_admin (view-as + "None"/program-wide,
default none) · admin (view-as, "None"→"Admin" label, auto-self) · logger (own data, no picker, "View
workouts") · member (own data, no picker, "View workouts"). `canAddWorkouts` flips only the header pill *label*
(both labels nav to the same deferred route). Read-only → lock N/A.

**Durable patterns — reinforcement, nothing new to promote.** This run was a clean application of established
lessons:
1. **Run-22's "the name lies" recurred verbatim** — a 2nd "looks-like-CRUD, actually-read-only-dashboard" page.
   The lesson held: read the landing file in full; the CRUD lives in deferred sub-routes. (Already in SKILL.md.)
2. **A near-twin page reuses its twin's decision shape — don't re-derive.** `/lifestyle` mirrors `/members`:
   same D-SCOPE (landing only), same D-S1 (faithful), same "port whole api module" D-C, same read-only→lock-N/A,
   same view-as picker. The run is fast because you recognize the twin and confirm rather than re-discover.
3. **Decline a tempting shared-component extraction when the twin already DIVERGED.** The reflex on seeing a
   duplicated `MemberPickerModal` is "extract to `ui/`." But the Members copy was already specialized (2-variant
   `activePicker`); a shared component would carry both tabs' union of props/branches. Flag the dup (F-row,
   rebuild-cleanup candidate), recommend against extraction, let the user decide. (Extends run-22's de-dup
   lesson — de-dup WITHIN a file is behavior-preserving; de-dup ACROSS files that already diverged is not.)

**Output.** `apps/web/src/app/lifestyle/page.tsx` + `lib/api/lifestyle.ts` + `ui/EmptyState.tsx` (all verbatim).
`npm run build` ✓ (`/lifestyle` prerendered, 13.6 kB — Recharts; Middleware 27.3 kB active). SPEC v0.1.0 (D-REF
`[web]` / D-SCOPE / D-S1 / D-C1 / D-C2; F1–F7). Page REGISTRY + COVERAGE ticked (lifestyle ✓). **No feature
bump.** **Next:** the last tab `/program` (settings), the 8 deferred `/members` sub-routes, the 6 deferred
`/summary` sub-routes, and/or the 2 deferred `/lifestyle` sub-routes.

---

## Run 24 — `/program` (web): the program SETTINGS HUB (4th & last workspace tab)

**Target.** `specs/pages/web/program/SPEC.md` — the 9th web page, the **last** of the 4 workspace tabs
(Summary/Members/Lifestyle/Program). User picked `/program` over the deferred sub-routes. Faithful 1:1 port of
the legacy settings hub.

**Sweep.** Read the 541-line landing `program/page.tsx` in full myself (incl. its 6 local helper components);
verified deps with greps over our ported foundation rather than fanning Explore agents — the page is small and
every dep was already ported (api modules `programs`/`program-workouts`, all 5 `ui/` components, 11 icons,
`format`/`storage`/`theme` helpers). Confirmed both backend endpoints mounted (`GET /program-memberships/details`,
`PUT /program-memberships/leave`). **Zero new deps, zero backend work, no feature bump** — the cleanest run yet.

**Findings.** (1) A **third "name could mislead"** page — `/program` sounds like program-CRUD but is the
settings/account hub; the real editors are 6 deferred sub-routes (`edit/roles/profile/password/appearance/
privacy`). (2) Two **role variants** of the body: admin menu vs non-admin read-only Program Info card. Only
**Leave Program** + **Sign Out** are live on the landing; all else is forward-nav. (3) `canLeaveProgram =
!isGlobalAdmin` — a global admin is treated as program-admin but can't Leave (intentional; not an enrolled
member to exit). (4) **client-vs-server progress (run-11) recurred**: the landing's `computeProgramProgress` is
client-computed from `start_date`/`end_date`, distinct from summary's server-derived `progress_percent` — so
NOT a shared helper; keep local. (5) `MyAccountSection` read `rf:appearance` **raw from localStorage**, exactly
duplicating the foundation's `getStoredTheme()` (`lib/theme.ts` `THEME_KEY`).

**Decisions.** D-SCOPE landing only (6 sub-routes deferred) · D-S1 faithful 1:1 · **D-C1** appearance label via
`getStoredTheme()` (run-22 "use the foundation helper that subsumes inline logic") · **D-C2** extract the
byte-identical duplicated Leave Program button into one `LeaveProgramButton` (de-dup WITHIN a file =
behavior-preserving) · **D-C3** keep `computeProgramProgress` local (confirm, no change). F1–F6.

**Durable patterns — reinforcement, nothing new to promote.** All established lessons applied cleanly:
1. **"The name could mislead" — third occurrence** (runs 22, 23, now 24). Read the landing file in full; the
   CRUD/editors live in deferred sub-routes. (Already in SKILL.md.)
2. **Near-twin reuses its twin's decision shape** — `/program` mirrors the other tabs' D-SCOPE/D-S1/forward-nav-F2
   pattern; the run is fast because you recognize the hub shape and confirm. (Already in SKILL.md, run 23.)
3. **"Faithful + pinned cleanups" with the stance option pre-naming the cleanup** — the user picked the
   change-now stance, so I ran the run-6/14/22 pinning multiSelect (concrete code-grounded cleanups; unselected
   stay faithful + flagged). Both reuse-the-foundation-helper (D-C1) and de-dup-within-file (D-C2) are the
   recurring safe cleanup classes; the confirm-keep-local option (D-C3) is the run-11 client-vs-server call.
   (Already covered; no promotion.)
4. **The "zero backend work, no feature bump" consuming page (run 21)** recurred in its purest form — all
   endpoints mounted AND all deps already ported, so the only versioned artifact is the page SPEC at v0.1.0.

**Output.** `apps/web/src/app/program/page.tsx` (verbatim + D-C1/D-C2). `npm run build` ✓ (`/program`
prerendered, 4.36 kB — no Recharts; Middleware 27.3 kB active; bottom-nav `/program` tab, already wired in
`shell.tsx`, now resolves — all 4 tabs live). SPEC v0.1.0 (D-REF `[web]` / D-SCOPE / D-S1 / D-C1 / D-C2 / D-C3;
F1–F6). Page REGISTRY ticked. **No feature bump.** **Next:** the 6 deferred `/program/*` sub-routes, the 8
deferred `/members` sub-routes, the 6 deferred `/summary` sub-routes, and/or the 2 deferred `/lifestyle`
sub-routes — the workspace landing layer is now complete; remaining web work is all sub-routes.

---

## Run 25 — `program/edit` (web sub-route 1/6 of `/program/*`) · 2026-06-29

**Target.** `/program/edit` — the admin-only edit-program-details form, the **first sub-route run** (the
workspace landing layer being complete). Reached from the `/program` hub's "Edit Program Details" row. Spec
kind = PAGE/SCREEN (web).

**Sweep.** Legacy `program/` dir holds exactly the 6 sub-routes (edit/roles/profile/password/appearance/privacy).
The edit page is self-contained (171 lines): name input · status `Select` · start/end date · `admin_only_data_entry`
toggle → `updateProgram` → `PUT /programs/:id` → back to `/program`. Admin-only via a client `useEffect` redirect
(non-admin → `/program`). Verified the rebuilt stack: `updateProgram` + `Program` type (all fields) + `Select` +
`PageShell`/`GlassCard` + `saveActiveProgram` + `useAuthGuard` all already ported; backend `updateProgram` fully
ported (handles all 5 fields, 403 program-admin gate, **live** `program.updated` emit). The **only** missing deps:
`ui/PageHeader.tsx` → its child `components/BackButton.tsx` (both tiny leaf chrome, used by ALL 6 `/program/*`
sub-routes).

**Decisions.** D-REF `[web]` (iOS Settings→Edit mirrors later) · **D-SCOPE** this page only (5 sub-routes still
deferred) · **D-DEPS** port `PageHeader` + `BackButton` verbatim as shared chrome (single-sourced for the siblings) ·
D-S1 faithful 1:1 · **D-C1** client-side date-range validation (block Save when `start >= end`) · **D-C2** hydrate
the active-program cache from the server `ProgramResponse` not optimistic form state · **D-C3** skip a no-op PUT.
F1–F4 (client JWT-decode admin gate; vestigial `status` default; date-shape trust; no client throttle).

**Durable patterns — reinforcement, nothing new to promote.**
1. **First sub-route of a deferred group → the new "shared chrome" port is the D-DEPS row, sized to the WHOLE
   group, not just this page.** `PageHeader`/`BackButton` are foundation chrome for all 6 `/program/*` sub-routes;
   porting them verbatim NOW (run-19/20 "page drags in shared deps, port whole") front-loads the cost so siblings
   reuse them. Confirm the transitive dep chain first (`PageHeader`→`BackButton`) so you don't miss a leaf.
2. **"Faithful + cleanups" with NO named target → run the pinning multiSelect (run 6/14/22).** User picked the
   change-now stance generically, so I offered 3 concrete code-grounded cleanups; user took all 3. The cleanup
   classes here: **additive client-side validation** (D-C1 — a guard legacy lacked, low-risk), **server-truth
   hydration** (D-C2 — the run-11 client-copy-vs-server-copy call, resolved toward the canonical server row), and
   **skip-redundant-write** (D-C3). None touch the wire contract → still **no feature bump**.
3. **The "zero backend work, no feature bump" consuming page (run 21) in its purest form again** — `updateProgram`
   + the route + the `program.updated` emit all shipped with `programs`/`notifications`; the page SPEC at v0.1.0 is
   the only versioned artifact. The sweep's job was to CONFIRM the endpoint is mounted, not port it.
4. **Role rules fully code-answered → state, don't ask.** The admin-only redirect + backend 403 settle §7
   entirely; `admin_only_data_entry` is **N/A as a gate** here precisely because this is the page that SETS it
   (the value being edited, not a lock on the editor). Said so explicitly.

**Output.** `apps/web/src/app/program/edit/page.tsx` (faithful + D-C1/D-C2/D-C3) + new shared
`components/ui/PageHeader.tsx` + `components/BackButton.tsx` (verbatim). `npm run build` ✓ (`/program/edit`
prerendered, 5.7 kB — no Recharts; Middleware 27.3 kB active). SPEC v0.1.0 (D-REF/D-SCOPE/D-DEPS/D-S1/D-C1/D-C2/
D-C3; F1–F4). Page REGISTRY + COVERAGE ticked. **No feature bump.** **Next:** the remaining 5 `/program/*`
sub-routes (roles · profile · password · appearance · privacy), the 8 deferred `/members`, the 6 deferred
`/summary`, and/or the 2 deferred `/lifestyle` sub-routes.

---

## Run 26 — `program/roles` (web page spec; 2nd of the 6 `/program/*` settings sub-routes)

**Target.** The legacy admin-only role-management list (`rasifiters-webapp/src/app/program/roles/page.tsx`,
198 lines): the program's **active** members rendered as `GlassCard`s, each with Admin/Logger/Member toggle
buttons → `PUT /program-memberships` `{program_id, member_id, role}`. Non-admins redirected to `/program`; the
last active admin's buttons disabled (mirrored by a backend 400). `consumed_by = [web]` (page spec).

**Stance chosen.** Faithful 1:1 + all **3** offered cleanups (user took the whole pinning multiSelect):
**D-C1** tokenize role-button colors, **D-C2** optimistic role update, **D-C3** disable all buttons while any
update is in flight. Flagged F1–F5 (client JWT-decode admin gate; client last-admin disable mirroring the
backend 400; role-only PUT payload; raw name / default role label; no client throttle).

**Durable patterns — reinforcement, nothing new to promote.**
1. **Run-25's "first sub-route lands shared chrome" generalizes to EVERY sub-route, not just the first —
   each one may drag in its OWN small chrome leaf.** `program/edit` (run 25) landed `PageHeader`+`BackButton`;
   `program/roles` (run 26) landed `LoadingState` (9 lines). Same D-DEPS treatment: port verbatim as foundation
   chrome (the remaining sub-routes reuse it), sized to the group not the page. The lesson isn't "the FIRST
   sub-route" — it's "confirm each sub-route's chrome deps against the foundation and port the missing leaf."
2. **The PUREST consuming-page shape yet (purer than run-21/25): not just no backend work + no feature bump,
   but the api modules were ALSO already ported.** `fetchMembershipDetails`/`updateMembership`/`MembershipDetail`
   landed verbatim with the `program` landing page (the run confirmed byte-identical via `diff`). So the only
   net-new code was a 9-line chrome leaf + the page itself. When a sibling landing page already dragged in the
   whole api module, the sweep CONFIRMS (diff rebuilt vs legacy) — it ports nothing.
3. **The tokenize cleanup needs a CLEAN token mapping or it isn't worth offering — grep the palette FIRST.**
   The legacy fixed hexes mapped 1:1 to existing rf tokens (`#f59e0b`→`--rf-warning` literally; `#3b82f6`→
   `rf-info`; `#6b7280`→`rf-text-muted`), so tokenizing made them theme-aware (the real win) with admin
   pixel-identical in light mode. Had there been no matching token, "tokenize" would've meant inventing a token
   = scope creep; I checked `tailwind.config` + `globals.css` before recommending it. **A foreground that must
   stay dark on a light accent (dark ink on amber) has no theme-flipping token — keep the literal ink**
   (`text-[#111827]`); tokenize the background/border (what flips), not the contrast ink.
4. **Optimistic update = `onMutate` snapshot + `setQueryData` + rollback `onError`, reconcile `onSettled`
   (run-11 client-vs-server, resolved toward instant-feedback-then-canonical).** The recurring shape: cancel
   in-flight queries, snapshot `getQueryData`, write the optimistic row, return `{previous}` as context, restore
   it on error before surfacing the message, invalidate on settle. The optimistic write also makes derived
   client state (here `activeAdminCount`/`isLastActiveAdmin`) recompute immediately — desirable.
5. **Defense-in-depth flags recur and stay kept:** the client JWT-decode admin gate (F1, every protected page)
   + the client last-admin disable mirroring the backend 400 (F2). Two copies of a rule across client+server is
   correct; flag both, name the backend as authoritative, don't "de-dup" by trusting one side.

**Output.** `apps/web/src/app/program/roles/page.tsx` (faithful + D-C1/D-C2/D-C3) + new shared
`components/ui/LoadingState.tsx` (verbatim). `npm run build` ✓ (`/program/roles` prerendered, 4.23 kB — no
Recharts; Middleware 27.3 kB active). SPEC v0.1.0 (D-REF/D-SCOPE/D-DEPS/D-S1/D-C1/D-C2/D-C3; F1–F5). Page
REGISTRY + COVERAGE ticked. **No feature bump.** **Next:** the remaining 4 `/program/*` sub-routes (profile ·
password · appearance · privacy), the 8 deferred `/members`, the 6 deferred `/summary`, and/or the 2 deferred
`/lifestyle` sub-routes.

## Run 27 — `program/profile` (web page spec; 3rd of the 6 `/program/*` settings sub-routes)

**Target.** The legacy `rasifiters-webapp/src/app/program/profile/page.tsx` (211 lines). Despite the
`/program/*` path, it is **NOT a program-admin setting** like edit/roles — it's the signed-in user's **own "My
Profile" account page**: an identity card (avatar/name/`@username`/role label), editable First/Last name + a
native gender `<select>`, Save → `PUT /members/:id`, and a Delete Account section (hidden from global_admin) →
`ConfirmDialog` → `DELETE /auth/account` → `signOut` → `/login`. `consumed_by = [web]` (page spec).

**Stance chosen.** Faithful 1:1 + both offered cleanups: **D-C1** tokenize the success color
(`text-emerald-600`→`text-rf-success`), **D-C2** clear the stale success/error message on field edit (legacy
left "Profile updated successfully." lingering until the next Save). Flagged F1–F5 (client JWT-decode role
label + delete gate; literal-amber avatar chip with no clean token; name-split heuristic; client-only delete
gate vs `authenticateToken`-only backend route; no client throttle).

**Durable patterns — reinforcement + ONE new nuance (promoted to SKILL.md).**
1. **NEW — a route's PATH can lie about its OWNERSHIP, not just its CRUD-ness (extends run-22/23's
   "name-lies").** Run-22/23 caught pages whose *name* implied management but were read-only dashboards. Run-27
   is the ownership variant: `program/profile` sits under the `/program/*` admin-settings group yet edits the
   *requester's own member record*, so — unlike its edit/roles siblings — it has **no admin redirect** and is
   available to every role; the only role gate is hiding Delete from global_admin. The tell was in the FIRST
   file read: `useAuthGuard({ requireProgram: false })` + no `isProgramAdmin` redirect `useEffect` (edit/roles
   both have one). Don't inherit a sibling group's gating assumption — read THIS page's guard/redirect lines and
   let them set the role rules. A read of the landing/page file beats the directory grouping.
2. **The PUREST shape yet — "no new dependency" as its own D-DEPS row (purer than run-26).** Run-26 still landed
   a 9-line chrome leaf. Run-27 landed **nothing but the page**: `PageShell`/`PageHeader`/`GlassCard`/
   `ConfirmDialog`, `fetchMemberProfile`/`updateMemberProfile`, `deleteAccount`, `initials` were ALL already
   ported — the members api fns were ported "vestigial-here" with the `/members` landing page (run 22), and this
   page is finally their consumer. When that happens, record D-DEPS as "no new dependency" explicitly (it's the
   clean signal that backend-coverage + earlier-page ports have fully amortized) and the sweep's whole job is to
   CONFIRM the mounts (both endpoints) + grep the dep list, porting zero shared code.
3. **The tokenize-the-colors cleanup is SELECTIVE within one page — offer only the sites with a clean token,
   leave the rest faithful+flagged (run-26 discipline, now applied at sub-site granularity).** Same page had
   two hardcoded-color sites: the success line `text-emerald-600` → clean map to `rf-success` (offered, taken),
   AND the avatar chip `bg-amber-100 text-amber-600` → **no** clean token (amber-100 tint has no rf equivalent;
   amber-600 ≠ `rf-accent` #ff8b1f or `rf-warning` #f59e0b) → kept faithful + flagged F2. Grep the palette
   per-site, not per-page; a page can be partly-tokenizable.
4. **A "clear stale feedback on edit" cleanup is a legit faithful-plus addition** (D-C2) — the legacy form only
   reset its success/error banner at the next Save click, so an edited-but-unsaved field showed a stale "updated
   successfully". A small `markEdited()` called from each field's `onChange` (guarded so it only fires when a
   message is showing) is behavior-preserving for the happy path and fixes the stale-confirmation footgun. Same
   class as run-25's additive client-side validation: a UX-correctness fix the legacy lacked, recorded as a
   D-row, touching no wire contract → no feature bump.

**Output.** `apps/web/src/app/program/profile/page.tsx` (faithful + D-C1/D-C2). `npm run build` ✓
(`/program/profile` prerendered, 5.4 kB — no Recharts; Middleware active). SPEC v0.1.0
(D-REF/D-SCOPE/D-DEPS/D-S1/D-C1/D-C2; F1–F5). Page COVERAGE ticked. **No feature bump, no new deps.** **Next:**
the remaining 3 `/program/*` sub-routes (password · appearance · privacy), the 8 deferred `/members`, the 6
deferred `/summary`, and/or the 2 deferred `/lifestyle` sub-routes.

---

## Run 28 — `program/password` (web page, 4th of 6 `/program/*` sub-routes)

**Target.** The signed-in user's OWN change-password page (new + confirm + a live 5-rule policy checklist →
`PUT /auth/change-password`). A near-twin of the built `reset-password` form (same new+confirm + checklist),
minus the URL-fragment recovery token (here the user is already signed in, so the session bearer authorizes the
change), and a sibling of `profile` (run 27). Page/screen spec at `specs/pages/web/program/password/SPEC.md`.

**Sweep.** Read the whole legacy `program/password/page.tsx` (89 lines) first, then verified each dep against the
*rebuilt* stack (run-16 "sweep your own stack"): `changePassword` client fn present (`PUT /auth/change-password`,
body `{ new_password }`); the route mounted (`routes/auth.js:101` — `authenticateToken` + the shared
`authService.changePassword`, the same fn `reset-password` reuses); all chrome (`PageShell`/`PageHeader`/
`GlassCard`) ported; `rf-success` token defined (theme-aware, `globals.css`); `useAuthGuard`/`useActiveProgram`
present. Purest shape — nothing to port but the page.

**Round.** One `AskUserQuestion` multiSelect (cleanups; select-none = pure faithful) — scope (this page only) and
role rules (every role, no gating, no role-conditional UI) were fully code-answered, so not asked. User took all
three precedented cleanups.

**Decisions.** D-REF (`consumed_by=[web]`; iOS Settings→Change Password mirrors later) · D-SCOPE (this page only;
appearance/privacy still deferred) · D-DEPS (**no new dependency** — run-27 purest shape) · D-S1 (faithful 1:1) ·
**D-C1** tokenize the success/checklist color `text-emerald-600` → `text-rf-success` at all 6 sites · **D-C2**
reuse `useAuthGuard({ requireProgram: false })` over the legacy inline `useAuth` + manual `useEffect` redirect ·
**D-C3** clear the stale success/error message on field edit. Flagged F1–F4 (client policy mirror; no client
throttle; Show toggles New only; no JWT re-issue on change).

**New/confirmed patterns (promotion candidates):**
1. **The "near-twin of an EARLIER page" recognition cuts the run to confirm-only — and the twin can be a page
   from a DIFFERENT family (not just a sibling sub-route).** Run 23 had `/lifestyle` as a twin of `/members`
   (same family — both workspace dashboards). Run 28's `program/password` is a twin of TWO already-built pages
   at once: `reset-password` (the same new+confirm+checklist form, different family — a public/auth page) for the
   *form shape*, and `profile` (the sibling sub-route) for the *decision shape* (D-SCOPE landing-only, D-DEPS
   no-new-dep, the tokenize + clear-stale-message cleanups). Recognize the form-twin to settle the UI port and
   the decision-twin to settle §9; neither needs re-derivation. The tell that they're DIFFERENT-family twins:
   `reset-password` authorizes via a URL-fragment recovery token, `password` via the live session bearer — same
   form, different token source. State the one structural difference explicitly so the "twin" claim is honest.
2. **D-C1 tokenize can hit ALL sites cleanly when there's no literal-color holdout (the inverse of run-27's
   selective tokenize).** Run 27 was partly-tokenizable (success line → `rf-success`, but avatar amber kept). Run
   28's `text-emerald-600` appears at 6 sites (5 met-rule checklist rows + the success line) and ALL map cleanly
   to `rf-success` — no amber chip, no dark-ink-on-accent foreground. So the per-site palette grep (run-26/27
   discipline) can come back "all clean" → tokenize everything. The discipline is the same (grep per-site); the
   *result* varies by page.
3. **The `useAuthGuard`-reuse cleanup (run-20) generalizes to ANY page still carrying a legacy inline
   `useAuth` + manual redirect `useEffect`.** `program/password` predated the foundation hook and hand-rolled
   `!session?.token → /login`. Swapping it for `useAuthGuard({ requireProgram: false })` (the exact sibling
   `profile` call) is a real reuse cleanup: the hook does the same redirect AND returns `program` (for the
   back-href) + `token` (for the mutation), deleting the inline `useRouter`/`useEffect`/`useAuth` boilerplate.
   When porting a page older than a foundation hook, check whether the hook subsumes the page's inline auth/redirect
   logic before porting that logic verbatim — and confirm the params (`requireProgram:false` here — a password
   form needs no active program).
4. **A "no role-conditional UI at all" page makes the role-rules question fully code-answered — say so and don't
   ask.** Unlike `profile` (which reads the JWT for a role label + a global_admin Delete gate), `password` reads
   no role anywhere — the form is byte-identical for every role and the backend only ever updates `req.user.id`.
   §7 is a 4-row "same for everyone" table + the `admin_only_data_entry` N/A note; the round skips the role
   question entirely (it would not change the SPEC — the run-4b "if the answer wouldn't change the SPEC, drop it"
   test). The absence of role-conditional UI is itself the finding.

**Output.** `apps/web/src/app/program/password/page.tsx` (faithful + D-C1/D-C2/D-C3). `npm run build` ✓
(`/program/password` prerendered, **3.5 kB** — smallest sub-route yet, no Recharts; Middleware 27.3 kB active).
SPEC v0.1.0 (D-REF/D-SCOPE/D-DEPS/D-S1/D-C1/D-C2/D-C3; F1–F4). Page COVERAGE ticked. **No feature bump, no new
deps.** **Next:** the remaining 2 `/program/*` sub-routes (appearance · privacy), the 8 deferred `/members`, the
6 deferred `/summary`, and/or the 2 deferred `/lifestyle` sub-routes.

---

## Run 29 — web `program/appearance` (5th of 6 `/program/*` settings sub-routes) — 2026-06-29

**Target:** the legacy appearance/theme picker (`rasifiters-webapp/src/app/program/appearance/page.tsx`, 91
lines) — three full-width option buttons (System / Light / Dark) writing `localStorage["rf:appearance"]` via
the foundation `lib/theme.ts` (`setStoredTheme` → `applyTheme`). Page/screen SPEC, `consumed_by=[web]`.

**Shape: the PUREST sub-route yet — purer than run-27/28's "no new dep" runs.** The opening sweep found:
- **No backend, no API, no network call at all** — the only persistence is `localStorage["rf:appearance"]`
  (client-side foundation infra, owned by no feature SPEC). So "the sweep confirms the mount, ports nothing"
  (run-21/26) reaches its limit: there is no mount to confirm.
- **No new dependency, not even a chrome leaf** (runs 25–26 each dragged one in; run-27 dragged none but
  consumed already-ported api fns) — here `PageShell`/`PageHeader`/`GlassCard`, the three icons, `lib/theme.ts`,
  and `useAuthGuard` were ALL already ported. D-DEPS = "no new dependency," ports only the page.
- **Already fully `rf-*` tokenized in legacy** → run-28's per-site palette grep comes back with NOTHING to do
  (the trivial end of the selective-tokenize spectrum: run-27 partial, run-28 all-six-clean, run-29 nothing).

**Questions:** the tight round collapsed to 2 (scope + stance/cleanup) — every other dimension was
code-answered. User picked **this page only** (privacy = the 6th & last `/program/*`, deferred) + **faithful +
the one `useAuthGuard` reuse cleanup**.

**Decisions:** D-REF (`[web]`; iOS Settings → Appearance mirrors via `@AppStorage` later) · D-SCOPE (this page
only) · D-DEPS (no new dependency — purest shape) · D-S1 (faithful 1:1; no tokenize cleanup) · D-C1 (reuse
`useAuthGuard({ requireProgram: false })` over the inline `useAuth` + `useActiveProgram` + manual redirect —
deletes 3 imports; matches siblings `profile`/`password`). F1–F3 (device/browser-local preference not
account-synced; possible first-paint theme flash; **no role read at all**). No feature bump.

**Promoted to Converged lessons:**
- **The PUREST page shape — client-only, no backend/API/dep at all.** The "no feature bump, sweep confirms the
  mount" pattern has a floor: a pure client-preference page (theme) has NO endpoint to confirm and NO dependency
  to drag in. State it explicitly ("no API, no backend, no network call at all") — the sweep's job shrinks to
  reading the one page file + confirming every import already exists. The D-DEPS row is "no new dependency"; the
  data/API section says "none."
- **Already-tokenized → no tokenize cleanup is the trivial end of run-28's per-site grep.** Runs 26→27→28→29
  trace a spectrum: clean-mapping-tokenize (26) → selective per-site (27) → all-clean tokenize (28) → nothing to
  tokenize (29, legacy already fully `rf-*`). The discipline is constant (grep the palette per-site); the
  outcome varies down to zero. Don't manufacture a tokenize cleanup on an already-tokenized page.
- **The ABSENCE of role-conditional UI IS the §7 finding (run-28 corollary, sharpened).** When a page reads no
  JWT role, has no admin redirect, and renders byte-identically for every role, §7 is a "same for everyone"
  table + the `admin_only_data_entry`-N/A note, and the finding to RECORD (an F-row) is precisely that absence —
  it's not an omission, it's the characteristic. Skip the role question (run-4b).
- **`useAuthGuard`-reuse generalizes to the inline `useAuth` + `useActiveProgram` + redirect triple** (run-20/28
  extended): the hook returns `program` too, so it subsumes not just the redirect but also a separate
  `useActiveProgram` call used for a back-href — one swap deletes three imports.

**Output:** SPEC v0.1.0 (D-REF/D-SCOPE/D-DEPS/D-S1/D-C1; F1–F3). COVERAGE + PROGRESS ticked. `npm run build` ✓
(`/program/appearance` 3.06 kB — smallest sub-route yet). **No feature bump, no new deps.** **Next:** the LAST
`/program/*` sub-route (privacy), the 8 deferred `/members`, the 6 deferred `/summary`, and/or the 2 deferred
`/lifestyle` sub-routes.

## Run 30 — web `program/privacy` (6th & LAST of 6 `/program/*` settings sub-routes) — 2026-06-29

**Target:** `specs/pages/web/program/privacy/SPEC.md` — the **Privacy Policy** page, the sixth and final deferred
`/program/*` settings sub-route. Legacy `rasifiters-webapp/src/app/program/privacy/page.tsx`: a fully static
`PageShell` + `PageHeader` + one `GlassCard` of hardcoded policy prose; the only dynamic logic an auth redirect.
With this page the **entire `/program/*` sub-route group (6 of 6) is complete.**

**Shape:** confirm-only. Read the one legacy file in full (sweep confirmed every import already ported). One
genuinely-open decision (the stance/cleanup) + one content-fidelity decision → a single 2-Q `AskUserQuestion`.
User chose: **faithful + `useAuthGuard` cleanup** (D-C1) and **keep all content verbatim**.

**Decisions:** D-REF (`consumed_by=[web]`; iOS Settings → Privacy Policy mirrors the same shared policy later) ·
D-SCOPE (this page only — CLOSES the 6-of-6 group) · D-DEPS (no new dependency) · D-S1 (faithful 1:1; content
verbatim, already fully tokenized — no tokenize cleanup) · D-C1 (reuse `useAuthGuard({ requireProgram: false })`
over the inline `useAuth` + `useActiveProgram` + redirect `useEffect`). Flagged F1–F4.

**New durable patterns (promoted to Converged lessons):**
- **The purest-shape spectrum bottoms out at a fully-static content page.** Runs 27→29 traced "no new dep" →
  "no backend/API" → "client-only (just `localStorage`)". Run 30 goes one step further: a static legal document
  has NO state, NO `localStorage`, NO storage of any kind — it reads nothing and writes nothing. The §6 Data/API
  section is "none, not even client storage"; the only "state" is the `useAuthGuard` session check. State the
  floor explicitly; don't invent a state/edge-case section where there is exactly one render.
- **Keep a shared cross-surface legal/policy document VERBATIM; flag the surface mismatch as an F-row, don't
  fork it.** The web privacy page intentionally describes iOS push/APNs behavior even though the web client uses
  SSE and registers no device token. Trimming the web-irrelevant clauses would fork one shared legal document
  into two — a content-governance decision, not a code cleanup. Offer "keep verbatim" as the lead (taken) and
  record the mismatch as a flagged characteristic (F1) + a content-review candidate. Generalizes: hardcoded
  effective date + contact email are likewise faithful F-rows (a CMS-sourced policy is a rebuild feature).

**Output:** SPEC v0.1.0 (D-REF/D-SCOPE/D-DEPS/D-S1/D-C1; F1–F4). COVERAGE + PROGRESS ticked; the `/program/*`
group marked COMPLETE (6 of 6). `npm run build` ✓ (`/program/privacy` 2.44 kB — smallest sub-route yet, below
`appearance`'s 3.06 kB). **No feature bump, no new deps.** **Next:** the SUB-ROUTE layer continues elsewhere —
the 8 deferred `/members`, the 6 deferred `/summary`, and/or the 2 deferred `/lifestyle` sub-routes (the
`/program/*` group is done).

---

## Run 31 — `lifestyle/workouts` (web page spec; 17th web page, 1st of 2 deferred `/lifestyle` sub-routes)

**Target:** the workout-**type** management screen behind the `/lifestyle` landing's "Manage workouts" /
"View workouts" pill — a searchable Available/Hidden list of global (library) + custom workout types; admins
Add/Edit/Hide-Show/Delete, everyone else read-only.

**Sweep finding that reshaped the run:** the PROGRESS/run-23 forward-inference called this "the write path
where `admin_only_data_entry` bites." Reading the legacy file proved it WRONG — `admin_only_data_entry` is
never referenced; the gate is `canManage` (admin role). The data-entry lock gates whether non-admins may *log*
workouts (the `/summary` forms), not who manages the workout-type vocabulary (always admin-only). Recorded as
F1 (a correction of the inference), not a question.

**Second finding:** non-admins are NOT redirected (unlike `program/edit`/`program/roles`) — they get a
**read-only DEGRADE** (controls + Hidden section hidden via `canManage`). The landing's "View workouts" pill
intentionally routes them here. Tell: `useAuthGuard()` with no admin-redirect `useEffect`. F2.

**Deps:** purest shape — every import already ported (the whole `lib/api/program-workouts.ts` module landed
"vestigial-here" with `summary` run 21; the chrome leaves `LoadingState`/`ConfirmDialog`/`PageHeader` with the
`/program/*` sub-routes). D-DEPS = **no new dependency**; the sweep ported only the page.

User chose: **this page only** (timeline deferred — 1st of 2, does NOT close the group) and **faithful + both
cleanups**: D-C1 `window.confirm` → `ConfirmDialog` (2 delete sites), D-C2 clear stale error on Add **and**
Edit modal open (legacy cleared only on Add).

**Decisions:** D-REF (`consumed_by=[web]`; iOS workout-type management mirrors later) · D-SCOPE (this page only;
`/lifestyle/timeline` deferred; 1st-of-2) · D-DEPS (no new dependency) · D-S1 (faithful 1:1: `canManage` admin
gate with read-only degrade, Available/Hidden split, global-vs-custom control matrix, invalidate-on-success) ·
D-C1 (`window.confirm` → `ConfirmDialog`) · D-C2 (clear stale error on both modal opens). Flagged F1–F6.

**New durable patterns (promoted to Converged lessons):**
- **A forward-inference recorded in a LANDING/sibling run can be wrong — the sub-route run is where it's
  corrected; record the correction as an F-row, not a question.** Run-23's lifestyle landing guessed this
  sub-route was `admin_only_data_entry`-gated; the actual file is admin-ROLE gated. The landing file genuinely
  can't see the sub-route's gate — so treat any "the deferred sub-route does X" note as a hypothesis to verify
  against the real file, and when it's wrong, the SPEC (F-row) supersedes the guess.
- **Non-admin handling splits into REDIRECT vs read-only DEGRADE — read the page's guard to tell which, don't
  inherit a sibling's.** `program/edit`/`program/roles` bounce non-admins (`useEffect` redirect); this page
  renders for everyone and hides controls via a `canManage` flag. The tell is the presence/absence of the
  admin-redirect `useEffect` — same as run-27's "the path can lie about ownership" but for the
  redirect-vs-degrade axis.
- **`window.confirm` is a native primitive the rebuild replaced everywhere — porting it verbatim would be the
  lone divergence; swap it for the ported `ConfirmDialog`.** No rebuilt page uses `window.confirm`; the
  cleanup (a `deleteTarget` state + `ConfirmDialog` danger/loading) mirrors `program/profile`'s delete flow.
  When the legacy uses a browser-native dialog the rebuild has a component for, "faithful" = match the
  rebuild's established pattern, not the native call.

**Output:** SPEC v0.1.0 (D-REF/D-SCOPE/D-DEPS/D-S1/D-C1/D-C2; F1–F6). COVERAGE + PROGRESS ticked.
`npm run build` ✓ (`/lifestyle/workouts` 4.82 kB — no Recharts; Middleware 27.4 kB active). **No feature bump,
no new deps.** **Next:** `/lifestyle/timeline` (closes the group), the 8 deferred `/members`, and/or the 6
deferred `/summary` sub-routes.

## Run 32 — `lifestyle/timeline` (web page spec; 18th web page, 2nd & LAST `/lifestyle` sub-route — CLOSES the group) — 2026-06-29

**Target:** the sleep + diet-quality health-timeline detail behind the `/lifestyle` landing's timeline chart card.
**Shape:** the purest detail sub-route yet — 1 page file + 1 chrome leaf (`PeriodSelector.tsx`) to port; everything
else already present (`fetchHealthTimeline` byte-identical, landed run 23; `GET /analytics/health/timeline` mounted
`routes/analytics.js:74`). Read-only → `admin_only_data_entry` N/A; **no view-as picker** (scope from URL `memberId`
the landing passes); no admin redirect. Zero backend work, no feature bump.

**Decisions:** D-SCOPE this page only, **closes the `/lifestyle` group (2/2)**; D-DEPS one verbatim chrome leaf
`ui/PeriodSelector.tsx` (`.segmented-control` CSS already in `globals.css`); D-S1 faithful (already `rf-*` tokenized
→ no tokenize cleanup). **Stance = CHANGE NOW** — user took all 3 offered chart cleanups: D-C2 dual Y-axis (sleep-hrs
left `[0,sleepMax*1.1]`, diet-1–5 right `[0,5]` — fixes the legacy single-shared-axis scale-mixing), D-C3 `<Legend>`,
D-C4 axis unit labels.

**New durable patterns (promoted to SKILL.md):**
- **A "change now" stance with NO firm named cleanup → run the pinning multiSelect (run-6/14/25 protocol).** I
  offered dual-Y-axis only as an *example* inside the change-now option, so it wasn't a committed single target — a
  follow-up multiSelect locked the exact set (all 3 taken; unselected would stay faithful + flagged). The run-25
  "stance option NAMES the cleanup → no pinning round" only applies when the option commits to a *specific* change;
  an "e.g."-qualified example does not commit it.
- **The purest detail-page shape can still take cleanups — purity is about DEPS, not stance.** Runs 27→31 traced
  D-DEPS down to "no/one new dep"; this run shows a near-zero-dep page can still be a deliberate CHANGE-NOW run. The
  two axes (dep-purity vs faithful-vs-change) are independent — don't assume a pure page is also a pure-faithful port.
- **A faithful chart port can fix a latent VISUAL bug as the cleanup — mixed-unit series on one Y-axis.** Legacy
  plotted sleep-hours (≈0–12) and diet-quality (1–5) on one shared `[0, max-of-both]` axis, flattening the diet line.
  The change-now fix is a dual Y-axis (one scale per unit) + a Legend + unit labels — the chart analogue of run-11's
  TZ cleanup (faithful numbers, clearer presentation). When the series share an axis but not a unit, surface it.
- **A sub-route run CLOSES its group when it's the Nth-of-N (run-30 corollary, now for `/lifestyle` 2/2).** Flip the
  COVERAGE row marker `[~]`→`[x]` and say "closes the group" in D-SCOPE + PROGRESS.

**Output:** SPEC v0.1.0 (D-SCOPE/D-DEPS/D-S1/D-C1–C4; F1–F5). COVERAGE row flipped `[~]`→`[x]` (group complete) +
PROGRESS ticked. `npm run build` ✓ (`/lifestyle/timeline` 2.68 kB; Recharts shared; Middleware 27.4 kB active). **No
feature bump, one verbatim chrome-leaf dep.** **Next:** the 8 deferred `/members` and/or 6 deferred `/summary`
sub-routes (the `/lifestyle` group is now done).

---

## Run 33 — `summary/activity` (web page; first of the 6 deferred `/summary` sub-routes)

**Target:** the **workout activity timeline** detail behind the summary landing's Activity chart card — a
`PeriodSelector` (W/M/Y/P) over one `GlassCard` (range + daily-average header + a `BarChart` of workouts +
active-members per bucket, over `workout_logs` via `GET /analytics/timeline`).

**Sweep finding:** the purest sub-route shape and a **near-twin of `lifestyle/timeline` (run 32) — but SIMPLER**.
No view-as picker, no `memberId` → **program-wide only**; `useAuthGuard()` default, **no role logic at all** (the
ABSENCE of role-conditional UI is the finding). Every import already ported (`fetchActivityTimeline` byte-identical
at `lib/api/summary.ts:129`, landed with the summary landing run 21; `PeriodSelector` landed with timeline run 32;
chrome + chart-theme earlier) → **D-DEPS = no new dependency**; the sweep ported nothing but the page itself.
Backend `GET /api/analytics/timeline` already mounted (`routes/analytics.js:60`, `authenticateToken`-only) → zero
backend work, no feature bump.

**Decision (tight, 1 question):** scope/deps/role all code-answered → the only open call was the **stance**. User
took **faithful + 2 chart cleanups**: D-C1 `<Legend>` + series names (`name="Workouts"`/`name="Active members"`;
tooltip formatter keys off `name`) so the two color-only-distinguished bars are labeled; D-C2 empty-state guard
(`buckets.length===0` → "No data for this range yet."). Both mirror run-32 timeline.

**The KEY refinement (promoted):** the run-32 dual-Y-axis cleanup is **twin-SPECIFIC, not a default** — I
deliberately did NOT offer it here because both series are **counts** (same unit), so a single shared Y-axis is
correct; a second axis would be misleading. The dual-axis is the answer only when series share an axis but NOT a
unit (timeline: sleep-hrs vs diet-1–5). A near-twin can need FEWER cleanups than its twin — recognize the twin,
then subtract the cleanups that don't apply.

**New durable pattern (promoted to SKILL.md):**
- **A near-twin chart drill-down can be SIMPLER than its twin — copy the decision shape, then SUBTRACT the
  twin-specific cleanups.** `summary/activity` reused `lifestyle/timeline`'s shape (purest deps, faithful + chart
  cleanups) but is program-wide (no picker/`memberId`) and same-unit (both series counts), so the dual-axis cleanup
  is declined. Don't reflexively port a twin's cleanup list — re-test each against THIS page (run-26's "don't offer
  a cleanup without a clean basis", applied to a twin's cleanups). The two clarity cleanups that DO carry — Legend +
  series names, and the empty-state guard — are unit-agnostic, so they transfer; the dual-axis is unit-specific, so
  it doesn't.

**Output:** SPEC v0.1.0 (D-SCOPE/D-DEPS/D-S1/D-C1–C2; F1–F4). COVERAGE summary row updated (activity ✓; first of 6,
group NOT closed) + PROGRESS prepended. `npm run build` ✓ (`/summary/activity` prerendered, 2.31 kB — smallest
`/summary` route; Recharts shared 208 kB; Middleware 27.4 kB active). **No feature bump, no new dependency.**
**Next:** `summary/distribution` (next chart drill-down), `workout-types`, the 3 mobile log fallbacks; and/or the 8
deferred `/members` sub-routes.

---

## Run 34 — `summary/distribution` (web), the 2nd of 6 `/summary` sub-routes (2026-06-29)

**Target:** the **workout distribution by day-of-week** detail behind the summary landing's Distribution chart
card. A SECOND near-twin in the `/summary` group (after run-33 `activity`) — and the **purest page in the group
yet**.

**Sweep (read-only):** legacy `summary/distribution/page.tsx` (73 lines) — `useAuthGuard()` default → `{token,
programId}`; one `useQuery(["summary","distribution",programId])` → `fetchDistributionByDay`; maps the
`{Sunday…Saturday}` record to `[{day,value}]`; one `GlassCard` with a **single** `BarChart` of `value`
(`CHART_COLORS[2]`); Loading/Error. Backend `routes/analytics.js:89` `v1Router GET /distribution/day`
(`authenticateToken`-only) → `getDistributionByDay(programId)` = program-wide **all-time** `COUNT(*)` by weekday
over active memberships, **always returns all 7 keys** (0 if none; `analytics` D-C3 bucketed in explicit UTC). The
api fn + `DistributionByDay` type already ported byte-identical with the summary landing (run 21); all chrome
already ported. **No new dependency — the sweep ported nothing but the page itself.**

**The 2-Q round (scope cut + stance; role rules NOT asked — fully code-answered):**
- **D-SCOPE** = this page only — 2nd of 6, does NOT close the group (`workout-types` + 3 log fallbacks still deferred).
- **Stance** = faithful + 1 cleanup (D-C1 all-zero empty-state guard). User picked the cleanup option.

**The KEY confirmation (run-33's "subtract twin cleanups" applied AGAIN, harder):** of `activity`'s 2 cleanups,
**ONE didn't transfer and ONE adapted**:
- **`<Legend>` + series names — NOT applied.** `activity` added it because it has TWO color-only-distinguished bars;
  distribution has a **single** series, so there is nothing to disambiguate (the subtitle already says "Workouts").
- **Empty-state guard — ADAPTED, not copied.** `activity` keys off `buckets.length === 0`; distribution's backend
  **always returns all 7 keys**, so `data.length` is never 0 — the guard had to key off the **sum** being 0
  (`data.every(d => d.value === 0)`) to catch the all-zero-bars case. Same intent, different predicate.
- **dual-Y-axis — NOT applied** (single counts series → one natural axis; the run-32 unit-mismatch trigger absent).

So: a near-twin can be SIMPLER than its already-simplified twin, and a cleanup that "transfers" may need its
predicate re-derived for THIS page's data shape — copying it verbatim would have been a no-op-then-bug
(`data.length===0` never fires here).

**Already-known patterns reconfirmed (not re-promoted):** no-new-dep purest shape (runs 27→33), read-only page →
`admin_only_data_entry` N/A + ABSENCE-of-role-logic IS the finding (runs 22/32/33), already-tokenized → no tokenize
cleanup (run 29), zero-backend / no-feature-bump consuming page (run 21), sub-route run does-not-close-the-group
D-SCOPE (run 30 inverse).

**New durable pattern (promoted to SKILL.md, folded into the run-33 lesson):**
- **A "transferring" twin cleanup may need its PREDICATE re-derived for this page's data shape — copying it verbatim
  can be a no-op-then-bug.** `activity`'s `buckets.length === 0` empty-state guard had to become a `sum === 0`
  guard on `distribution` because that endpoint always returns all 7 weekday keys (`data.length` is never 0). The
  cleanup's INTENT carries; its CONDITION must be re-checked against the endpoint's response shape. (Generalizes
  run-33's "subtract cleanups that don't apply" to "and re-derive the predicate of the ones that do".)

**Output:** SPEC v0.1.0 (D-SCOPE/D-DEPS/D-S1/D-C1; F1–F5; the "not applied" twin-cleanups note). COVERAGE summary
row updated (distribution ✓; 2nd of 6, group NOT closed) + PROGRESS prepended. `npm run build` ✓
(`/summary/distribution` prerendered, 2.01 kB — smallest `/summary` route, below `activity`'s 2.31 kB; Recharts
shared 208 kB; Middleware 27.4 kB active). **No feature bump, no new dependency.** **Next:** `summary/workout-types`
(last chart drill-down), the 3 mobile log fallbacks; and/or the 8 deferred `/members` sub-routes.

---

## Run 35 — `summary/workout-types` (web), the 3rd of 6 `/summary` sub-routes — LAST chart drill-down (2026-06-29)

**Target:** `summary/workout-types` page — the **top workout types** detail behind the summary landing's Workout
Types card (legacy `rasifiters-webapp/src/app/summary/workout-types/page.tsx`, 80 lines). Third of the six deferred
`/summary` sub-routes; the **last of the three chart drill-downs** (`activity`+`distribution`+this), so it
completes the drill-down trio (the remaining 3 are the mobile log fallbacks).

**Shape:** one `GlassCard` with a **single-series** `BarChart` of session count per workout type
(`CHART_COLORS[0]`, X-axis labels hidden via `tick={false}` — names are long) **plus a ranked `<ul>` detail list**
below (name · sessions · avg min). `useAuthGuard()` default → `useQuery(["summary","workoutTypes",programId])` →
`fetchWorkoutTypes(token, programId, 100)`. **Same purest shape as `distribution`:** no `PeriodSelector`, NO
`useState`, NO state; program-wide + program-to-date (no period, no `memberId`, no view-as, no role logic). The
sweep ported NOTHING but the page itself (every import already ported — `fetchWorkoutTypes`+`WorkoutType` landed
with the summary landing run 21).

**Questions:** the tight confirm-heavy shape, 2 Qs (scope + stance). User picked **this page only** (3rd of 6,
does-not-close-group) + **faithful + the one group-consistency cleanup**.

**Decisions:** D-SCOPE (this page only) · D-DEPS (no new dependency) · D-S1 (faithful 1:1) · **D-C1 styled
empty-state panel** — upgrade the legacy plain `<p>` to `distribution`'s `rf-surface-muted` panel so all 3
drill-downs share one empty-state look.

**The run-34 predicate re-check came back CLEAN — the key lesson of this run.** Run 34 had to CHANGE
`activity`'s `buckets.length===0` guard to a `sum===0` guard because the distribution endpoint always returns 7
keys. So this run dutifully re-checked workout-types' empty-state predicate against ITS endpoint shape — and
found the legacy `data.length === 0` is **already correct**: `getWorkoutTypes` returns a **variable-length array**
(`[]` when no workouts), so an empty array IS the empty case. The cleanup here is therefore **STYLING only** (the
panel), NOT the predicate. The run-34 discipline ("re-derive a transferring cleanup's predicate against this
page's response shape") is the constant; the OUTCOME varies — sometimes the predicate already fits and only the
presentation is the cleanup. Don't over-correct a predicate that's already right.

**Twin cleanups subtracted (run 33):** `<Legend>`+series-names NOT applied (single series — nothing to
disambiguate); dual-Y-axis NOT applied (single counts series → one natural axis). Already fully `rf-*` tokenized →
no tokenize cleanup (run 29).

**New flag worth noting (F5):** the detail page passes `limit=100` while the landing preview passes `limit=50`
under the **SAME** query key `["summary","workoutTypes",programId]`. React Query dedupes by key (not by `queryFn`
args), so the two share ONE cache entry — whichever mounts first wins until refetch. Latent inconsistency, harmless
in practice (50 ≤ 100; real programs rarely exceed 50 types). A per-limit cache key would be a rebuild cleanup. The
lesson: **when two pages share a query key but pass different fetch args, flag the dedupe** — it's a faithful-kept
oddity easy to miss.

**Already-known patterns reconfirmed (not re-promoted):** no-new-dep purest shape (runs 27→34), read-only →
`admin_only_data_entry` N/A + ABSENCE-of-role-logic IS the finding (runs 22/32/33/34), already-tokenized → no
tokenize cleanup (run 29), zero-backend / no-feature-bump consuming page (run 21), subtract twin cleanups that
don't apply (run 33), sub-route does-not-close-group D-SCOPE (run 30 inverse).

**New durable pattern (promote to the run-33/34 lesson):**
- **The run-34 predicate re-check can come back CLEAN — sometimes a transferring cleanup's legacy predicate is
  already correct for THIS page, so only the STYLING/presentation is the cleanup, not the condition.** Re-derive
  the predicate every time (the discipline), but don't manufacture a predicate change when the legacy one already
  fits the endpoint's response shape (`data.length===0` is right for a variable-length array; it was wrong only
  for distribution's always-7-keys). Corollary: **when two pages share a React Query key but pass different fetch
  args (limit 50 vs 100), flag the dedupe-to-one-cache-entry** as a faithful-kept oddity.

**Output:** SPEC v0.1.0 (D-SCOPE/D-DEPS/D-S1/D-C1; F1–F7; the "not applied" twin-cleanups note). COVERAGE summary
row updated (workout-types ✓; 3 of 6, all chart drill-downs complete, group NOT closed) + PROGRESS prepended.
`npm run build` ✓ (`/summary/workout-types` prerendered, 2.07 kB — between distribution's 2.01 kB and activity's
2.31 kB; Recharts shared 208 kB; Middleware 27.5 kB active). **No feature bump, no new dependency.** **Next:** the
`/summary` group's last 3 sub-routes are the mobile log fallbacks (`log-workout`/`log-health`/`bulk-log-workout` —
standalone-page ports of the 3 desktop modals already live on the landing); and/or the 8 deferred `/members`
sub-routes.

---

## Run 36 — `summary/log-workout` (web page spec; the 1st of the 3 mobile log fallbacks, `/summary` sub-route 4 of 6)

**Target:** the standalone full-page Log-workout form — the mobile fallback for the Add-workout action whose
desktop counterpart is a modal on the `/summary` landing. Legacy: `rasifiters-webapp/src/app/summary/log-workout/
page.tsx` (66 lines).

**Sweep:** 3 parallel `Explore` agents (legacy page · rebuilt `LogWorkoutForm`+summary+chrome · backend route) +
self-verified the two load-bearing files (`LogWorkoutForm.tsx`, the legacy `page.tsx`). Findings: the form ALREADY
ships a `variant="page"` branch (`forms/LogWorkoutForm.tsx:146-148`) built for exactly this page — flagged dead on
the summary landing (summary SPEC **F6**), now its belated consumer. Backend `POST /api/workout-logs` already
mounted + gated (`authenticateToken` + `requireDataEntryAllowed`, `routes/logs.js:38`). Every dep already ported.

**The genuinely-open decision count: ONE.** Scope is fact-determined (4th of 6, 1st of 3 log fallbacks, doesn't
close the group; `consumed_by=[web]`). The only real choice was the stance + a single grounded nav cleanup → one
`AskUserQuestion`, user picked **faithful + the deterministic-nav cleanup**.

**Decisions:** D-SCOPE (this page; 4th-of-6; does NOT close group) · D-REF (`consumed_by=[web]`; iOS native log
screen) · D-DEPS (**no new dependency** — purest write-page shape) · D-S1 (faithful 1:1) · **D-C1** (deterministic
nav — the 2 `router.back()` → `router.push("/summary")`; the lock `router.replace` unchanged). F1–F5.

**New durable patterns (promoted to Converged lessons):**
- **A modal already built on a landing becomes a standalone PAGE for free via the form's pre-existing `variant`
  branch — a WRITE page that is still "no new dependency."** When an earlier landing run ported a shared form
  component with a dead `variant="page"` branch (flagged as an F-row then — summary F6), the sub-route run that
  lights it up is the belated consumer: the sweep ports ONLY the page wrapper (`PageShell`/`PageHeader` + the
  form's page variant), nothing else. This is run-31's "no-new-dep on a stateful page" at its cleanest — the page
  is a thin wrapper whose entire body is `<Form variant="page" … />`.
- **Within ONE sub-route group, `admin_only_data_entry` can be N/A for some siblings and LIVE for others — split
  by read-vs-write, don't inherit the group's answer.** The 3 `/summary` chart drill-downs were read-only → lock
  N/A (runs 33–35); the log fallbacks are the WRITE path → the lock is LIVE (client mount `router.replace` +
  backend `requireDataEntryAllowed` 403). So §7's `admin_only_data_entry` line is decided per-page by whether the
  page writes, not by the group it sits in. State it as the finding (the inverse of the read-only N/A note).
- **A "considered cleanup" can be REJECTED once you ground it — verify the reuse target before offering it.** The
  obvious "reuse `refreshSummaryQueries` over raw `invalidateQueries(["summary"])`" dissolved on inspection: that
  helper is a module-PRIVATE one-liner inside `summary/page.tsx:310`, byte-identical to the faithful inline call
  and not importable — there is nothing shared to reuse. Grep the candidate helper's definition + export before
  presenting "reuse X" as a cleanup; a private, identical helper is a non-cleanup. Record the rejection in a §9
  "not a cleanup" note so the next reviewer doesn't re-raise it.
- **Deterministic-nav cleanup: when a page navigates via `router.back()` but a sibling control already hardcodes
  the destination, swap to `router.push(<fixed>)` for consistency + to kill the direct-nav/refresh footgun.** Here
  the header BackButton already used `/summary`; making post-save + form-close match it (and leaving the lock
  `router.replace` alone — replace intentionally drops the locked page from history) is a coherent one-line D-C.

**Already-known patterns reconfirmed (not re-promoted):** no-new-dep purest shape (runs 27→35, now on a write
page), zero-backend / no-feature-bump consuming page (run 21), client JWT-decode role is display-only not a
security boundary (summary F1), already-tokenized → no tokenize cleanup (run 29), sub-route does-not-close-group
D-SCOPE (run 30 inverse), count the genuinely-open decisions / don't manufacture questions.

**Output:** SPEC v0.1.0 (D-SCOPE/D-REF/D-DEPS/D-S1/D-C1; F1–F5; the "not a cleanup" `refreshSummaryQueries` note).
COVERAGE summary row updated (log-workout ✓; 4 of 6, 1st log fallback done, group NOT closed) + logging row updated
+ PROGRESS prepended. `npm run build` ✓ (`/summary/log-workout` prerendered, 1.33 kB — smallest `/summary` route,
no Recharts; Middleware 27.5 kB active). **No feature bump, no new dependency.** **Next:** the last 2 log fallbacks
(`log-health` — standalone `LogDailyHealthForm`; `bulk-log-workout` — the heavier `BulkLogWorkoutForm` ≤200-row
page); and/or the 8 deferred `/members` sub-routes.

## Run 37 — `summary/log-health` (web page spec; the 2nd of the 3 mobile log fallbacks, `/summary` sub-route 5 of 6) — 2026-06-29

**Target:** the standalone full-page Log-daily-health form — the mobile fallback for the Log-health action whose
desktop counterpart is a modal on the `/summary` landing. Legacy: `rasifiters-webapp/src/app/summary/log-health/
page.tsx` (65 lines). A near-exact twin of run-36 `summary/log-workout`.

**Sweep:** read the 3 load-bearing files directly (legacy page · rebuilt `LogDailyHealthForm` · sibling rebuilt
`log-workout/page.tsx`) + confirmed consumption (`addDailyHealthLog` ported `lib/api/logs.ts:49`; backend `POST
/api/daily-health-logs` mounted `server.js:74` + gated `authenticateToken`+`requireDataEntryAllowed` `routes/logs.js:91`;
landing routes mobile → `/summary/log-health`, desktop → modal `summary/page.tsx:216`). The form ALREADY ships a
`variant="page"` branch (`forms/LogDailyHealthForm.tsx:162-164`) — its belated consumer, same as run 36. Every dep
already ported; the sweep ports nothing but the page file.

**Shape vs the run-36 twin:** identical wrapper (`PageShell`+`PageHeader`+`<Form variant="page">`), identical
`canLogForAny` role logic, identical `admin_only_data_entry` `router.replace("/summary")` lock guard, identical
`invalidateQueries(["summary"])` mutation. Differences: the HEALTH form (member/date/sleep-time/diet-quality) instead
of the workout form; the form needs only the member lookup (NO workout-types lookup — one fewer dependency surface);
an extra F-row (F6 — the client-only at-least-one-metric `hasMetric` submit gate). Title/subtitle differ.

**Decisions:** ONE genuinely-open decision (the stance + D-C1 nav cleanup) → a single `AskUserQuestion`. Scope was
fact-determined by the user's page-pick (run-36 lesson). User chose **faithful + D-C1** (match run 36): swap the two
legacy `router.back()` (post-save success `page.tsx:39` + form `onClose` `page.tsx:57`) → `router.push("/summary")`;
lock `router.replace` unchanged. The "reuse `refreshSummaryQueries`" non-cleanup re-confirmed rejected (same
module-private one-liner). Already fully `rf-*` tokenized → no tokenize cleanup.

**New durable lesson (promoted):** *a near-exact twin run is confirm-only — copy the twin's decision shape verbatim,
then enumerate only the deltas (form swap, one-fewer-lookup, one extra F-row).* Twin recognition (run-23/28/33)
applied to a WRITE page: when the legacy file is structurally identical to a just-built sibling, the sweep is a
3-file read + a consumption confirm, the question is a single stance/cleanup `AskUserQuestion`, and the SPEC mirrors
the sibling's §-by-§ with the deltas swapped in. Don't re-derive D-SCOPE/D-REF/D-DEPS/D-S1/D-C1 — recognize the twin,
transcribe, delta.

**Already-known patterns reconfirmed (not re-promoted):** no-new-dep purest write-page shape (run 36); zero-backend /
no-feature-bump consuming page (run 21); `admin_only_data_entry` LIVE on a write page vs N/A on the read-only
drill-downs, decided per-page by whether it writes (run 36); deterministic-nav D-C1 (run 36); client JWT-decode role
is display-only not a security boundary; shared form single-sourced across modal+page; count the genuinely-open
decisions / don't manufacture a scope question the page-pick already settled.

**Output:** SPEC v0.1.0 (D-SCOPE/D-REF/D-DEPS/D-S1/D-C1; F1–F6; the "not a cleanup" `refreshSummaryQueries` note).
COVERAGE summary row updated (log-health ✓; **5 of 6**, 2 of 3 log fallbacks done, group NOT closed) + logging row
updated + PROGRESS prepended. `npm run build` ✓ (`/summary/log-health` prerendered, 2.4 kB — no Recharts; Middleware
27.5 kB active). **No feature bump, no new dependency.** **Next:** the LAST `/summary` sub-route + last log fallback
`bulk-log-workout` (the heavier `BulkLogWorkoutForm` ≤200-row page — CLOSES the `/summary` group); and/or the 8
deferred `/members` sub-routes.

---

## Run 38 — `summary/bulk-log-workout` (web page spec #24; `/summary` sub-route 6 of 6 — CLOSES the group; 3rd & final log fallback)

**Target:** the standalone **Bulk-log-workouts** mobile fallback — a `PageShell` + `PageHeader` wrapping the already-built
`BulkLogWorkoutForm` in its `variant="page"` branch (≤200-row table/cards → `POST /workout-logs/batch`). The 6th & LAST
`/summary` sub-route; **closes the entire `/summary` sub-route group** (3 chart drill-downs + 3 log fallbacks).

**Shape:** a **near-exact twin of runs 36/37** (the log fallbacks) — same `PageShell`/`PageHeader`/`<Form variant="page">`
wrapper, same `canLogForAny` role derivation, same `admin_only_data_entry` `router.replace` lock guard, same
`invalidateQueries(["summary"])` mutation, same D-C1 deterministic-nav cleanup (the two `router.back()` →
`router.push("/summary")`). The run was confirm-only: a 4-file read (legacy page · the rebuilt `BulkLogWorkoutForm` · the
two sibling rebuilt pages) + a consumption confirm (api fns + `ApiError.details` exported, route mounted+gated, batch
service enforces the role 403, landing routes mobile→here `summary/page.tsx:211`) + a SINGLE stance `AskUserQuestion`.

**The genuinely-new deltas (still code-determined → F-rows + a D-S1 note, NOT questions):**
1. **Two-way mount redirect (the bulk-only member-bounce, F1)** — unlike the single-redirect siblings (lock → `/summary`
   only), bulk ALSO bounces a non-admin/logger (`!canLogForAny`) to **`/summary/log-workout`** (`page.tsx:29-31`). Bulk
   logging is admin/logger-only; the single-log page is where a plain member logs for self. Backend is the real guard
   (`services/logService.js:191-192` — 403 "You do not have permission to bulk-log workouts.").
2. **Heavier form + per-row error plumbing (F4/F5)** — `BulkLogWorkoutForm` takes `rowErrors?: BulkRowError[]` (no
   `canSelectAnyMember`/`userId` — every reachable role is `canLogForAny`, so the form always shows a member `Select`);
   the page parses `ApiError.details as BulkRowError[]` and the form maps them onto rows by submit order.
3. Needs **both** lookups (member + workout-type), like `log-workout` (unlike `log-health`'s member-only).

**Stance:** user picked **faithful + D-C1 nav** (match the two sibling fallbacks). The two lock/role `router.replace`
redirects stay faithful (replace deliberately drops the bounced page from history).

**New durable lesson (promoted):** *a near-exact twin can carry ONE genuinely-new but still CODE-DETERMINED behavioral
shape (here the bulk-only second redirect to a sibling page) — recognize the twin, then the new shape lands as an F-row +
a D-S1 line, not a question.* The twin-recognition collapse (run 37) holds even when the twin isn't byte-identical: the
DECISION shape (D-SCOPE/D-REF/D-DEPS/D-S1/D-C1) still transcribes verbatim; only the §7/§10 prose absorbs the new shape.
Don't mistake a new code-determined behavior for a new open decision — if reading the file answers it, it's an F-row.

**Already-known patterns reconfirmed (not re-promoted):** confirm-only twin run (run 37); no-new-dep purest write-page
shape (run 36 — the bulk form + api + chrome all landed with the summary landing run 21); zero-backend / no-feature-bump
consuming page (the batch route + service + `addWorkoutLogsBatch` + `ApiError.details` rowErrors transport all already
shipped); `admin_only_data_entry` LIVE on a write page (3rd & last `/summary` sub-route where the lock bites); a
sub-route run can CLOSE its group — flip COVERAGE `[~]`→`[x]` and say so in D-SCOPE + PROGRESS (run 30/32 corollary);
"not a cleanup" `refreshSummaryQueries` rejection (runs 36/37).

**Output:** SPEC v0.1.0 (D-SCOPE/D-REF/D-DEPS/D-S1/D-C1; F1–F8; the "not a cleanup" `refreshSummaryQueries` note).
COVERAGE summary row updated (bulk-log-workout ✓; **6 of 6 — group CLOSED**) + logging row updated + PROGRESS prepended.
`npm run build` ✓ (`/summary/bulk-log-workout` prerendered, 1.38 kB — no Recharts, smallest write route; Middleware
27.5 kB active). **No feature bump, no new dependency.** **Next:** the `/summary` group is now COMPLETE (6/6) — the
SUB-ROUTE layer continues with the 8 deferred `/members` sub-routes (`list`/`detail`/`invite`/`metrics`/`history`/
`streaks`/`workouts`/`health`).

## Run 39 — `members/list` (web page spec #25; `/members` sub-route 1 of 8 — opens the group) — 2026-06-29

**Target:** the **active-member roster** behind the `/members` landing's "View Members" pill — a `PageShell` +
`PageHeader` ("Members" / program name / `backHref="/members"`) wrapping a search `GlassCard` + a grid of `MemberRow`
cards over `fetchMembershipDetails` (`GET /program-memberships/details`), client-filtered to `status==="active"` +
client name search. **1st** of the eight deferred `/members` sub-routes; the entry point to the deferred
`/members/detail` editor (global_admin-only row click).

**Shape:** the **purest no-new-dep read page** — 113-line legacy file, every import already ported, the sweep ports
nothing but the page file. Confirm-style run: read the legacy page in full + confirm each dep exists + a SINGLE stance
`AskUserQuestion`. Genuinely-open decision count = ONE (stance + the one tokenize cleanup); scope (this page; 1st of 8)
and deps (none) are fact-determined; role rules fully code-answered.

**The key dep finding (the new wrinkle):** a `/members` sub-route's CORE api dependency came from a **different feature
family's** already-ported module — `fetchMembershipDetails`/`MembershipDetail` live in `lib/api/programs.ts` (ported
with the `program` landing run 24 / `program/roles` run 26, already consumed by 2 live pages), **not** in the members
landing's `lib/api/members.ts` (run 22 ported that for the analytics cards). So "no new dependency" held even though the
*members landing* never touched this fn. Lesson: when sizing a sub-route's deps, grep the actual import paths — the
legacy file's imports may point at a sibling family's module, not the landing's own.

**Stance:** user picked **faithful + D-C1 tokenize** — the "Inactive" badge's literal `bg-red-100 text-red-600` →
theme-aware `bg-rf-danger/10 text-rf-danger` (the soft-tinted danger pill; the only untokenized color on the page;
avatar/star/text all already `rf-*`). The runs 27/28/29 tokenize-spectrum recurs: here a single per-site grep found ONE
untokenizable literal → one clean swap (not all-clean like run 28, not nothing like run 29).

**Role rules — fully code-answered (no question):** `useAuthGuard()` default, **no admin redirect**; every role sees the
same roster; only `isGlobalAdmin` makes rows clickable → `/members/detail`. `admin_only_data_entry` **N/A** (read-only
list — the run-22/33 read-only-dashboard finding). Notable F-row: an **entry-path asymmetry** — the landing's "View
Members" pill shows when `!canViewAs` (loggers/members) yet only global_admin can act on a row, so the roles that reach
the page via the pill see a purely informational list while global_admin (who arrives by other nav) gets the clickable
version. The `status` (membership) vs `is_active` (account) distinction is a second faithful F-row.

**Already-known patterns reconfirmed (not re-promoted):** no-new-dep purest read page (runs 27/29/31); selective per-site
tokenize cleanup (runs 27/31); read-only page → `admin_only_data_entry` N/A (runs 22/33); a sub-route run OPENS a new
group (the inverse of run 30/32/38's "closes the group" — say "1st of N, does not close" in D-SCOPE); zero-backend /
no-feature-bump consuming page (the route already mounted + gated, already consumed by 2 live pages); client-side
filter/search over already-loaded rows (the run-21 client-vs-server call — here the page is read-only so it's a flagged
characteristic, not a decision).

**Output:** SPEC v0.1.0 (D-SCOPE/D-REF/D-DEPS/D-S1/D-C1; F1–F5). COVERAGE members-dashboard row updated (list ✓; 1 of 8)
+ PROGRESS prepended. `npm run build` ✓ (`/members/list` prerendered, 2.37 kB — no Recharts; Middleware 27.5 kB active).
**No feature bump, no new dependency.** **Next:** the `/members` sub-route group continues — `detail` (the global_admin
editor this list links to), then `invite`/`metrics`/`history`/`streaks`/`workouts`/`health`.

## Run 40 — `members/detail` (web page spec #26; `/members` sub-route 2 of 8 — the editor `members/list` links to) — 2026-06-29
**Target:** the global_admin-only per-member editor behind `members/list`'s row click. Legacy `rasifiters-webapp/src/app/members/detail/page.tsx` (162 lines).
**Sweep:** identity card + editable Joined-Program date + Active-Membership checkbox → `updateMembership` (`PUT /program-memberships`, `joined_at`+`is_active` only); Remove → `removeMember` (`DELETE`); both → `router.push("/members/list")`. global_admin-only mount redirect (`!isGlobalAdmin → /members`). All deps verified present in rebuilt stack: `updateMembership`/`removeMembership`/`fetchMembershipDetails`/`MembershipDetail` in `lib/api/programs.ts` (runs 24/26), all chrome incl. `ConfirmDialog`, `useClientSearchParams`, `initials`. Backend: PUT `/` + DELETE `/` mounted at `/api/program-memberships`, `authenticateToken`-only at router; service enforces authz + last-admin 400.
**Genuinely-open count = ONE** (the cleanup set). Scope (2nd-of-8), no-new-dep, role logic (global_admin redirect), N/A lock, deterministic nav all code-answered. One `AskUserQuestion` (multiSelect of 3 cleanups, unselect-all = pure faithful). User took all 3.
**Decisions:** D-SCOPE (this page; 2nd of 8, does not close; resolves run-39 F1's nav target) · D-REF (`consumed_by=[web]`) · D-DEPS (no new dependency — the WRITE fns already in `lib/api/programs.ts`) · D-S1 (faithful 1:1; both navs already `router.push` → no nav cleanup) · D-C1 (`window.confirm` → `ConfirmDialog`) · D-C2 (tokenize Remove button `bg-red-100 text-red-600` → `bg-rf-danger/10 text-rf-danger`, matches run-39 list badge) · D-C3 (clear stale error on field edit). F1–F7 (client gate STRICTER than backend — service allows program admins too; no not-found empty state; shared query key with the list; PUT sends only join-date+active; one shared `isSaving` flag; client JWT-decode role drives redirect only; no client throttle).
**Output:** SPEC v0.1.0. COVERAGE members-dashboard row updated (detail ✓; 2 of 8) + PROGRESS prepended. `npm run build` ✓ (`/members/detail` prerendered, 3.26 kB — no Recharts; Middleware active). **No feature bump, no new dependency.**
**New durable patterns promoted:** (a) a sub-route's WRITE deps can already live in a DIFFERENT feature family's module — run 39 took the *read* fn, run 40 the *write* fns from the SAME `lib/api/programs.ts` (the members family's `lib/api/members.ts` was never touched); the import path is the source of truth, sized per-fn not per-family. (b) the nav-cleanup (runs 36–38) is conditional — when legacy ALREADY uses `router.push(<fixed>)` (not `router.back()`), there's NOTHING to clean; check the legacy nav calls before offering it. (c) a CLIENT gate can be STRICTER than the backend (global_admin-only redirect vs a service that also allows program admins) — that's a faithful F-row (the stricter client gate kept; the backend is the real boundary), the inverse of the usual "client laxer than backend" worry.
**Next:** the `/members` group continues — `invite`/`metrics`/`history`/`streaks`/`workouts`/`health` (6 of 8 remaining).

## Run 41 — `members/invite` (web page spec #27; `/members` sub-route 3 of 8 — the program-admin invite form) — 2026-06-29
**Target:** the program-admin / global_admin-only invite-by-username form behind the `/members` landing's "Invite Member" pill. Legacy `rasifiters-webapp/src/app/members/invite/page.tsx` (97 lines).
**Sweep:** `PageShell`+`PageHeader` ("Invite Member" / `backHref="/members"`) → a `modal-surface` card with a `@`-prefixed username `<input>`, a privacy info-banner, error/success lines, and a "Send Invitation" button → `sendProgramInvite` (`POST /program-memberships/invite`, body `{program_id, username}`). `isProgramAdmin = my_role==="admin" || global_admin`; non-admins `router.push("/members")` on mount. The landing's "Invite Member" pill gated identically (`canInvite = isProgramAdmin`, `members/page.tsx:48`) → entry path matches the redirect (consistent, unlike run-39's asymmetric pill). All deps verified present: `sendProgramInvite` in rebuilt `lib/api/members.ts:204` (ported vestigial-here with the `/members` landing run 22); `PageShell`/`PageHeader`/`useAuthGuard` all ported. Backend: `POST /api/program-memberships/invite` mounted `server.js:69`, `authenticateToken`-only; the program-admin/global_admin/self authz + the live `program.invite` notification emit live in `inviteService.sendInvite`.
**Genuinely-open count = ONE** (the cleanup set). Scope (3rd-of-8), no-new-dep, role logic (admin redirect), N/A lock, deterministic nav (stays on page after send) all code-answered. One `AskUserQuestion` pair (stance + multiSelect of 2 cleanups). User: faithful + both cleanups.
**Decisions:** D-SCOPE (this page; 3rd of 8, does not close) · D-REF (`consumed_by=[web]`) · D-DEPS (no new dependency — `sendProgramInvite` in this page's OWN members family's `lib/api/members.ts:204`) · D-S1 (faithful 1:1; imperative `handleSend`, local state, no React Query; stays on page after success → no nav cleanup) · D-C1 (tokenize success box `bg-green-50 text-green-600` → `bg-rf-success/10 text-rf-success`) · D-C2 (clear stale `errorMessage` on field edit). F1–F5: **F1 swallow-errors-as-success** — the catch surfaces an error ONLY for "network" messages; every other failure (username not found / already invited / blocked / 403) is silently rendered as "Invitation sent." with the field cleared — deliberate privacy-safety (the info-banner says the page won't confirm a username exists); F2 client redirect is the only client gate (backend 403 is the real boundary); F3 no inline username validation/existence check by design; F4 one-shot imperative call no React Query; F5 stays on page after success → no nav cleanup.
**Output:** SPEC v0.1.0. COVERAGE members-dashboard row updated (invite ✓; 3 of 8) + PROGRESS prepended. `npm run build` ✓ (`/members/invite` prerendered, 2.29 kB — no Recharts; Middleware active). **No feature bump, no new dependency.**
**New durable patterns promoted:** (a) the run-39/40 cross-family-dep lesson is sized per-FUNCTION, not per-family — run 39 found a sub-route's *read* fn in a DIFFERENT family's module, run 40 the *write* fns there too, but run 41's fn lives in the page's OWN members family's `members.ts`; the conclusion is the same ("grep the import path"), and a page's own-family module is just as valid a source — don't assume "no new dep" only holds when the dep came from elsewhere. (b) a faithful port's LOAD-BEARING characteristic can be a deliberate error-swallow for privacy (any non-network failure shown as success so a username's existence is never confirmed) — recognize it as intent (the visible info-banner corroborates), keep it faithful, flag it as an F-row, and NEVER offer it as a "fix" cleanup; surfacing the real error would be the privacy regression.
**Already-known patterns reconfirmed (not re-promoted):** no-new-dep purest page (runs 27/29/31/39); selective per-site tokenize (runs 27/31/39/40 — the lone untokenized color → one D-C); clear-stale-message-on-edit (runs 27/28/40); nav-cleanup is conditional, here nothing to clean because the page stays put (run 40); `admin_only_data_entry` N/A when the page isn't *logging* (runs 31/40); admin-redirect (not read-only degrade) is THIS page's gate (run 31 redirect-vs-degrade axis — read the guard); a sub-route run that OPENS-but-does-not-close a group (run 39 inverse of 30/32/38); genuinely-open count = ONE → one question, don't manufacture a scope question the page-pick settled (run 36).
**Next:** the `/members` group continues — `metrics`/`history`/`streaks`/`workouts`/`health` (5 of 8 remaining).
