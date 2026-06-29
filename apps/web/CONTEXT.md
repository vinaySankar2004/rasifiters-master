# Product: rasifiters / web (L2)

The RaSi Fiters web app. Next.js 14 (App Router) + TypeScript. Consumes the `backend` API.

**Reference implementation:** `../../../rasifiters-webapp` (the legacy web app). Faithful 1:1 rebuild;
the only intended change is the auth path (Supabase-issued tokens via the backend proxy).

## Stack
- Next.js 14 (App Router) · React 18 · TypeScript · Tailwind (theme via `rf-*` CSS vars)
- TanStack React Query (server state) · Recharts (charts) · Framer Motion (animation)
- Host: **Vercel** (`rasifiters-web`, `TODO(provision)`); temp domain until the `rasifiters.com` cutover

## Surface (~33 routes, from the legacy app)
- **Public:** `/`, `/splash`, `/login`, `/create-account`, `/privacy-policy`, `/support`
- **Programs:** `/programs`, `/program`, `/program/{profile,password,appearance,privacy,roles,edit}`
- **Summary (analytics):** `/summary`, `/summary/{activity,distribution,workout-types,log-workout,log-health,bulk-log-workout}`
- **Members:** `/members`, `/members/{list,detail,invite,metrics,health,history,workouts,streaks}`
- **Lifestyle:** `/lifestyle`, `/lifestyle/{timeline,workouts}`

Each page becomes a page spec in `specs/pages/web/<page>/SPEC.md` via the `question-asker` loop (with
role-based view rules), then ported faithfully from the legacy app. Cross-cutting capabilities (auth,
analytics, notifications) are `specs/features/` it consumes.

## Auth (client side)
- Calls the backend `/auth/*` proxy (login/refresh/logout); stores the Supabase-issued session
  (token + refresh) and attaches the access token to API calls. Middleware-guarded protected routes.
- Roles drive UI: `global_admin`, per-program `admin` / `logger` / `member`; `admin_only_data_entry`
  disables logging UI for non-admins.

## Deploy
Vercel project `rasifiters-web`, `--scope TODO(provision)`. See the `deploy` skill. Env (from
`src/lib/config.ts`): `NEXT_PUBLIC_API_ENV=prod` + `NEXT_PUBLIC_API_BASE_URL_PROD` → the Render API
(`https://rasifiters-api.onrender.com/api`); `NEXT_PUBLIC_APP_URL` → the live web origin (metadata base).
`JWT_SECRET` is consumed by `src/middleware.ts` today but is part of the deferred auth-path decision below.

## Foundation port (Phase 3 kickoff, 2026-06-29)

The shared, page-independent scaffold is ported + builds green (`npm run build` ✓). It is **NOT** spec'd via
`question-asker` — that loop is for pages; this is infrastructure ported directly (mirrors the backend
foundation port). Pages (splash → login → …) are spec'd + ported on top of it. Deliberate deviations from
the legacy app (`../../../rasifiters-webapp`), all justified by the migration:

- **Host Netlify → Vercel** — dropped `@netlify/plugin-nextjs` (devDep) + `netlify.toml`; default
  `NEXT_PUBLIC_APP_URL` fallback is `https://rasifiters.com` (was `rasifiters.netlify.app`). Package
  renamed `rasifiters-webapp` → `rasifiters-web`.
- **Prod API default** — `src/lib/config.ts` `prodBase` fallback → `https://rasifiters-api.onrender.com/api`
  (our Render service; legacy pointed at the old `rasi-fiters-api` host). Env-overridable.
- **`NotificationsGate` = DEFERRED STUB** (`src/components/NotificationsGate.tsx` returns `null`). The
  legacy gate opens the SSE stream + hydrates the active program + renders the notification modal — it
  depends on the web `notifications`/`programs` features (not yet ported). Mirrors the backend's
  deferred-stub pattern; REPLACED with the faithful port when the web notifications feature lands.
- **`src/middleware.ts` = faithful HS256 port that does NOT work under the migrated auth model** — it
  verifies an HS256 token signed with a shared `JWT_SECRET`, but auth migrated to Supabase **ES256**
  (asymmetric), so every real session token would be marked invalid → redirect loop. It is **inert** for
  now (none of the matched routes — `/summary`, `/members`, `/lifestyle`, `/program`, `/programs` — exist
  yet). **OPEN DECISION (auth-path SPEC), must resolve before `/programs` lands** (first protected route
  after login): (a) ES256/JWKS verify at the edge (mirror the backend `middleware/auth.js`), or (b) decode
  + expiry check only (no signature verify) since the backend re-verifies every API call and the middleware
  is just a UX redirect gate.

Faithful (verbatim) otherwise: all of `src/lib/*`, `globals.css`, theme/tailwind tokens, providers, layout,
shell chrome, the icon library, and the API client + auth API module.

## Status
🏗️ foundation scaffolded + builds green (2026-06-29). Page-by-page port next, starting with the
public/auth path (splash → login → create-account) via the `question-asker` page loop.
