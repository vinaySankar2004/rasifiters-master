# ENV_RUNBOOK.md — environment variables for RaSi Fiters (ICM rebuild)

> **Instructions, not a secrets store.** This file says *how to inspect and change* env vars on
> Render / Vercel / Supabase and what each var is for. **Never commit real secret values here.**
> Real secrets live in the platforms (Render/Vercel, set as Sensitive on Vercel) + the user's
> password manager. Companion: `.claude/skills/deploy/SKILL.md` (§Env discipline) + each app's
> `.env.example` (the canonical name list). The backend's env contract is also encoded as IaC in
> `apps/backend/render.yaml` (non-secret vars inline; secrets as `sync: false`).

Scope: the "RaSi Fiters" app, surfaces `backend` (Node/Express + Sequelize on **Render**), `web`
(Next.js 14 on **Vercel**), `ios` (SwiftUI, App Store), and `android` (Jetpack Compose, Play Store;
like iOS, no server-side env — see §7 for its Google sign-in setup) — all sharing the **one** backend API. Data
+ auth on **Supabase** (`METHODOLOGY.md` R1/R4). **Infra is provisioned + LIVE (2026-06-28/29):** Supabase
ref `kpadxjekpiwfkqcxtrio`, Render service `rasifiters-api` = `srv-d90tgmv7f7vs73cudptg`
(`https://rasifiters-api.onrender.com`), Vercel project `rasifiters` (team `personal-vinayak`) on
`https://rasifiters.com`. All concrete values are set on the platforms (live); secrets live there + the
user's password manager, never in this file. Canonical infra IDs: `CONTEXT.md` §Infrastructure.

> **Stack reminder (R2):** the backend is **Node/Express + Sequelize** — env is read via `dotenv`
> from process env (`server.js` loads `.env` then `.env.local`), not a Python settings module. The
> Sequelize connection uses a single Postgres DSN.

---

## 1. How to INSPECT current values

**Render (backend API):** Dashboard → the `rasifiters-api` service → **Environment** (lists every var;
values revealable). Programmatic — use the repo helper **`tools/render-env.sh`** (list/get/set/deploy/status,
scoped to the one rasifiters service):
```
tools/render-env.sh list                 # keys only — no values leaked
tools/render-env.sh set APNS_KEY -        # upsert, reading the (secret) value from stdin
```
The helper (and any raw REST call) authenticates via **`$RENDER_API_KEY`** — a personal Render API key
(`rnd_…` from Render → Account Settings → API Keys), stored in **`~/.zshenv`** (`export RENDER_API_KEY=…`)
for your own shells and in gitignored `.claude/settings.local.json` `env` for Claude Code sessions (with
`VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ADMIN_TOKEN` — names + purpose in `.env.mcp.example`;
read-only REST helpers `tools/ops-get.sh` / `tools/supabase-logs.sh`) — **never committed**. Raw REST
equivalent:
```
curl -s https://api.render.com/v1/services/srv-d90tgmv7f7vs73cudptg/env-vars \
  -H "Authorization: Bearer $RENDER_API_KEY" | jq -r '.[].envVar.key'   # keys only — no values leaked
```
(The `render` MCP authenticates with the same key as a Bearer header — `CLAUDE.md` §MCP — and its
`update_environment_variables` confirms per call.)

> **Render env-var values are readable** (dashboard "reveal", and the REST API returns raw values) —
> they are *not* sealed/write-only. To audit/compare without leaking, list **keys only** (the `jq`
> above) or whitelist non-secret keys (`SUPABASE_URL`, `MIN_IOS_VERSION`). For files that should never
> appear in env at all, Render **Secret Files** mount at `/etc/secrets/<name>`. In `render.yaml`,
> `value:` vars live in git; `sync: false` secrets are entered in the dashboard at first Blueprint sync
> and edited there/via API thereafter — editing the YAML never overwrites them.

**Vercel (web frontend):**
```
vercel env ls production --scope personal-vinayak            # list names (values hidden for Sensitive)
vercel env pull --environment=production .env.prod.local --scope personal-vinayak   # pull non-sensitive into a temp file
```
Always pass `--scope <team>` if the CLI default team is wrong. Dashboard:
Vercel → the web project → Settings → Environment Variables.

**Supabase (DB + Auth):** Dashboard → "RaSi Fiters" project → Settings → Database (the pooled
connection string for `DATABASE_URL`) · Settings → API (`SUPABASE_URL`, the `anon` and
`service_role` keys, and the JWT / JWKS settings the backend uses to verify Supabase-issued
tokens) · Authentication (the Auth provider config the backend proxies).

## 2. How to CHANGE a value

**Render:**
- **Dashboard** (preferred for secrets): Service → Environment → **+ Add Environment Variable** or
  bulk **Add from .env** → Save (rebuild & deploy / save only). Never paste a secret into a shell that
  gets logged.
- **render.yaml** (non-secret only): edit a `value:` var, commit, push — Render re-syncs on deploy.
  Do NOT put real secrets in the YAML; keep them `sync: false`.
- **REST API** (non-interactive, e.g. rotation): single-key upsert
  `PUT https://api.render.com/v1/services/<svc>/env-vars/<KEY>` or replace-all
  `PUT …/env-vars`, `Authorization: Bearer $RENDER_API_KEY`. Pass secret values via stdin/a temp file,
  not inline.

Render restarts/redeploys the service on a variable change (or "Save only" to defer).

**Vercel:**
```
vercel env rm  <NAME> production --scope <team>          # remove old (if rotating)
vercel env add <NAME> production --scope <team>          # prompts for the value (paste; choose Sensitive for secrets)
```
After changing a `NEXT_PUBLIC_*` var you must **redeploy** (build-time inlined).

**Rule:** non-secret/known → set directly; real secrets (`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
the APNs key, any `*_SECRET`) → get the value from the user, set as Sensitive (Vercel), never invent.
Any secret shared between sides (e.g. the same `DATABASE_URL` / Supabase keys the backend and any
server-side web route both use) must be **byte-identical** wherever it appears.

---

## 3. Inventory — BACKEND (Render, Node/Express + Sequelize)

> Provenance (legacy, archived): the original backend's `.env.local`, `server.js`,
> `config/database.js`, `middleware/auth.js`.

| Var | Purpose | Secret? | Notes / migration change |
|---|---|---|---|
| `DATABASE_URL` | Postgres DSN for the Sequelize pool | **secret** | **CHANGES (R4)** — was legacy `DB_URL` pointing at Render (`*.oregon-postgres.render.com`); becomes the **Supabase** project's pooled connection string. Set on the platform (live). Sequelize uses SSL (`rejectUnauthorized:false`). |
| `SUPABASE_URL` | Supabase project URL `https://<ref>.supabase.co` | no | **NEW (R1/R4)** — the backend's Auth proxy + JWT verification target. Set on the platform (live). |
| `SUPABASE_ANON_KEY` | anon key — the fallback key for every Auth call made on a user's behalf (sign-in / refresh / logout / password / link / recovery) while `SUPABASE_SECRET_KEY` is unset | **secret-ish** | **NEW (R1)** — anon (publishable) key; never the service-role for client-acting flows. Set on the platform (live). Since auth 0.13.0 used only when `SUPABASE_SECRET_KEY` is unset (D-C14). |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side admin Auth ops (create user on bcrypt import, link `auth_user_id`, admin lookups) | **secret** | **NEW (R1)** — full privilege; backend-only, never shipped to a client. Set on the platform (live). |
| `SUPABASE_SECRET_KEY` | new-style Supabase secret API key (`sb_secret_…`, name `rasifiters-api`) — authenticates every Auth call made on a user's behalf so Supabase honours `Sb-Forwarded-For` (per-user IP rate limits; the anon / service_role keys can't) | **secret** | Set 2026-10-12 on `rasifiters-api` **and** `rasifiters-api-staging` (board D-4). **Read by `config/supabase.js` `userAuthKey()` since auth 0.13.0 (D-C14)**; forwarding also needs the §7c setting `security_sb_forwarded_for_enabled`. **Both services must hold the SAME key** (staging proves it before prod). **Risk:** a key Supabase rejects makes every `/auth/refresh` answer 503, and live Android 1.0.0 signs out on any non-2xx refresh — every live Android user would be signed out (auth D-C14a). **Kill switch:** delete the var on the service and redeploy → the anon key, no forwarding (pre-0.13.0 behaviour). Rotate = create a new secret key in Supabase → set it here → redeploy → delete the old key. |
| `SUPABASE_JWT_SECRET` / `SUPABASE_JWKS_URL` | verify Supabase-issued JWTs on every request | **secret** | **NEW (R1)** — **replaces** the legacy `jwt.verify(token, JWT_SECRET)` in `middleware/auth.js`. Use the project's JWT secret (HS) or the JWKS endpoint (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`) depending on the verification mode chosen. Set on the platform (live). |
| `PORT` | HTTP listen port | no | legacy default `5001` (`server.js`). **Render injects `PORT` (default `10000`)** — never set it; `server.js` binds `process.env.PORT` on `0.0.0.0`. |
| `MIN_IOS_VERSION` | min iOS app version, served as `min_ios_version` at `GET /api/app-config` | no | force-upgrade gate for the iOS client (every build, 1.4.x included). **Declared in `render.yaml`** (live value: `RELEASES.md`); change it there AND set it via the Render MCP so a Blueprint sync can't revert it (app-config SPEC §7, F4). Applies on the next deploy. |
| `LATEST_IOS_VERSION` | iOS soft "Update available" threshold, served as `latest_ios_version` | no | **NEW (app-config 0.2.0, D-C4)** — dot-separated ints (`<x.y.z>`); unset/malformed → `null` (no nudge). Operator-managed: **not** in `render.yaml`; set via the Render MCP `update_environment_variables` (per-call confirm) when a release ships, **then redeploy** — `process.env` is fixed at process start, so the change applies only on the next deploy. |
| `MIN_ANDROID_VERSION_CODE` | Android hard minimum `versionCode`, served as `min_android_version_code` | no | **NEW (D-C4)** — positive integer (`<versionCode>`); unset/malformed → `null` (nobody blocked). Read by Android 1.1.0+ (blocking update screen). Live value: `RELEASES.md`. Operator-managed, not in `render.yaml`; set, then redeploy. |
| `LATEST_ANDROID_VERSION_CODE` | Android soft-nudge `versionCode`, served as `latest_android_version_code` | no | **NEW (D-C4)** — positive integer (`<versionCode>`); unset/malformed → `null`. Operator-managed, not in `render.yaml`; set, then redeploy. |
| `BLOCK_UNVERSIONED_ANDROID` | switch: `426 {error, code:"update_required"}` on every `/api/*` request (except `GET`/`HEAD /api/app-config` and `POST /api/client-events`) from header-less Android — no `X-App-Version` + `User-Agent: okhttp/…` = the 1.0.0 builds | no | **NEW (D-C5)** — on only when exactly `true` (trimmed, case-insensitive); default OFF — **ON since 2026-10-15** (the user forced every Android build onto 1.2.2 (9); 1.0.0 shows the 426 message where data would load). Operator-managed, not in `render.yaml`; set, then redeploy (on or off takes effect only on the next deploy). |
| `DB_LOG_SQL` | Sequelize SQL query logging | no | **NEW (observability D-C2, 2026-10-12)** — unset / anything but `"true"` = **off** (prod: leave unset). `"true"` prints every query to stdout — local debugging only (queries carry usernames, emails and push tokens as literals). Not keyed on `NODE_ENV` (unset on Render); not in `render.yaml`. |
| `TRUST_PROXY_HOPS` | Express `trust proxy` hop count — how many `X-Forwarded-For` proxies to trust, so `req.ip` is the client (per-client limiters, `Sb-Forwarded-For`) | no | **NEW (observability 0.2.2, D-C7)** — an integer 1–5; unset / anything else = `2`. **Prod: leave unset** (= 2: Cloudflare edge + Render LB, organic `xff_n` 2). **Staging: `3`** (the Render free tier adds a hop — organic `xff_n` 3, measured 2026-10-13). Too low → clients share one limiter bucket; too high → spoofable. Read at boot (redeploy after a change); not in `render.yaml`. |
| `CORS_ALLOWED_ORIGINS` | allowed browser origins for the web client | no | **Not read by the code** (doc fix 2026-10-12): the origins are hard-coded in `apps/backend/server.js`'s `cors()` block (`http://localhost:3000`, `https://rasi-fiters.vercel.app`, `https://rasifiters.com`, `https://www.rasifiters.com`); a new web origin is a backend code change + deploy. The same block sets `maxAge: 7200` + `exposedHeaders: ["Retry-After","X-Request-Id"]` (observability D-C8). iOS/Android are native (no CORS). |
| `CORS_EXTRA_ORIGINS` | comma-separated browser origins appended to the CORS origin list hard-coded in `server.js` | no | **NEW (auth D-C13, 2026-10)** — staging service only (= the Vercel staging alias, §Staging). Unset on prod → the CORS list is exactly the hard-coded one. |
| `APP_ENV` | `staging` marks the staging service | no | **NEW (auth D-C13, 2026-10)** — turns on `utils/stagingGuard.js` (login-change guard incl. `+stg`-only password change and sign-out-everywhere, staging-only reset mail, boot check: schema `staging` + user `rasifiters_staging` or no start). **Never set on prod.** A prod process whose `DATABASE_URL` is the staging role still boots but logs `[staging-guard] DATABASE_URL logs in as the staging role…`. §Staging. |
| `APNS_KEY_ID` | APNs auth-key id | no | **provisioned `RA353TA52W`** (fresh token-based Auth Key for this rebuild; legacy was `F9C876PZ9K`). Push for iOS (the `apn` lib). |
| `APNS_TEAM_ID` | Apple team id | no | `VSTTF2AM22` (unchanged — same Apple account). |
| `APNS_BUNDLE_ID` | iOS bundle id (push topic) | no | `com.app.rasifiters` — must match the app's `aps-environment` entitlement / build target. |
| `APNS_KEY` | base64 of the `.p8` auth key | **secret** | **SET & LIVE 2026-06-30** — base64 of `AuthKey_RA353TA52W.p8`, set in Render via `tools/render-env.sh` (`sync:false`), **never** in git. Real secret → get from the user / password manager. (Or a Render **Secret File** at `/etc/secrets/`.) |
| `APNS_KEY_PATH` | filesystem path to the `.p8` (local dev only) | no | legacy local-only (`backend/secrets/auth_key.p8`). **Not used on Render** — use `APNS_KEY` (base64) or a Secret File instead. |
| `APNS_PRODUCTION` | `true`/`false` → APNs prod vs sandbox gateway | no | **currently `true`** (flipped 2026-07-11 for TestFlight distribution — build 50 friend testers were on production tokens hitting the sandbox gateway → silent `BadDeviceToken`). TestFlight/App Store builds get production tokens; this must be `true` for them. ⚠️ **Trade-off:** `true` means **Xcode dev builds (sandbox tokens) no longer receive pushes** — a single provider matches one gateway at a time; test pushes via a TestFlight build. To go back to dev-phone testing, set `false` (`tools/render-env.sh set APNS_PRODUCTION false && tools/render-env.sh deploy`). A mismatch → `BadDeviceToken` and the token is auto-pruned. Defaults to `NODE_ENV==='production'` if unset. |
| ~~`JWT_SECRET`~~ | (was: HS256 secret to sign+verify self-issued access tokens) | secret | **RETIRED at R1** — identity moves to Supabase Auth; verification uses `SUPABASE_JWT_SECRET`/JWKS. The legacy value `my_secret_key` is a dev placeholder, not a real secret. |
| ~~`REFRESH_TOKEN_TTL_DAYS`~~ | (was: TTL for rows in the `refresh_tokens` table) | no | **RETIRED at R1** — Supabase Auth owns refresh tokens; the legacy `refresh_tokens` table + `/api/auth/refresh` self-issue path go away (the proxy forwards Supabase's refresh). Legacy value `90`. |

> **No env var (Phase 4):** the notification scheduler runs inside the API process, always on, with no switch
> (`apps/backend/CONTEXT.md` §Runtime). Migrations 011 + 012 and their nightly `pg_cron` retention jobs
> (`notifications_retention_<schema>`, `notification_send_keys_retention_<schema>`) are SQL, not env — applied to
> `staging` and `public` 2026-10-13; per-file notes in `apps/backend/sql/README.md`.

> **Auth-cutover note (R1):** these Supabase vars exist because the backend proxies Supabase Auth and
> verifies its JWTs (mapping `sub` → member via `members.auth_user_id`), replacing the retired
> self-issued-JWT machinery (`JWT_SECRET`, `refresh_tokens`). The full model + rationale (bcrypt import,
> preserved UUIDs, unchanged role gates) is the single source of truth in **`METHODOLOGY.md` R1**.

## 4. Inventory — WEB (Vercel, Next.js 14)

> Provenance (legacy, archived): the original web app's `.env.local`, `next.config.mjs`,
> `netlify.toml` (retired — R4).

| Var | Purpose | Secret? | Notes / migration change |
|---|---|---|---|
| `NEXT_PUBLIC_API_ENV` | `prod` → use `NEXT_PUBLIC_API_BASE_URL_PROD`; anything else/unset → `NEXT_PUBLIC_API_BASE_URL_LOCAL` | no | Read by `apps/web/src/lib/config.ts` (live — earlier drafts here wrongly called it retired). Production = `prod`; Preview for branch `staging` = `prod` (§Staging). |
| `NEXT_PUBLIC_API_BASE_URL_PROD` | API base the web calls when `NEXT_PUBLIC_API_ENV=prod` | no | Production = `https://rasifiters-api.onrender.com/api` (also the code default); Preview `staging` = `https://rasifiters-api-staging.onrender.com/api`. |
| `NEXT_PUBLIC_API_BASE_URL_LOCAL` | local backend base | no | Unset on Vercel → `http://127.0.0.1:5001/api` (so other preview branches call loopback). |
| `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google Web OAuth client id (web "Continue with Google") | no | Production + Preview `staging`, same value. |
| ~~`NEXT_PUBLIC_SUPABASE_URL`~~ / ~~`NEXT_PUBLIC_SUPABASE_ANON_KEY`~~ | — | — | **Not used / not set** — the web has no Supabase dependency; all auth goes through the backend proxy (`apps/web/CONTEXT.md`). |
| `NEXT_PUBLIC_APP_URL` | the site's own **canonical** origin | no | Drives `metadataBase` + `rel=canonical` (`layout.tsx`), the `sitemap.ts` locs, and `robots.ts` `Host:`/`Sitemap:`. Set to the apex `https://rasifiters.com` (same as the code fallback). **Must match the Vercel redirect direction** — Vercel serves apex, `www` 308→apex; changing one without the other re-breaks indexing (landing SPEC D-LAND-11). |
| ~~`JWT_SECRET`~~ | (was: present in the legacy web `.env.local`) | secret | **RETIRED at R1** — the web client holds no JWT signing secret; auth is Supabase via the backend proxy. Legacy value `mysecretkey` (dev placeholder). |

> **Host migration (R4):** the legacy web shipped with `netlify.toml` + `@netlify/plugin-nextjs`
> (Netlify). The rebuild deploys to **Vercel**; drop the Netlify config + plugin from
> `package.json`. CORS for the web origin is enforced **server-side by the backend** — the origin list
> is hard-coded in `apps/backend/server.js`'s `cors()` block, so a new web domain is a backend code change + deploy.

## 5. Inventory — iOS (App Store, SwiftUI)

iOS has **no server env vars** — its configuration is build-time (Xcode config / Info.plist) and it
talks to the **same backend API**. The relevant runbook facts:

| Setting | Where | Notes |
|---|---|---|
| API base URL | iOS build config (Xcode) | `Config/APIConfig.swift`: Release → prod (mirrors web's `NEXT_PUBLIC_API_BASE_URL_PROD`) — the main scheme runs Release; DEBUG → staging, used only by the opt-in `RaSi-Fiters-App-Staging` scheme (§Staging). |
| Bundle id | Xcode target / `APNS_BUNDLE_ID` | `com.app.rasifiters` — must match the backend's APNs topic. |
| Min-version gate | `GET /api/app-config` → `MIN_IOS_VERSION` (backend) | The backend, not the app, owns the force-upgrade threshold. |
| Push | APNs (Apple) | Backend sends via `APNS_KEY`/`APNS_KEY_ID`/`APNS_TEAM_ID`; the app registers its token (legacy `member_push_tokens`). |

## 6. The migration delta (what actually changes vs. the legacy apps)

**CHANGES / NEW:**
- `DB_URL` (Render) → **`DATABASE_URL`** (Supabase pooled connstring) — R4.
- **NEW** `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` /
  `SUPABASE_JWT_SECRET` (or `SUPABASE_JWKS_URL`) on the backend — R1.
- Web API selection: `NEXT_PUBLIC_API_ENV=prod` + `NEXT_PUBLIC_API_BASE_URL_PROD` (the legacy switch was kept, not retired — §4); no `NEXT_PUBLIC_SUPABASE_*`.
- `APNS_KEY_PATH` (local file) → **`APNS_KEY`** (base64) on Render.
- Hosts: backend **Render (legacy) → Render (new service via Blueprint, fresh account)**, web
  **Netlify → Vercel**, DB/auth **Render Postgres → Supabase**. (The API platform is unchanged — Render —
  but it's a brand-new service; the DB and web platforms do move.)

**STAYS:** `PORT`, `MIN_IOS_VERSION`, the `APNS_*` ids, the CORS origin list (hard-coded in `server.js`,
same domains), and — critically — the **plain legacy table names** (R5: no prefixes) and the
**preserved `members.id` UUIDs**.

**RETIRED:** `JWT_SECRET` (backend + web), `REFRESH_TOKEN_TTL_DAYS`, the
self-issued JWT machinery + the `refresh_tokens` table (R1).

> When adding a NEW env var anywhere: update the app's `.env.example` + this inventory + (if it
> gates a feature) the feature SPEC, then set it on the platform per §2. Fill each `TODO(provision)`
> the moment the real Render/Vercel/Supabase resource exists.

---

## 7. Google Sign-In / OAuth (Firebase + Google Auth Platform)

Continue-with-Google on all three clients (web / iOS / Android) rides on **one** Google Cloud project —
**`rasi-fiters`** (project number `938606130476`), linked to Firebase. There are **no OAuth secrets in the
app**: each client mints a Google **id_token** client-side (Android = Credential Manager, iOS = GoogleSignIn,
web = auth-code flow) and posts it to the backend `POST /api/auth/oauth`, which hands it to Supabase
`signInWithIdToken`. Supabase validates the token's audience against the provider client IDs set in its Auth
dashboard. So the values below are all **non-secret** and safe to record.

**Load-bearing config (non-secret):**
- **Web OAuth client ID** — used as the `serverClientId` by Android's Credential Manager and by the web flow:
  `938606130476-9vhk5o43c2g0ib4a167l1o4mmnt52f9b.apps.googleusercontent.com`. On Android it's injected as
  `GOOGLE_WEB_CLIENT_ID` via `buildConfigField` in `apps/android/app/build.gradle.kts` (debug **and** release).
- **Android package**: `com.app.rasifiters` (must match the Firebase Android app + the OAuth Android clients).
- **SHA-1 fingerprints registered in Firebase** (Project Settings → Android app → *SHA certificate
  fingerprints*) — required for Credential Manager to return a credential on a **Play-distributed** build:
  - `E8:3A:D5:50:0F:05:32:80:9F:E3:9A:97:FF:B5:98:62:5E:7A:49:01` — **Play App Signing** key (Google re-signs
    *every* Play build with this; THE critical one for closed/open/prod testers). Source: Play Console →
    *Test and release → App integrity → App signing*.
  - `C3:9B:3E:F8:0F:EF:DC:A2:5F:54:D5:FA:61:A0:12:B3:22:33:8D:D1` — **upload** key.
  - The local **debug** keystore SHA-1 is what makes the **emulator** work; on a fresh machine, register that
    machine's `~/.android/debug.keystore` SHA-1 too if the emulator can't sign in.

**⚠️ The consent-screen gotcha (cost a debugging session, 2026-07-11 — Android closed testing).**
Google Sign-In fails for **every account that is not a project owner/editor or a listed test user** while the
**OAuth consent screen** is in **Testing** publishing status. On Android this surfaces as Credential Manager
throwing `NoCredentialException` → the **"Login / No credentials available"** dialog — *before* any account
picker, so it masquerades as a device / SHA-1 / login bug but is none of those. Classic tell: **works for you
(owner) on the emulator, fails for a friend tester on a real Play build.**
- **Where:** Google Cloud Console → **Google Auth Platform → Audience** → **Publishing status**.
- **Fix:** click **Publish app** → status becomes **In production**. Because we request only the basic
  **`email` / `profile` / `openid`** scopes (no sensitive/restricted scopes), publishing is **instant — no
  Google verification review**. Done 2026-07-11; user live-tested → works.
- **Keep it in Production** — don't click "Back to testing." Any future rebuild / new GCP project must publish
  the consent screen **before** shipping Continue-with-Google to real users (same rule for iOS).

**⚠️ Second cause — no Android OAuth client for the signing key (found 2026-10-11, Play production
1.0.0 (4)).** Same **"Login / No credentials available"** dialog, but the consent screen is fine. Tell: a live
`adb logcat` during the tap shows `W Auth: [GetTokenResponseHandler] Server returned error: This android
application is not registered to use OAuth2.0, please confirm the package name and SHA-1 …`. Cause: Google
Cloud has **no Android-type OAuth client** for `com.app.rasifiters` + the APK's signing SHA-1 (Play App
Signing `E8:3A:…:49:01`). **SHA-1s in Firebase project settings are not the same thing** as Android OAuth
clients in Google Cloud — the local `google-services.json` listing no `client_type: 1` entry is the hint.
- **Diagnose:** `adb logcat -T "<device time>"` while tapping the button (recipe:
  `specs/initiatives/reliability-overhaul/discovery/W5-android-google-signin.md` §9); grep `Auth`.
- **Fix (console, no app release):** Google Cloud Console (project `rasi-fiters`) → **Google Auth Platform →
  Clients** → check **Deleted clients** first (restore if it's there) → else **Create client → Android**,
  package `com.app.rasifiters`, SHA-1 = the Play App Signing key; add one per signing key that ships (upload
  key for direct installs, each machine's debug key for emulators). Must be in the **same project** as the
  web client. Takes effect in minutes (occasionally longer).
- **What the console actually held (read 2026-10-11 in the built-in browser):** the only Android client,
  `RaSi Android App` (`…-9env…`, created 2026-07-10), was registered with **this Mac's debug-keystore SHA-1**
  `B7:3A:A3:…:28:CC` — so emulator/debug builds signed in and every Play install failed. No deleted clients.
  **Fixed 2026-10-11:** created `RaSi Android App (Play)` (`…-ulok…`) = `com.app.rasifiters` + Play App Signing
  SHA-1 `E8:3A:…:49:01` (Play Console app-signing SHA-256 starts `0B:B3:AE:DE`, matching the shipped APK).
  Clients now: Web `…-9vhk…` · iOS `…-if8t…` · Android debug `…-9env…` · Android Play `…-ulok…`. The upload
  key (`C3:9B:…`) has no client on purpose — nothing users install is signed with it.

**`google-services.json` note:** `apps/android/app/google-services.json` is **gitignored**
(`apps/android/.gitignore:16`) — deliberately kept out of this **public** repo because it carries the
Firebase `api_key`. It's a **local-only** build input, so it never appears in git. Runtime doesn't depend on
it anyway — the Android app reads the Web client ID from `BuildConfig.GOOGLE_WEB_CLIENT_ID`, not this file.
Keep the **local** copy fresh: re-download (Firebase → Project Settings → Android app →
*google-services.json*) whenever fingerprints/clients change. Last refreshed 2026-07-11 — `oauth_client` now
carries the Web client `client_type: 3`, plus the iOS client in `other_platform_oauth_client`.

**Android release checklist** (added with the Phase 3 client release, Android 1.1.0 (5)):
- An Android OAuth client exists in Google Cloud (`rasi-fiters`) for every signing key that ships — the Play App
  Signing key always; the upload key only if a build signed with it is ever installed directly; each dev machine's
  debug key for its emulator (W5 — the second cause above).
- Play Console **Data safety** (updated for 1.2.0, 2026-10-13; re-check when a release collects something new): the
  install id (`device_id`) = Device or other IDs, `app_events` (auth / sync diagnostics) = Diagnostics, and each
  member's time zone (`notification_preferences.time_zone`, from `X-Time-Zone`) is stored for reminders.
- Channels: the CLI-built AAB goes to Play **internal** and **closed** testing — the user's Pixel only receives builds
  through closed testing. **Play managed publishing is OFF (since 2026-10-14, the user's call)**: each approved change
  goes live on its own, so send a release to closed testing first and promote to production only after the Pixel
  check. App Store versions use **automatic release** (since 2026-10-14, the user's call). Release builds run **R8**
  (shrink + obfuscate, since 1.2.1 (8); keep rules in `app/proguard-rules.pro`) and the AAB carries the mapping, so
  Play deobfuscates crashes on its own. Routine: the `deploy` skill §D; what's on each channel: `RELEASES.md`.

## 7b. Auth email (password reset) — Resend custom SMTP

**Why:** without custom SMTP, Supabase's built-in sender only delivers to the project's *team* addresses
("Email address not authorized") at ~2/hour — so `POST /api/auth/forgot-password` silently sent nothing to
real users (found 2026-10-11; sign-up + email change auto-confirm, so password reset is the only email flow).

**Status: LIVE (2026-10-12).** Supabase SMTP saved + read back (`smtp.resend.com`); a reset to a real
Gmail address was **Delivered** (Resend), `/recover` 200 in 324 ms, link → `/verify` 303 → new password worked.
Key in use: `supabase-auth-smtp-3`. **Gotcha:** a `535 "Authentication credentials invalid"` on `/recover`
(Supabase auth logs) = the SMTP password isn't a valid Resend key (two mis-pasted keys showed "No activity" in
Resend). Check a key before pasting: it must start `re_`, and `curl -s https://api.resend.com/api-keys -H
"Authorization: Bearer <key>"` must answer `restricted_api_key` (valid, send-only), not `API key is invalid`.
Supabase reloads auth config ~1 min after Save ("reloading api with new configuration" in the auth logs).

**Setup (2026-10-11, board D-15 — config only, no code):**
- **Provider:** Resend (free tier), account owned by the user. Domain **`auth.rasifiters.com`**, region
  us-east-1, click/open tracking **off** (link rewriting breaks reset links).
- **DNS** (Vercel DNS for `rasifiters.com`, added via the dashboard): TXT `resend._domainkey.auth` (DKIM public
  key) · CNAME `send.auth` → `send.forge.rmta.net` · CNAME `rsend.auth` → `rsend.forge.rmta.net` · TXT `_dmarc`
  = `v=DMARC1; p=none;`. These records disable Vercel's `*` wildcard for `auth.rasifiters.com` only (unused).
- **Supabase → Authentication → Emails → SMTP Settings** (entered by the user — the key never passes through
  Claude): sender `no-reply@auth.rasifiters.com`, name `RaSi Fiters`, host `smtp.resend.com`, port `465`,
  username `resend`, password = a Resend API key with **Sending access** scoped to `auth.rasifiters.com`
  (name `supabase-auth-smtp`). After saving, Supabase applies a 30 emails/hour default (`rate_limit_email_sent`).
- **Verify (read-only):** `tools/ops-get.sh supabase '/v1/projects/kpadxjekpiwfkqcxtrio/config/auth'` →
  `smtp_host = smtp.resend.com`; then trigger a reset for a non-team address and check
  `tools/supabase-logs.sh` (`/recover` → 200) + the Resend dashboard (Delivered).

## 7c. Supabase Auth settings (shared by prod + staging)

One Supabase project = one Auth config for both APIs (DESIGN_BOARD §8). These are **settings, not env vars**; they change
only by a user-approved admin-token call.

- **Read** (read-only token): `tools/ops-get.sh supabase '/v1/projects/kpadxjekpiwfkqcxtrio/config/auth' | jq '{jwt_exp, refresh_token_rotation_enabled, security_refresh_token_reuse_interval, rate_limit_token_refresh, rate_limit_otp, security_sb_forwarded_for_enabled, sessions_inactivity_timeout, sessions_timebox, sessions_single_per_user, security_manual_linking_enabled, security_update_password_require_reauthentication, security_update_password_require_current_password}'`
- **Change** — one Management API `PATCH` with `SUPABASE_ADMIN_TOKEN` (the `token-guard` hook asks the user every time;
  the token goes in on stdin, never on the command line); then read back. Supabase reloads Auth ~1 min later:
  ```bash
  printf 'Authorization: Bearer %s' "$SUPABASE_ADMIN_TOKEN" | curl -sS -m 60 -X PATCH -H @- \
    -H 'Content-Type: application/json' -A 'rasifiters-ops/1.0' -d '<JSON body from the table>' \
    'https://api.supabase.com/v1/projects/kpadxjekpiwfkqcxtrio/config/auth' | jq '<the keys you changed>'
  ```

| Setting | Value | Status | Why | Revert body |
|---|---|---|---|---|
| `jwt_exp` | `3600` (1 h access tokens) | default | — | — |
| `refresh_token_rotation_enabled` / `security_refresh_token_reuse_interval` | `true` / `60` s (was `10`) | ✅ applied 2026-10-13T06:16:03Z (Phase 3 client release; the user's yes) | a refresh token re-sent after its rotation revokes the whole session (W1); 60 s covers the clients' quick retry + first 30 s backoff retry when a rotated reply is lost on a bad network | `{"security_refresh_token_reuse_interval":10}` |
| `rate_limit_token_refresh` | `1500` per 5 min per IP (was 150) | applied 2026-10-12T19:08:19Z (Phase 1b H2 / D-2) | one user's refresh storm no longer drains everyone's bucket | `{"rate_limit_token_refresh":150}` |
| `rate_limit_otp` | `30` per 5 min per IP | default | also limits GoTrue `PUT /user` — `/change-password` + `/set-password` since auth 0.13.0 (a 429 answers 503) | — |
| `security_sb_forwarded_for_enabled` | `true` (was `false`) | ✅ applied 2026-10-13T02:32:21Z (G3; prod smoke 25/25 after; revert = the same PATCH with `false`) | auth D-C14: Auth rate-limits by the `Sb-Forwarded-For` IP the backend sends with `SUPABASE_SECRET_KEY` → one bucket per user instead of one per Render IP | `{"security_sb_forwarded_for_enabled":false}` |
| `sessions_inactivity_timeout` | `2160` **hours** = 90 days (was `0` = never); Pro plan | ✅ applied 2026-10-13T02:32:28Z (G4; accepted on the plan; revert = `0`) | board D-5: a session not refreshed for 90 days ends at its next refresh (`session_expired` → `401 session_invalid`); any app open or background sync counts as use | `{"sessions_inactivity_timeout":0}` |
| `security_update_password_require_reauthentication` / `security_update_password_require_current_password` | `false` / `false` | default — **must stay false** | auth D-C14b: `/change-password` + `/set-password` call `PUT /user` without a nonce or the current password; turning either on makes both answer 400 | — |
| `sessions_timebox` / `sessions_single_per_user` | `0` / `false` | default | no maximum lifetime; several devices per user | — |
| `security_manual_linking_enabled` | `true` | applied (auth D-C10) | `/link` + `/unlink` | — |
| SMTP (`smtp_*`) | Resend | applied 2026-10-12 | password-reset mail (§7b) | — |

## Staging (reliability-overhaul Phase 2 B — DESIGN_BOARD §8, auth SPEC D-C13)

Same Supabase project (schema `staging` + role `rasifiters_staging` — `apps/backend/sql/008` + `sql/README.md`
§Staging schema); **`auth.users` is shared with prod**. Release builds and `rasifiters.com` never touch staging.

**Render `rasifiters-api-staging`** (free) — every var the prod service has, with these differences:

| Var | Staging value | Secret? |
|---|---|---|
| `APP_ENV` | `staging` (never set on prod) | no |
| `DATABASE_URL` | prod's URL with user `rasifiters_staging.kpadxjekpiwfkqcxtrio` (pooler) + the staging role's password — **user pastes** | **secret** |
| `CORS_EXTRA_ORIGINS` | `https://rasifiters-git-staging-personal-vinayak.vercel.app` | no |
| `PASSWORD_RESET_REDIRECT_URL` | `https://rasifiters-git-staging-personal-vinayak.vercel.app/reset-password` (also in Supabase Auth Redirect URLs) | no |
| `APNS_PRODUCTION` | `false` (Xcode debug builds hold sandbox tokens) | no |
| `TRUST_PROXY_HOPS` | `3` (the free service sits behind one more proxy than prod — `xff_n` 3; prod unset = 2) | no |
| same as prod (non-secret) | `SUPABASE_URL`, `MIN_IOS_VERSION`, `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, `APPLE_SERVICES_ID`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID` | no |
| same as prod (secret — **user pastes**) | `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_WEB_CLIENT_SECRET`, `APNS_KEY`, `FIREBASE_SERVICE_ACCOUNT` | **secret** |
| left unset | the version-gate vars (`LATEST_IOS_VERSION`, `MIN_ANDROID_VERSION_CODE`, `LATEST_ANDROID_VERSION_CODE`, `BLOCK_UNVERSIONED_ANDROID`) → nobody blocked/nudged; set one only for a test that needs it | no |

**Vercel** — Preview env scoped to git branch `staging`: `NEXT_PUBLIC_API_ENV=prod`,
`NEXT_PUBLIC_API_BASE_URL_PROD=https://rasifiters-api-staging.onrender.com/api`, `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`
= the Production value. Production env untouched.

**Clients (opt-in — staging is for risky changes only; every default build stays on prod)** — iOS: scheme
`RaSi-Fiters-App-Staging` (Run = Debug → `APIConfig.stagingBaseURL`); Android: the `staging` build type
(`initWith(debug)`; `debug` itself → prod); web: the alias above. Release builds stay on prod.

**Outside the app** — Google Cloud Web OAuth client: the alias is an Authorized JavaScript origin. Supabase Auth
`uri_allow_list` holds the staging reset URL. Staging accounts use `name+stg@…` / `name+stg-tag@…` emails
(testbed: `<inbox-local>+stg-<username>@<inbox-domain>` from `TESTBED_STAGING_MAILBOX`); the staging API refuses
or skips every login-level change for any other account and mails resets only to `+stg` addresses outside
`@rasifiters.com`. Supabase Auth settings, the 30 emails/hour SMTP limit and the refresh rate limits are shared
with prod (§7c).

**Auth / session tests (Phase 3 R1, auth 0.13.0).** Staging and prod share Supabase Auth, so the secret key, IP forwarding
and the inactivity timeout act on staging requests too. The R1 smoke (`specs/initiatives/reliability-overhaul/plans/phase-3-r1-sessions/`)
uses the `+stg` accounts `mason.w` and `zoe.chen`; it changes `zoe.chen`'s staging password and restores it — if the
restore fails, reset it via the staging forgot-password page (the mail reaches the `TESTBED_STAGING_MAILBOX` inbox).
`/link` / `/unlink` on staging need a `+stg` account plus a dedicated test Google account (auth D-C13). Staging's
`SUPABASE_SECRET_KEY` must be the same key as prod's — a staging pass only proves prod's key if they match (§3).
