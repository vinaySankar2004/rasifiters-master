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
