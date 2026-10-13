"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addCustomProgramWorkout,
  deleteCustomProgramWorkout,
  editCustomProgramWorkout,
  fetchProgramWorkouts,
  toggleCustomWorkoutVisibility,
  toggleGlobalWorkoutVisibility,
  type ProgramWorkout
} from "@/lib/api/program-workouts";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { toAppError, type AppError } from "@/lib/kit/app-error";
import { useOnlineStatus } from "@/lib/kit/use-online-status";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { QueryView } from "@/components/kit/QueryView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";

export default function LifestyleWorkoutsPage() {
  const { session, program, token, programId } = useAuthGuard();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();

  const globalRole = session?.user.globalRole ?? "standard";
  const isGlobalAdmin = globalRole === "global_admin";
  const canManage = isGlobalAdmin || (globalRole === "standard" && program?.my_role === "admin");

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<ProgramWorkout | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProgramWorkout | null>(null);
  const [newWorkoutName, setNewWorkoutName] = useState("");
  const [editWorkoutName, setEditWorkoutName] = useState("");
  // polish #9: add / edit / delete errors show inside their own pop-up; a Hide/Show failure shows in the floating
  // error banner (visible wherever the list is scrolled, as the programs card actions).
  const [toggleError, setToggleError] = useState<AppError | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (editTarget) {
      setEditWorkoutName(editTarget.workout_name);
    }
  }, [editTarget]);

  const workoutsKey = ["lifestyle", "workouts", programId];
  const workoutsQuery = useQuery({
    queryKey: workoutsKey,
    queryFn: () => fetchProgramWorkouts(token, programId),
    enabled: !!token && !!programId
  });

  const refreshWorkouts = async () => {
    await queryClient.invalidateQueries({ queryKey: workoutsKey });
  };

  const toggleGlobalMutation = useMutation({
    mutationFn: (workout: ProgramWorkout) =>
      toggleGlobalWorkoutVisibility(token, {
        program_id: programId,
        library_workout_id: workout.library_workout_id ?? ""
      }),
    onMutate: () => setToggleError(null),
    onSuccess: refreshWorkouts,
    onError: (error) => {
      setToggleError(toAppError(error));
    }
  });

  const toggleCustomMutation = useMutation({
    mutationFn: (workout: ProgramWorkout) => toggleCustomWorkoutVisibility(token, workout.id),
    onMutate: () => setToggleError(null),
    onSuccess: refreshWorkouts,
    onError: (error) => {
      setToggleError(toAppError(error));
    }
  });

  const addCustomMutation = useMutation({
    mutationFn: (name: string) => addCustomProgramWorkout(token, programId, name),
    onSuccess: async () => {
      await refreshWorkouts();
      setShowAdd(false);
      setNewWorkoutName("");
    },
    onError: (error) => {
      setAddError(toAppError(error).message);
    }
  });

  const editCustomMutation = useMutation({
    mutationFn: (payload: { id: string; name: string }) => editCustomProgramWorkout(token, payload.id, payload.name),
    onSuccess: async () => {
      await refreshWorkouts();
      setEditTarget(null);
      setEditWorkoutName("");
    },
    onError: (error) => {
      setEditError(toAppError(error).message);
    }
  });

  const deleteCustomMutation = useMutation({
    mutationFn: (id: string) => deleteCustomProgramWorkout(token, id),
    onSuccess: () => {
      setDeleteTarget(null);
      void refreshWorkouts();
    },
    onError: (error) => {
      setDeleteError(toAppError(error).message);
    }
  });

  const filtered = useMemo(() => {
    const data = workoutsQuery.data ?? [];
    if (!search.trim()) return data;
    const query = search.trim().toLowerCase();
    return data.filter((workout) => workout.workout_name.toLowerCase().includes(query));
  }, [workoutsQuery.data, search]);

  const visibleWorkouts = filtered.filter((workout) => !workout.is_hidden);
  const hiddenWorkouts = filtered.filter((workout) => workout.is_hidden);

  return (
    <PageShell maxWidth="4xl">
        <PageHeader
          title="Workout Types"
          subtitle={program?.name ?? "Program"}
          backHref="/lifestyle"
          actions={
            canManage ? (
              <button
                type="button"
                onClick={() => {
                  setToggleError(null);
                  setAddError(null);
                  setShowAdd(true);
                }}
                className="inline-flex min-h-[44px] items-center rounded-full bg-rf-accent px-4 text-sm font-semibold text-black shadow"
              >
                + Add workout
              </button>
            ) : undefined
          }
        />

        <GlassCard padding="sm">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search workout types"
            className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
          />
        </GlassCard>

        <QueryView query={workoutsQuery} queryKey={workoutsKey} loadingMessage="Loading workout types...">
        {workoutsQuery.data && (
          <div className="space-y-6">
            <WorkoutSection
              title={`Available (${visibleWorkouts.length})`}
              workouts={visibleWorkouts}
              searchActive={search.trim().length > 0}
              canManage={canManage}
              onEdit={(workout) => {
                setToggleError(null);
                setEditError(null);
                setEditTarget(workout);
              }}
              onToggle={(workout) =>
                workout.source === "global"
                  ? toggleGlobalMutation.mutate(workout)
                  : toggleCustomMutation.mutate(workout)
              }
              onDelete={(workout) => {
                setDeleteError(null);
                setDeleteTarget(workout);
              }}
            />

            {canManage && hiddenWorkouts.length > 0 && (
              <WorkoutSection
                title={`Hidden (${hiddenWorkouts.length})`}
                workouts={hiddenWorkouts}
                searchActive={search.trim().length > 0}
                canManage={canManage}
                onEdit={(workout) => {
                  setToggleError(null);
                  setEditError(null);
                  setEditTarget(workout);
                }}
                onToggle={(workout) =>
                  workout.source === "global"
                    ? toggleGlobalMutation.mutate(workout)
                    : toggleCustomMutation.mutate(workout)
                }
                onDelete={(workout) => {
                  setDeleteError(null);
                  setDeleteTarget(workout);
                }}
              />
            )}
          </div>
        )}
        </QueryView>

      <Modal open={showAdd} onClose={() => setShowAdd(false)}>
        <div className="modal-surface w-full max-w-md rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-rf-text">New Workout</h2>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="inline-flex min-h-[44px] items-center rounded-full bg-rf-surface-muted px-4 text-sm font-semibold text-rf-text-muted"
            >
              Close
            </button>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <label className="text-sm font-semibold text-rf-text">Workout name</label>
              <input
                value={newWorkoutName}
                onChange={(event) => setNewWorkoutName(event.target.value)}
                className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
                placeholder="New workout name"
                autoCapitalize="words"
              />
            </div>
            {addError && <p role="alert" className="text-sm font-semibold text-rf-danger">{addError}</p>}
            <button
              type="button"
              onClick={() => {
                setAddError(null);
                addCustomMutation.mutate(newWorkoutName.trim());
              }}
              disabled={newWorkoutName.trim().length === 0 || addCustomMutation.isPending}
              className="w-full rounded-2xl bg-rf-accent px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
            >
              Add workout
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)}>
        {editTarget && (
          <div className="modal-surface w-full max-w-md rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-rf-text">Edit Workout</h2>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="inline-flex min-h-[44px] items-center rounded-full bg-rf-surface-muted px-4 text-sm font-semibold text-rf-text-muted"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-semibold text-rf-text">Workout name</label>
                <input
                  value={editWorkoutName}
                  onChange={(event) => setEditWorkoutName(event.target.value)}
                  className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
                  autoCapitalize="words"
                />
              </div>
              {editError && <p role="alert" className="text-sm font-semibold text-rf-danger">{editError}</p>}
              <button
                type="button"
                onClick={() => {
                  setEditError(null);
                  editCustomMutation.mutate({ id: editTarget.id, name: editWorkoutName.trim() });
                }}
                disabled={editWorkoutName.trim().length === 0 || editCustomMutation.isPending}
                className="w-full rounded-2xl bg-rf-accent px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
              >
                Save changes
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete workout"
        description={deleteTarget ? `Delete ${deleteTarget.workout_name}?` : ""}
        confirmLabel="Delete"
        danger
        loading={deleteCustomMutation.isPending}
        loadingLabel="Deleting…"
        errorMessage={deleteError}
        closeOnConfirm={false}
        onConfirm={() => {
          setDeleteError(null);
          if (deleteTarget) deleteCustomMutation.mutate(deleteTarget.id);
        }}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
      />

      {/* Hidden while the global offline banner shows (A6); the spacer keeps the list's end above the banner. */}
      {toggleError && online && (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="error" error={toggleError} onDismiss={() => setToggleError(null)} />
        </>
      )}
    </PageShell>
  );
}

function WorkoutSection({
  title,
  workouts,
  searchActive,
  canManage,
  onEdit,
  onToggle,
  onDelete
}: {
  title: string;
  workouts: ProgramWorkout[];
  /** The list is filtered by a search (picks the honest empty line). */
  searchActive: boolean;
  canManage: boolean;
  onEdit: (workout: ProgramWorkout) => void;
  onToggle: (workout: ProgramWorkout) => void;
  onDelete: (workout: ProgramWorkout) => void;
}) {
  return (
    <GlassCard padding="md">
      <h2 className="text-sm font-semibold text-rf-text-muted">{title}</h2>
      {workouts.length === 0 ? (
        <p className="mt-4 text-sm text-rf-text-muted">
          {searchActive ? "No workout types match your search." : "No workout types yet."}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {workouts.map((workout) => {
            const isCustom = workout.source === "custom";
            return (
              <div
                key={workout.id}
                className={`rounded-2xl border border-rf-border bg-rf-surface-muted px-4 py-3 shadow-sm ${
                  workout.is_hidden ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-rf-text">{workout.workout_name}</p>
                    <p className="text-xs text-rf-text-muted">
                      {isCustom ? "Custom" : "Standard"}
                      {workout.is_hidden ? " · Hidden" : ""}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap items-center gap-2">
                      {isCustom && !workout.is_hidden && (
                        <button
                          type="button"
                          onClick={() => onEdit(workout)}
                          className="pill-button inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onToggle(workout)}
                        className="pill-button inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold"
                      >
                        {workout.is_hidden ? "Show" : "Hide"}
                      </button>
                      {isCustom && (
                        <button
                          type="button"
                          onClick={() => onDelete(workout)}
                          className="danger-pill inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
