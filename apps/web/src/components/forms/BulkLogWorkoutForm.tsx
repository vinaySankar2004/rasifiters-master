"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchProgramMembers } from "@/lib/api/programs";
import { fetchProgramWorkouts } from "@/lib/api/program-workouts";
import type { BulkRowError, BulkWorkoutEntry } from "@/lib/api/logs";
import { Select } from "@/components/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const MAX_ROWS = 200;

type Row = {
  uid: number;
  memberId: string;
  workoutName: string;
  date: string;
  hours: string;
  minutes: string;
};

type FieldKey = "member" | "workout" | "date" | "duration";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function rowHours(r: Row) {
  return Number(r.hours) || 0;
}

function rowMinutes(r: Row) {
  return Number(r.minutes) || 0;
}

function rowDuration(r: Row) {
  return rowHours(r) * 60 + rowMinutes(r);
}

function isEmptyRow(r: Row) {
  return !r.memberId && !r.workoutName && !r.hours && !r.minutes;
}

function isValidRow(r: Row) {
  const h = rowHours(r);
  const m = rowMinutes(r);
  return (
    r.memberId.trim().length > 0 &&
    r.workoutName.trim().length > 0 &&
    r.date.trim().length > 0 &&
    h >= 0 &&
    m >= 0 &&
    m < 60 &&
    h * 60 + m > 0
  );
}

/** Live, field-level validation messages for a non-empty row. Empty rows are ignored. */
function clientRowErrors(r: Row): Partial<Record<FieldKey, string>> {
  if (isEmptyRow(r)) return {};
  const errors: Partial<Record<FieldKey, string>> = {};
  if (!r.memberId) errors.member = "Select a member";
  if (!r.workoutName) errors.workout = "Select a workout";
  if (!r.date) errors.date = "Pick a date";
  const h = rowHours(r);
  const m = rowMinutes(r);
  if (h < 0 || m < 0) errors.duration = "Use positive values";
  else if (m >= 60) errors.duration = "Minutes must be 0–59";
  else if (h * 60 + m <= 0) errors.duration = "Add a duration";
  return errors;
}

function mapBackendField(field: string): FieldKey | null {
  switch (field) {
    case "member_id":
      return "member";
    case "workout_name":
      return "workout";
    case "date":
      return "date";
    case "duration":
      return "duration";
    default:
      return null;
  }
}

export function BulkLogWorkoutForm({
  programId,
  token,
  onClose,
  onSubmit,
  isSaving,
  errorMessage,
  rowErrors,
  variant = "modal"
}: {
  programId: string;
  token: string;
  onClose: () => void;
  onSubmit: (entries: BulkWorkoutEntry[]) => void;
  isSaving: boolean;
  errorMessage: string | null;
  rowErrors?: BulkRowError[] | null;
  variant?: "modal" | "page";
}) {
  const [members, setMembers] = useState<{ id: string; member_name: string }[]>([]);
  const [workouts, setWorkouts] = useState<{ workout_name: string }[]>([]);
  const [lookupsLoaded, setLookupsLoaded] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [submittedOrder, setSubmittedOrder] = useState<number[]>([]);
  const nextUid = useRef(0);

  useEffect(() => {
    let active = true;
    const loadLookups = async () => {
      if (!token || !programId) return;
      try {
        const [membersData, workoutsData] = await Promise.all([
          fetchProgramMembers(token, programId),
          fetchProgramWorkouts(token, programId)
        ]);
        if (!active) return;
        setMembers(membersData);
        setWorkouts(workoutsData.filter((workout) => !workout.is_hidden));
      } catch {
        // Leave lists empty; the empty-state hint covers this.
      } finally {
        if (active) setLookupsLoaded(true);
      }
    };
    loadLookups();
    return () => {
      active = false;
    };
  }, [token, programId]);

  const memberOptions = useMemo(
    () => members.map((m) => ({ value: m.id, label: m.member_name })),
    [members]
  );
  const workoutOptions = useMemo(
    () => workouts.map((w) => ({ value: w.workout_name, label: w.workout_name })),
    [workouts]
  );

  const addRows = (count: number) => {
    setRows((prev) => {
      if (prev.length >= MAX_ROWS) return prev;
      const baseDate = prev[prev.length - 1]?.date || todayStr();
      const additions: Row[] = [];
      const room = Math.min(count, MAX_ROWS - prev.length);
      for (let i = 0; i < room; i += 1) {
        additions.push({ uid: nextUid.current++, memberId: "", workoutName: "", date: baseDate, hours: "", minutes: "" });
      }
      return [...prev, ...additions];
    });
  };

  const updateRow = (uid: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  };

  const removeRow = (uid: number) => {
    setRows((prev) => prev.filter((r) => r.uid !== uid));
  };

  // Map backend per-row errors (indexed by submit order) back onto current rows by uid.
  const backendByUid = useMemo(() => {
    const map = new Map<number, Partial<Record<FieldKey, string>>>();
    if (!rowErrors) return map;
    for (const err of rowErrors) {
      const uid = submittedOrder[err.index];
      if (uid === undefined) continue;
      const field = mapBackendField(err.field);
      if (!field) continue;
      const current = map.get(uid) ?? {};
      current[field] = err.message;
      map.set(uid, current);
    }
    return map;
  }, [rowErrors, submittedOrder]);

  // Live client errors win over (possibly stale) backend errors on the same field.
  const errorsForRow = (r: Row): Partial<Record<FieldKey, string>> => ({
    ...(backendByUid.get(r.uid) ?? {}),
    ...clientRowErrors(r)
  });

  const nonEmptyRows = rows.filter((r) => !isEmptyRow(r));
  const validRows = nonEmptyRows.filter(isValidRow);
  const invalidCount = nonEmptyRows.length - validRows.length;
  const canSubmit = validRows.length > 0 && invalidCount === 0 && !isSaving;

  const distinctMembers = useMemo(
    () => new Set(validRows.map((r) => r.memberId)).size,
    [validRows]
  );
  const totalMinutes = useMemo(
    () => validRows.reduce((sum, r) => sum + rowDuration(r), 0),
    [validRows]
  );

  const handleSubmit = () => {
    const included = rows.filter((r) => !isEmptyRow(r) && isValidRow(r));
    if (included.length === 0) return;
    setSubmittedOrder(included.map((r) => r.uid));
    onSubmit(
      included.map((r) => ({
        member_id: r.memberId,
        workout_name: r.workoutName,
        date: r.date,
        duration: rowDuration(r)
      }))
    );
  };

  const noLookups = lookupsLoaded && (memberOptions.length === 0 || workoutOptions.length === 0);
  const atMax = rows.length >= MAX_ROWS;

  const content = (
    <>
      {noLookups && (
        <p className="rounded-2xl bg-rf-surface-muted px-4 py-3 text-sm text-rf-text-muted">
          {memberOptions.length === 0
            ? "No active members in this program yet."
            : "No workout types available for this program yet."}
        </p>
      )}

      {/* Desktop: table */}
      <div className="hidden md:block">
        {rows.length === 0 ? (
          <EmptyState onAdd={() => addRows(1)} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-rf-text-muted">
                  <th className="px-2 pb-2 font-semibold">Member</th>
                  <th className="px-2 pb-2 font-semibold">Workout type</th>
                  <th className="px-2 pb-2 font-semibold">Date</th>
                  <th className="px-2 pb-2 font-semibold">Duration</th>
                  <th className="px-2 pb-2">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const errs = errorsForRow(r);
                  return (
                    <tr key={r.uid} className="align-top">
                      <td className="min-w-[150px] px-2 py-1">
                        <Select
                          value={r.memberId}
                          options={memberOptions}
                          onChange={(v) => updateRow(r.uid, { memberId: v })}
                          placeholder="Member"
                          searchable
                        />
                        <FieldError message={errs.member} />
                      </td>
                      <td className="min-w-[150px] px-2 py-1">
                        <Select
                          value={r.workoutName}
                          options={workoutOptions}
                          onChange={(v) => updateRow(r.uid, { workoutName: v })}
                          placeholder="Workout"
                          searchable
                        />
                        <FieldError message={errs.workout} />
                      </td>
                      <td className="min-w-[150px] px-2 py-1">
                        <Input
                          type="date"
                          wrapperClassName="mt-2"
                          value={r.date}
                          onChange={(e) => updateRow(r.uid, { date: e.target.value })}
                        />
                        <FieldError message={errs.date} />
                      </td>
                      <td className="px-2 py-1">
                        <div className="mt-2">
                          <DurationInputs
                            hours={r.hours}
                            minutes={r.minutes}
                            onHours={(v) => updateRow(r.uid, { hours: v })}
                            onMinutes={(v) => updateRow(r.uid, { minutes: v })}
                          />
                          <FieldError message={errs.duration} />
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <button
                          type="button"
                          onClick={() => removeRow(r.uid)}
                          aria-label="Remove row"
                          className="mt-2 flex h-9 w-9 items-center justify-center rounded-full bg-rf-surface-muted text-rf-text-muted transition hover:bg-rf-surface hover:text-rf-danger"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mobile: stacked cards */}
      <div className="space-y-4 md:hidden">
        {rows.length === 0 ? (
          <EmptyState onAdd={() => addRows(1)} />
        ) : (
          rows.map((r, index) => {
            const errs = errorsForRow(r);
            return (
              <div key={r.uid} className="space-y-3 rounded-2xl border border-rf-border bg-rf-surface p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-rf-text">Entry {index + 1}</p>
                  <button
                    type="button"
                    onClick={() => removeRow(r.uid)}
                    className="rounded-full bg-rf-surface-muted px-3 py-1 text-xs font-semibold text-rf-text-muted transition hover:bg-rf-surface hover:text-rf-danger"
                  >
                    Remove
                  </button>
                </div>
                <div>
                  <Select
                    label="Member"
                    value={r.memberId}
                    options={memberOptions}
                    onChange={(v) => updateRow(r.uid, { memberId: v })}
                    placeholder="Select member"
                    searchable
                  />
                  <FieldError message={errs.member} />
                </div>
                <div>
                  <Select
                    label="Workout type"
                    value={r.workoutName}
                    options={workoutOptions}
                    onChange={(v) => updateRow(r.uid, { workoutName: v })}
                    placeholder="Select workout"
                    searchable
                  />
                  <FieldError message={errs.workout} />
                </div>
                <div>
                  <Input
                    type="date"
                    label="Date"
                    value={r.date}
                    onChange={(e) => updateRow(r.uid, { date: e.target.value })}
                  />
                  <FieldError message={errs.date} />
                </div>
                <div>
                  <label className="text-sm font-semibold text-rf-text">Duration</label>
                  <div className="mt-2">
                    <DurationInputs
                      hours={r.hours}
                      minutes={r.minutes}
                      onHours={(v) => updateRow(r.uid, { hours: v })}
                      onMinutes={(v) => updateRow(r.uid, { minutes: v })}
                    />
                    <FieldError message={errs.duration} />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add-row controls */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => addRows(1)} disabled={atMax}>
          + Add row
        </Button>
        <Button variant="ghost" size="sm" onClick={() => addRows(5)} disabled={atMax}>
          + Add 5 rows
        </Button>
        {atMax && <span className="self-center text-xs text-rf-text-muted">Max {MAX_ROWS} rows</span>}
      </div>

      {invalidCount > 0 && (
        <p className="mt-3 text-sm font-semibold text-rf-danger">
          {invalidCount} {invalidCount === 1 ? "row needs" : "rows need"} attention before saving.
        </p>
      )}
      {errorMessage && <p className="mt-3 text-sm font-semibold text-rf-danger">{errorMessage}</p>}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-rf-text-muted">
          {validRows.length} {validRows.length === 1 ? "row" : "rows"} • {distinctMembers}{" "}
          {distinctMembers === 1 ? "member" : "members"} • {totalMinutes} min total
        </p>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="w-full rounded-2xl bg-rf-accent px-4 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {isSaving ? "Saving…" : "Save all"}
        </button>
      </div>
    </>
  );

  if (variant === "page") {
    return <div className="space-y-1">{content}</div>;
  }

  return (
    <div className="modal-surface w-full max-w-3xl rounded-3xl p-6 md:max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-rf-text">Bulk log workouts</h2>
          <p className="mt-1 text-sm text-rf-text-muted">
            Add a row per session — member, workout, date, and duration — then save them all at once.
          </p>
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

      <div className="mt-4">{content}</div>
    </div>
  );
}

function DurationInputs({
  hours,
  minutes,
  onHours,
  onMinutes
}: {
  hours: string;
  minutes: string;
  onHours: (value: string) => void;
  onMinutes: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        value={hours}
        onChange={(event) => onHours(event.target.value)}
        className="input-shell w-16 rounded-2xl px-3 py-3 text-center text-sm font-medium"
        placeholder="0"
        aria-label="Hours"
      />
      <span className="text-sm text-rf-text-muted">hr</span>
      <input
        type="number"
        min={0}
        max={59}
        value={minutes}
        onChange={(event) => onMinutes(event.target.value)}
        className="input-shell w-16 rounded-2xl px-3 py-3 text-center text-sm font-medium"
        placeholder="0"
        aria-label="Minutes"
      />
      <span className="text-sm text-rf-text-muted">min</span>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-semibold text-rf-danger">{message}</p>;
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-rf-border px-4 py-8 text-center">
      <p className="text-sm text-rf-text-muted">No rows yet.</p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 rounded-full bg-rf-accent px-5 py-2 text-sm font-semibold text-black"
      >
        + Add first row
      </button>
    </div>
  );
}
