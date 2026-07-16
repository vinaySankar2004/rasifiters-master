"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { fetchMemberMetrics, type MemberMetrics } from "@/lib/api/members";
import { initials, escapeCsv, downloadCsv } from "@/lib/format";
import { FlameIcon, SearchIcon } from "@/components/icons";
import { Select } from "@/components/Select";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Modal } from "@/components/ui/Modal";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";

const SORT_OPTIONS = [
  { value: "workouts", label: "Workouts" },
  { value: "total_duration", label: "Total Duration" },
  { value: "avg_duration", label: "Avg Duration" },
  { value: "avg_sleep_hours", label: "Avg Sleep" },
  { value: "active_days", label: "Active Days" },
  { value: "workout_types", label: "Workout Types" },
  { value: "current_streak", label: "Current Streak" },
  { value: "longest_streak", label: "Longest Streak" },
  { value: "avg_food_quality", label: "Avg Diet Quality" },
  { value: "avg_steps", label: "Avg Steps" }
];

const DIR_OPTIONS = [
  { value: "desc", label: "Descending" },
  { value: "asc", label: "Ascending" }
];

type MetricsFilters = {
  dateMode: "all" | "custom";
  startDate: string;
  endDate: string;
  workoutsMin: string;
  workoutsMax: string;
  totalDurationMin: string;
  totalDurationMax: string;
  avgDurationMin: string;
  avgDurationMax: string;
  avgSleepHoursMin: string;
  avgSleepHoursMax: string;
  activeDaysMin: string;
  activeDaysMax: string;
  workoutTypesMin: string;
  workoutTypesMax: string;
  currentStreakMin: string;
  longestStreakMin: string;
  avgFoodQualityMin: string;
  avgFoodQualityMax: string;
  avgStepsMin: string;
  avgStepsMax: string;
};

const defaultFilters: MetricsFilters = {
  dateMode: "all",
  startDate: "",
  endDate: "",
  workoutsMin: "",
  workoutsMax: "",
  totalDurationMin: "",
  totalDurationMax: "",
  avgDurationMin: "",
  avgDurationMax: "",
  avgSleepHoursMin: "",
  avgSleepHoursMax: "",
  activeDaysMin: "",
  activeDaysMax: "",
  workoutTypesMin: "",
  workoutTypesMax: "",
  currentStreakMin: "",
  longestStreakMin: "",
  avgFoodQualityMin: "",
  avgFoodQualityMax: "",
  avgStepsMin: "",
  avgStepsMax: ""
};

export default function MemberMetricsPage() {
  const { program, token, programId } = useAuthGuard();

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("active_days");
  const [direction, setDirection] = useState("desc");
  const [filters, setFilters] = useState<MetricsFilters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);

  const filterParams = useMemo(() => {
    const params: Record<string, string> = {
      workoutsMin: filters.workoutsMin,
      workoutsMax: filters.workoutsMax,
      totalDurationMin: filters.totalDurationMin,
      totalDurationMax: filters.totalDurationMax,
      avgDurationMin: filters.avgDurationMin,
      avgDurationMax: filters.avgDurationMax,
      avgSleepHoursMin: filters.avgSleepHoursMin,
      avgSleepHoursMax: filters.avgSleepHoursMax,
      activeDaysMin: filters.activeDaysMin,
      activeDaysMax: filters.activeDaysMax,
      workoutTypesMin: filters.workoutTypesMin,
      workoutTypesMax: filters.workoutTypesMax,
      currentStreakMin: filters.currentStreakMin,
      longestStreakMin: filters.longestStreakMin,
      avgFoodQualityMin: filters.avgFoodQualityMin,
      avgFoodQualityMax: filters.avgFoodQualityMax,
      avgStepsMin: filters.avgStepsMin,
      avgStepsMax: filters.avgStepsMax
    };
    if (filters.dateMode === "custom") {
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
    }
    return params;
  }, [filters]);

  const metricsQuery = useQuery({
    queryKey: ["members", "metrics", programId, search, sortField, direction, JSON.stringify(filterParams)],
    queryFn: () =>
      fetchMemberMetrics(token, programId, {
        search,
        sort: sortField,
        direction,
        filters: filterParams
      }),
    enabled: !!token && !!programId
  });

  const handleExport = () => {
    if (!metricsQuery.data || metricsQuery.data.members.length === 0) return;
    const programName = (program?.name || "Program").replace(/\s+/g, "");
    const rangeStart = metricsQuery.data.date_range?.start || "all";
    const rangeEnd = metricsQuery.data.date_range?.end || "today";
    const filename = `MemberPerformanceMetrics_${programName}_${rangeStart}_to_${rangeEnd}.csv`;
    const headers = [
      "Name",
      "Workouts",
      "Total Duration",
      "Avg Duration",
      "Avg Sleep",
      "Avg Diet Quality",
      "Avg Steps",
      "Active Days",
      "Workout Types",
      "Current Streak",
      "Longest Streak"
    ];
    let csv = `${headers.join(",")}\n`;
    metricsQuery.data.members.forEach((m) => {
      const row = [
        escapeCsv(m.member_name),
        m.workouts,
        m.total_duration,
        m.avg_duration,
        m.avg_sleep_hours ?? "",
        m.avg_food_quality ?? "",
        m.avg_steps ?? "",
        m.active_days,
        m.workout_types,
        m.current_streak,
        m.longest_streak
      ];
      csv += `${row.join(",")}\n`;
    });
    downloadCsv(filename, csv);
  };

  return (
    <PageShell>
      <PageHeader
        title="Member Performance Metrics"
        subtitle={metricsQuery.data ? `${metricsQuery.data.filtered} members` : "Loading metrics..."}
        backHref="/members"
        actions={
          <button
            type="button"
            onClick={handleExport}
            disabled={!metricsQuery.data || metricsQuery.data.members.length === 0}
            className="pill-button rounded-full px-4 py-2 text-xs font-semibold transition disabled:opacity-40"
          >
            Export CSV
          </button>
        }
      />

      <GlassCard className="relative z-30">
        <div className="grid gap-4 md:grid-cols-[1fr,200px,200px,140px]">
          <div className="metric-pill mt-2 flex items-center gap-2 rounded-2xl px-4 py-3">
            <SearchIcon className="h-4 w-4 text-rf-text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search member"
              className="w-full bg-transparent text-sm font-semibold text-rf-text placeholder:text-rf-text-muted focus:outline-none"
            />
          </div>
          <Select value={sortField} options={SORT_OPTIONS} onChange={setSortField} placeholder="Sort" />
          <Select value={direction} options={DIR_OPTIONS} onChange={setDirection} placeholder="Direction" />
          <button
            type="button"
            onClick={() => setShowFilters(true)}
            className="metric-pill mt-2 rounded-2xl px-4 py-3 text-sm font-semibold text-rf-text"
          >
            Filters
          </button>
        </div>
      </GlassCard>

      {metricsQuery.isLoading && <LoadingState message="Loading metrics..." />}

      {metricsQuery.isError && <ErrorState message={(metricsQuery.error as Error).message} />}

      {metricsQuery.data && metricsQuery.data.members.length === 0 && (
        <EmptyState message="No members to display." />
      )}

      {metricsQuery.data && metricsQuery.data.members.length > 0 && (
        <div className="grid gap-4">
          {metricsQuery.data.members.map((metric) => (
            <MemberMetricsCard key={metric.member_id} metric={metric} hero={sortField} />
          ))}
        </div>
      )}

      <Modal open={showFilters} onClose={() => setShowFilters(false)}>
        <MetricsFilterModal
          filters={filters}
          onChange={setFilters}
          onClose={() => setShowFilters(false)}
          onClear={() => setFilters(defaultFilters)}
        />
      </Modal>
    </PageShell>
  );
}

function MemberMetricsCard({ metric, hero }: { metric: MemberMetrics; hero: string }) {
  const heroValue = useMemo(() => {
    switch (hero) {
      case "total_duration":
        return `${metric.total_duration}`;
      case "avg_duration":
        return `${metric.avg_duration}`;
      case "avg_sleep_hours":
        return metric.avg_sleep_hours?.toFixed(1) ?? "—";
      case "active_days":
        return `${metric.active_days}`;
      case "workout_types":
        return `${metric.workout_types}`;
      case "current_streak":
        return `${metric.current_streak}`;
      case "longest_streak":
        return `${metric.longest_streak}`;
      case "avg_food_quality":
        return metric.avg_food_quality?.toFixed(1) ?? "—";
      default:
        return `${metric.workouts}`;
    }
  }, [hero, metric]);

  const heroLabel = useMemo(() => {
    const found = SORT_OPTIONS.find((option) => option.value === hero);
    return found?.label ?? "Active Days";
  }, [hero]);

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="metric-pill flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-rf-text">
            {initials(metric.member_name)}
          </div>
          <div>
            <p className="text-base font-semibold text-rf-text">{metric.member_name}</p>
            <p className="text-xs text-rf-text-muted">Workouts {metric.workouts}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-rf-accent">{heroValue}</p>
          <p className="text-xs text-rf-text-muted">{heroLabel}</p>
        </div>
      </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-rf-text-muted">
          <div className="metric-pill rounded-2xl px-3 py-2">
            <p className="font-semibold text-rf-text">{metric.active_days}</p>
            <p>Active days</p>
          </div>
          <div className="metric-pill rounded-2xl px-3 py-2">
            <p className="font-semibold text-rf-text">{metric.total_duration}</p>
            <p>Total mins</p>
          </div>
          <div className="metric-pill rounded-2xl px-3 py-2">
            <p className="font-semibold text-rf-text">{metric.workout_types}</p>
            <p>Types</p>
          </div>
          <div className="metric-pill rounded-2xl px-3 py-2">
            <p className="font-semibold text-rf-text">{metric.avg_sleep_hours?.toFixed(1) ?? "—"}</p>
            <p>Avg sleep</p>
          </div>
          <div className="metric-pill rounded-2xl px-3 py-2">
            <p className="font-semibold text-rf-text">{metric.avg_food_quality?.toFixed(1) ?? "—"}</p>
            <p>Avg diet</p>
          </div>
          <div className="metric-pill rounded-2xl px-3 py-2">
            <p className="font-semibold text-rf-text">{metric.longest_streak}d</p>
            <p>Longest streak</p>
          </div>
        </div>
      <div className="mt-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-rf-warning/20 px-3 py-1 text-xs font-semibold text-rf-warning">
          <FlameIcon className="h-3.5 w-3.5" /> Current streak {metric.current_streak}d
        </span>
      </div>
    </GlassCard>
  );
}

function MetricsFilterModal({
  filters,
  onChange,
  onClose,
  onClear
}: {
  filters: MetricsFilters;
  onChange: (filters: MetricsFilters) => void;
  onClose: () => void;
  onClear: () => void;
}) {
  return (
    <div className="modal-surface max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-rf-text">Filters</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            className="rounded-full bg-rf-surface-muted px-3 py-1 text-xs font-semibold text-rf-text-muted"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-rf-surface-muted px-3 py-1 text-xs font-semibold text-rf-text-muted"
          >
            Done
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div className="rounded-2xl bg-rf-surface-muted p-4">
          <p className="text-sm font-semibold text-rf-text">Date range</p>
          <div className="segmented-control mt-2 flex gap-2 p-1">
            {["all", "custom"].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChange({ ...filters, dateMode: mode as "all" | "custom" })}
                data-active={filters.dateMode === mode}
                className="rounded-full px-4 py-2 text-xs font-semibold transition"
              >
                {mode === "all" ? "All" : "Custom"}
              </button>
            ))}
          </div>
          {filters.dateMode === "custom" && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-rf-text-muted">Start</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(event) => onChange({ ...filters, startDate: event.target.value })}
                  className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-rf-text-muted">End</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(event) => onChange({ ...filters, endDate: event.target.value })}
                  className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
                />
              </div>
            </div>
          )}
        </div>

        <FilterRange label="Workouts" minValue={filters.workoutsMin} maxValue={filters.workoutsMax} onChange={(min, max) => onChange({ ...filters, workoutsMin: min, workoutsMax: max })} />
        <FilterRange label="Total Duration (mins)" minValue={filters.totalDurationMin} maxValue={filters.totalDurationMax} onChange={(min, max) => onChange({ ...filters, totalDurationMin: min, totalDurationMax: max })} />
        <FilterRange label="Avg Duration (mins)" minValue={filters.avgDurationMin} maxValue={filters.avgDurationMax} onChange={(min, max) => onChange({ ...filters, avgDurationMin: min, avgDurationMax: max })} />
        <FilterRange label="Avg Sleep (hrs)" minValue={filters.avgSleepHoursMin} maxValue={filters.avgSleepHoursMax} onChange={(min, max) => onChange({ ...filters, avgSleepHoursMin: min, avgSleepHoursMax: max })} />
        <FilterRange label="Active Days" minValue={filters.activeDaysMin} maxValue={filters.activeDaysMax} onChange={(min, max) => onChange({ ...filters, activeDaysMin: min, activeDaysMax: max })} />
        <FilterRange label="Workout Types" minValue={filters.workoutTypesMin} maxValue={filters.workoutTypesMax} onChange={(min, max) => onChange({ ...filters, workoutTypesMin: min, workoutTypesMax: max })} />
        <FilterRange label="Current Streak" minValue={filters.currentStreakMin} maxValue="" onChange={(min) => onChange({ ...filters, currentStreakMin: min })} />
        <FilterRange label="Longest Streak" minValue={filters.longestStreakMin} maxValue="" onChange={(min) => onChange({ ...filters, longestStreakMin: min })} />
        <FilterRange label="Avg Diet Quality" minValue={filters.avgFoodQualityMin} maxValue={filters.avgFoodQualityMax} onChange={(min, max) => onChange({ ...filters, avgFoodQualityMin: min, avgFoodQualityMax: max })} />
        <FilterRange label="Avg Steps" minValue={filters.avgStepsMin} maxValue={filters.avgStepsMax} onChange={(min, max) => onChange({ ...filters, avgStepsMin: min, avgStepsMax: max })} />
      </div>
    </div>
  );
}

function FilterRange({
  label,
  minValue,
  maxValue,
  onChange
}: {
  label: string;
  minValue: string;
  maxValue: string;
  onChange: (min: string, max: string) => void;
}) {
  return (
    <div className="rounded-2xl bg-rf-surface-muted p-4">
      <p className="text-sm font-semibold text-rf-text">{label}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <input
          value={minValue}
          onChange={(event) => onChange(event.target.value, maxValue)}
          placeholder="Min"
          className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
        />
        <input
          value={maxValue}
          onChange={(event) => onChange(minValue, event.target.value)}
          placeholder="Max"
          className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
        />
      </div>
    </div>
  );
}
