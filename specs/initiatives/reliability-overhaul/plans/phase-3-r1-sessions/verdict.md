# Phase 3 track R1 — plan-adversary verdict

# PLAN VERDICT — OBJECTIONS (8)

1. **[BLOCKING] Wrong safety claim: a secret-key fault would sign out every live Android user, and G2 has no prod stop or rollback.**
   - The plan says (Resolved Q2) "Any key fault surfaces as 503, never as a sign-out". Live Android 1.0.0 (Play production) signs out on any refresh that is not 2xx:
     - `apps/android/.../net/Network.kt:113` has `if (!resp.isSuccessful) return null`.
     - `Network.kt:95-98` then runs `session.clear(); onAuthFailure()`.
     - DESIGN_BOARD.md:78 already records "Old Android still signs out on any failed refresh".
   - After this deploy, every login, refresh and logout on prod switches to the `sb_secret_` key. This happens at once, because the key is already set on prod (D-4).
   - G1 only proves the prod key if staging's `SUPABASE_SECRET_KEY` holds the same value. The plan never states or checks that.
   - G2 says "Every check must PASS" but has no STOP rule and no rollback recipe. G1 has both.
   - Failure scenario: the prod key is mis-pasted or differs from staging. Every `/auth/refresh` returns a code-less 401 from the gateway, which maps to 503. Each Android user's next refresh (≤ 1 h) clears the session. Every Android user is signed out until someone notices.
   - Fix:
     - Correct the claim: it is true for iOS and web, not for live Android.
     - Confirm before G2 that both Render services carry the same key (the same named Supabase key).
     - Add a G2 STOP: if `login #1` or any refresh returns 503, immediately unset `SUPABASE_SECRET_KEY` on prod. That call should be pre-written for user approval (render `update_environment_variables`, workspaceId `tea-cv3u7a3tq21c73ald2ig`), followed by a redeploy.

2. **[ADVISORY] Forwarding the full IPv6 address ignores the repo's own `/64` rule (the brief requires reusing `utils/rateLimit.js`).**
   - `forwardedForHeaders` sends the full `/128` address.
   - `utils/rateLimit.js` `clientKey` buckets IPv6 by `/64` precisely because "per-address keys would let a single client rotate past the limit".
   - Failure scenario: after G3, one IPv6 subscriber rotates addresses inside its `/64` and gets a fresh Supabase bucket on every attempt. Password guessing on `/login*` and `PUT /email` is then effectively unthrottled, and auth F4 says there is no Express limiter.
   - Fix: for non-mapped IPv6, forward the `/64` network address (`2001:db8:1:2::`) derived from `clientKey`, and record that in D-C14(a).

3. **[ADVISORY] Older auth SPEC rules go stale without a "superseded" marker.** The git-version skill says to "Supersede a stale D-rule in place with a 'superseded at vX.Y.Z by D-…' marker".
   - These still describe the old mechanism and are not updated by step 11:
     - D-C5 (row 261) and §4 lines 160-163: `/reset-password` "reuses the existing `changePassword` (Supabase admin `updateUserById`)".
     - D-C10 (row 265): `makeEphemeralAuthClient` + `setSession` + the body `refresh_token`; add-password = `admin.updateUserById`.
     - D-C11 (row 266): "logout/link/unlink keep `makeEphemeralAuthClient` unchanged".
   - `apps/backend/middleware/versionGate.js:8` ("errorHandler.js would drop `code`") also becomes false. It is outside the file fence, so it needs an H-handoff.

4. **[ADVISORY] Cross-track text conflicts with R3's already-written plan** (`plans/phase-3-r3-push/plan.md`).
   - R3 §3.1, the unregister table at :1153, documents "malformed JSON → `500` … observability F2". After R1 it is 400 `invalid_body`.
   - R3 §3.3 at :1213 says "today also a JWKS / DB outage — F11, moving to `503`". It needs flipping once R1 lands.
   - H1 targets raw notifications SPEC lines 95/118, which R3's own row insert (19, after :62) shifts.
   - R3 logs errors inline (plan :304, :780, :1031) and never imports `logError`. That contradicts the new observability §4 text "Every Phase 3 track imports it — never a copy".
   - The R1 cross-track note says R3 edits the `handleAppLogin` / `/oauth` lines. It does not: R3's brief :101 and its step list never touch `routes/auth.js`.
   - Fix: make H1 string-based and add these R3 items to it.

5. **[ADVISORY] The link grant leaks a live session on every link.**
   - `POST /token?grant_type=id_token` with `link_identity:true` issues a new session. Evidence: auth-js `GoTrueClient.js:3808-3833` uses `_sessionResponse` and then `_saveSession`.
   - The plan discards that session but never revokes it. It says these "end via the inactivity timeout", but G4 may be deferred if the project is not on Pro, in which case they never end.
   - Fix: one best-effort `revokeSessions(res.body.access_token, "local", ip)` after a successful link, using the helper the plan already has. The `PUT /email` re-auth session has the same leak (pre-existing).

6. **[ADVISORY] The `changeEmail` revert can make things worse, not prevent drift.**
   - Step 6q fires `revertAuthEmail` without waiting, while the timed-out admin update may still be in flight on GoTrue.
   - Failure scenario:
     1. The revert commits first, then the original update commits.
     2. `auth.users` now holds the new email while `member_emails` holds the old one.
     3. Login uses `resolvePrimaryEmail` (the `member_emails` email), so `signInWithPassword` fails and the user gets 401 "Invalid credentials".
   - The comment's promise "never drift apart" is false. Record this under F18, or check `getUserById` before reverting.

7. **[ADVISORY] `logError` can split one error across several log lines.** It prints `err.message` with its newlines intact. The plan's own check expects `"line1\nat leak@x.io"` to come out as two lines. Fix: replace `\r?\n` in the message before formatting.

8. **[ADVISORY] File size, against the brief.**
   - `routes/auth.js` is fully rewritten and still ends at about 245 lines.
   - `authService.js` grows from 759 to about 800 lines, even though the brief says "Put net-new code in the new file". `resetPassword` and `revertAuthEmail` are net-new and fit in `authSessionService.js`.
   - F17 records this, but it would be cheap to avoid now.

What I checked and found clean:
- **Line anchors:** every cited anchor is current — `authService.js` (1-15, 16-27, 82-89, 127/131/148, 167-172, 182-202, 227-229, 272-273, 278-302, 304-309, 329-335, 342-408, 410-420, 434-439, 520-521, 578-593, 602-665, 672/679, 737-759), `routes/auth.js`, `middleware/auth.js` (including the post-edit anchors in the step 7 table), the auth SPEC lines, observability SPEC 3/26/142-144/210-211, ENV_RUNBOOK 105/107/118/282, REGISTRY.md 13/27, and notifications SPEC 95/118.
- **Library behaviour:** supabase-js 2.108.2 merges `global.headers` into the auth client (`index.cjs:1256, 1403-1407`), auth-js's `jwt` overrides `Authorization`, and nothing blocks a secret key in Node.
- **Backend consumers grepped:** `changePassword`, `setPassword`, `makeEphemeralAuthClient`, `logout`, `errorHandler`, `supabaseAdmin`. None are missed; `memberService` and `membershipService` are covered by A1.
- **Client consumers on all three surfaces:** web never calls `/logout`. iOS sends the body only; Android sends Bearer + body. 401 handling matches the brief: iOS `APIClient.swift:53-93`, Android `Network.kt:68-118`, web `client.ts:51`. Every 503/400 remap is safe for live clients except point 1.
- **Event logging:** client-event types and prop keys pass `TYPE_RE` and `SENSITIVE_KEY_RE`, so point (f) needs no backend change.
- **Numbering:** D-C14/15 and observability D-C11 are free.
- **Smokes:** the forced-mode paths make no DB writes, and the boot-check expected outputs match the plan's code.

Relevant files: `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/net/Network.kt`, `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/rateLimit.js`, `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/auth/SPEC.md`, `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/initiatives/reliability-overhaul/plans/phase-3-r3-push/plan.md`, `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/versionGate.js`
