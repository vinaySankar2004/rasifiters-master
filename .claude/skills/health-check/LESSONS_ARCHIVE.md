# health-check — Lessons Archive

Full run-by-run history for the `health-check` skill (not auto-loaded; see `SKILL.md` for the
distilled "Converged lessons"). Append one entry per run.

## Entry template
- **Run N (YYYY-MM-DD) — scope:** <whole-repo | product>.
  - Counts: 🔴 <n> · 🟡 <n> · 🔵 <n>.
  - Proposed → accepted: <summary>.
  - False positives to suppress next run: <…>.
  - New durable pattern promoted to Converged lessons: <… or none>.

## Runs

- **Run 1 (2026-06-30) — scope:** whole-repo. Ran as the acceptance gate of the legacy-detachment +
  doc-slim + repo-move cleanup pass (not a standalone session).
  - Counts: 🔴 4 · 🟡 0 · 🔵 0. (Healthy — only objective drift, no restructuring.)
  - Proposed → accepted (all fixed inline): (1) `auth` `reference_impl` listed `models/RefreshToken.js`,
    retired at R1 → removed from registry. (2) `ios-build` missing from the skill enumerations in `ICM.md`
    (×2) + the `METHODOLOGY.md` concern-map → added. (3+4) two ios page SPECs linked
    `../../../features/memberships/SPEC.md` (wrong slug) → fixed to `program-memberships`.
  - Also verified clean: registry↔REGISTRY↔git-tag version sync (28 tags), dependency-graph closure,
    reference_impl paths resolve under `apps/`, decisions-log range header (R1→R7) matches last entry.
  - False positives to suppress next run: none. The updated "reference_impl vs Provenance" converged
    lesson held — SPEC `Provenance` prose (archived-original breadcrumbs) was correctly NOT flagged.
  - New durable pattern promoted to Converged lessons: the registry `json.dumps` round-trip correction
    (compact inline arrays) + the reference_impl/Provenance detachment note (added during 4a).

- **Run 2 (2026-07-01) — scope:** whole-repo. Standalone session, run as the pre-TestFlight + pre-public-GitHub
  cleanup pass. 3 Explore agents (top-level/registry · iOS doc↔code · public-repo secrets) + direct re-read.
  - Counts: 🔴 4 · 🟡 1 · 🔵 0. (Healthy — narrative drift + one redundancy, no restructuring.)
  - Proposed → accepted (all applied): (1) `ICM.md` "`ios` not yet built (next surface)" → all-three-surfaces-built
    (iOS code-complete runs 50→74; the L1 map froze at the 2026-06-29 scaffold). (2) `apps/ios/CONTEXT.md` §Status
    frozen at run 51 ("Auth screens ported… build-green pending… Next: port ProgramPickerView") → code-complete.
    (3+4) two SPEC line-3 `Version:` headers lagged the §11 changelog+registry+tag — `workouts` 0.1.0→0.1.1,
    `apple-health` 0.3.0→0.5.0 (+ reordered apple-health's out-of-order changelog rows). (5, 🟡) per-app infra IDs
    (Vercel prj/team, Render srv) restated in root `CONTEXT.md` → replaced with pointers to `apps/<app>/CONTEXT.md`
    (canonical per the SoT table); Supabase project ref left in root (genuinely project-level). Plus user-directed
    public-repo prep: no tracked secrets (verified); contact emails kept as-is (user's call); cosmetic identifier
    anonymization (SETUP clone-URL owner → placeholder); PROGRESS/COVERAGE freshened.
  - False positive to suppress next run: **the SPEC line-3 `Version:` header lagging is NOT a registry↔tag sync
    break** — the §11 changelog top + `registry.json` + git tag were all correctly in sync (0.1.1 / 0.5.0); only
    the prose header field lagged. Verify the changelog top before flagging, and report it as a one-token
    header-field fix, not a version-sync failure. (Promoted to Converged lessons.)
  - New durable pattern promoted to Converged lessons: the header-field-vs-changelog distinction above; and that
    a fast build sprint (runs 50→74 over ~2 days) predictably freezes the L1 map (`ICM.md`) + the lowest-churn
    CONTEXT §Status while the append-only logs (SPEC changelogs, registry, tags) stay correct — check the
    orientation docs first after any sprint.
- **Run 3 (2026-07-09) — scope:** whole-repo, **Android-parity focus** (run as the pre-flight before building the
  `multiplex` agent pipeline, which reads `consumed_by` + the skill index). 3 Explore agents (Android feature-coverage
  from code · doc cross-refs/skill-index/surface prose · registry↔SPEC↔tag sync + schema ownership) + direct re-read.
  - Counts: 🔴 6 clusters · 🟡 0 · 🔵 0 (+1 info). Healthy structure; drift concentrated exactly where the Run-2
    lesson predicts after adding a whole surface (the 4th, `android`) — orientation prose + the cross-surface graph.
  - Proposed → accepted (all applied): (D1) `registry.json` `consumed_by` was badly stale — Android's
    `net/ApiService.kt` demonstrably calls 12 features but the graph listed android for only 2; added `"android"` to
    10 features (auth, members, programs, program-memberships, program-workouts, workout-logs, daily-health-logs,
    analytics, analytics-v2, member-analytics). (D2) 4 SPEC §11 changelogs weren't newest-first so registry==§11-top
    failed while registry==tag held (programs/program-memberships/workouts/analytics) — relocated the current-version
    row to the top. (D3) the 8th living skill `android-build` was documented nowhere — added to ICM.md, METHODOLOGY
    concern-map, CLAUDE.md, README.md. (D4/D5) "three surfaces / web,ios,backend" prose persisted across ~7 docs +
    ICM.md's own android row said "in build (Phase A)" while it's code-complete — fixed live prose + path braces
    (`{web,ios,backend}`→`{web,ios,android,backend}`), left the dated R6 (2026-06-28) log entry as history. (D6)
    `specs/pages/REGISTRY.md` indexed 12 of 30 android screens — added the 18 missing rows + refreshed the trailer.
  - Info (below the bar, left as-is unless user opts in): `auth` SPEC.md:160 double-claims `members`/`member_emails`
    as "Owned/required" (really a column-split with the `members` SPEC). Also surfaced a **secondary drift for later**:
    the `lifestyle-workout-types` android page-SPEC prose says it consumes `workouts`, but code + registry show
    `program-workouts` (custom CRUD) — the REGISTRY row uses code truth; the page-SPEC body wording is a follow-up.
  - New durable pattern (candidate for Converged lessons): **adding a whole new surface is its own drift class** —
    the mechanical records (tags, reference_impl paths, per-app CONTEXT.md) stay correct, but the cross-surface graph
    (`consumed_by`), the surface-count prose, the path braces `{web,ios,...}`, and the skill index all lag together.
    After a new surface lands, sweep those four specifically. **Correct `consumed_by` from CODE (the client's API
    layer — `ApiService.kt`/`APIClient`/web api calls), not from the SPEC's `consumed_by` array**, which predates the
    port.
- **Run 4 (2026-07-10) — scope:** whole-repo, run inline as the closing due-diligence pass after shipping `auth`
  v0.9.0 (account-settings link/unlink). **Counts: 4 🔴-minor (SPEC line-3 header lags), 0 🟡, 0 🔵 → healthy.**
  Core sync invariant PERFECT for all 16 features (`registry.version == §12 top == git tag`, incl. the just-shipped
  `auth@v0.9.0`); all `reference_impl.paths` exist; 0 dangling `depends_on`; 16 features == 16 distinct feature tags;
  surface-count prose (`{web,ios,android,backend}`) all correct. The ONLY drift was the **recurring line-3 `Version:`
  header-prose class** (already a Converged lesson): `workout-logs` 0.5.0→0.5.1, `daily-health-logs` 0.2.0→0.2.1,
  `analytics` 0.2.0→0.3.2, `member-analytics` 0.2.0→0.3.1 — all PRE-EXISTING (last SPEC commits from prior sessions
  93c9446/45ad9f6/198c84b), header trailing while registry+§12+tag stayed synced; the status token (`🏗️ built`) was
  correct, only the version number lagged. Fixed all 4 (one-token each) + committed, since the user asked to clean
  stale docs. Nothing from the auth v0.9.0 session was drifted — the git-version close was clean. Left as-is (below
  the bar): REGISTRY.md narrative "Backend feature coverage complete (14 features)" — historical prose, not clearly
  wrong (backend-only count vs 16 total incl. android-only `health-connect`). Promoted nothing new — clean recurrence
  of the header-lag class.
- **Run 5 (2026-07-10) — scope:** whole-repo, run standalone then user opted to apply + commit. **Counts: 6 🔴
  (grouped) · 2 🟡 · 0 🔵 → healthy core, stale current-state prose.** Mechanical records PERFECT again (registry ==
  highest tag == §12 changelog top == line-3 `Version:` header for all 16 features — the Run 4 header-lag class did
  NOT recur; reference_impl paths all resolve; 0 dangling `depends_on`). **This run's dominant class = the two store
  pushes** (iOS 1.3.1 (50) TestFlight + Android 1.0.0 (3) Play *closed* testing, both 2026-07-10, recorded correctly
  in the append-only `RELEASES.md` + git `chore(releases)` commits) froze the human-written current-state prose:
  (🔴 D1) `specs/pages/REGISTRY.md` iOS section had only 13 rows for 32 on-disk SPEC dirs — **19 built screens
  un-indexed** while the "Inventory to document" note still listed them as pending (contrast the android section:
  clean 32==32 with an "Inventory: COMPLETE" trailer — iOS simply lagged during the runs 50→74 burst). Added the 19
  rows + rewrote the trailer to COMPLETE. (🔴 D2) web section missing 2 rows (`privacy-policy`/`support`, also stuck
  in the to-do note). (🔴 D3/D4/D5/D6) ICM "The apps" + PROGRESS "Next action"/"Coverage" + apps/{ios,android}
  CONTEXT all carried stale channel status ("awaiting AAB → Play *internal* testing", "1.3.1 (46)"), stale page
  counts (iOS 31/android 29-30 vs actual 32/32), and a "not-yet-on-store" tail that both pushes had already
  resolved. **Fix pattern applied for the 🟡s:** replaced restated hard counts with a pointer to
  `specs/pages/REGISTRY.md` and restated channel/binary status with a pointer to `RELEASES.md` (their SoT homes per
  the METHODOLOGY table) rather than re-syncing copies that will only drift again. Left the dated R6 (2026-06-28
  "three surfaces / {web,ios,backend}") + all struck 2026-07-05 ship-log entries as history per the append-only rule.
  **New durable pattern (candidate for Converged lessons): a store push is its own drift class** — `RELEASES.md` +
  git `chore(releases)` stay correct, but the orientation prose that *restates* channel/binary/version (ICM "The
  apps", PROGRESS "Next action") and any "not-yet-on-store" tail all freeze. After a push, sweep those and prefer a
  pointer to `RELEASES.md` over a restated build number. Same shape as Run 3's "new surface" class, applied to
  release channels.
- **Run 6 (2026-07-18) — scope:** whole-repo, standalone; user approved the full plan, all fixes applied + committed.
  **Counts: 10 🔴 · 4 🟡 · 1 🔵 → healthy core, week-of-releases prose drift.** Mechanical version sync PERFECT again
  (all 16 quadruples registry == §11 top == tag == REGISTRY cell; line-3 headers all current — the Run-4 class did
  not recur; reference_impl paths all resolve; schema ownership unique; skill/agent indexes exact). The dominant
  classes were the two known ones. **Run-5 store-push class recurred across the 1.4.x burst** (ICM android "(3)" vs
  live (4); PROGRESS "Next action" frozen at 2026-07-10 incl. a flat-wrong "0 opted in" vs 12/12; apps/{ios,android}
  CONTEXT restated 1.3.1 (46)/versionCode 3) — all pointerized to `RELEASES.md`. **Run-5's page-index sub-class also
  recurred, web this time:** `specs/pages/REGISTRY.md` web table had 20 rows vs 37 on-disk SPEC dirs (17 sub-routes
  of summary/members/lifestyle/program never indexed) under a false "Inventory: COMPLETE" trailer — mirror of Run 5's
  iOS 13/32. Back-filled all 17 rows from SPEC headers. **New finds:** (🔴) apps/backend/CONTEXT.md §Status frozen at
  the 2026-06-28 auth-only seed ("only /api/auth mounted", "DELETE /account 501") contradicting its own §Endpoints —
  verified the 501 is closed in code (`authService.deleteAccount` → `cascadeMemberDeletion`) before rewriting; (🔴)
  one malformed tag `feature/notifications@0.3.1` missing the `v` prefix (value in sync everywhere; recreated as
  `@v0.3.1` + deleted old, local+remote); (🔴) 4 features (`members`/`programs`/`program-memberships`/
  `program-workouts`) had REGISTRY.md Apps cells + SPEC headers lagging registry.json's `[web,ios,android]` (Run-3
  class; also fixed the Apps legend line that only offered `web ios`; ground-truthed that `invites` android absence
  is CORRECT — no invite calls in the Android API layer); (🟡→fixed) METHODOLOGY live contract prose "all three
  rooms" + ENV_RUNBOOK scope line omitted android; (🟡→fixed) auth SPEC §5 "Owned/required" soft-co-claimed
  `members`/`member_emails` — retagged "required, owned by `members`". **The one 🔵 (passed all 4 gates):** the
  METHODOLOGY SoT table had NO row for release/channel state despite RELEASES.md declaring itself that SoT — the
  structural root of the recurring store-push class; added the row. False positives to suppress: none new; noted the
  "Distilled from N runs" converged lesson is now moot (no skill carries such a header anymore) and `git-version`'s
  archive uses date-based run headings, so the anchored `Run [0-9]+` grep doesn't apply to it.

- **Run 7 (2026-08-15) — scope:** whole-repo. Standalone session, triggered by the user announcing the
  **Android production launch** ("we out there now") with a Play Console dashboard screenshot. Run inline
  (no Explore fan-out — the session's harness disallowed subagents), verifying every finding by direct read.
  - Counts: 🔴 9 · 🟡 3 · 🔵 0. (Healthy — no restructuring cleared the bar.)
  - **Mechanically clean before starting:** registry↔SPEC↔tag sync across all 16 features, all 16 SPEC
    changelog tops, all `reference_impl` paths resolve, dependency-graph closure, page-SPEC counts
    (web 37 · iOS 32 · Android 32) exactly matching `specs/pages/REGISTRY.md` rows. The Run-5 page-index-lag
    class did NOT recur — that sweep held.
  - Proposed → accepted (all applied; user pre-approved the 3 judgment calls via AskUserQuestion):
    (🔴 store-push class, the production tail) `RELEASES.md` Android production row still said "submitted —
    in review" → flipped to LIVE (2026-08-06, 100% rollout) + 2 new log rows; `ICM.md` ×2, `PROGRESS.md`
    (Current phase, Next action, build-sequence step 8, two historical "→ Play Console internal testing"
    next-steps), `apps/android/CONTEXT.md` (Deploy + a new 🚀 Status line) all still said "live on Play
    closed testing". (🔴) `COVERAGE.md` intro still read "Fresh scaffold — nothing documented yet" while
    every row was ticked. (🔴) **Every doc said "SPEC §12 Changelog" but all 16 feature SPECs and all page
    SPECs use `## 11. Changelog`** — 13 refs across METHODOLOGY + 3 skills incl. `git-version`'s frontmatter
    description; repointed to §11. (🔴) **`ICM.md` "Open follow-ups" never existed** — 5 refs (METHODOLOGY
    SoT table, git-version, health-check ×3) + CLAUDE.md pointed at a phantom section; real home is
    `PROGRESS.md` "Open items (carry until resolved)". (🔴) `question-asker/SKILL.md` still said "ONE app
    with **three** surfaces" and omitted android from its path list (Run-3 class, this skill was missed);
    this skill's own Scope + description also omitted android. (🔴) 15/16 features stuck at 🏗️ "built"
    though all are public → flipped to 🚀 in registry.json + REGISTRY.md + 15 SPEC headers. (🔴) two
    PROGRESS open items resolved long ago ("Make the GitHub repo public" — verified PUBLIC via
    `gh repo view`; the member-identity self-heal iOS tail) → struck + DONE; the two older struck-DONE
    entries deleted per log hygiene after confirming their outcomes live in `RELEASES.md` / `ENV_RUNBOOK.md`.
    (🟡) `COVERAGE.md` restated 15 feature versions that lagged registry (auth v0.4.0 vs 0.9.0) → stripped,
    canonical homes named in a new banner. (🟡) `apps/web/CONTEXT.md` restated "36/36 pages" (actual 37) and
    `apps/backend/CONTEXT.md` "14 features" → both replaced with pointers.
  - Code change (user-approved, not a doc fix): `apps/android/app/build.gradle.kts` versionCode 4 → 5 —
    the live production build consumed 4, so Play rejects any re-upload at it.
  - False positives correctly suppressed: `METHODOLOGY.md:204` "three surfaces / `apps/{web,ios,backend}`"
    is inside the **dated R6 decision-log entry** — history, left alone (the converged lesson held);
    `(built)`/`(deployed 🚀)` labels inside dated SPEC changelog rows are history, not status drift.
  - New durable patterns promoted to Converged lessons: (1) the store-push class has a **production/GA
    tail** with its own version-consumption follow-through; (2) **status fields never self-advance** —
    sweep 🏗️→🚀 at each shipping milestone; (3) **a cross-reference every doc restates is never
    self-correcting** — grep the referenced section/heading against the artifacts themselves, don't trust
    that 6 prior runs read past it.
