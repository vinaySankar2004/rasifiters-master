# PLAN: Data-source parity fixes (D1 one progress source · D2 PTD · D3 "N members" · A1–A7 · A9 web local "today")

**Brief accepted:** yes, 33 files (backend 1 · web 15, 2 of them new · iOS 9 · Android 10, none new). The two new web files are small helper modules that live inside the briefed `apps/web/src/lib/`. Pages there already run 700+ lines (Workspace Standards), so the helpers do not go into the pages. No file outside the briefed surfaces is needed.

**Feature/version prediction:**
- `programs` v0.4.1 → **v0.5.0**: MINOR. `GET /programs` gains two additive owned-interface fields (`total_days`, `elapsed_days`) and a new D-C6. It is backward-compatible, so no dependent needs a new version.
- `analytics` v0.6.1 → **v0.6.2**: PATCH. A §10 note: no current client reads `/analytics/summary`.
- `member-analytics` v0.8.0 → **v0.8.1**: PATCH. A §10 note: the `active_days` window is not clipped to the program end, which is why PTD is clamped.
- Version numbers in `apps/` do not change.

**Surfaces in scope:** [backend, web, ios, android]. The file sets are disjoint because each sits under a different top-level app directory (proof below), so the surfaces can be built in parallel. The backend commits and deploys first.

**One day rule, chosen now:** every program-progress number and the PTD denominator use **UTC calendar days**.
- The backend's `CURRENT_DATE` is UTC: Sequelize 6.37.8 pins each session with `SET TIME ZONE INTERVAL '+00:00'` (`node_modules/sequelize/lib/dialects/postgres/connection-manager.js:175-180`).
- `member-metrics.active_days` counts up to "today UTC", so a UTC denominator matches its numerator.
- Result: progress ticks at 00:00 UTC (17:00 PDT) on all three apps. This is by design (D1); the picker bar already works this way.
- The A9 "today" for log/create forms is different on purpose. It is the user's **local** calendar day, which is what iOS and Android already do. It is a form default, not a progress count.

---

## File fences (one implementer per surface)

| Surface | Exact paths (only these) |
|---|---|
| **backend** | `apps/backend/services/programService.js` |
| **web** | `apps/web/src/lib/api/programs.ts` · `apps/web/src/lib/program-days.ts` **(NEW)** · `apps/web/src/lib/hooks/use-active-program-row.ts` **(NEW)** · `apps/web/src/lib/format.ts` · `apps/web/src/lib/api/people.ts` · `apps/web/src/lib/api/members.ts` · `apps/web/src/app/summary/page.tsx` · `apps/web/src/app/program/page.tsx` · `apps/web/src/app/programs/page.tsx` · `apps/web/src/components/members/MemberDashboardCards.tsx` · `apps/web/src/app/members/page.tsx` · `apps/web/src/app/members/metrics/page.tsx` · `apps/web/src/app/lifestyle/page.tsx` · `apps/web/src/components/forms/LogWorkoutsForm.tsx` · `apps/web/src/components/forms/LogDailyHealthForm.tsx` |
| **ios** (prefix `apps/ios/RaSi-Fiters-App/`) | `Shared/Services/APIClient+Programs.swift` · `Shared/Models/ProgramContext.swift` · `Shared/Models/ProgramContext+Analytics.swift` · `Shared/Models/ProgramContext+ProgramManagement.swift` · `Features/Home/ProgramPickerView.swift` · `Features/Home/Tabs/StandardProgramTab.swift` · `Features/Home/Tabs/MemberOverviewPicker.swift` · `Features/Home/Tabs/SummaryCards.swift` · `Features/Home/Detail/ChartDetailComponents.swift` (no new iOS files, so nothing to add to the Xcode project) |
| **android** (prefix `apps/android/app/src/main/java/com/app/rasifiters/`) | `net/Dtos.kt` · `core/ProgramContext.kt` · `ui/program/ProgramCards.kt` · `ui/program/ProgramSections.kt` · `ui/programs/ProgramPickerScreen.kt` · `ui/summary/SummaryScreen.kt` · `ui/summary/SummaryCards.kt` · `ui/summary/ActivityDetailScreen.kt` · `ui/members/MemberCards.kt` · `ui/members/MemberSimpleDetails.kt` |

**Disjointness proof:** the fences sit under `apps/backend/`, `apps/web/`, `apps/ios/` and `apps/android/`. No path appears in two fences, and no surface imports another's files. Docs and specs are the orchestrator's and are in no fence.

**Ship order:**
1. Backend commit → Render deploy (per-call confirm) → verify.
2. Web (Vercel).
3. iOS and Android ride their next pre-bumped trains.

Every client is safe without the backend, because the new fields are optional and each client falls back.

---

## Steps: backend

1. **`apps/backend/services/programService.js`, header comment, lines 9–12.** Replace the existing four lines (`// getPrograms keeps its two raw sequelize.query branches verbatim (D-S2), EXCEPT …` through `… (PUT /order) writes that table. See SPEC §9.`) with:
```js
// getPrograms keeps its two raw sequelize.query branches verbatim (D-S2), EXCEPT the net-new
// post-parity per-member ordering (2026-07-05): both branches LEFT JOIN member_program_order
// and ORDER BY mpo.position NULLS LAST before the legacy start_date sort; setProgramOrder
// (PUT /order) writes that table — AND the D-C6 day columns (2026-10-14) appended after progress_percent. See SPEC §9.
```

2. **Same file, after line 17** (`const { logError } = require("../utils/logError");`). Insert:
```js

// D-C6 (programs SPEC §9, 2026-10-14 — the data-source sweep's D1): the day counts behind progress_percent, so every
// client shows the server's progress instead of its own date math. Same rule as progress_percent and analyticsService
// program_progress: UTC calendar days (CURRENT_DATE; Sequelize pins the session to +00:00); total_days = end − start;
// elapsed_days = today − start clamped to [0, total_days]; both 0 unless both dates are set and end > start — so
// progress_percent = round(elapsed_days / total_days · 100). Additive: older binaries ignore the two keys.
const PROGRESS_DAY_COLUMNS = `
                CASE
                    WHEN p.start_date IS NOT NULL AND p.end_date IS NOT NULL
                         AND p.end_date > p.start_date
                    THEN (p.end_date - p.start_date)::int
                    ELSE 0
                END AS total_days,
                CASE
                    WHEN p.start_date IS NOT NULL AND p.end_date IS NOT NULL
                         AND p.end_date > p.start_date
                    THEN LEAST(GREATEST(CURRENT_DATE - p.start_date, 0), p.end_date - p.start_date)::int
                    ELSE 0
                END AS elapsed_days`;
```

3. **Same file, global-admin branch, the line `                END AS progress_percent` (was line 54).** Replace it with:
```js
                END AS progress_percent,${PROGRESS_DAY_COLUMNS}
```

4. **Same file, member branch, the line `            END AS progress_percent` (was line 82).** Replace it with:
```js
            END AS progress_percent,${PROGRESS_DAY_COLUMNS}
```
   Nothing else changes: same SELECT list, same JOINs, GROUP BY `p.id` (the columns depend on `p` only), same ORDER BY.

## Steps: web

5. **`apps/web/src/lib/api/programs.ts`, `Program` type, after line 11** (`  progress_percent?: number;`). Insert:
```ts
  /** D-C6 (programs SPEC §9): the day counts behind progress_percent (UTC days). Absent on an older backend. */
  total_days?: number;
  elapsed_days?: number;
```

6. **NEW `apps/web/src/lib/program-days.ts`**, full content:
```ts
// Program day math shared by the Summary ring, the Program tab and the Members "PTD MP %" — one rule on web, iOS and
// Android. Days are UTC calendar days: GET /programs progress_percent · elapsed_days · total_days (D1 / programs SPEC
// §9 D-C6) and member-metrics' active_days window both count in UTC.

const DAY_MS = 86_400_000;

export type ProgramProgress = { percent: number; elapsedDays: number; totalDays: number; remainingDays: number };

type ProgressSource = {
  start_date?: string | null;
  end_date?: string | null;
  progress_percent?: number | null;
  total_days?: number | null;
  elapsed_days?: number | null;
};

/** "YYYY-MM-DD…" → that calendar day's UTC midnight in ms; null when it isn't a date. */
function utcDayMs(value?: string | null): number | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function todayUtcMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/**
 * D1: progress from the program's /programs row. Fallback (the row isn't loaded yet, or an older backend without the
 * day fields): the backend's own UTC-day rule on the dates, so both paths show the same numbers.
 */
export function programProgress(source?: ProgressSource | null): ProgramProgress {
  if (source && typeof source.total_days === "number" && typeof source.elapsed_days === "number") {
    const totalDays = source.total_days;
    const elapsedDays = source.elapsed_days;
    return {
      percent: source.progress_percent ?? 0,
      elapsedDays,
      totalDays,
      remainingDays: Math.max(totalDays - elapsedDays, 0)
    };
  }
  const start = utcDayMs(source?.start_date);
  const end = utcDayMs(source?.end_date);
  if (start === null || end === null || end <= start) {
    return { percent: 0, elapsedDays: 0, totalDays: 0, remainingDays: 0 };
  }
  const totalDays = Math.round((end - start) / DAY_MS);
  const elapsedDays = Math.min(Math.max(Math.round((todayUtcMs() - start) / DAY_MS), 0), totalDays);
  return {
    percent: Math.round((elapsedDays / totalDays) * 100),
    elapsedDays,
    totalDays,
    remainingDays: totalDays - elapsedDays
  };
}

/**
 * D2 (Members page SPEC): the "PTD MP %" denominator — days from program start to min(end, today), inclusive, at
 * least 1; 0 when a date is missing. For a dated program it equals elapsed_days + 1.
 */
export function ptdDays(start?: string | null, end?: string | null): number {
  const startMs = utcDayMs(start);
  const endMs = utcDayMs(end);
  if (startMs === null || endMs === null) return 0;
  return Math.max(1, Math.round((Math.min(endMs, todayUtcMs()) - startMs) / DAY_MS) + 1);
}

/** D2: active days ÷ ptdDays, rounded, clamped 0–100 (0 when ptdDays is 0). */
export function ptdPercent(activeDays: number, days: number): number {
  if (days <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((activeDays / days) * 100)));
}
```

7. **NEW `apps/web/src/lib/hooks/use-active-program-row.ts`**, full content:
```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPrograms } from "@/lib/api/programs";
import { cachedQueryFn, useLaunchSeed } from "@/lib/cache/launch-cache";

const PROGRAMS_KEY = ["programs"];

/**
 * D1 (programs SPEC §9 D-C6): the open program's GET /programs row — the picker's own ["programs"] query (seeded from
 * the launch cache, refetched on mount / focus) — the one source of its progress on Summary and the Program tab.
 * null until the list loads, or when the program isn't in it.
 */
export function useActiveProgramRow(token: string, memberId: string | undefined, programId: string) {
  const query = useQuery({
    queryKey: PROGRAMS_KEY,
    queryFn: cachedQueryFn(memberId, PROGRAMS_KEY, () => fetchPrograms(token)),
    enabled: !!token
  });
  useLaunchSeed(memberId, [PROGRAMS_KEY]);
  return query.data?.find((program) => program.id === programId) ?? null;
}
```

8. **`apps/web/src/lib/format.ts`, lines 7–16 (`export function formatShortDate …` through its closing `}`).** Replace them with:
```ts
export function formatShortDate(dateString?: string | null) {
  if (!dateString) return null;
  const date = parseLocalDay(dateString) ?? new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/**
 * A1 (sweep M-6): a date-only API value ("YYYY-MM-DD", optionally followed by a time) → that calendar day at LOCAL
 * midnight. new Date("2026-10-12") is UTC midnight and reads as Oct 11 west of UTC. null when it isn't a date.
 */
export function parseLocalDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

/** A9: a Date's LOCAL calendar day as "YYYY-MM-DD" (toISOString() gives the UTC day — tomorrow on a US evening). */
export function toLocalISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A9: today in the browser's calendar, "YYYY-MM-DD" — the log forms' and Create Program's default date (iOS + Android
 *  default to the device's local date). */
export function todayLocalISO(): string {
  return toLocalISODate(new Date());
}
```

9. **`apps/web/src/lib/format.ts`, after the `stepsLabel` function (ends at the original line 53).** Insert:
```ts

/** A7: a member's average diet quality (a server-rounded integer) — "3 / 5", as on iOS + Android; "—" when missing. */
export function avgDietLabel(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${value} / 5`;
}

/** A7: minutes → hours to one decimal, half-up on whole tenths (round(minutes / 6) / 10), ".0" dropped ("12", "11.9")
 *  — the iOS + Android Total duration rule. */
export function formatHoursTenths(minutes: number): string {
  const tenths = Math.round(minutes / 6);
  return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
}
```

10. **`apps/web/src/lib/api/people.ts`**:
    - line 3: after `import { appError } from "@/lib/kit/app-error";` add `import { parseLocalDay } from "@/lib/format";`.
    - Delete lines 93–98: the two comment lines `// "YYYY-MM-DD" is parsed as a LOCAL day …` / `// west of UTC.` and the whole `function parseDay(day: string): Date | null { … }`.
    - In `daysAgo` (was line 102) and `formatDay` (was line 110), change `const parsed = parseDay(day);` to `const parsed = parseLocalDay(day);`.

11. **`apps/web/src/lib/api/members.ts`, lines 158 and 193.** Both read `limit: params.limit ? String(params.limit) : "1000"`. Change each to:
```ts
    // A6: limit 0 = every row (the backend caps only limit > 0), as iOS + Android send; omitted → the old 1000 default.
    limit: params.limit !== undefined ? String(params.limit) : "1000"
```

12. **`apps/web/src/app/summary/page.tsx`**, top to bottom (original line numbers):
    - **a) Lines 7–19.** Replace the `@/lib/api/summary` import with:
```ts
import {
  fetchActivityTimeline,
  fetchAvgDurationMTD,
  fetchDistributionByDay,
  fetchMTDParticipation,
  fetchTotalDurationMTD,
  fetchTotalWorkoutsMTD,
  fetchWorkoutTypes,
  ActivityTimelinePoint,
  WorkoutType
} from "@/lib/api/summary";
```
    - **b) Line 28.** Change `import { formatTotalDuration } from "@/lib/format";` to `import { formatHoursTenths, formatTotalDuration } from "@/lib/format";`.
    - **c) After line 43** (`import { cachedQueryFn, useLaunchSeed } from "@/lib/cache/launch-cache";`), add:
```ts
import { useActiveProgramRow } from "@/lib/hooks/use-active-program-row";
import { programProgress, type ProgramProgress } from "@/lib/program-days";
```
    - **d) Line 71.** `// Instant open (D-9): the 8 independent queries` becomes `// Instant open (D-9): the 7 independent queries`.
    - **e) Line 74.** Delete `    analytics: ["summary", programId, summaryPeriod],`.
    - **f) Lines 85–94.** Replace the whole `const analyticsQuery = useQuery({ … });` block with:
```ts
  // D1 (programs SPEC §9 D-C6): Program Progress = the open program's GET /programs row (progress_percent ·
  // elapsed_days · total_days — the picker bar's numbers); the snapshot dates feed the same-rule fallback until the row
  // loads. /analytics/summary is no longer read (its program_progress was this page's only use — F5 retired).
  const programRow = useActiveProgramRow(token, memberId, programId);
  const progress = programProgress(programRow ?? program);
```
    - **g) Line 157.** `() => fetchWorkoutTypes(token, programId, 50),` becomes `() => fetchWorkoutTypes(token, programId, 100),  // A5: as iOS / Android + /summary/workout-types (same key)`.
    - **h) Lines 163–166.** Replace with:
```ts
  const summaryQueries = [mtdParticipationQuery, totalWorkoutsQuery, totalDurationQuery,
    avgDurationQuery, activityTimelineQuery, distributionQuery, workoutTypesQuery];
  const summaryKeys = [keys.mtd, keys.totalWorkouts, keys.totalDuration,
    keys.avgDuration, keys.timeline, keys.distribution, keys.workoutTypes];  // same order as summaryQueries
```
    - **i) Lines 211–214.** Replace the `topWorkoutTypes` useMemo with:
```ts
  // A5: top 5 by total time + an "Others" rollup (iOS WorkoutTypesSummaryCard / Android topSixWithOthers parity).
  const topWorkoutTypes = useMemo(() => topTypesWithOthers(workoutTypesQuery.data ?? []), [workoutTypesQuery.data]);
```
    - **j) Lines 240–244.** Replace the `<ProgramProgressCard … />` element with:
```tsx
            <ProgramProgressCard progress={progress} status={(programRow ?? program)?.status ?? "active"} />
```
    - **k) Line 312.** `? \`${(totalDurationQuery.data.total_minutes / 60).toFixed(1)} hrs\`` becomes ``? `${formatHoursTenths(totalDurationQuery.data.total_minutes)} hrs` ``.
    - **l) Lines 437–509.** Replace the comment pair and the whole `function ProgramProgressCard(…) { … }` with:
```tsx
// D1: the ring + day counts are the /programs row's server numbers (programProgress falls back to the same UTC rule on
// the snapshot dates until the row loads) — always a value, never "…" / "—" (iOS + Android parity).
function ProgramProgressCard({ progress, status }: { progress: ProgramProgress; status: string }) {
  const { percent, elapsedDays, totalDays, remainingDays } = progress;
  const size = 120;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <GlassCard padding="lg" className="w-full">
      <h3 className="text-left text-lg font-semibold text-rf-text">Program Progress</h3>
      <div className="mt-6 flex flex-col items-center gap-4 text-center">
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="absolute inset-0">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="var(--rf-border)"
              strokeWidth={stroke}
              fill="none"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#ff8b1f"
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
            />
          </svg>
          <div className="relative z-10 text-center">
            <p className="text-2xl font-bold">{`${percent}%`}</p>
            <p className="text-xs text-rf-text-muted">{`${elapsedDays}/${totalDays} days`}</p>
          </div>
        </div>
        <StatusBadge variant={programStatusVariant(status)}>{status}</StatusBadge>
        <div className="flex flex-wrap items-center justify-center gap-6">
          <div>
            <p className="text-sm text-rf-text-muted">Elapsed</p>
            <p className="text-lg font-semibold text-rf-text">{`${elapsedDays} days`}</p>
          </div>
          <div>
            <p className="text-sm text-rf-text-muted">Remaining</p>
            <p className="text-lg font-semibold text-rf-text">{`${remainingDays} days`}</p>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

/** A5: the Summary "Workout Types" rows — top 5 by total time + "Others" summing the rest (sessions, minutes,
 *  avg = round(minutes / sessions)); iOS WorkoutTypesSummaryCard + Android topSixWithOthers use the same rule. */
function topTypesWithOthers(types: WorkoutType[]): WorkoutType[] {
  const sorted = [...types].sort((a, b) => b.total_duration - a.total_duration);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  if (rest.length === 0) return top;
  const sessions = rest.reduce((sum, type) => sum + type.sessions, 0);
  const totalDuration = rest.reduce((sum, type) => sum + type.total_duration, 0);
  return [
    ...top,
    {
      workout_name: "Others",
      sessions,
      total_duration: totalDuration,
      avg_duration_minutes: sessions > 0 ? Math.round(totalDuration / sessions) : 0
    }
  ];
}
```

13. **`apps/web/src/app/program/page.tsx`**:
    - **a) After line 12** (`import { useAuthGuard } from "@/lib/hooks/use-auth-guard";`), add:
```ts
import { useActiveProgramRow } from "@/lib/hooks/use-active-program-row";
import { programProgress } from "@/lib/program-days";
```
    - **b) Lines 120–122.** Replace the `const progress = useMemo(() => { return computeProgramProgress(…); }, […]);` block with:
```ts
  // D1 (programs SPEC §9 D-C6; supersedes D-C3 / F4): the progress row reads the open program's /programs row — the
  // Summary ring's and the picker bar's numbers; the snapshot dates feed the same-rule fallback until it loads.
  const programRow = useActiveProgramRow(token, session?.user.id, programId);
  const progress = programProgress(programRow ?? program);
```
    - **c) Line 355.** `label="Active Members"` becomes `label="Members"` (D3; the value expression is unchanged).
    - **d) Lines 510–529.** Delete `function computeProgramProgress(…) { … }` entirely, including the blank line before it. `useMemo` stays imported because `userInitials` uses it.

14. **`apps/web/src/app/programs/page.tsx`**:
    - **a) Line 25.** Becomes `import { formatDateRange, formatInviteDate, initials, toLocalISODate, todayLocalISO } from "@/lib/format";`.
    - **b) Lines 879–880.** Replace the two `const activeMembers` / `const totalMembers` lines with:
```ts
  // D3 (programs SPEC §9): one number — the backend counts active and total members the same way (F2).
  const memberCount = program.total_members ?? 0;
```
    - **c) Line 925.** `{activeMembers} active / {totalMembers} total members` becomes `{memberCount === 1 ? "1 member" : \`${memberCount} members\`}`.
    - **d) Lines 1191–1194 (A9).** Replace the `const today = …` and `const defaultEnd = …` lines with:
```ts
  // A9: the browser's local calendar day (toISOString() is the UTC day — tomorrow on a US evening), as iOS + Android.
  const today = todayLocalISO();
  const defaultEnd = toLocalISODate(new Date(new Date().setMonth(new Date().getMonth() + 3)));
```
      The `setMonth(+3)` arithmetic is kept as is.

15. **`apps/web/src/components/forms/LogWorkoutsForm.tsx` (A9)**:
    - After line 11 (`import { useLogLookups } from "@/lib/hooks/use-log-lookups";`), add `import { todayLocalISO } from "@/lib/format";`.
    - Delete lines 26–28 (`function todayStr() { return new Date().toISOString().slice(0, 10); }`) and the blank line after them.
    - Line 170: `prev[prev.length - 1]?.date || todayStr();` becomes `prev[prev.length - 1]?.date || todayLocalISO();  // A9: local day`.

16. **`apps/web/src/components/forms/LogDailyHealthForm.tsx` (A9)**:
    - After line 11, add `import { todayLocalISO } from "@/lib/format";`.
    - Delete lines 32–34 (`function todayStr() { … }`) and the blank line after them.
    - Line 187: `|| todayStr();` becomes `|| todayLocalISO();  // A9: local day`.
    - The repo-wide grep `toISOString().slice(0, 10)` / `.split("T")[0]` in `apps/web/src` found only steps 14d, 15 and 16. The other two `toISOString()` uses are real timestamps and stay as they are: `lib/events/client-events.ts:63` and `lib/notifications/queries.ts:79`.

17. **`apps/web/src/components/members/MemberDashboardCards.tsx` (D2)**:
    - After line 7, add `import { ptdDays, ptdPercent } from "@/lib/program-days";`.
    - Replace lines 78–85 (the `totalDays` useMemo and the `progressPct` line) with:
```tsx
  // D2 (Members page SPEC): PTD = active days ÷ the program's days so far — start → min(end, today) inclusive, UTC
  // days (the server's active_days window) — clamped 0–100; identical on iOS + Android. 0 when a date is missing.
  const totalDays = useMemo(() => ptdDays(programStart, programEnd), [programStart, programEnd]);
  const progressPct = metric ? ptdPercent(metric.active_days, totalDays) : 0;
```
    - The JSX stays: `{progressPct}%`, the bar `width: ${progressPct}%`, and `{metric.active_days} / {totalDays} days`.

18. **`apps/web/src/app/members/page.tsx` (A7 diet)**:
    - Line 17 becomes `import { avgDietLabel, initials, stepsLabel } from "@/lib/format";`.
    - Lines 556 and 609: `{metric.avg_food_quality?.toFixed(1) ?? "—"}` becomes `{avgDietLabel(metric.avg_food_quality)}`.

19. **`apps/web/src/app/members/metrics/page.tsx` (A7 diet)**:
    - Line 7 becomes `import { avgDietLabel, initials, downloadCsv, stepsLabel } from "@/lib/format";`.
    - Line 233: `return metric.avg_food_quality?.toFixed(1) ?? "—";` becomes `return avgDietLabel(metric.avg_food_quality);`.
    - Line 282: `{metric.avg_food_quality?.toFixed(1) ?? "—"}` becomes `{avgDietLabel(metric.avg_food_quality)}`.

20. **`apps/web/src/app/lifestyle/page.tsx` (A7 null state, same rule as the mobile cards).** Replace the three `subtitle={…}` props as follows.
    - Most popular (lines 314–318):
```tsx
              subtitle={
                workoutTypeMostPopularQuery.data
                  ? workoutTypeMostPopularQuery.data.workout_name == null
                    ? "No data"
                    : `${workoutTypeMostPopularQuery.data.sessions} workouts`
                  : missingText(mostPopularStatus, "Loading")
              }
```
    - Longest duration (lines 332–336):
```tsx
              subtitle={
                workoutTypeLongestDurationQuery.data
                  ? workoutTypeLongestDurationQuery.data.workout_name == null
                    ? "No data"
                    : `${workoutTypeLongestDurationQuery.data.avg_minutes} mins avg`
                  : missingText(longestStatus, "Loading")
              }
```
    - Highest participation (lines 346–350):
```tsx
              subtitle={
                workoutTypeHighestParticipationQuery.data
                  ? workoutTypeHighestParticipationQuery.data.workout_name == null
                    ? "No data"
                    : `${workoutTypeHighestParticipationQuery.data.participation_pct.toFixed(1)}% of members`
                  : missingText(participationStatus, "Loading")
              }
```

## Steps: ios (paths under `apps/ios/RaSi-Fiters-App/`)

21. **`Shared/Services/APIClient+Programs.swift`, `ProgramDTO`, after line 13** (`let progress_percent: Int?`). Insert:
```swift
        /// D-C6 (programs SPEC §9): the day counts behind progress_percent (UTC days); nil from an older backend or cache.
        let total_days: Int?
        let elapsed_days: Int?
```

22. **`Shared/Models/ProgramContext.swift`, lines 310–327** (`var totalDays` through `var completionPercent`). Replace them with:
```swift
    /// D1 (programs SPEC §9 D-C6): the open program's `/programs` row carries the server's progress —
    /// `progress_percent` · `elapsed_days` · `total_days` in UTC calendar days, the picker bar's rule — and the Summary
    /// ring + Program tab show it. nil until that row is in `programs`, or when an older backend omits the day fields
    /// → the device-calendar fallback below (the pre-D1 formula).
    private var serverProgress: (percent: Int, elapsed: Int, total: Int)? {
        guard let pid = programId,
              let row = programs.first(where: { $0.id == pid }),
              let total = row.total_days,
              let elapsed = row.elapsed_days else { return nil }
        return (row.progress_percent ?? 0, elapsed, total)
    }

    var totalDays: Int {
        if let server = serverProgress { return server.total }
        return Calendar.current.dateComponents([.day], from: startDate, to: endDate).day ?? 0
    }

    var elapsedDays: Int {
        if let server = serverProgress { return server.elapsed }
        let today = Date()
        guard today > startDate else { return 0 }
        return min(Calendar.current.dateComponents([.day], from: startDate, to: today).day ?? 0, totalDays)
    }

    var remainingDays: Int {
        max(totalDays - elapsedDays, 0)
    }

    var completionPercent: Int {
        if let server = serverProgress { return server.percent }
        guard totalDays > 0 else { return 0 }
        return Int(round((Double(elapsedDays) / Double(totalDays)) * 100))
    }
```

23. **`Shared/Models/ProgramContext+Analytics.swift`**, replace the whole file:
```swift
import Foundation

/// The Summary analytics reads (polish #30: the tab tracks which parts it has for the program on screen).
nonisolated enum SummaryPart: Hashable {
    case mtd, workouts, duration, average, timeline, distribution, types
}

extension ProgramContext {
    // MARK: - Analytics

    /// Summary tab (board §6 item 5 + D-9): the 7 analytics loads + the program list in PARALLEL, cache-only when
    /// `read == .cacheOnly`. Every analytics load that succeeded is applied (amendment A13: partial failures keep the
    /// parts that loaded). Returns WHICH parts applied (polish #30) + the first analytics failure (the tab goes stale /
    /// failed — frontend-kit §5); throws only when superseded.
    /// D1 (programs SPEC §9 D-C6): the Program Progress ring reads the open program's `/programs` row (ProgramContext
    /// `serverProgress`), so this re-reads the list — best-effort: a failed read keeps the last row and never fails the
    /// tab. `/analytics/summary` is no longer read (S-9: no 7-day distribution fallback). `period` is kept for the
    /// caller's load key.
    @MainActor
    func loadSummary(period: String, timelinePeriod: String,
                     read: APIClient.LaunchRead) async throws -> (applied: Set<SummaryPart>, failure: Error?) {
        guard let pid = programId else { throw AppError(kind: .notFound) }
        let api = APIClient.shared
        let token = authToken ?? ""
        async let programsCall = api.fetchPrograms(token: token, read: read)
        async let mtdCall = api.fetchMTDParticipation(token: token, programId: pid, read: read)
        async let workoutsCall = api.fetchTotalWorkoutsMTD(token: token, programId: pid, read: read)
        async let durationCall = api.fetchTotalDurationMTD(token: token, programId: pid, read: read)
        async let averageCall = api.fetchAvgDurationMTD(token: token, programId: pid, read: read)
        async let timelineCall = api.fetchActivityTimeline(token: token, period: timelinePeriod, programId: pid, read: read)
        async let distributionCall = api.fetchDistributionByDay(token: token, programId: pid, read: read)
        async let typesCall = api.fetchWorkoutTypes(token: token, programId: pid, read: read)
        var failure: Error?
        var mtd: APIClient.MTDParticipationDTO?
        var workouts: APIClient.TotalWorkoutsMTDDTO?
        var duration: APIClient.TotalDurationMTDDTO?
        var average: APIClient.AvgDurationMTDDTO?
        var timeline: APIClient.ActivityTimelineResponse?
        var distribution: APIClient.DistributionByDayDTO?
        var types: [APIClient.WorkoutTypeDTO]?
        let programRows = try? await programsCall
        do { mtd = try await mtdCall } catch { failure = failure ?? error }
        do { workouts = try await workoutsCall } catch { failure = failure ?? error }
        do { duration = try await durationCall } catch { failure = failure ?? error }
        do { average = try await averageCall } catch { failure = failure ?? error }
        do { timeline = try await timelineCall } catch { failure = failure ?? error }
        do { distribution = try await distributionCall } catch { failure = failure ?? error }
        do { types = try await typesCall } catch { failure = failure ?? error }
        try Task.checkCancellation()                     // superseded by a newer .task(id:) — never apply late results
        guard programId == pid else { throw CancellationError() }   // the program changed meanwhile
        if let programRows {
            switch read {
            case .network: programs = programRows
            case .cacheOnly: if programs.isEmpty { programs = programRows }   // a cached list never replaces a newer one
            }
        }
        if let mtd { mtdParticipation = mtd }
        if let workouts { totalWorkoutsMTD = workouts.total_workouts; totalWorkoutsChangePct = workouts.change_pct }
        if let duration {
            // A7 (parity): hours to one decimal, half-up on whole tenths — round(minutes / 6) / 10 (web + Android same).
            totalDurationHoursMTD = (Double(duration.total_minutes) / 6.0).rounded() / 10.0
            totalDurationChangePct = duration.change_pct
        }
        if let average { avgDurationMinutesMTD = average.avg_minutes; avgDurationChangePctMTD = average.change_pct }
        if let timeline {
            activityTimeline = timeline.buckets
            activityTimelineLabel = timeline.label
            activityTimelineDailyAverage = timeline.daily_average
        }
        if let d = distribution {
            distributionByDayCounts = ["Sunday": d.Sunday, "Monday": d.Monday, "Tuesday": d.Tuesday, "Wednesday": d.Wednesday,
                                       "Thursday": d.Thursday, "Friday": d.Friday, "Saturday": d.Saturday]
        }
        if let types { workoutTypes = types }
        var applied: Set<SummaryPart> = []
        if mtd != nil { applied.insert(.mtd) }
        if workouts != nil { applied.insert(.workouts) }
        if duration != nil { applied.insert(.duration) }
        if average != nil { applied.insert(.average) }
        if timeline != nil { applied.insert(.timeline) }
        if distribution != nil { applied.insert(.distribution) }
        if types != nil { applied.insert(.types) }
        return (applied, failure)
    }
}
```
   `.summary` was only ever inserted at the old line 82. `AdminSummaryTab.swift` never reads it, so that file is unchanged. The `totalLogsThisPeriod`/`timelinePoints`/… properties are no longer written. Deleting them is X-1 cleanup, which is out of scope.

24. **`Shared/Models/ProgramContext+ProgramManagement.swift`, `updateProgram`, after the `if let lock = response.admin_only_data_entry { … }` block (lines 62–64).** Insert, before the function's closing `}`:
```swift

        // D1 (programs SPEC §9 D-C6): the Summary ring + Program tab read the /programs row — re-read the list so the edited
        // dates show the server's numbers at once (best-effort, as in createProgram).
        if let updatedPrograms = try? await APIClient.shared.fetchPrograms(token: token) {
            programs = updatedPrograms
        }
```

25. **`Features/Home/ProgramPickerView.swift`, lines 1014–1018** (`membersSummary`). Replace with:
```swift
    // D3 (programs SPEC §9): one number — the backend counts active and total members the same way (F2).
    private func membersSummary(_ program: APIClient.ProgramDTO) -> String {
        let count = program.total_members ?? 0
        return count == 1 ? "1 member" : "\(count) members"
    }
```

26. **`Features/Home/Tabs/StandardProgramTab.swift`, lines 188 and 190.** `// Active Members` becomes `// Members (D3)`, and `Text("Active Members")` becomes `Text("Members")`.

27. **`Features/Home/Tabs/MemberOverviewPicker.swift` (D2)**:
    - Replace lines 92–101 (`programTotalDays` and `memberProgressPercent`) with:
```swift
    /// D2 (Members page SPEC): the program's days so far — start → min(end, today), inclusive, at least 1 — in UTC
    /// calendar days (the server's `active_days` window and D1's `elapsed_days` count in UTC); web + Android same rule.
    private var programTotalDays: Int {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = .gmt
        let day: Set<Calendar.Component> = [.year, .month, .day]
        // startDate / endDate are local midnights of the yyyy-MM-dd strings: keep their calendar day, count it in UTC.
        guard let start = utc.date(from: Calendar.current.dateComponents(day, from: programContext.startDate)),
              let end = utc.date(from: Calendar.current.dateComponents(day, from: programContext.endDate)),
              let today = utc.date(from: utc.dateComponents(day, from: Date())) else { return 1 }
        let days = utc.dateComponents([.day], from: start, to: min(end, today)).day ?? 0
        return max(days + 1, 1)
    }
    private func memberProgressPercent(activeDays: Int) -> Int {
        let pct = Double(activeDays) / Double(programTotalDays)
        return min(max(Int(round(pct * 100)), 0), 100)
    }
```
    - Line 183: `ProgressView(value: Double(m.active_days), total: Double(programTotalDays))` becomes `ProgressView(value: Double(min(m.active_days, programTotalDays)), total: Double(programTotalDays))`.

28. **`Features/Home/Tabs/SummaryCards.swift`, line 213 (A3).** `Text("\(Int(pct))%")` becomes `Text(String(format: "%.1f%%", pct))`.

29. **`Features/Home/Detail/ChartDetailComponents.swift`, line 28 (A4).** `Text(String(format: "%.0f", dailyAverage))` becomes `Text(String(format: "%.1f", dailyAverage))`. `HeaderStats` serves both the program and the member variant of `ActivityTimelineDetailView`.

## Steps: android (paths under `apps/android/app/src/main/java/com/app/rasifiters/`)

30. **`net/Dtos.kt`, `ProgramDTO`, after line 180** (`@SerialName("progress_percent") val progressPercent: Int = 0,`). Insert:
```kotlin
    /** D-C6 (programs SPEC §9): the day counts behind progress_percent (UTC days). null = absent (an older backend, a
     *  launch-cached list from before it, or the local copy right after an edit) → the client fallback. */
    @SerialName("total_days") val totalDays: Int? = null,
    @SerialName("elapsed_days") val elapsedDays: Int? = null,
```

31. **`ui/program/ProgramCards.kt`**:
    - Line 222: `// ---- Status + progress helpers (iOS ProgramContext date math + statusColor) ----` becomes `// ---- Status, date + progress helpers (progress = D1 server fields, date-math fallback) ----`.
    - Replace lines 243–264 (`private fun totalDays` through the end of `programCompletionPercent`) with:
```kotlin
/**
 * Program progress for the Summary ring + the Program tab (D1, programs SPEC §9 D-C6): the `/programs` row's
 * `progress_percent` · `elapsed_days` · `total_days` — the server's UTC-day numbers, the picker bar's rule. Fallback only
 * when the day fields are absent (a launch-cached list from before the backend change, or the local copy right after an
 * edit until the list re-read lands): the device-date math these screens used before.
 */
data class ProgramProgress(val percent: Int, val elapsedDays: Int, val totalDays: Int) {
    val remainingDays: Int get() = (totalDays - elapsedDays).coerceAtLeast(0)
}

fun programProgress(program: ProgramDTO?): ProgramProgress {
    val serverTotal = program?.totalDays
    val serverElapsed = program?.elapsedDays
    if (program != null && serverTotal != null && serverElapsed != null) {
        return ProgramProgress(program.progressPercent.coerceIn(0, 100), serverElapsed, serverTotal)
    }
    val start = parseProgramDate(program?.startDate) ?: return ProgramProgress(0, 0, 0)
    val end = parseProgramDate(program?.endDate) ?: return ProgramProgress(0, 0, 0)
    val total = ChronoUnit.DAYS.between(start, end).toInt().coerceAtLeast(0)
    val today = LocalDate.now()
    val elapsed = if (today.isAfter(start)) ChronoUnit.DAYS.between(start, today).toInt().coerceIn(0, total) else 0
    val percent = if (total > 0) Math.round(elapsed.toDouble() / total * 100).toInt() else 0
    return ProgramProgress(percent, elapsed, total)
}
```
    - The `java.time.temporal.ChronoUnit` and `LocalDate` imports stay in use.

32. **`ui/program/ProgramSections.kt`**:
    - Line 62 KDoc: `… Duration / Progress / Active Members (iOS StandardProgramTab). */` becomes `… Duration / Progress / Members (iOS StandardProgramTab). */`.
    - Replace lines 88–116 (from the `ProgramRowDivider()` before `Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {` through the `ProgramInfoRow("Active Members") { … }` block) with:
```kotlin
            ProgramRowDivider()
            val progressInfo = programProgress(program)   // D1: the /programs row's server fields
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ProgramInfoRow("Progress") {
                    Text("${progressInfo.percent}%", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                }
                LinearProgressIndicator(
                    progress = { progressInfo.percent / 100f },
                    color = programStatusColor(program?.status),
                    trackColor = MaterialTheme.colorScheme.surfaceContainerHighest,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(
                        "${progressInfo.elapsedDays} days elapsed",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                    )
                    Text(
                        "${progressInfo.remainingDays} days remaining",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                    )
                }
            }
            ProgramRowDivider()
            ProgramInfoRow("Members") {
                Text("${program?.activeMembers ?: 0}", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            }
```
    - This file is in the same package, so no import is needed.

33. **`ui/programs/ProgramPickerScreen.kt`, line 638.** `else -> "${program.activeMembers} active / ${program.totalMembers} total members"` becomes:
```kotlin
    // D3 (programs SPEC §9): one number — the backend counts active and total members the same way (F2).
    else -> if (program.totalMembers == 1) "1 member" else "${program.totalMembers} members"
```

34. **`ui/summary/SummaryScreen.kt`**:
    - Delete line 50 (`import com.app.rasifiters.net.ProgramDTO`) and lines 59–60 (`import java.time.LocalDate`, `import java.time.temporal.ChronoUnit`).
    - After line 56 (`import com.app.rasifiters.ui.components.tapTarget`), add `import com.app.rasifiters.ui.program.programProgress`.
    - KDoc lines 73–74: replace `Progress read from the loaded ProgramDTO (progress_percent + date math), skipping the vestigial` / `` `analytics/summary` over-fetch (feeds only the deferred detail views — iOS F2 / web F5).`` with `Progress = the loaded ProgramDTO's server fields (progress_percent · elapsed_days · total_days — D1, programs` / `SPEC §9 D-C6); no client calls `analytics/summary`.`.
    - Replace lines 126–132 (`val p = program` + `ProgramProgressCard(…)`) with:
```kotlin
                val p = program
                val progress = programProgress(p)   // D1: one UTC-day source for the % and the day counts
                ProgramProgressCard(
                    progress = progress.percent,
                    elapsedDays = progress.elapsedDays,
                    totalDays = progress.totalDays,
                    status = p?.status ?: "—",
                )
```
    - Line 185: `else TotalDurationCard(hours = duration.totalMinutes / 60.0, change = duration.changePct, modifier = Modifier.weight(1f))` becomes `else TotalDurationCard(minutes = duration.totalMinutes, change = duration.changePct, modifier = Modifier.weight(1f))`.
    - Delete lines 275–292: the `// ---- Progress computeds …` comment, `parseDate`, `totalDays`, `elapsedDays` and the blank lines between them. `initialsOf` stays.

35. **`ui/summary/SummaryCards.kt`**:
    - Line 205 (A3): `MetricCard("MTD Participation", "${pct.roundToInt()}%", …)` becomes `MetricCard("MTD Participation", String.format(Locale.US, "%.1f%%", pct), "$active/$total members active", change)`.
    - Replace lines 215–219 (`TotalDurationCard`) with:
```kotlin
fun TotalDurationCard(minutes: Int, change: Double, modifier: Modifier = Modifier) {
    // A7 (parity): hours to one decimal, half-up on whole tenths — round(minutes / 6) / 10 — ".0" dropped (web + iOS same).
    val tenths = (minutes / 6.0).roundToInt()
    val label = if (tenths % 10 == 0) "${tenths / 10}" else String.format(Locale.US, "%.1f", tenths / 10.0)
    Box(modifier) { MetricCard("Total duration", "$label hrs", null, change) }
}
```
    - Keep the `@Composable` annotation on the line above. `abs` (line 165) and `roundToInt` stay in use.

36. **`ui/summary/ActivityDetailScreen.kt` (A4)**:
    - Delete line 36 (`import kotlin.math.roundToInt`) and add `import java.util.Locale` after line 35.
    - Lines 135–136 become:
```kotlin
/** A4 (parity): the server's daily average to one decimal, as web + iOS ("0.4", "2.0"). */
private fun formatAverage(v: Double): String = String.format(Locale.US, "%.1f", v)
```

37. **`ui/members/MemberSimpleDetails.kt` (A4)**:
    - Replace line 54 (`import kotlin.math.roundToInt`) with `import java.util.Locale`.
    - Line 167: `data?.let { it.dailyAverage.roundToInt().toString() } ?: "\u2014",` becomes `data?.let { String.format(Locale.US, "%.1f", it.dailyAverage) } ?: "\u2014",  // A4`.

38. **`ui/members/MemberCards.kt` (D2 + A7)**:
    - After line 64 (`import java.time.LocalDate`), add `import java.time.ZoneOffset`.
    - Line 295 becomes `val progress = if (totalDays > 0) ((o.activeDays.toDouble() / totalDays) * 100).roundToInt().coerceIn(0, 100) else 0  // D2 clamp`.
    - Line 369 becomes `val avgDiet = m.avgFoodQuality?.let { "$it / 5" } ?: "—"  // A7: as the hero + iOS + web`.
    - Line 606 comment becomes `// ---- PTD (D2, Members page SPEC): days so far = start → min(end, today) inclusive, min 1, in UTC calendar days (the server's active_days window + D1's elapsed_days); 0 when a date is missing ----`.
    - Line 611: `val today = LocalDate.now()` becomes `val today = LocalDate.now(ZoneOffset.UTC)`.

39. **`core/ProgramContext.kt` (X-2)**:
    - In `refreshSummary` (lines 824–827), insert before `return loadSummary()`:
```kotlin
        // D1 / X-2: the ring reads the open program's /programs row — a pull re-reads it too.
        scope.launch { loadPrograms().onSuccess { reconcileActiveProgram() } }
```
    - In `updateProgram` (lines 1584–1590), replace the `val updated = program.copy(…)` through `setPrograms(…)` lines with:
```kotlin
            val updated = program.copy(
                name = name, status = status, startDate = startDate,
                endDate = endDate, adminOnlyDataEntry = adminOnlyDataEntry,
                // D1 / X-2: the server's day fields belong to the old dates — drop them (the screens fall back to the
                // date math on the new dates) until the list re-read below brings the server's numbers.
                totalDays = null, elapsedDays = null,
            )
            _activeProgram.value = updated
            setPrograms(_programs.value.map { if (it.id == updated.id) updated else it })
            scope.launch { loadPrograms().onSuccess { reconcileActiveProgram() } }
```

## Endgame

40. **Compile-check per surface:**
   - **backend:**
     ```
     cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && node --check services/programService.js && node -e "require('./services/programService'); require('./routes/programs'); console.log('programs module-load ok')"
     ```
     (`.env` supplies `DATABASE_URL`; nothing connects.)
     Then, read-only, through the `supabase-rasifiters` MCP `execute_sql` (SELECT only, UTC made explicit):
     ```sql
     SELECT p.name, p.start_date, p.end_date, (now() AT TIME ZONE 'UTC')::date AS today_utc,
       CASE WHEN p.start_date IS NOT NULL AND p.end_date IS NOT NULL AND p.end_date > p.start_date
            THEN LEAST(100, GREATEST(0, (((now() AT TIME ZONE 'UTC')::date - p.start_date)::numeric
                 / NULLIF((p.end_date - p.start_date)::numeric, 0)) * 100))::int ELSE 0 END AS progress_percent,
       CASE WHEN p.start_date IS NOT NULL AND p.end_date IS NOT NULL AND p.end_date > p.start_date
            THEN (p.end_date - p.start_date)::int ELSE 0 END AS total_days,
       CASE WHEN p.start_date IS NOT NULL AND p.end_date IS NOT NULL AND p.end_date > p.start_date
            THEN LEAST(GREATEST((now() AT TIME ZONE 'UTC')::date - p.start_date, 0), p.end_date - p.start_date)::int
            ELSE 0 END AS elapsed_days
     FROM programs p WHERE p.is_deleted = false ORDER BY p.start_date NULLS LAST;
     ```
     Expected:
     - every row: `progress_percent = round(100·elapsed_days/total_days)` (0 when `total_days` = 0);
     - a past program: elapsed = total, 100;
     - a future program: elapsed 0, 0%;
     - a current program: 0 < elapsed < total.

     After the Render deploy (per-call confirm), read the Render logs (read-only MCP) for any 5xx on `GET /api/programs`.
   - **web:** `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web && npm run build`. That runs the type-check. `next lint` has no ESLint config in `apps/web` and would prompt to create one, so lint is not a gate here. Then check for leftovers:
     ```
     grep -rn "computeProgramProgress\|fetchAnalyticsSummary(token\|toISOString().slice(0, 10)\|todayStr" apps/web/src/app apps/web/src/components
     ```
     It should return nothing. The A9 helper logic check:
     ```
     TZ=America/Vancouver node -e 'const d=new Date("2026-10-14T18:00:00-07:00");const p=n=>String(n).padStart(2,"0");console.log(`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`, d.toISOString().slice(0,10))'
     ```
     It should print `2026-10-14 2026-10-15` (local today vs the old UTC tomorrow).
   - **android:** `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android && ./gradlew :app:assembleDebug`, then:
     ```
     grep -rn "programCompletionPercent\|programElapsedDays\|programRemainingDays" app/src
     ```
     It should return nothing.
   - **ios:** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/tools/ios-typecheck.sh` as a pre-check, then **the user presses ⌘B** (Claude never calls the xcode build tools).
   - **Visual and live checks are the user's, on prod.** This change needs no staging: there is no migration, no auth change, and only additive SELECT columns. Afterwards, clean `apps/web/.next` and the `apps/android/app/build` intermediates and report free disk space.

41. **Migration:** none. The backend change is two SELECT expressions; no `apps/backend/sql/00N_*.sql`.

42. **git-version:**
   - Per multiplex, each surface lands as a no-bump `feat(<surface>)` commit, backend first, then Render deploy.
   - Web deploys next: check `vercel ls`, fall back to `vercel --prod --yes --scope personal-vinayak`, and verify on the apex rasifiters.com.
   - Then ONE docs commit bumps `programs` v0.4.1→**v0.5.0** (MINOR, additive owned-interface fields + D-C6, zero dependent re-version), `analytics` v0.6.1→**v0.6.2** (PATCH), `member-analytics` v0.8.0→**v0.8.1** (PATCH).
   - That commit also bumps the page SPECs below, `registry.json`, both REGISTRY files, and adds §11 rows.
   - Tags: `feature/programs@v0.5.0`, `feature/analytics@v0.6.2`, `feature/member-analytics@v0.8.1`. Page SPECs get no tags.
   - The iOS and Android binaries ride their existing trains; this plan changes no version numbers.

---

## Docs for the orchestrator (names + what to say; the orchestrator writes them)

**Feature SPECs**
- **`specs/features/programs/SPEC.md` (→0.5.0):**
  - §3 response shape: add `total_days`, `elapsed_days`.
  - §4: next to `progress_percent`, give the rule (UTC `CURRENT_DATE` pinned by Sequelize `+00:00`; the 0 cases; the identity `progress_percent = round(100·elapsed/total)`).
  - §9 new **D-C6**: "one server source for program progress (sweep D1); additive; clients fall back to their pre-D1 formula only when the fields are absent".
  - Supersede D-S2 in place: "verbatim except the D-C6 day columns".
  - §10 F2: add "since D3 every client shows one 'N members' (singular at 1)".
  - §11 changelog row.
- **`specs/features/analytics/SPEC.md` (→0.6.2):**
  - §10: no current web/iOS/Android build reads `GET /analytics/summary`; its `program_progress` is superseded by programs D-C6 and the iOS 7-day `distribution_by_day` fallback is removed. The endpoint stays for the iOS binaries already released.
  - §10: clients rank `/analytics/workouts/types` by total time, top 5 + "Others", `limit=100`.
  - §11 row.
- **`specs/features/member-analytics/SPEC.md` (→0.8.1):**
  - §10: the `active_days` window is [program start, today UTC] and not clipped to `end_date`. Clients clamp PTD to 0–100 and use the UTC denominator (Members page D-rule).
  - §11 row.

**Page SPECs, web**
- **`web/summary` (0.4.4→0.5.0):**
  - Retire **F5**.
  - New D-rule for the ring: the `/programs` row via `useActiveProgramRow` + `programProgress`, UTC fallback, no loading state.
  - Fix §-text **:69** ("top 6 types by sessions") and **:107** ("limit 50 … top 6") to "top 5 by total time + Others, limit 100".
  - Total Duration hours rule `round(min/6)/10`, with ".0" dropped.
  - Reads table: drop `fetchAnalyticsSummary`, add `fetchPrograms` `["programs"]`.
- **`web/program` (0.3.2→0.4.0):** D-C3 superseded by programs D-C6 (`computeProgramProgress` deleted); F4 resolved; row label "Members" (D3).
- **`web/programs` (0.6.2→0.6.3):** card line "N members" (D3); dates parsed as local days (A1); Create Program default start/end use the local day (A9).
- **`web/members` (0.4.0→0.5.0):** new PTD D-rule (D2: denominator = start→min(end, today UTC)+1, ≥1, 0 when a date is missing, clamp 0–100); fix §-text :25/:60 ("program total days"); avg diet "N / 5"; the "View Workouts" date is parsed local (A1).
- **`web/members/metrics` (0.2.2→0.2.3):** avg diet "N / 5".
- **`web/members/workouts` (0.1.2→0.1.3)** and **`web/members/health` (0.2.3→0.2.4):** `limit=0` means unbounded (the 1000 cap is gone; CSV is complete).
- **`web/lifestyle` (0.2.2→0.2.3):** the "No data" null state on Most popular / Longest duration / Highest participation.
- **`web/summary/log-workout` + `log-health` (0.2.2→0.2.3 each):** the default row date is the local day (A9). The shared forms are `components/forms/*`.

**Page SPECs, iOS**
- **`ios/admin-summary` (0.2.4→0.3.0):** ring from the `/programs` row (D1); `loadSummary` re-reads `/programs` (best-effort, `.cacheOnly` fills only an empty list); `/analytics/summary` dropped; S-9 fallback removed; participation "%.1f%%"; duration rule.
- **`ios/admin-program` (0.2.2→0.3.0):** retire **F7**, replaced by D1 (server fields, device-calendar fallback only when absent); "Members" label.
- **`ios/program-picker` (0.4.2→0.4.3):** "N members" (D3).
- **`ios/admin-members` (0.5.1→0.6.0):** D2 PTD (UTC days, clamp).
- **`ios/summary-activity-detail` (0.1.3→0.1.4):** DAILY AVERAGE "%.1f" (A4), for both the program and the member variant.
- **`ios/edit-program` (0.1.1→0.1.2):** a save re-reads `/programs`.

**Page SPECs, Android**
- **`android/summary` (0.2.2→0.3.0):** retire **Deviation A-3**, replaced by D1 (`programProgress`); pull-to-refresh re-reads the row (X-2); participation 1-dp; duration rule.
- **`android/program` (0.3.1→0.4.0):** D1; "Members".
- **`android/program-picker` (0.5.1→0.5.2):** D3.
- **`android/members` (0.3.1→0.4.0):** D2 UTC + clamp; grid diet "N / 5".
- **`android/summary-activity-detail` (0.1.1→0.1.2)** and **`android/member-history-detail` (0.1.1→0.1.2):** A4.
- **`android/edit-program` (0.1.2→0.1.3):** a save drops the stale day fields and re-reads `/programs` (X-2).

**Registries and other docs**
- `specs/pages/REGISTRY.md` rows for all of the above.
- `specs/features/REGISTRY.md` + `registry.json` for the three features.
- `audit` skill `LESSONS_ARCHIVE.md` run note; promote "same value, different rounding/denominator/day rule" to the skill's Notes.
- `PROGRESS.md` current state. `RELEASES.md` stays unchanged until a binary ships.

---

## Verification

**Per surface (the user, on prod)**
- **backend:** the SQL in step 40, plus Render logs after deploy.
- **web**, browser time zone America/Vancouver (DevTools → Sensors → Location → timezone override, or the user's machine):
  - the program card / Program-tab Duration / "View Workouts" dates match the stored `YYYY-MM-DD`;
  - the Summary ring equals the picker bar;
  - **A9:** at or after 18:00 local, open Summary → Add workouts / Log daily health (and the row's "+" add-row) and the Create Program sheet; the default date is **today**, not tomorrow;
  - `/members/workouts` CSV row count is above 1000 for a heavy member, where one exists.
- **iOS:** after ⌘B, the Summary ring = the picker bar = the Program tab (as a member/logger); MTD Participation shows one decimal; Activity detail DAILY AVERAGE shows one decimal.
- **Android:** after `assembleDebug`:
  - ring = picker bar = Program tab;
  - edit a program's dates (admin) → back on Summary the ring reflects the new dates, and within a moment matches the picker bar;
  - pull-to-refresh refreshes the ring.

**Cross-surface (one program, one member, the same minute; e.g. the testbed program with `ava.rivera`).** Open web + iOS + Android side by side. These must read identically on all three:
1. The picker card bar and "N members" ("1 member" at 1).
2. The Summary ring %, "E/T days", Elapsed and Remaining. They equal the SQL `progress_percent`/`elapsed_days`/`total_days`.
3. The Program tab (member/logger view): %, days elapsed and days remaining, equal to (2); the row reads "Members".
4. Members → PTD MP %, the bar, and "a / b days". **b = Program-tab days elapsed + 1** while the program is running.
5. MTD Participation % to one decimal.
6. DAILY AVERAGE on Activity detail (W/M/Y/P) and Member history detail, to one decimal.
7. Total duration, with ".0" dropped; Top Workout Types rows (5 + Others); avg diet "N / 5".

Run it once between 17:00 and 24:00 Pacific (UTC date ≠ local date). All three must still agree; they tick together at 00:00 UTC.

---

## Risks the implementer must watch

- **Live-binary compatibility:**
  - iOS 1.4.2 / 1.5.x decode `ProgramDTO` with optional fields, so unknown keys are ignored.
  - Android 1.0.0–1.2.1 have `ignoreUnknownKeys` (`net/Network.kt:31`).
  - Old iOS binaries still call `/analytics/summary`. **Do not touch** `analyticsService.js` or that route.
- **D-S2 fidelity:** only append the interpolated `PROGRESS_DAY_COLUMNS` after `progress_percent` in both branches. Keep the comma, and do not reformat or alter the existing CASE.
- **Day rule:** progress uses UTC days and is server-sourced; PTD uses UTC days on the client. The A9 form "today" is deliberately **local**. Do not unify these.
  - Fallbacks: iOS and Android keep their pre-D1 device-calendar formula (D1 says "current formula"). Web's fallback is the backend's UTC rule, because web had no sound client formula (the Program tab rolled over at 12:00 UTC). This difference is fallback-only and called out here.
- **iOS `programs` overwrite:** `loadSummary` replaces `programs` on `.network` reads only. On `.cacheOnly` it fills an empty list and never overwrites a newer one. The programs read never sets `failure` and never enters `applied`.
- **iOS `updateProgram` refresh failure:** if the re-read fails, the ring keeps the old server numbers until the next Summary appear re-reads them. This is acceptable and best-effort, the same as `createProgram`.
- **Android `updateProgram`:** the local copy must null `totalDays`/`elapsedDays`. Otherwise the X-2 stale ring persists until the re-read lands. The re-read is `scope.launch`, so the edit's result is not delayed.
- **Copy/visual fit:** "66.7%" (title2 / headlineSmall) in a half-width card, "1 member", and the DAILY AVERAGE "0.4" are all short. The user checks fit on a small iPhone, an Android phone, and web mobile + desktop.
- **Parity items added beyond the literal brief, all flagged here:**
  - **A7 duration:** all three use `round(minutes/6)/10` (integer tenths). Today web shows "0.1" and iOS/Android "0.2" for 9 min, and iOS shows "11.9" vs Android "12.0" for 717 min.
  - **A7 null state:** the web "No data" state also covers the two sibling Lifestyle cards (mobile already does all three).
  - **M-4 diet:** the Android grid diet also becomes "N / 5".
  - Strike any of these at approval if unwanted.
- **Out of scope; do not touch:** D4 (change-badge window), D5 (streak), A8 (server range label / popularity constants / iOS null-date carry-over X-3), X-4 (dead empty states), and X-1 cleanup (the unused `AnalyticsSummary` properties and `fetchAnalyticsSummary` wrappers stay declared). The `setMonth(+3)` month-overflow in Create Program also stays.
