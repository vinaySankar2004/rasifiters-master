# Phase 2 track A — scope brief (pipeline status: revised-once)

# SCOPE BRIEF: Reliability overhaul Phase 2, track A (observability, backend only)

- **Features**: no feature owns this yet, so track A needs a **new `observability`@0.1.0** feature (`specs/features/observability/SPEC.md`, written by the planner/question-asker). Its `consumed_by` is `[]` for now, because no client sends events until Phase 3. The existing features it touches:
  - `auth`@0.10.0 (`specs/features/auth/SPEC.md`), consumed_by [web, ios, android]. Track A touches it in two places: it adds an optional-auth middleware next to `authenticateToken`, and it resolves §10 **F16** (`exposedHeaders: ["Retry-After"]`).
  - `app-config`@0.1.0 (`specs/features/app-config/SPEC.md`), consumed_by [ios]. Track A only reads the headers. The version gate itself belongs to track C, and `/api/app-config` is not touched here.
- **Pages/screens**: none (backend only, no UI).
- **Files (exhaustive; the implementer may touch ONLY these), grouped by surface**:
  - **backend/, new files**
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/requestLog.js`: request id, plus one JSON line per request written on `finish`/`close`. Fields: request id, method, route template (`req.baseUrl + req.route.path`, or `"unmatched"`), status, `duration_ms`, `member_id` (from `req.user?.id`), platform, version. **Never** `originalUrl` or a query string, because the SSE `?token=` must not be logged. Never usernames, emails, bodies, the auth header or IPs.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/clientInfo.js`: parses `X-App-Platform` / `X-App-Version` (allow-list the platform, cap length, limit the charset). **Track C must import this, not copy it** (needed for `BLOCK_UNVERSIONED_ANDROID`).
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/rateLimit.js`: in-memory fixed-window limiter per IP, with a bounded Map. Fine because there is one Render instance. No new dependency.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/clientEvents.js`: `POST /`. Thin handler with its own `express.json({ limit })`, optional auth, the limiter, and a router-local error handler. That handler maps body-parser 413/400 to real status codes; the global `errorHandler` would turn them into 500.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/clientEventService.js`: validates and normalizes the batch (max events per batch, caps per field and per payload, safe charset for `type`/`name`, drops unknown fields). Stamps the time on the server. `member_id` comes ONLY from the verified token, never the body. Platform/version come from headers. One `bulkCreate`.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/models/AppEvent.js`: model for `tableName: "app_events"`, with no `schema` option. The service requires it directly, so `models/index.js` is NOT touched (the model has no associations).
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/007_app_events.sql`: new, idempotent and **schema-neutral** (no `public.`, per board §8, so track B can re-run it for `staging`). `member_id` FK → `members(id)` **must be `ON DELETE CASCADE` or `SET NULL`**: a plain FK would break account deletion (`utils/programMemberships.js` `cascadeMemberDeletion`). Indexes on `created_at` and `(member_id, created_at)`. The user runs this file.
  - **backend/, modified (shared ones flagged ⚠)**
    - ⚠ `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/server.js` (**SHARED with B and C**). Five edits:
      - Add `app.set("trust proxy", …)`. Nothing reads `req.ip`/`protocol`/`hostname` today, so this is safe; Phase 3 R1 needs it too.
      - Mount `requestLog` **first, before `cors`**. Otherwise preflights end inside cors and are never logged.
      - Add `maxAge: 7200` and `exposedHeaders: ["Retry-After", "X-Request-Id"]` to the CORS options at L31-39.
      - Mount `/api/client-events` **before** the global `app.use(express.json())` at L45, so its own size cap applies.
      - B edits the same CORS origin list (staging alias). C edits the app-config route at L58-63 and adds the unversioned-Android middleware.
    - ⚠ `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/config/database.js` (**possibly shared with B**): change L13 from `logging: true` to `logging: process.env.DB_LOG_SQL === "true" ? console.log : false`. This is off by default. Don't key it on `NODE_ENV`, which isn't set in `render.yaml`.
    - ⚠ `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/auth.js` (owned by auth; possibly shared with B's login-change guard): add an `optionalAuthenticate` export that reuses `resolveReqUser` (L13-33). Any failure, including infra failures, continues signed-out and never returns 401/503. Additive.
    - ⚠ `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/.env.example` (**shared with B and C**): document `DB_LOG_SQL`.
    - ⚠ `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/sql/README.md` (**shared with B**): add the 007 row.
    - ⚠ `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/CONTEXT.md` (**shared with B**): update the "Runtime + observability" section (SQL logging off, request log, `app_events`).
  - **docs, all ⚠ shared**
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/observability/SPEC.md` (new).
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json` + `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md`: new entry. C bumps app-config here too.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/auth/SPEC.md`: mark F16 resolved plus a changelog entry. B likely adds the login-change-guard D-rule, so the version numbers can collide.
    - `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/ENV_RUNBOOK.md` §3: add `DB_LOG_SQL`. B edits this file too.
  - **web/, ios/, android/**: none. Confirmed: no client sends `X-App-*`, `X-Request-Id` or client-events today.
- **DB surface**: migration needed. `apps/backend/sql/007_app_events.sql` creates the new `app_events` table, run by the user and going straight to prod. No other tables are touched. Requests only insert into `app_events`.
- **Flags/env/config involved**:
  - New env `DB_LOG_SQL` (unset = off). No `render.yaml` change; B owns that file.
  - New inbound headers: `X-Request-Id`, `X-App-Platform`, `X-App-Version`. `cors` already reflects request headers, so no `allowedHeaders` change is needed.
  - New response headers: `X-Request-Id`, exposed together with `Retry-After`.
  - CORS `maxAge` 7200 (Chrome caps preflight caching at 2 h).
  - No new npm dependency, so `package.json`/lockfile are untouched (`crypto.randomUUID` is built in; Node ≥18).
- **Blast radius**:
  - The request logger wraps every route of every feature, and the CORS change reaches every web call. Both are additive response headers only.
  - Shared web-facing features this reaches: auth, members, programs, program-memberships, notifications (watch the long-lived SSE `/stream`: log on `close`, header set before `flushHeaders`), invites, program-workouts, workout-logs, daily-health-logs, analytics, analytics-v2, member-analytics. `workouts` and `app-config` are iOS-only.
  - No feature `depends_on` observability, so nothing needs a new version.
  - No client parity work in this phase. Surfaces in parity later (Phase 3 senders): [web, ios, android].
- **Live-binary compat**: none expected. Every change is additive:
  - Extra response headers. Adding a header doesn't change the ETag, so iOS URLCache 304s are unaffected.
  - A new endpoint that no live binary calls.
  - SQL logging off is invisible to clients.
  - Every response code and body for live iOS 1.4.0–1.4.2 and Android 1.0.0 (3)/(4) stays the same.
  - Order: the user runs 007 **before** the backend deploy, otherwise `POST /client-events` returns 500. Nothing calls it yet, but smoke tests would.
- **Doc↔code mismatches found**:
  1. `ENV_RUNBOOK.md` §3 says `CORS_ALLOWED_ORIGINS` is "Externalized to env … Set on Render (live)". The code hard-codes the origins (`server.js:31-39`), and no `.js`, `render.yaml` or `.env.example` reads or declares it. This matters for track B's staging origin.
  2. `apps/backend/sql/README.md` lists only 001–004; 005 and 006 exist.
  3. `app-config` SPEC §3 cites `server.js:47-62`; the route is at L58-63.
  4. W6 brief cites `middleware/auth.js:51-53` for silent 401s. Since H1 that code is L65-88, and infra failures now log `[auth] token verification unavailable`.
  5. Board §8 requires schema-neutral new migrations, but 005/006 use `public.`. 007 must follow the new rule, not the existing files.
  6. Board §7.1 puts **country** and **error code** in the log line; the task's build list leaves both out (open question 2).
- **Out of scope (explicitly)**:
  - Client event senders, the `X-App-*` / `X-Request-Id` request headers on clients, and the Android `HttpLoggingInterceptor` (Phase 3).
  - The version gate, `app-config` fields and `BLOCK_UNVERSIONED_ANDROID` (track C).
  - Staging schema, role, service and CORS origin (track B).
  - `push_deliveries` (Phase 3 R3).
  - Writing server-side auth events (refresh failure + Supabase code) into `app_events` (Phase 3 R1).
  - The `tools/` query pack (board §7.4).
  - Process `unhandledRejection` handlers.
  - Changing the global `errorHandler` to keep body-parser 4xx codes. That would be a deliberate behavior change; today malformed JSON returns 500.
  - Paid sinks, log drains and Sentry.
- **Open questions for the orchestrator**:
  1. **Retention**: board §7.2 approved 90 days via nightly `pg_cron`, but the task omits it. Is `pg_cron` enabled on the project? Check read-only with `select * from pg_extension where extname='pg_cron'`. If yes, add a named `cron.schedule('app_events_retention', …)` (idempotent by name) to 007 or a separate file; otherwise defer.
  2. **Country / error code**: should the log line include `cf-ipcountry` when present (Render may not forward it; check after deploy), and an error `code` taken from `errorHandler` / the 503 auth path? Recommendation: country yes (one line, harmless if absent); error code no (needs edits in every catch).
  3. **`trust proxy` hop count** behind Cloudflare → Render. The wrong value lets clients spoof the per-IP limit, or makes every client share one bucket. The planner should pick a value and verify it after deploy without logging IPs (for example, log only the XFF entry count once).
  4. **RLS on `app_events`**: a new `public` table gets Supabase's default anon/authenticated grants, so PostgREST would expose it. Check the live RLS state of existing tables (`get_advisors`) and decide whether to `ENABLE ROW LEVEL SECURITY` (the backend connects as owner `postgres` and bypasses RLS). Coordinate with track B: its non-owner `rasifiters_staging` role would be blocked by RLS.
  5. **Shared-file sequencing**: `server.js` CORS block (A + B), `server.js` middleware/route area (A + C), `config/database.js`, `.env.example`, `sql/README.md`, `CONTEXT.md`, `ENV_RUNBOOK.md`, `registry.json`, auth SPEC.
     - Recommendation: land A first, or have B add its origin only after A merges.
     - Track C codes against `utils/clientInfo.js`'s signature.
     - **Migration numbers:** A = 007, B = 008+.
     - **auth version:** A's F16 fix vs B's guard; decide who bumps, e.g. A → 0.10.1 PATCH and B → 0.11.0.
  6. Should the logger derive a coarse platform from the User-Agent (CFNetwork → ios, okhttp → android, Mozilla → web) when `X-App-Platform` is missing? Live binaries send no headers, so without it today's logs show no platform. Recommendation: yes, logged as `platform_hint`.
  7. Should Render health checks (`GET /` and `HEAD /`) be excluded from the log? Recommendation: yes (noise). Keep logging `OPTIONS`, so the `maxAge` effect can be measured.
  8. Should `observability` show `consumed_by: []` now (`status: deployed`, backend only) and change to [web, ios, android] in Phase 3? Recommendation: yes.
