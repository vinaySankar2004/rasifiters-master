"use client";

import { useEffect, useState } from "react";
import { fetchProgramMembers } from "@/lib/api/programs";
import { Select } from "@/components/Select";
import { Input } from "@/components/ui/Input";

export function LogDailyHealthForm({
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
    log_date: string;
    sleep_hours?: number | null;
    food_quality?: number | null;
  }) => void;
  isSaving: boolean;
  errorMessage: string | null;
  variant?: "modal" | "page";
}) {
  const [members, setMembers] = useState<{ id: string; member_name: string }[]>([]);
  const [memberId, setMemberId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sleepHours, setSleepHours] = useState("");
  const [sleepMinutes, setSleepMinutes] = useState("");
  const [foodQuality, setFoodQuality] = useState("");

  useEffect(() => {
    const loadLookups = async () => {
      if (!token || !programId) return;
      const membersData = await fetchProgramMembers(token, programId);
      setMembers(membersData);
      if (!canSelectAnyMember && userId) {
        setMemberId(userId);
      }
    };
    loadLookups();
  }, [token, programId, canSelectAnyMember, userId]);

  const trimmedHours = sleepHours.trim();
  const trimmedMinutes = sleepMinutes.trim();
  const hasSleepInput = trimmedHours !== "" || trimmedMinutes !== "";
  const hoursProvided = trimmedHours !== "";
  const minutesProvided = trimmedMinutes !== "";
  const hoursValue = hoursProvided ? Number(trimmedHours) : 0;
  const minutesValue = minutesProvided ? Number(trimmedMinutes) : 0;
  const hoursValid =
    !hoursProvided ||
    (!Number.isNaN(hoursValue) && Number.isInteger(hoursValue) && hoursValue >= 0 && hoursValue <= 24);
  const minutesValid =
    !minutesProvided ||
    (!Number.isNaN(minutesValue) &&
      Number.isInteger(minutesValue) &&
      minutesValue >= 0 &&
      minutesValue < 60);
  const sleepTotal =
    hasSleepInput && hoursValid && minutesValid ? hoursValue + minutesValue / 60 : null;
  const sleepValue = hasSleepInput ? sleepTotal : null;
  const foodValue = foodQuality.trim() === "" ? null : Number(foodQuality);
  const hasMetric = sleepValue !== null || foodValue !== null;
  const sleepValid = !hasSleepInput || (sleepTotal !== null && sleepTotal >= 0 && sleepTotal <= 24);

  const canSubmit = hasMetric && sleepValid && (!canSelectAnyMember || memberId);

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

        <Input
          type="date"
          label="Date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <div>
          <label className="text-sm font-semibold text-rf-text">Sleep time</label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <input
              value={sleepHours}
              onChange={(event) => {
                const next = event.target.value.replace(/\D/g, "").slice(0, 2);
                setSleepHours(next);
              }}
              className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
              placeholder="Hours"
              inputMode="numeric"
            />
            <input
              value={sleepMinutes}
              onChange={(event) => {
                const next = event.target.value.replace(/\D/g, "").slice(0, 2);
                setSleepMinutes(next);
              }}
              className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
              placeholder="Minutes"
              inputMode="numeric"
            />
          </div>
          {!sleepValid && (
            <p className="mt-2 text-xs font-semibold text-rf-danger">Sleep time must be between 0:00 and 24:00.</p>
          )}
        </div>

        <Select
          label="Diet quality"
          value={foodQuality}
          options={[1, 2, 3, 4, 5].map((val) => ({ value: String(val), label: String(val) }))}
          onChange={setFoodQuality}
          placeholder="Select rating (1-5)"
        />
      </div>

      {errorMessage && <p className="mt-3 text-sm font-semibold text-rf-danger">{errorMessage}</p>}

      <button
        type="button"
        disabled={!canSubmit || isSaving}
        onClick={() =>
          onSubmit({
            member_id: canSelectAnyMember ? memberId || undefined : userId,
            log_date: date,
            sleep_hours: sleepValue,
            food_quality: foodValue
          })
        }
        className="mt-5 w-full rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white"
      >
        {isSaving ? "Saving…" : "Save daily log"}
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
          <h2 className="text-lg font-semibold text-rf-text">Log daily health</h2>
          <p className="mt-1 text-sm text-rf-text-muted">Track sleep hours and diet quality for the day.</p>
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
