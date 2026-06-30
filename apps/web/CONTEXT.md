# Product: rasifiters / web (L2)

The RaSi Fiters web app. Next.js 14 (App Router) + TypeScript. Consumes the `backend` API.

**Reference implementation:** `../../../rasifiters-webapp` (the legacy web app). Faithful 1:1 rebuild;
the only intended change is the auth path (Supabase-issued tokens via the backend proxy).

## Stack
- Next.js 14 (App Router) · React 18 · TypeScript · Tailwind (theme via `rf-*` CSS vars)
- TanStack React Query (server state) · Recharts (charts) · Framer Motion (animation)
- Host: **Vercel** (project `rasifiters` = `prj_Eqd5XmbgXDkRRhKJPASBOcIqKF6u`, team `personal-vinayak`);
  live at **`https://rasifiters.vercel.app`** — temp domain until the `rasifiters.com` cutover

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

## Deploy (PROVISIONED + LIVE 2026-06-29)
Vercel project **`rasifiters`** (`prj_Eqd5XmbgXDkRRhKJPASBOcIqKF6u`), team **`personal-vinayak`**
(`team_VWBSWxM5pHvWjCraHUWB73v5`), `--scope personal-vinayak`. Live at **`https://rasifiters.vercel.app`**
(no custom-domain switch — staging-ready; `rasifiters.com` left UNPOINTED for a no-rebuild cutover).
**Git auto-deploy is WIRED**: repo `vinaySankar2004/rasifiters-master`, production branch `main`,
Root Directory `apps/web`, monorepo ignore-step `git diff --quiet HEAD^ HEAD -- .` (only `apps/web/**`
commits build; unrelated commits record a 0s Canceled skip). A push to `main` touching the web subtree
rebuilds + deploys; manual deploy = `vercel deploy --prod --scope personal-vinayak` **from the repo root**
(rootDirectory is `apps/web`, so a CLI deploy from `apps/web` cwd would double-nest).

Env (Production, from `src/lib/config.ts`): `NEXT_PUBLIC_API_ENV=prod` + `NEXT_PUBLIC_API_BASE_URL_PROD`
→ the Render API (`https://rasifiters-api.onrender.com/api`); `NEXT_PUBLIC_APP_URL=https://rasifiters.vercel.app`
(metadata base). The other `NEXT_PUBLIC_*` (login mode/path, privacy-policy URL, support email) use their
`config.ts` defaults. **No Supabase keys on the web side** — the web app talks ONLY to the Express backend
`/auth/*` proxy (no `@supabase` dep, no `createClient`). `JWT_SECRET` is **no longer used** —
`src/middleware.ts` was changed to decode + expiry only (see Foundation port, resolved 2026-06-29), so no
edge secret is needed.

Smoke test (2026-06-29, deploy `dpl_9cCVSNUUKpaoo5KB6iU5biByCcqq`): `/splash`·`/login`·`/privacy-policy`·
`/support` → 200; `/summary`·`/members` unauth → 307 → `/login?from=…` (edge guard armed); `og:url`
baked to `https://rasifiters.vercel.app`; Render backend `/` → 200. NOT exercised: the signed-in
web→backend proxy round-trip (no test credentials) — the backend auth round-trip itself was verified live
in Phase 2.

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
🚀 **DEPLOYED + LIVE on Vercel (2026-06-29)** — project `rasifiters` at `https://rasifiters.vercel.app`,
git auto-deploy on `main` wired; smoke test green (public pages 200, protected routes guard-bounce, backend
healthy). The web surface is feature-complete (36/36 pages + the notifications client). The signed-in
web→backend proxy round-trip is the one unverified surface (no test creds). History:

🏗️ foundation scaffolded + builds green (2026-06-29). **7 pages ported** via the `question-asker` page loop:
the public/auth path (`splash` → `login` → `forgot-password` → `reset-password` → `create-account`), the
`programs` hub (first protected route), and `summary` (first workspace tab — program-overview dashboard + the
3 desktop log-form modals; the 6 `/summary` sub-routes deferred). Next: the deferred sub-routes and/or the
sibling workspace tabs (`/members`, `/lifestyle`, `/program` settings). See `PROGRESS.md` for the live pointer.
