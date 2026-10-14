# Reliability overhaul — rolling handoff

> **Volatile — current state only.** Overwrite "Now" + "Next action" at every milestone. When resuming after
> a compaction or in a new session, read `PROGRESS.md` → [`BRIEF.md`](BRIEF.md) → this file, then continue.
> Durable outcomes move to their canonical homes (SPEC §9 D-rules, `METHODOLOGY.md` R-entries); the session
> log below is one line per session.

## Now (2026-10-13, late night) — BOTH APPS SUBMITTED FOR STORE REVIEW

- **Phase:** 1b ✅ → 2 ✅ → 3 ✅ → polish 1 ✅ → Phase 4 ✅ built + device-tested → **release touch-ups ✅ → submitted.**
  - Phase table: [`BRIEF.md`](BRIEF.md) §7. Decisions: [`phase-4/DECISIONS.md`](phase-4/DECISIONS.md).
- **Store state (RELEASES.md):**
  - **iOS 1.5.2 (60): Waiting for Review**, manual release (goes public only on the user's Release click). Also on
    TestFlight Internal — the user's quick check ([`TEST-CHECKLIST`](phase-4/TEST-CHECKLIST.md) §4, incl. "the
    inbox list doesn't jump") **passed**. App Privacy + Other Diagnostic Data. Repo pre-bumped to **1.5.3 (61)**.
  - **Android 1.2.0 (7): production + closed testing in review**, Data safety + Device IDs + Diagnostics. **Managed
    publishing ON** — every approved change waits for the user's Publish click (closed testing → Pixel first).
    Internal testing live. Repo pre-bumped to versionCode **8**.
- **Live:** backend (Render) + web (Vercel) carry everything, incl. tonight's touch-ups. People stays dark on web
  (`PEOPLE_LIVE = false`, `apps/web/src/lib/api/people.ts`) until the store apps are public.
- **Tonight's touch-ups** (plans `plans/phase-4-touchup-{inbox,profile}/`, amendments
  `plans/phase-4-touchup-amendments.md`; each surface reviewed + fix-rounded):
  - (a) Inbox remove one + Clear all — backend `97492d9` (notifications 0.7.0, D-C32), web `fa57ad9`, Android
    `5ca5309`, iOS `1d813c4`. Option (A): every notification row removable; Invitations never touched.
  - (b) Exact reminders `9a57bd0` — user-verified.
  - (c) Profile circle → My Profile, Back returns (D-PC1) — in the same client commits.
  - (d) iOS edge swipe needs a committed drag `728afad` (D-REL2). Follow-the-finger root swipe **dropped by the
    user — don't re-pitch.**
  - (e) iOS People rows `1e74a54`.
  - (f) SEO `cc46131` (landing 0.1.5, D-LAND-12): WebSite `alternateName` = real spellings only, brand-first
    description, hero eyebrow, per-page titles. Live + verified. Owner steps pending (below).
- **Known, accepted:** sign out everywhere ends other devices at their next refresh (≤ 1 h); old iOS 1.4.x refresh
  storm (nudge once 1.5.x is public); iOS Members placeholders on return; CONTEXT-file debt.
- **Open follow-ups:** daily watch (E8 `[refresh]` · `push_deliveries` · `app_events` · scheduler sends); delete
  legacy `RaSi_Fiters_API` ~2026-11-11; Android Health Connect hand-entry test; stale-page-SPEC chip.
- **Boards:** design https://claude.ai/artifact/522hPHN9VSp6db6edCyZ3x · Phase 4
  https://claude.ai/artifact/FDpKpKeBSMcWA1W9zruryD. Both private.

## Next action

1. ~~**The user:** quick TestFlight 60 check (TEST-CHECKLIST §4).~~ **DONE 2026-10-13 — passed.** (A later problem
   → pull the App Store submission, fix, upload **1.5.3 (61)**.)
2. **Play:** Publishing overview → when closed testing is approved, **Publish** (Pixel gets 7) → Pixel quick check
   (§4) → when production is approved, **Publish**.
3. **App Store approved → Release.** Then, once BOTH are public:
   1. Flip `PEOPLE_LIVE = true` → deploy web (a yes to push).
   2. Raise app-config `LATEST_*` (later `MIN_*`).
   3. Update RELEASES.md; mark Phase 4 🚀 shipped in BRIEF §7 + PROGRESS.md.
4. **SEO owner steps** ([`plans/phase-4-seo.md`](plans/phase-4-seo.md)): Search Console → resubmit the sitemap →
   Rich Results Test → URL Inspection → Request indexing. Days–weeks to show "RaSi Fiters".

## Workstream status

| # | Workstream | Discovery | Design | Build | Shipped |
|---|---|---|---|---|---|
| W1 | Sessions / auth | ✅ | ✅ | ✅ all four surfaces | 🟨 backend + web live; phones in store review |
| W2 | Push + invites | ✅ | ✅ | ✅ all four surfaces | 🟨 backend + web live; phones in store review |
| W3 | iOS health sync | ✅ | ✅ | ✅ backend + iOS (since 1.5.0) | 🟨 iOS 1.5.2 (60) in App Store review |
| W4 | Android health sync | ✅ | ✅ | ✅ backend + Android (since 1.1.0) | 🟨 Android 1.2.0 (7) in Play review |
| W5 | Android Google sign-in | ✅ | ✅ | ✅ console fix + button (since 1.1.0) | 🟨 Android 1.2.0 (7) in Play review |
| W6 | Observability + perf | ✅ | ✅ | ✅ backend + client senders (+ instant opens) | 🟨 backend + web live; phones in store review |
| W7 | Frontend state / error / design consistency | ✅ | ✅ | ✅ kit + offline detection + Phase 4 polish | 🟨 web live; phones in store review |

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
  TestFlight 60 check passed. Docs freshness pass.
