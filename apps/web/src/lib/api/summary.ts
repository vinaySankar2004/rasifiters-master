import { apiRequest } from "@/lib/api/client";

export type AnalyticsSummary = {
  period: string;
  range: {
    current: { start: string; end: string };
    previous: { start: string; end: string };
  };
  totals: {
    logs: number;
    logs_change_pct: number;
    duration_minutes: number;
    duration_change_pct: number;
    avg_duration_minutes: number;
    avg_duration_change_pct: number;
  };
  program_progress: {
    program_id: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    total_days: number;
    elapsed_days: number;
    remaining_days: number;
    progress_percent: number;
  };
  members: {
    total: number;
    active: number;
    at_risk: number;
  };
  timeline: Array<{
    date: string;
    workouts: number;
    duration: number;
  }>;
  distribution_by_day: Record<string, { workouts: number; duration: number }>;
  top_performers: Array<{
    member_id: string;
    member_name: string;
    workouts: number;
    total_duration: number;
  }>;
  top_workout_types: Array<{
    workout_name: string;
    sessions: number;
    duration: number;
  }>;
};

export type MTDParticipation = {
  total_members: number;
  active_members: number;
  participation_pct: number;
  change_pct: number;
};

export type TotalWorkoutsMTD = {
  total_workouts: number;
  change_pct: number;
};

export type TotalDurationMTD = {
  total_minutes: number;
  change_pct: number;
};

export type AvgDurationMTD = {
  avg_minutes: number;
  change_pct: number;
};

export type ActivityTimelinePoint = {
  date: string;
  label: string;
  workouts: number;
  active_members: number;
};

export type ActivityTimelineResponse = {
  mode: string;
  label: string;
  daily_average: number;
  buckets: ActivityTimelinePoint[];
};

export type DistributionByDay = {
  Sunday: number;
  Monday: number;
  Tuesday: number;
  Wednesday: number;
  Thursday: number;
  Friday: number;
  Saturday: number;
};

export type WorkoutType = {
  workout_name: string;
  sessions: number;
  total_duration: number;
  avg_duration_minutes: number;
};

export async function fetchAnalyticsSummary(token: string, period: string, programId: string) {
  const params = new URLSearchParams({ period, programId });
  return apiRequest<AnalyticsSummary>(`/analytics/summary?${params.toString()}`, { token });
}

export async function fetchMTDParticipation(token: string, programId: string) {
  const params = new URLSearchParams({ programId });
  return apiRequest<MTDParticipation>(`/analytics-v2/participation/mtd?${params.toString()}`, { token });
}

export async function fetchTotalWorkoutsMTD(token: string, programId: string) {
  const params = new URLSearchParams({ programId });
  return apiRequest<TotalWorkoutsMTD>(`/analytics/workouts/total?${params.toString()}`, { token });
}

export async function fetchTotalDurationMTD(token: string, programId: string) {
  const params = new URLSearchParams({ programId });
  return apiRequest<TotalDurationMTD>(`/analytics/duration/total?${params.toString()}`, { token });
}

export async function fetchAvgDurationMTD(token: string, programId: string) {
  const params = new URLSearchParams({ programId });
  return apiRequest<AvgDurationMTD>(`/analytics/duration/average?${params.toString()}`, { token });
}

export async function fetchActivityTimeline(token: string, period: string, programId: string) {
  const params = new URLSearchParams({ period, programId });
  return apiRequest<ActivityTimelineResponse>(`/analytics/timeline?${params.toString()}`, { token });
}

export async function fetchDistributionByDay(token: string, programId: string) {
  const params = new URLSearchParams({ programId });
  return apiRequest<DistributionByDay>(`/analytics/distribution/day?${params.toString()}`, { token });
}

export async function fetchWorkoutTypes(token: string, programId: string, limit = 100) {
  const params = new URLSearchParams({ programId, limit: String(limit) });
  return apiRequest<WorkoutType[]>(`/analytics/workouts/types?${params.toString()}`, { token });
}
