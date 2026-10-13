# Phase 3 track R3 — plan-adversary verdict

# PLAN VERDICT — OBJECTIONS (7)

1. **[BLOCKING] The step 23 compile and boot check runs against the wrong tree, and cannot run in the worktree the plan requires.**
   - Evidence: the plan says "Work on branch `phase3-r3-backend` (a worktree off main)". The multiplex skill (`.claude/skills/multiplex/SKILL.md:42`) and `.claude/agents/implementer.md:3` say the same.
   - Step 23 starts with `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend`. That is the main checkout, which is on `main` and stays there.
   - A worktree has no `node_modules` and no `.env`. Both are ignored by `apps/backend/.gitignore:1-2`, and the repo root has no `node_modules` either (checked: `ls` reports none).
   - Without `.env`, `DATABASE_URL` is unset. `config/database.js:5` then calls `new Sequelize(undefined, …)`, which throws `ERR_INVALID_ARG_TYPE` (reproduced).
   - Step 30's `git -C <worktree> rebase main` is a placeholder path, which breaks the Planning Standards.
   - Failure scenario: the implementer runs step 23 as written. `node --check services/inviteSendService.js` fails with ENOENT on main, and the 24-line output can never match. If they run it in the worktree instead, `-r dotenv/config` fails with "Cannot find module 'dotenv'". Either way there is no valid backend compile gate, and the implementer may "fix" things by editing main.
   - Fix:
     - Give the worktree path as a literal.
     - Add `ln -s /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/node_modules <wt>/apps/backend/node_modules` before step 23.
     - Run step 23 from `<wt>/apps/backend` with `DATABASE_URL=postgres://smoke:smoke@127.0.0.1:5432/smoke` added. Sequelize does not connect when it is loaded.
     - Use the same literal path in step 30.

2. **[ADVISORY] Registry graph edge missing.** `routes/notifications.js` will import `utils/rateLimit.js`, which belongs to observability (`registry.json:374`, under `reference_impl` at :369-382). The git-version rule says "an *import* of another feature's code earns a `depends_on` edge" (`git-version/SKILL.md:110-111`).
   - Step 21 should add `"observability"` to `notifications.depends_on`, and the notifications SPEC "Depends on" header should match. Without it, a later observability change to `rateLimit` won't list notifications in its blast radius.

3. **[ADVISORY] Step 31 asks for something Android 1.0.0 can't do.** "The USER declines the invite(s) on the devices" is impossible on Android: 1.0.0 has no `/my-invites` or `/invite-response` path (W2 F1, §8; `ProgramPickerScreen.kt` reads membership rows only).
   - Failure scenario: the Pixel's account is left with a pending prod invite to ava's program. It appears in that account's web/iOS inbox for 30 days.
   - Fix: decline that account's invite on web (or iOS 1.4.2).

4. **[ADVISORY] An APNs timeout can over-report failures.** `apn` `Provider.send` is a `Promise.all` over one write per token (`node_modules/apn/lib/provider.js:25-38`). If a single stream hangs, the 10 s race marks every token in that send as `failed/timeout`, including ones APNs already accepted.
   - Effect: `push_deliveries` shows false failures, and the hung writes stay queued inside `apn`.
   - Fix: add an F-row noting this, or race each token's write separately.

5. **[ADVISORY] Docs that will go stale are outside the file fence and not updated.** `sendInvite` moves to `inviteSendService.js` and `authService` pushes are delegated, so these lines go out of date:
   - `specs/pages/web/members/invite/SPEC.md:77,137-138` (`inviteService.sendInvite :16-26`, `inviteService.js:21-26`)
   - `specs/features/auth/SPEC.md:167` (`authService.js:99-121`)
   - `specs/features/app-config/SPEC.md:145-146` and F1 at :222 ("tokens keyed solely by the unique `device_token`" — D-C11 supersedes this)
   - git-version's "doc blast-radius on ADDED facts" rule (SKILL.md:93) applies. List these as a follow-up docs commit or hand them to the client plans.

6. **[ADVISORY] git-version will flag about 15 features.** `server.js` is in the `reference_impl` of 15 features (auth, members, programs, program-memberships, notifications, invites, workouts, program-workouts, workout-logs, daily-health-logs, analytics, analytics-v2, member-analytics, app-config, observability). `services/authService.js` belongs to auth.
   - Step 2 of git-version will detect all of them and ask about a bump for each. §32 lists only auth and observability as "none".
   - Fix: add explicit "no bump — notifications-owned shutdown block" rows for the rest so the commit gate doesn't stall or over-bump.

7. **[ADVISORY] Two small hardening gaps.**
   - **Pre-flight:** the new raw `INSERT` in step 5 leaves out `id` and relies on the database default `gen_random_uuid()`. The old code generated a client-side `UUIDV4` (`MemberPushToken.js:6-8`). Both `001:163` and `008:172` define the default, so prod should be fine. Adding `SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='member_push_tokens' AND column_name='id';` to step 25 closes the one way staging could pass while prod returns 500 for every new token.
   - **Rollback:** `git revert <R3 sha>` will conflict if R1 or R2 lands later and touches `authService.js` lines 91-125 or the tail of `server.js`. State the resolution: restore the pre-R3 text of exactly those hunks.

**Checked with no objection:**
- **Line anchors:** every one cited in `routes/notifications.js`, `utils/pushNotifications.js` (14-41, 95-121, 58, 167), `utils/notifications.js:76-80`, `server.js:122-137`, `authService.js:91-125/153/483`, `inviteService.js`, `routes/invites.js`, `sql/README.md:20/85`, backend `CONTEXT.md:24`, `REGISTRY.md:17-18`, and the notifications and invites SPECs is current.
- **Backend consumers grepped:** all users of `upsertPushToken`, `removePushToken`, `MemberPushToken`, `sendPushToMembers`, `getProvider`, `getFcmApp` and `notificationStreams`. None is missed. The `Notification.destroy` in `cascadeMemberDeletion` (`utils/programMemberships.js:182`) is fine because of the `push_deliveries` cascade plus the `notification_id` index.
- **Live clients:**
  - iOS 1.4.2: SSE `onError` is a no-op and `{}` frames are skipped, so a plain close is no worse than today's process kill. It re-registers via PUT on every foreground with no dedupe. It reads only `notification_id`. Its invite flow swallows errors.
  - Android 1.0.0: it filters `type=="notification"` and swallows close events. Its manifest default channel is `rasi_default`, so an unknown channel id falls back to it. It dedupes in memory and re-registers on cold start. Its invite flow swallows errors.
  - Web: the invite page swallows errors, and `EventSource` reconnects after a clean close.
- **Library behaviour, run locally:**
  - firebase-admin 12.7: per-message deep copy, and a multi-token TTL plus `channel_id` passes validation (outputs `"604800s"`). The 15 s timeout is real.
  - apn 2.2.0: reports `:status` as a string, and the note compiles with the new keys.
  - Sequelize: the upsert and rotation SQL get their replacements as intended.
- **Migration 010:** the order of add → default → backfill → NOT NULL is right. It is idempotent. It is schema-neutral given the staging role's `search_path`. The staging grants, the RLS loop and the cron `format()` all follow the 007/008 patterns.
- **Rate limiter:** the 429 body and `Retry-After` match `utils/rateLimit.js`.
- **`?token=`:** the request log records only the route template, and Render's plan keeps no HTTP request log.
- **Invites:** the race-detection path (`err.parent.constraint`) is sound, and the transaction runs SSE/push dispatch only after commit.
- **Smoke script:** it has exactly 26 checks.
- **Other:** live-binary compatibility (RELEASES.md), and no N+1.
