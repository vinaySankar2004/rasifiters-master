# PLAN VERDICT: OBJECTIONS (4)

All four objections are advisory. None blocks implementation.

1. **[ADVISORY] Change #7 (hide members of every membership status) relies on a leak that doesn't exist, and it departs from binding S1-1 without reason.**
   - Evidence:
     - S1-1 says "the program's **active** members whose `hide_activity = true`".
     - The plan's reason is that a member who left could still be read through `/workouts/types?memberId=`. That's false. All 5 services filter the logs with `activeMembershipInclude(programId)`, which is `required: true` with `status: "active"`:
       - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/queryHelpers.js:3-11`
       - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/analyticsService.js:439` (v1)
       - the same file, `:509, :523, :540, :552` (v2)
     - The other outputs are active-only too:
       - history, streaks and recent return 404 for a target that isn't active (`memberAnalyticsService.js:16-19`);
       - metrics only builds rows for active members (`:89-91`);
       - `top_performers` uses `incl`;
       - People reads active memberships only.
   - Effect: the code change protects nothing and does no harm. But the docs would record a protection that doesn't exist (people D-C2, program-memberships D-C6, people §4.1, "What changed #7"), and the user is asked to approve a widening for a reason that's false.
   - Fix: use `where: { program_id: programId, status: "active" }` as S1-1 says, and drop #7 and the "any membership status" wording from D-C2, D-C6 and §4.1. Alternatively, keep the code but remove the false justification everywhere it appears.

2. **[ADVISORY] Version numbers and D-rule IDs collide with the wave C polish amendments, which were committed after the NP amendments (`f6a4b91`).**
   - Evidence:
     - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/initiatives/reliability-overhaul/plans/phase-4-polish-amendments.md:85` already assigns "**program-memberships D-C6:** PA2". Its §5 bumps:
       - program-memberships 0.4.0
       - member-analytics 0.7.0
       - members 0.4.1
       - analytics 0.5.1
       - analytics-v2 0.2.2
     - `phase-4-polish-web/plan.md:9` predicts program-memberships 0.3.0→0.3.1 with "New D-C6". `phase-4-polish-ios/plan.md:13` predicts program-memberships 0.4.0.
   - Failure scenario: S1 lands first (NP §5 order) and creates `feature/program-memberships@v0.4.0` and `feature/member-analytics@v0.7.0` plus a D-C6 row. When wave C lands, it tries to create the same tags and a second D-C6. That breaks git-version's tags invariant and the "assigned once" ID rule.
   - Fix: extend step 28(e). The orchestrator also amends the polish amendments so wave C takes:
     - program-memberships D-C7, at a version after 0.4.0;
     - member-analytics after 0.7.0. Web B already claims 0.8.0, so wave C takes 0.8.x or later.
     - members after 0.5.0, analytics after 0.6.0, analytics-v2 after 0.3.0.

3. **[ADVISORY] Reverting N-SRV takes the whole API down, and the plan says nothing about rollback order.**
   - Evidence:
     - `server.js` → `routes/people.js` → `services/kudosService.js` requires these at load time:
       - `./notificationPreferenceService`
       - `../utils/localTime`
       - `../utils/notificationTemplates`
     - `services/peopleService.js` requires `kudosService`.
     - The Risks section only says "N-SRV first".
   - Failure scenario: S1 is live and N-SRV is reverted (amendments §4 already plans for that case on web, verdict #2). The boot fails with `MODULE_NOT_FOUND`, so every API route goes down, and live iOS and Android lose the backend.
   - Fix: add to Risks and to people SPEC §8: "If N-SRV is reverted, revert S1 first, or in the same revert. The 012 column and table stay (harmless)."

4. **[ADVISORY] The matrix never runs the new hide_activity 403 branch.**
   - Evidence:
     - `check("someone else's flag → 403", r.status === 403, r)` runs S (`ava.rivera`) against H. S isn't a global admin; the testbed has no global admins (`tools/testbed/seed.mjs`).
     - So the existing `"You can only update your own profile."` 403 (`memberService.js:131-134`) answers first.
   - Failure scenario: the step-11(c) guard ("never a global admin for someone else", members D-C4 / people D-C3) could be missing or wrong and the matrix would still print ALL PASS.
   - Fix (either):
     - assert `r.data.error === "You can only update your own profile."` and state that the global-admin branch is unverified on staging;
     - or add a step-25(b) stub check of the guard's condition.

**What I checked (nothing else found):**
- **Names:** these exist exactly in the shipped S0 code:
  - `loadViewer/hasProgramAccess/canView/redactHealth/redactMetricsRow/requireMemberView` (`memberVisibility.js:94`; arity 2/3/2);
  - `assertMemberAccess` (:12-23), `redactMetricsRow` (:223), `let result` (:225) and the exports (:429-434);
  - `routes/analytics.js:5, :30-34, :42-45`;
  - `analyticsService.js:118, :253`;
  - `memberService.js:26-27, :52, :120-149`;
  - `Member.js:54`.
- **N-SRV C8 names:** `getTimeZones` (notificationPreferenceService export), `localParts`/`dayLabel`, `getContentProvider().render`, and `createNotification({…transaction})` with `afterCommit` and a `null` return. G0 and boot-check line 20 are right: I computed `sha256(seed) % 3 = 2` → the "You got kudos, Liam!" variant, and Sydney gives 2026-10-14.
- **Boot check 25(b):** all 20 lines verified by hand. Express Layer names come out `<anonymous>` for the returned arrows. The canView and guard results match.
- **S0 callers re-checked:**
  - `membershipService.js:128,154` (roster);
  - `logService.js:742-746` (health; an upper-case self id now passes — backward-compatible);
  - `memberService.js:21,38`.
- **Every route honours canView(…, "workouts"):** all of the plan's route checklist (#1–#13).
- **Counts and file sets:**
  - The GET inventory is 33 today, plus 4 from N-SRV and 2 from S1, so 39.
  - Coverage guard (d) gives 8 files today, plus `memberActivityStats.js` and `peopleService.js`, so 10.
  - Guard (e) `hide_activity` grep gives exactly 3 files.
- **Other per-person outputs:** none found. I grepped:
  - every `Member` read and `res.json(member)`;
  - `top_performers` across web, iOS and Android (decoded only, never rendered).
- **Live binaries:**
  - plain-member clients send only their own id (web `members/page.tsx:49,142`, staff-gated history/streaks; iOS `APIClient+Members.swift:242`);
  - metrics rows are omitted, never zeroed;
  - the `GET`/`PUT /members/:id` changes only add keys;
  - kudos never reach `/unacknowledged` (D-C20);
  - DELETE returns no count, and the client plans already match §E.
- **Migration 012:** follows the 009/010 RLS and grant pattern. The verify values (5 indexes, 6 constraints) are correct. The cascades `notification_recipients` (`001:235`) and `push_deliveries` (`010:63`) are confirmed.
- **Anchors:** the `server.js` and `sql/README.md:87` anchors hold after N-SRV step 29. The CONTEXT.md and SPEC text anchors (members, member-analytics, analytics, analytics-v2, program-memberships) all exist.
- **Registry and dependencies:** the registry deps are consistent, there are no new reverse edges, and the auth no-bump reasoning matches the git-version rule.
- **Matrix:** the login fields (`token`, `member_id`) and `period=year` are supported, and the testbed has a staging mode.
