# Phase 3 track C1 — scope brief (pipeline status: revised-once)

# SCOPE BRIEF: Reliability Phase 3 client half, Track C1 (web): sessions, invites and SSE, auth events and identity headers, kit adoption, instant opens

- **Features**:
  - auth@0.13.0 (SPEC: specs/features/auth/SPEC.md §3.1 rules 1–6) · consumed_by [web, ios, android]
  - notifications@0.4.0 (SPEC: specs/features/notifications/SPEC.md §3.3. On web §3.1 means "no native push, sends none".) · consumed_by [web, ios, android]
  - invites@0.2.0 (SPEC: specs/features/invites/SPEC.md §3.1) · consumed_by [web, ios, android]
  - observability@0.2.2 (SPEC: specs/features/observability/SPEC.md §4.1 + §8 `auth.*`) · consumed_by **[]**, so web becomes a consumer
  - frontend-kit@0.1.0 "built", unadopted (SPEC: specs/features/frontend-kit/SPEC.md §3–§6, §10) · consumed_by [web, ios, android]
  - Not on web:
    - health-sync@0.1.0 — no HealthKit or Health Connect in a browser.
    - app-config@0.2.0 (version gate) — web deploys atomically and has no store binary (D-KIT-9).
- **Pages/screens**:
  - web/programs (specs/pages/web/programs/SPEC.md) is the launch screen and invite inbox.
  - web/summary (specs/pages/web/summary/SPEC.md) is the launch screen.
  - web/program/profile (specs/pages/web/program/profile/SPEC.md) gets "Sign out everywhere" plus the set-password rule 6.
  - web/program/password (specs/pages/web/program/password/SPEC.md) gets the change-password copy plus rule 6.
  - web/members/invite (specs/pages/web/members/invite/SPEC.md) loses the error swallow (its F1/D-S1 change).
  - web/login (specs/pages/web/login/SPEC.md) gets `auth.sign_in_failed` and the forced sign-out message.
  - web/create-account (specs/pages/web/create-account/SPEC.md) gets `auth.sign_in_failed`.
- **Files (exhaustive — implementer may touch ONLY these), grouped by surface**:
  - backend/ — none. It is out of scope, live, and the contracts already serve web. CORS already reflects request headers and exposes `Retry-After` and `X-Request-Id` (apps/backend/server.js:55-68). The version gate never 426s web (apps/backend/middleware/versionGate.js).
  - web/ — sessions:
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/api/client.ts
      - Read the current session token at send time through a getter registered by AuthProvider.
      - Refresh first when the token expires within 60 s.
      - On a 401 sent with an outdated token, retry once with the current token instead of refreshing again.
      - **Never swap or refresh-retry an explicit non-session Bearer** (the recovery token on `/auth/reset-password`, the pending token on `/auth/oauth/complete`).
      - `ApiError` gains `code`, `retryAfter` and `requestId` (D-KIT-5).
      - 15 s timeout, combined with the TanStack `signal`.
      - §4.1 headers on every call (`X-App-Platform: web`, `X-App-Version`) plus a fresh UUID `X-Request-Id`.
      - A no-retry option for the password writes.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/auth/auth-provider.tsx
      - Classify refresh results: sign out ONLY on `401 session_invalid`. On 503/429/5xx/timeout/offline keep the session, retry once within 5 s, then back off. Today it clears on any error (:90-95, :108-119).
      - Full teardown on every path: `/logout` with Bearer and refresh_token, outcome ignored; `queryClient.clear()`; clear the launch cache and the active program. The SSE stops through the null token.
      - New `signOutEverywhere()` for `POST /auth/logout-all`.
      - Expose a fresh-token getter for SSE.
      - Report `auth.forced_sign_out` and `auth.refresh_failed`.
      - AuthProvider already sits inside QueryClientProvider (providers.tsx).
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/auth/session.ts — `loadSession` must tell "absent" from "corrupt" so a corrupt store reports `token_store_unreadable`. It stays the one store: localStorage `rasi.fiters.session` plus its middleware cookie mirror.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/auth/jwt.ts — add an `expiresWithin(token, seconds)` helper.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/api/auth.ts
      - `logout(token, refreshToken)` sends both. It is unused today: `lib/api/auth.ts:97` has no caller.
      - New `logoutAll(token)`.
      - Optionally drop the ignored `refresh_token` from link/unlink (D-C14).
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/hooks/use-auth-guard.ts — conditional, only if the forced sign-out redirect carries `?reason=`.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/providers.tsx — QueryClient defaults: no retry on 4xx, at most 2 on retryable kit kinds (frontend-kit §10).
  - web/ — events (new files):
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/events/client-events.ts
      - A localStorage queue that survives sign-out.
      - UUID ids kept across retries; batches of ≤ 25 sent with `fetch` + JSON; Bearer only when one exists.
      - Response handling per observability §8: 429 waits `Retry-After`; 413 halves the batch; 400 drops it; 5xx and network errors back off.
      - A helper that maps the kit kind / HTTP status to the event `kind`.
  - web/ — instant opens (new files):
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/cache/launch-cache.ts
      - The last good response per member, for the picker list and the 8 Summary queries (per member + program).
      - Entries carry a schema version.
      - `clearAll()` is called by the teardown.
      - Seeds TanStack `initialData`, so no new dependency.
  - web/ — invites + SSE:
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/components/NotificationsGate.tsx
      - Re-fetch `/unacknowledged` on every `ready` and merge by id. Today it fetches once per token (:131-143).
      - On error or close: close the stream, get a fresh token, reconnect with backoff + full jitter. Today `onerror` is a no-op (:170). A 401 on reconnect leaves `EventSource` CLOSED for good (W2 F7).
      - Foreground only, through `visibilitychange`.
      - Invite invalidation on `program.invite_received` is already present (:93-96).
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/members/invite/page.tsx — show "Invitation sent" only on 200. Every other status goes through the kit; a 400 shows the server text. This removes the swallow at :37-44.
  - web/ — screens (kit adoption + flows):
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/programs/page.tsx
      - `fromQuery` → ErrorView or stale `FloatingBanner` for programs. This replaces the raw `isError` text at :296-311.
      - The invites list inside the actions modal (:819-839) gets ErrorView, not a banner.
      - Seed programs from the launch cache.
      - The file is 1198 lines: put new logic in the new lib modules, not the page.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/summary/page.tsx
      - Replace the raw `ErrorState` (:165-167) with ErrorView / stale banner.
      - Seed the 8 parallel queries (:65-111; already parallel) from the cache.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/program/profile/page.tsx
      - "Sign out everywhere" (recommended placement, see open question 1).
      - Set-password rule 6: no auto-retry; "couldn't confirm" copy after 503/5xx/timeout; a same-password 400 after a manual retry counts as done.
      - Credential-screen 401 keeps the server text.
      - Delete → teardown.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/program/password/page.tsx — the "other devices are signed out" success copy plus the same rule 6 handling.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/login/page.tsx
      - `auth.sign_in_failed` for `password` (:83-89) and `google` (:103-123).
      - 503 → the kit's `unavailable` copy.
      - Forced sign-out message.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/create-account/page.tsx — `auth.sign_in_failed` for the Google path (:157-173), the post-register login (:192), and `oauth/complete` (:205-216).
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/shell.tsx — one global offline banner (`useOnlineStatus` + `FloatingBanner variant="offline"`), rendered outside `<main>` and the `backdrop-blur` nav.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/components/GoogleSignInButton.tsx — optional: a GSI `error_callback` reports kind `provider`, excluding a user closing the popup.
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/kit/app-error.ts — optional: read the now-typed `code` / `retryAfter` instead of the defensive cast (:136-143).
  - web/ — docs (in scope):
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/CONTEXT.md
    - /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/web/{programs,summary,program/profile,program/password,members/invite,login,create-account}/SPEC.md
  - ios/ — none (Track C2).
  - android/ — none (Track C3).
- **DB surface**: none. `app_events` rows arrive through the live `POST /api/client-events`.
- **Flags/env/config involved**:
  - Existing: `NEXT_PUBLIC_API_ENV` and `NEXT_PUBLIC_API_BASE_URL_PROD` (apps/web/src/lib/config.ts). The Vercel `staging` branch preview points at `rasifiters-api-staging` (apps/web/CONTEXT.md:61-69).
  - Possible new build-time value for `X-App-Version` (open question 4). No Vercel env var is required if the package.json version is used.
  - Staging first (opt-in, `+stg` accounts, wake the free instance first) for these checks:
    - Refresh classification: 503 keeps the session; `401 session_invalid` signs out with the event logged.
    - Sign out everywhere.
    - Change-password effect on a second device.
  - Everything else is tested on prod.
- **Blast radius**:
  - `client.ts` and `auth-provider.tsx` sit under EVERY web page: timeout, headers, refresh and the new QueryClient retry defaults change every query and mutation.
  - Reverse `depends_on` from auth / notifications / observability: programs, program-memberships, invites, members, all analytics features, health-sync. Only their web call paths are affected; their contracts don't change.
  - Surfaces to keep in parity: web ↔ iOS (C2) ↔ Android (C3) for auth §3.1, notifications §3.3, invites §3.1, the observability `auth.*` names and fields, and the frontend-kit copy and states.
- **Live-binary compat**: none. The backend is unchanged, web deploys atomically, and no contract changes. Two notes:
  - Cached localStorage outlives a deploy, hence the versioned cache entries.
  - Live iOS and Android see no change from this track.
- **Doc↔code mismatches found**:
  1. **Latent bug.** `client.ts:51-63` with `auth-provider.tsx:138-142` refresh-retries ANY 401, including explicit non-session Bearers. `/reset-password` stays open when a session exists and a recovery token is present (`reset-password/page.tsx:76`). So an expired recovery link plus a signed-in session re-sends `/auth/reset-password` with the signed-in member's token, which would change that member's password. The `client.ts` rewrite must fix this.
  2. Board §2.4 says "web one localStorage key". The code also mirrors the access token into a non-HttpOnly cookie `rasi.fiters.token` (`session.ts:15-35`) that `middleware.ts` reads. It stays, but the token store must keep it in sync on every refresh and clear it on teardown (it already does through `saveSession` / `clearSession`).
  3. Web sign-out never calls `/auth/logout` (`auth.ts:97` unused, W1 §Web). Auth §3.1 rule 1 requires the call.
  4. The profile page still sends `session.refreshToken` to `/link` and `/unlink` (`profile/page.tsx:87,93`; `auth.ts:158-171`). The backend has ignored it since 0.13.0 (D-C14), and the code comments are stale.
  5. registry.json lists observability with `consumed_by: []` and frontend-kit with status "built". Both are stale once this ships.
- **Out of scope (explicitly)**:
  - Health sync, the version gate and the update banner on web; push and device registry (web has no native push).
  - The Next `error.tsx` boundary.
  - Kit adoption on untouched screens: members, lifestyle, the program tab and its other sub-routes, reset-password, forgot-password.
  - Palette or token repointing, skeletons, toasts, cross-tab sync, web push.
  - The program tab's `MyAccountSection` and the `/programs` account modal (no new rows there if open question 1 lands on profile).
  - apps/backend, apps/ios, apps/android, and every orchestrator-owned shared doc.
- **Open questions for the orchestrator**:
  1. Where "Sign out everywhere" goes, with the same copy on all three surfaces. Recommendation: My Profile, just above Delete Account. Delete Account already lives there on iOS (`MyProfileView.swift`) and Android (`ProfileScreen.kt`). Show it to every role (Delete is hidden from global_admin) and confirm with a `ConfirmDialog`. Fix the button, dialog and result strings once for C1, C2 and C3.
  2. The exact password-write copy across the three surfaces: success ("other devices will be signed out") and the rule 6 "couldn't confirm — try signing in with the new password" message.
  3. The forced sign-out message. Login today shows "Your session expired. Please sign in again." The kit's `signedOut` copy is "Your session has ended. Please sign in again." Pick one for parity.
  4. Web `X-App-Version` (`X-App-Build` omitted). Options: the package.json `0.1.0`, or the short Vercel commit SHA (`NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`). The SHA needs system env exposure and must also survive the manual `vercel --prod` fallback deploys.
  5. Cache scope for the picker. Recommendation: programs only, with invites always live. A cached stale invite would 404 on accept.
  6. SSE backoff values (base, multiplier, cap) must be identical across C1, C2 and C3. Notifications §3.3 leaves them to the plans.
  7. Implementation hazards for the planner:
     - Read the cache only after AuthProvider bootstrap (token present) to avoid SSR hydration mismatches.
     - When the global offline banner and a page's stale banner show at once (same fixed slot), let offline win.
     - Don't rely on `AbortSignal.any` / `AbortSignal.timeout`: support is missing on older iOS Safari, and most web users are in Kenya and Tanzania. Combine signals manually.
     - Don't use `keepalive` for `/logout`; a normal fetch finishes during an SPA navigation.
  8. Docs for the orchestrator to apply after the build:
     - observability: add `web` to `consumed_by`, plus a changelog row.
     - frontend-kit: status → adopted, version bump, a changelog row for web adoption (timeout, cache, offline banner).
     - Web-adoption changelog rows for auth, notifications and invites.
     - pages REGISTRY version bumps for the 7 web page SPECs.
