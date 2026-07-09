"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { fetchProgramMembers, fetchPrograms, type Program } from "@/lib/api/programs";
import type { BulkHealthEntry, BulkRowError } from "@/lib/api/logs";
import { formatDuration } from "@/lib/format";
import { Select } from "@/components/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ProgramMultiSelect } from "@/components/forms/LogWorkoutsForm";

const MAX_ROWS = 200;

type Row = {
  uid: number;
  memberId: string;
  date: string;
  sleepHours: string;
  sleepMinutes: string;
  foodQuality: string;
  steps: string;
};

type FieldKey = "member" | "date" | "sleep" | "diet" | "steps";

const DIET_OPTIONS = [
  { value: "", label: "Not set" },
  ...["1", "2", "3", "4", "5"].map((value) => ({ value, label: value }))
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function sleepInfo(r: Row) {
  const hoursText = r.sleepHours.trim();
  const minutesText = r.sleepMinutes.trim();
  const hasInput = hoursText !== "" || minutesText !== "";
  const hours = hoursText === "" ? 0 : Number(hoursText);
  const minutes = minutesText === "" ? 0 : Number(minutesText);
  const partsValid =
    Number.isInteger(hours) && hours >= 0 && hours <= 24 &&
    Number.isInteger(minutes) && minutes >= 0 && minutes < 60;
  const total = hours + minutes / 60;
  const isValid = !hasInput || (partsValid && total >= 0 && total <= 24);
  return { hasInput, total, isValid };
}

function stepsInfo(r: Row) {
  const text = r.steps.trim();
  const hasInput = text !== "";
  const value = hasInput ? Number(text) : null;
  const isValid = !hasInput || (value !== null && Number.isInteger(value) && value >= 0);
  return { hasInput, value, isValid };
}

/** A row counts as empty (and is skipped on submit) when none of its own fields are filled.
 *  When the member column is hidden (`ignoreMember`), the pre-seeded self member_id is not
 *  considered a "filled" field, so a fresh row still reads as empty until they type. */
function isEmptyRow(r: Row, ignoreMember: boolean) {
  const memberEmpty = ignoreMember || !r.memberId;
  return memberEmpty && !r.sleepHours && !r.sleepMinutes && !r.foodQuality && !r.steps;
}

function isValidRow(r: Row, ignoreMember: boolean) {
  const sleep = sleepInfo(r);
  const steps = stepsInfo(r);
  const hasMetric = sleep.hasInput || r.foodQuality.trim() !== "" || steps.hasInput;
  return (
    (ignoreMember || r.memberId.trim().length > 0) &&
    r.date.trim().length > 0 &&
    sleep.isValid &&
    steps.isValid &&
    hasMetric
  );
}

/** Live, field-level validation messages for a non-empty row. Empty rows are ignored. */
function clientRowErrors(r: Row, ignoreMember: boolean): Partial<Record<FieldKey, string>> {
  if (isEmptyRow(r, ignoreMember)) return {};
  const errors: Partial<Record<FieldKey, string>> = {};
  if (!ignoreMember && !r.memberId) errors.member = "Select a member";
  if (!r.date) errors.date = "Pick a date";
  const sleep = sleepInfo(r);
  if (!sleep.isValid) errors.sleep = "Sleep time must be between 0:00 and 24:00";
  const steps = stepsInfo(r);
  if (!steps.isValid) errors.steps = "Steps must be a whole number of 0 or more";
  return errors;
}

/** Row-level client message: at-least-one metric (DC-6/R-1). */
function clientRowLevelError(r: Row, ignoreMember: boolean): string | null {
  if (isEmptyRow(r, ignoreMember)) return null;
  const sleep = sleepInfo(r);
  const steps = stepsInfo(r);
  const hasMetric = sleep.hasInput || r.foodQuality.trim() !== "" || steps.hasInput;
  return hasMetric ? null : "Add sleep, diet quality, or steps";
}

function mapBackendField(field: string): FieldKey | null {
  switch (field) {
    case "member_id":
      return "member";
    case "log_date":
      return "date";
    case "sleep_hours":
      return "sleep";
    case "food_quality":
      return "diet";
    case "steps":
      return "steps";
    default:
      return null; // "metrics" / "duplicate" → row-level
  }
}

export function LogDailyHealthForm({
  canSelectAnyMember,
  programId,
  token,
  userId,
  isGlobalAdmin,
  onClose,
  onSubmit,
  isSaving,
  errorMessage,
  rowErrors,
  variant = "modal"
}: {
  /** Admin/logger/global-admin → per-row member picker. Plain member → member column hidden, self only. */
  canSelectAnyMember: boolean;
  programId: string;
  token: string;
  /** The logged-in member's id — seeded into every row when the member column is hidden. */
  userId?: string;
  isGlobalAdmin: boolean;
  onClose: () => void;
  onSubmit: (entries: BulkHealthEntry[], programIds: string[]) => void;
  isSaving: boolean;
  errorMessage: string | null;
  rowErrors?: BulkRowError[] | null;
  variant?: "modal" | "page";
}) {
  const [members, setMembers] = useState<{ id: string; member_name: string }[]>([]);
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
  const identityMissing = ignoreMember && !(userId && userId.trim());

  useEffect(() => {
    let active = true;
    const loadLookups = async () => {
      if (!token || !programId) return;
      try {
        const [membersData, programsData] = await Promise.all([
          fetchProgramMembers(token, programId),
          fetchPrograms(token)
        ]);
        if (!active) return;
        setMembers(membersData);
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
    setRows((prev) => prev.map((r) => ({ ...r, memberId: userId ?? "" })));
  }, [memberLocked, userId]);

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

  const addRows = (count: number) => {
    setRows((prev) => {
      if (prev.length >= MAX_ROWS) return prev;
      const baseDate = prev[prev.length - 1]?.date || todayStr();
      const seedMemberId = ignoreMember ? userId ?? "" : "";
      const additions: Row[] = [];
      const room = Math.min(count, MAX_ROWS - prev.length);
      for (let i = 0; i < room; i += 1) {
        additions.push({
          uid: nextUid.current++,
          memberId: seedMemberId,
          date: baseDate,
          sleepHours: "",
          sleepMinutes: "",
          foodQuality: "",
          steps: ""
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

  // Row-level backend errors (metrics / duplicate) that aren't tied to a single field.
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

  // Client in-batch duplicate detection: two non-empty rows sharing member + date.
  const duplicateUids = useMemo(() => {
    const byKey = new Map<string, number[]>();
    for (const r of rows) {
      if (isEmptyRow(r, ignoreMember)) continue;
      const member = ignoreMember ? userId ?? "" : r.memberId;
      if (!member || !r.date) continue;
      const key = `${member}|${r.date}`;
      const list = byKey.get(key) ?? [];
      list.push(r.uid);
      byKey.set(key, list);
    }
    const dups = new Set<number>();
    for (const list of byKey.values()) {
      if (list.length > 1) list.forEach((uid) => dups.add(uid));
    }
    return dups;
  }, [rows, ignoreMember, userId]);

  // Live client errors win over (possibly stale) backend errors on the same field.
  const errorsForRow = (r: Row): Partial<Record<FieldKey, string>> => ({
    ...(backendByUid.get(r.uid) ?? {}),
    ...clientRowErrors(r, ignoreMember)
  });

  const rowLevelErrorFor = (r: Row): string | undefined =>
    clientRowLevelError(r, ignoreMember) ??
    (duplicateUids.has(r.uid) ? "Duplicate date for this member" : undefined) ??
    backendRowLevelByUid.get(r.uid);

  const nonEmptyRows = rows.filter((r) => !isEmptyRow(r, ignoreMember));
  const validRows = nonEmptyRows.filter((r) => isValidRow(r, ignoreMember));
  const invalidCount = nonEmptyRows.length - validRows.length;
  const canSubmit =
    validRows.length > 0 && invalidCount === 0 && duplicateUids.size === 0 && !isSaving && !identityMissing;

  const distinctMembers = useMemo(
    () => new Set(validRows.map((r) => (ignoreMember ? userId ?? "" : r.memberId))).size,
    [validRows, ignoreMember, userId]
  );
  const totalSleepMinutes = useMemo(
    () =>
      validRows.reduce((sum, r) => {
        const sleep = sleepInfo(r);
        return sum + (sleep.hasInput ? Math.round(sleep.total * 60) : 0);
      }, 0),
    [validRows]
  );
  const totalSteps = useMemo(
    () => validRows.reduce((sum, r) => sum + (stepsInfo(r).value ?? 0), 0),
    [validRows]
  );

  const handleSubmit = () => {
    if (identityMissing) return;
    const included = rows.filter((r) => !isEmptyRow(r, ignoreMember) && isValidRow(r, ignoreMember));
    if (included.length === 0 || duplicateUids.size > 0) return;
    setSubmittedOrder(included.map((r) => r.uid));
    onSubmit(
      included.map((r) => {
        const sleep = sleepInfo(r);
        const steps = stepsInfo(r);
        const entry: BulkHealthEntry = {
          member_id: ignoreMember ? userId ?? "" : r.memberId,
          log_date: r.date
        };
        if (sleep.hasInput) entry.sleep_hours = sleep.total;
        if (r.foodQuality.trim() !== "") entry.food_quality = Number(r.foodQuality);
        if (steps.hasInput && steps.value !== null) entry.steps = steps.value;
        return entry;
      }),
      [...selectedProgramIds]
    );
  };

  const noMembers = lookupsLoaded && effectiveCanSelectAny && memberOptions.length === 0;
  const atMax = rows.length >= MAX_ROWS;
  const columnCount = effectiveCanSelectAny ? 6 : 5;

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
      {noMembers && (
        <p className="rounded-2xl bg-rf-surface-muted px-4 py-3 text-sm text-rf-text-muted">
          No active members in this program yet.
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
                  <th className="px-2 pb-2 font-semibold">Date</th>
                  <th className="px-2 pb-2 font-semibold">Sleep</th>
                  <th className="px-2 pb-2 font-semibold">Diet</th>
                  <th className="px-2 pb-2 font-semibold">Steps</th>
                  <th className="px-2 pb-2">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const errs = errorsForRow(r);
                  const rowLevelError = rowLevelErrorFor(r);
                  return (
                    <Fragment key={r.uid}>
                    <tr className={`align-top ${rowLevelError ? "[&>td]:bg-rf-danger/5" : ""}`}>
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
                          <SleepInputs
                            hours={r.sleepHours}
                            minutes={r.sleepMinutes}
                            onHours={(v) => updateRow(r.uid, { sleepHours: v })}
                            onMinutes={(v) => updateRow(r.uid, { sleepMinutes: v })}
                          />
                          <FieldError message={errs.sleep} />
                        </div>
                      </td>
                      <td className="min-w-[110px] px-2 py-1">
                        <Select
                          value={r.foodQuality}
                          options={DIET_OPTIONS}
                          onChange={(v) => updateRow(r.uid, { foodQuality: v })}
                          placeholder="Diet"
                        />
                        <FieldError message={errs.diet} />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          min={0}
                          value={r.steps}
                          onChange={(e) => updateRow(r.uid, { steps: e.target.value })}
                          className="input-shell mt-2 w-24 rounded-2xl px-3 py-3 text-center text-sm font-medium"
                          placeholder="0"
                          aria-label="Steps"
                        />
                        <FieldError message={errs.steps} />
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
            const rowLevelError = rowLevelErrorFor(r);
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
                  <Input
                    type="date"
                    label="Date"
                    value={r.date}
                    onChange={(e) => updateRow(r.uid, { date: e.target.value })}
                  />
                  <FieldError message={errs.date} />
                </div>
                <div>
                  <label className="text-sm font-semibold text-rf-text">Sleep time</label>
                  <div className="mt-2">
                    <SleepInputs
                      hours={r.sleepHours}
                      minutes={r.sleepMinutes}
                      onHours={(v) => updateRow(r.uid, { sleepHours: v })}
                      onMinutes={(v) => updateRow(r.uid, { sleepMinutes: v })}
                    />
                    <FieldError message={errs.sleep} />
                  </div>
                </div>
                <div>
                  <Select
                    label="Diet quality"
                    value={r.foodQuality}
                    options={DIET_OPTIONS}
                    onChange={(v) => updateRow(r.uid, { foodQuality: v })}
                    placeholder="Select rating (1-5)"
                  />
                  <FieldError message={errs.diet} />
                </div>
                <div>
                  <label className="text-sm font-semibold text-rf-text">Steps</label>
                  <input
                    type="number"
                    min={0}
                    value={r.steps}
                    onChange={(e) => updateRow(r.uid, { steps: e.target.value })}
                    className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
                    placeholder="0"
                    aria-label="Steps"
                  />
                  <FieldError message={errs.steps} />
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
          {formatDuration(totalSleepMinutes)} sleep
          {" • "}
          {totalSteps.toLocaleString()} steps
        </p>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="w-full rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
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
          <h2 className="text-lg font-semibold text-rf-text">Log daily health</h2>
          <p className="mt-1 text-sm text-rf-text-muted">
            Track sleep, diet quality, and steps — add a row per day, then save them all at once.
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

function SleepInputs({
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
        value={hours}
        onChange={(event) => onHours(event.target.value.replace(/\D/g, "").slice(0, 2))}
        className="input-shell w-16 rounded-2xl px-3 py-3 text-center text-sm font-medium"
        placeholder="0"
        inputMode="numeric"
        aria-label="Sleep hours"
      />
      <span className="text-sm text-rf-text-muted">hr</span>
      <input
        value={minutes}
        onChange={(event) => onMinutes(event.target.value.replace(/\D/g, "").slice(0, 2))}
        className="input-shell w-16 rounded-2xl px-3 py-3 text-center text-sm font-medium"
        placeholder="0"
        inputMode="numeric"
        aria-label="Sleep minutes"
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
        className="mt-3 rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-white"
      >
        + Add first row
      </button>
    </div>
  );
}
