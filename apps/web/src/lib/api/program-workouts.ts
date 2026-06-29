import { apiRequest } from "@/lib/api/client";

export type ProgramWorkout = {
  id: string;
  workout_name: string;
  source: "global" | "custom";
  is_hidden: boolean;
  library_workout_id: string | null;
};

export async function fetchProgramWorkouts(token: string, programId: string) {
  const params = new URLSearchParams({ programId });
  return apiRequest<ProgramWorkout[]>(`/program-workouts?${params.toString()}`, { token });
}

export async function toggleGlobalWorkoutVisibility(
  token: string,
  payload: { program_id: string; library_workout_id: string }
) {
  return apiRequest<ProgramWorkout>("/program-workouts/toggle-visibility", {
    method: "PUT",
    token,
    body: payload
  });
}

export async function toggleCustomWorkoutVisibility(token: string, workoutId: string) {
  return apiRequest<ProgramWorkout>(`/program-workouts/${workoutId}/toggle-visibility`, {
    method: "PUT",
    token
  });
}

export async function addCustomProgramWorkout(token: string, programId: string, workout_name: string) {
  return apiRequest<ProgramWorkout>("/program-workouts/custom", {
    method: "POST",
    token,
    body: { program_id: programId, workout_name }
  });
}

export async function editCustomProgramWorkout(token: string, workoutId: string, workout_name: string) {
  return apiRequest<ProgramWorkout>(`/program-workouts/${workoutId}`, {
    method: "PUT",
    token,
    body: { workout_name }
  });
}

export async function deleteCustomProgramWorkout(token: string, workoutId: string) {
  return apiRequest<{ message?: string }>(`/program-workouts/${workoutId}`, {
    method: "DELETE",
    token
  });
}
