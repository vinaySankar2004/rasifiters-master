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
`versionCode`.

### iOS

| Channel | Version | Status | Since | Notes |
|---|---|---|---|---|
| App Store (public) | 1.4.0 (53) | Ready for Distribution (live) | 2026-07-15 (announced) | **current public release** — approved & live (replaces 1.3.0 (40)). **1.4.1 (54) submitted 2026-07-16 10:36, Waiting for Review** (submission `fb0cbed5-9532-4688-b250-4a4910814987`) — flips this cell on approval. Oldest live iOS binary the backend must stay compatible with is 1.4.0 (53); un-updated 1.3.0 installs may linger; keep degrading gracefully |
| TestFlight — external ("Beta Testers") | 1.4.2 (55) | Waiting for Review (Beta App Review) | 2026-07-16 (announced) | the ahead-train build (same code as 1.4.1 (54): member-analytics 0.4.0 D-C7) — one-time Beta App Review of the new train pending; **all previous TestFlight builds removed/expired by the user 2026-07-16** (group shows 1 build: 1.4.2 (55)), so external testers have no active build until this clears |
| TestFlight — internal ("Internal") | 1.4.1 (54) | Uploaded | 2026-07-16 (announced) | 1.4.1 (54) = **App Store candidate** (now in App Store review; internal-only on TestFlight, skipped external beta by convention). Prior builds (≤53) removed/expired |

### Android

| Channel | Version | Status | Since | Notes |
|---|---|---|---|---|
| Play Store (production) | none yet | not released | — | no public release yet; gated on the closed-test 12-testers-for-14-days requirement |
| Play Console — closed testing ("Alpha") | 1.0.0 (4) | Available (approved) | 2026-07-16 | **member-analytics 0.4.0 D-C7 build** — reviewed & released to the track 2026-07-16 10:40 (replaces 1.0.0 (3)); testers update automatically. Production gate unaffected: 14-day clock keeps running (unlocks ~2026-07-27). Backend must stay compatible with testers still on (3) until they update |
| Play Console — closed testing ("Alpha") — prior | 1.0.0 (3) | superseded by (4) | 2026-07-10 | **FIRST Android release** — approved & live on the closed track. Signed AAB (upload key + Play App Signing); all app-content + store listing complete. Play App Signing SHA-1 registered in Firebase for Continue-with-Google. **2026-07-11: Continue-with-Google fixed for all testers** — the OAuth consent screen (Google Auth Platform → Audience) was published from *Testing* to **Production**; while in Testing only owners/test-users got a credential and non-owner testers saw "No credentials available" (see `ENV_RUNBOOK.md` §7). **Production gate: 12/12 testers opted in — 14-day clock running, day 2 of 14 as of 2026-07-15** (started ~2026-07-13; production access unlocks ~2026-07-27) |
| Play Console — internal testing | (skipped) | not used | — | went straight to closed testing (no personal Android device to run internal builds) |

## Release log (append-only, newest first)

| Date | Platform | Version | Channel | Action | Status |
|---|---|---|---|---|---|
| 2026-07-16 | iOS | 1.4.2 (56) | TestFlight — external ("Beta Testers") | build bump, upload planned | **Preparing upload (user-announced)** — carries the iOS large-screen iPad/Mac adaptive-column pass (100% screen coverage; presentation-only). Same 1.4.2 train as (55), whose first-of-train Beta App Review is pending — once that clears, (56) distributes to external testers with **no additional review** |
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
