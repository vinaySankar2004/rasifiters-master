// Local calendar math for an IANA time zone, with Intl only (no dependency) — notifications SPEC §3.6 (the scheduler
// rule). Dates are "YYYY-MM-DD" strings (they compare correctly as strings); times are "HH:MM"; weekday 1 = Monday …
// 7 = Sunday (ISO).
const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const formatters = new Map(); // zone → formatter (zones are a small, bounded set)

const formatterFor = (timeZone) => {
    let formatter = formatters.get(timeZone);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hourCycle: "h23",
            weekday: "short",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
        formatters.set(timeZone, formatter);
    }
    return formatter;
};

/** { date, minutes (0–1439), weekday (1–7) } of `now` in `timeZone`; null for a missing zone or one Intl rejects. */
function localParts(timeZone, now = new Date()) {
    if (!timeZone) return null;
    let parts;
    try {
        parts = formatterFor(timeZone).formatToParts(now);
    } catch (_err) {
        return null;
    }
    const value = (type) => parts.find((part) => part.type === type)?.value;
    return {
        date: `${value("year")}-${value("month")}-${value("day")}`,
        minutes: Number(value("hour")) * 60 + Number(value("minute")),
        weekday: WEEKDAYS[value("weekday")]
    };
}

const toMinutes = (time) => {
    const [hours, minutes] = String(time).split(":").map(Number);
    return hours * 60 + minutes;
};

// A real calendar date ("2026-02-30" is not — Date.parse would roll it over).
const isValidDate = (date) =>
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;

const addDaysToDate = (date, days) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};

/** ISO-8601 week of a date, e.g. "2026-W42" — the weekly digest's never-send-twice period. */
function isoWeekKey(date) {
    const d = new Date(`${date}T00:00:00Z`);
    const weekday = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - weekday); // the Thursday of this ISO week decides its year
    const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
    const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** "today" | "yesterday" | "on Oct 12" — copy relative to the recipient's local today (People kudos uses it). */
function dayLabel(date, today) {
    if (date === today) return "today";
    if (date === addDaysToDate(today, -1)) return "yesterday";
    const label = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" })
        .format(new Date(`${date}T00:00:00Z`));
    return `on ${label}`;
}

module.exports = { localParts, toMinutes, isValidDate, addDaysToDate, isoWeekKey, dayLabel };
