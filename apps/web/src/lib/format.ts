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
