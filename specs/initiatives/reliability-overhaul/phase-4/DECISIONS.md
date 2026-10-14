# Phase 4 — decisions (user, 2026-10-13)

> **Status: built + device-tested 2026-10-13** (backend + web live; Android public (1.2.1 (8)); iOS 1.5.2 (61) in App Store
> review). Amendments made while building: `../plans/phase-4-{wave-a,np,polish,touchup}-amendments.md`; the as-built
> rules live in the feature SPECs (§9).

> From the decision board (https://claude.ai/artifact/FDpKpKeBSMcWA1W9zruryD, `db` doc `board/phase4`) + the user's
> messages. Options and rationale: [`DISCOVERY.md`](DISCOVERY.md). Planning builds against this file.

## Scope + order
- **Everything ships in ONE store release** after all of Phase 4 is built and tested (iOS + Android); server parts go
  live as they're ready (safe for old apps); web ships as each part is reviewed.
- **Order (D-0 a):** polish quick wins #1–#8 → privacy fix (S0 / D-P8) → Notifications N1–N8 → People S1–S6 → the
  rest of the polish alongside. #1 (offline detection) is DONE (frontend-kit 0.3.0; web live, phones next build).

## Polish — all 45 picked, plus three new
All rows #1–#45 of DISCOVERY §2. New from the user's device testing:
- **#46 iOS chart tooltip clipped at the top** — on a tall bar the tooltip's date/title is cut off by the chart's top
  edge (Workout Activity Timeline; fine on a short bar; fine on Android). Fix: keep the tooltip inside the chart
  bounds (clamp / flip) in the shared iOS chart tooltip, so every iOS chart gets it; check web for the same.
- **#47 Member Performance Metrics CSV export must match the page** — the user's mother shares it in WhatsApp groups.
  The export uses the page's current sort, filter and search, in the same order, and the most relevant fields first
  (Active Days, Workouts, Total Duration, …, matching the cards); identical on web, iOS and Android.
- **#48 RaSi brand mark on the public info pages** — web `/privacy-policy`, `/support` and `/delete-account` lack the
  `BrandMark` that login, create-account, forgot/reset password and the landing page show. The phones' Privacy /
  Support rows open these web pages, so one web change covers all three. Quick win.

## Notifications — as recommended, except D-N1
| # | Decision |
|---|---|
| D-N1 | **(a) All four categories ship together: Program & invites · Activity · Reminders · Digest** (user's override) |
| D-N2 | (c) Program & invites off = no alert but stays in the inbox; Reminders / Digest off = never created |
| D-N3 | (b) floating toast + inbox + unread badge (no blocking pop-up) |
| D-N4 | (b) "My Invites" grows into Inbox in the "+" sheet; badge = unread + invites; Inbox row in the account menu |
| D-N5 | (a) read = today's acknowledged flag |
| D-N6 | (a) time zone captured automatically from each app/browser |
| D-N7 | (b) member picks the reminder time (default 7 pm) |
| D-N8 | (a) one reminder, only if nothing logged today; streak wording when streak ≥ 2 |
| D-N9 | (a) 15-minute timer inside the API + a never-send-twice key |
| D-N10 | (a) one preferences row per member |
| D-N11 | (a) delete after 90 days, nightly (run before the inbox ships) |
| D-N12 | (b) iOS asks once after the first sign-in |
| D-N13 | (b) program updated/deleted alerts on, not to the person who made the change |
| D-N14 | (a) app-icon badge, only after old iPhone apps are required to update |
| D-N15 | one big store release (already decided) |
| D-N16 | (a) web composer for global admins: target a program / members / everyone, merge fields (name, streak, program), preview, send now or at each person's local time; push + inbox under an "Announcements" category |
| D-N17 | (b) templates filled with each person's data + rotating wordings; the template slot is where AI-written content + email plug in later (board §9 Direction) |

## People — all as recommended
D-P1 (a) current program · D-P2 (a) roster becomes People via a header button, dashboard stays, name "Members" ·
D-P3 (a) workouts only (streaks, active days this month, last ~10 workouts, last active) · D-P4 (b) kudos: one tap per
person per day, undoable, count only · D-P5 (a) kudos on a person's day · D-P6 (a) visible by default + "Hide my
activity" · D-P7 (a) one switch, hides from plain co-members, staff still see · D-P8 (a) **close all privacy gaps first**
· D-P9 (a) no person-to-person blocking · D-P10 (a) initials only · D-P11 (a) editing memberships stays global-admin.
