"use client";

export type PeriodKey = "week" | "month" | "year" | "program";

const DEFAULT_PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "week", label: "W" },
  { key: "month", label: "M" },
  { key: "year", label: "Y" },
  { key: "program", label: "P" }
];

// Screen-reader names for the one-letter segments (polish #36).
const PERIOD_NAMES: Record<PeriodKey, string> = { week: "Week", month: "Month", year: "Year", program: "Program" };

export function PeriodSelector({
  value,
  onChange,
  periods = DEFAULT_PERIODS
}: {
  value: PeriodKey;
  onChange: (key: PeriodKey) => void;
  periods?: { key: PeriodKey; label: string }[];
}) {
  return (
    <div role="group" aria-label="Period" className="segmented-control flex rounded-full p-1">
      {periods.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          data-active={value === item.key}
          aria-pressed={value === item.key}
          aria-label={PERIOD_NAMES[item.key]}
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-full px-3 text-sm font-semibold transition"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
