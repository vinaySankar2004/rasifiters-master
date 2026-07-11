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
| App Store (public) | 1.3.0 (40) | Ready for Distribution (live) | — | current public release; oldest live binary the backend must stay compatible with |
| TestFlight — external ("Beta Testers") | 1.3.1 (52) | Testing | 2026-07-11 | 7 testers; the only build in active beta use (all previous builds — incl. 51 — expired & removed from testing). Adds the iOS Send Invitation full-pill tap-target fix (program-member-management D-C3) on top of the push-token registration fix + keyboard-dismissal change + auth v0.8.0/v0.9.0 |
| TestFlight — internal ("Internal") | 1.3.1 (52) | Testing | 2026-07-11 | same build |

### Android

| Channel | Version | Status | Since | Notes |
|---|---|---|---|---|
| Play Store (production) | none yet | not released | — | no public release yet; gated on the closed-test 12-testers-for-14-days requirement |
| Play Console — closed testing ("Alpha") | 1.0.0 (3) | Available (approved) | 2026-07-10 | **FIRST Android release** — approved & live on the closed track. Signed AAB (upload key + Play App Signing); all app-content + store listing complete. Play App Signing SHA-1 registered in Firebase for Continue-with-Google. **2026-07-11: Continue-with-Google fixed for all testers** — the OAuth consent screen (Google Auth Platform → Audience) was published from *Testing* to **Production**; while in Testing only owners/test-users got a credential and non-owner testers saw "No credentials available" (see `ENV_RUNBOOK.md` §7). Next gate to production: ≥12 testers opted-in for ≥14 days (currently 0 opted in) |
| Play Console — internal testing | (skipped) | not used | — | went straight to closed testing (no personal Android device to run internal builds) |

## Release log (append-only, newest first)

| Date | Platform | Version | Channel | Action | Status |
|---|---|---|---|---|---|
| 2026-07-10 | Android | 1.0.0 (3) | Play — closed testing ("Alpha") | approved / available | **Available on the closed track** — **FIRST Android release** (signed AAB, versionCode 3). Review passed. Next: add ≥12 testers, opt them in, 14-day clock before production access |
| 2026-07-10 | Android | 1.0.0 (3) | Play — closed testing ("Alpha") | submitted for review | In review — **FIRST Android release** (signed AAB, versionCode 3). Auto-rolls to the closed track on approval |
| 2026-07-11 | iOS | 1.3.1 (52) | TestFlight (Beta Testers + Internal) | uploaded + distributed | Testing (live to testers; **sole live beta** — 51 and all previous builds expired & removed from testing). Adds the iOS Send Invitation full-pill tap-target fix (program-member-management D-C3 — commit abbdf9f) |
| 2026-07-11 | iOS | 1.3.1 (51) | TestFlight (Beta Testers + Internal) | uploaded + distributed | Expired & removed from testing (superseded by 52). Added the self-healing iOS push-token registration fix (notifications D-C10, v0.3.1 — commit 18168ba) |
| 2026-07-10 | iOS | 1.3.1 (50) | TestFlight (Beta Testers + Internal) | uploaded + distributed | Expired & removed from testing (superseded by 51). Added the keyboard-dismissal change (214ea97) |
| 2026-07-10 | iOS | 1.3.1 (49) | TestFlight (Beta Testers + Internal) | uploaded + distributed | Expired (superseded by 50). Carried auth v0.8.0 + v0.9.0 |
| 2026-07-09 | iOS | 1.3.1 (48) | TestFlight (Beta Testers + Internal) | uploaded + distributed | Superseded by (49) |
| 2026-07-09 | iOS | 1.3.1 (47) | TestFlight (Beta Testers + Internal) | uploaded + distributed | Superseded by (48) |
| (predates ledger) | iOS | 1.3.0 (40) | App Store | released to public | Ready for Distribution (live) |
