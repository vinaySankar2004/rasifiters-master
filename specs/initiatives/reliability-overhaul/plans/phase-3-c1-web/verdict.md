# Phase 3 track C1 — plan-adversary verdict

# PLAN VERDICT: OBJECTIONS (5)

1. **[BLOCKING] The two-tab adoption guard fails in the most common multi-tab case: tabs left idle for over an hour.** When that happens, the tab replays a refresh token that has already rotated, which is the reuse-kill this release is meant to stop.
   - Evidence: plan step 7, `refreshWithPolicy`, adopts the stored pair only when `!expiresWithin(stored.session.token, REFRESH_WINDOW_S)`. Otherwise it falls through to `apiRefreshSession(start.refreshToken)`, which sends this tab's own older refresh token.
   - DESIGN_BOARD §2 (line 34) names Supabase refresh-token reuse as the cause of random logouts. GoTrue revokes the whole token family when a rotated token is reused after the 10 s reuse interval.
   - The plan's CONTEXT.md text (step 27) says "a newer same-account pair in localStorage … is adopted instead". The code only does that while the other tab's access token still has more than 60 s left.
   - Failure scenario:
     1. Tabs A and B start with (AT1, RT1).
     2. B refreshes and stores (AT2, RT2).
     3. Both tabs sit idle overnight.
     4. A wakes first. `expiresWithin(AT2, 60)` is true, so A does not adopt and refreshes with RT1. RT1 rotated hours ago.
     5. The server answers `401 session_invalid`. A is forcibly signed out, and RT2 is revoked too, so B signs out on its next refresh.
   - There is a second hole in the same guard: "different from mine" is treated as "newer". If a stale tab writes its older pair back through `store()` (via `updateUser` on profile save), the up-to-date tab adopts the OLDER refresh token while that older access token is still valid.
   - Fix (a few lines): adopt only when the stored token's `exp` is later than this tab's token's `exp`, whether or not it is near expiry. If the adopted access token expires within 60 s, go on into the refresh loop using the adopted refresh token instead of returning it. The other choice is to drop the guard entirely, as board §2.4 says ("no cross-tab sync"). Shipping it half-working is the worst option.

2. **[ADVISORY] A late cache write can bring back the launch cache after sign-out.** This goes against binding user decision 1 ("cleared by the sign-out teardown").
   - Evidence: step 19 `cachedQueryFn` writes after `await fetcher()` with no session check. Step 20's `clearLaunchCache()` runs in `teardown`, but requests already in flight still finish.
   - Failure scenario:
     1. On a shared browser, member A taps Sign Out on `/programs` while a window-focus refetch of `["programs"]` is in flight.
     2. Teardown clears the cache.
     3. The response then arrives and `write(A, …)` stores A's program list in localStorage after sign-out.
   - Fix (one line): write only when `currentSessionToken() !== null`, or capture the member id and confirm the session still belongs to it.

3. **[ADVISORY] On set-password, the "couldn't confirm" message stays on screen after the refetch shows the password landed.**
   - Evidence: step 13. On unconfirmed, the plan sets `pwError = passwordUnconfirmed` and calls `identitiesQuery.refetch()`.
   - If `has_password` comes back true, the form hides (`showPwForm && !hasPassword`, profile/page.tsx:405) and the row reads "Enabled". The "may have gone through" error stays, and the manual same-password retry path can no longer be reached.
   - Fix: when the refetch returns `has_password: true`, call `passwordSetDone()`.

4. **[ADVISORY] Test S4 never exercises the recovery-token fix.**
   - Evidence: `reset-password/page.tsx:55-66`. For an already-used link, Supabase redirects with `#error=…`, so the page shows "link expired" without ever calling `/auth/reset-password`. The `bearer: "explicit"` path is never reached.
   - Fix: open a valid recovery link while signed in, wait for its access token to expire (more than 1 h), or edit the fragment's token, then submit. Expect the expired-link message and the session's own password unchanged.

5. **[ADVISORY] An acknowledged notification can pop up again.**
   - Evidence: `NotificationsGate.tsx:185` removes the id from `idsRef` before the acknowledge call finishes. Step 16 now fetches `/unacknowledged` both on start and on every `ready`, and every return to the tab restarts the stream.
   - Failure scenario: the user comes back to the tab and taps OK on a queued modal within about 0.5 s. The `ready` fetch, sent before the acknowledge landed, returns the same notification, and the modal shows again.
   - Fix: keep a short-lived set of acknowledged ids and filter them out in `addNotifications`.

**What was checked and found clean:**

- **Consumers across the web app.** Grepped `loadSession`, `setTokenRefreshHandler`, `setSession`, `signOut`, `logout`, `linkGoogle`, `unlinkProvider`, `ApiError(`, the `["programs"]` and `["summary",…]` query keys, direct `fetch(`/`EventSource`, and server components importing `lib/api`. Every caller is in the brief. iOS and Android are untouched and the backend contract is unchanged, so there is no parity break and no live-binary impact.
- **Line anchors.** Every cited anchor matches HEAD `962d14b`.
- **Backend claims, verified in code.**
  - `/client-events` never answers 401.
  - CORS exposes `Retry-After` and `X-Request-Id` and reflects request headers.
  - The version gate never answers web with a 426.
  - The same-password text matches `authSessionService.js:31`.
  - A 401 on a password write means the write never ran (`updateOwnPassword`).
  - `PUT /email` answers 400 for a wrong password.
- **`X-App-Version` from the commit SHA.** The Vercel project has `autoExposeSystemEnvs: true`, and recent CLI prod deploys carry `githubCommitSha`, so the SHA should be present on the manual fallback deploys too.
- **Locked rules.** Invites D-C8 requires the F3 removal. The new page D-REL rows are called out. TS strict compiles by inspection (TanStack v5 signatures, `isolatedModules` re-export, no ESLint config).
- **Kit placement.** The offline banner sits outside `<main>` and the blur nav. The stale banners sit outside `PageShell`.
