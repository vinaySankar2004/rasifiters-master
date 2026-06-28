# ENV_RUNBOOK.md — environment variables for RaSi Fiters (ICM rebuild)

> **Instructions, not a secrets store.** This file says *how to inspect and change* env vars on
> Railway / Vercel / Supabase and what each var is for. **Never commit real secret values here.**
> Real secrets live in the platforms (Railway/Vercel, set as Sensitive on Vercel) + the user's
> password manager. Companion: `.claude/skills/deploy/SKILL.md` (§Env discipline) + each product's
> `.env.example` (the canonical name list).

Scope: company `rasifiters`, products `backend` (Node/Express + Sequelize on **Railway**), `web`
(Next.js 14 on **Vercel**), `ios` (SwiftUI, App Store) — all sharing the **one** backend API. Data
+ auth on **Supabase** (`METHODOLOGY.md` R1/R4). **Infra is NOT provisioned yet** — every concrete
host name / project id / ref / key below is a **`TODO(provision)`** until created.

> **Stack reminder (R2):** the backend is **Node/Express + Sequelize** — env is read via `dotenv`
> from process env (`server.js` loads `.env` then `.env.local`), not a Python settings module. The
> Sequelize connection uses a single Postgres DSN.

---

## 1. How to INSPECT current values

**Railway (backend API):**
```
railway variables --service <TODO(provision):rasifiters-backend> --json   # list names + values (readable via API)
```
Or `railway variables --service <TODO(provision):rasifiters-backend>` (table). Dashboard: Railway →
project → the backend service → Variables.

> **Railway has no per-var "Sensitive" flag** (unlike Vercel): `--json`/`--kv` return **raw values**
> ("JSON and KV output include raw variable values"). RaSi backend secrets are therefore *readable,
> not sealed*. To audit/compare without leaking, list **keys only** —
> `railway variables --service <svc> --json | jq -r 'keys[]'` — or whitelist non-secret keys via
> `jq '{PORT, MIN_IOS_VERSION, SUPABASE_URL}'`. "Sealing" exists only as an **irreversible
> dashboard-only toggle** (value becomes write-only); we deliberately do **not** seal the DB /
> Supabase / APNs keys we must read & coordinate.

**Vercel (web frontend):**
```
vercel env ls production --scope <TODO(provision):rasifiters-team>            # list names (values hidden for Sensitive)
vercel env pull --environment=production .env.prod.local --scope <TODO(provision):rasifiters-team>   # pull non-sensitive into a temp file
```
Always pass `--scope <team>` if the CLI default team is wrong. Dashboard:
Vercel → the web project → Settings → Environment Variables.

**Supabase (DB + Auth):** Dashboard → "RaSi Fiters" project → Settings → Database (the pooled
connection string for `DATABASE_URL`) · Settings → API (`SUPABASE_URL`, the `anon` and
`service_role` keys, and the JWT / JWKS settings the backend uses to verify Supabase-issued
tokens) · Authentication (the Auth provider config the backend proxies).

## 2. How to CHANGE a value

**Railway:**
```
railway variables --service <svc> --set "NAME=value"                              # non-secret
printf '%s' '<secret>' | railway variables --service <svc> --set "NAME=$(cat)"    # avoid echoing
```
⚠️ **Transcript-leak gotcha:** `railway add ... --variables` and interactive TUI modes ECHO values
to stdout. For real secrets prefer stdin/no-echo and never paste a secret into a command that gets
logged. Railway restarts the service on a variable change.

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

## 3. Inventory — BACKEND (Railway, Node/Express + Sequelize)

> Legacy reference: `/Users/vinayaksankaranarayanan/Desktop/RaSi-Fiters/backend/.env.local`,
> `server.js`, `config/database.js`, `middleware/auth.js`.

| Var | Purpose | Secret? | Notes / migration change |
|---|---|---|---|
| `DATABASE_URL` | Postgres DSN for the Sequelize pool | **secret** | **CHANGES (R4)** — was legacy `DB_URL` pointing at Render (`*.oregon-postgres.render.com`); becomes the **Supabase** project's pooled connection string. `TODO(provision)`. Sequelize uses SSL (`rejectUnauthorized:false`). |
| `SUPABASE_URL` | Supabase project URL `https://<ref>.supabase.co` | no | **NEW (R1/R4)** — the backend's Auth proxy + JWT verification target. `TODO(provision)`. |
| `SUPABASE_ANON_KEY` | anon key for the Auth proxy (sign-in/up/refresh on behalf of clients) | **secret-ish** | **NEW (R1)** — anon (publishable) key; never the service-role for client-acting flows. `TODO(provision)`. |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side admin Auth ops (create user on bcrypt import, link `auth_user_id`, admin lookups) | **secret** | **NEW (R1)** — full privilege; backend-only, never shipped to a client. `TODO(provision)`. |
| `SUPABASE_JWT_SECRET` / `SUPABASE_JWKS_URL` | verify Supabase-issued JWTs on every request | **secret** | **NEW (R1)** — **replaces** the legacy `jwt.verify(token, JWT_SECRET)` in `middleware/auth.js`. Use the project's JWT secret (HS) or the JWKS endpoint (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`) depending on the verification mode chosen. `TODO(provision)`. |
| `PORT` | HTTP listen port | no | legacy default `5001` (`server.js`). Railway injects `$PORT` — bind to it. |
| `MIN_IOS_VERSION` | min iOS app version, served at `GET /api/app-config` | no | legacy `1.2.0`; force-upgrade gate for the iOS client. Keep. |
| `CORS_ALLOWED_ORIGINS` | allowed browser origins for the web client | no | legacy hardcoded in `server.js` (`http://localhost:3000`, `https://rasi-fiters.vercel.app`, `https://rasifiters.com`, `https://www.rasifiters.com`). **Externalize to env at rebuild**; the iOS client is native (no CORS). `TODO(provision)` final list. |
| `APNS_KEY_ID` | APNs auth-key id | no | legacy `F9C876PZ9K`. Push for iOS (the `apn` lib). |
| `APNS_TEAM_ID` | Apple team id | no | legacy `VSTTF2AM22`. |
| `APNS_BUNDLE_ID` | iOS bundle id (push topic) | no | legacy `com.app.rasifiters`. |
| `APNS_KEY` | base64 of the `.p8` auth key (production / Railway form) | **secret** | legacy commented Render form (`APNS_KEY=LS0tLS1CRUdJTi…`). On Railway, ship the key as **base64 env**, not a file path. `TODO(provision)`. |
| `APNS_KEY_PATH` | filesystem path to the `.p8` (local dev only) | no | legacy local-only (`backend/secrets/auth_key.p8`). **Not used on Railway** — use `APNS_KEY` (base64) instead. |
| `APNS_PRODUCTION` | `true`/`false` → APNs prod vs sandbox gateway | no | legacy commented; set `true` for App Store builds. `TODO(provision)`. |
| ~~`JWT_SECRET`~~ | (was: HS256 secret to sign+verify self-issued access tokens) | secret | **RETIRED at R1** — identity moves to Supabase Auth; verification uses `SUPABASE_JWT_SECRET`/JWKS. The legacy value `my_secret_key` is a dev placeholder, not a real secret. |
| ~~`REFRESH_TOKEN_TTL_DAYS`~~ | (was: TTL for rows in the `refresh_tokens` table) | no | **RETIRED at R1** — Supabase Auth owns refresh tokens; the legacy `refresh_tokens` table + `/api/auth/refresh` self-issue path go away (the proxy forwards Supabase's refresh). Legacy value `90`. |

> **Auth-cutover note (R1):** the backend remains the single front door. `routes/auth.js`
> (`/login`, `/login/app`, `/refresh`, `/logout`, `/register`, `/change-password`,
> `DELETE /account`) is rebuilt to **proxy Supabase Auth** instead of signing its own JWTs;
> `middleware/auth.js`'s `authenticateToken` verifies the Supabase JWT and maps the Supabase user to
> the member via **`members.auth_user_id`** (existing `members.id` UUIDs preserved). Existing bcrypt
> hashes in `member_credentials` are **imported** into Supabase Auth (no forced reset). The role
> gates (`isAdmin`, `requireProgramAdmin`, `requireProgramMember`, `canModifyLog`) read member
> role/`global_role` from the DB after the token maps to a member — unchanged in behavior.

## 4. Inventory — WEB (Vercel, Next.js 14)

> Legacy reference: `/Users/vinayaksankaranarayanan/Desktop/RaSi-Fiters/rasifiters-webapp/.env.local`,
> `next.config.mjs`, `netlify.toml` (being retired — R4).

| Var | Purpose | Secret? | Notes / migration change |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | the Railway backend base URL the web client calls | no | **NEW/explicit (R4)** — the web app talks to the shared backend; point at the deployed Railway URL. The legacy app selected its API by `NEXT_PUBLIC_API_ENV`; the rebuild uses an explicit base URL. `TODO(provision)`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL for client-side Auth (if the web uses the Supabase JS SDK directly) | no | **NEW (R1)** — only if the web signs in via the Supabase client; if all auth flows route through the backend proxy, this may be unneeded. Confirm at rebuild. `TODO(provision)`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client anon key for Supabase Auth | **secret-ish** | **NEW (R1)** — anon key only, **never** the service-role key in a `NEXT_PUBLIC_*` var. `TODO(provision)`. |
| ~~`NEXT_PUBLIC_API_ENV`~~ | (was: `dev`/`prod` switch selecting the API host) | no | **RETIRED at R4** — replaced by the explicit `NEXT_PUBLIC_API_BASE_URL`. Legacy value `prod`. |
| ~~`JWT_SECRET`~~ | (was: present in the legacy web `.env.local`) | secret | **RETIRED at R1** — the web client holds no JWT signing secret; auth is Supabase via the backend proxy. Legacy value `mysecretkey` (dev placeholder). |

> **Host migration (R4):** the legacy web shipped with `netlify.toml` + `@netlify/plugin-nextjs`
> (Netlify). The rebuild deploys to **Vercel**; drop the Netlify config + plugin from
> `package.json`. CORS for the web origin is enforced **server-side by the backend**
> (`CORS_ALLOWED_ORIGINS`), so add the new Vercel domain(s) there.

## 5. Inventory — iOS (App Store, SwiftUI)

iOS has **no server env vars** — its configuration is build-time (Xcode config / Info.plist) and it
talks to the **same backend API**. The relevant runbook facts:

| Setting | Where | Notes |
|---|---|---|
| API base URL | iOS build config (Xcode) | Point at the deployed Railway backend. Mirrors web's `NEXT_PUBLIC_API_BASE_URL`. |
| Bundle id | Xcode target / `APNS_BUNDLE_ID` | `com.app.rasifiters` — must match the backend's APNs topic. |
| Min-version gate | `GET /api/app-config` → `MIN_IOS_VERSION` (backend) | The backend, not the app, owns the force-upgrade threshold. |
| Push | APNs (Apple) | Backend sends via `APNS_KEY`/`APNS_KEY_ID`/`APNS_TEAM_ID`; the app registers its token (legacy `member_push_tokens`). |

## 6. The migration delta (what actually changes vs. the legacy apps)

**CHANGES / NEW:**
- `DB_URL` (Render) → **`DATABASE_URL`** (Supabase pooled connstring) — R4.
- **NEW** `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` /
  `SUPABASE_JWT_SECRET` (or `SUPABASE_JWKS_URL`) on the backend — R1.
- **NEW** `NEXT_PUBLIC_API_BASE_URL` (+ optional `NEXT_PUBLIC_SUPABASE_*`) on the web — R1/R4.
- `APNS_KEY_PATH` (local file) → **`APNS_KEY`** (base64) on Railway.
- Hosts: backend **Render → Railway**, web **Netlify → Vercel**, DB/auth **Render PG → Supabase**.

**STAYS:** `PORT`, `MIN_IOS_VERSION`, the `APNS_*` ids, `CORS_ALLOWED_ORIGINS` (externalized but
same domains), and — critically — the **plain legacy table names** (R5: no prefixes) and the
**preserved `members.id` UUIDs**.

**RETIRED:** `JWT_SECRET` (backend + web), `REFRESH_TOKEN_TTL_DAYS`, `NEXT_PUBLIC_API_ENV`, the
self-issued JWT machinery + the `refresh_tokens` table (R1).

> When adding a NEW env var anywhere: update the product's `.env.example` + this inventory + (if it
> gates a feature) the feature SPEC, then set it on the platform per §2. Fill each `TODO(provision)`
> the moment the real Railway/Vercel/Supabase resource exists.
