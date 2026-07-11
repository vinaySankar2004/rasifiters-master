# git-version — LESSONS ARCHIVE (verbose run-by-run history)

> Full run history, moved out of `SKILL.md` to keep it lean (not auto-loaded into context).
> Durable, project-agnostic patterns are distilled in `SKILL.md` → "Converged lessons".
> **Protocol:** append one entry per skill run below; when a pattern proves itself across runs,
> promote it into `SKILL.md` "Converged lessons" and keep this archive as the detailed history.

## Lessons log (append every run — the self-learning loop)
Before ending a run, capture what you learned: a detect/bump call that was non-obvious, a
blast-radius reverse-scan subtlety, a dangling-edge case, anything awkward in staging/tagging.

### 2026-07-09 — Run: doc-health Android-parity pass + new `multiplex` agent infra (NO bump)
Touched 4 `specs/features/<f>/SPEC.md` files (analytics, program-memberships, programs, workouts) **and**
`registry.json` — yet the correct call was **zero feature bumps, zero `feature/*` tags**. Two reusable
judgments: (1) **Reordering a SPEC's §11 changelog rows newest-first is cosmetic** — no behavior/contract
delta, so no bump (map-to-feature ≠ auto-bump; the cosmetic-refinement rule applies to SPEC prose too).
(2) **Adding a client to `consumed_by` retroactively (here `"android"` on 10 features) is ADDITIVE — a new
consumer satisfying a pre-existing dangling edge, FYI-only, no gate, no bump.** The producer's contract did
not change; the registry was simply corrected to reflect an already-shipped consumer (the Android port).
Hard-gate + bump only when an EXISTING node's contract (`depends_on`/`reference_impl`/owned interface)
changes — not when a consumer is appended. The interleaving of android-build + multiplex index-pointer edits
across ICM/METHODOLOGY/CLAUDE/README made a clean two-commit split impractical (same lines, both concerns),
so it shipped as one well-messaged chore commit — acceptable when the concerns co-touch the same hunks.
Also: the SKILL.md still says "## 12. Changelog" but the SPECs use **§11** — cosmetic skill-doc lag, noted.

### 2026-07-01 — Run: `workout-logs` v0.3.0 (D-C8, single+bulk merge)
A feature that spans **backend + both clients + 2 page SPECs** still maps to **one** feature bump: only
`services/logService.js` is a `reference_impl` path for `workout-logs`, so the changeset → `workout-logs`
0.2.1→**0.3.0** (MINOR — new documented D-C8 behavior, backward-compatible auth relaxation on the batch
endpoint). The two page SPECs (`specs/pages/web/summary`, `specs/pages/ios/log-workout`) are **page** specs,
not registry features — bump their own header/§Changelog inline, they don't touch registry.json. Blast-radius
dependents (`daily-health-logs`/`analytics`/`analytics-v2`/`member-analytics`) only *read* `workout_logs`
data, so a write-path auth change is FYI, not a gate. Staged explicitly (file-by-file, incl. the 4 deletions
+ 2 renames Git auto-detected `R`); skills-lessons split into their own `chore(skills)` commit per protocol.
Tags-invariant note: `feature/*` count (29) > node count (15) is EXPECTED — historical per-version tags
accumulate (workout-logs has 4); the equality invariant is a backfill-era guard, not a per-run check.

### 2026-06-28 — Run 1: `auth` SPEC commit (first feature)
New feature, no prior version → **v0.1.0**. Split into a `docs(auth)` feature commit (SPEC + registry +
REGISTRY + COVERAGE + PROGRESS) tagged `feature/auth@v0.1.0`, and a separate `chore(skills)` commit for
the question-asker lessons (per the "lessons edits = separate chore commit" rule). Session-scoped
staging (explicit `git add`, no `-A`). Tags invariant held (1 node = 1 tag).

### 2026-06-28 — Run 2: `auth` faithful PORT (status flip, no bump)
Ported the legacy auth layer into `apps/backend/`. Key call: **a faithful port is a `feat` progress
commit with NO semver bump** — the SPEC contract (D-C1/2/3) didn't move, so v0.1.0 stays; only the
status flipped 📄 documented → 🏗️ built (registry.json `status`, REGISTRY.md emoji, SPEC header +
a `0.1.0 (built)` §changelog note). **Tag refresh on a flip:** `git tag -f feature/auth@v0.1.0` moved the
tag from the SPEC commit (aeeba10) to the built commit (6c792ad) — needs a `git push -f` for that one tag
since v0.1.0 was already pushed. Blast-radius: `auth → dependents: [] · apps: [web, ios]`, no contract
change → FYI only, no gate. Mapped the rebuilt `apps/backend/**` code to the `auth` feature (the
registry `reference_impl.paths` still name the *legacy* `../backend` paths; the rebuilt-code↔feature
mapping is by correspondence, not by those paths).
**Pattern to watch:** when one feature's port creates shared foundation (models for *other*, unspecced
features), that foundation rides in the same feature commit — it's not its own feature delta. Fine for
now; revisit if a later feature needs to claim ownership of a model file.

_Earlier note: this was a fresh ICM repo; `auth` is the first documented + first built feature._

### 2026-06-28 — Run: programs feature (v0.1.0 + port)
**Shape:** a NEW node committed *and* ported in one session → a single `feat(programs)` commit (SPEC +
code + registry/REGISTRY/COVERAGE/PROGRESS + server.js mount) with the status flip 📄→🏗️ folded in (no
separate flip commit, since this is the node's first appearance), plus a separate `chore(skills)` commit
for the question-asker LESSONS_ARCHIVE. **Bump:** new feature → v0.1.0, no confirmation needed (user named
the tag). **Blast-radius:** new node, `depends_on [auth, program-memberships, notifications]` (two dangling
forward edges — fine, additive/FYI, no gate); `consumed_by [web, ios]`. **Status consistency catch:** I'd
initially set programs `documented`/📄 in the registry, but it was actually *ported* (same state as
`members` = `built`/🏗️) — flipped registry/REGISTRY/SPEC-header/COVERAGE/PROGRESS to 🏗️/`built`/[x] before
committing so the two ported backend features read consistently. **Lesson: when a run both specs AND ports,
the registry status is `built` not `documented` — match the sibling feature's representation, don't leave
it at the spec-only state.** **Tag gotcha: `git push --follow-tags` does NOT push lightweight tags** (these
feature tags are lightweight) — had to `git push origin feature/programs@v0.1.0` explicitly. **Lesson: for
this repo's lightweight feature tags, push the tag by name (or use `--tags`), not `--follow-tags`.**

### 2026-06-28 — Run: wire the two deferred 501 delete cascades (auth + members @ v0.2.0)
**Shape:** a *fill-in-the-deferral* change — two routes that shipped as documented `501` stubs (auth
`DELETE /account`, members `DELETE /:id`) became functional now that their cross-feature dependencies
(program-memberships/invites/notifications) are ported. This is a real behavior delta (501→200), so it's a
**MINOR bump** (functionality previously deferred), NOT a faithful no-bump flip. **One commit touched THREE
features:** the byte-identical legacy cascade was extracted into a single new export
`cascadeMemberDeletion` on `utils/programMemberships.js` — a registered `reference_impl` path of
**program-memberships** — so that feature ALSO took a MINOR bump (additive owned-interface growth,
`handleMemberExit` unchanged, zero dependent re-version). **Lesson: a single behavioral commit can map to
multiple features via reference_impl paths — bump each touched feature, even the one that only gained a new
shared export.** **Mutual-edge bookkeeping:** auth + members now *import* program-memberships' util →
each gained `depends_on: program-memberships`. program-memberships already depended on auth+members
(middleware/models), so this completes a legitimate **mutual edge** (cycle). The skill explicitly allows
this ("Mutual edges need BOTH halves written") — wrote both halves. Additive edges to an already-built node
= FYI, no gate. **DRY-vs-faithful judgment:** legacy duplicated the cascade verbatim across two services;
chose to single-source it in the util that already owns `handleMemberExit` rather than copy-paste — matches
the workspace DRY standard while staying behavior-faithful (each caller keeps its own tx/guard/404/message).
**Three tags this run:** `feature/{auth,members,program-memberships}@v0.2.0`; verified each registry node's
current version has a matching tag (6 nodes, all current). **Push:** lightweight tags → `git push` then
`git push origin <tag>...` by name (not `--follow-tags`).

### 2026-06-30 — Run: `notifications` APNs creds provisioned (D-C4→D-C8 @ v0.2.1)
**Shape:** a *config/ops enablement of a previously-deferred decision* — the APNs push path shipped
fully-coded at the original port (D-C4) but with **no credentials**, so `getProvider()` returned `null`
and push was a graceful no-op. This run the user created a token-based APNs Auth Key at Apple + entered the
four `APNS_*` values in the Render Dashboard; nothing in `apps/**` code changed. **Bump call = PATCH
(0.2.0→0.2.1), NOT MINOR.** Contrast the 2026-06-28 delete-cascade run (501→200 = a real behavior delta in
owned code → MINOR): here **zero code changed** — the enablement is external platform config flipping a
`null` provider to a live one, plus an additive §9 decision row (D-C8) + §6 env doc. No
owned-interface / `depends_on` / `consumed_by` / `reference_impl` change → blast-radius (dependents
programs/program-memberships/invites; apps web/ios) is FYI, not a gate. **Lesson: distinguish "deferred
CODE became functional" (MINOR) from "deferred CONFIG got supplied, code already shipped" (PATCH) — the
discriminator is whether any owned `reference_impl` code/behavior moved, not whether the user-visible
capability turned on.** **Dependent cross-ref prose:** updated `app-config/SPEC.md` §6 (explicitly a
"cross-reference index, NOT owned here") to reflect notifications' new state → **no bump for app-config**;
only `notifications` bumped (matches the converged "cross-ref prose = no-bump docs" lesson). **Staging
discipline:** the tree started the session clean but mid-run gained a batch of **unrelated in-progress
HealthKit files** (new services + `logService.js` + several iOS views + modified `.entitlements`/
`Info.plist`). Staged ONLY the 7 intended paths by explicit `git add <file>…` — verified `git status`
still showed the HealthKit WIP unstaged (16 dirty entries) before committing. **Never `git add -A` when the
tree holds work you didn't author.** **Platform-secret reality:** the `render` MCP returned `400` on every
call (incl. no-param `list_workspaces`) and `RENDER_API_KEY` was unset → could NOT set the env vars from
this session; the functional half is a manual Render-Dashboard step. Recorded the provisioning in docs +
committed, and flagged the dashboard entry + log-verification as the remaining user action rather than
claiming push was verified live.

---

## Run — apple-health iOS HealthKit auto-sync (2026-06-30)

**Change:** ported an external PR (`vinaySankar2004/RaSi-Fiters#4`, legacy `ios-mobile`) into `apps/ios`,
corrected for our curated `workouts_library`. One commit (`af63e16`), three feature deltas → three tags:
`feature/apple-health@v0.1.0` (new node), `feature/workouts@v0.1.1`, `feature/workout-logs@v0.2.1`.

**Bump calls.** (a) `apple-health` = **new node → v0.1.0** (net-new feature, ports a PR not the legacy backend
— `reference_impl.app` set to `ios-mobile` w/ the PR's Swift paths, since there's no legacy-backend analogue).
(b) `workouts` **0.1.0→0.1.1 PATCH**: the library CONTENTS grew via a new SQL migration (`004`), but **zero
`workouts` code/route/model/contract moved** — additive data seed, existing names untouched → PATCH, not
MINOR (matches the "additive, output shape unchanged" convergence). (c) `workout-logs` **0.2.0→0.2.1 PATCH**:
one backward-compatible error-code refinement in `addWorkoutLog` (generic 500 → friendly 409 on the composite-PK
collision), no route/shape change → PATCH; both `[web, ios]` consumers benefit, dependents read data only → FYI.

**Multi-feature, one commit.** A tightly-coupled changeset (the 409 + the library seed exist *to serve*
apple-health) mapped cleanly to 3 features; committed once and applied all 3 tags to the same commit (the
skill's "one tag per touched feature", all pointing at the new commit). Cleaner than artificially splitting
interdependent work.

**Staging discipline held.** Whole tree was this session's work (25 paths), all related — staged the explicit
list via `git add <file>…` (no `-A`), verified 26 staged, nothing foreign. (Contrast the prior notifications
run, where HealthKit WIP had to be *excluded* — this run IS that work, now complete.)

**Tag-invariant note.** `git tag -l 'feature/*'` = 28 vs 15 registry nodes — expected: features accumulate one
tag PER VERSION over time, so total feature tags ≥ node count. The skill's "count == node count" reads as a
per-feature-latest check / backfill trigger, not a literal total-tag equality once features have version history.

**Verification before commit.** iOS build green via the xcode MCP (0 errors); DB invariant scripted (79 map
targets ⊆ 90 post-migration library names); migration `004` applied to Supabase + on-device manually tested by
the user → committed as a real, verified feature (not a "pending smoke-test" progress commit).

---

## Run — 2026-07-01 — apple-health v0.3.0 → v0.4.0 (first-sync confirmation)
- **Changeset → feature:** 4 edited + 3 new `apps/ios/**` files all map to `apple-health`'s `reference_impl`
  (3 new files added to the node's `paths`); plus the feature SPEC (§3/§3a flow + new §8 **D-CONF**) and the
  `ios/apple-health` page SPEC (§8 state + §9 D-CONF row). One feature, clean map.
- **Bump = MINOR (0.3.0→0.4.0):** pre-1.0 newly-documented behavior (a whole new confirmation flow + owned
  files). Additive `reference_impl` growth, `consumed_by`/`depends_on` unchanged.
- **Blast radius = FYI, no gate:** `apple-health` is a leaf — reverse-scan for `depends_on: apple-health` → none;
  `consumed_by: [ios]` only. New owned files satisfy nothing dangling; no existing contract moved.
- **Two commits:** (1) `feat(apple-health)` = code + both SPECs + registry.json + REGISTRY.md, tagged
  `feature/apple-health@v0.4.0`; (2) `chore(skills)` = the ios-build + git-version `LESSONS_ARCHIVE.md` edits
  (lessons never ride the feature commit). Verified: user live-tested on device + iOS builds clean (0 errors).

## Run — 2026-07-05 — programs 0.2.0 (net-new reorder + search)
- **Shape:** contract change on `programs` (new owned route `PUT /order` + new owned table
  `member_program_order`) → MINOR 0.1.0→0.2.0 + tag `feature/programs@v0.2.0`. Backward-compatible
  additive (GET shape unchanged) → blast-radius FYI only (8 dependents, zero re-versions); both consumer
  apps updated in the same commit. Page specs (web programs, ios program-picker) bumped to v0.2.0 in
  specs/pages/REGISTRY.md — page specs get no feature tags.
- **LESSON:** do NOT round-trip registry.json through python json.dump — it reformats the whole file
  (ascii-escapes the em-dashes, expands inline arrays). Surgical Edit on the feature's node only.

## Run — 2026-07-05 — docs(progress): TestFlight shipped + APNS flip closed
- **Shape:** docs-only (PROGRESS.md) — no feature paths, no bump, no tag, blast radius zero. Commit
  `7e1aeea`.
- **Context:** user announced TestFlight uploaded/approved/in-beta; APNS_PRODUCTION verified already
  `true` via tools/render-env.sh (Render MCP OAuth still stale — REST path used), redeploy triggered to
  guarantee the live process carries it. Live-binary memory updated (out-of-repo, not staged).
- **LESSON (reinforces converged):** state-change verification before doc pruning — the "flip APNS" open
  item was closed only after reading the value AND making the deploy deterministic, not on the user's
  "I think it flipped" alone.

## Run — 2026-07-05 — autocapitalization UX pass (web + iOS, no feature bump)
- **Changeset:** 8 web pages (autoCapitalize/autoCorrect attrs) + 5 iOS files (AppInputField
  autocapitalization param + call sites). Client-only keyboard hints; no backend, no SPEC edits.
- **Mapping outcome:** registry `reference_impl` paths are backend-relative (routes/services/models) — no
  client page file maps to a feature. Grep of specs/ found zero autocapitalize/autocorrect mentions → no
  page-SPEC update owed. Plain `feat` commit, no bump, no tag; LESSONS edits split into `chore(skills)`.

## Run — 2026-07-05 — pbxproj build-number bump (chore, no feature)
- **Changeset:** `project.pbxproj` only (CURRENT_PROJECT_VERSION 45→46 for the second TestFlight upload).
- **Mapping outcome:** pbxproj matches no `reference_impl`/SPEC path → plain `chore(ios)` commit, no
  bump, no tag — same shape as the build-45 bump (046e10c). Blast radius: zero features; app: ios only.

## Run — 2026-07-05 — TestFlight-46 docs close-out (staleness sweep + R12 prune)
- **Changeset:** PROGRESS.md + ICM.md + apps/ios/CONTEXT.md — recorded the second TestFlight push
  (1.3.1 (46) live in beta) and swept ALL top-level docs for staleness via grep ("TestFlight pending",
  "planned/will announce", legacy version strings) rather than trusting the one known-stale line.
- **R12 prune:** deleted the resolved program-picker-reorder open item after confirming the outcome
  lives in the page/feature SPEC changelogs (grep'd 0.2.1 entry + D-N1 before deleting).
- **Mapping outcome:** docs-only → plain `docs(progress)` commit, no bump, no tag.
- **Lesson:** a ship event goes stale in THREE places here (PROGRESS checklist, ICM surface table,
  apps/<surface>/CONTEXT version line) — grep all top-level docs for the old state string, don't
  spot-fix only the line the user pointed at.

## Run — 2026-07-07 — auth 0.6.0 (net-new GET /me; web member-id self-heal)
- **Changeset:** apps/backend/routes/auth.js (+ apps/web auth-provider/api + LogWorkoutsForm) +
  apps/ios StandardMembersTab + specs/features/auth/SPEC.md §11 + registry.json + REGISTRY.md +
  specs/pages/web/members/SPEC.md (F1a) + PROGRESS.md. Bug fix: a web member with an empty
  session.user.id was blocked from logging ("You can only log workouts for yourself.") and saw a blank
  Members tab; root cause was the id never being re-derived after login (no `id` claim in the Supabase
  JWT).
- **Mapping outcome:** the `/me` endpoint lives in `routes/auth.js` (auth's reference_impl) → maps to
  `auth`. The web form guard, iOS tab, and members page SPEC are consumers/pages, NOT separate feature
  reference_impl paths → no extra feature bump. `workout-logs` untouched (its logService check was
  already correct — the client was sending a bad member_id).
- **Bump:** auth 0.5.0 → **0.6.0** MINOR — a new OWNED endpoint that is backward-compatible (existing
  routes/JWT/middleware unchanged). Blast radius FYI only (consumers web+ios; every feature depends_on
  auth but the change is additive, so no dependent re-version — the "backward-compat owned-interface →
  no propagation" lesson).
- **Lesson (registry.json edits):** NEVER rewrite registry.json via `json.load`+`json.dump` — it
  reformats the whole file (unicode-escapes the em-dashes, rewraps arrays) → a 178-line noisy diff.
  `git checkout` it and do a surgical `Edit` on the single `"version"` line inside the target feature's
  block (the first `"version": "0.x.0"` under `"<feature>": {`). One-line diff, every time.
- **Lesson (live-binary safety in the bump note):** when the owned change is a NEW endpoint, state in the
  §changelog that the LIVE iOS binary never calls it (additive/degrades-gracefully) — ties the bump to
  the ios-live-binary-compatibility posture so a reviewer sees the deploy is safe without a new build.

## Run — 2026-07-08 — Android Phase B auth-path commit (plain feat, no feature bump)

**Changeset:** `apps/android/**` (5 new `ui/auth/*.kt` + `core/AppLinks.kt` + `RootScreen.kt` edit + 2 brand
PNGs), `specs/pages/android/**` (4 new thin port-notes), `specs/pages/REGISTRY.md`, `apps/android/CONTEXT.md`,
`PROGRESS.md`, and the `android-build` skill lessons.

**Feature mapping:** NONE. No `specs/features/**` SPEC and no `registry.json` node touched; `apps/android`
paths are not (yet) registered as any feature's `reference_impl.paths`. Client-surface port ⇒ **plain `feat`
commit, no semver bump, no `feature/*` tag** — mirrors the Phase A precedent (`feat(android): Phase A
foundation …`). **Blast-radius = zero feature impact** (FYI, not a gate). Tags invariant unaffected
(`git tag -l "feature/*"` count still equals the registry node count).

**`specs/pages/` ≠ `specs/features/`:** page/screen SPECs + the pages REGISTRY are surface docs, not the
feature contract — editing them never triggers a feature version bump (only `specs/features/<f>/SPEC.md §12`
+ `registry.json` do). Two commits per the split rule: (1) `feat(android)` for code+page-docs, (2)
`chore(skills)` for the `android-build` + `git-version` lesson edits.

## Run — 2026-07-08 — Android auth UI-polish follow-up (plain feat, no bump)

**Changeset:** `apps/android` auth UI refinement (shared `AuthComponents` field/dropdown kit + 3 screens),
`build.gradle.kts`+`CONTEXT.md` (debug→live backend default), the 3 changed page port-notes + pages
REGISTRY version cells, and the `android-build` SKILL note.

**Mapping:** still NO `specs/features/**` / `registry.json` node → **plain `feat(android)` + `chore(skills)`,
no semver bump, no `feature/*` tag** (page-SPEC + client-surface edits only). Bumped the *page* SPEC versions
(login 0.1.1, forgot 0.1.1, create-account 0.2.0) in the pages REGISTRY — those are surface-doc labels, NOT
the feature-registry `version` field, so no blast-radius/tag implications.

**Prototype-then-revert leaves no trace to commit:** added Haze (Liquid Glass) then removed it same session
— libs.versions.toml/build.gradle net to zero for the dep, so `git status` shows only the real deltas. Don't
hunt for the reverted dependency in the commit.

## Run — 2026-07-09 — steps tracking + multi-program logging (6-feature bump, multiplex close)
Six features bumped in one multiplex feature: daily-health-logs 0.1→0.2, workout-logs 0.4→0.5,
analytics 0.1.1→0.2, member-analytics 0.1→0.2, apple-health 0.6→0.7, health-connect 0.1→0.2. All MINOR
(additive schema/endpoints/fields + user-approved behavior changes recorded as D-rules; no breaking
contract change → blast-radius FYI, not a gate).
- **Version labels were written by the specs implementer BEFORE this git-version run** (registry.json +
  REGISTRY.md + SPEC §11 changelog all pre-updated in the octopus merge). So git-version's job collapsed to
  VERIFY registry↔REGISTRY↔SPEC agree + emit blast-radius + create the 6 tags. When a multiplex specs-agent
  owns the doc bumps, don't re-edit — just reconcile and tag.
- **Changelog lives in §11 here, not §12** (SPEC section numbering varies per feature; the skill says §12 but
  these SPECs put Changelog at §11) and is a **Markdown table** (`| Version | Date | Change |`), not the
  `- **vX.Y.Z**` list the skill prose assumes. Grep the version string, don't assume the list format.
- **Tags-invariant is NOT literally count==nodes here:** 45 feature tags vs 16 registry nodes — historical
  per-version tags accumulate (apple-health alone has v0.1..v0.7). The invariant in practice = "every
  feature's CURRENT registry version has a matching tag," not a 1:1 total.
- **Everything was already committed** across 3 commits (backend 2aa9a47, octopus merge a3cd5d0, iOS fix
  0db3a81) before tagging, so tags anchored at HEAD (the final merged state), not a fresh commit.

## Run — 2026-07-09 — View Health row refactor (cosmetic UI, page-version bump, no feature bump)
- **Task:** refactor the View Health list row (date + `Sleep — · Diet — · Steps N`) into a header
  (dot + date) over three labeled Sleep/Diet/Steps metric cells, 1:1 across web/ios/android. User asked
  directly ("we don't need multiplex, we just do it") + live-tested before commit.
- **Detection outcome = NO feature bump.** Staged paths were all `apps/{web,ios,android}/**` client
  screens + `specs/pages/**`. `daily-health-logs`'s `reference_impl` is **backend-only**
  (routes/services/models), and no `specs/features/**` file was touched → per the "cosmetic apps/**
  refinement is not a feature delta" rule, no feature semver bump, no `feature/*` tag. This is the
  clean case where a real, shipped UI change maps to ZERO feature nodes.
- **Pages ARE versioned but NOT git-tagged.** `git tag -l "page/*"` is empty; pages carry a version cell
  in `specs/pages/REGISTRY.md` + a §Changelog per page SPEC. Faithful record = PATCH bump (v0.2.0→v0.2.1)
  on the 3 member-health pages (ios/android member-health-detail + web members/health): registry cells +
  each page-spec §Changelog row. No tag step for pages.
- **Shared-component guard:** Android health list was on the shared `LogRow` (also used by View Workouts).
  Built a dedicated `HealthLogRow`/`HealthMetricCell` rather than editing `LogRow`, so nothing else
  restyled — mirrors the "net-new UI must not restyle other pages" rule.
- **Scope discipline on stage:** two unrelated `SummaryCards.{kt,swift}` edits (not mine) showed modified
  at commit time; explicit `git add <7 files>` (no `-A`) left them out. The session-scoped-stage default
  did its job.
- **Convention divergence handled in-doc:** DC-10 (two-line row) is shared with the compact
  `MemberHealthCard` preview, which KEPT the two-line form. Noted the divergence in all 3 page SPECs so the
  convention stays legible instead of silently forking.

## Run — 2026-07-09 · create-account brand-mark nudge (Android-only cosmetic)
Single 48dp `Spacer` added to `CreateAccountScreen.kt` + its **page** SPEC (`specs/pages/android/...`).
Staged exactly the 2 session files (explicit `git add`, no `-A`) — left the unrelated pre-existing
`member-health-detail` changes (3 surfaces) untouched in the working tree, as the user asked.
**No feature bump / no tag:** the `auth` feature's `reference_impl` is backend-only, and this is a purely
cosmetic `apps/**` refinement with no `specs/features/**` or registered-path delta → reinforces the existing
"cosmetic apps/** = no feature delta" converged lesson. Committed as a plain `fix(android):`; page SPEC
carries its own §Changelog (v0.2.1). Blast-radius: zero feature impact. Nothing new promoted.

## Run — 2026-07-09 · brand mark always-light in dark mode (ios+android+web cosmetic)
Three session files across all three clients — iOS `BrandIcon.imageset/Contents.json` (drop dark
appearance), Android `AuthComponents.kt` `BrandMark` (drop `isSystemInDarkTheme` swap + unused import),
web `layout.tsx` icon/apple metadata (drop `app-icon-dark.png` dark-mode entry). Explicit `git add` of the
3 files (no `-A`); working tree held only these. **No feature bump / no tag:** none of the paths match a
registered `reference_impl` (the `auth` node is backend-only), and no `specs/features/**` SPEC was touched
→ the "cosmetic apps/** = no feature delta" rule again, now spanning 3 surfaces in one commit. Deliberate
divergence from the ported theme-aware brand mark (called out in the commit body). Committed as a plain
`fix(ios,android,web):`, pushed to main. Blast-radius: zero feature impact. Nothing new promoted — this is
the established multi-surface cosmetic case.

## Run — 2026-07-09 · loggable-only selector (3 clients) + iOS quick-add widgets → batch form
17 session files: 7 client code (web `LogWorkoutsForm.tsx`, android `LogWorkoutScreen.kt`, iOS
`LogFormComponents.swift` + 2 widget views + `WidgetQuickAddComponents.swift` + a `ProgramContext.swift`
comment) + 10 SPECs (2 feature, 6 page, registry.json, REGISTRY.md). Explicit `git add` of all 17 (repo
clean at session start; no `-A`). **PATCH bump BOTH `workout-logs` 0.5.0→0.5.1 + `daily-health-logs`
0.2.0→0.2.1 — the nuance vs the recent cosmetic runs:** the change is client `apps/**` (NOT the backend
`reference_impl`), which alone = "no feature delta", BUT it also **materially edited each feature SPEC's
consumer topology** (D-REF + F4: the iOS quick-add widget now posts to `/batch`, not single `POST /`) plus
a §11 changelog note → that `specs/features/**` edit IS the bump driver (a note about the feature's own
consumer behavior = PATCH). So: cosmetic apps/** with no SPEC touch = no bump (prior runs); apps/** that
forces a feature-SPEC consumer-topology correction = PATCH. No contract change (`consumed_by`/routes/
responses all unchanged) → blast-radius FYI, not a gate. Adversary-reviewed before commit (4 advisories
fixed). Page SPECs carry their own bumps (widget-quick-add-* 0.2.0, log-* ios 0.3.1/0.2.1 + android 0.2.1).
Two tags: `feature/workout-logs@v0.5.1` + `feature/daily-health-logs@v0.2.1`. Promoted nothing new — the
"note about the feature's OWN behavior = PATCH" lesson already exists; this run is a clean instance of it
where the behavior lives in a client, not the backend reference_impl.

### 2026-07-10 — Run: `auth` v0.8.0→**v0.9.0** MINOR (account-settings link/unlink + add-password, D-C10)
Closing run of the first full `multiplex` pipeline. Touched 14 code files (backend 2 + web 3 + ios 4 +
android 5) + 3 registry/spec files; the backend 2 were committed+deployed SEPARATELY FIRST (`e49880a`, the
shared-prereq commit — a plain `feat(auth)` with NO version bump, deployed to Render before the clients),
then git-version ran over the client+SPEC set at close (`1def2b4`). **Detect/bump call:** feature = `auth`
(SPEC edit + `apps/**` under no reference_impl — the SPEC edit is the bump driver). **MINOR** (0.8.0→0.9.0):
four NET-NEW authenticated routes = the feature's owned interface genuinely EXPANDED, but purely ADDITIVE
(no existing route/shape/JWT/middleware changed). **Blast-radius: FYI, not a gate** — `auth`'s dependents
(≈10 features) + apps [web,ios,android] all consume the middleware/existing routes, not the new ones → **zero
dependent re-version** (the "additive owned-interface change → MINOR, no propagation" convergent lesson, same
shape as 0.6.0 `/me` + 0.7.0 `/oauth`). Staged the 15 files explicitly (no `-A`; repo clean at start). One
tag `feature/auth@v0.9.0` → `git tag -l "feature/*"` count still equals the registry node count. **Non-obvious
bit:** authored the SPEC's semantic content (D-C10 decision, §3 routes 15–18, the §1/D-C3 `[web,ios]`→
`[web,ios,android]` doc-lag fix, F11 disposition) BY HAND before invoking git-version, and let git-version own
only the version-string + §12 changelog row + registry/REGISTRY bump + tag — cleaner than making git-version
infer a rich decision entry. Also had to swap the §12 changelog row order (0.9.0 must sit ABOVE 0.8.0 —
newest-first — after inserting on the wrong anchor). Promoted nothing new.

---

**2026-07-11 — landing SEO indexing infra → PATCH page-spec bump (v0.1.1→v0.1.2), no feature tag.** Changeset =
`apps/web/src/app/{robots.ts,sitemap.ts}` (net-new) + `layout.tsx` (JSON-LD) — additive Next metadata routes,
zero visible/behavior change. Mapped NOT to any `registry.json` feature (nothing owns `layout.tsx`/`src/app`)
but to the **landing PAGE spec** (`specs/pages/web/landing/SPEC.md`). **Convergent lesson (new): page-spec
changes version independently of the feature graph** — bump the SPEC header + §Changelog + add a D-rule (D-LAND-10),
bump the `specs/pages/REGISTRY.md` row, and **do NOT cut a `feature/<f>@v` tag** (page specs aren't in the
registry node/tag invariant; `git tag -l "*land*"` is empty by design). PATCH because additive metadata on a
net-new page with no contract/behavior delta (same shape as a faithful asset refinement). **Also caught a
pre-existing doc-lag:** the pages REGISTRY still showed landing `v0.1.0` though the SPEC was already `0.1.1`
(the D-LAND-9 run bumped the SPEC but not the REGISTRY row) — reconciled to `v0.1.2` this pass. Verified 1:1 is
N/A (NET-NEW page, no legacy reference). Staged the 5 files explicitly (no `-A`). Promoted the page-spec-bump
rule note here; nothing for the lean SKILL yet (single occurrence).

---

## Run — iOS tap-target fix (InviteMemberView Send Invitation), 2026-07-11
- **Changeset:** `InviteMemberView.swift` (impl bug-fix) + `specs/pages/ios/program-member-management/SPEC.md`
  (D-C3 decision row + 0.1.1 page-changelog entry). Session also touched two LESSONS_ARCHIVE.md (ios-build,
  git-version).
- **No feature bump.** The touched iOS file is NOT in any feature's registered `reference_impl.paths` (the
  `invites`/`members` reference_impl are backend `routes/…js` only), and no `specs/features/**` SPEC changed.
  Per converged lessons, a cosmetic/impl-only fix with no feature-SPEC or registered-path delta → **no semver
  bump, no feature tag, no registry.json edit**. Versioning happened on the **page** spec (0.1.0→0.1.1), which
  is independent of feature tags.
- **Staging discipline held.** `git status` showed unrelated in-flight files from another session
  (`CreateAccountView.swift` + `specs/pages/ios/create-account/SPEC.md`, ~257 lines) — deliberately LEFT
  UNSTAGED; flagged to the user. Staged only this session's 2 product/doc files, lessons in a separate
  `chore(skills)` commit.
- **Commit shape:** `fix(program-member-management): …` for the code+page-spec; `chore(skills): …` for the two
  lessons archives. iOS-only change → no Vercel/Render deploy; TestFlight is the user's path.
