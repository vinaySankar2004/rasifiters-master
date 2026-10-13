import type { MemberMetrics, MemberMetricsResponse } from "@/lib/api/members";
import { escapeCsv } from "@/lib/format";

// Member Performance Metrics CSV — member-analytics D-C8 (polish #47): ONE column contract on web, iOS and Android.
// Rows = the page's list in its on-screen order (the server applied search + filters + sort). Units live in the headers
// so every number cell stays a plain number a spreadsheet can sort; a missing average is an empty cell.
export const METRICS_CSV_HEADERS = [
  "Name",
  "Active Days",
  "Workouts",
  "Total Duration (min)",
  "Workout Types",
  "Avg Duration (min)",
  "Longest Streak (days)",
  "Avg Sleep (hrs)",
  "Avg Diet Quality (out of 5)",
  "Avg Steps",
  "Current Streak (days)"
] as const;

export function metricsCsv(members: MemberMetrics[]): string {
  const rows = members.map((m) =>
    [
      escapeCsv(m.member_name),
      m.active_days,
      m.workouts,
      m.total_duration,
      m.workout_types,
      m.avg_duration,
      m.longest_streak,
      m.avg_sleep_hours == null ? "" : m.avg_sleep_hours.toFixed(1),
      m.avg_food_quality == null ? "" : String(Math.round(m.avg_food_quality)),
      m.avg_steps == null ? "" : String(Math.round(m.avg_steps)),
      m.current_streak
    ].join(",")
  );
  return [METRICS_CSV_HEADERS.join(","), ...rows].join("\n") + "\n";
}

export function metricsCsvFilename(programName: string | undefined, range: MemberMetricsResponse["date_range"]): string {
  const name = (programName ?? "").replace(/[^A-Za-z0-9]/g, "") || "Program";
  return `MemberPerformanceMetrics_${name}_${range?.start || "all"}_to_${range?.end || "today"}.csv`;
}
