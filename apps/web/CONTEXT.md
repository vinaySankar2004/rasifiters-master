# Product: rasifiters / web (L2)

The RaSi Fiters web app. Next.js 14 (App Router) + TypeScript. Consumes the `backend` API.

**Provenance (legacy, archived):** ported 1:1 from the original web app; the only intended change was the
auth path (Supabase-issued tokens via the backend proxy). Legacy source archived, not tracked here.

## Stack
- Next.js 14 (App Router) · React 18 · TypeScript · Tailwind (theme via `rf-*` CSS vars)
- TanStack React Query (server state) · Recharts (charts) · Framer Motion (animation)
- Host: **Vercel** (project `rasifiters` = `prj_Eqd5XmbgXDkRRhKJPASBOcIqKF6u`, team `personal-vinayak`);
  **LIVE on the custom domain `https://rasifiters.com`** (canonical host = apex; `www.rasifiters.com`
  308→apex); also at
  `https://rasifiters.vercel.app`. Domain cutover done 2026-06-29.

## Surface (route map — the page index + count is `specs/pages/REGISTRY.md`)
- **Public:** `/`, `/splash`, `/login`, `/create-account`, `/forgot-password`, `/reset-password`, `/privacy-policy`,
  `/support`, `/delete-account`
- **Programs:** `/programs`, `/program`, `/program/{profile,password,appearance,privacy,roles,edit,notifications,announcements}`
- **Summary (analytics):** `/summary`, `/summary/{activity,distribution,workout-types,log-workout,log-health}`
- **Members:** `/members`, `/members/{list,detail,invite,metrics,health,history,workouts,streaks,person}` (`person` is
  People's profile, behind `PEOPLE_LIVE`)
- **Lifestyle:** `/lifestyle`, `/lifestyle/{timeline,steps-timeline,workouts}`

Each page has a spec in `specs/pages/web/<page>/SPEC.md` (with role-based view rules); cross-cutting capabilities
are the `specs/features/` it consumes.

## Client runtime (where it lives — the contracts are in the SPECs)
- **Session** (`lib/auth/{session.ts,auth-provider.tsx,jwt.ts}`, `lib/api/client.ts`): one localStorage store
  `rasi.fiters.session` + the non-HttpOnly cookie mirror `rasi.fiters.token` that `middleware.ts` reads. Refresh,
  401 re-send, forced sign-out, teardown and "Sign out everywhere" (My Profile): [`auth`](../../specs/features/auth/SPEC.md)
  D-C16 + D-C17 (web realization). Bootstrap doesn't wait for `/auth/me`; `saveSession` never throws on a quota error;
  worst case a request waiting on a failing refresh fails after ~35 s (15 + 5 + 15).
- **Requests:** 15 s timeout via one `AbortController` + `setTimeout` (no `AbortSignal.any/timeout` — old iOS
  Safari); headers per [`observability`](../../specs/features/observability/SPEC.md) §4.1 (`X-App-Version` = the
  short Vercel SHA) + `X-Time-Zone`. TanStack's abort `signal` is not wired (deferred).
- **Kit** ([`frontend-kit`](../../specs/features/frontend-kit/SPEC.md) §8): `lib/kit/{copy,app-error,async-state,use-online-status}.ts`,
  `components/kit/{FloatingBanner,ErrorView,QueryView}.tsx`, dialogs `components/ui/{Modal,ConfirmDialog}.tsx`, the
  offline banner in `shell.tsx`, instant opens `lib/cache/launch-cache.ts`.
- **Events:** `lib/events/client-events.ts` (observability §8).
- **Notifications:** `NotificationsGate` + `lib/notifications/stream.ts` (SSE `?inbox=1` + catch-up), the toast
  `components/notifications/NotificationToast.tsx`, the Inbox in the `/programs` "+" sheet —
  [`notifications`](../../specs/features/notifications/SPEC.md) §3.3 / §3.9.
- **`PEOPLE_LIVE`** (`lib/api/people.ts`) — People's kill switch, `true` since 2026-10-13; `false` turns every People
  surface off (the roster returns) ([`people`](../../specs/features/people/SPEC.md) D-C13).
- **Debt (recorded, Phase 4 polish):** `app/programs/page.tsx` is ~1,425 lines and `app/lifestyle/page.tsx` ~750 — split
  later (InviteCard / CreateProgramTab / EditProgramModal; the Lifestyle cards); `Modal` has no Tab trap and `Select.tsx`
  should own its Escape (D-KIT-24).
- No health sync and no version gate on web. Roles drive UI (`global_admin`, per-program `admin` / `logger` /
  `member`; `admin_only_data_entry` disables logging UI for non-admins).

## Deploy (PROVISIONED + LIVE 2026-06-29)
Vercel project **`rasifiters`** (`prj_Eqd5XmbgXDkRRhKJPASBOcIqKF6u`), team **`personal-vinayak`**
(`team_VWBSWxM5pHvWjCraHUWB73v5`), `--scope personal-vinayak`. **LIVE on the custom domain
`https://rasifiters.com`** (canonical host = apex; `www.rasifiters.com` 308→apex; cutover done 2026-06-29 by moving the domain
off the OLD legacy Vercel project `rasi-fiters` → this `rasifiters` project); also reachable at
`https://rasifiters.vercel.app`. **Git auto-deploy is WIRED**: repo `vinaySankar2004/rasifiters-master`,
production branch `main`, Root Directory `apps/web`, monorepo ignore-step diffing against the last successful
deploy (`VERCEL_GIT_PREVIOUS_SHA`, board D-17; exact command in the `deploy` skill) — only `apps/web/**` changes
build; unrelated pushes record a 0s Canceled skip. A push to `main` touching
the web subtree rebuilds + deploys; **the canonical local link lives at the REPO ROOT** (`.vercel/` there,
gitignored), so a manual deploy = `vercel deploy --prod --scope personal-vinayak` **from the repo root**
(rootDirectory is `apps/web`, so a CLI deploy from `apps/web` cwd — or from an unlinked dir — would
double-nest / create a stray project).

Plan: **Vercel Hobby** — request/runtime logs are retained only ~1 hour (history is effectively
unavailable), and Hobby is licensed for personal / non-commercial use (a commercial RaSi needs Pro). Pages
are served mostly from the edge cache; the browser calls the Render API directly, so API-side evidence lives
in Render + Supabase, not here.

Env (Production, from `src/lib/config.ts`): `NEXT_PUBLIC_API_ENV=prod` + `NEXT_PUBLIC_API_BASE_URL_PROD`
→ the Render API (`https://rasifiters-api.onrender.com/api`); `NEXT_PUBLIC_APP_URL=https://rasifiters.com`
(metadata base — updated from the `.vercel.app` URL at the domain cutover). The other `NEXT_PUBLIC_*`
(login mode/path, privacy-policy URL, support email) use their `config.ts` defaults. **No Supabase keys on
the web side** — the web app talks ONLY to the Express backend `/auth/*` proxy (no `@supabase` dep, no
`createClient`). Backend CORS already allows `rasifiters.com` + `www.rasifiters.com`, so client-side authed
calls work from the domain. `JWT_SECRET` is **no longer used** — `src/middleware.ts` was changed to decode
+ expiry only (see Foundation port, resolved 2026-06-29), so no edge secret is needed.

**Staging (reliability-overhaul Phase 2 B — auth SPEC D-C13):** git branch **`staging`** builds a Vercel Preview whose
fixed branch alias is the staging web address — `https://rasifiters-git-staging-personal-vinayak.vercel.app`.
No app code: three **Preview** env vars scoped to git branch `staging` feed the same `config.ts` —
`NEXT_PUBLIC_API_ENV=prod`, `NEXT_PUBLIC_API_BASE_URL_PROD=https://rasifiters-api-staging.onrender.com/api`,
`NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` (same value as Production). Other preview branches get none of these (→ the
`127.0.0.1` local default); Production env is unchanged. Vercel Authentication stays on for previews
(`ssoProtection: all_except_custom_domains`): sign in to Vercel once in each browser that opens the alias — do it
**before** clicking a staging password-reset link, or the login detour drops the link's `#access_token` fragment.
The alias is in the staging API's `CORS_EXTRA_ORIGINS`, the Google Web OAuth client's JavaScript origins, and
Supabase Auth's Redirect URLs (`…/reset-password`).

Smoke test on the live domain (2026-06-29): `/splash`·`/login`·`/privacy-policy`·`/support`·`/forgot-password`·
`/reset-password` → 200; `/summary`·`/members` unauth → 307 → `/login?from=…` (edge guard armed); apex
`www.rasifiters.com` 308→apex `rasifiters.com`; `og:url` + `rel=canonical` baked to
`https://rasifiters.com`; `/favicon.ico` → 200 (the
rasifiters logo — App Router icon files ported, see Foundation port); Render backend `/` → 200. NOT
exercised: the signed-in web→backend proxy round-trip (no test credentials) — the backend auth round-trip
itself was verified live in Phase 2.

## SEO

Canonical host = the apex `rasifiters.com` (Vercel serves it; `www` 308→apex). The declared URLs
(`metadataBase`, `sitemap.ts`, `robots.ts`, `og:url`, JSON-LD) and the Vercel redirect direction
**must agree** — flipping either alone re-breaks indexing. Contract + rationale:
[landing SPEC §6 + D-LAND-11](../../specs/pages/web/landing/SPEC.md).

## Foundation port (Phase 3 kickoff, 2026-06-29)

The shared, page-independent scaffold is ported + builds green (`npm run build` ✓). It is **NOT** spec'd via
`question-asker` — that loop is for pages; this is infrastructure ported directly (mirrors the backend
foundation port). Pages (splash → login → …) are spec'd + ported on top of it. Deliberate deviations from
the legacy app (`rasifiters-webapp`), all justified by the migration:

- **Host Netlify → Vercel** — dropped `@netlify/plugin-nextjs` (devDep) + `netlify.toml`; default
  `NEXT_PUBLIC_APP_URL` fallback is `https://rasifiters.com` (was `rasifiters.netlify.app`). Package
  renamed `rasifiters-webapp` → `rasifiters-web`.
- **Prod API default** — `src/lib/config.ts` `prodBase` fallback → `https://rasifiters-api.onrender.com/api`
  (our Render service; legacy pointed at the old `rasi-fiters-api` host). Env-overridable.
- **`NotificationsGate` was a deferred stub at foundation time; it is now the full port**
  (`src/components/NotificationsGate.tsx`; today's shape: §Client runtime).
- **`src/middleware.ts` = decode + expiry only (RESOLVED 2026-06-29, option b)** — the faithful HS256 port
  couldn't validate Supabase **ES256** (asymmetric) tokens (would redirect-loop every real session). Resolved
  with the `programs` page port (its D-C1): the edge middleware is a **UX redirect gate**, not the security
  boundary — it now only decodes the token + checks `exp` (malformed → clear + bounce; expired → pass through
  for the client to refresh). The Express backend JWKS-verifies (ES256) **every** API call and owns all authz
  (CLAUDE.md auth model — not RLS), so dropping edge signature-verify doesn't weaken security; it also avoids a
  per-navigation JWKS fetch at the edge. The `JWT_SECRET` env dependency is gone.

Faithful (verbatim) otherwise: all of `src/lib/*`, `globals.css`, theme/tailwind tokens, providers, layout,
shell chrome, the icon library, and the API client + auth API module.

- **App Router favicon/icons (ported 2026-06-29, after the domain cutover).** The foundation port copied
  `public/brand/*.png` but missed the legacy `src/app/{favicon.ico, icon.png, apple-icon.png}` App Router
  icon files, so `/favicon.ico` 404'd and the browser tab + Vercel card fell back to the generic Next.js
  icon. The three legacy files are now ported 1:1 (the `metadata.icons` block in `layout.tsx` already
  matched legacy); `/favicon.ico` now serves the rasifiters logo.

## Status
🚀 **LIVE on the custom domain `https://rasifiters.com` (2026-06-29)** — project `rasifiters` on Vercel,
git auto-deploy on `main` wired; domain cutover done (moved off the old `rasi-fiters` project). Smoke test
green on the domain (public pages 200, protected routes guard-bounce, `www`→apex, `/favicon.ico` 200 logo,
backend healthy). The web surface is feature-complete — every page ported plus the notifications client
(count per `specs/pages/REGISTRY.md`, the canonical index; don't restate it here). The signed-in
web→backend round-trip has since been live-verified by the user many times over.

Beyond the legacy parity set, the surface also carries the **net-new public pages**: the marketing `landing`
at `/` (which links both store listings), the `forgot-password`/`reset-password` recovery pair, and the
`privacy-policy`/`support`/`delete-account` legal pages the store listings point at.
