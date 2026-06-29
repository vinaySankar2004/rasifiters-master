"use client";

import { useEffect, useState } from "react";
import { fetchProgramMembers } from "@/lib/api/programs";
import { fetchProgramWorkouts } from "@/lib/api/program-workouts";
import { Select } from "@/components/Select";
import { Input } from "@/components/ui/Input";

export function LogWorkoutForm({
  canSelectAnyMember,
  programId,
  token,
  userId,
  onClose,
  onSubmit,
  isSaving,
  errorMessage,
  variant = "modal"
}: {
  canSelectAnyMember: boolean;
  programId: string;
  token: string;
  userId?: string;
  onClose: () => void;
  onSubmit: (payload: {
    member_id?: string;
    member_name?: string;
    workout_name: string;
    date: string;
    duration: number;
  }) => void;
  isSaving: boolean;
  errorMessage: string | null;
  variant?: "modal" | "page";
}) {
  const [members, setMembers] = useState<{ id: string; member_name: string }[]>([]);
  const [workouts, setWorkouts] = useState<{ workout_name: string }[]>([]);
  const [memberId, setMemberId] = useState("");
  const [workoutName, setWorkoutName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [durationHours, setDurationHours] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");

  useEffect(() => {
    const loadLookups = async () => {
      if (!token || !programId) return;
      const membersData = await fetchProgramMembers(token, programId);
      const workoutsData = await fetchProgramWorkouts(token, programId);
      setMembers(membersData);
      setWorkouts(workoutsData.filter((workout) => !workout.is_hidden));
      if (!canSelectAnyMember && userId) {
        setMemberId(userId);
      }
    };
    loadLookups();
  }, [token, programId, canSelectAnyMember, userId]);

  const computedDuration = (Number(durationHours) || 0) * 60 + (Number(durationMinutes) || 0);
  const canSubmit =
    workoutName.trim().length > 0 &&
    date.trim().length > 0 &&
    computedDuration > 0 &&
    (!canSelectAnyMember || memberId);

  const fields = (
    <>
      <div className={variant === "modal" ? "mt-4 space-y-4" : "space-y-4"}>
        {canSelectAnyMember ? (
          <Select
            label="Member"
            value={memberId}
            options={members.map((m) => ({ value: m.id, label: m.member_name }))}
            onChange={setMemberId}
            placeholder="Select member"
            searchable
          />
        ) : (
          <div>
            <p className="text-sm font-semibold text-rf-text">Member</p>
            <div className="mt-2 rounded-2xl bg-rf-surface-muted px-4 py-3 text-sm text-rf-text-muted">You</div>
          </div>
        )}

        <Select
          label="Workout type"
          value={workoutName}
          options={workouts.map((w) => ({ value: w.workout_name, label: w.workout_name }))}
          onChange={setWorkoutName}
          placeholder="Select workout"
          searchable
        />

        <Input
          type="date"
          label="Date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <div>
          <label className="text-sm font-semibold text-rf-text">Duration</label>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={durationHours}
              onChange={(event) => setDurationHours(event.target.value)}
              className="input-shell w-20 rounded-2xl px-4 py-3 text-center text-sm font-medium"
              placeholder="0"
            />
            <span className="text-sm text-rf-text-muted">hr</span>
            <input
              type="number"
              min={0}
              max={59}
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
              className="input-shell w-20 rounded-2xl px-4 py-3 text-center text-sm font-medium"
              placeholder="0"
            />
            <span className="text-sm text-rf-text-muted">min</span>
          </div>
        </div>
      </div>

      {errorMessage && <p className="mt-3 text-sm font-semibold text-rf-danger">{errorMessage}</p>}

      <button
        type="button"
        disabled={!canSubmit || isSaving}
        onClick={() =>
          onSubmit({
            member_id: canSelectAnyMember ? memberId || undefined : userId,
            workout_name: workoutName,
            date,
            duration: computedDuration
          })
        }
        className="mt-5 w-full rounded-2xl bg-rf-accent px-4 py-3 text-sm font-semibold text-black"
      >
        {isSaving ? "Saving…" : "Save workout"}
      </button>
    </>
  );

  if (variant === "page") {
    return <div className="space-y-4">{fields}</div>;
  }

  return (
    <div className="modal-surface w-full max-w-lg rounded-3xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-rf-text">Log workout</h2>
          <p className="mt-1 text-sm text-rf-text-muted">Pick member, workout, date, and duration.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-transparent bg-rf-surface-muted px-3 py-1 text-xs font-semibold text-rf-text-muted transition hover:bg-rf-surface"
          aria-label="Close form"
        >
          Close
        </button>
      </div>

      {fields}
    </div>
  );
}
