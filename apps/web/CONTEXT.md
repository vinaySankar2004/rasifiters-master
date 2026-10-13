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
Reliability Phase 3 C1 (auth §3.1, notifications §3.3, observability §4.1/§8, frontend-kit §10):
- **One token store**: localStorage `rasi.fiters.session`, plus the non-HttpOnly cookie mirror `rasi.fiters.token`
  for `middleware.ts`. `saveSession`/`clearSession` keep them in sync. `loadSession` tells absent from corrupt
  (corrupt → forced sign-out, reason `token_store_unreadable`).
- **Sessions** (`lib/api/client.ts` + `lib/auth/auth-provider.tsx`):
  - Requests read the current token at send time through the session bridge.
  - A refresh runs when the token expires within 60 s (with a 5-min clock-skew guard) or on a 401, and is
    coalesced. Before refreshing, another tab's pair for the same account (`sub`) with a LATER `exp` is adopted
    from localStorage (and refreshed with its refresh token if it is itself near expiry) — never a replay of an
    already-rotated refresh token. Display-field writes (`updateUser`, `/me` heal) also start from that newer pair.
  - A 401 sent with an outdated token retries with the current one, else once after one refresh (a 401 means the
    call never ran — safe for the password writes too). An explicit Bearer (recovery link, pending sign-up, logout,
    events) is never swapped or refresh-retried.
  - Sign-out happens only on refresh `401 session_invalid` or an unreadable store (`auth.forced_sign_out`; the guard
    redirects to `/login?reason=expired` → the kit `signedOut` copy). Other failures keep the session: a quick retry
    `min(Retry-After ?? 2, 5)` s, then 30/60/120/300 s backoff; `auth.refresh_failed` once per failure cycle (after
    the quick retry). Worst case, a request waiting on a failing refresh takes ~35 s before failing (15 + 5 + 15);
    during backoff it fails at once.
  - Bootstrap doesn't wait for `/auth/me`: pages render with the stored identity, and `/me` heals it.
  - Only the user's own **Sign out** calls `/auth/logout` (this device only, outcome ignored); a forced sign-out and
    "Sign out everywhere" (`/auth/logout-all`) don't. Every sign-out path then runs the teardown: clear the store
    and the active program (skipped when the shared store already holds ANOTHER account — a stale tab never wipes
    it), the launch cache, the refresh state; `queryClient.clear()`; the SSE stops (null token).
  - A refreshed pair is held in memory first, then persisted (`saveSession` never throws on a storage-quota error).
    The 401 re-send only ever uses a token of the same account (`sub`). Going back online clears the refresh backoff.
    A sign-in is never bounced on the device clock.
  - "Sign out everywhere" (`POST /auth/logout-all`) lives in My Profile above Delete Account. Profile edits use
    `updateUser` (tokens never come from a React snapshot).
- **Every request**: 15 s timeout (one `AbortController` + `setTimeout` — no `AbortSignal.any/timeout`, old iOS
  Safari); `X-App-Platform: web`; `X-App-Version` = the short Vercel commit SHA (`NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`,
  `dev` locally; no `X-App-Build`); a fresh `X-Request-Id`; `ApiError` carries `code` / `retryAfter` / `requestId`.
- **TanStack's abort `signal` is not wired** (the fetchers don't take one) — deferred. QueryClient defaults: queries
  retry ≤ 2 only on a retryable kit kind (never a 4xx other than 408/429), honouring Retry-After; mutations never
  auto-retry.
- **Credential errors** (`credentialErrorMessage`, `lib/kit/app-error.ts`): the server text for 400/401/409/422, the
  kit copy otherwise; on authenticated credential routes (password, link/unlink, email) a 401 reads `signedOut`; a
  failure with no response while `navigator.onLine` is false reads the kit offline copy (a password write that
  failed offline is never "couldn't confirm").
- **Events** (`lib/events/client-events.ts`): the `auth.*` queue (localStorage `rasi.fiters.events`) survives
  sign-out and first flushes after bootstrap; batches ≤ 25; 429 waits Retry-After, 413 halves, other 4xx drop,
  5xx/network back off.
- **Instant opens** (`lib/cache/launch-cache.ts`): picker (`["programs"]` only — invites stay live) + the 8 Summary
  reads; per member; schema v1; Summary entries kept for the member's 10 most recently loaded programs (LRU index);
  seeded after bootstrap, written only while signed in, cleared by the teardown.
- **SSE** (`NotificationsGate`): foreground only (`visibilitychange`) and paused while offline; fetches
  `/unacknowledged` on every start and every `ready` (a re-fetch drops queued items acknowledged elsewhere; a
  just-acknowledged id is ignored for 2 min); backoff 1 s ×2, capped at 30 s, full jitter; a 60 s idle timeout
  (server pings every 25 s); one forced refresh after 3 failed opens.
- **Kit adoption scope**: QueryClient defaults; the global offline banner (`shell.tsx`, with bottom scroll room while
  it shows); `/programs`, `/summary`, `/program/profile`, `/program/password`, `/members/invite`, `/login`,
  `/create-account`.
- No health sync and no version gate on web.
- Roles drive UI: `global_admin`, per-program `admin` / `logger` / `member`; `admin_only_data_entry`
  disables logging UI for non-admins.

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
  (`src/components/NotificationsGate.tsx`) — opens the SSE stream, hydrates the active program, and renders
  the notification modal, exactly like the legacy gate. No stub remains.
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
