# Phase 0 discovery — evidence briefs (2026-10-11)

One brief per workstream, written by read-only agents (code + production + Pixel 7 evidence). The
orchestrator re-read each brief's load-bearing claims in code / re-ran its key queries before they reached
the user; corrections are recorded here (the briefs themselves are left as written).

| # | Brief | Verified | Corrections / notes |
|---|---|---|---|
| W1 | [Sessions / auth](W1-sessions-auth.md) | ✅ | Re-ran: 31 sessions end fully revoked (includes normal logouts — logout is `global` scope); 8,807 refresh tokens in 30 d, 89.9 % < 60 s after the previous; one user 21 killed sessions. **Cross-user refresh leak confirmed in library code** (auth-js 2.108.2: `lock` null by default → `_callRefreshToken` hands the in-flight promise to any concurrent caller; backend refreshes on the shared client, `authService.js:158`) — flagged to the user as a hotfix task outside the board. |
| W2 | [Push + invites](W2-push-invites.md) | ✅ | Android invite root cause re-read end to end (`inviteService.js:64` → `ProgramActionsSheet.kt:83` / `ProgramPickerScreen.kt:115` → `ProgramContext.kt:385` → `membershipService.js:201` 404). |
| W3 | [iOS health sync](W3-ios-health-sync.md) | ✅ | Double-count re-run: member `d57dad74` had **111** (brief says 69) old `workout_logs` rows rewritten in one minute on 2026-09-23; the only bulk workout-update path is the `on_duplicate:"sum"` branch (`logService.js:196`; `:707` is daily-health). |
| W4 | [Android health sync](W4-android-health-sync.md) | ✅ | Double-count mechanism (changes-token expiry → re-read since connect date, 45-day ledger, `on_duplicate:"sum"`) proven in code, not yet observed in prod. |
| W5 | [Android Google sign-in](W5-android-google-signin.md) | ✅ + **root cause proven live** | Live capture with the user 2026-10-11 19:02 (Pixel 7, Play 1.0.0 (4)): Google's token server → `This android application is not registered to use OAuth2.0 … package name and SHA-1`. = the brief's **H2**: no Android OAuth client in Google Cloud for `com.app.rasifiters` + Play App Signing SHA-1 (Firebase fingerprints ≠ OAuth clients). Fix is console-only (ENV_RUNBOOK §7). |
| W6 | [Observability + perf](W6-observability-perf.md) | ✅ | Out-of-scope security finding confirmed: `/api/analytics*` checks sign-in only, returns member names (`routes/analytics.js`, `analyticsService.js:151`) — separate task. |
| W7 | [Frontend consistency](W7-frontend-consistency.md) | ✅ | — |

BRIEF.md corrections surfaced by W1: the Supabase auth **audit** log is populated (not empty), and iOS
refreshes on **every foreground**, not only near expiry.
