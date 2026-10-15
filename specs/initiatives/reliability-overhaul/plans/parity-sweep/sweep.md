# Data-source parity sweep — findings + fix plan (read-only sweep, 2026-10-14)

## Context

On 2026-10-14 the web + iOS program-card bars were found drawing `active_members / total_members` (always equal) while
Android drew `progress_percent`. The `audit` skill now has a data-source check; this sweep applied it to every displayed
measure on the picker, Summary, Members, Lifestyle and Program tab (+ detail views) on web, iOS and Android.
Method: backend contract read first; three per-surface traces; every load-bearing claim below re-read first-hand
(file:line cited) — the web date shift was reproduced under `TZ=America/Vancouver`. No repo file was edited.
Full 30-row table + the three raw traces: `~/Library/Application Support/Claude/side-session-notes/local_a4f0bcd4-…/`
(`data-source-sweep-findings.md`, `sweep-{web,ios,android}.md`).

Headline: the always-full bar is gone, but **the same class of silent split exists in three more places** — program
progress has three different sources on Summary, "PTD MP %" divides by two different things, and web shows dates a day
early west of UTC — plus one remaining value that can never vary ("N active / N total members").

Known splits confirmed, not re-raised: web `program/page.tsx:510-529` `computeProgramProgress` (D-C3/F4) vs
`summary/page.tsx:449-451` server `progress_percent`; Android Summary Deviation A-3 (`SummaryScreen.kt:126-130`).

## Findings table

Paths: web `apps/web/src/`, iOS `apps/ios/RaSi-Fiters-App/`, Android `apps/android/app/src/main/java/com/app/rasifiters/`.
Sev: H = same user/moment, materially different number or date · M = different rounding/scope/data set · L = cosmetic/latent.

| ID | Sev | Screen · measure | Web source | iOS source | Android source | Classification | Recommended fix |
|---|---|---|---|---|---|---|---|
| P-1 | — | Picker card · bar | `/programs.progress_percent` `app/programs/page.tsx:883` | same `Features/Home/ProgramPickerView.swift:1022` | same `ui/programs/ProgramPickerScreen.kt:473` | match (243613a) | — |
| P-2 | M | Picker card · "N active / N total members" | `active_members`/`total_members` `programs/page.tsx:879-880,925` | same `ProgramPickerView.swift:1014-1018` | same `ProgramPickerScreen.kt:638` | **can-never-vary** (BE `programService.js:42-43,70-71` one expression) | D3: single "N members" |
| S-1 | H | Summary · Program Progress ring % | `/analytics/summary → program_progress.progress_percent` `app/summary/page.tsx:449-451` | **client** `completionPercent`, local `Calendar` `Shared/Models/ProgramContext.swift:310-327` → `AdminSummaryTab.swift:246-254` (`program_progress` not decoded) | `/programs.progress_percent` snapshot `ui/summary/SummaryScreen.kt:128` | **drift** — 3 sources, 1 ring | Batch B |
| S-2 | M | Summary · "E/T days", elapsed, remaining | server `elapsed/total/remaining_days` `summary/page.tsx:451-452,489-503` | client `ProgramContext.swift:314-322` | client `LocalDate.now()` beside server % `SummaryScreen.kt:277-292` | drift (Android mixes UTC % + device-day counts in one card) | Batch B |
| S-3 | M | Program tab (non-admin) · progress %, days | client `round(timestamp)`, rolls 12:00 UTC `app/program/page.tsx:510-529` | client `StandardProgramTab.swift:166-180` | client `Math.round` `ui/program/ProgramCards.kt:243-264` | known split — now **3 rollover moments** (BE 00:00 UTC, web 12:00 UTC, mobile local midnight) | Batch B |
| S-4 | M | Summary · MTD Participation % | `participation_pct.toFixed(1)%` `summary/page.tsx:279-286` | `Int(pct)` truncates `Features/Home/Tabs/SummaryCards.swift:213` | `roundToInt()` `ui/summary/SummaryCards.kt:205` | **drift**: 66.7 → "66.7%" / "66%" / "67%" | Batch A |
| S-5 | — | Summary · "A/T members active" | `participation/mtd` `summary/page.tsx:287-293` | same `SummaryCards.swift:217` | same `SummaryCards.kt:205` | match, varies | — |
| S-6 | M | Summary · ▲▼ change badges ×4 | `change_pct` `summary/page.tsx:294-331` | same `SummaryCards.swift:226-407` | same `SummaryCards.kt:146-223` | match on source; **BE semantics**: month-to-date vs the *whole* previous month (`utils/queryHelpers.js:20-37`), sticky +100/0 (`:13-18`), 0 draws green ▲ | D4 (BE) |
| S-7 | L | Summary · Total duration | always `x.x hrs` `summary/page.tsx:312` | drops ".0" `ProgramContext+Analytics.swift:67` | same `SummaryCards.kt:215-218` | cosmetic drift | Batch A |
| S-8 | L | Summary · activity card headline | label + "Daily avg" shown `summary/page.tsx:246-253` | fetched, not shown `SummaryChartCards.swift:55-148` | not shown `ui/summary/SummaryCharts.kt:91` | intentional (undocumented) | document |
| S-9 | M | Summary · Distribution by day | `/analytics/distribution/day` `summary/page.tsx:141-150` | same **+ silent fallback to 7-day `summary.distribution_by_day`** `ProgramContext+Analytics.swift:62,76-79` | same as web | drift (iOS failure path) | Batch A/B |
| S-10 | M | Summary · Top Workout Types | limit 50, top **6**, no Others `summary/page.tsx:157,211-214` (SPEC :69 says "by sessions") | limit 100, top 5 + Others `SummaryChartCards.swift:305-369` | same as iOS `ui/summary/SummaryCharts.kt:184-211` | drift | Batch A |
| S-11 | M | Activity + Member-history detail · DAILY AVERAGE | `.toFixed(1)` `summary/activity/page.tsx`, `members/history/page.tsx:34-51` | `%.0f` `Features/Home/Detail/ChartDetailComponents.swift:28` | `roundToInt()` `ui/summary/ActivityDetailScreen.kt:136`, `ui/members/MemberSimpleDetails.kt:167` | drift + near-constant on mobile (0/1) | Batch A |
| S-12 | L | Timeline detail · range label | server label "Last 7 Days" | literal "This Week" `ChartDetailComponents.swift:283` | "This Week" `ActivityDetailScreen.kt:53` | cosmetic drift | Batch A (opt.) |
| S-13 | L | Workout-types detail · share % | none `summary/workout-types/page.tsx:81` | `Σ` of returned `WorkoutTypesDetailView.swift:19-39` | `WorkoutTypesDetailScreen.kt:45-47` | intentional (undocumented) | document |
| M-1 | **H** | Members · "PTD MP %" + "a / b days" | `active_days ÷ whole-program days`, unclamped `components/members/MemberDashboardCards.tsx:78-85,121-126` | `active_days ÷ elapsed-to-date (≤ end)+1`, unclamped `Features/Home/Tabs/MemberOverviewPicker.swift:92-101,159-164` | same family, device today `ui/members/MemberCards.kt:294-295,608-615` | **drift**: mid-program web ≈ ½ the mobile % | D2 → Batch A |
| M-2 | L | Members · "N members" | `member-metrics.total` `members/page.tsx:144-152` | `MemberOverviewPicker.swift:417` | `MemberCards.kt:421-425` | match (BE `total` counts hidden-activity members) | document |
| M-3 | M | Members · Current streak | 3 endpoints, same BE fn | same | same | match; **BE: current never resets to 0** (`memberAnalyticsService.js:41-46`) | D5 (BE) |
| M-4 | L | Members · avg diet | `toFixed(1)` → always "N.0" `members/page.tsx:556,609` | "N / 5" | "N" / "N / 5" | cosmetic drift | Batch A |
| M-5 | M | Member workouts / health detail rows | `limit:0` → **1000** `lib/api/members.ts:158,193` | `limit=0` unbounded | `limit=0` unbounded | drift (silent cap; CSV truncated) | Batch A |
| M-6 | **H** | Web dates · program card range, Program tab Duration, Members "View Workouts" | `new Date("YYYY-MM-DD")` UTC → local `lib/format.ts:7-16` — **Oct 12 → "Oct 11, 2026" under America/Vancouver (reproduced)** | local parse `ProgramPickerView.swift:1004-1012` | `LocalDate.parse` `ProgramPickerScreen.kt:613-633` | **drift**, web-only, every UTC-negative locale | Batch A |
| L-1 | L | Lifestyle · Highest participation | program-wide `lifestyle/page.tsx:183-187` | `ProgramContext+Lifestyle.swift:54` | `core/ProgramContext.kt:1411` | match (documented); null state differs (web "N/A"+"0.0%", mobile "No data"); latent BE meaning flip if `memberId` sent | Batch A (null state) |
| L-2 | L | Lifestyle · Avg steps/day vs Daily avg steps | `health/steps` vs `health/timeline` | same | same | match; two definitions | document |
| L-3 | L | Lifestyle · popularity list | limit 120, top 10 `lifestyle/page.tsx:189-193` | limit 100, top 6 | limit 100, top 6 | cosmetic drift | Batch A (opt.) |
| PR-1 | L | Program tab · "Active Members" | `details` length `program/page.tsx:110-111,354-358` | `/programs.active_members` snapshot `StandardProgramTab.swift:194` | `ProgramDTO.active_members` `ui/program/ProgramSections.kt:114` | equal values, 3 sources; label says "active", means enrolled | D3 (rename) |
| X-1 | M | `/analytics/summary` | only `program_progress` read | fetched each load; all but the fallback unused `ProgramContext+Analytics.swift:48-61` | never called | dead sink; `members.at_risk` shown nowhere | Batch B |
| X-2 | M | Android ring after edit / pull-to-refresh | n/a | n/a | `updateProgram` copies old `progressPercent` `core/ProgramContext.kt:1585-1589` | drift (stale until catch-up) | Batch B |
| X-3 | L | iOS placeholders / date carry-over | — | `ProgramContext.swift:190-198`; `ProgramContext+ProgramManagement.swift:17-24` | — | latent | Batch A (opt.) |
| X-4 | L | Dead UI: empty-states on zero-filled buckets; `is_active` filters | `summary/activity/page.tsx:56`, `lifestyle/page.tsx:483,581` | — | `SummaryCharts.kt:96,123`, `LifestyleCards.kt:372,421` | can-never-vary, low | optional |

## Decisions (yours — nothing below is changed until you answer)

- **D1 — one source for program progress.** Recommend **server, additive**: add `total_days` + `elapsed_days` to `GET /programs`
  so every surface reads `progress_percent`/`elapsed_days`/`total_days` (same UTC-day rule as the picker bar you just fixed;
  no per-surface date math). Alternative: all three keep client math with one shared UTC-day formula (no backend change,
  but three copies to keep in step).
- **D2 — "PTD MP %" meaning.** Recommend **elapsed-to-date, capped at program end, clamped 0–100** (the mobile formula;
  "PTD" = program-to-date). Web adopts it. Alternative: whole-program (web's current), then mobile changes.
- **D3 — replace "N active / N total members".** Recommend one number, **"N members"** (picker card); Program-tab row
  "Active Members" → "Members". (Backend cannot return a different "active" without a contract change.)
- **D4 — change-badge window (BE).** Today MTD is compared with the *whole* previous month, so badges skew negative early
  in the month. Recommend a separate approved change: compare day 1..N of both months in `buildMTDDateRanges`
  (`utils/queryHelpers.js:20-37`). Interim client-only option: relabel "vs last month".
- **D5 — current streak (BE).** Known gap (`memberActivityStats.js:3-6`). Recommend leave as is unless you want it anchored
  to today; it changes numbers on every live binary.

## Plan (after decisions; runs through the `multiplex` pipeline: plan-adversary → your approval → per-surface implementers → impl-adversary → compile-check → `git-version` → you test on prod)

### Batch B — single progress source (backend first; additive, live-binary safe)
1. `apps/backend/services/programService.js` — in BOTH raw queries (global-admin branch `:38-62`, member branch `:66-97`)
   add next to `progress_percent`:
   ```sql
   CASE WHEN p.start_date IS NOT NULL AND p.end_date IS NOT NULL AND p.end_date > p.start_date
        THEN (p.end_date - p.start_date)::int ELSE 0 END AS total_days,
   CASE WHEN p.start_date IS NOT NULL AND p.end_date IS NOT NULL AND p.end_date > p.start_date
        THEN LEAST(GREATEST(CURRENT_DATE - p.start_date, 0), p.end_date - p.start_date)::int ELSE 0 END AS elapsed_days
   ```
   (same rule as `analyticsService.js:217-231`). Update programs SPEC §4 + §11. Verify with the read-only Supabase MCP
   `execute_sql` (SELECT only), deploy via Render with your per-call confirm. Old binaries ignore the new keys.
2. Web: `lib/api/programs.ts` type + `app/summary/page.tsx` (`ProgramProgressCard`, `:440-500`) and `app/program/page.tsx`
   (`:119-122`, delete `computeProgramProgress` `:510-529`) read the active program from the cached `["programs"]` query
   (not the localStorage snapshot, not `/analytics/summary`); drop `fetchAnalyticsSummary` from the Summary landing.
3. iOS: `APIClient+Programs.swift` DTO add `total_days`/`elapsed_days: Int?`; `ProgramContext.apply(program:)` +
   `ProgramPickerView.applyProgram` store them; `completionPercent/elapsedDays/totalDays/remainingDays`
   (`ProgramContext.swift:310-327`) prefer the server fields, fall back to the current formula when nil;
   `loadSummary` (`ProgramContext+Analytics.swift:16-91`) swaps the `/analytics/summary` call for a `fetchPrograms` refresh
   of the active program; remove the `distribution_by_day` fallback (S-9).
4. Android: `net/Dtos.kt:178-180` add nullable `totalDays`/`elapsedDays`; `SummaryScreen.kt:277-292` and
   `ProgramCards.kt:243-264` read them (null → current client formula); re-read the program row after `updateProgram`
   (`core/ProgramContext.kt:1585-1589`) and in `refreshSummary` (X-2).
5. Specs: retire Android A-3 note, iOS admin-program F7, web program D-C3/F4 and summary F5; page registry bumps.

### Batch A — client-only fixes (independent; web ships via Vercel, mobile rides the next pre-bumped train)
| # | Fix | Files |
|---|---|---|
| A1 (M-6) | Parse `YYYY-MM-DD` as a local date: move the helper at `lib/api/people.ts:93-98` into `lib/format.ts` and use it in `formatShortDate`/`formatDateRange` | `web/src/lib/format.ts:7-16`, `lib/api/people.ts` |
| A2 (M-1) | One PTD formula: denominator = `max(1, days(start → min(end, today)) + 1)`, pct clamped 0–100, on all three | `components/members/MemberDashboardCards.tsx:78-85`; `MemberOverviewPicker.swift:92-101`; `ui/members/MemberCards.kt:294-295,608-615` |
| A3 (S-4) | Participation shows the server's 1-dp value (`%.1f`) | `SummaryCards.swift:213`; `ui/summary/SummaryCards.kt:205` |
| A4 (S-11) | DAILY AVERAGE with one decimal | `ChartDetailComponents.swift:28`; `ActivityDetailScreen.kt:136`; `MemberSimpleDetails.kt:167` |
| A5 (S-10) | Top types = limit 100, top 5 + "Others" (same rollup as mobile); fix web SPEC :69/:107 wording | `web/src/app/summary/page.tsx:157,211-214` |
| A6 (M-5) | Send `limit=0` (unbounded) for the two detail lists | `web/src/lib/api/members.ts:158,193` |
| A7 (M-4, S-7, L-1) | Diet → "N / 5"; total duration drops ".0"; Highest-participation null state "No data" | `members/page.tsx:556,609`, `members/metrics/page.tsx:233,282`, `summary/page.tsx:312`, `lifestyle/page.tsx:338-352` |
| A8 (S-12, L-3, X-3) | Optional: server `label` for range text; popularity constants; iOS nil/clear dates on null | as in table |

D3's text change (P-2/PR-1) lands in Batch A once chosen: `programs/page.tsx:925`, `ProgramPickerView.swift:1014-1018`,
`ProgramPickerScreen.kt:638`, `program/page.tsx:354-358`, `StandardProgramTab.swift:189-194`, `ProgramSections.kt:113-115`.

## Verification
- Backend: SELECT the two new expressions through the read-only Supabase MCP for a past, current and future program; confirm `progress_percent == round(elapsed/total·100)`.
- Web: `npm run build`; preview `/summary`, `/program`, `/members` under `TZ=America/Vancouver` (dates match the stored `YYYY-MM-DD`; ring equals the picker bar).
- iOS: `tools/ios-typecheck.sh`, then you press ⌘B and eyeball Summary ring vs picker bar.
- Android: `cd apps/android && ./gradlew :app:assembleDebug`; ring vs picker bar vs Program tab on one program.
- Cross-surface: one program, one member, the same minute — picker bar, Summary ring, Program tab %, PTD %, participation %, daily average must read identically on all three.
- Live binaries: iOS 1.5.2 (61) and older installs ignore the new JSON keys; Android `ignoreUnknownKeys` already true (`net/Network.kt:31`).
- Docs: audit skill `LESSONS_ARCHIVE.md` run note; promote "same value, different rounding/denominator" to the skill's Notes.
