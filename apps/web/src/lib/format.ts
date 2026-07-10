export function formatDateRange(start?: string | null, end?: string | null) {
  const startText = formatShortDate(start) ?? "Start";
  const endText = formatShortDate(end) ?? "End";
  return `${startText} – ${endText}`;
}

export function formatShortDate(dateString?: string | null) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
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
