export function formatDateRange(start?: string | null, end?: string | null) {
  const startText = formatShortDate(start) ?? "Start";
  const endText = formatShortDate(end) ?? "End";
  return `${startText} – ${endText}`;
}

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

export function formatInviteDate(dateString?: string | null) {
  if (!dateString) return "Invited recently";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Invited recently";
  return `Invited on ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  })}`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .slice(0, 2)
    .join("");
}

export function sleepLabel(value: number | null) {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)} hrs`;
}

export function dietLabel(value: number | null) {
  if (value === null || value === undefined) return "—";
  return `${value}/5`;
}

export function stepsLabel(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString();
}

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

export function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Like formatDuration, but scales up to days for large aggregate totals (e.g. total
// time spent on a workout type across a whole program). Shows the two largest units:
// "45m" → "3h 12m" → "1d 4h".
export function formatTotalDuration(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes}m`;
  if (totalMinutes < 1440) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}

export function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, data: string) {
  const blob = new Blob([data], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
