# Reliability overhaul — Phase 1 design board

> **Status:** ✅ **APPROVED by the user 2026-10-11** (answers recorded in the board's store: D-1…D-9 and D-11…D-14
> accepted as recommended; **D-10 changed → free staging instance**). Revised before approval after a
> plan-adversary review (12 findings, all verified and folded in). Canonical text; the Artifact renders it. Inputs: the 7 verified discovery briefs
> (`discovery/`) + the user's walkthrough decisions (`HANDOFF.md`). On approval: decisions → `BRIEF.md` §6 +
> per-feature SPEC §9 D-rules as each workstream lands; build phases → `BRIEF.md` §7 + `HANDOFF.md`.
> Nothing here is code. **Legend:** ✅ decided by the user · ◆ proposed — needs your OK.

## 0. Principles (apply to every row below)

1. **Simplest industry-standard option; don't over-engineer ✅.** Fancier options are listed as "not now".
2. **One contract per subsystem, identical on web / iOS / Android.** Platform idiom (APNs vs FCM, HealthKit
   vs Health Connect, SwiftUI / Compose / React) is the only allowed difference, written down as a D-rule.
3. **No shims for old binaries ✅.** Fixes ship in new builds; everyone is expected to update. Old builds are
   never made *worse by accident* — backend changes are additive; when one must break old builds, the
   **version gate** blocks them with an update message.
4. **Backend first, clients after.** Every client change rides a gated release.
5. **Observability is free ✅** — our own request logs + event tables; no paid tools.
6. **No direct DB writes** — every schema change is a numbered, idempotent migration the user runs; nothing
   secret (role passwords, keys) ever goes in a migration file (the repo is public).

## 1. Version gate (new requirement ✅)

| | Today | Target |
|---|---|---|
| iOS | `GET /api/app-config` → `{min_ios_version:"1.2.0"}` (env `MIN_IOS_VERSION`); blocking "Update required" modal | Same + a **soft "Update available"** banner (dismissable, once per version) from `latest_ios_version` |
| Android | Nothing. Requests carry only `okhttp/4.12.0` | Next build reads `min_android_version_code` / `latest_android_version_code` (versionCode compare): blocking screen → Play Store (Play in-app *immediate* update when available); soft banner |
| Backend | One env var | Response is **additive** (old iOS keeps reading `min_ios_version`; Android ignores unknown JSON keys); 4 env vars on Render |
| Old Android 1.0.0 ✅ | — | Every new build sends `X-App-Platform` + `X-App-Version`. A backend switch (`BLOCK_UNVERSIONED_ANDROID`, **off**) answers header-less Android with `426` + "Please update RaSi Fiters from the Play Store". On **only when a backend change needs it** |

## 2. W1 — Sessions / auth

**Today:** random logouts = Supabase killing sessions for refresh-token reuse (138 in 90 days, one user 21×),
driven by iOS refresh storms (98% of all refreshes) and two drifting token copies; the backend reports every
refresh problem — incl. Supabase rate limits on Render's single shared IP — as "invalid session"; Android/web
sign out on any refresh failure; logout signs out every device; the backend's shared Supabase client rotates
other users' tokens (59×/30 d) and can hand one user's session to another; the library behind it silently
re-sends a refresh token for up to 30 s, which can itself trigger the reuse kill.

**Contract — backend**
1. **Stateless auth proxy:** no shared Supabase client for user sessions. Refresh is **one direct call** to
   Supabase's token endpoint with a **5 s timeout and no automatic retry** (a replayed token after rotation
   is exactly what kills sessions). Login / Google / link / logout use a fresh client per request. Every
   outbound auth call (Supabase, Google code exchange) gets an explicit timeout.
2. **Refresh errors are classified:** `401 {code:"session_invalid"}` **only** for a definitive rejection (token
   not found / already used / session or user gone). Supabase 429, 5xx, timeouts → `503 {code:"auth_unavailable"}`
   + `Retry-After`. The JWT middleware returns `503` (not 401) when it can't verify for infrastructure reasons.
   Safe for every live binary (old iOS survives 503 today; old Android signs out on any non-2xx either way).
3. **Per-user rate limits:** the proxy calls Supabase Auth with a **new Supabase secret API key** (Supabase
   only honors IP forwarding with secret keys — not anon or legacy service-role), sends the user's IP
   (from Render's `X-Forwarded-For`, with Express `trust proxy`) as `Sb-Forwarded-For`, and IP forwarding is
   enabled in Auth settings. **Immediate mitigation:** raise `rate_limit_token_refresh` (150 → 1,500 per
   5 min ◆) — one admin-token call, approved per call ✅.
4. **Logout = this device only ✅** (`scope:'local'`). **Password change signs out your *other* devices**
   (`scope:'others'` — today it revokes nothing). "Sign out everywhere" is an explicit action in account
   settings (`scope:'others'` + this device).
5. **Inactivity limit ✅:** Supabase `sessions_inactivity_timeout` = **90 days** ◆ (a session unused for 90 days
   ends; any app open or background sync counts as use).

**Contract — every client (web / iOS / Android)**
1. **One token store, one refresh in flight.** Requests read the current token at send time; a 401 with an
   outdated token retries with the current one instead of refreshing again.
2. **Refresh only when needed:** when the access token expires within 60 s, or on a 401. Never on every
   foreground, never once per loop item. A failed refresh call is retried **once within 5 s**, then backs off
   (never a long-delayed replay of the same token).
3. **Sign out only on `401 session_invalid` from refresh.** Offline / timeout / 5xx / 503 / locked keychain →
   keep the session, retry with backoff, show the offline / "can't reach server" banner.
4. **Storage:** iOS keychain `AfterFirstUnlockThisDeviceOnly`, update-or-add with status checks (one copy, no
   in-memory twin); Android tokens excluded from Auto Backup; web one `localStorage` key (multi-tab is rare ✅ —
   no cross-tab sync).
5. **Sign-out does the full teardown on every path, voluntary or forced:** revoke this session, unregister
   this device's push token, clear caches, stop the stream. Unregistering and event reporting work
   **without a valid login** (the push token itself proves the device), because forced sign-outs happen
   precisely when the login is gone.
6. **Every forced sign-out reports a reason** to the event log (§7); the event queue survives the sign-out.

**Live binaries:** `/refresh` keeps its exact response shape. Old Android still signs out on any failed
refresh (accepted ✅) — fewer failures (no shared client, no replays, per-user rate limits) is what helps it.

## 3. W2 — Push notifications + invites

**Today:** Android can't see or accept invites at all (reads a table invites never write; accepts via a call
that 404s) — the reported bug (Prasad, Phase 3). Pushes are fire-and-forget with no record; 32/59 members
have no device; signed-out phones keep receiving pushes; the live stream dies silently on background/deploy.

**Contract**
1. **One invite inbox for all three:** `GET /my-invites` (expired invites hidden) + `PUT /invite-response`
   (Android adopts them — new build; no shim for 1.0.0 ✅). Invite + its notification are written in **one
   transaction**.
2. **Inviter feedback ◆:** keep the privacy-safe "Invitation sent" for unknown / blocked / already-member
   usernames (logged server-side); show a real error for 5xx and timeouts.
3. **Every delivery attempt is recorded** (`push_deliveries`: notification, member, device, platform, outcome —
   incl. "no registered device"), kept 90 days.
4. **Device registry = one row per installation:** a stable install id; `last_seen` updated on **every**
   `PUT /device` (old builds included; backfilled from `updated_at` so old installs aren't pruned); re-register
   on token rotation; unregister on every sign-out path (works without a login — §2); prune on APNs 410 / FCM
   `UNREGISTERED` and when unseen for 60 days. FCM `INVALID_ARGUMENT` is a payload bug, never a dead token.
5. **Delivery settings:** APNs expiry 7 days (today 1 h); Android: a high-importance "Invites & membership"
   channel + a default channel, explicit channel + TTL on every message, foreground messages shown, tap →
   acknowledge + open the target; notification permission asked in context with a settings fallback.
6. **Realtime stays SSE ◆ (fixed, not replaced):** foreground only; reconnect with backoff + jitter; re-fetch
   unacknowledged on every (re)connect; mobile sends a fresh token in the header; web re-creates its stream
   with a fresh token on every refresh (query-string token, redacted from logs). On deploy the server ends
   streams with a plain close — never a new event type (old iOS treats any `data:` as a notification).
   *Not now:* Supabase Realtime, web push.

**Live binaries:** `PUT /device` without `platform` keeps defaulting to iOS; the SSE frame + 7-field payload
stay; `/unacknowledged` stays; web `?token=` stays accepted.

## 4. W3 + W4 — Health sync (one contract, iOS + Android)

**Today:** iOS background delivery is wired against Apple's rules (registered late, acknowledged before work)
→ multi-day gaps then catch-ups; every logout switches sync off and loses the gap; workouts double-count in
prod (111 rows summed at once); sleep/steps re-send 14 days every run (the 300–1,200 daily 409s). Android has
no background sync, so >14 days unopened loses sleep/steps days for good; permission loss is invisible.

**Contract**
1. **Freshness ✅: up to date when the app opens.** Triggers: launch, foreground, pull-to-refresh. iOS keeps
   HealthKit background delivery as a **best-effort bonus**, done Apple's way (registered at launch,
   acknowledged after the work inside a background task). **Android background sync: not now ◆.**
2. **Catch-up since the last successful sync, capped at 30 days** (replaces the fixed 14-day window); Health
   Connect reads every result page.
3. **One idempotent batch upload per run** (new endpoint; old endpoints untouched for old builds): each item
   carries its source + the Health sample id; the server returns per-item results. No 409-then-PUT.
4. **Server-side dedup ✅ — a permanent sample ledger:** the server records every sample it has applied
   (member, program, source, sample id, value), so a re-sent, re-read or restored workout never counts twice;
   a deletion subtracts that sample (never below 0). **Overlap rule:** workouts from different apps that
   overlap in time count once (catches a watch + a second app recording the same session). **Upgrade:** the
   first new-build run keeps the existing anchor / changes token and uploads the device's "already sent" list
   so nothing the old build summed is added again.
5. **Bounds ✅:** a single synced workout longer than 12 h is skipped; a member's synced total per day can't
   exceed 24 h ◆.
6. **Provenance ✅:** recorded **per sample** in the ledger, and **per field** on daily rows (sleep and steps
   each carry their source; diet stays manual) — a single row can mix manual and synced values.
7. **Sync survives sessions:** only an explicit "Disconnect" (or an explicit sign-out) stops sync; signing
   back in as the **same** member resumes from the last sync with no data lost and no review screen ◆. The
   first-sync review shows once per member + program (remembered by the server).
8. **Permissions are live state:** Android checks grants every run and shows "Reconnect Health Connect";
   iOS shows the last successful sync time. Sync state is excluded from Android Auto Backup.
9. **Every sync run reports** trigger, counts, outcome, duration to the event log (§7).

**Live binaries:** old builds keep POST→409→PUT and `on_duplicate:"sum"` exactly as today (accepted ✅).

## 5. W5 — Android Google sign-in

**Today:** Google rejects the Play build — no Android OAuth client in Google Cloud for the Play signing key
(proven live 2026-10-11). The button also uses the passive account sheet and shows Android's raw text.

**Contract:** (a) **console fix — user, pending ✅** (ENV_RUNBOOK §7). (b) Next build: the button uses Google's
button flow (`GetSignInWithGoogleOption`) with a nonce, errors map to human messages, failures report a
reason (§7). (c) Release checklist gains "an Android OAuth client exists for every signing key that ships".

## 6. W7 — One frontend standard (loading / error / offline / design)

**Today:** an error looks like "no data" on all three; spinners that never end; raw error text; no retry;
no offline handling; no device cache; serial loading; three different oranges.

**Contract**
1. **One async state per screen:** loading → loaded / empty / failed, keeping the previous data.
2. **On failure with data ✅:** keep the last good data + a slim floating "Couldn't refresh — Retry" banner.
   With no data: an error view with Retry. Never fake zeros, never an endless spinner.
3. **One error vocabulary** (offline · timeout · signed out · not allowed · not found · conflict · invalid input ·
   server · unknown) → one human message each; raw server text only for invalid-input. Backend adds a
   machine `code` next to `error` (additive).
4. **Offline:** one connectivity monitor → one floating offline banner; requests time out at 15 s.
5. **Fast opens:** independent loads run **in parallel**; **on-device cache of the last good response for the
   launch screens (program picker + Summary) ◆**, shown instantly on open, then refreshed. *Not now:* caching
   every screen, combined "bundle" endpoints.
6. **Shared kit per surface:** loading skeleton, empty view, error banner/view with Retry, offline banner,
   toast; pull-to-refresh on every data tab (mobile).
7. **One palette ✅ = web's** (`#ff8b1f` accent, web's danger red) + shared spacing / type / radius tokens.
   Standing rules hold: odd screens converge to the majority, iOS follows web, new banners float (no page
   restyle), Android keeps its neutral M3 surfaces + shared chart tooltip.
8. **Scope ◆:** screens adopt the kit as this initiative touches them; Android moves to one ViewModel per
   screen only for screens being rebuilt (no big-bang refactor).

## 7. W6 — Observability (free ✅) + performance

**Today:** we can't see requests, refresh-failure reasons, client errors, sync runs or push outcomes; logs are
SQL-only, 7 days, with personal data. The server is fast; opens are slow from round trips (Android/iOS summary
2–3.5 s from East Africa / India — Kenya + Tanzania are 25 of 42 web summary users).

**Contract**
1. **One structured log line per request:** request id (accepted from `X-Request-Id` or generated, echoed
   back), route, status, duration, member id, platform + version, country, error code. **No** usernames,
   emails, tokens or query strings. **SQL logging off ✅.**
2. **Event tables in Postgres (free):** `app_events` — auth (login, refresh failure + Supabase code, forced
   sign-out + reason), sync runs, client errors — plus `push_deliveries` (§3). 90-day retention via a nightly
   `pg_cron` cleanup. Clients post batched events to `POST /api/client-events` — accepted **with or without a
   login** (size-capped, rate-limited per IP), so sign-in and forced-sign-out failures still arrive.
3. **Crashes:** the free built-ins — Xcode Organizer + Play Console Android vitals. *Not now:* Sentry,
   Crashlytics, Render Pro, Supabase drains.
4. **A short query pack** (`tools/`) answers: who got logged out and why · whose sync is stale · which pushes
   failed · slow routes — the questions Phase 0 had to reconstruct by hand.
5. **Performance budget:** app open → first content in **1 network wave on mobile, ≤ 2 on web** (web pays a
   CORS preflight; the backend caches preflights for 2 h so repeat opens are 1 wave).

## 8. Staging (same Supabase project ✅)

| Piece | Design |
|---|---|
| Data | A `staging` Postgres schema with **identical table names** (R5 — no prefixes). **Schema only, no copy of prod data** |
| Isolation | A `rasifiters_staging` role that can only touch `staging` (`ALTER ROLE … SET search_path = staging, extensions`); the staging API connects as it and cannot read or write prod tables. The role's password is set by the user in the SQL editor — never in a migration file. (Backend JS never names a schema; checked.) |
| API | A second Render web service `rasifiters-api-staging`, same repo, deploys on demand, on the **free** instance (D-10 ✅). It sleeps after 15 min idle: **wake it before a test session** (open its health URL and wait for the reply) so the first refresh doesn't hit a cold start |
| Clients | Debug iOS/Android builds + **one fixed staging web address** (a Vercel branch alias) point at the staging API; release builds + `rasifiters.com` stay on prod. The staging address is added to the API's CORS list and to Google sign-in origins. Supersedes "dev tests against live backend" |
| Auth (shared!) | One Supabase project = **one shared login table**. Staging accounts use **staging-only emails** (e.g. `name+stg@…`), seeded by a staging run of the testbed seeder. **Guard:** the staging API refuses every login-level change — delete user, change email/password, link/unlink identity, global sign-out, the Google sign-up clean-up — unless the account's email is staging-only. A real prod login can never be altered from staging |
| Config | `APNS_PRODUCTION=false` (debug builds get sandbox push tokens); password-reset links point at the staging web address; push only reaches test devices |
| Migrations | Today's files hard-code `public.`. New migrations are written **schema-neutral** (no schema names) and run once per schema: `psql -c "SET search_path TO staging" -f NNN.sql`, then the same for `public`. The base schema is created in `staging` once. Phase 2 Track A's migrations go straight to prod (staging doesn't exist yet) |
| Not isolated | Supabase Auth settings + rate limits (shared) |

## 9. Notification redesign (concept — Phase 4)

- **Categories:** *Program & invites* (invites, membership changes, program updated/deleted — today's deferred
  emit) · *Activity* (logs from people in your programs, later) · *Reminders* (log your workout, streak at
  risk) · *Digest* (weekly summary).
- **Preferences:** one switch per category per member (server-side), honored by every channel. Promotional /
  engagement categories (Reminders, Digest) are **opt-in** (App Store rule).
- **Inbox:** a real notification center on all three (read/unread, 90-day history) on today's table.
- **Scheduling:** reminders and digests sent by a scheduler at the member's **local time** (needs a time zone
  per member). Every send goes through the W2 pipeline (recorded deliveries).

## 10. Social layer (concept — Phase 4, privacy first)

- **Model ◆:** start with a **program "People" list** (everyone in a program you share; profile + recent
  activity + kudos) — no strangers, no new graph. *Later:* follows across programs.
- **Privacy defaults:** visible only to people in your programs; per-member switch to hide activity; no public
  profiles; blocking (exists for invites) extends to People.
- **Layout:** the Members tab grows into People on all three surfaces — a page redesign, done after the W7 kit
  exists so it's built once.

## 11. Decisions (✅ all answered 2026-10-11 — accepted as recommended unless noted)

| # | Decision | Recommendation |
|---|---|---|
| D-1 | Ship a **backend-only auth hotfix now**, ahead of the phases: stateless proxy (every shared-client call: `authService.js:74, 158, 417, 599, 660`), refresh = one direct call with a 5 s timeout and no replay, 503 instead of 401 for temporary failures (refresh + JWT check) | **Yes** — closes the cross-account risk; old iOS stops logging out on temporary failures immediately |
| D-2 | Raise the refresh rate limit now (150 → 1,500 per 5 min; one admin-token call) | **Yes** — stops one user's storm logging out others until per-user limits land |
| D-3 | Ship the **analytics membership check** now as a hotfix | **Yes** — backend-only |
| D-4 | Create a **Supabase secret API key** for the backend (needed for per-user rate limits) | **Yes** — you create it in the dashboard; I wire it as a Render env var |
| D-5 | Inactivity limit value | **90 days** |
| D-6 | Android background sync | **Not now** (fresh-on-open is the requirement) |
| D-7 | Synced workout bounds | Skip single workouts > 12 h; day total ≤ 24 h |
| D-8 | Same member re-signs in → resume sync, no review screen | **Yes** |
| D-9 | On-device cache for the launch screens (picker + Summary) | **Yes** — biggest win for far-away users |
| D-10 | Staging API instance | ✅ **Free** (user: "it's only me in staging; we test at a go") — wake it before each test session |
| D-11 | Realtime: fix SSE vs move to Supabase Realtime; web push | **Fix SSE**; web push not now |
| D-12 | Invite feedback: privacy for 4xx, real errors for 5xx/timeouts | **Yes** |
| D-13 | Client releases: one bundled "reliability release" per mobile platform | **Bundled** (one adoption push; the gate enforces it) |
| D-14 | Social model: program People list first | **Yes** |

### Add-on decisions from the console tour (✅ user, 2026-10-11)

| # | Decision | Outcome |
|---|---|---|
| D-15 | Password-reset email never reaches real users (no custom SMTP; Supabase's built-in sender only emails the team) | ✅ **Fix now:** free transactional-email tier (Resend) on `auth.rasifiters.com` — user creates the account + pastes the SMTP key into Supabase; Claude adds the DNS records (per-action OK). Config-only |
| D-16 | Legacy `RaSi_Fiters_API` Render service (1 request in 30 days, still billing) | ✅ **Suspended 2026-10-11** (reversible); delete after a quiet month |
| D-17 | Vercel ignore step only compared a push's last commit (`HEAD^`), silently skipping web changes in multi-commit pushes | ✅ **Fixed 2026-10-11:** compares against `VERCEL_GIT_PREVIOUS_SHA` (last successful deploy), falls back to building |
| — | TestFlight 1.4.3 (57) expires ~2026-10-15 | ✅ Let it lapse; next TestFlight build = the reliability release |
| — | Android Google sign-in (W5) | ✅ **Fixed 2026-10-11** in the console (Play-key OAuth client) and verified on the Pixel |

## 12. Build phases (proposed — parallel where independent)

| Phase | Tracks (run in parallel) | Gate to next |
|---|---|---|
| **1b — Hotfixes** (on approval) | D-1 auth hotfix · D-2 rate limit · D-3 analytics check — backend only, `multiplex`, straight to prod | Logouts + 429s drop in Supabase logs |
| **2 — Foundations** | **A** observability (request log, SQL off, `app_events` + `client-events`, version headers accepted; migrations straight to prod) · **B** staging (schema + role migration, staging service, staging web alias, client env switches, auth guard) · **C** version gate backend (`app-config` additive, unversioned-Android switch) · **D** frontend kits per surface (web / iOS / Android in parallel) | Logs + staging live; kits compile |
| **3 — Reliability** | **Backend first:** per-user rate limits (secret key) + logout/password scopes · sync v2 endpoint + sample ledger + provenance migration · invite transaction + delivery records + device registry. **Then one bundled client release per surface** (web / iOS / Android implementers in parallel): sessions → sync → invites/push → Google button → kit adoption on touched screens → version gate | User tests on iPhone + Pixel + web against **staging**, then prod |
| **4 — Features** | Notification redesign, then the People layer (page redesigns on all three) | — |
