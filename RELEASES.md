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
| TestFlight — external ("Beta Testers") | 1.3.1 (49) | Testing | 2026-07-10 | 6 testers; the only build in active beta use (supersedes 48). First binary carrying auth v0.8.0 (federated sign-in) + v0.9.0 (link/unlink account settings) |
| TestFlight — internal ("Internal") | 1.3.1 (49) | Testing | 2026-07-10 | same build |

### Android

| Channel | Version | Status | Since | Notes |
|---|---|---|---|---|
| Play Store (production) | none yet | not released | — | no public release yet |
| Play Console — internal testing | none yet | not submitted | — | port code-complete; waiting on Google account verification, then first internal-testing upload |

## Release log (append-only, newest first)

| Date | Platform | Version | Channel | Action | Status |
|---|---|---|---|---|---|
| 2026-07-10 | iOS | 1.3.1 (49) | TestFlight (Beta Testers + Internal) | uploaded + distributed | Testing (live to testers; sole live beta). Carries auth v0.8.0 + v0.9.0 |
| 2026-07-09 | iOS | 1.3.1 (48) | TestFlight (Beta Testers + Internal) | uploaded + distributed | Superseded by (49) |
| 2026-07-09 | iOS | 1.3.1 (47) | TestFlight (Beta Testers + Internal) | uploaded + distributed | Superseded by (48) |
| (predates ledger) | iOS | 1.3.0 (40) | App Store | released to public | Ready for Distribution (live) |
