"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { isDataEntryLocked } from "@/lib/permissions";
import { fetchMemberHealthLogs, type MemberHealthItem } from "@/lib/api/members";
import { deleteDailyHealthLog, updateDailyHealthLog } from "@/lib/api/logs";
import { Select } from "@/components/Select";
import { sleepLabel, dietLabel, stepsLabel, downloadCsv } from "@/lib/format";
import { useClientSearchParams } from "@/lib/use-client-search-params";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";

const SORT_FIELDS = [
  { value: "date", label: "Date" },
  { value: "sleep_hours", label: "Sleep hours" },
  { value: "food_quality", label: "Diet quality" },
  { value: "steps", label: "Steps" }
];

const SORT_DIRS = [
  { value: "desc", label: "Descending" },
  { value: "asc", label: "Ascending" }
];

const DIET_OPTIONS = ["", "1", "2", "3", "4", "5"].map((value) => ({
  value,
  label: value ? `${value}` : "Not set"
}));

const DIET_FILTER_OPTIONS = [{ value: "", label: "Any" }, ...["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v }))];

function formatSleepHoursForFilter(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m sleep`;
  if (m === 0) return `${h}h sleep`;
  return `${h}h ${m}m sleep`;
}

export default function MemberHealthPage() {
  const router = useRouter();
  const params = useClientSearchParams();
  const memberId = params.get("memberId") ?? "";
  const memberName = params.get("name") ?? "Member";
  const { session, program, token, programId } = useAuthGuard();
  const queryClient = useQueryClient();

  const isGlobalAdmin = session?.user.globalRole === "global_admin";
  const isProgramAdmin = program?.my_role === "admin" || program?.my_role === "logger";
  const loggedInUserId = session?.user.id;
  const canViewAny = isGlobalAdmin || isProgramAdmin;
  const canEdit = !isDataEntryLocked(session, program) && (canViewAny || memberId === loggedInUserId);

  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [minSleepHours, setMinSleepHours] = useState("");
  const [minSleepMinutes, setMinSleepMinutes] = useState("");
  const [maxSleepHours, setMaxSleepHours] = useState("");
  const [maxSleepMinutes, setMaxSleepMinutes] = useState("");
  const [minDiet, setMinDiet] = useState("");
  const [maxDiet, setMaxDiet] = useState("");
  const [minSteps, setMinSteps] = useState("");
  const [maxSteps, setMaxSteps] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [editTarget, setEditTarget] = useState<MemberHealthItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MemberHealthItem | null>(null);
  const [editSleepHours, setEditSleepHours] = useState("");
  const [editSleepMinutes, setEditSleepMinutes] = useState("");
  const [editDiet, setEditDiet] = useState("");
  const [editSteps, setEditSteps] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!memberId) return;
    if (!canViewAny && memberId !== loggedInUserId) {
      router.push("/members");
    }
  }, [memberId, canViewAny, loggedInUserId, router]);

  const minSleepHoursNum = useMemo(() => {
    const total = (Number(minSleepHours) || 0) + (Number(minSleepMinutes) || 0) / 60;
    const hasInput = minSleepHours.trim() !== "" || minSleepMinutes.trim() !== "";
    return hasInput && total > 0 ? total : undefined;
  }, [minSleepHours, minSleepMinutes]);
  const maxSleepHoursNum = useMemo(() => {
    const total = (Number(maxSleepHours) || 0) + (Number(maxSleepMinutes) || 0) / 60;
    const hasInput = maxSleepHours.trim() !== "" || maxSleepMinutes.trim() !== "";
    return hasInput && total > 0 ? total : undefined;
  }, [maxSleepHours, maxSleepMinutes]);
  const minDietNum = useMemo(() => {
    const n = parseInt(minDiet, 10);
    return minDiet.trim() !== "" && !Number.isNaN(n) && n >= 1 && n <= 5 ? n : undefined;
  }, [minDiet]);
  const maxDietNum = useMemo(() => {
    const n = parseInt(maxDiet, 10);
    return maxDiet.trim() !== "" && !Number.isNaN(n) && n >= 1 && n <= 5 ? n : undefined;
  }, [maxDiet]);
  const minStepsNum = useMemo(() => {
    const n = parseInt(minSteps, 10);
    return minSteps.trim() !== "" && !Number.isNaN(n) && n >= 0 ? n : undefined;
  }, [minSteps]);
  const maxStepsNum = useMemo(() => {
    const n = parseInt(maxSteps, 10);
    return maxSteps.trim() !== "" && !Number.isNaN(n) && n >= 0 ? n : undefined;
  }, [maxSteps]);

  const healthQuery = useQuery({
    queryKey: [
      "members",
      "health",
      programId,
      memberId,
      sortField,
      sortDir,
      startDate,
      endDate,
      minSleepHoursNum,
      maxSleepHoursNum,
      minDietNum,
      maxDietNum,
      minStepsNum,
      maxStepsNum
    ],
    queryFn: () =>
      fetchMemberHealthLogs(token, programId, memberId, {
        limit: 0,
        sortBy: sortField,
        sortDir,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        minSleepHours: minSleepHoursNum,
        maxSleepHours: maxSleepHoursNum,
        minFoodQuality: minDietNum,
        maxFoodQuality: maxDietNum,
        minSteps: minStepsNum,
        maxSteps: maxStepsNum
      }),
    enabled: !!token && !!programId && !!memberId
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { sleep_hours?: number | null; food_quality?: number | null; steps?: number | null }) =>
      updateDailyHealthLog(token, {
        program_id: programId,
        member_id: memberId,
        log_date: editTarget?.logDate ?? "",
        ...payload
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["members", "health", programId, memberId] });
      setEditTarget(null);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update daily health log.");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (item: MemberHealthItem) =>
      deleteDailyHealthLog(token, {
        program_id: programId,
        member_id: memberId,
        log_date: item.logDate
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["members", "health", programId, memberId] });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete daily health log.");
    }
  });

  const hasActiveFilters =
    startDate ||
    endDate ||
    minSleepHours.trim() ||
    minSleepMinutes.trim() ||
    maxSleepHours.trim() ||
    maxSleepMinutes.trim() ||
    minDiet.trim() ||
    maxDiet.trim() ||
    minSteps.trim() ||
    maxSteps.trim();
  const formattedFilters = useMemo(() => {
    const parts: string[] = [];
    if (startDate || endDate) parts.push(`${startDate || "Start"} – ${endDate || "End"}`);
    if (minSleepHoursNum !== undefined) parts.push(`At least ${formatSleepHoursForFilter(minSleepHoursNum)}`);
    if (maxSleepHoursNum !== undefined) parts.push(`At most ${formatSleepHoursForFilter(maxSleepHoursNum)}`);
    if (minDietNum !== undefined || maxDietNum !== undefined) {
      if (minDietNum !== undefined && maxDietNum !== undefined) parts.push(`Diet ${minDietNum}–${maxDietNum}`);
      else if (minDietNum !== undefined) parts.push(`Diet ≥ ${minDietNum}`);
      else parts.push(`Diet ≤ ${maxDietNum}`);
    }
    if (minStepsNum !== undefined || maxStepsNum !== undefined) {
      if (minStepsNum !== undefined && maxStepsNum !== undefined) parts.push(`Steps ${minStepsNum}–${maxStepsNum}`);
      else if (minStepsNum !== undefined) parts.push(`Steps ≥ ${minStepsNum}`);
      else parts.push(`Steps ≤ ${maxStepsNum}`);
    }
    return parts.length === 0 ? null : parts.join(" · ");
  }, [startDate, endDate, minSleepHoursNum, maxSleepHoursNum, minDietNum, maxDietNum, minStepsNum, maxStepsNum]);

  const parseSleepInput = (hoursText: string, minutesText: string) => {
    const trimmedHours = hoursText.trim();
    const trimmedMinutes = minutesText.trim();
    const hasInput = trimmedHours !== "" || trimmedMinutes !== "";
    if (!hasInput) {
      return { hasInput: false, sleepValue: null as number | null, isValid: true };
    }
    const hoursValue = trimmedHours === "" ? 0 : Number(trimmedHours);
    const minutesValue = trimmedMinutes === "" ? 0 : Number(trimmedMinutes);
    const hoursValid =
      trimmedHours === "" || (!Number.isNaN(hoursValue) && Number.isInteger(hoursValue) && hoursValue >= 0 && hoursValue <= 24);
    const minutesValid =
      trimmedMinutes === "" || (!Number.isNaN(minutesValue) && Number.isInteger(minutesValue) && minutesValue >= 0 && minutesValue < 60);
    if (!hoursValid || !minutesValid) {
      return { hasInput: true, sleepValue: null as number | null, isValid: false };
    }
    const total = hoursValue + minutesValue / 60;
    const isValid = total >= 0 && total <= 24;
    return { hasInput: true, sleepValue: isValid ? total : null, isValid };
  };

  const sleepInput = parseSleepInput(editSleepHours, editSleepMinutes);

  const handleExport = () => {
    if (!healthQuery.data || healthQuery.data.items.length === 0) return;
    const filename = `Health_${memberName.replace(/\s+/g, "")}_${startDate || "all"}_to_${endDate || "today"}.csv`;
    let csv = "Date,Sleep hours,Diet quality,Steps\n";
    healthQuery.data.items.forEach((item) => {
      csv += `${item.logDate},${item.sleepHours ?? ""},${item.foodQuality ?? ""},${item.steps ?? ""}\n`;
    });
    downloadCsv(filename, csv);
  };

  const openEdit = (item: MemberHealthItem) => {
    const split = splitSleepHours(item.sleepHours);
    setEditTarget(item);
    setEditSleepHours(split.hours);
    setEditSleepMinutes(split.minutes);
    setEditDiet(item.foodQuality !== null && item.foodQuality !== undefined ? String(item.foodQuality) : "");
    setEditSteps(item.steps !== null && item.steps !== undefined ? String(item.steps) : "");
    setErrorMessage(null);
  };

  const submitEdit = () => {
    if (!editTarget) return;
    const dietValue = editDiet.trim() === "" ? null : Number(editDiet);
    const stepsValue = editSteps.trim() === "" ? null : Number(editSteps.trim());
    if (!sleepInput.isValid) {
      setErrorMessage("Sleep time must be between 0:00 and 24:00.");
      return;
    }
    if (stepsValue !== null && (!Number.isInteger(stepsValue) || stepsValue < 0)) {
      setErrorMessage("Steps must be a non-negative whole number.");
      return;
    }
    if (!sleepInput.hasInput && (dietValue === null || Number.isNaN(dietValue)) && stepsValue === null) {
      setErrorMessage("Provide sleep time, diet quality, or steps before saving.");
      return;
    }
    updateMutation.mutate({
      sleep_hours: sleepInput.sleepValue,
      food_quality: Number.isNaN(dietValue) ? null : dietValue,
      steps: stepsValue
    });
  };

  return (
    <PageShell maxWidth="4xl">
      <PageHeader
        title="View Health"
        subtitle={memberName}
        backHref="/members"
        actions={
          <button
            type="button"
            onClick={handleExport}
            disabled={!healthQuery.data || healthQuery.data.items.length === 0}
            className="pill-button rounded-full px-4 py-2 text-xs font-semibold transition disabled:opacity-40"
          >
            Export CSV
          </button>
        }
      />

      <GlassCard className="relative z-30">
        <div className="grid gap-4 md:grid-cols-[1fr,200px,200px,140px]">
          <Select value={sortField} options={SORT_FIELDS} onChange={setSortField} placeholder="Sort" />
          <Select value={sortDir} options={SORT_DIRS} onChange={setSortDir} placeholder="Direction" />
          <button
            type="button"
            onClick={() => setShowFilter(true)}
            className={`mt-2 rounded-2xl px-4 py-3 text-sm font-semibold ${hasActiveFilters ? "bg-rf-accent/20 text-rf-accent" : "bg-rf-surface-muted text-rf-text-muted"}`}
          >
            Filter
          </button>
          {formattedFilters && (
            <div className="rounded-2xl bg-rf-surface-muted px-4 py-3 text-xs text-rf-text-muted">
              {formattedFilters}
            </div>
          )}
        </div>
      </GlassCard>

      {errorMessage && <p className="text-sm font-semibold text-rf-danger">{errorMessage}</p>}

      {healthQuery.isLoading && <LoadingState message="Loading daily health logs..." />}

      {healthQuery.data && healthQuery.data.items.length === 0 && (
        <EmptyState message="No daily health logs found." />
      )}

      {healthQuery.data && healthQuery.data.items.length > 0 && (
        <div className="grid gap-3">
          {healthQuery.data.items.map((item) => (
            <GlassCard key={item.id} padding="sm">
              <div>
                <p className="text-base font-semibold text-rf-text">{item.logDate}</p>
                <p className="text-xs text-rf-text-muted">
                  Sleep {sleepLabel(item.sleepHours)} · Diet {dietLabel(item.foodQuality)} · Steps {stepsLabel(item.steps)}
                </p>
              </div>
              {canEdit && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="rounded-full bg-rf-surface-muted px-3 py-1 text-xs font-semibold text-rf-text-muted"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    className="rounded-full bg-rf-danger/10 px-3 py-1 text-xs font-semibold text-rf-danger"
                  >
                    Delete
                  </button>
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}

      <Modal open={showFilter} onClose={() => setShowFilter(false)}>
        <div className="modal-surface w-full max-w-md rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-rf-text">Filter</h2>
            <button
              type="button"
              onClick={() => setShowFilter(false)}
              className="rounded-full bg-rf-surface-muted px-3 py-1 text-xs font-semibold text-rf-text-muted"
            >
              Done
            </button>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <label className="text-sm font-semibold text-rf-text">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-rf-text">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-rf-text">Min sleep</label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={minSleepHours}
                  onChange={(e) => setMinSleepHours(e.target.value)}
                  className="input-shell w-20 rounded-2xl px-4 py-3 text-center text-sm font-medium"
                  placeholder="0"
                />
                <span className="text-sm text-rf-text-muted">hr</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minSleepMinutes}
                  onChange={(e) => setMinSleepMinutes(e.target.value)}
                  className="input-shell w-20 rounded-2xl px-4 py-3 text-center text-sm font-medium"
                  placeholder="0"
                />
                <span className="text-sm text-rf-text-muted">min</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-rf-text">Max sleep</label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={maxSleepHours}
                  onChange={(e) => setMaxSleepHours(e.target.value)}
                  className="input-shell w-20 rounded-2xl px-4 py-3 text-center text-sm font-medium"
                  placeholder="0"
                />
                <span className="text-sm text-rf-text-muted">hr</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={maxSleepMinutes}
                  onChange={(e) => setMaxSleepMinutes(e.target.value)}
                  className="input-shell w-20 rounded-2xl px-4 py-3 text-center text-sm font-medium"
                  placeholder="0"
                />
                <span className="text-sm text-rf-text-muted">min</span>
              </div>
            </div>
            <div>
              <Select
                label="Min diet (1–5)"
                value={minDiet}
                options={DIET_FILTER_OPTIONS}
                onChange={setMinDiet}
                placeholder="Any"
              />
            </div>
            <div>
              <Select
                label="Max diet (1–5)"
                value={maxDiet}
                options={DIET_FILTER_OPTIONS}
                onChange={setMaxDiet}
                placeholder="Any"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-rf-text">Min steps</label>
              <input
                type="number"
                min={0}
                value={minSteps}
                onChange={(event) => setMinSteps(event.target.value)}
                className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
                placeholder="Any"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-rf-text">Max steps</label>
              <input
                type="number"
                min={0}
                value={maxSteps}
                onChange={(event) => setMaxSteps(event.target.value)}
                className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
                placeholder="Any"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setStartDate("");
                setEndDate("");
                setMinSleepHours("");
                setMinSleepMinutes("");
                setMaxSleepHours("");
                setMaxSleepMinutes("");
                setMinDiet("");
                setMaxDiet("");
                setMinSteps("");
                setMaxSteps("");
              }}
              className="rounded-full bg-rf-surface-muted px-3 py-1 text-xs font-semibold text-rf-text-muted"
            >
              Clear all filters
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)}>
        {editTarget && (
          <div className="modal-surface w-full max-w-md rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-rf-text">Edit Daily Health</h2>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="rounded-full bg-rf-surface-muted px-3 py-1 text-xs font-semibold text-rf-text-muted"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-semibold text-rf-text">Date</label>
                <input
                  type="date"
                  value={editTarget.logDate}
                  disabled
                  className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium opacity-60"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-rf-text">Sleep time</label>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <input
                    value={editSleepHours}
                    onChange={(event) => {
                      const next = event.target.value.replace(/\D/g, "").slice(0, 2);
                      setEditSleepHours(next);
                    }}
                    placeholder="Hours"
                    inputMode="numeric"
                    className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
                  />
                  <input
                    value={editSleepMinutes}
                    onChange={(event) => {
                      const next = event.target.value.replace(/\D/g, "").slice(0, 2);
                      setEditSleepMinutes(next);
                    }}
                    placeholder="Minutes"
                    inputMode="numeric"
                    className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
                  />
                </div>
                {!sleepInput.isValid && (
                  <p className="mt-2 text-xs font-semibold text-rf-danger">Sleep time must be between 0:00 and 24:00.</p>
                )}
              </div>
              <Select
                label="Diet quality"
                value={editDiet}
                options={DIET_OPTIONS}
                onChange={setEditDiet}
                placeholder="Select Rating (1-5)"
              />
              <div>
                <label className="text-sm font-semibold text-rf-text">Steps</label>
                <input
                  type="number"
                  min={0}
                  value={editSteps}
                  onChange={(event) => setEditSteps(event.target.value)}
                  className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
                  placeholder="Leave blank to clear"
                />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="rounded-full bg-rf-surface-muted px-4 py-2 text-xs font-semibold text-rf-text-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitEdit}
                disabled={updateMutation.isPending}
                className="button-primary rounded-full px-5 py-2 text-xs font-semibold"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete daily health log?"
        description={deleteTarget ? `Delete the daily health log from ${deleteTarget.logDate}?` : ""}
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget);
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </PageShell>
  );
}

function splitSleepHours(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { hours: "", minutes: "" };
  }
  const clamped = Math.max(0, Math.min(24, value));
  let hours = Math.floor(clamped);
  let minutes = Math.round((clamped - hours) * 60);
  if (minutes === 60) {
    hours = Math.min(24, hours + 1);
    minutes = 0;
  }
  if (hours >= 24) {
    hours = 24;
    minutes = 0;
  }
  return { hours: String(hours), minutes: String(minutes) };
}
