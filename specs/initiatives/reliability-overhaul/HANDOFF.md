# Reliability overhaul — rolling handoff

> **Volatile — current state only.** Overwrite "Now" + "Next action" at every milestone. When resuming after
> a compaction or in a new session, read `PROGRESS.md` → [`BRIEF.md`](BRIEF.md) → this file, then continue.
> Durable outcomes move to their canonical homes (SPEC §9 D-rules, `METHODOLOGY.md` R-entries); the session
> log below is one line per session.

## Now (2026-10-15) — POOLED PARITY RELEASE: backend + web LIVE · iOS 1.5.2 (63) + Android 1.2.2 (9) IN REVIEW

- **Phase:** 1b ✅ → 2 ✅ → 3 ✅ → polish 1 ✅ → Phase 4 ✅ built + device-tested → **pooled release in store review.**
  Phase table: [`BRIEF.md`](BRIEF.md) §7. Decisions: [`phase-4/DECISIONS.md`](phase-4/DECISIONS.md).
- **Live (backend + web):** everything, incl. the data-source parity fixes (METHODOLOGY R9, `plans/parity-sweep/`) and
  the D4/D5 metric fixes (`plans/metric-semantics/`), tested on staging first. People is on for web (`PEOPLE_LIVE`,
  `apps/web/src/lib/api/people.ts` — the off switch).
- **Stores (`RELEASES.md` is the SoT):** iOS public 1.4.2 (56); **1.5.2 (63) Waiting for Review**, automatic release
  (61/62 pulled + expired). Android public 1.2.1 (8); **1.2.2 (9) in Play closed-testing review**; managed publishing OFF.
  app-config `LATEST_ANDROID_VERSION_CODE = 8` (banner), `MIN_*` unset. Repos one train ahead: iOS **1.5.3 (64)**,
  Android versionCode **10**.
- **Known, accepted:** sign out everywhere ends other devices at their next refresh (≤ 1 h); old iOS 1.4.x refresh
  storm (nudge once 1.5.x is public); iOS Members placeholders on return; CONTEXT-file debt; until iOS 1.5.2 is
  public, iPhone users see People only on web; zone-less members get the forgiving streak window (M7) until their app
  sends a zone (iOS 1.5.2+, Android 1.2.x, web).
- **Open follow-ups:** daily watch (E8 `[refresh]` · `push_deliveries` · `app_events` · scheduler sends); delete
  legacy `RaSi_Fiters_API` ~2026-11-11; Android Health Connect hand-entry test; stale-page-SPEC chip. **Next Android
  build only** (Play's optional tips): `isShrinkResources = true`, `activity-compose` past 1.9.3; skip AGP 9.
- **Boards:** design https://claude.ai/artifact/522hPHN9VSp6db6edCyZ3x · Phase 4
  https://claude.ai/artifact/FDpKpKeBSMcWA1W9zruryD. Both private.

## Next action

1. **Android 1.2.2 (9) approved in closed testing** → the user checks it on the Pixel → promote to production (the
   user's yes) → on approval: `LATEST_ANDROID_VERSION_CODE = 9` (Render env, the user's yes) → **refresh the testbed**
   (`tools/testbed/seed.mjs --refresh`, the user asked: after the production push) → RELEASES.md.
2. **iOS 1.5.2 (63) approved** → live on its own → `LATEST_IOS_VERSION = 1.5.2` (the user's yes) → RELEASES.md.
   With both public: mark Phase 4 🚀 in BRIEF §7 + PROGRESS. `MIN_*` (the hard block) only once adoption allows.
3. ~2026-10-27: recheck Google's shown site name ([`plans/phase-4-seo.md`](plans/phase-4-seo.md)).

## Workstream status

| # | Workstream | Discovery | Design | Build | Shipped |
|---|---|---|---|---|---|
| W1 | Sessions / auth | ✅ | ✅ | ✅ all four surfaces | 🟨 backend + web + Android live; iOS 1.5.2 (63) in review |
| W2 | Push + invites | ✅ | ✅ | ✅ all four surfaces | 🟨 backend + web + Android live; iOS 1.5.2 (63) in review |
| W3 | iOS health sync | ✅ | ✅ | ✅ backend + iOS (since 1.5.0) | 🟨 iOS 1.5.2 (63) in review |
| W4 | Android health sync | ✅ | ✅ | ✅ backend + Android (since 1.1.0) | ✅ Android public (1.2.1 (8)) |
| W5 | Android Google sign-in | ✅ | ✅ | ✅ console fix + button (since 1.1.0) | ✅ Android public (1.2.1 (8)) |
| W6 | Observability + perf | ✅ | ✅ | ✅ backend + client senders (+ instant opens) | 🟨 backend + web + Android live; iOS 1.5.2 (63) in review |
| W7 | Frontend state / error / design consistency | ✅ | ✅ | ✅ kit + offline detection + Phase 4 polish | 🟨 web + Android live; iOS 1.5.2 (63) in review |

## Session log

- **2026-10-10** — Scoping. Evaluated an AWS move → shelved, stack stays (R8). Reviewed 30 days of Render
  metrics + Supabase usage (healthy core; 401 ≈ 22%, 409 noise, no request logs). Found first suspects S1–S9
  in code. User decisions: Supabase Pro, staging via the same project (staging tables), Step 0 = token-based
  access for all three services. Created `BRIEF.md` + this file. Same day: user created all tokens (Vercel
  project-scoped; Supabase read-only default + full-access admin) — all verified; read Supabase Auth session
  settings (BRIEF S8); Android Google sign-in failure confirmed on the Play build; Pixel 7 authorized for adb
  (2026-10-11).
- **2026-10-11** — Session 1. Step 0: token-only access + `token-guard` hook + `tools/ops-get.sh` /
  `tools/supabase-logs.sh`. Phase 0: 7 parallel discovery agents → verified briefs. Walkthrough W1–W7 with the
  user (decisions → the design board). Design board published (artifact with a `db` answer store), adversary-reviewed,
  **approved**. Console tour in the built-in browser: W5 Google sign-in fixed + verified, legacy API suspended,
  Vercel ignore step fixed, password-reset email gap found → Resend set up (SMTP save pending). Phase 1b plan
  approved; implementer running.
- **2026-10-12** — Phase 1b shipped: H1 (auth 0.10.0) + H3 (analytics 0.4.0 / analytics-v2 0.2.0) reviewed →
  deployed → prod smoke 27/27 + user check on all 3 surfaces; D-15 Resend SMTP live; H2 rate limit → 1,500;
  7-day watch started (day 0 clean). Phase 2 planned as 4 parallel tracks, user-approved, built + deployed the same
  day: C app-config 0.2.0 · A observability 0.1.1 (migration 007, smoke 28/28) · D frontend-kit 0.1.0 (unadopted) ·
  B staging (auth 0.12.0, migration 008, `rasifiters-api-staging`, Vercel `staging` preview; web + iOS verified).
  User preferences: staging opt-in for risky changes only (Android `debug` → prod, opt-in `staging` build type),
  keep disk lean, iOS builds = the user's ⌘B.
- **2026-10-12/13** — Watch day 0 clean. Phase 3 backend planned (3 parallel `plan-pipeline` tracks), user-approved
  with amendments + gate waived ("asap"), built in 3 worktrees, impl-adversary'd (0 blocking; fix rounds folded in),
  merged R1 → R2 → R3, migrations 009 + 010 run by the user on staging then public, one staging deploy + smokes, one
  prod push (02:24Z), prod smokes + phones verified, G3 IP forwarding + G4 90-day inactivity applied. Phase 4 scope
  note: start from the full page / feature / widget inventory (BRIEF §7).
- **2026-10-13** — Phase 3 client release: scope confirmed with the user (instant opens added; Phase 4 = notifications
  + People + a polish pass judged on benefit vs effort). 3 parallel plans + a parity check (8 blocking cross-surface
  mismatches) → one shared amendments file, user-approved (U1–U3). Built by 3 implementers in the main tree,
  reviewed + fix rounds (web 7 · Android 11 · iOS 10); web live; iOS ⌘B clean twice (new `tools/ios-typecheck.sh`
  pre-check); Android compile clean. Supabase reuse window 10 → 60 s. Shared docs + tags in one commit.
- **2026-10-13 (cont.)** — Uploads: iOS 1.5.0 (58) → TestFlight Internal; Android 1.1.0 (5) built from the CLI →
  Play internal (first-ever internal track: opt-in took hours) + closed testing. Device tests pass on both. Polish 1
  (offline detection) built, reviewed, shipped (frontend-kit 0.3.0). Phase 4 discovery (9 agents) → decision board →
  the user picked all 45 polish fixes + two new (#46 iOS chart tooltip, #47 CSV export) and all recommendations except
  D-N1 (all four notification categories at once). Store release waits for all of Phase 4.

- **2026-10-13 (night)** — Phase 4 planned in three waves (A: quick wins + privacy; B: Notifications + People
  server → clients → parity; C: polish #9–#45), each user-approved with amendments, then built by per-surface
  implementers with an adversary review and fix rounds each. Migrations 011/012 run by the user. Backend + web live;
  phones on TestFlight 59 / Play internal + closed (in review). Docs and tags for all three waves. User testing next.

- **2026-10-13 (late night)** — Release touch-ups: two parallel plan-pipelines (inbox, profile circle) + a
  back-swipe investigation + an SEO audit; 4 per-surface implementers, adversary reviews + fix rounds; backend +
  web + SEO live. Builds iOS 1.5.2 (60) / Android 1.2.0 (7); **both submitted** (App Store manual release; Play
  managed publishing), App Privacy + Data safety updated. Repo pre-bumped to 1.5.3 (61) / versionCode 8. The user's
  TestFlight 60 check passed. Docs freshness pass. Search Console: sitemap resubmitted, Rich Results valid, indexing
  requested for the home page + 5 waiting pages. Android 1.2.0 (7) published (all three approved Play changes). Public Privacy /
  Support / Delete-account pages restyled in the landing chrome (landing D-LAND-13). People on for web +
  `LATEST_ANDROID_VERSION_CODE = 7` (the user's call, iOS left for its release). One Privacy Policy copy: web's
  account menus open the public page like the phones; `/program/privacy` retired → 308 (privacy-policy D-ONE).

- **2026-10-14** — Testbed refreshed (seeder now seeds only test accounts). iOS Month x-axis labels squished on the
  Xcode 27 SDK → fixed (summary-activity-detail D-AXIS); 1.5.2 (61) swapped into the review, iOS description
  corrected (it said Health Connect), resubmitted; TestFlight 56–60 expired. Repo 1.5.3 (62). Play description refreshed;
  managed publishing OFF; Android R8 on → 1.2.1 (8) sideload-tested on the Pixel, in closed-testing review; App Store
  switched to automatic release (the user). Repo versionCode 9. 1.2.1 (8) verified on the Play build →
  production → **live**, `LATEST_ANDROID_VERSION_CODE = 8` (banner); testbed re-refreshed (reviewer admin drift healed,
  3 reviewer-made programs removed).
- **2026-10-14 (later)** — Program-card bar fix (web + iOS → `progress_percent`, pages D-BAR; web live). The user
  pulled 1.5.2 (61) from review to include it; repo set to 1.5.2 (62). `audit` skill now three-surface + data sources.
  Later: the user held (62) — the sweep's data-source fixes (D1 server progress, D2 PTD days-so-far, D3 "N members")
  go in first, then one push to all three; parity rule recorded as METHODOLOGY R9 (no shared version numbers).
- **2026-10-14/15 (release)** — Pooled release: D4/D5 backend live (`fd6c15b`) after a staging test (web + iOS; the Pixel
  can't take local builds — Android via closed testing). Android 1.2.2 (9) → closed-testing review; iOS 1.5.2 (63)
  submitted (61/62 expired). Repos pre-bumped iOS 1.5.3 (64), Android vc 10.
