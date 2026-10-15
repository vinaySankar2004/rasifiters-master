// Program day math shared by the Summary ring, the Program tab and the Members "PTD MP %" — one rule on web, iOS and
// Android. Progress counts in UTC days (server): GET /programs progress_percent · elapsed_days · total_days (D1 /
// programs SPEC §9 D-C6). PTD counts in the device's local calendar day (log dates are local days).

const DAY_MS = 86_400_000;

export type ProgramProgress = { percent: number; elapsedDays: number; totalDays: number; remainingDays: number };

type ProgressSource = {
  start_date?: string | null;
  end_date?: string | null;
  progress_percent?: number | null;
  total_days?: number | null;
  elapsed_days?: number | null;
};

type Dated = { start_date?: string | null; end_date?: string | null };

/** "YYYY-MM-DD…" → that calendar day's UTC midnight in ms; null when it isn't a date. */
function utcDayMs(value?: string | null): number | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function todayUtcMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** B1: the device's LOCAL calendar day as a UTC-midnight ms (so it subtracts cleanly from utcDayMs values). */
function todayLocalAsUtcMs(): number {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

/** A4: the /programs row only while its dates are the open program's — after a date edit the cached row still holds
 *  the old dates' day counts until the refetch lands; null → the same-rule fallback on the program's own dates. */
export function rowForDates<T extends Dated>(row: T | null, program?: Dated | null): T | null {
  if (!row || !program) return row;
  const day = (value?: string | null) => (value ?? "").slice(0, 10);
  return day(row.start_date) === day(program.start_date) && day(row.end_date) === day(program.end_date) ? row : null;
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
    percent: Math.round((elapsedDays * 100) / totalDays),
    elapsedDays,
    totalDays,
    remainingDays: totalDays - elapsedDays
  };
}

/**
 * D2 + B1 (Members page SPEC): the "PTD MP %" denominator — days from program start to min(end, today), inclusive, at
 * least 1, in the device's local calendar day (log dates are local days); 0 when a date is missing.
 */
export function ptdDays(start?: string | null, end?: string | null): number {
  const startMs = utcDayMs(start);
  const endMs = utcDayMs(end);
  if (startMs === null || endMs === null) return 0;
  return Math.max(1, Math.round((Math.min(endMs, todayLocalAsUtcMs()) - startMs) / DAY_MS) + 1);
}

/** D2: active days ÷ ptdDays, rounded, clamped 0–100 (0 when ptdDays is 0). */
export function ptdPercent(activeDays: number, days: number): number {
  if (days <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((activeDays / days) * 100)));
}
