# PROGRESS.md — Current State & Next Action

> **Read this FIRST every session.** It is the single source of truth for *where we are* and *what's
> next*. The cross-session loop: start → read this → work → at session end, update this file + commit
> (via `git-version`). Next session the user says **"continue"** and you resume from here.
>
> Keep it current: update **Current phase**, tick the **Build sequence**, and append a **Session log**
> entry each time. Durable decisions go in `METHODOLOGY.md` (decision log); legacy-coverage tracking in
> `COVERAGE.md`; this file is the live state + next-step pointer.

## Current phase

**Phase 1 — Provisioning + migration: DONE.** Scaffolding done. **Supabase provisioned** (2026-06-28): org
`RaSi Fiters` (`lxehyprifvuozciizlem`), project `rasifiters` ref **`kpadxjekpiwfkqcxtrio`**, `us-east-1`,
ACTIVE_HEALTHY; `.mcp.json` repointed. **Schema applied + data/auth MIGRATED to Supabase** (2026-06-28): all
13 tables reconcile with legacy (members 48 … notification_recipients 1304), **48/48 members created in
`auth.users` (bcrypt hashes imported, no resets) and linked via `auth_user_id`**, admin on
`admin@no-email.rasifiters.com`. Migration is idempotent (re-run = 48 skips, 0 dupes).

**Phase 2 — backend `auth`: DEPLOYED + VERIFIED LIVE (2026-06-28).** Render web service `rasifiters-api`
(`srv-d90tgmv7f7vs73cudptg`) at `https://rasifiters-api.onrender.com` via Blueprint
`apps/backend/render.yaml` (host = **Render, not Railway** — METHODOLOGY R7). Full auth round-trip green
against migrated data (admin): login→200 (bcrypt password verified, ES256 JWT), guarded route via JWKS
verify + `auth_user_id` mapping→200, garbage token→401, refresh→200, logout→200. Fixed a migration gap
en route (placeholder members had no `member_emails` row → `002` migration + migrator patch). Vercel still
deferred (no web code yet).

> NOTE: the user reset the Supabase DB password on 2026-06-28 — the value in the earlier scratchpad secrets
> file is STALE; the live one is in the user's password manager + `tools/migrator/.env` (gitignored).

## Next action

> **On "continue": spec + port `workout-logs`** via `question-asker` — single + batch + member workout-log
> writes/reads (`/api/workout-logs`), the surface that consumes `program_workouts` (the join target the
> just-ported feature owns). Then `daily-health-logs` → `analytics`. Each backend commit auto-deploys to Render.
>
> **Per-feature runtime smoke-tests are DEFERRED to a single pre-cutover pass (user decision 2026-06-29)** —
> do NOT re-offer them after each port. Every ported backend feature carries a "runtime smoke-test pending"
> note; they're batched and run together near cutover (needs a live admin JWT — can't be minted, the user
> supplies it then). Boot checks (module-load + route-stack) stay the per-port gate. See Open questions.
>
> **`program-workouts` is DONE (ported + DEPLOYED 2026-06-28)** — 6 `/api/program-workouts` routes + the 6
> program-scoped fns appended to the shared `workoutService.js` (both halves reunited; D-C1). The one
> deliberate change (**D-C2**): the per-action program-admin authz was **hoisted out of the service into a
> resolve-or-pass-through `requireProgramAdmin` route guard** (status codes preserved 1:1; `GET` ungated).
> `consumed_by = [web, ios]`, all 6 routes 1:1 (no divergence); `GET` also feeds the log forms + iOS widget.
> Faithful otherwise (merge/dual-id/lazy-materialization/dedup/in-use-guard kept + flagged F1–F7). Mounted +
> auto-deployed (Render); route confirmed live (`GET` no-token → 401, was 404 pre-mount). **Runtime
> smoke-test deferred to the batched pre-cutover pass.**
>
> **`workouts` (the library) is DONE (ported 2026-06-28)** — 4 `/api/workouts` routes + the 4 library fns
> split out of the shared service; `POST /mobile` dropped (byte-dup, D-C2); `consumed_by = [ios]` (GET-only
> live — web's `fetchWorkouts` is dead, admin CRUD called by neither client, D-REF). Faithful otherwise
> (bare unguarded delete kept + flagged F2). Mounted. **Pending:** runtime smoke-test vs live Supabase.
>
> **The two deferred 501 delete cascades are DONE (wired 2026-06-28)** — `members DELETE /:id` + auth
> `DELETE /account` now run the shared `utils/programMemberships.cascadeMemberDeletion` (destroy outbound
> invites + actored notifications, `handleMemberExit` per active membership/created program, notify remaining
> members, destroy the member) + best-effort Supabase `admin.deleteUser` after commit. Single-sourced, shared
> verbatim by both callers; live notification emits fire (notifications + invites ported). Both SPECs bumped
> 0.1.0→0.2.0. **Pending:** runtime smoke-test vs live Supabase (Render auto-deploy on push).
>
> **`invites` is DONE (ported 2026-06-28)** — 4 routes co-mounted at `/api/program-memberships`; the first
> feature with **live** emits (no deferred stub — the keystone realized). Faithful except two cleanups
> (dropped `target_member_id` D-C3a; batched `getAllInvites` N+1 D-C3b). Pending: runtime smoke-test vs live
> Supabase (Render auto-deploy on push).

**Phase 2 — backend.** Point the Express app at Supabase + swap auth to verify Supabase JWTs:
1. ~~Spec the backend **`auth`** feature via `question-asker`.~~ **DONE 2026-06-28** — see
   [`specs/features/auth/SPEC.md`](specs/features/auth/SPEC.md) v0.1.0 (decisions D-C1 whole-module scope /
   D-C2 JWKS+per-request DB-lookup verify / D-C3 clients-unchanged proxy / D-S1 faithful; flagged F1–F7).
   Registry + COVERAGE ticked.
2. ~~Port the backend foundation + `auth` feature into `apps/backend/`.~~ **DONE 2026-06-28** — data
   layer (13 models + index, `config/database.js`→`DATABASE_URL`, response/errorHandler) + auth slice
   (`config/supabase.js`, JWKS-verify `middleware/auth.js`, `services/authService.js`, `routes/auth.js`,
   `server.js` mounting only `/api/auth`). `npm install` + boot-check pass. **Two follow-ups carried**
   below (`/account` 501; asymmetric JWT keys).
3. ~~Provision Render + deploy the auth backend + smoke-test login→verify→refresh→logout.~~ **DONE +
   VERIFIED 2026-06-28** — live at `https://rasifiters-api.onrender.com` (`srv-d90tgmv7f7vs73cudptg`);
   full round-trip green against migrated data (see auth SPEC §12 / session log). Service id recorded in
   `CONTEXT.md` + the `deploy-scope-guard.sh` allow-list; auth status flipped 🏗️→🚀.
4. ~~Spec + port `members`.~~ **DONE 2026-06-28** — see [`specs/features/members/SPEC.md`](specs/features/members/SPEC.md)
   v0.1.0 (📄→🏗️). Ported `services/memberService.js` + `routes/members.js`, mounted `/api/members`. Faithful
   except the one deliberate change **D-C2** (`createMember` now creates a loginable member via Supabase
   `admin.createUser` + requires `email`); `DELETE /:id` deferred → 501 (**D-C1**, the auth `/account`
   pattern); `getAllMembers` excludes the migration-added `auth_user_id`. `POST`+`DELETE` are vestigial
   (called by neither client — **D-REF**). Boot check passes; **runtime smoke-test vs live Supabase pending**.
5. ~~Spec + port `programs`.~~ **DONE 2026-06-28** — see [`specs/features/programs/SPEC.md`](specs/features/programs/SPEC.md)
   v0.1.0 (🏗️ built — SPEC + ported). Four `/api/programs` routes; ported `services/programService.js` +
   `routes/programs.js`, mounted `/api/programs`. Faithful except the one deliberate cleanup **D-C2**
   (`createProgram` drops the vestigial `description` field — sent by no client, unupdatable, never returned);
   the `program.updated`/`program.deleted` notification emit is **deferred** → guarded `emitProgramNotification`
   no-op (**D-C1**, wired when `notifications` lands — CRUD fully functional); `getPrograms` keeps its two raw
   SQL branches verbatim (**D-S2**); `admin_only_data_entry` is web-only (**D-REF**). Boot check passes;
   **runtime smoke-test vs live Supabase pending** (the Render auto-deploy on push).
6. ~~Spec + port `program-memberships`.~~ **DONE 2026-06-28** — see
   [`specs/features/program-memberships/SPEC.md`](specs/features/program-memberships/SPEC.md) v0.1.0 (🏗️ built).
   6 of 8 routes ported (`createMemberAndEnroll` fixed→loginable **D-C2**; `getAvailableMembers`+`enrollMember`
   dropped as dead routes **D-C3**); `handleMemberExit` cascade ported (`utils/programMemberships.js`);
   notification emits deferred via a **deferred stub** `utils/notifications.js` (**D-C4**); invite-table writes
   ported. Mounted `/api/program-memberships`. Boot check passes. **Runtime smoke-test vs live Supabase pending.**
7. ~~Spec + port `notifications`.~~ **DONE 2026-06-28** — see [`specs/features/notifications/SPEC.md`](specs/features/notifications/SPEC.md)
   v0.1.0 (🏗️ built). 6 `/api/notifications` routes + the emit engine; **replaced the deferred
   `utils/notifications.js` stub** with the real `createNotification` (DB write + transactional SSE/APNs
   dispatch) + ported `utils/{notificationStreams,pushNotifications}.js` (added `apn` dep). Faithful except
   **D-C2** (the one migration delta — SSE stream auth migrated symmetric `jwt.verify` → Supabase JWKS via a
   shared `resolveReqUser` in `middleware/auth.js`, keeping the `?token=` query path) and **D-C4** (APNs creds
   deferred → `APNS_*` declared `sync:false` in `render.yaml`, push no-ops gracefully). `POST /broadcast` kept
   vestigial (no client, F1). Mounted `/api/notifications`. Boot check passes. **The keystone unblock:** the
   programs/program-memberships emit call sites now fire unchanged. **Runtime smoke-test vs live Supabase pending.**
8. ~~Spec + port `invites`.~~ **DONE 2026-06-28** — see [`specs/features/invites/SPEC.md`](specs/features/invites/SPEC.md)
   v0.1.0 (🏗️ built). 4 routes (`POST /invite`, `GET /my-invites`, `GET /all-invites`, `PUT /invite-response`)
   **co-mounted at `/api/program-memberships`** (`server.js` — `inviteRoutes` alongside `membershipRoutes`,
   mirroring legacy `server.js:50`); ported `services/inviteService.js` + `routes/invites.js`. The
   `ProgramInvite`/`ProgramInviteBlock` models + associations were already ported (with program-memberships).
   **The keystone realized:** `program.invite_received`/`program.member_joined` emits wired **live** (D-C2,
   no stub — notifications is ported). Faithful except two cleanups: dropped vestigial `target_member_id`
   (D-C3a) + batched `getAllInvites`' N+1 into one query (D-C3b); accept-path `ProgramMembership` write stays
   inline (D-C1). Boot check (4-route stack, emit engine wired, `InvitedByMember` assoc) passes.
   **Runtime smoke-test vs live Supabase pending.**
9. ~~Wire the two deferred 501 delete cascades.~~ **DONE 2026-06-28** — `members DELETE /:id` (members SPEC
   v0.2.0) + auth `DELETE /account` (auth SPEC v0.2.0) now run the shared
   `utils/programMemberships.cascadeMemberDeletion` + best-effort Supabase `admin.deleteUser` after commit.
   The cascade is single-sourced (owned by program-memberships, it drives `handleMemberExit`) and shared
   verbatim by both callers; the global-admin guard, 404, transaction, and success message stay per-caller.
   Boot check passes. **Runtime smoke-test vs live Supabase pending** (Render auto-deploy on push).
10. ~~Spec + port `program-workouts`.~~ **DONE 2026-06-28** — see
    [`specs/features/program-workouts/SPEC.md`](specs/features/program-workouts/SPEC.md) v0.1.0 (🏗️ built).
    6 `/api/program-workouts` routes + the 6 program-scoped fns appended to the shared `workoutService.js`
    (both halves reunited, D-C1). One deliberate change **D-C2** (per-action admin authz hoisted into a
    resolve-or-pass-through `requireProgramAdmin` route guard; service authz-free; status codes preserved;
    `GET` ungated). `consumed_by = [web, ios]` all 6 routes 1:1 (D-REF). Faithful otherwise (D-S1, F1–F7).
    Mounted. Boot check passes. **Runtime smoke-test vs live Supabase pending.**
11. **NEXT — spec + port the remaining backend features** (workout-logs, daily-health-logs, analytics…)
    via `question-asker`, mounting each route group in `server.js` as it lands. Each backend commit
    auto-deploys to Render (push to `main` touching `apps/backend/**`).

Re-run `tools/migrator/ → npm run migrate` right before cutover to sync any rows that changed on the legacy
app in the meantime (it's the pre-cutover sync, idempotent).

## Build sequence (the locked plan — see `METHODOLOGY.md`)

1. [x] **Scaffold the ICM repo** (L1–L5 + skills + hooks). _DONE 2026-06-28._
2. [~] **Provision infra** — Supabase DONE 2026-06-28. **Render `rasifiters-api` PROVISIONED + LIVE
       2026-06-28** (`srv-d90tgmv7f7vs73cudptg`, Blueprint `apps/backend/render.yaml`, id recorded in
       `CONTEXT.md` + the deploy-scope hook). Vercel `rasifiters-web` deferred until the web app has code.
3. [x] **Migrator** (`tools/migrator/`) — BUILT + EXECUTED against Supabase 2026-06-28. Preserved
       `members.id` UUIDs, imported bcrypt hashes → `auth.users` (48/48), backfilled `members.auth_user_id`,
       idempotent re-runnable sync. Schema in `apps/backend/sql/001_schema.sql` (applied). _DONE._
4. [~] **`backend`** — point Express at Supabase, swap auth middleware to verify Supabase JWTs (proxy
       login/refresh/logout), deploy to Render (Blueprint). Spec features as we go. _Auth feature SPEC'd
       (v0.1.0) + PORTED + **DEPLOYED to Render + verified live 2026-06-28** (`/api/auth` 🚀). `members`
       SPEC'd + ported (🏗️); `programs` SPEC'd + ported (📄, `/api/programs` mounted). Remaining backend
       features (program-memberships, invites, logs, workouts, notifications, analytics…) pending._
5. [ ] **`web`** — feature/page by feature/page (`question-asker` → spec → port code → `deploy` to Vercel
       temp domain). Proves the auth path end-to-end.
6. [ ] **`ios`** — feature/screen by feature/screen.
7. [ ] **Cutover** — switch `rasifiters.com` (Vercel) + ship the iOS build.

## Coverage snapshot

- Shared features documented: **8** — `auth` (🚀 v0.2.0), `members` (🏗️ v0.2.0), `programs` (🏗️), `program-memberships` (🏗️ v0.2.0), `notifications` (🏗️), `invites` (🏗️), `workouts` (🏗️ `[ios]`), `program-workouts` (🏗️ `[web, ios]`) (see `specs/features/REGISTRY.md`)
- Web page specs: **0** · iOS screen specs: **0** (see `specs/pages/REGISTRY.md`)
- Legacy surface coverage: see `COVERAGE.md` (all unchecked)

## Open questions (carry until resolved)

- **Runtime smoke-tests of ported backend features are BATCHED to a pre-cutover pass (decided 2026-06-29).**
  Don't re-offer a smoke-test after each feature port — every "🏗️ built" feature carries a standing
  "runtime smoke-test pending" note and they're verified together near cutover (Build-sequence step 7).
  Needs a live admin JWT (ES256/Supabase-signed — can't be minted by Claude; the user supplies a token or
  admin credentials at that time). Boot checks (module-load + route-stack) remain the per-port gate. Live
  routes confirmed mounted via unauthenticated probes as they deploy (`program-workouts`: `GET` no-token →
  401, 2026-06-28).
- ~~**Migrator — members without a primary email:** placeholder vs skip?~~ **RESOLVED 2026-06-28** —
  placeholder (`<username>@no-email.rasifiters.com`). Affects exactly 1 row (the `admin` account); keeps
  admin able to sign in. **Gap found + fixed during deploy verify:** the migrator wrote the placeholder to
  `auth.users` but NOT to `member_emails`, so admin 401'd at login (no email to resolve) → backfilled via
  `apps/backend/sql/002_*.sql` (user ran it) + patched `tools/migrator/src/importAuth.js` to write the row.
- **iOS auth approach:** backend-proxy (clients ~unchanged) vs embed `supabase-swift`. Leaning proxy.
- ~~**Two deferred delete cascades return 501** — `DELETE /api/auth/account` and `DELETE /api/members/:id`.~~
  **RESOLVED 2026-06-28** — both wired now that program-memberships/invites/notifications are ported. The
  faithful cross-feature cascade is single-sourced as `utils/programMemberships.cascadeMemberDeletion` and
  shared verbatim, + best-effort Supabase `admin.deleteUser` after commit. Both SPECs bumped 0.1.0→0.2.0.
- ~~**Supabase JWT signing keys must be asymmetric (ECC P-256/ES256)** for the JWKS verify path (D-C2).~~
  **RESOLVED 2026-06-28** — the project's JWKS endpoint (`/auth/v1/.well-known/jwks.json`) serves a live
  `ES256`/P-256 key (`kid 0f6cd324…`), so JWKS verify finds a key. No further action needed at deploy.
- ~~**`SUPABASE_ANON_KEY` not stored locally**~~ **OBTAINED 2026-06-28** — the user supplied the anon key
  (a public anon JWT). Kept OUT of git per policy; paste it into Render as the `SUPABASE_ANON_KEY`
  `sync: false` Blueprint secret at provisioning (alongside `DATABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`,
  both in `tools/migrator/.env`). All four backend env values are now in hand for the Render deploy.

## Session log (newest first)

- **2026-06-28 (pm-15)** — **Specced + ported the `program-workouts` feature** (8th feature — the
  program-scoped other half of the shared `workoutService.js`). `question-asker`: read the legacy
  `routes/programWorkouts.js` + the program-scoped half of `services/workoutService.js` + the `ProgramWorkout`
  model in full, fanned 2 `Explore` agents over web + iOS consumption. **Both clients call all 6 routes 1:1,
  no divergence** (`consumed_by = [web, ios]`): web's `lifestyle/workouts/page.tsx` (Workout Types mgmt) +
  iOS's `WorkoutTypesSection.swift` (`ViewWorkoutTypesListView`) drive the toggles + custom CRUD; `GET` is
  also read by the log forms (`LogWorkoutForm`/`BulkLogWorkoutForm`, which filter `is_hidden` client-side),
  the program dashboard, member-workout filters, and the iOS quick-add widget. 4 decisions: **D-C1** scope =
  the 6 program-scoped routes + fns split from `workoutService.js` (library half already → `workouts`);
  **D-C2** (the one change — user chose it) **hoist the per-action admin authz out of the service into a
  route guard** — a local **resolve-or-pass-through `requireProgramAdmin(resolveProgramId)`** factory whose
  per-route resolvers mirror each legacy fn's pre-admin-check guards, so 403 fires exactly where legacy's
  inline check did and the service still emits its native 400/404 first (status codes 1:1, CLAUDE.md
  non-breaking); `GET` stays ungated; **D-REF** `[web, ios]`, no divergence; **D-S1** faithful otherwise.
  Flagged F1–F7 (dual-meaning GET id `pw?.id || gw.id`; hidden rows included; lazy `program_workouts`
  materialization on first hide; the friendly in-use delete 400 vs the library's bare destroy; add/edit
  dedup vs program+global; unscoped `GET` read). Wrote SPEC v0.1.0 (no migration delta — models + schema
  pre-ported); registered in registry.json (`depends_on:[auth, workouts, program-memberships, programs]`) +
  REGISTRY.md + COVERAGE. Then **ported**: appended the 6 program-scoped fns to `services/workoutService.js`
  (inline admin checks removed, `requester` param dropped), `routes/programWorkouts.js` (6 routes + the guard
  factory), mounted `/api/program-workouts`. Boot check (6-route stack w/ correct ordering, `GET` ungated vs
  curation routes guarded, all 10 service fns export, server loads) passes. **Pending:** runtime smoke-test
  (Render auto-deploy on push). Next: `workout-logs` (consumes the `program_workouts` join target).
- **2026-06-28 (pm-14)** — **Specced + ported the `workouts` feature** (7th feature — the global workout
  library). `question-asker`: read the legacy `routes/workouts.js` + `services/workoutService.js` + `Workout`
  model in full, fanned 2 `Explore` agents over web + iOS consumption. **Decisive reframe:** web calls
  **none** of the 5 `/api/workouts` routes (its `fetchWorkouts` wrapper is defined-but-dead), and iOS calls
  **only `GET`** (the "Add Workout" picker reference). So the admin CRUD (`POST`/`PUT`/`DELETE`) is called by
  **neither client**, and `POST /mobile` is a byte-identical dup of `POST /`. 4 decisions: **D-C1** scope =
  the global library only (the program-scoped half of the shared `workoutService.js` → the next
  `program-workouts` feature, per COVERAGE lines 18 vs 19); **D-C2** (the one change) **drop the dead
  byte-dup `POST /mobile`**; **D-REF** `consumed_by = [ios]` (GET-only live), flag web's dead `fetchWorkouts`
  + the unused admin CRUD; **D-S1** faithful otherwise — **keep the bare unguarded `deleteWorkout`** (the
  un-cascaded `program_workouts.library_workout_id` FK → 500 when in use, flagged F2) + the no-dedup-precheck
  create (unique-500, F5). Wrote SPEC v0.1.0 (no migration delta — model + schema already ported); registered
  in registry.json (`depends_on:[auth]`) + REGISTRY.md + COVERAGE. Then **ported**: `services/workoutService.js`
  (library half only — 4 fns), `routes/workouts.js` (4 routes, no `/mobile`), mounted `/api/workouts`. Boot
  check (4 fns, 4 routes, `/mobile` absent, server loads) passes. Also fixed COVERAGE's stale members line
  (cascade now wired v0.2.0). **Pending:** runtime smoke-test (Render auto-deploy on push). Next:
  `program-workouts` (the other half of the split service).
- **2026-06-28 (pm-13)** — **Wired the two deferred 501 delete cascades** (`members DELETE /:id` + auth
  `DELETE /account`) now that program-memberships/invites/notifications are ported. Read both legacy bodies
  (`memberService.deleteMember` + `authService.deleteAccount`) — they are byte-identical — so **single-sourced**
  the cascade as `utils/programMemberships.cascadeMemberDeletion` (the util that already owns
  `handleMemberExit`): destroy outbound `program_invites` (by `invited_by`/`invited_username`/`invited_email ∈
  member emails`) + `notifications` where `actor_member_id = member.id`, run `handleMemberExit` (`updateCreatedBy:true`,
  `includeExitingMemberInRecipients:false`, `notificationActorId:null`) for every active membership + created
  program, emit `program.member_left` to remaining members, destroy the member. Each caller keeps its own
  transaction + global-admin guard + 404 + success message; the **migration delta** is best-effort
  `supabaseAdmin.auth.admin.deleteUser(auth_user_id)` **after commit** (an orphaned `auth.users` row maps to
  no member → safe ordering). Updated both SPECs (route table, §4 prose, D-C1, F1, changelog) + bumped
  0.1.0→0.2.0; fixed the auth SPEC status (was "not yet deployed" → 🚀). Boot check (services + routes load,
  `cascadeMemberDeletion` exported, no circular dep) passes. **Pending:** runtime smoke-test (Render
  auto-deploy on push). Next: spec + port `workouts`/`program-workouts` → logs → analytics.
- **2026-06-28 (pm-12)** — **Specced + ported the `invites` feature** (6th feature — the co-mounted other
  half of `/api/program-memberships`). `question-asker`: read the legacy `routes/invites.js` +
  `inviteService.js` + the 2 models in full, fanned 2 `Explore` agents over web + iOS. `consumed_by =
  [web, ios]` — **all 4 routes 1:1 across clients, no divergence** (web `lib/api/{invites,members}.ts` +
  `/members/invite` + `/programs` modal; iOS `APIClient+Invites.swift` + `InvitesTabView` + `InviteMemberView`;
  matching DTOs). 6 decisions: **D-C1** scope = the 4 routes + `inviteService` + the `ProgramInvite`/
  `ProgramInviteBlock` tables, accept-path `ProgramMembership` write stays **inline** (faithful); **D-C2** the
  `program.invite_received`/`program.member_joined` emits wired **LIVE** (no stub — the keystone is ported);
  **D-C3a** drop the vestigial `target_member_id` (sent by neither client, read by no path); **D-C3b** fix
  `getAllInvites`' N+1 (one batched `Member.findAll` + map vs `Promise.all(findOne)` per invite); **D-REF**
  `[web, ios]` gates match; **D-S1** faithful otherwise. Flagged F1–F7 (privacy-safe `sendInvite` swallows
  throws to 200; global-admin accept-on-behalf+revoke; web's *second* accept path via `updateMembership`;
  `member_name` VIRTUAL dep; unused `invited_email`; hardcoded 30-day expiry/`max_uses:1`). Wrote SPEC v0.1.0;
  updated registry.json + REGISTRY.md + COVERAGE. Then **ported**: `services/inviteService.js` (4 fns, the two
  cleanups, live emits via the ported `utils/notifications`), `routes/invites.js` (4 routes, faithful), mounted
  `inviteRoutes` at `/api/program-memberships` in `server.js` (alongside `membershipRoutes`). Boot check
  (4-route stack, emit engine wired, `InvitedByMember` assoc, server loads) passes. **The keystone realized:**
  first feature with **live** emits — the deferred-stub seam (programs/program-memberships) isn't needed.
  **Pending:** runtime smoke-test (Render auto-deploy on push). Next: wire the two 501 delete cascades to
  `handleMemberExit`, or port `workouts`.
- **2026-06-28 (pm-11)** — **Specced + ported the `notifications` feature** (5th feature — **the keystone**).
  `question-asker`: read the legacy `routes/notifications.js` + `utils/{notifications,notificationStreams,
  pushNotifications}.js` + the 3 models in full, fanned 2 `Explore` agents over web + iOS consumption.
  `consumed_by = [web, ios]`: **both** clients open the SSE stream (web `EventSource` `?token=`
  `NotificationsGate.tsx:144`; iOS `NotificationStreamClient.swift:12`) + call `GET /unacknowledged` +
  `POST /:id/acknowledge` + render a single-notification modal queue; **iOS-only** the APNs device lifecycle
  (`PUT/DELETE /device`); **`POST /broadcast` called by neither client** (vestigial, F1). 4 decisions (all the
  faithful lead): **D-C1** scope = the module only (replaces the deferred stub; cross-feature emits/cascades
  stay their features' follow-ups); **D-C2** (the one migration delta) the SSE stream auth swaps symmetric
  `jwt.verify(JWT_SECRET)` → Supabase JWKS verify (`verifySupabaseJwt` + `sub`→member), keeping the `?token=`
  query path for `EventSource`; **D-C4** defer APNs creds (`getProvider()→null` ⇒ push no-ops, SSE+DB live);
  **D-S1** faithful, keep broadcast vestigial. Wrote SPEC v0.1.0; updated registry.json + REGISTRY.md +
  COVERAGE. Then **ported**: **replaced** `utils/notifications.js` (DEFERRED STUB → real `createNotification`
  DB write + transactional `afterCommit` SSE/APNs dispatch + `getMemberIdsWithPushTokens`), added
  `utils/notificationStreams.js` (SSE registry) + `utils/pushNotifications.js` (APNs, `apn@^2.2.0`,
  graceful-null), refactored `middleware/auth.js` to share `resolveReqUser` between `authenticateToken` +
  the new `authenticateStream` (D-C2), `routes/notifications.js` (6 routes), mounted `/api/notifications`,
  added `APNS_*` `sync:false` to `render.yaml`. `npm install` + syntax + boot check (6-route stack,
  `authenticateStream` exported, `getProvider()→null`) pass. **Key unblock:** the deferred emits across
  programs/program-memberships now fire **unchanged** (the stub is gone). **Pending:** runtime smoke-test
  (Render auto-deploy on push). Next: `invites` (the co-mounted membership half) or wire the two 501 delete
  cascades to `handleMemberExit`.
- **2026-06-28 (pm-10)** — **Specced + ported the `program-memberships` feature** (4th feature). `question-asker`:
  read `routes/memberships.js` + `membershipService.js` + `utils/programMemberships.js` (`handleMemberExit`) +
  the model in full, fanned 2 `Explore` agents over web + iOS. `consumed_by = [web, ios]`; gates match across
  clients (no divergence). Decisions: **D-C1** scope = the 6 membership routes + `handleMemberExit`; the
  co-mounted invite routes (`server.js:50`) → the separate `invites` feature; **D-C2** (change) fix
  `createMemberAndEnroll` → loginable (Supabase `createUser` + require `email`, mirroring members D-C2) — same
  latent password bug; **D-C3** (change) drop the 2 dead routes `GET /available` + `POST /enroll` (called by
  neither client — iOS methods dormant, web absent); **D-C4** defer the notification emits (role_changed/
  member_removed/member_left + the cascade emits) via a **deferred stub** `utils/notifications.js` (real
  `getActiveProgramMemberIds`, no-op `createNotification`). Stance "change/clean up" pinned by a scope follow-up
  to exactly D-C2 + D-C3. Flagged F1–F7 (handleMemberExit's caller-specific params for the deferred members/auth
  cascades; self-service status matrix; last-admin guard; the cross-feature invite-table writes ported since the
  models exist). Wrote the SPEC v0.1.0; updated registry.json + REGISTRY.md + COVERAGE. Then **ported**:
  `utils/notifications.js` (stub), `utils/programMemberships.js` (faithful cascade), `services/membershipService.js`
  (6 fns, createMemberAndEnroll fixed), `routes/memberships.js` (6 routes), mounted `/api/program-memberships`.
  Boot check (6 service fns + handleMemberExit + 6-route stack + 6 models) passes. **Key unblock:** porting
  `handleMemberExit` here gives the deferred members `DELETE /:id` + auth `/account` their cascade dependency —
  wiring those is the members/auth follow-up. **Pending:** runtime smoke-test (Render auto-deploy on push).
  Next: `notifications` (replaces the stub + unblocks every deferred emit).
- **2026-06-28 (pm-9)** — **Specced + ported the `programs` feature** (3rd feature). `question-asker`: read
  the legacy `routes/programs.js` + `services/programService.js` + `Program` model in full, fanned 2
  `Explore` agents over web + iOS consumption (`consumed_by = [web, ios]`, all four routes). Decisions:
  **D-C1** the `program.updated`/`program.deleted` notification emit is **deferred** (it drags in SSE streams
  + APNs push = the undocumented `notifications` feature) → guarded `emitProgramNotification` no-op, CRUD
  ports fully functional (a side-effect deferral, vs the members whole-route 501); **D-C2** (the one
  deliberate change, user chose clean-up) `createProgram` **drops the vestigial `description` field** — sent
  by neither client, unupdatable, never returned (the create-field analog of members' dead routes), with a
  scope-pinning follow-up confirming drop-only; **D-S2** `getPrograms` keeps both raw `sequelize.query`
  branches verbatim; **D-REF** `admin_only_data_entry` is web-only (web edit-page toggle; iOS `ProgramDTO`
  never decodes/sets it) — backend serves/accepts it for both faithfully. Flagged F1–F7 (incl. always-equal
  total/active counts, decoded-but-never-served `enrollments_closed`). Wrote `specs/features/programs/SPEC.md`
  v0.1.0; updated registry.json + REGISTRY.md + COVERAGE (`[~]`). Then **ported**: `services/programService.js`
  (faithful raw-SQL list, create w/o description, update/soft-delete with deferred emit), `routes/programs.js`
  (faithful 1:1), mounted `/api/programs` in `server.js`. Boot check (4 service fns + GET/POST/PUT/DELETE
  route stack + models resolve) passes. **Pending:** runtime smoke-test vs live Supabase (the Render
  auto-deploy on push). Next: `program-memberships` (owns the `ProgramMembership` join + the deferred
  cascades).
- **2026-06-28 (pm-8)** — **Specced + ported the `members` feature** (2nd feature). `question-asker`: read
  the legacy `routes/members.js` + `services/memberService.js` in full, fanned 2 `Explore` agents over web +
  iOS consumption. Key finding — **`POST`/`DELETE /api/members` are called by neither client** (both use
  `/auth/register` + `/program-memberships`), reframing it as read + self-profile-update with two vestigial
  admin routes. User chose to **fix** the latent bug in `createMember` (legacy destructured `password` but
  never persisted it → unloggable member): D-C2 wires it to Supabase `admin.createUser` + requires `email`.
  Wrote `specs/features/members/SPEC.md` v0.1.0 (D-C1/D-C2/D-REF/D-S1, F1–F6); committed
  (`docs(members)` + `chore(skills)`) + tagged `feature/members@v0.1.0` + pushed. Then **ported**:
  `services/memberService.js` (faithful reads/update; `createMember` change reusing
  `authService.validatePassword`/`normalizeEmail`; `getAllMembers` excludes `auth_user_id`;
  `deleteMember`→501 per D-C1), `routes/members.js` (faithful 1:1), mounted `/api/members` in `server.js`.
  Boot check (module load + 5-route stack) passes. Status 📄→🏗️. **Pending:** runtime smoke-test vs live
  Supabase (the auto-deploy to Render on push). Next: the remaining backend features.
- **2026-06-28 (pm-7)** — **Deployed the auth backend to Render + verified it live.** User provisioned the
  Blueprint (`apps/backend/render.yaml`) and connected GitHub auto-deploy; service `rasifiters-api`
  (`srv-d90tgmv7f7vs73cudptg`) live at `https://rasifiters-api.onrender.com`. Smoke test: `GET /`→200
  (DB connected), `/api/app-config`+`/api/test`→200, guarded route no-token→401, bogus login→401. Full
  signed-in round-trip against migrated `admin`: login→200 (**imported bcrypt password verified**, ES256
  JWT `kid 0f6cd324…`); guarded route w/ valid token→200 (`authenticateToken` JWKS verify +
  `sub`→`members.auth_user_id`, the D-C2 path); garbage token→401; refresh→200; logout→200. **Found + fixed
  a migration gap:** placeholder (no-email) members had no `member_emails` row → `admin` 401'd before the
  password check; shipped `apps/backend/sql/002_backfill_placeholder_member_emails.sql` (user ran it) +
  patched `tools/migrator/src/importAuth.js` (writes the placeholder row on create/link/re-run). Recorded
  the deploy: `CONTEXT.md` + `apps/backend/CONTEXT.md` (URL + service id), filled the
  `deploy-scope-guard.sh` allow-list (+ a real render-srv guard, tested), flipped `auth` 🏗️→🚀 in
  registry/REGISTRY/SPEC §12. Next: spec + port the remaining backend features.
- **2026-06-28 (pm-6)** — **Switched the backend host Railway → Render** (user decision; METHODOLOGY R7).
  Researched Render's mechanics (Blueprint spec, monorepo `rootDir`+`buildFilter`, env-var model, hosted
  MCP, health checks, PORT/host). Authored **`apps/backend/render.yaml`** (Blueprint: `type: web`,
  `rootDir: apps/backend`, `npm ci`/`npm start`, `healthCheckPath: /`, `autoDeployTrigger: commit`,
  `buildFilter.paths: [apps/backend/**]`; non-secret vars inline, the 3 secrets as `sync: false`).
  `server.js` now binds `0.0.0.0` (Render injects `PORT`, default 10000). Swept every Railway reference →
  Render across the repo: `.mcp.json` (`railway`→`render` MCP `https://mcp.render.com/mcp`),
  `.env.mcp.example`, the `deploy-scope-guard.sh` hook, the **`deploy` skill** (prereqs, workflow §2,
  git→deploy pipeline §B, smoke test, converged lessons, frontmatter), `ENV_RUNBOOK.md` (§1/§2 Render
  inspect+change mechanics, §3/§6 host delta), `METHODOLOGY.md` (R4 amended + new **R7**), `ICM.md`,
  `CLAUDE.md`, `CONTEXT.md`, `SETUP.md`, `README.md`, `apps/{web,backend}/CONTEXT.md`, the `supabase` +
  `health-check` skills, the auth SPEC changelog, `package.json`. Also **verified the asymmetric Supabase
  JWT keys are already live** (JWKS serves an ES256/P-256 key) — that open blocker is resolved. NOT
  committed yet (use `git-version`). Next: provision the Render Blueprint + deploy (needs the user's
  `SUPABASE_ANON_KEY`), then smoke-test the auth path.
- **2026-06-28 (pm-5)** — **Ported the backend foundation + `auth` feature** into `apps/backend/`. Data
  layer (faithful 1:1 via a subagent): `config/database.js` (`DB_URL`→`DATABASE_URL`, kept
  `rejectUnauthorized:false` per F6), 13 models + `models/index.js` with the R1 deltas
  (`Member.auth_user_id` added; `member_credentials`/`refresh_tokens` models + associations dropped),
  `utils/response.js`, `middleware/errorHandler.js`. Auth slice (hand-written per SPEC §7):
  `config/supabase.js` (anon + service clients + `verifySupabaseJwt` via jose JWKS), `middleware/auth.js`
  (Supabase-JWT verify + `sub`→`auth_user_id` member lookup rebuilding the legacy `req.user`; authz gates
  unchanged), `services/authService.js` (proxy login/refresh/logout via Supabase, register/change-password
  via admin API; `/account` deferred → 501), `routes/auth.js` (faithful), `server.js` (mounts only
  `/api/auth`). `package.json` drops `jsonwebtoken`/`bcrypt`, adds `@supabase/supabase-js`+`jose`+`uuid`.
  `npm install` + boot-check pass (syntax, module load, models wired, jose JWKS wire reached). Next:
  Railway deploy (needs asymmetric Supabase JWT keys + env) and the remaining backend features.
- **2026-06-28 (pm-4)** — **Specced the backend `auth` feature** (first SPEC in the repo) via
  `question-asker`. 3 parallel Explore agents mapped the legacy auth (route+service · middleware+authz ·
  models+config); re-read `authService.js`/`middleware/auth.js`/`routes/auth.js` in full to verify every
  `file:line`. 4 decisions confirmed (all faithful): **D-C1** scope = whole `middleware/auth.js` module
  (authN + authZ gates) as one unit; **D-C2** verify Supabase JWTs via **JWKS (ES256) + per-request
  `sub`→`members.auth_user_id` lookup** to rebuild `req.user` (deliberate change from legacy's
  lookup-free token); **D-C3** clients unchanged, `consumed_by=[web,ios]`, login proxies Supabase sign-in
  via username→primary-email resolution, refresh/logout proxy Supabase, `refresh_tokens` retires;
  **D-S1** faithful 1:1 (flagged F1–F7: dual payloads, no rate-limit, unused auth_identities/
  email_verification_tokens, rejectUnauthorized:false, two JWT verifiers, vestigial `userId`). Wrote
  `specs/features/auth/SPEC.md` v0.1.0; updated REGISTRY.md + registry.json + COVERAGE (auth ticked `[x]`).
  Not committed yet (use `git-version`). Next: port the backend per §7.
- **2026-06-28 (pm-3)** — **Ran the migration against live Supabase.** User applied
  `apps/backend/sql/001_schema.sql` + reset the DB password + handed over creds; filled
  `tools/migrator/.env`. Dry-run → `npm run migrate`: all 13 tables copied + reconciled vs legacy, **48
  `auth.users` created (bcrypt imported) and 48/48 members linked**, admin on the placeholder email
  (confirmed via `auth.users` join). Idempotency re-run = 48 skips, `auth.users` still 48. Migration done;
  next is Phase 2 (backend). Fixed two migrator bugs found while wiring it (auth/verify modes need the
  legacy DSN; added `sslmode=disable` escape hatch).
- **2026-06-28 (pm-2)** — **Built the migrator + faithful schema.** Mapped the live legacy schema via
  `pg_dump --schema-only` (richer than the Sequelize models: real CHECKs, `programs.created_by NOT NULL`,
  composite FKs, partial unique index; found `auth_identities`/`email_verification_tokens` empty +
  `legacy_*` cruft). Wrote `apps/backend/sql/001_schema.sql` (13 canonical tables, idempotent
  `IF NOT EXISTS`, the `members.auth_user_id`→`auth.users` delta; retired
  member_credentials/refresh_tokens/auth_identities/email_verification_tokens) and `tools/migrator/` (Node:
  generic FK-ordered upsert copy + bcrypt→Supabase-Auth import + backfill + reconciliation report).
  Resolved the no-email question → placeholder for `admin`. **Validated locally** against the real Render
  data into a throwaway Postgres: schema applies + is idempotent; all 13 tables row-count match
  (members 48 … notification_recipients 1304); auth dry-run = 48/48 with bcrypt hash, 1 placeholder.
  Awaits the user to apply the schema + run against Supabase.
- **2026-06-28 (pm)** — **Provisioned Supabase.** Created a new org `RaSi Fiters` (`lxehyprifvuozciizlem`)
  + project `rasifiters` (ref `kpadxjekpiwfkqcxtrio`, `us-east-1`, ACTIVE_HEALTHY) via the Supabase CLI
  (upgraded 2.67→2.108 to fix the broken `--region` enum; trusted the `supabase/tap`). DB password generated
  with `openssl rand -hex 24`; captured all keys (anon/service_role + new publishable/secret) + the three
  DATABASE_URL forms (direct IPv6 / session-pooler `aws-1-us-east-1` :5432 / txn-pooler :6543, all verified
  with `psql select`) into the gitignored scratchpad secrets file for the user's password manager. Repointed
  `.mcp.json` `supabase-rasifiters` to the real ref; updated `ICM.md` + `CONTEXT.md`. Railway/Vercel
  deferred (no app code yet). Next: build `tools/migrator/`.
- **2026-06-28** — Scaffolded the ICM repo from higgins-master; then restructured to fit RaSi: dropped
  `companies/` → `apps/`; split specs into `specs/features/` + `specs/pages/` (with role-based view rules);
  removed the `stitch` skill (faithful direct port instead); repurposed `audit` as a web↔iOS parity check;
  dropped per-feature version folders; made features client-specific-capable; added this `PROGRESS.md`.
