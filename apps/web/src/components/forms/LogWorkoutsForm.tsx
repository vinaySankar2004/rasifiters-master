"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { fetchProgramMembers, fetchPrograms, type Program } from "@/lib/api/programs";
import { fetchProgramWorkouts } from "@/lib/api/program-workouts";
import type { BulkRowError, BulkWorkoutEntry } from "@/lib/api/logs";
import { Select } from "@/components/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { IconLock } from "@/components/icons";

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

/** A row counts as empty (and is skipped on submit) when none of its own fields are filled.
 *  When the member column is hidden (`ignoreMember`), the pre-seeded self member_id is not
 *  considered a "filled" field, so a fresh member row still reads as empty until they type. */
function isEmptyRow(r: Row, ignoreMember: boolean) {
  const memberEmpty = ignoreMember || !r.memberId;
  return memberEmpty && !r.workoutName && !r.hours && !r.minutes;
}

function isValidRow(r: Row, ignoreMember: boolean) {
  const h = rowHours(r);
  const m = rowMinutes(r);
  return (
    (ignoreMember || r.memberId.trim().length > 0) &&
    r.workoutName.trim().length > 0 &&
    r.date.trim().length > 0 &&
    h >= 0 &&
    m >= 0 &&
    m < 60 &&
    h * 60 + m > 0
  );
}

/** Live, field-level validation messages for a non-empty row. Empty rows are ignored. */
function clientRowErrors(r: Row, ignoreMember: boolean): Partial<Record<FieldKey, string>> {
  if (isEmptyRow(r, ignoreMember)) return {};
  const errors: Partial<Record<FieldKey, string>> = {};
  if (!ignoreMember && !r.memberId) errors.member = "Select a member";
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

export function LogWorkoutsForm({
  programId,
  token,
  canSelectAnyMember,
  selfMemberId,
  isGlobalAdmin,
  onClose,
  onSubmit,
  isSaving,
  errorMessage,
  rowErrors,
  variant = "modal"
}: {
  programId: string;
  token: string;
  /** Admin/logger/global-admin → per-row member picker. Plain member → member column hidden, self only. */
  canSelectAnyMember: boolean;
  /** The logged-in member's id — seeded into every row when the member column is hidden. */
  selfMemberId?: string;
  isGlobalAdmin: boolean;
  onClose: () => void;
  onSubmit: (entries: BulkWorkoutEntry[], programIds: string[]) => void;
  isSaving: boolean;
  errorMessage: string | null;
  rowErrors?: BulkRowError[] | null;
  variant?: "modal" | "page";
}) {
  const [members, setMembers] = useState<{ id: string; member_name: string }[]>([]);
  const [workouts, setWorkouts] = useState<{ workout_name: string }[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgramIds, setSelectedProgramIds] = useState<Set<string>>(new Set([programId]));
  const [lookupsLoaded, setLookupsLoaded] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [submittedOrder, setSubmittedOrder] = useState<number[]>([]);
  const nextUid = useRef(0);
  const seededRef = useRef(false);

  // DC-3: logging for others requires admin/logger (or global admin) in EVERY selected program.
  const privileged = (p: Program) => isGlobalAdmin || p.my_role === "admin" || p.my_role === "logger";
  const memberLocked = [...selectedProgramIds].some((id) => {
    const p = programs.find((x) => x.id === id);
    return p ? !privileged(p) : false;
  });
  const effectiveCanSelectAny = canSelectAnyMember && !memberLocked;
  const ignoreMember = !effectiveCanSelectAny;
  // A plain member logs only for themselves, so every row is seeded from selfMemberId. If that id is missing
  // (a stale/unhealed session), submitting would send member_id:"" and the backend rejects with a confusing
  // "You can only log workouts for yourself." Block the save and tell the user how to recover instead.
  const identityMissing = ignoreMember && !(selfMemberId && selfMemberId.trim());

  useEffect(() => {
    let active = true;
    const loadLookups = async () => {
      if (!token || !programId) return;
      try {
        const [membersData, workoutsData, programsData] = await Promise.all([
          fetchProgramMembers(token, programId),
          fetchProgramWorkouts(token, programId),
          fetchPrograms(token)
        ]);
        if (!active) return;
        setMembers(membersData);
        setWorkouts(workoutsData.filter((workout) => !workout.is_hidden));
        setPrograms(programsData);
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

  // When a non-privileged program joins the selection, every row falls back to self.
  useEffect(() => {
    if (!memberLocked) return;
    setRows((prev) => prev.map((r) => ({ ...r, memberId: selfMemberId ?? "" })));
  }, [memberLocked, selfMemberId]);

  const toggleProgram = (id: string) => {
    setSelectedProgramIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      const seedMemberId = ignoreMember ? selfMemberId ?? "" : "";
      const additions: Row[] = [];
      const room = Math.min(count, MAX_ROWS - prev.length);
      for (let i = 0; i < room; i += 1) {
        additions.push({
          uid: nextUid.current++,
          memberId: seedMemberId,
          workoutName: "",
          date: baseDate,
          hours: "",
          minutes: ""
        });
      }
      return [...prev, ...additions];
    });
  };

  // Start with one ready-to-fill row so the form is usable immediately (both roles).
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    addRows(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Row-level backend errors (e.g. duplicate collisions) that aren't tied to a single field.
  const backendRowLevelByUid = useMemo(() => {
    const map = new Map<number, string>();
    if (!rowErrors) return map;
    for (const err of rowErrors) {
      if (mapBackendField(err.field)) continue; // field-scoped errors handled above
      const uid = submittedOrder[err.index];
      if (uid === undefined) continue;
      map.set(uid, err.message);
    }
    return map;
  }, [rowErrors, submittedOrder]);

  // Live client errors win over (possibly stale) backend errors on the same field.
  const errorsForRow = (r: Row): Partial<Record<FieldKey, string>> => ({
    ...(backendByUid.get(r.uid) ?? {}),
    ...clientRowErrors(r, ignoreMember)
  });

  const nonEmptyRows = rows.filter((r) => !isEmptyRow(r, ignoreMember));
  const validRows = nonEmptyRows.filter((r) => isValidRow(r, ignoreMember));
  const invalidCount = nonEmptyRows.length - validRows.length;
  const canSubmit = validRows.length > 0 && invalidCount === 0 && !isSaving && !identityMissing;

  const distinctMembers = useMemo(
    () => new Set(validRows.map((r) => r.memberId)).size,
    [validRows]
  );
  const totalMinutes = useMemo(
    () => validRows.reduce((sum, r) => sum + rowDuration(r), 0),
    [validRows]
  );

  const handleSubmit = () => {
    if (identityMissing) return;
    const included = rows.filter((r) => !isEmptyRow(r, ignoreMember) && isValidRow(r, ignoreMember));
    if (included.length === 0) return;
    setSubmittedOrder(included.map((r) => r.uid));
    onSubmit(
      included.map((r) => ({
        member_id: r.memberId,
        workout_name: r.workoutName,
        date: r.date,
        duration: rowDuration(r)
      })),
      [...selectedProgramIds]
    );
  };

  const noWorkouts = lookupsLoaded && workoutOptions.length === 0;
  const noMembers = lookupsLoaded && effectiveCanSelectAny && memberOptions.length === 0;
  const noLookups = noWorkouts || noMembers;
  const atMax = rows.length >= MAX_ROWS;
  const columnCount = effectiveCanSelectAny ? 5 : 4;

  const content = (
    <>
      <ProgramMultiSelect
        programs={programs}
        currentProgramId={programId}
        selectedIds={selectedProgramIds}
        onToggle={toggleProgram}
        isGlobalAdmin={isGlobalAdmin}
      />
      {memberLocked && canSelectAnyMember && (
        <p className="mb-3 text-sm text-rf-text-muted">
          You&apos;re not an admin or logger in every selected program — logging for yourself only.
        </p>
      )}
      {noLookups && (
        <p className="rounded-2xl bg-rf-surface-muted px-4 py-3 text-sm text-rf-text-muted">
          {noMembers
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
                  {effectiveCanSelectAny && <th className="px-2 pb-2 font-semibold">Member</th>}
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
                  const rowLevelError = backendRowLevelByUid.get(r.uid);
                  return (
                    <Fragment key={r.uid}>
                    <tr
                      className={`align-top ${rowLevelError ? "[&>td]:bg-rf-danger/5" : ""}`}
                    >
                      {effectiveCanSelectAny && (
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
                      )}
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
                    {rowLevelError && (
                      <tr>
                        <td colSpan={columnCount} className="px-2 pb-2">
                          <FieldError message={rowLevelError} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
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
            const rowLevelError = backendRowLevelByUid.get(r.uid);
            return (
              <div
                key={r.uid}
                className={`space-y-3 rounded-2xl border bg-rf-surface p-4 ${rowLevelError ? "border-rf-danger" : "border-rf-border"}`}
              >
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
                {effectiveCanSelectAny && (
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
                )}
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
                {rowLevelError && <FieldError message={rowLevelError} />}
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

      {identityMissing && (
        <p className="mt-3 text-sm font-semibold text-rf-danger">
          We couldn&apos;t identify your account. Please sign out and sign back in, then try again.
        </p>
      )}
      {invalidCount > 0 && (
        <p className="mt-3 text-sm font-semibold text-rf-danger">
          {invalidCount} {invalidCount === 1 ? "row needs" : "rows need"} attention before saving.
        </p>
      )}
      {errorMessage && <p className="mt-3 text-sm font-semibold text-rf-danger">{errorMessage}</p>}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-rf-text-muted">
          {validRows.length} {validRows.length === 1 ? "row" : "rows"}
          {effectiveCanSelectAny && (
            <>
              {" • "}
              {distinctMembers} {distinctMembers === 1 ? "member" : "members"}
            </>
          )}
          {" • "}
          {totalMinutes} min total
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
          <h2 className="text-lg font-semibold text-rf-text">Add workouts</h2>
          <p className="mt-1 text-sm text-rf-text-muted">
            Add a row per session{effectiveCanSelectAny ? " — member, workout, date, and duration" : " — workout, date, and duration"} — then save them all at once.
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

/** Multi-program picker shared by the workouts and daily-health batch forms (DC-2/DC-4).
 *  Hidden when the user belongs to a single program; the current program is always selected. */
export function ProgramMultiSelect({
  programs,
  currentProgramId,
  selectedIds,
  onToggle,
  isGlobalAdmin
}: {
  programs: Program[];
  currentProgramId: string;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  isGlobalAdmin: boolean;
}) {
  if (programs.length <= 1) return null;
  return (
    <div className="mb-4">
      <p className="text-sm font-semibold text-rf-text">Programs</p>
      <div className="mt-2 divide-y divide-rf-border overflow-hidden rounded-2xl border border-rf-border">
        {programs.map((p) => {
          const isCurrent = p.id === currentProgramId;
          const locked = !!p.admin_only_data_entry && !isGlobalAdmin && p.my_role !== "admin";
          const checked = !locked && (isCurrent || selectedIds.has(p.id));
          return (
            <button
              key={p.id}
              type="button"
              disabled={isCurrent || locked}
              onClick={() => onToggle(p.id)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left ${locked ? "opacity-50" : ""} ${
                isCurrent || locked ? "cursor-default" : ""
              }`}
            >
              <span
                aria-hidden
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${
                  checked
                    ? "border-rf-accent bg-rf-accent text-black"
                    : "border-rf-border bg-rf-surface-muted text-transparent"
                }`}
              >
                ✓
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-rf-text">{p.name}</span>
                {isCurrent && <span className="block text-xs text-rf-text-muted">Current program</span>}
                {!isCurrent && locked && (
                  <span className="block text-xs text-rf-text-muted">Admin-only — can&apos;t log</span>
                )}
              </span>
              {locked && <IconLock className="h-4 w-4 shrink-0 text-rf-text-muted" />}
            </button>
          );
        })}
      </div>
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
