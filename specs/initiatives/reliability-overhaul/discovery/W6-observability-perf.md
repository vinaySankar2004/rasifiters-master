# W6 — Observability + performance baseline (Phase 0 discovery)

> Read-only, 2026-10-11, times UTC. Render metric buckets are **end-labeled**: the daily point stamped `10-11`
> covers Oct 10. I checked this by summing the hourly points into the daily ones. Paths are relative to `apps/`.

## 1. Summary

- **The backend logs SQL queries, not requests.** `logging: true` (`backend/config/database.js:13`) produces about
  3.4 log lines (~0.95 KB) per request. None of those lines records route, status, latency or user. 401s and
  AppErrors write nothing (`backend/middleware/auth.js:51-53`). Logs are kept **7 days** and there are no latency
  metrics, so the two September HTTP 500s can no longer be traced.
- **The logged SQL contains personal data:** usernames, emails, push device tokens and UUIDs as plain literals.
- **The backend throws away why a refresh failed.** `authService.js:158-160` turns every Supabase error into
  `401 Invalid refresh token`. Supabase's own logs for Oct 6 alone show 4 × `refresh_token_already_used` (the S1
  race) and 2 × **429**. One 429 came during a burst of **41 refreshes in one minute**, all from Render's single IP.
  Each of these errors becomes a forced sign-out that no log of ours records.
- **No surface reports client errors, and all three clients swallow them.** The only geography data is Vercel Web
  Analytics. It shows the signed-in web app is mostly used from **Kenya and Tanzania**: 25 of the 42 `/summary`
  visitors over 30 days.
- **S6 is confirmed.** 401s were **20.0%** of requests over Oct 4–10. The latency comes mostly from how clients
  sequence their calls: Android Summary makes 7 calls one after another, iOS makes 8, and web makes 8 in
  parallel. That puts a full Summary at about 2.5–3.5 s on mobile from East Africa or India, against about 0.7 s on
  web. No surface caches API data on the device.

## 2. How it works today

**Backend**

| Concern | Today | file:line |
|---|---|---|
| SQL logging | `true` is treated as `console.log` (`node_modules/sequelize/lib/sequelize.js:144-146`). A multi-line raw query becomes one log entry per line | `backend/config/database.js:13` |
| Request log / request ids | None. The `rndr-id` and `cf-ray` response headers exist but are never read or logged | `backend/server.js:31-90` |
| Error handler | A non-AppError is logged and returns 500. An AppError gets its status and is not logged | `backend/middleware/errorHandler.js:3-10` |
| Auth middleware | Any failure in JWKS verify or the member lookup returns 401 without logging, so a transient fault looks like an expired token | `backend/middleware/auth.js:43-53` |
| Refresh proxy | Supabase 429, network, 5xx and reuse errors all become 401; the error code is dropped | `backend/services/authService.js:155-161` |
| Process handlers | None. The async gates have no try/catch, which Express 4 doesn't catch | `backend/middleware/auth.js:142-149,172-178` |
| Health check | `GET /` returns a fixed string and never touches the DB | `backend/server.js:41-43` |
| Timeouts | **DB:** Sequelize defaults, pool max 5, idle 10 s, acquire 60 s, no statement timeout, no `application_name`, connects as `postgres` via Supavisor session mode (`database.js:5-14`). **Supabase Auth fetch:** none (`config/supabase.js:22-27`). **JWKS:** 5 s with a 10-minute cache (jose default, `:49-51`). **Google exchange:** none (`authService.js:270`). **APNs/FCM:** library defaults | — |
| Push / SSE trail | Push logs `sent to N device(s)` with no notification id, type or member (`backend/utils/pushNotifications.js:71,156`). SSE connects and closes are never logged | `backend/routes/notifications.js:127-145` |

**Clients.** iOS paths are under `ios/RaSi-Fiters-App/`; Android paths are under
`android/app/src/main/java/com/app/rasifiters/`.

| Surface | Requests | Refresh and sign-out | First data | Telemetry |
|---|---|---|---|---|
| Web | No timeout (`web/src/lib/api/client.ts:40-49`). React Query with defaults (`web/src/app/providers.tsx:9`), so refocusing re-fires every query. SSE puts the token in the URL as `?token=` (`web/src/components/NotificationsGate.tsx:154`) | After a 401: one shared refresh, then one retry (`client.ts:21-34,51-83`). At boot: only if the stored token has expired (`web/src/lib/auth/auth-provider.tsx:108-110`). Any refresh error clears the session (`:90-95`) | `/summary`: 8 calls in parallel | Vercel pageviews only (`web/src/app/layout.tsx:163-164`); no error boundary, no `console` |
| iOS | `URLSession.shared`: 60 s timeout, URLCache ETags (`Shared/Services/APIClient.swift:24`) | Proactive when less than 300 s is left, and after a 401 (`:52-90`). Also unconditional on **every foreground** (`Shared/Models/ProgramContext+Auth.swift:93-96,130-133`), inside a sequential chain (`App/AppRootView.swift:42-56,87-99`) | Summary: 8 sequential awaits (`Features/Home/Tabs/AdminSummaryTab.swift:150-157`). Sleep sync: 14 nights × programs, sequential POST then PUT on 409 (`Shared/Models/ProgramContext+HealthKitSleep.swift:121-135`) | None |
| Android | OkHttp: 10 s defaults, no cache, BASIC logcat logging in release (`net/Network.kt:30-36`) | After a 401 only, serialized (`:83-102`). Any non-2xx or exception from the refresh signs out (`:92-96,105-119`). The launch path runs twice at cold start (`ui/RootScreen.kt:70-99`) | Summary: 7 sequential (`core/ProgramContext.kt:584-592`). Health sync: POST then PUT on 409 (`health/HealthSyncController.kt:705-718`) | Firebase messaging only, no Crashlytics (`android/app/build.gradle.kts:122-123`) |

## 3. Production evidence

| # | Call | Window | Result |
|---|---|---|---|
| E1 | Render `http_request_count` by status | Sep 12–Oct 10 | **Oct 4–10:** 33,451 requests (4,779/day). 200 43.6% · **401 20.0%** · 304 19.9% · **409 13.8%** · 499 = 22 · 500 = 0. **Over 29 days:** 2 × 500 (Sep 24, Sep 29). Volume went from about 200/day to 4.6k/day on Sep 22. 401s went from about 0 to 900–1,140/day |
| E2 | Same metric, hourly | Oct 10 | 401s track traffic bursts: 86 × 401 against 132 × 200/304 in one hour, and 98 against 219 in another |
| E3 | `http_latency`, path filter, host grouping | 30 d | All empty. Not available on this plan |
| E4 | Instances, CPU, RAM, events, deploys | 30 d | 1 instance, CPU about 0.05%, 108–132 MB. Live since 2026-07-16, so no cold starts |
| E5 | Render `/v1/logs`, paged | Oct 10 18:16–20:11 | 1,778 lines for about 520 requests, all SQL. Projected about 16k lines / 4.5 MB per day. Literals include usernames, 2 emails, device tokens and UUIDs. INSERT/UPDATE values are bound as `$N` and not logged |
| E6 | Retention; error level; text `*rror*`; `*FCM*` | 7 d | Oldest line 2026-10-05T01:19. **Zero** error lines. One push batch (Oct 6: FCM 8, APNs 7) |
| E7 | Supabase `auth_logs` for `/token` | Oct 4–6 + last 24 h | Successful refreshes: 647, 521, 634, 430 per day. GoTrue p50 9.7 ms, p95 24 ms. **Oct 4:** 2 × 400 `validation_failed`. **Oct 6:** 4 × `refresh_token_already_used`, 2 × 429 `over_request_rate_limit` (11:30, inside **41 /token calls in one minute**, and 17:50). Oct 7–10 not read because of throttling |
| E8 | Supabase `config/auth`, usage | now / Oct 4–10 | `rate_limit_token_refresh` 150, shared by every user through Render's one IP. 255–753 auth requests/day; REST and realtime about 0. The audit log is no longer empty (BRIEF §3 is out of date) |
| E9 | Supabase `postgres_logs` / `supavisor_logs` | 24 h | Postgres: checkpoints plus 2 ERRORs from `postgres` that can't be attributed; no slow-query log. Supavisor: 219 connects/day, because the 10 s pool idle timeout drops connections between bursts |
| E10 | Vercel project | now | Web Analytics on. **Speed Insights disabled since 2026-09-16**, which fits the Hobby free-tier pause. No drains. Request logs are forbidden for this token, and runtime logs are empty because the browser calls Render directly |
| E11 | Vercel `visits/aggregate` by country | Sep 11–Oct 11 | **All pages:** US 71 visitors, KE 23, TZ 15, CA 5, IN 1. **`/summary`:** KE 14, US 12, TZ 11, CA 4, IN 1 |
**Estimated time to first content.** One wave is about 130–160 ms from Vancouver (curl warm TTFB measured at
101–157 ms on Oct 11; 354 ms cold) and about 300–400 ms on mobile from KE, TZ or IN (estimated, not measured).

| Path | Waves (fresh / expired token) | Vancouver | KE / TZ / IN |
|---|---|---|---|
| Web `/summary` cold load | 1 / 2 | 0.15 / 0.3 s | 0.35 / 0.7 s |
| Web tab refocused after >1 h | 3 (8 × 401 → refresh → 8 retries) | 0.45 s | 1.0–1.2 s |
| Android picker | 1 / 3 | 0.15 / 0.45 s | 0.35 / 1.1 s |
| Android Summary | 7 / 9 (renders only when all succeed) | 1.0 / 1.3 s | 2.1–3.6 s |
| iOS Summary | 8 (cards fill in one by one) | 1.2 s | 2.4–3.2 s |

## 4. Blind spots

| What we can't see | Symptom it hides |
|---|---|
| Per-request route, status, latency, member, platform, version and country | "Slow / doesn't load" |
| Why a refresh failed (dropped on our side; Supabase's logs can't be tied to a member or device and are queryable only in throttled 24 h windows) | **Random logouts** |
| Client errors, which are swallowed on all surfaces | Logouts after a refresh fails on the network; SSE 401s |
| A sync trail; uploads are only anonymous POST/PUT/409 counts | **Sync "disconnects"** |
| A push and invite trail with id, recipient and platform | **Invitee got neither push nor invite** |
| SSE open/close counts; anything older than 7 days; any latency metric; where mobile users are; which queries are the app's or slow | S7, past incidents, per-country latency, database slowness |

## 5. Suspect verdicts

- **S6: confirmed, with a different shape per surface.**
  - **Android** refreshes only after a 401, so the first open after an hour costs 2 extra waves.
  - **Web** refreshes at boot when the stored token has expired, which partly refutes S6 for web cold loads. Its
    401 bursts come from tabs left open past expiry and then refocused.
  - **iOS** avoids 401s but runs one serialized refresh on every foreground.
  - **Cost:** about 956 wasted round trips per day, plus about 600 refreshes/day for 14–17 weekly loggers, which
    also raises exposure to S1.
- **S7: can't be observed today.** The metrics can't isolate the stream. The code has no reconnect loops. Android
  and iOS reopen the stream on every foreground, and no surface closes it when the app goes to the background.
- **S1 / S9:** E7 shows both kinds of forced sign-out in the logs: the reuse race (S1) and 429s from the shared IP
  that the backend reports as 401. The 41-in-a-minute burst points to a client refresh storm we can't attribute.

## 6. Cross-surface divergences

| Aspect | Web | iOS | Android |
|---|---|---|---|
| When it refreshes | At boot if expired; after a 401 | Within 5 min of expiry; every foreground; after a 401 | After a 401 only |
| Signs out on a transient refresh failure | Yes | No on network errors; yes on 401/403 | Yes, any non-2xx |
| Request timeout | None | 60 s | 10 s |
| Summary fetch | 8 parallel | 8 sequential | 7 sequential |
| Device cache / error reporting | None / pageviews | None / none | None / none |
| Identifiable on the server | Browser User-Agent | CFNetwork User-Agent, with build number by default | `okhttp/4.12.0` only |

## 7. Industry-standard target (contract)

1. **A structured log line per request:** `request_id` (inbound `X-Request-Id`, echoed back), route template,
   status, `duration_ms`, member UUID, platform and version, country, error code. No usernames, emails, tokens or
   query strings. SQL logging off, or slow queries only.
2. **Event trails** for authentication (login, refresh, client sign-out with its reason and the Supabase error
   code), sync runs (trigger, counts, failures, duration, last success per member and platform), and push/invite
   (created → per-device send result → acknowledged).
3. **Client error reporting on every surface**, tagged with the same request id, member and version.
4. **SLO metrics:** availability, p50/p95 latency per route group, 401 and refresh-failure rates, time to first
   content per screen per country, with alerts.
5. **Explicit timeouts** everywhere, and **at least 30 days** of retention.

**Options (prices checked 2026-10-11):**

| Option | What it gives | Cost / constraint |
|---|---|---|
| Render **Pro** | Request logs, p50–p99 latency, 14-day retention | $25/month flat |
| Render **log streams** | Ship app logs to any TLS-syslog or HTTPS sink (Better Stack, Datadog, …) and get past the 7-day limit | Per-service overrides need Pro |
| Supabase **log drains** | Forward Supabase logs to Sentry, Datadog, Axiom, OTLP or HTTP | $60/month per drain + $0.20 per 1M events |
| **Sentry** | One tool for web, iOS, Android and Node | Free tier: 1 user, 5k errors/month, 30 days. Team: $26/month, 50k errors, 90 days |
| **Crashlytics** | Crash reporting | Free. Android has the Firebase BoM; iOS needs a new SDK; no web support, so two tools |
| Vercel Hobby (current) | Web Analytics: pageviews. Speed Insights: Real Experience Score only | Analytics: 50k events/month, 1-month window, no custom events. Speed Insights: 10k events per rolling 30 days, then a pause of at least 14 days |

## 8. Live-binary constraints

- **What's live:** iOS 1.4.2 (56), with 1.4.0–1.4.1 lingering; Android 1.0.0 (4), with some (3).
- **Impossible without a new release:** client error reporting, request-id and version headers, sign-out and sync
  reports, timing. iOS can force adoption through `min_ios_version` (`backend/server.js:58-63`). Android has no
  such gate.
- **Possible on the server now:** request logs with a server-generated id, platform from the User-Agent, refresh
  error codes, and a push trail.
- **Status codes matter to live binaries:**
  - Returning 5xx instead of 401 for a transient refresh failure would stop live **iOS** from signing users out
    (`ProgramContext+Auth.swift:105-115`).
  - Android 1.0.0 signs out on any non-2xx (`Network.kt:113`), so it can't be protected that way.
- **Token in the URL:** the SSE `?token=` (`NotificationsGate.tsx:154`; `backend/middleware/auth.js:64`) must be
  redacted from any request log.

## 9. Open questions

1. Render Pro at $25/month, or app-side structured logs plus a log stream?
2. One error tool for every surface (Sentry), or Crashlytics on mobile?
3. A Supabase log drain at $60/month, or keep polling the throttled logs API?
4. Can production stop logging SQL now, given the personal data in it?
5. Which client made 41 refreshes in one minute on Oct 6? The next read is distinct actors in `auth_audit_logs`.
   It's a W1 lead.
6. Outside W6: the `/api/analytics/*` routes check authentication but not program membership
   (`backend/routes/analytics.js:13`).
