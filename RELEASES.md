# RELEASES.md — Live binary + channel ledger

> **What version is on which channel, per platform.** The single source of truth for what the user is
> *testing* vs what is *shipped to the public*. Keep this in sync with the store consoles, not with the
> code: the version in `apps/ios/**/project.pbxproj` or `apps/android/app/build.gradle.kts` is what will go
> out *next*; this file records what is actually *live on a channel right now*.
>
> **Why separate from PROGRESS.md:** PROGRESS tracks dev/build state; this tracks release-channel state.
> A binary can be code-complete (PROGRESS = green) yet not on any channel (here = not submitted).

## Update protocol

The user drives all store submissions and announces each one. On every push:

1. **Before** a push, the user says what they are about to do (e.g. "uploading iOS 1.3.1 (48) to TestFlight").
   → Claude adds a row to the log with status `uploading` / `in review`.
2. **After** it lands, the user confirms (e.g. "47 is live on TestFlight").
   → Claude flips the log row to its final status and updates the **Current live binaries** table.
3. This file is committed via the `git-version` skill as a `chore(releases)` commit (no feature bump).

Backend note: per the live-binary rule, the backend must stay compatible with **every** binary listed as
live below (oldest included). See the `ios-live-binary-compatibility` lesson.

## Current live binaries (authoritative snapshot)

Version format: `marketingVersion (buildNumber)`. iOS build = `CURRENT_PROJECT_VERSION`; Android build =
`versionCode`. Notes here cover only what is true **now** — the how-we-got-here detail lives in the log below.

**Public listings:** [App Store](https://apps.apple.com/ca/app/rasi-fiters/id6758078961) ·
[Google Play](https://play.google.com/store/apps/details?id=com.app.rasifiters) (both linked from the
`rasifiters.com` landing badges).

### iOS

| Channel | Version | Status | Since | Notes |
|---|---|---|---|---|
| App Store (public) | 1.4.2 (56) | Ready for Distribution (live) | 2026-07-20 | **Current public release.** **1.5.2 (61) removed from review** (2026-10-14, the user's call) to add the program-card time bar; **1.5.2 (62)** is held until the data-source parity fixes land (METHODOLOGY R9), then ships in one push with web + Android (repo set back from 1.5.3 (62) to 1.5.2 (62) — same version while unapproved). The 1.5.2 version keeps **automatic release** and the corrected description. App Privacy now also lists Other Diagnostic Data. Un-updated 1.4.0/1.4.1 installs may linger; the backend must keep degrading gracefully for them |
| TestFlight — external ("Beta Testers") | (none) | No build — 1.4.3 (57) expired 2026-10-14 | 2026-10-14 | 8 invited / 6 installs fall back to App Store 1.4.2. The next external build is the user's call |
| TestFlight — internal ("Internal") | **1.5.2 (61)** | **Testing — the only unexpired build** (uploaded 2026-10-14) | 2026-10-14 | Was the store candidate ((60) + the Month x-axis label fix, summary-activity-detail D-AXIS); pulled from review 2026-10-14 — **(62)** (= (61) + the program-card time bar) replaces it. 56–60 expired 2026-10-14 (housekeeping) |

### Android

| Channel | Version | Status | Since | Notes |
|---|---|---|---|---|
| Play Store (production) | **1.2.1 (8)** | **LIVE — public on Google Play** (published 2026-10-14) | 2026-10-14 | **Current public release** — 100% rollout, 178 countries. R8 on: Play's DEX-optimisation warning (due Feb 2027) is cleared. app-config `LATEST_ANDROID_VERSION_CODE = 8` → "Update available" banner on 1.1.0+ (1.0.0 (4) installs predate the check; the backend must keep degrading gracefully for them). Repo at versionCode 9. **Managed publishing OFF** since 2026-10-14. Listed at [play.google.com/…id=com.app.rasifiters](https://play.google.com/store/apps/details?id=com.app.rasifiters) |
| Play Console — closed testing ("Alpha") | **1.2.2 (9)** | **In review** (sent 2026-10-14 ~21:10 PDT; quick checks, then Google review) | 2026-10-14 | The pooled parity release (METHODOLOGY R9) + D4/D5 server metrics. The route that reaches the user's Pixel; production after the Pixel check. 1.2.1 (8) stays available to testers until 1.2.2 is approved |
| Play Console — closed testing ("Alpha") — prior | 1.0.0 (3) | superseded by (4) | 2026-07-10 | The first Android release. Its Continue-with-Google consent-screen fix is captured in `ENV_RUNBOOK.md` §7 |
| Play Console — internal testing | **1.2.0 (7)** | Available to internal testers (released 2026-10-13 20:57 local) | 2026-10-13 | Superseded — 1.2.1 (8) went straight to closed testing (the Pixel's only channel); internal is unused |

## Release log (append-only, newest first)

| Date | Platform | Version | Channel | Action | Status |
|---|---|---|---|---|---|
| 2026-10-14 | Android | 1.2.2 (9) | Play — closed testing (Alpha) | the pooled parity release (server program progress, PTD days so far, "N members", 1-dp values; plus the live D4/D5 badge + streak server changes); `bundleRelease` by the user, uploaded by the user, notes + send for review by Claude (the user's yes) | **In review** — production after the Pixel check |
| 2026-10-14 | iOS | 1.5.2 (61) | App Store | removed from review (Cancel Submission, the user's call) to add the program-card time bar (iOS program-picker D-BAR); repo set to 1.5.2 (62) for the replacement upload | **Removed** — (62) held for the parity fixes, then one push with web + Android |
| 2026-10-14 | Android | 1.2.1 (8) | Play — production + app-config | approved and published (100%); `LATEST_ANDROID_VERSION_CODE = 8` on prod Render (the user's yes — banner, not a block) | **LIVE — public** |
| 2026-10-14 | Android | 1.2.1 (8) | Play — production | promoted from closed testing after the Pixel check on the Play build (Google sign-in `/auth/oauth` 200, workout batch 201); full rollout (the user's yes) | **Approved → live** (row above) |
| 2026-10-14 | Android | 1.2.1 (8) | Play — closed testing (Alpha) | R8 build (APK 3.39 MB, −13.6 MB); sideloaded smoke test on the Pixel passed (all requests 200/201); uploaded by the user, sent for review with the listing change (review restarted to bundle) | **Approved → available to closed testers** (released 14 Oct 11:50); production after the Pixel check |
| 2026-10-14 | Android | (listing) | Play — store listing | full description refreshed (People, Inbox, reminders; "Connect to Health Connect"); no AI-asset labels; managed publishing turned OFF (the user's call) so it publishes on approval | **Approved → live** on the public listing |
| 2026-10-14 | iOS | 1.5.2 (56–60) | TestFlight | expired every build but (61) — housekeeping (the user's yes); App Store 1.4.2 unaffected | **Expired** |
| 2026-10-14 | iOS | 1.5.2 (61) | App Store | (60) removed from review → (61) attached → description fixed (Health Connect → Apple Health; + People, Inbox, reminders) → resubmitted (the user's yes); manual release kept | **Waiting for Review** — repo pre-bumped to 1.5.3 (62) |
| 2026-10-14 | iOS | 1.5.2 (61) | TestFlight — internal | Month x-axis labels fix; ⌘B + device check + archive/upload by the user | **Processed → Internal group** |
| 2026-10-13 | Android + web | 1.2.0 (7) | app-config + web | `LATEST_ANDROID_VERSION_CODE = 7` on prod Render; `PEOPLE_LIVE = true` on web (the user's call; iOS left for its release) | **Live** |
| 2026-10-13 | Android | 1.2.0 (7) | Play — production + closed testing | both approved; published together with Data safety (the user's yes). Managed publishing publishes every approved change at once — "Remove changes" pulls all of them back to draft, so there is no closed-testing-only publish | **LIVE — public** (store within ~1 h) |
| 2026-10-13 | iOS | 1.5.2 (60) | App Store | version 1.5.2 created; What's New + promotional text + People/Inbox review note; App Privacy + Other Diagnostic Data; submitted (the user's yes), **manual release** | **Waiting for Review** — repo pre-bumped to 1.5.3 (61) |
| 2026-10-13 | iOS | 1.5.2 (60) | TestFlight — internal | archived + uploaded from Xcode by the user; auto-added to the Internal group | **Processed → Internal group** |
| 2026-10-13 | Android | 1.2.0 (7) | Play — production | promoted from internal; Data safety updated (+ Device or other IDs, + Diagnostics; collected, not shared); sent for review together with closed testing (the user's yes). **Managed publishing ON** — approved changes wait for the user's Publish click | **In review** — the store candidate (Phase 4 + release touch-ups) |
| 2026-10-13 | Android | 1.2.0 (7) | Play — closed testing (Alpha) | promoted from internal + sent for review (the user's yes); review restarted once to bundle with production | **In review** — on approval it needs a Publish click (managed publishing) |
| 2026-10-13 | Android | 1.2.0 (7) | Play — internal testing | AAB built from the CLI; the user attached it; Claude set notes + published (the user's yes) | **Available to internal testers** |
| 2026-10-13 | Android | 1.2.0 (6) | Play — closed testing (Alpha) | promoted from internal + sent for review (the user's yes) | **Approved / available (user-confirmed)** — on the user's Pixel 2026-10-13/14 |
| 2026-10-13 | Android | 1.2.0 (6) | Play — internal testing | AAB built from the CLI; the user attached it in the browser pane; Claude set name/notes + published (the user's yes) | **Available to internal testers** — Phase 4 candidate; repo pre-bumped to versionCode 7 |
| 2026-10-13 | iOS | 1.5.1 (59) | TestFlight — internal | uploaded from Xcode; auto-added to the Internal group | **Processed → Internal group** — Phase 4 candidate; repo pre-bumped to 1.5.2 (60) |
| 2026-10-13 | Android | 1.1.0 (5) | Play — closed testing (Alpha) | promoted from internal + sent for review (the user's yes) | **In review**. Why: the internal track's FIRST publish — its opt-in link "can take several hours" (Play help 9845334); the user's Pixel kept showing "Accept invite" ~8.5 h later and stayed on (4) |
| 2026-10-13 | Android | 1.1.0 (5) | Play — internal testing | AAB built from the CLI + uploaded by the user; Claude set testers + notes + published (the user's yes) | **Available to internal testers** — first use of the internal track; repo pre-bumped to versionCode 6 |
| 2026-10-13 | iOS | 1.5.0 (58) | TestFlight — internal | uploaded from Xcode | **Processed → in the Internal group** (Ready to Submit for external — skipped). Reliability overhaul Phase 3 client release; repo pre-bumped to 1.5.1 (59) |
| 2026-08-15 | Android | (no binary) | (repo) | pre-bump for the next train | **versionCode 4 → 5** (`apps/android/app/build.gradle.kts:41`; `versionName` stays `1.0.0` until the next release ships). The live production build consumed (4), so Play rejects any future upload at 4 — the Android analog of the iOS one-train-ahead convention |
| 2026-08-06 | Android | 1.0.0 (4) | Play — production | **approved / released** | **LIVE — public on Google Play** (release date per Play Console; user-announced 2026-08-15). The FIRST Android production release: 100% rollout, 176 countries + rest of world, managed publishing off so it went live automatically on approval. **All four surfaces are now public** (web + backend live, iOS on the App Store, Android on Play) |
| 2026-08-03 | Android | 1.0.0 (4) | Play — production | **FIRST production release submitted** | **In review** — closed-testing build 4 promoted from the library (no new upload), release name "4 (1.0.0)", full 100% rollout, countries = 176 + rest of world. Submitted via Publishing overview (countries changes in review, release submitted after Play's quick checks). Managed publishing off → live automatically on approval |
| 2026-08-03 | Android | (no binary) | Play — production | production access **granted** | **Approved** — the 2026-07-28 application cleared review (announced by the user 2026-08-03); the Production track now shows "Inactive" in the console. No release created yet — next: promote closed-testing 1.0.0 (4) to production, pick countries, roll out (first production release gets app review) |
| 2026-07-28 | Android | (no binary) | Play — production | applied for production access | **In review** — the 14-day/12-tester closed-test gate cleared, and the three-step "Apply for access to production" form was submitted 11:47 (closed test: friends-and-family recruitment, difficult, daily feature-complete usage, feedback gathered one-to-one over messaging; app: general fitness audience, 0–10K first-year installs; readiness: Google-sign-in OAuth fix + UI/stability changes from tester feedback, no open issues, iOS equivalent already public). Play reviews in ≤7 days and emails the account owner. **No production release exists yet** |
| 2026-07-20 | Android | 1.0.0 (4) | Play — closed testing ("Alpha") | production-gate checkpoint | **Day 7 of 14** — Play Console shows "12 testers have currently been opted in for 7 days continuously"; halfway to the ~2026-07-27 production-access unlock |
| 2026-10-11 | iOS | 1.4.3 (57) | TestFlight — external ("Beta Testers") | expiry noted | **Expires ~2026-10-15 (90 days from upload); user lets it lapse** — no re-upload; the next TestFlight build will be the reliability-overhaul release |
| 2026-07-20 | iOS | 1.4.3 (57) | TestFlight — external ("Beta Testers") | beta review approved | **Testing** — first-of-train Beta App Review cleared; 8 testers, expires in 87 days. Later 1.4.3 builds distribute near-instantly. Staged for future beta iteration |
| 2026-07-20 | iOS | 1.4.2 (56) | App Store (public) | approved / released | **Ready for Distribution (live)** — announced by the user 2026-07-20; replaces 1.4.1 (54). **1.4.2 train closes** — repo already at 1.4.3 (57) (pre-bumped 2026-07-17), no action needed |
| 2026-07-17 | iOS | 1.4.3 (57) | TestFlight — external ("Beta Testers") | uploaded + submitted for beta review | **Waiting for Review (Beta App Review)** — first build of the 1.4.3 ahead-train (same code as the 1.4.2 (56) store candidate). User also **removed the 1.4.2 builds (55/56) from TestFlight testing** — (55)'s pending beta review is moot, (56) is the App Store submission; group shows only 1.4.3 (57) |
| 2026-07-17 | iOS | 1.4.2 (56) | App Store (public) | submitted for review | **Waiting for Review (user-announced)** — plan changed from TestFlight-only: (56) submitted as the next public release. Carries the large-screen iPad/Mac adaptive-column pass + the new 13" iPad screenshot set and refreshed iPhone member shot. On approval the 1.4.2 train closes |
| 2026-07-17 | iOS | 1.4.1 (54) | App Store (public) | approved / released | **Ready for Distribution (live)** — seen in ASC console 2026-07-17; replaces 1.4.0 (53) as the public release |
| 2026-07-16 | iOS | 1.4.2 (56) | TestFlight — external ("Beta Testers") | build bump, upload planned | **SUPERSEDED by the 2026-07-17 App Store submission** — (56) was uploaded and became the App Store candidate instead of a beta-only build (see rows above). Original intent: no-review addition to the 1.4.2 train behind (55)'s Beta App Review |
| 2026-07-16 | iOS | 1.4.1 (54) | App Store (public) | submitted for review | **Waiting for Review** — submitted 10:36 AM (submission `fb0cbed5-9532-4688-b250-4a4910814987`). Carries member-analytics 0.4.0 D-C7. Minor update on the approved-1.4.0 base |
| 2026-07-16 | iOS | 1.4.2 (55) | TestFlight — external ("Beta Testers") | uploaded + submitted for beta review | **Waiting for Review (Beta App Review, submitted 12:19 PM)** — first build of the ahead-train; same code as 1.4.1 (54). User also **removed/expired all previous TestFlight builds** — the Beta Testers group now shows only 1.4.2 (55) |
| 2026-07-16 | iOS | 1.4.2 (55) | (repo) | pre-bump for next train | **NEW CONVENTION (user, 2026-07-16): the TestFlight/external-beta train stays ONE AHEAD of the App Store candidate.** Immediately after uploading an App-Store-bound build, bump marketing+build in pbxproj; the candidate is internal-only (external beta review is SKIPPED for it — pointless before a store submission); external Beta App Review runs on the ahead-train instead. Repo at 1.4.2 (55) |
| 2026-07-16 | iOS | 1.4.1 (54) | TestFlight (internal only) | uploaded | **Uploaded (user-announced)** — carries member-analytics 0.4.0 D-C7. Marketing bump forced by 1.4.0 train closure; **App Store candidate** (user will submit 1.4.1 (54) as the next public release — minor update). Skips external beta by convention |
| 2026-07-16 | iOS | 1.4.0 (54) | TestFlight | upload FAILED | **Train closed** — Apple rejected the upload (90186 "Invalid Pre-Release Train: '1.4.0' is closed for new build submissions" + 90062 CFBundleShortVersionString must exceed approved 1.4.0): once 1.4.0 (53) was APPROVED for the App Store, the 1.4.0 train stopped accepting new builds. Lesson: same-version build bumps only work while the train is still beta-only. Superseded by 1.4.1 (54) |
| 2026-07-16 | Android | 1.0.0 (4) | Play — closed testing ("Alpha") | approved / available | **Available to selected testers** (released 10:40) — carries member-analytics 0.4.0 D-C7. versionCode 3→4, versionName unchanged (no production release yet). 14-day production clock unaffected (same track; unlocks ~2026-07-27) |
| 2026-07-15 | iOS | 1.4.0 (53) | App Store (public) | approved / released | **Ready for Distribution (live)** — announced live by the user 2026-07-15. Replaces 1.3.0 (40) as the public release. iOS 1.4.0 train fully shipped (App Store + both TestFlight channels) |
| 2026-07-15 | iOS | 1.4.0 (53) | TestFlight — external ("Beta Testers") | beta review approved | **Testing** — one-time first-of-train Beta App Review cleared; external testers moved off 1.3.1 (52) onto 53. Future 1.4.0 builds distribute near-instantly |
| 2026-07-15 | Android | 1.0.0 (3) | Play — closed testing ("Alpha") | tester gate reached | **12/12 testers opted in** — 14-day production clock running, day 2 of 14 (started ~2026-07-13; production access unlocks ~2026-07-27) |
| 2026-07-11 | iOS | 1.4.0 (53) | App Store (public) | submitted for review | **Waiting for Review** — **first App Store submission since 1.3.0** (submission ID `7de4968b-e3cd-4dcd-b537-b78f813a370f`, submitted 2:46 PM). Marketing bump 1.3.1→1.4.0 (new version record 1.4.0); build 52→53. Carries everything in 1.3.1 (52). In review in parallel with external Beta App Review |
| 2026-07-11 | iOS | 1.4.0 (53) | TestFlight — external ("Beta Testers") | submitted for beta review | **Waiting for Review** (Beta App Review) — **first build of the 1.4.0 train**, so external distribution requires one-time Beta App Review. Also live on Internal now. Once approved, later 1.4.0 builds (54+) to the same external testers clear near-instantly |
| 2026-07-10 | Android | 1.0.0 (3) | Play — closed testing ("Alpha") | approved / available | **Available on the closed track** — **FIRST Android release** (signed AAB, versionCode 3). Review passed. Next: add ≥12 testers, opt them in, 14-day clock before production access |
| 2026-07-10 | Android | 1.0.0 (3) | Play — closed testing ("Alpha") | submitted for review | In review — **FIRST Android release** (signed AAB, versionCode 3). Auto-rolls to the closed track on approval |
| 2026-07-11 | iOS | 1.3.1 (52) | TestFlight (Beta Testers + Internal) | uploaded + distributed | Testing (live to testers; **sole live beta** — 51 and all previous builds expired & removed from testing). Adds the iOS Send Invitation full-pill tap-target fix (program-member-management D-C3 — commit abbdf9f) |
| 2026-07-11 | iOS | 1.3.1 (51) | TestFlight (Beta Testers + Internal) | uploaded + distributed | Expired & removed from testing (superseded by 52). Added the self-healing iOS push-token registration fix (notifications D-C10, v0.3.1 — commit 18168ba) |
| 2026-07-10 | iOS | 1.3.1 (50) | TestFlight (Beta Testers + Internal) | uploaded + distributed | Expired & removed from testing (superseded by 51). Added the keyboard-dismissal change (214ea97) |
| 2026-07-10 | iOS | 1.3.1 (49) | TestFlight (Beta Testers + Internal) | uploaded + distributed | Expired (superseded by 50). Carried auth v0.8.0 + v0.9.0 |
| 2026-07-09 | iOS | 1.3.1 (48) | TestFlight (Beta Testers + Internal) | uploaded + distributed | Superseded by (49) |
| 2026-07-09 | iOS | 1.3.1 (47) | TestFlight (Beta Testers + Internal) | uploaded + distributed | Superseded by (48) |
| (predates ledger) | iOS | 1.3.0 (40) | App Store | released to public | Ready for Distribution (live) |
