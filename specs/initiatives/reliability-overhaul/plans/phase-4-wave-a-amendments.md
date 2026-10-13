# Phase 4 wave A — approval amendments (binding)

> These amend [`phase-4-q-quick-wins/plan.md`](phase-4-q-quick-wins/plan.md) and
> [`phase-4-s0-privacy/plan.md`](phase-4-s0-privacy/plan.md). Each comes from that plan's `verdict.md`: the
> orchestrator took the adversary's fix unless this file says otherwise. Where an amendment and a plan disagree, the
> amendment wins.

## Track Q — quick wins

| # | Amendment |
|---|---|
| QA1 | **#47 CSV units.** The user's choice decides between units in the headers (the plan's Q-3) and units in the cells. The answer is recorded at approval in the "User decisions" section below. |
| QA2 | **iOS #5.** `loadUserData` loads Recent for `loggerViewAsMember?.id ?? userId` when `isLogger`, so the View-as card never shows the logger's own rows. This matches Android step 4(b). |
| QA3 | **Android anchors.** Match on the quoted text, not on line ranges. In the `MembersScreen.kt` (b) replacement, `roster` and `loggerViewAsId` (:153-154) stay declared. Each `onFailure` block is replaced whole, through its closing brace. |
| QA4 | **Android #2.** The invites tab in `ProgramActionsSheet.kt` shows `if (!online) AppError(AppErrorKind.OFFLINE) else state.error`, the same as the picker, Summary and iOS (polish-1 rule 6). |
| QA5 | **iOS `AdminWorkoutTypesTab`.** Drop the new skip of `loadLookupData()`, so every visit still refreshes the roster, program and role. #5 only runs the reads in parallel. |
| QA6 | **iOS #47.** `MemberMetricsDetailView.loadMetrics()` gets the queued-reload loop from step 8. A sort, filter or search change made during a load reloads once that load ends, so the list and the CSV always match the controls. |
| QA7 | **iOS file size.** `WidgetCoverView` goes in its own file under `App/` (`AppRootView.swift` stays at or under ~200 lines). |
| QA8 | **Android #8 copy.** `ProgramPickerScreen.kt` uses "Couldn't save program order. …" (a full stop, not a colon), the same as web and iOS. |

## Track S0 — privacy fix

| # | Amendment |
|---|---|
| SA1 | **Q1 changed.** `GET /api/members` returns only the viewer's own row to anyone who is not a global admin, not `[]`. This keeps iOS `loggedInMember` working when the launch fetch finishes after a program is picked (verdict 1). |
| SA2 | **Verdict 2 is moot.** A read-only prod check on 2026-10-13 found **0** `program_memberships` rows with status `invited` or `requested`. Record this in program-memberships D-C5. No code change. |
| SA3 | **SPEC text.** Add one-line fixes so no SPEC still states a rule this change replaces: daily-health-logs §4 "List", the analytics and analytics-v2 "every route is …" lines, program-memberships §4 (the two roster functions) and members §7. |
| SA4 | **SPEC anchors.** Match on the row's full context, not the short quoted fragment. Only row 3 of daily-health-logs changes; the PUT and DELETE rows stay. |
| SA5 | **Close the write-side gap too.** `resolveLogPermissions` and `isProgramAdmin` (`services/logService.js`) give admin or logger rights over **other** members only when the membership is `active`. A removed staff member keeps self-only access, as a plain member has. Global admins are unchanged, and so are active admins and loggers in every live binary. Record it in the D-C7 text instead of listing it as a follow-up. |
| SA6 | **File size.** Drop the duplicated header comment in `memberService.js`, so the file stays at or under ~200 lines. |

## User decisions (at approval)

- **Wave A approved (2026-10-13):** build it.
- **QA1 = units in the headers.** This is the plan's Q-3 column contract as written: plain numbers in the cells, and a missing value is an empty cell.
