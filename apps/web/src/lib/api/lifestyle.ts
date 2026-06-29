import { apiRequest } from "@/lib/api/client";

export type WorkoutTypesTotal = {
  total_types: number;
};

export type WorkoutTypeMostPopular = {
  workout_name: string | null;
  sessions: number;
};

export type WorkoutTypeLongestDuration = {
  workout_name: string | null;
  avg_minutes: number;
};

export type WorkoutTypeHighestParticipation = {
  workout_name: string | null;
  participants: number;
  participation_pct: number;
  total_members: number;
};

export type WorkoutTypePopularity = {
  workout_name: string;
  sessions: number;
  total_duration: number;
  avg_duration_minutes: number;
};

export type HealthTimelinePoint = {
  date: string;
  label: string;
  sleep_hours: number;
  food_quality: number;
};

export type HealthTimelineResponse = {
  mode: string;
  label: string;
  daily_average_sleep: number;
  daily_average_food: number;
  buckets: HealthTimelinePoint[];
  start: string;
  end: string;
};

export async function fetchWorkoutTypesTotal(token: string, programId: string, memberId?: string) {
  const params = new URLSearchParams({ programId });
  if (memberId) params.set("memberId", memberId);
  return apiRequest<WorkoutTypesTotal>(`/analytics-v2/workouts/types/total?${params.toString()}`, { token });
}

export async function fetchWorkoutTypeMostPopular(token: string, programId: string, memberId?: string) {
  const params = new URLSearchParams({ programId });
  if (memberId) params.set("memberId", memberId);
  return apiRequest<WorkoutTypeMostPopular>(
    `/analytics-v2/workouts/types/most-popular?${params.toString()}`,
    { token }
  );
}

export async function fetchWorkoutTypeLongestDuration(token: string, programId: string, memberId?: string) {
  const params = new URLSearchParams({ programId });
  if (memberId) params.set("memberId", memberId);
  return apiRequest<WorkoutTypeLongestDuration>(
    `/analytics-v2/workouts/types/longest-duration?${params.toString()}`,
    { token }
  );
}

export async function fetchWorkoutTypeHighestParticipation(token: string, programId: string, memberId?: string) {
  const params = new URLSearchParams({ programId });
  if (memberId) params.set("memberId", memberId);
  return apiRequest<WorkoutTypeHighestParticipation>(
    `/analytics-v2/workouts/types/highest-participation?${params.toString()}`,
    { token }
  );
}

export async function fetchWorkoutTypePopularity(
  token: string,
  programId: string,
  paramsInput: { memberId?: string; limit?: number } = {}
) {
  const params = new URLSearchParams({
    programId,
    limit: String(paramsInput.limit ?? 50)
  });
  if (paramsInput.memberId) params.set("memberId", paramsInput.memberId);
  return apiRequest<WorkoutTypePopularity[]>(`/analytics/workouts/types?${params.toString()}`, { token });
}

export async function fetchHealthTimeline(
  token: string,
  period: string,
  programId: string,
  memberId?: string
) {
  const params = new URLSearchParams({ period, programId });
  if (memberId) params.set("memberId", memberId);
  return apiRequest<HealthTimelineResponse>(`/analytics/health/timeline?${params.toString()}`, { token });
}
