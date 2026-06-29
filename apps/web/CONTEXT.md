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
`JWT_SECRET` is **no longer used** — `src/middleware.ts` was changed to decode + expiry only (see Foundation port, resolved 2026-06-29), so no edge secret is needed.

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
- **`src/middleware.ts` = decode + expiry only (RESOLVED 2026-06-29, option b)** — the faithful HS256 port
  couldn't validate Supabase **ES256** (asymmetric) tokens (would redirect-loop every real session). Resolved
  with the `programs` page port (its D-C1): the edge middleware is a **UX redirect gate**, not the security
  boundary — it now only decodes the token + checks `exp` (malformed → clear + bounce; expired → pass through
  for the client to refresh). The Express backend JWKS-verifies (ES256) **every** API call and owns all authz
  (CLAUDE.md auth model — not RLS), so dropping edge signature-verify doesn't weaken security; it also avoids a
  per-navigation JWKS fetch at the edge. The `JWT_SECRET` env dependency is gone.

Faithful (verbatim) otherwise: all of `src/lib/*`, `globals.css`, theme/tailwind tokens, providers, layout,
shell chrome, the icon library, and the API client + auth API module.

## Status
🏗️ foundation scaffolded + builds green (2026-06-29). Page-by-page port next, starting with the
public/auth path (splash → login → create-account) via the `question-asker` page loop.
