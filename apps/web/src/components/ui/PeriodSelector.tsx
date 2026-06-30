"use client";

export type PeriodKey = "week" | "month" | "year" | "program";

const DEFAULT_PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "week", label: "W" },
  { key: "month", label: "M" },
  { key: "year", label: "Y" },
  { key: "program", label: "P" }
];

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
    <div className="segmented-control flex rounded-full p-1">
      {periods.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          data-active={value === item.key}
          className="flex-1 rounded-full px-3 py-2 text-sm font-semibold transition"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
