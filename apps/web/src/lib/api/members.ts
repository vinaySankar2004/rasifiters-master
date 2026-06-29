import { apiRequest } from "@/lib/api/client";

export type MemberMetrics = {
  member_id: string;
  member_name: string;
  username?: string;
  workouts: number;
  total_duration: number;
  avg_duration: number;
  active_days: number;
  workout_types: number;
  current_streak: number;
  longest_streak: number;
  mtd_workouts?: number;
  total_hours?: number;
  favorite_workout?: string | null;
  avg_sleep_hours?: number | null;
  avg_food_quality?: number | null;
};

export type MemberMetricsResponse = {
  program_id: string;
  total: number;
  filtered: number;
  sort: string;
  direction: string;
  date_range?: { start?: string | null; end?: string | null };
  members: MemberMetrics[];
};

export type MemberHistoryPoint = {
  date: string;
  label: string;
  workouts: number;
};

export type MemberHistoryResponse = {
  period: string;
  label: string;
  daily_average: number;
  buckets: MemberHistoryPoint[];
  start: string;
  end: string;
};

export type MemberStreaks = {
  currentStreakDays: number;
  longestStreakDays: number;
  milestones: { dayValue: number; achieved: boolean }[];
};

export type MemberRecentItem = {
  id: string;
  workoutType: string;
  workoutDate: string;
  durationMinutes: number;
};

export type MemberRecentResponse = {
  items: MemberRecentItem[];
  total: number;
};

export type MemberHealthItem = {
  id: string;
  logDate: string;
  sleepHours: number | null;
  foodQuality: number | null;
};

export type MemberHealthResponse = {
  items: MemberHealthItem[];
  total: number;
};

export type MemberProfile = {
  id: string;
  member_name: string;
  username?: string;
  gender?: string | null;
  date_joined?: string | null;
  global_role?: string | null;
  created_at?: string | null;
};

export async function fetchMemberProfile(token: string, memberId: string) {
  return apiRequest<MemberProfile>(`/members/${memberId}`, { token });
}

export async function updateMemberProfile(
  token: string,
  memberId: string,
  payload: { first_name?: string; last_name?: string; gender?: string | null }
) {
  return apiRequest<{ message?: string; member_name?: string }>(`/members/${memberId}`, {
    method: "PUT",
    token,
    body: payload
  });
}

export async function fetchMemberMetrics(
  token: string,
  programId: string,
  params: {
    search?: string;
    sort?: string;
    direction?: string;
    memberId?: string;
    filters?: Record<string, string>;
  } = {}
) {
  const query = new URLSearchParams({ programId });
  if (params.search) query.set("search", params.search);
  if (params.sort) query.set("sort", params.sort);
  if (params.direction) query.set("direction", params.direction);
  if (params.memberId) query.set("memberId", params.memberId);
  if (params.filters) {
    Object.entries(params.filters).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
  }
  return apiRequest<MemberMetricsResponse>(`/member-metrics?${query.toString()}`, { token });
}

export async function fetchMemberHistory(token: string, programId: string, memberId: string, period: string) {
  const query = new URLSearchParams({ programId, memberId, period });
  return apiRequest<MemberHistoryResponse>(`/member-history?${query.toString()}`, { token });
}

export async function fetchMemberStreaks(token: string, programId: string, memberId: string) {
  const query = new URLSearchParams({ programId, memberId });
  return apiRequest<MemberStreaks>(`/member-streaks?${query.toString()}`, { token });
}

export async function fetchMemberRecentWorkouts(
  token: string,
  programId: string,
  memberId: string,
  params: {
    limit?: number;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortDir?: string;
    workoutType?: string;
    minDuration?: number;
    maxDuration?: number;
  } = {}
) {
  const query = new URLSearchParams({
    programId,
    memberId,
    limit: params.limit ? String(params.limit) : "1000"
  });
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.sortDir) query.set("sortDir", params.sortDir);
  if (params.workoutType) query.set("workoutType", params.workoutType);
  if (params.minDuration !== undefined && params.minDuration !== null)
    query.set("minDuration", String(params.minDuration));
  if (params.maxDuration !== undefined && params.maxDuration !== null)
    query.set("maxDuration", String(params.maxDuration));
  return apiRequest<MemberRecentResponse>(`/member-recent?${query.toString()}`, { token });
}

export async function fetchMemberHealthLogs(
  token: string,
  programId: string,
  memberId: string,
  params: {
    limit?: number;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortDir?: string;
    minSleepHours?: number;
    maxSleepHours?: number;
    minFoodQuality?: number;
    maxFoodQuality?: number;
  } = {}
) {
  const query = new URLSearchParams({
    programId,
    memberId,
    limit: params.limit ? String(params.limit) : "1000"
  });
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.sortDir) query.set("sortDir", params.sortDir);
  if (params.minSleepHours !== undefined && params.minSleepHours !== null)
    query.set("minSleepHours", String(params.minSleepHours));
  if (params.maxSleepHours !== undefined && params.maxSleepHours !== null)
    query.set("maxSleepHours", String(params.maxSleepHours));
  if (params.minFoodQuality !== undefined && params.minFoodQuality !== null)
    query.set("minFoodQuality", String(params.minFoodQuality));
  if (params.maxFoodQuality !== undefined && params.maxFoodQuality !== null)
    query.set("maxFoodQuality", String(params.maxFoodQuality));
  return apiRequest<MemberHealthResponse>(`/daily-health-logs?${query.toString()}`, { token });
}

export async function sendProgramInvite(token: string, programId: string, username: string) {
  return apiRequest<{ message: string }>("/program-memberships/invite", {
    method: "POST",
    token,
    body: { program_id: programId, username }
  });
}
