# git-version — LESSONS ARCHIVE (verbose run-by-run history)

> Full run history, moved out of `SKILL.md` to keep it lean (not auto-loaded into context).
> Durable, project-agnostic patterns are distilled in `SKILL.md` → "Converged lessons".
> **Protocol:** append one entry per skill run below; when a pattern proves itself across runs,
> promote it into `SKILL.md` "Converged lessons" and keep this archive as the detailed history.

## Lessons log (append every run — the self-learning loop)
Before ending a run, capture what you learned: a detect/bump call that was non-obvious, a
blast-radius reverse-scan subtlety, a dangling-edge case, anything awkward in staging/tagging.

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
