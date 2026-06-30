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
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadingState } from "@/components/ui/LoadingState";

export default function LifestyleWorkoutsPage() {
  const { session, program, token, programId } = useAuthGuard();
  const queryClient = useQueryClient();

  const globalRole = session?.user.globalRole ?? "standard";
  const isGlobalAdmin = globalRole === "global_admin";
  const canManage = isGlobalAdmin || (globalRole === "standard" && program?.my_role === "admin");

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<ProgramWorkout | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProgramWorkout | null>(null);
  const [newWorkoutName, setNewWorkoutName] = useState("");
  const [editWorkoutName, setEditWorkoutName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (editTarget) {
      setEditWorkoutName(editTarget.workout_name);
    }
  }, [editTarget]);

  const workoutsQuery = useQuery({
    queryKey: ["lifestyle", "workouts", programId],
    queryFn: () => fetchProgramWorkouts(token, programId),
    enabled: !!token && !!programId
  });

  const refreshWorkouts = async () => {
    await queryClient.invalidateQueries({ queryKey: ["lifestyle", "workouts", programId] });
  };

  const toggleGlobalMutation = useMutation({
    mutationFn: (workout: ProgramWorkout) =>
      toggleGlobalWorkoutVisibility(token, {
        program_id: programId,
        library_workout_id: workout.library_workout_id ?? ""
      }),
    onSuccess: refreshWorkouts,
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update workout.");
    }
  });

  const toggleCustomMutation = useMutation({
    mutationFn: (workout: ProgramWorkout) => toggleCustomWorkoutVisibility(token, workout.id),
    onSuccess: refreshWorkouts,
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update workout.");
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
      setErrorMessage(error instanceof Error ? error.message : "Unable to add workout.");
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
      setErrorMessage(error instanceof Error ? error.message : "Unable to update workout.");
    }
  });

  const deleteCustomMutation = useMutation({
    mutationFn: (id: string) => deleteCustomProgramWorkout(token, id),
    onSuccess: refreshWorkouts,
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete workout.");
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
                  setErrorMessage(null);
                  setShowAdd(true);
                }}
                className="rounded-full bg-rf-accent px-4 py-2 text-xs font-semibold text-black shadow"
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

        {errorMessage && <p className="text-sm font-semibold text-rf-danger">{errorMessage}</p>}

        {workoutsQuery.isLoading && <LoadingState message="Loading workout types..." />}

        {workoutsQuery.data && (
          <div className="space-y-6">
            <WorkoutSection
              title={`Available (${visibleWorkouts.length})`}
              workouts={visibleWorkouts}
              canManage={canManage}
              onEdit={(workout) => {
                setErrorMessage(null);
                setEditTarget(workout);
              }}
              onToggle={(workout) =>
                workout.source === "global"
                  ? toggleGlobalMutation.mutate(workout)
                  : toggleCustomMutation.mutate(workout)
              }
              onDelete={(workout) => setDeleteTarget(workout)}
            />

            {canManage && hiddenWorkouts.length > 0 && (
              <WorkoutSection
                title={`Hidden (${hiddenWorkouts.length})`}
                workouts={hiddenWorkouts}
                canManage={canManage}
                onEdit={(workout) => {
                  setErrorMessage(null);
                  setEditTarget(workout);
                }}
                onToggle={(workout) =>
                  workout.source === "global"
                    ? toggleGlobalMutation.mutate(workout)
                    : toggleCustomMutation.mutate(workout)
                }
                onDelete={(workout) => setDeleteTarget(workout)}
              />
            )}
          </div>
        )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)}>
        <div className="modal-surface w-full max-w-md rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-rf-text">New Workout</h2>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-full bg-rf-surface-muted px-3 py-1 text-xs font-semibold text-rf-text-muted"
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
              />
            </div>
            <button
              type="button"
              onClick={() => addCustomMutation.mutate(newWorkoutName.trim())}
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
                className="rounded-full bg-rf-surface-muted px-3 py-1 text-xs font-semibold text-rf-text-muted"
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
                />
              </div>
              <button
                type="button"
                onClick={() => editCustomMutation.mutate({ id: editTarget.id, name: editWorkoutName.trim() })}
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
        onConfirm={() => {
          if (deleteTarget) deleteCustomMutation.mutate(deleteTarget.id);
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </PageShell>
  );
}

function WorkoutSection({
  title,
  workouts,
  canManage,
  onEdit,
  onToggle,
  onDelete
}: {
  title: string;
  workouts: ProgramWorkout[];
  canManage: boolean;
  onEdit: (workout: ProgramWorkout) => void;
  onToggle: (workout: ProgramWorkout) => void;
  onDelete: (workout: ProgramWorkout) => void;
}) {
  return (
    <GlassCard padding="md">
      <h2 className="text-sm font-semibold text-rf-text-muted">{title}</h2>
      {workouts.length === 0 ? (
        <p className="mt-4 text-sm text-rf-text-muted">No workouts to show.</p>
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
                          className="pill-button rounded-full px-3 py-1 text-xs font-semibold"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onToggle(workout)}
                        className="pill-button rounded-full px-3 py-1 text-xs font-semibold"
                      >
                        {workout.is_hidden ? "Show" : "Hide"}
                      </button>
                      {isCustom && (
                        <button
                          type="button"
                          onClick={() => onDelete(workout)}
                          className="danger-pill rounded-full px-3 py-1 text-xs font-semibold"
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
