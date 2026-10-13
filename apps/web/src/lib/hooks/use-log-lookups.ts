"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchProgramMembers, fetchPrograms, type Member, type Program } from "@/lib/api/programs";
import { fetchProgramWorkouts, type ProgramWorkout } from "@/lib/api/program-workouts";
import { toAppError, type AppError } from "@/lib/kit/app-error";
import { subscribeReconnect } from "@/lib/kit/use-online-status";

// The log forms' pickers (polish #16): the program's members, the member's programs and, for the workout form, the
// program's visible workout types, loaded together. A failed load is an ERROR ("Couldn't load this · Retry"), never
// an empty list that reads "No workout types"; it reloads by itself when the connection comes back (D-KIT-13).
// Lists from an earlier good load are kept.

export type LogLookups = {
  members: Member[];
  workouts: ProgramWorkout[];
  programs: Program[];
  /** A load has succeeded: only then is an empty list really empty. */
  loaded: boolean;
  /** The latest load failed. */
  error: AppError | null;
  reload: () => void;
};

const NO_WORKOUTS: ProgramWorkout[] = [];

export function useLogLookups(token: string, programId: string, withWorkouts: boolean): LogLookups {
  const [members, setMembers] = useState<Member[]>([]);
  const [workouts, setWorkouts] = useState<ProgramWorkout[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!token || !programId) return;
    let active = true;
    setError(null);
    Promise.all([
      fetchProgramMembers(token, programId),
      withWorkouts ? fetchProgramWorkouts(token, programId) : Promise.resolve(NO_WORKOUTS),
      fetchPrograms(token)
    ])
      .then(([membersData, workoutsData, programsData]) => {
        if (!active) return;
        setMembers(membersData);
        setWorkouts(workoutsData.filter((workout) => !workout.is_hidden));
        setPrograms(programsData);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (active) setError(toAppError(err));
      });
    return () => {
      active = false;
    };
  }, [token, programId, withWorkouts, attempt]);

  // Back online after a failed load → load again.
  useEffect(() => {
    if (!error) return;
    return subscribeReconnect(reload);
  }, [error, reload]);

  return { members, workouts, programs, loaded, error, reload };
}
