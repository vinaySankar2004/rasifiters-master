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
Vercel project `rasifiters-web`, `--scope TODO(provision)`. Env per `ENV_RUNBOOK.md` (`NEXT_PUBLIC_API_BASE_URL`
→ the Railway API). See the `deploy` skill.

## Status
📄 not built — built after the backend is live on Supabase + Railway.
