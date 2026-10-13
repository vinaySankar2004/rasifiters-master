# Feature: `observability` — request log, client identity headers, event trail

> **Status:** 🚀 deployed (backend, live on Render 2026-10-12; reliability-overhaul Phase 2 track A) · **Version:** 0.2.1 · **Apps (`consumed_by`):** none yet — `[]` until Phase 3 adds the web / iOS / Android senders
> **Provenance:** **NET-NEW** — no legacy equivalent (the legacy backend logged SQL only). Contract:
> [`DESIGN_BOARD.md`](../../initiatives/reliability-overhaul/DESIGN_BOARD.md) §7 (W6, "observability is free" ✅);
> evidence: [`discovery/W6`](../../initiatives/reliability-overhaul/discovery/W6-observability-perf.md).
> **Depends on:** [`auth`](../auth/SPEC.md) (`optionalAuthenticate`, auth D-C12).
> **Header contract — OWNED HERE (§4.1):** `X-App-Platform`, `X-App-Version`, `X-App-Build` and `X-Request-Id` —
> names, meanings, formats, and how they are parsed, logged and stored. [`app-config`](../app-config/SPEC.md)'s
> version gate reads only whether `X-App-Version` is present (its D-C5/D-C6) and imports nothing from here.

---

## 1. What it is

Free, in-house observability for the API (board principle 5 — no paid vendor; Render's app log + our own
Postgres are the sinks):

1. **Structured request log** — one JSON line per request on stdout (§3.1).
2. **Request ids** — a well-formed inbound `X-Request-Id` is kept, otherwise generated; echoed on every response
   except the Render health check (`GET`/`HEAD /`).
3. **Client identity** — the §4.1 headers parsed once (`utils/clientInfo.js`) and logged, plus a coarse
   User-Agent `platform_hint` for live binaries that send no headers. Read + log only.
4. **Event trail** — the `app_events` table + `POST /api/client-events` (works signed-out, size-capped,
   rate-limited per client, per-client + global daily event caps, idempotent retries), 90-day retention (§3.2, §5).
5. **SQL query logging off** by default (§6); the global `errorHandler` never prints a request body (D-C10) and answers a malformed / oversized / mis-encoded body with its 4xx in the frontend-kit vocabulary on every route; one log helper for caught errors, `logError` (D-C11).
6. **CORS preflight cache** (2 h) + `Retry-After` / `X-Request-Id` exposed to the web app.

## 2. Why it exists

Phase 0 (W6) found we could not see requests, refresh-failure reasons, client errors, sync runs or push
outcomes: the only app log was Sequelize SQL (~16k lines/day carrying usernames, emails and push tokens as
literals), Render's plan keeps no request log or latency metric, and every client swallows its errors. The user
chose free observability (W6-D1; board §7) over Render Pro, Sentry and Supabase log drains.

## 3. Functionality

### 3.1 The request log (`middleware/requestLog.js`)

Mounted **first** in `server.js` (before `cors`, so preflights — and app-config's version-gate 426s — are
logged). Writes ONE line per request when the response finishes, or when the connection closes first:

```json
{"type":"request","request_id":"3f0c…","method":"GET","route":"/api/members/:id","status":200,"duration_ms":41,"member_id":"8c1e…","platform":"android","version":"1.1.0","build":6,"platform_hint":"android","country":"KE","xff_n":1,"aborted":false}
```

| Field | Source |
|---|---|
| `type` | always `"request"` — the search key in Render's log explorer |
| `request_id` | inbound `X-Request-Id` when it matches `^[A-Za-z0-9._:-]{8,64}$`, else `crypto.randomUUID()`; also `req.id` and the `X-Request-Id` response header (set before any handler, so the SSE stream carries it) |
| `method` | HTTP method |
| `route` | route **template** `req.baseUrl + req.route.path` (`/api/members/:id`; a router's `/` collapses to its mount path); `"unmatched"` when no route ran (404, CORS preflight, app-config's 426, a body-parse failure in the global parser) |
| `status` | `res.statusCode`; **499** when the connection closed while no response had been started (e.g. the client gave up during a slow handler). An upload aborted mid-body logs the parser's `400` with `aborted: true` (the router answers the dead socket before the close event) |
| `duration_ms` | integer ms, first middleware → finish/close (SSE stream: the stream's lifetime) |
| `member_id` | `req.user.id` when a verifier succeeded, else `null` |
| `platform` / `version` / `build` | `X-App-Platform` / `X-App-Version` / `X-App-Build` via `getClientInfo` (§4.1), else `null` |
| `platform_hint` | User-Agent: `okhttp` → `android`, `CFNetwork`/`Darwin` → `ios`, `Mozilla/…` → `web`, else `null` |
| `country` | `CF-IPCountry` when 2 chars `[A-Z0-9]`, else `null` |
| `xff_n` | the NUMBER of `X-Forwarded-For` entries (never the addresses) — verifies the proxy hop count (D-C7) |
| `aborted` | `true` when the connection closed before the response finished (normal for `/api/notifications/stream`) |

**Never logged:** the URL or query string (the SSE `?token=`), any other header, request/response bodies,
usernames, emails, IP addresses, tokens. **Skipped:** `GET /` and `HEAD /` (Render health checks).

### 3.2 `POST /api/client-events`

| # | Route | Handler | Auth | Purpose |
|---|-------|---------|------|---------|
| 1 | `POST /api/client-events` | `routes/clientEvents.js` → `services/clientEventService.recordClientEvents` | **optional** (`optionalAuthenticate`) | Store a batch of client events in `app_events`. |

Middleware order: per-client limiter → router-local `express.json({ limit: "64kb" })` (mounted before the
global parser) → `optionalAuthenticate` → handler. Mounted ahead of app-config's version gate on purpose
(telemetry must arrive even from a build the gate blocks; the gate's `UNGATED_ROUTES` also exempts it).

**Request** — `Content-Type: application/json`; optional `Authorization: Bearer <access token>` and the §4.1
headers. Body:

```json
{ "events": [ { "id": "0b6f2c1e-6a51-4c39-9d8e-3f1a2b4c5d6e", "type": "auth.forced_sign_out",
                "occurred_at": "2026-10-12T18:04:05.000Z", "request_id": "6b0d…",
                "props": { "reason": "refresh_session_invalid" } } ] }
```

| Status | Body | When |
|---|---|---|
| `202` | `{ "accepted": N, "dropped": M }` | well-formed batch; invalid events dropped + counted; a replayed event `id` is acknowledged, not stored twice |
| `400` | `{ "error": "events must be an array of 1-25 items.", "code": "invalid_batch" }` | `events` missing / not an array / empty / > 25 (incl. a non-JSON `Content-Type`, which is not parsed) |
| `400` · `415` | `{ "error": "Invalid request body.", "code": "invalid_body" }` | malformed JSON, well-formed JSON that is not an object or array (`null`, a string, a number, `true` — the parser's strict mode), or a corrupt gzip/deflate body (400); unsupported charset or `Content-Encoding` (415). A top-level JSON array parses and gets `invalid_batch` |
| `413` | `{ "error": "Payload too large.", "code": "payload_too_large" }` | body > 64 kb |
| `429` | `{ "error": "Too many requests. Try again later.", "code": "rate_limited" }` + `Retry-After` | > 30 requests / 60 s from one client (IPv4 address / IPv6 /64); or > 1,000 stored events / 24 h from one client; or the global daily event budget is spent (daily caps: `Retry-After` up to 86,400 s) |
| `500` | `{ "error": "Failed to record events." }` | insert failed (logged `[client-events] insert failed: <name> <pg code>`) |

**Never 401 / 503:** a missing, bad or expired token, or an auth outage, stores the events with `member_id = null`.

## 4. Feature list (behaviors)

### 4.1 The client identity header contract (owned here)

| Header | Direction | Meaning | Accepted format (else parsed as `null`) |
|---|---|---|---|
| `X-App-Platform` | request | the client platform | `ios` · `android` · `web` (trimmed, case-insensitive) |
| `X-App-Version` | request | the marketing version (iOS `CFBundleShortVersionString`, Android `versionName`) | ≤ 32 chars of `[0-9A-Za-z .+_()-]` (trimmed) |
| `X-App-Build` | request | the build number (iOS `CFBundleVersion`, Android `versionCode`) — tells builds apart when the marketing version doesn't change (Android `versionName` stayed `1.0.0` across codes 3/4/5) | 1–9 digits (trimmed) → integer |
| `X-Request-Id` | request + response | per-request correlation id; the server keeps a well-formed inbound id, else generates a UUID, and echoes it | 8–64 chars of `[A-Za-z0-9._:-]` |

All four are optional; a malformed value never rejects a request (it is logged/stored as `null`). Header names are
case-insensitive (HTTP). Approved 2026-10-12 (incl. `X-App-Build`). Consumers: this feature (parse, log, store)
and app-config's D-C5 gate (presence of `X-App-Version` only).

- **`getClientInfo(req)`** (`utils/clientInfo.js`) → `{ platform, version, build, platformHint }` per §4.1;
  `platformHint` per §3.1. Also exports `parsePlatform`, `parseVersion`, `parseBuild`, `parseRequestId`,
  `platformFromUserAgent`. **The single parser for logs + storage** — never copy it.
- **Event normalization** (`clientEventService`), per event:
  - not a plain object, or `type` not matching `^[a-z][a-z0-9_]*(\.[a-z0-9_]+){0,3}$` (≤ 64 chars) → **dropped**;
  - `id`: a UUID → used as the row id (lower-cased) so a retried batch stores each event once (`INSERT … ON
    CONFLICT DO NOTHING`); otherwise the server generates one;
  - `occurred_at`: ISO string within [now − 7 days, now + 5 min] → kept, else `null`;
  - `request_id`: `parseRequestId` (the id of the request the event is about), else `null`;
  - `props`: a plain object (else `{}`); top-level keys matching `/token|password|secret|authorization|cookie|email/i`
    and `__proto__` are removed; props that can't be serialized or that jsonb can't store (`\u0000`, a lone
    surrogate) become `{ "props_invalid": true }`; props over 2,048 UTF-8 bytes become `{ "props_too_large": true }`;
  - unknown event fields are ignored.
  Server-set on every row: `created_at` (server clock), `source = "client"`, `member_id` (**only** the verified
  token's member — never the body), `platform` (`X-App-Platform`, else the UA hint), `app_version`, `app_build`.
  One `bulkCreate` per batch.
- **Per-client request limiter** (`utils/rateLimit.js`): fixed 60 s window, 30 requests per `clientKey(req.ip)`
  (IPv4 as-is; IPv6 by /64), before any body parsing; process memory (one Render instance; a deploy resets it);
  key map bounded at 10,000 — when full and nothing has expired, new keys get 429 (fail closed).
- **Per-client daily event cap** (`clientEventService`): ≤ 1,000 stored events per 24 h per `clientKey(req.ip)`
  (cost = events in the batch), checked **before** the global budget — one client (e.g. a buggy sender loop) can
  no longer spend the global budget for everyone; it alone is refused for the rest of its window. Its key map is
  bounded at 10,000 clients and refuses new keys when full (§10 F3).
- **Global daily event budget** (`clientEventService`): ≤ 10,000 stored events per 24 h window across all clients
  (bounds storage at ~10k rows/day even under a distributed flood — at least 10 clients' worth); over it → 429 +
  `Retry-After` until the window resets. Raising either cap is a one-constant PATCH.
- **Daily-cap refunds** (`refund(key, cost)` on the `utils/rateLimit.js` limiter; never below 0): a batch the
  global budget refuses gives the client its per-client charge back (a client never pays for a global rejection);
  an insert that fails (the `500`) gives **both** daily budgets their charge back, so the client's retry is not
  charged twice. The per-minute request limiter never refunds — every request counts, whatever its outcome.
- **`clientKey(ip)`**: an IPv4 address as-is; an IPv4-mapped IPv6 address (`::ffff:…`) as-is; any other IPv6
  address → its `/64`; anything that is not an IP literal → the shared key `"unknown"`.
- **Router-local body-parser error handler** keeps the real 413 / 400 / 415 for every parser 4xx of the 64 kb parser,
  including decompression errors that carry no `err.type`. Since 0.2.0 the global `errorHandler` answers every other
  route's body-parser failures the same way (D-C11).
- **Global `errorHandler`** (`middleware/errorHandler.js`, 0.2.0): `AppError` → `{ error, code? }` + `Retry-After` when
  set; body-parser 4xx → `400`/`415 { error: "Invalid request body.", code: "invalid_body" }` or `413 { error: "Payload
  too large.", code: "payload_too_large" }`, logged `Rejected request body: <type or name> <status>`; anything else →
  `500 { error: "Internal server error." }`, logged via `logError("Unhandled error:", err)`.
- **`logError(tag, err)`** (`utils/logError.js`, 0.2.0 — kept beside `utils/response.js` in auth's reference_impl, so
  no feature-graph cycle) — the ONE log line for a caught error: `<tag> <name> code=<code> status=<status> <message ≤
  200 chars, line breaks flattened> [<first two stack frames>]`; a `Sequelize*` error prints only `<tag> <name>
  code=<Postgres code>`. Never the error object, `err.sql`, `err.parameters` or `err.body`. New code logs through it
  (R2/R3 adopt it after the merge — follow-up).

## 5. Data / schema

**`app_events`** — `apps/backend/sql/007_app_events.sql` (user-run; the first **schema-neutral** migration,
DESIGN_BOARD §8). Model `models/AppEvent.js` (no associations → not registered in `models/index.js`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | client-supplied event UUID (idempotency) or `gen_random_uuid()` / Sequelize UUIDV4 |
| `created_at` | `timestamptz NOT NULL` | server receive time — the retention + query axis |
| `occurred_at` | `timestamptz` | client-reported time, clamped (§4) |
| `source` | `varchar(16) NOT NULL` | `'client'` (this endpoint) · `'server'` (reserved — no server-side writer yet, D-C9); CHECK |
| `type` | `varchar(64) NOT NULL` | dotted event name, e.g. `auth.forced_sign_out` |
| `member_id` | `uuid` | FK → `members(id)` **ON DELETE CASCADE** |
| `platform` | `varchar(16)` | `ios` / `android` / `web` / `null` |
| `app_version` | `varchar(32)` | `X-App-Version` |
| `app_build` | `integer` | `X-App-Build` (Android `versionCode` / iOS `CFBundleVersion`) |
| `request_id` | `varchar(64)` | the request the event is about |
| `props` | `jsonb NOT NULL DEFAULT '{}'` | event details (≤ 2 KB) |

Indexes: `idx_app_events_created_at (created_at)`, `idx_app_events_member_id_created_at (member_id, created_at)`.
**RLS** enabled on the `public` copy only, no policies — the posture of the project's other 14 tables. A
`staging` copy stays RLS-free so the staging role can write it. **Retention:** `pg_cron` job
`app_events_retention_<schema>`, daily 04:17 UTC, `DELETE … WHERE created_at < now() - interval '90 days'`
(PART 2 of `007`; if enabling `pg_cron` from SQL fails on permissions, enable Cron in the Supabase dashboard and
re-run the file). Staging runs of `007` go over the session pooler / a direct connection (port 5432) only.

## 6. Flags / env / ops

- **`DB_LOG_SQL`** — `"true"` re-enables Sequelize SQL logging (`console.log`); unset / anything else = off (prod).
  Local debugging only. Not keyed on `NODE_ENV` (unset on Render); not in `render.yaml`.
- **`trust proxy` = 2** (`server.js`, 0.1.1) — two proxy hops (Cloudflare edge → Render load balancer), so
  `req.ip` (the limiter key) is the address Cloudflare saw. Measured on prod 2026-10-12 from `xff_n` (D-C7).
- **CORS** (`server.js`): `maxAge: 7200`, `exposedHeaders: ["Retry-After", "X-Request-Id"]`; the origin list stays
  hard-coded; request headers stay reflected (no `allowedHeaders` pin, so the §4.1 headers need no CORS change).
- **Finding a request:** Render log explorer, text `"request_id":"<id>"` (or `"route":"/api/…"`). Request lines
  live 7 days (Render plan); `app_events` rows live 90 days.
- No new npm dependency (`crypto.randomUUID` and `net` are built in).

## 7. Dependencies + rollout

- **Upstream:** `auth` (`optionalAuthenticate` → `resolveReqUser`); `members` (FK target). app-config's gate reads
  the §4.1 `X-App-Version` presence (documentation only — no code import either way).
- **Downstream:** Phase 3 web / iOS / Android senders (`consumed_by` grows then); server-side auth events are deferred (D-C9); R3 adds `push_deliveries` (own table).
- **Order:** the user runs `sql/007` **before** the backend deploy (otherwise `POST /api/client-events` → 500).
- **Live binaries** (iOS 1.4.0–1.4.2, Android 1.0.0 (3)/(4)): additive only — new response headers, a new route no
  binary calls, SQL logging invisible; every existing status and body is unchanged.

## 8. Contract for the Phase 3 senders (web / iOS / Android — not built yet)

- Send the §4.1 headers (`X-App-Platform`, `X-App-Version`, `X-App-Build`) on every API call — Android on **every**
  OkHttp client (app-config's D-C5 gate keys on `X-App-Version` presence) — and a fresh UUID `X-Request-Id` per
  request.
- To reference a request in a `client.error` event's `request_id`, quote the **response's** `X-Request-Id` when
  present, else the one you sent (an edge proxy may rewrite the inbound id). **Exception — a cache hit:** a
  response served from the client's HTTP cache (e.g. app-config's `Cache-Control: max-age=300`) carries the id of
  the request that filled the cache, not this one, so quote the `X-Request-Id` you sent.
- Give every event a client-generated UUID `id` when it is queued, and keep it across retries (duplicates are
  stored once).
- Queue events locally; the queue **survives sign-out**; POST batches of **≤ 25** events with the current Bearer
  when one exists (none is fine). Keep each event's `props` ≤ 2 KB of UTF-8 JSON.
- On 429 wait `Retry-After`. On 413 split the batch in half and retry (drop a single event that still 413s).
  On 400 drop the batch (it will never succeed). On 5xx / network error retry with backoff.
- `props` never carries tokens, emails, usernames or free text the user typed.
- Web sends `fetch` with `application/json` (a `text/plain` `sendBeacon` body is not parsed).
- **Registered event types — `auth.*`** (Phase 3 R1; `sync.*` is in §8.1; further families, e.g. `client.error`, are registered by the tracks that add them):

  | `type` | When | `props` (all optional unless marked) |
  |---|---|---|
  | `auth.forced_sign_out` | the client ended the session without the user asking | `reason` (**required**): `refresh_session_invalid` (`/auth/refresh` → `401 session_invalid` — incl. a password change / sign-out-everywhere on another device, or the 90-day inactivity limit) · `token_store_unreadable` (the device's token store is unreadable or corrupt); `status` (int, HTTP status when there was one); `code` (the server `code`, e.g. `session_invalid`) |
  | `auth.sign_in_failed` | a sign-in attempt failed for any reason other than the user cancelling | `method` (**required**): `password` · `google` · `apple`; `kind` (**required**): `wrong_credentials` (401 on a public sign-in route) · `invalid_input` (400/422) · `conflict` (409) · `unavailable` (429/503) · `offline` · `timeout` · `server` (other 5xx) · `provider` (the native provider SDK failed before any API call) · `unknown`; `status` (int); `code` (server `code` or the provider SDK's error code, ≤ 64 chars) |
  | `auth.refresh_failed` | `/auth/refresh` failed and the session was KEPT (503 / 429 / 5xx / timeout / offline) | `kind` (**required**, same values as above); `status` (int); `code` |

  The backend needs no change for these (auth 0.13.0 / Phase 3 R1): `POST /api/client-events` already accepts them signed-out.

### 8.1 Registered event types — `sync.*` (Phase 3 R2)

| `type` | Sender | `props` (no ids, names, emails or free text) |
|---|---|---|
| `sync.run` | iOS + Android health sync — one per run ([`health-sync`](../health-sync/SPEC.md) §8 rule 10) | `integration` (`healthkit` · `health_connect`, required) · `trigger` (`launch` · `foreground` · `pull_to_refresh` · `program_entry` · `background` · `connect` · `manual`) · `outcome` (`success` = every item final, nothing held · `partial` = a (program, kind) was held for the admin lock or a later batch failed · `failed` = nothing uploaded · `skipped` = nothing to sync) · `duration_ms` (integer) · `catch_up_days` (integer — the widest window read) · `batches` (integer) · `error_class` (`null`, a frontend-kit kind — `offline` · `timeout` · `signedOut` · `unavailable` · `server` · `invalidInput` · `updateRequired` · `unknown` — or `health_read_failed` · `permission_missing`) · `workout` / `sleep` / `steps` = `{ sent, applied, unchanged, duplicate, skipped, removed, invalid }` (integers; `applied` = `created` + `updated`, `skipped` = every `skipped_*`; omit a kind that didn't sync) · `legacy_recorded` (integer, upgrade runs only) |

```json
{ "id": "0b6f2c1e-6a51-4c39-9d8e-3f1a2b4c5d6e", "type": "sync.run", "occurred_at": "2026-10-12T18:04:05.000Z",
  "props": { "integration": "healthkit", "trigger": "foreground", "outcome": "success", "duration_ms": 1840,
             "catch_up_days": 2, "batches": 1, "error_class": null,
             "workout": { "sent": 3, "applied": 1, "duplicate": 2 },
             "sleep": { "sent": 3, "applied": 1, "unchanged": 2 }, "steps": { "sent": 3, "unchanged": 3 } } }
```

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Structured request log** — one JSON line per request (fields §3.1), written once on `finish` or `close`; route template, never the URL/query (the SSE `?token=`); 499 when the connection closed before any response was started; health checks skipped, preflights logged (mounted before `cors`, above app-config). Request id: inbound `X-Request-Id` kept when well-formed, else a UUID; `req.id`; echoed. `country` included (`null` if Render's edge doesn't forward `CF-IPCountry`). Sink: stdout → Render app log. | DESIGN_BOARD §7.1; W6 §7.1; `middleware/requestLog.js`. |
| **D-C2** | **SQL logging off ✅** — `logging: process.env.DB_LOG_SQL === "true" ? console.log : false`. Opt-in env, not `NODE_ENV` (unset on Render). | DESIGN_BOARD §7.1; W6 §1 (PII in SQL logs); `config/database.js`. |
| **D-C3** | **This feature owns the client identity header contract (§4.1) and its one parser** — `utils/clientInfo.js` parses `X-App-Platform` (allow-listed), `X-App-Version` (charset-limited), `X-App-Build` (integer), the request id, and a UA `platformHint` (live binaries send no headers). Read + log + store only — nothing here gates. app-config's gate checks `X-App-Version` presence itself (its D-C5/D-C6) and imports nothing from here. | DESIGN_BOARD §1 + §7.1; contract ownership + `X-App-Build` approved by the user 2026-10-12; app-config D-C6; W6 §8. |
| **D-C4** | **`POST /api/client-events`** — optional auth (`optionalAuthenticate`, auth D-C12; never 401/503); per-client request limiter 30/60 s keyed by IPv4 address or IPv6 /64; **per-client daily event cap 1,000** (so one client can't spend the shared budget); global daily event budget 10,000 (storage bound — a per-minute global request cap would not bound storage); router-local 64 kb parser mounted before the global one and ahead of the version gate; ≤ 25 events, props ≤ 2 KB so a full batch fits the 64 kb cap; client event `id` → `ON CONFLICT DO NOTHING` (idempotent retries); jsonb-unsafe props replaced, never failing the batch; `member_id` only from the token; `202 {accepted, dropped}`; every body-parser 4xx kept by a router-local handler (no `err.type` test — decompression errors carry none). | DESIGN_BOARD §7.2 ("with or without a login, size-capped, rate-limited per IP"); CLAUDE.md (idempotent writes where retries exist); plan verdict advisories 2 + 5; `routes/clientEvents.js`; `services/clientEventService.js`; `utils/rateLimit.js`. |
| **D-C5** | **`app_events` table** (§5) — uuid PK; `source` column now so Phase 3 R1 needs no migration; `app_build` so Android builds are distinguishable (`versionName` stayed `1.0.0` across codes 3/4/5); FK `ON DELETE CASCADE` (account deletion must not fail, and removes the member's trail — same as `member_push_tokens`); RLS on `public` only (matches every other public table; keeps the staging copy writable); schema-neutral migration `007`. | DESIGN_BOARD §7.2 + §8; Supabase security advisor (2026-10-12: 14/14 public tables RLS-on, no policies); `utils/programMemberships.js` `cascadeMemberDeletion`; RELEASES.md. |
| **D-C6** | **90-day retention via `pg_cron`** — `007` PART 2 enables `pg_cron` (not enabled on the project as of 2026-10-12; enabling it approved by the user 2026-10-12) and schedules `app_events_retention_<schema>` daily 04:17 UTC; re-running updates the job by name. | DESIGN_BOARD §7.2; user approval at the plan gate. |
| **D-C7** | **`trust proxy` = 2 hops** (0.1.1; was 1 in 0.1.0) — needed for the per-client limiters (and Phase 3 R1's forwarded user IP); nothing else reads `req.ip` / `protocol` / `hostname` / `secure`. Too low → all clients share one bucket; too high → spoofable. **Measured on prod 2026-10-12:** a curl with no `X-Forwarded-For` logs `xff_n: 2` (Cloudflare edge + Render LB), one with a spoofed entry `xff_n: 3` (the edge passes client XFF through and appends) → hop count 2. Re-measure after any infra change. | DESIGN_BOARD §2 backend contract 3; `server.js`. |
| **D-C8** | **CORS preflight cache + exposed headers** — `maxAge: 7200` (Chrome caps at 2 h; repeat web opens skip the preflight); `exposedHeaders: ["Retry-After", "X-Request-Id"]` (**resolves auth F16**). Request headers stay reflected by `cors` (no `allowedHeaders` list, so the §4.1 headers need no change); the origin list stays hard-coded. | DESIGN_BOARD §7.5; auth SPEC §10 F16; `server.js`. |
| **D-C9** | **Deferred:** an error `code` in the log line (needs every catch on the kit vocabulary); the `tools/` query pack (§7.4); process `unhandledRejection` handlers; client senders (the Phase 3 client release — §8 is their contract); `push_deliveries` (R3). **Server-side auth events (`source = 'server'`): not built** — decided in Phase 3 R1 (auth 0.13.0): forced sign-outs, sign-in failures and kept-session refresh failures are client-reported (§8), and the server's own `[refresh] session_invalid\|auth_unavailable`, `[login] auth_unavailable`, `[logout:*]` and `[password]` log lines cover the server side for 7 days; revisit only if those prove insufficient. Done in 0.2.0: malformed JSON → 4xx on every route (D-C11). | Phase 2 track A scope (BRIEF §7). |
| **D-C10** | **The global `errorHandler` never prints a request body (log-only).** Body-parser errors (a string `err.type` with a numeric `err.status`) carry the raw body in `err.body` — a malformed-JSON login put its password in the Render log. Those, and any other error carrying a `body`, are logged as `Unhandled error: <type or name> <status>`; every other error is still logged in full. Every status and response body is unchanged. Resolves F7. Since 0.2.0 (D-C11) body-parser errors answer their 4xx and log `Rejected request body: <type or name> <status>`; every other error is logged via `logError` (no longer "in full"). | Plan F7 / O1; user amendment 2026-10-12; `middleware/errorHandler.js`. |
| **D-C11** | **Deliberate change (0.2.0) — body-parser failures keep their 4xx on every route + one log helper (resolves F2; F8 for the adopting files; reliability-overhaul Phase 3 R1).** (a) The global `errorHandler` answers an `express.json()` failure — a 4xx `status` with a string `type` or http-errors' `expose` (decompression errors carry no `type`) — with `413 { error: "Payload too large.", code: "payload_too_large" }` or `<status> { error: "Invalid request body.", code: "invalid_body" }` (400 malformed / non-object JSON / corrupt gzip-deflate, 415 unsupported charset or encoding) instead of `500`; the mapping `routes/clientEvents.js` has used since 0.1.0. (b) An `AppError` reaching the global handler also echoes its `code` and sets `Retry-After` when `retryAfter` is set (additive). (c) `utils/logError.js` `logError(tag, err)`: `<tag> <name> code=<code> status=<status> <message ≤ 200 chars> [<first two stack frames>]` (line breaks in the message become spaces, so one error is always one log line — plan-verdict #7; frames are code locations; the stack header is skipped whole); `Sequelize*` errors print `<tag> <name> code=<Postgres code>` only; never the error object, `err.sql`, `err.parameters` or `err.body`. Adopted by the global handler's 500 path and every `/api/auth` catch (auth D-C15); other routes adopt it as Phase 3 tracks touch them — the signature is fixed. Lives beside `utils/response.js` under auth's reference_impl (every feature already depends on auth — no graph cycle). Live binaries: no client sends malformed JSON; a > 100 kb body was 500 and is now 413 (none observed — 2 × 500 in 30 days). MINOR (status change on an error path of every route). | Phase 3 R1 brief (F2, F8) + verdict #7; frontend-kit §4; `middleware/errorHandler.js`; `utils/logError.js`; `routes/clientEvents.js`. |
| **D-REF** | **NET-NEW**, no legacy reference. `consumed_by = []` until the Phase 3 senders; `depends_on = [auth]` (imports `optionalAuthenticate`). | — |

## 10. Flagged characteristics

| ID | Characteristic | Where | Follow-up? |
|----|----------------|-------|-----------|
| **F1** | A route that hands an error to `next(err)` (e.g. analytics `requireProgramAccess` on a non-UUID id) is logged without its mount prefix — Express resets `req.baseUrl` as the error leaves the router. | `middleware/requestLog.js` `routeTemplate` | Accepted (rare 500 path). |
| **F2** | ~~Malformed JSON on every OTHER route still answers 500 via the global `errorHandler` (pre-existing; its log line no longer carries the body — D-C10).~~ | `middleware/errorHandler.js` | **Resolved 0.2.0 (D-C11).** |
| **F3** | Limits are per-process memory; a deploy resets them. One client is capped at 1,000 events/day, so only ≥ 10 clients (a distributed flood) can spend the global budget; then the endpoint fails closed (429) until the window resets — telemetry goes dark, the rest of the API is unaffected. The per-client daily map holds at most 10,000 client keys and refuses NEW keys when full (expired windows are swept first): after a flood of ≥ 10,000 distinct clients, a client first seen afterwards gets 429 until the oldest windows expire — a lockout of up to 24 h. | `utils/rateLimit.js`, `clientEventService` | Revisit only if 429s on `/api/client-events` show up in the request log. |
| **F4** | `platform_hint` is coarse UA sniffing (iOS widget/extension share the app's CFNetwork UA). | `utils/clientInfo.js` | None — `platform` (header) is authoritative. |
| **F5** | `country` depends on Render's edge forwarding `CF-IPCountry`. | `middleware/requestLog.js` | Checked after deploy (changelog). |
| **F6** | Sensitive-key stripping in `props` is top-level only; a literal backslash-`u0000` text in props is a false positive for `props_invalid`. | `services/clientEventService.js` | Clients own §8's "no PII in props". |
| **F7** | ~~The global `errorHandler` printed body-parser errors with their raw `err.body`, so a malformed-JSON request body (e.g. a login with a password) reached the Render log.~~ | `middleware/errorHandler.js` | **Resolved 0.1.0 (D-C10)** — log-only fix, responses unchanged. |
| **F8** | **Pre-existing:** route-level `catch` blocks elsewhere still `console.error` the whole error object — a Sequelize error prints its SQL and parameter values (e.g. `routes/members.js:51`, `"Error updating member:", err`). D-C10 covers only the global `errorHandler`. | `routes/*.js` catch blocks | **Partially resolved 0.2.0 (D-C11):** `logError` adopted by the global handler + every `/api/auth` catch; the remaining routes (e.g. `routes/members.js:51`) adopt it as Phase 3 tracks touch them. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.1 | 2026-10-12 | **PATCH — §8.1 registers `sync.run`** (health-sync 0.1.0 §8 rule 10; Phase 3 R2): props `integration`, `trigger`, `outcome`, `duration_ms`, `catch_up_days`, `batches`, `error_class` (incl. `updateRequired` for a 426), per-kind counts, `legacy_recorded`. Docs only — the ingest already accepts any well-formed type; no code change. Lands after R1's 0.2.0. |
| 0.2.0 | 2026-10-12 | **D-C11 — body-parser 4xx on every route + `logError` (Phase 3 R1).** The global `errorHandler` answers malformed / oversized / mis-encoded bodies with `400`/`415 invalid_body` / `413 payload_too_large` (was 500 — F2 resolved), echoes an `AppError`'s `code` + `Retry-After`, and logs other errors via the new `utils/logError.js` (name / code / status / one-line message / two stack frames; Sequelize → name + Postgres code; never the object — F8 partially resolved). §8 registers `auth.forced_sign_out`, `auth.sign_in_failed`, `auth.refresh_failed`. D-C9: server-side auth events stay unbuilt (client-reported instead). MINOR; ships with auth 0.13.0. |
| 0.1.1 (deployed 🚀) | 2026-10-12 | Live on Render (`ac52491`). Prod smoke 28/28; `app_events` got exactly the 6 expected rows (signed-in event linked to its member with `access_token`/`email` stripped; replayed id stored once; NUL props → `props_invalid`). `xff_n` = 2 (client XFF **passed through** + appended → 3), `country` **seen** (CA), `X-Request-Id` **echoed**, no `Executing (default)` lines. Limiter key **per-client ✓**: 31 POSTs from a phone hotspot → 30×400 + 1×429; one POST from home Wi-Fi 38 s later → 400. |
| 0.1.1 | 2026-10-12 | **PATCH — `trust proxy` 1 → 2 (D-C7, plan E6).** Prod measurement: `xff_n` = 2 with no client XFF, 3 with a spoofed one (Cloudflare edge passes client XFF through, Render LB appends). With 1 hop, `req.ip` was the Cloudflare edge address, so every client behind one edge location shared a limiter bucket. Also observed live: custom `X-Request-Id` echoed, `country` populated (CA), no `Executing (default)` lines. |
| 0.1.0 | 2026-10-12 | **NET-NEW feature (reliability-overhaul Phase 2 track A, board §7 W6).** Structured request log + `X-Request-Id` (`middleware/requestLog.js`, D-C1); SQL logging off unless `DB_LOG_SQL=true` (D-C2); owns the client identity header contract `X-App-Platform` / `X-App-Version` / `X-App-Build` / `X-Request-Id` + its one parser `utils/clientInfo.js` (D-C3); `POST /api/client-events` — optional auth, 30 req/min per client (IPv6 /64), 1,000 events/day per client, 10k events/day global budget, 64 kb, ≤ 25 events, idempotent event ids (`routes/clientEvents.js`, `services/clientEventService.js`, `utils/rateLimit.js`, D-C4); `app_events` table (+ `app_build`) + RLS (public) + nightly 90-day `pg_cron` retention via schema-neutral `sql/007_app_events.sql` (D-C5/D-C6); `trust proxy` 1 (D-C7); CORS `maxAge` 7200 + `exposedHeaders` Retry-After / X-Request-Id (D-C8, resolves auth F16); the global `errorHandler` no longer logs request bodies (D-C10, resolves F7). Uses auth 0.11.0 `optionalAuthenticate`. Backend-only, additive for every live binary; `consumed_by = []` until Phase 3. |
