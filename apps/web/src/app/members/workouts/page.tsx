"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { isDataEntryLocked } from "@/lib/permissions";
import { fetchMemberRecentWorkouts, type MemberRecentItem } from "@/lib/api/members";
import { fetchProgramWorkouts } from "@/lib/api/program-workouts";
import { deleteWorkoutLog, updateWorkoutLog } from "@/lib/api/logs";
import { escapeCsv, downloadCsv, formatDuration } from "@/lib/format";
import { Select } from "@/components/Select";
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
  { value: "duration", label: "Duration" },
  { value: "workoutType", label: "Workout Type" }
];

const SORT_DIRS = [
  { value: "desc", label: "Descending" },
  { value: "asc", label: "Ascending" }
];

export default function MemberWorkoutsPage() {
  const router = useRouter();
  const params = useClientSearchParams();
  const memberId = params.get("memberId") ?? "";
  const memberName = params.get("name") ?? "Member";
  const { session, program, token, programId } = useAuthGuard();
  const queryClient = useQueryClient();

  const isGlobalAdmin = session?.user.globalRole === "global_admin";
  const canViewAny = isGlobalAdmin || program?.my_role === "admin" || program?.my_role === "logger";
  const loggedInUserId = session?.user.id;
  const canDelete =
    !isDataEntryLocked(session, program) &&
    (isGlobalAdmin ||
      program?.my_role === "admin" ||
      program?.my_role === "logger" ||
      memberId === loggedInUserId);
  const canEdit = canDelete;

  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [workoutType, setWorkoutType] = useState("");
  const [minDurationHours, setMinDurationHours] = useState("");
  const [minDurationMinutes, setMinDurationMinutes] = useState("");
  const [maxDurationHours, setMaxDurationHours] = useState("");
  const [maxDurationMinutes, setMaxDurationMinutes] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [editTarget, setEditTarget] = useState<MemberRecentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MemberRecentItem | null>(null);
  const [editHours, setEditHours] = useState("");
  const [editMinutes, setEditMinutes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!memberId) return;
    if (!canViewAny && memberId !== loggedInUserId) {
      router.push("/members");
    }
  }, [memberId, canViewAny, loggedInUserId, router]);

  const programWorkoutsQuery = useQuery({
    queryKey: ["program-workouts", programId],
    queryFn: () => fetchProgramWorkouts(token, programId),
    enabled: !!token && !!programId && !!showFilter
  });

  const workoutTypeOptions = useMemo(() => {
    const list = programWorkoutsQuery.data ?? [];
    const visible = list.filter((w) => !w.is_hidden).map((w) => ({ value: w.workout_name, label: w.workout_name }));
    return [{ value: "", label: "Any" }, ...visible];
  }, [programWorkoutsQuery.data]);

  const minDurationNum = useMemo(() => {
    const total =
      (Number(minDurationHours) || 0) * 60 + (Number(minDurationMinutes) || 0);
    const hasInput =
      minDurationHours.trim() !== "" || minDurationMinutes.trim() !== "";
    return hasInput && total > 0 ? total : undefined;
  }, [minDurationHours, minDurationMinutes]);
  const maxDurationNum = useMemo(() => {
    const total =
      (Number(maxDurationHours) || 0) * 60 + (Number(maxDurationMinutes) || 0);
    const hasInput =
      maxDurationHours.trim() !== "" || maxDurationMinutes.trim() !== "";
    return hasInput && total > 0 ? total : undefined;
  }, [maxDurationHours, maxDurationMinutes]);

  const workoutsQuery = useQuery({
    queryKey: [
      "members",
      "workouts",
      programId,
      memberId,
      sortField,
      sortDir,
      startDate,
      endDate,
      workoutType,
      minDurationNum,
      maxDurationNum
    ],
    queryFn: () =>
      fetchMemberRecentWorkouts(token, programId, memberId, {
        limit: 0,
        sortBy: sortField,
        sortDir,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        workoutType: workoutType || undefined,
        minDuration: minDurationNum,
        maxDuration: maxDurationNum
      }),
    enabled: !!token && !!programId && !!memberId
  });

  const deleteMutation = useMutation({
    mutationFn: (item: MemberRecentItem) =>
      deleteWorkoutLog(token, {
        program_id: programId,
        member_id: memberId,
        workout_name: item.workoutType,
        date: item.workoutDate
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["members", "workouts", programId, memberId] });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete workout.");
    }
  });

  const updateMutation = useMutation({
    mutationFn: (duration: number) =>
      updateWorkoutLog(token, {
        program_id: programId,
        workout_name: editTarget?.workoutType ?? "",
        date: editTarget?.workoutDate ?? "",
        duration,
        member_name: memberId === loggedInUserId ? undefined : memberName
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["members", "workouts", programId, memberId] });
      setEditTarget(null);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update workout.");
    }
  });

  const handleExport = () => {
    if (!workoutsQuery.data || workoutsQuery.data.items.length === 0) return;
    const filename = `Workouts_${memberName.replace(/\s+/g, "")}_${startDate || "all"}_to_${endDate || "today"}.csv`;
    let csv = "Workout Type,Date,Duration (min)\n";
    workoutsQuery.data.items.forEach((item) => {
      csv += `${escapeCsv(item.workoutType)},${item.workoutDate},${item.durationMinutes}\n`;
    });
    downloadCsv(filename, csv);
  };

  const hasActiveFilters =
    startDate ||
    endDate ||
    workoutType ||
    minDurationHours.trim() ||
    minDurationMinutes.trim() ||
    maxDurationHours.trim() ||
    maxDurationMinutes.trim();
  const formattedFilters = useMemo(() => {
    const parts: string[] = [];
    if (startDate || endDate) parts.push(`${startDate || "Start"} – ${endDate || "End"}`);
    if (workoutType) parts.push(workoutType);
    if (minDurationNum !== undefined) parts.push(`At least ${formatDuration(minDurationNum)}`);
    if (maxDurationNum !== undefined) parts.push(`At most ${formatDuration(maxDurationNum)}`);
    return parts.length === 0 ? null : parts.join(" · ");
  }, [startDate, endDate, workoutType, minDurationNum, maxDurationNum]);

  const openEdit = (item: MemberRecentItem) => {
    setEditTarget(item);
    setEditHours(String(Math.floor(item.durationMinutes / 60)));
    setEditMinutes(String(item.durationMinutes % 60));
    setErrorMessage(null);
  };

  const submitEdit = () => {
    if (!editTarget) return;
    const durationValue = (Number(editHours) || 0) * 60 + (Number(editMinutes) || 0);
    if (durationValue <= 0) {
      setErrorMessage("Enter a valid duration before saving.");
      return;
    }
    updateMutation.mutate(durationValue);
  };

  return (
    <PageShell maxWidth="4xl">
      <PageHeader
        title="View Workouts"
        subtitle={memberName}
        backHref="/members"
        actions={
          <button
            type="button"
            onClick={handleExport}
            disabled={!workoutsQuery.data || workoutsQuery.data.items.length === 0}
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

      {workoutsQuery.isLoading && <LoadingState message="Loading workouts..." />}

      {workoutsQuery.data && workoutsQuery.data.items.length === 0 && (
        <EmptyState message="No workouts found." />
      )}

      {workoutsQuery.data && workoutsQuery.data.items.length > 0 && (
        <div className="grid gap-3">
          {workoutsQuery.data.items.map((item) => (
            <GlassCard key={item.id} padding="sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold text-rf-text">{item.workoutType}</p>
                  <p className="text-xs text-rf-text-muted">{item.workoutDate}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-rf-text">{formatDuration(item.durationMinutes)}</p>
                </div>
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
              <Select
                label="Workout type"
                value={workoutType}
                options={workoutTypeOptions}
                onChange={setWorkoutType}
                placeholder="Any"
                searchable
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-rf-text">Min duration</label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={minDurationHours}
                  onChange={(event) => setMinDurationHours(event.target.value)}
                  className="input-shell w-20 rounded-2xl px-4 py-3 text-center text-sm font-medium"
                  placeholder="0"
                />
                <span className="text-sm text-rf-text-muted">hr</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minDurationMinutes}
                  onChange={(event) => setMinDurationMinutes(event.target.value)}
                  className="input-shell w-20 rounded-2xl px-4 py-3 text-center text-sm font-medium"
                  placeholder="0"
                />
                <span className="text-sm text-rf-text-muted">min</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-rf-text">Max duration</label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={maxDurationHours}
                  onChange={(event) => setMaxDurationHours(event.target.value)}
                  className="input-shell w-20 rounded-2xl px-4 py-3 text-center text-sm font-medium"
                  placeholder="0"
                />
                <span className="text-sm text-rf-text-muted">hr</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={maxDurationMinutes}
                  onChange={(event) => setMaxDurationMinutes(event.target.value)}
                  className="input-shell w-20 rounded-2xl px-4 py-3 text-center text-sm font-medium"
                  placeholder="0"
                />
                <span className="text-sm text-rf-text-muted">min</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setStartDate("");
                setEndDate("");
                setWorkoutType("");
                setMinDurationHours("");
                setMinDurationMinutes("");
                setMaxDurationHours("");
                setMaxDurationMinutes("");
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
              <h2 className="text-lg font-semibold text-rf-text">Edit Workout Log</h2>
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
                <label className="text-sm font-semibold text-rf-text">Workout</label>
                <input
                  type="text"
                  value={editTarget.workoutType}
                  disabled
                  className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium opacity-60"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-rf-text">Date</label>
                <input
                  type="date"
                  value={editTarget.workoutDate}
                  disabled
                  className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium opacity-60"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-rf-text">Duration</label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={editHours}
                    onChange={(event) => setEditHours(event.target.value)}
                    className="input-shell w-20 rounded-2xl px-4 py-3 text-center text-sm font-medium"
                    placeholder="0"
                  />
                  <span className="text-sm text-rf-text-muted">hr</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={editMinutes}
                    onChange={(event) => setEditMinutes(event.target.value)}
                    className="input-shell w-20 rounded-2xl px-4 py-3 text-center text-sm font-medium"
                    placeholder="0"
                  />
                  <span className="text-sm text-rf-text-muted">min</span>
                </div>
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
        title="Delete workout log?"
        description={deleteTarget ? `Delete the ${deleteTarget.workoutType} log from ${deleteTarget.workoutDate}?` : ""}
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
