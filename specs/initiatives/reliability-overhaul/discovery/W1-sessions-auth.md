# W1 — Sessions / auth: discovery brief

> Phase 0, read-only, 2026-10-11. Production windows: Supabase auth logs 07-13 → 10-11 (retention ≈ 90 days),
> DB snapshot 10-11, Render metrics 09-12 → 10-11. User ids are omitted or truncated. The auth code has not
> changed since 2026-07-15 (`git log`), so every live binary behaves as described.

## 1. Summary

- **The logouts are real, and they are iOS.** In 90 days Supabase revoked a session for refresh-token reuse
  **138 times**. 31 such sessions are still in the DB; every owner of one who has a push token is on iOS.
  One account was killed 21 times, about every 4 days.
- **S1 is confirmed, and it is worse than suspected.** iOS issues **98%** of all refresh tokens, and **91%**
  of those come less than 60 s after the previous one: sync loops refresh once per iteration. iOS also keeps
  two token copies that drift apart. A token 2+ rotations old, sent more than 10 s after it was revoked,
  revokes the whole session.
- **All users share one rate-limit bucket.** Every refresh comes from Render's single IP, and Supabase
  returned **118 × 429** in 90 days. The backend turns every refresh failure into `401 Invalid refresh
  token`, which all three clients treat as "sign out". One user's iOS refresh storm can log out another user.
- **Every surface signs out on transient failures (S9).** iOS and Android sign-outs also revoke **all** of
  the user's sessions, because `signOut()` defaults to global scope. The legacy app revoked one token.
- **The backend shares one stateful supabase-js client across all users.** It can hand one user's refreshed
  session to another user's concurrent request: an identity mix-up whose frequency the logs can't show.

## 2. How it works today

**Backend**
- **Refresh.** `/api/auth/refresh` (`routes/auth.js:54-63`) runs `refreshSession` on the shared `supabaseAuth`
  singleton (`authService.js:155-168`; `config/supabase.js:22-27`). **Any** Supabase error becomes 401
  (`authService.js:159-160`).
- **auth-js 2.108.2** (pinned in `package-lock.json`; `@supabase/auth-js/dist/main/GoTrueClient.js`):
  - It runs with no lock (`:141`).
  - Before using the caller's token, it refreshes whichever session it saved last, if that session is
    within 90 s of expiry (`:2458-2486`).
  - A refresh already in flight is returned to every caller, **whatever token they passed**
    (`:4063-4065`).
  - It retries network errors for up to 30 s (`:3896-3921`).
- **Logout** (`authService.js:170-187`) calls `refreshSession` and then `signOut()`. The default scope is
  `'global'` (`GoTrueClient.js:3319`).
- **`authenticateToken`** checks the token against Supabase's published keys, then looks up the member.
  **Any exception returns 401** (`middleware/auth.js:43-53`).
- **Supabase auth config (10-11):**
  - Sessions: `jwt_exp` 3600, rotation on, reuse interval 10 s, timebox 0, inactivity 0, multiple sessions
    allowed.
  - Rate limit: `rate_limit_token_refresh` 150.
  - `security_sb_forwarded_for_enabled` false.

**Web**
- **Storage.** `localStorage` `rasi.fiters.session` (`lib/auth/session.ts:14,29-35`) plus a cookie that page
  scripts can read (`:15-21`). The edge middleware only decodes the token; an expired one passes
  (`middleware.ts:16-27`).
- **Refresh.**
  - Triggers: on bootstrap, if the token has expired (`auth-provider.tsx:108-110`), and on any 401
    (`lib/api/client.ts:51-53`).
  - Coalescing: within a tab only (`client.ts:21-34`).
  - The refresh token comes from the in-memory `sessionRef` (`auth-provider.tsx:138-141`); tabs don't share
    updates.
- **On failure.** Any error clears the session (`auth-provider.tsx:90-95`), and the user lands on `/login`
  (`use-auth-guard.ts:20-21`).
- **Sign-out** only clears local state. `/auth/logout` (`lib/api/auth.ts:97`) is never called.

**iOS**
- **Storage.**
  - Two copies: the keychain, and in-memory `ProgramContext.authToken`/`refreshToken`, read once at init
    (`ProgramContext.swift:255` → `+Auth.swift:37-39`).
  - The keychain items use the default `WhenUnlocked` access (`KeychainService.swift:9-19`).
  - Saving deletes, then adds, with no status check (`:15-19`).
  - Loading returns `nil` on any error, including the device being locked (`:31-35`).
  - The UI decides "signed in" from the in-memory token (`AppRootView.swift:11`).
- **Path A, `refreshSessionIfNeeded`** (`+Auth.swift:93-120`).
  - Refreshes **unconditionally**, using the in-memory token, at launch (`AppRootView.swift:44`) and on
    **every** foreground (`:87-91`).
  - On a 401/403 it retries with the keychain token if that one differs, then calls `signOut`
    (`+Auth.swift:105-116`).
- **Path B, `refreshAccessTokenIfPossible`** (`APIClient.swift:107-123`).
  - Uses the keychain token.
  - Coalesces only calls that overlap in time.
  - Refreshes early when the token has less than 300 s left (`:52,57-64`), and on 401 (`:68-90`).
  - It saves to the keychain, then queues a main-thread task that updates the in-memory copy and writes it
    **back over the keychain** (`+Auth.swift:22-28,59-60`).
- **A and B never coalesce.**
- **Health writers** do their own 401 → refresh → retry (`APIClient+DailyHealth.swift:51-54,110-113,259-262`;
  `APIClient+Workouts.swift:203-206,310-313`). They loop with a token captured once
  (`ProgramContext+HealthKitSteps.swift:76→132`; `+HealthKitSleep.swift:76→133`; `+HealthKit.swift:89→159`).
- **`signOut`** (`+Auth.swift:136-161`) posts `/auth/logout`, which revokes the session globally.

**Android**
- **Storage.** EncryptedSharedPreferences holds the single copy (`core/Session.kt:15-26,35-37`).
  `allowBackup="true"` (`AndroidManifest.xml:25`).
- **Refresh.** An OkHttp `Authenticator` refreshes on 401 only, coalesced with `synchronized`
  (`net/Network.kt:79-103`). There is no attempt cap. The refresh client uses the default 10 s timeouts
  (`:75`).
- **On failure.** Any non-2xx, `IOException` or decode error returns `null` (`:105-120`). The session is then
  cleared (`:92-96`; `ProgramContext.kt:338-340`).
- **`signOut`** (`ProgramContext.kt:326-336`) posts `/auth/logout`, which revokes globally.
- **On resume.** The stream, push registration and health sync fire in parallel (`RootScreen.kt:89-97`).
  No background worker uses the tokens.

## 3. Production evidence

| # | Query / command (window) | Result |
|---|---|---|
| E1 | `tools/ops-get.sh supabase '/v1/projects/<ref>/config/auth'` (10-11) | Values in §2. No setting ever times a session out |
| E2 | `tools/supabase-logs.sh "select log_attributes['path'], ['grant_type'], ['status'], ['error_code'], count(*) … where source='auth_logs' and log_attributes['msg']='request completed' group by …"`, once per UTC day (07-13→10-11) | <ul><li>Refresh: **31,195** successful</li><li>Logins: 298 password, 19 id_token</li><li>Errors: **190** `refresh_token_already_used`, **118** 429 `over_request_rate_limit`, 14 `refresh_token_not_found`, 17 `validation_failed`</li><li>17 `/logout` calls</li></ul> |
| E3 | `select timestamp, …['status'], …['error_code'], …['duration'] … where path='/token' order by timestamp limit 2000`, for the 61 days with errors | <ul><li>`already_used` forms **138 events**, 47 of them in the last 30 days</li><li>**45** events are two failures about 1 s apart. That is the iOS keychain-retry signature (`+Auth.swift:106-111`), which only fires when the in-memory and keychain tokens differ</li><li>50 events share their second with a successful refresh</li><li>429s came in 114 bursts, each after 34–67 `/token` calls in 5 min. That is below the 150 / 5 min limit, so a burst cap of about 30 applies</li><li>Supabase refresh time: p50 10 ms, p99 30 ms</li></ul> |
| E4 | psql (read-only transaction): sessions whose refresh tokens are all revoked | <ul><li>**31** sessions across 7 users; the 6 users with push tokens are all iOS</li><li>One account: 21 kills between 07-21 and 10-10, most followed by a new login hours later</li><li>Just before each kill, 4–5 token rotations happen within 1–3 s; the kill follows 0 s to 110 min later</li></ul> |
| E5 | psql: refresh tokens issued over 30 days, by the owner's push platform | <ul><li>**iOS** (9 users): 8,673 tokens, 32 per user per day, **91% less than 60 s** after the previous one</li><li>**Android** (11 users): 123 tokens, 0.4 per user per day, 0% that close</li><li>No platform (4 users): 73</li></ul> |
| E6 | psql: tokens issued less than 200 ms after a different user's (30 days) | <ul><li>59 pairs. In 54, the first session had been idle for at least 58.5 min: the server refreshing its stored session</li><li>42 of those users later continued from the token the server issued. This proves Supabase accepts a token one rotation old</li></ul> |
| E7 | Render `get_metrics`, request counts by status code, daily (10-01→10-10) | <ul><li>401s: 10,387 of 53,140 (**19.5%**), about 1,040 a day</li><li>Successful refreshes: about 540 a day</li><li>No breakdown by path is available. Android and web together refresh about 6 times a day (E5), so the 401s are mostly iOS (inference)</li></ul> |
| E8 | `/logout` times compared with `not_found` times (90 days) | 3 of 9 `not_found` events come 1–19 min after a `/logout`. That is consistent with a global logout killing a second device. Unproven: the failed rows don't record the user |
| E9 | `auth_audit_logs` (10-04) | 646 `token_refreshed`, 620 `token_revoked`. The audit log is **populated now**; BRIEF §3 is out of date |

## 4. Failure modes

| # | Trigger → mechanism → symptom | Likelihood | Evidence |
|---|---|---|---|
| F1 | A sync loop holds an expired token, so every iteration gets a 401 and refreshes again (`APIClient.swift:107-123`; `+HealthKitSteps.swift:76→132`). Symptom: bursts of 401s and token rotations that drain the shared rate-limit bucket | High | Prod (E4, E5) + code |
| F2 | The in-memory and keychain tokens drift apart (`+Auth.swift:94` vs `APIClient.swift:114`), and the write-back can roll the keychain back (`+Auth.swift:22-28,59-60`). A stale token sent more than 10 s later revokes the session; 401 → `signOut` (`+Auth.swift:115`, `APIClient.swift:87`). Symptom: a "random" logout, often after a background sync | High | Prod (E3, E4) + code. The exact timing is plausible, not proven |
| F3 | Supabase's per-IP 429 becomes a 401 (`authService.js:159-160`), and every client signs out. Symptom: another user's storm logs you out | Medium | Prod + code |
| F4 | A transient Supabase or network failure on refresh. auth-js retries for up to 30 s, but Android gives up after 10 s and clears the session (`Network.kt:75,112-118`); the server may still finish the rotation. Web clears on any error | Low–medium | Code |
| F5 | A key-fetch or DB error makes `authenticateToken` return 401 (`middleware/auth.js:51-53`). The client refreshes, gets 401 again, and iOS signs out (`APIClient.swift:78-79`, `+Workouts.swift:205`, `+DailyHealth.swift:261`), revoking every session | Low | Code |
| F6 | A manual sign-out on iOS or Android revokes globally (`authService.js:180`). Symptom: the user's other devices are signed out within about an hour | Medium | Code + E8 |
| F7 | The keychain can't be read while the device is locked. A background launch reads `nil` (`KeychainService.swift:31-35`) and the user sees the login screen. Delete-then-add can also lose the token | Low–medium (W3: wakes come mostly after unlock) | Plausible |
| F8 | Web, two tabs: tab B keeps a stale refresh token in memory (`auth-provider.tsx:139`). Once tab A has rotated twice, tab B's refresh revokes the session and clears the shared storage | Low–medium | Code |
| F9 | The shared backend client hands user A's refresh result to user B's concurrent call (`GoTrueClient.js:4063-4065`). Symptom: B sees A's account | Low frequency, severe | Code. Can't be measured: the merged call leaves no Supabase log |

## 5. Suspect verdicts

- **S1 — CONFIRMED.** The two refresh paths diverge in production (45 retry pairs, 31 sessions, 138 kills).
  Two things amplify it: per-iteration refresh storms, and an unconditional refresh on every foreground.
- **S2 (keychain half) — PARTIAL.** The code facts are confirmed: `WhenUnlocked`, `nil` on any error,
  delete-then-add. A locked launch can't be proven from server data.
- **S6 — PARTIAL.** Web and Android do refresh only after a 401, but they are not the source of the ~20% 401
  share; iOS is (E5, E7). Correction to the BRIEF: iOS refreshes on **every** foreground, not only near
  expiry.
- **S8 — CONFIRMED and extended.** No setting ever times a session out; reuse detection is what kills
  sessions. New: the per-IP refresh limit, with forwarded-for off, means every user shares Render's bucket.
- **S9 — CONFIRMED.** Sign-out triggers by surface:

  | Surface | Triggers |
  |---|---|
  | Web | Any refresh error, including offline or 5xx (`auth-provider.tsx:90-95,112-119`) |
  | iOS | A 401/403 from refresh, which includes 429 and transient errors (`+Auth.swift:115`, `APIClient.swift:87`) · A 401 on the retry after a refresh (`APIClient.swift:79`, `+Workouts.swift:205`, `+DailyHealth.swift:261`) · A locked keychain read at init, which shows the app as logged out without a sign-out call |
  | Android | Any refresh failure: non-2xx, timeout or exception (`Network.kt:92-96`) |

## 6. Cross-surface divergences

| Aspect | Web | Android | iOS |
|---|---|---|---|
| Refresh trigger | On bootstrap and on 401 | On 401 | Every foreground, 300 s early, on 401, and once per loop iteration |
| What counts as an auth failure | Anything | Any non-2xx or exception | 401/403 only; the custom loops swallow errors |
| Logout | Local only | Global, on the server | Global, on the server |
| Token copies | Per tab, plus a cookie scripts can read | One | Two |
| Refresh coalescing | Within a tab only | Whole process | Two paths, never coalesced |
| Calls `/auth/me` | Yes | Yes | No |

## 7. Industry-standard target (contract)

1. **One source of truth per device.** One token store shared by all tabs and all code paths. Never send a
   token older than the newest one stored, and save a new token pair atomically before using it. [a][f]
2. **One refresh in flight per device.** A caller holding an outdated access token retries with the current
   token instead of refreshing again. [d]
3. **Refresh just before expiry.** Never unconditionally, and never once per loop iteration. [a]
4. **Failure taxonomy.**
   - Only a definitive "invalid session" ends a session: not found, already used, or user deleted.
   - Network errors, timeouts, 5xx, 429 and an unreadable keychain keep the session and retry with backoff.
   - The backend returns 401 only for an invalid token, and 429 or 503 (with `Retry-After`) plus an error
     code for transient failures.
5. **Stateless backend proxy.** No shared Supabase client holds session state [c]. Rate limits are per end
   user, by passing the client IP via `Sb-Forwarded-For` [b].
6. **Logout revokes only this session**; "sign out everywhere" is an explicit action. [e]
7. **Storage.**
   - iOS keychain: `AfterFirstUnlockThisDeviceOnly`, status checked on every save, and "not found" kept
     distinct from "interaction not allowed" [g].
   - Android: tokens excluded from backup [h].
8. **Observability.** Every forced sign-out records a reason code on both client and server (W6).

Sources:
- [a] supabase.com/docs/guides/auth/sessions
- [b] supabase.com/docs/guides/auth/rate-limits
- [c] supabase.com/docs/guides/auth/server-side
- [d] OkHttp recipes, "Handling authentication"
- [e] supabase.com/docs/reference/javascript/auth-signout
- [f] RFC 9700 §4.14
- [g] Apple, "Restricting keychain item accessibility"
- [h] developer.android.com/identity/data/autobackup

## 8. Live-binary constraints

- **What's live.**
  - iOS 1.4.2 (56) is public, 1.4.3 (57) is on TestFlight, and some 1.4.0/1.4.1 installs remain.
  - Android 1.0.0 (4) is public; some testers may still be on (3).
  - All of them contain the code above, so the F1/F2 storms continue until users update. **Mitigation for
    those binaries can only happen on the server.**
- **Keep the `/refresh` response shape:** `{refresh_token}` → `200 {token, refresh_token, message}`. Android
  requires `refresh_token` to be non-null (`Dtos.kt:37-40`).
- **How each client reacts to `/refresh` failures.**
  - iOS signs out on 401/403 and survives 429 and 5xx.
  - Android 1.0.0 signs out on **any** non-2xx or after 10 s. Only a success within 10 s protects it.
  - Web redeploys instantly.
- **Safe for every binary:** `authenticateToken` returning 503 instead of 401 for infrastructure errors, and
  changing the `/auth/logout` scope (clients ignore its response).

## 9. Open questions for the user

1. Logging out of one device currently signs you out of all of them. The legacy app only signed out that
   device, and this change was never called out. Keep it, or go back to per-device logout?
2. Should F9 (one user seeing another user's account) be handled first, as a security fix?
3. Can you capture iPhone Console logs during a locked-phone wake, or install an instrumented TestFlight
   build, to settle S2/F7?
4. Do users run the web app in several tabs alongside the phone? That decides how much F8 matters.
5. 197 of 270 sessions have been idle for more than 30 days. Do you want an inactivity limit or a maximum
   lifetime?
6. Will you approve auth-config changes made with the admin token (forwarded-for, the rate limit) once
   they're on the design board?
