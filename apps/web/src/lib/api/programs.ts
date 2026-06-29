import { apiRequest } from "@/lib/api/client";

export type Program = {
  id: string;
  name: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  total_members?: number;
  active_members?: number;
  progress_percent?: number;
  enrollments_closed?: boolean;
  my_role?: string | null;
  my_status?: string | null;
  admin_only_data_entry?: boolean;
};

export type ProgramResponse = {
  id: string;
  name: string;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
  admin_only_data_entry?: boolean;
  message?: string;
};

export type Member = {
  id: string;
  member_name: string;
  username?: string;
  gender?: string;
  date_joined?: string;
};

export type Workout = {
  workout_name: string;
};

export async function fetchPrograms(token: string) {
  return apiRequest<Program[]>("/programs", { token });
}

export async function fetchProgramMembers(token: string, programId: string) {
  const params = new URLSearchParams({ programId });
  return apiRequest<Member[]>(`/program-memberships/members?${params.toString()}`, { token });
}

export async function fetchWorkouts(token: string) {
  return apiRequest<Workout[]>("/workouts", { token });
}

export async function createProgram(
  token: string,
  payload: {
    name: string;
    status: string;
    start_date?: string | null;
    end_date?: string | null;
  }
) {
  return apiRequest<ProgramResponse>("/programs", {
    method: "POST",
    token,
    body: payload
  });
}

export async function updateProgram(
  token: string,
  programId: string,
  payload: {
    name?: string;
    status?: string;
    start_date?: string | null;
    end_date?: string | null;
    admin_only_data_entry?: boolean;
  }
) {
  return apiRequest<ProgramResponse>(`/programs/${programId}`, {
    method: "PUT",
    token,
    body: payload
  });
}

export async function deleteProgram(token: string, programId: string) {
  return apiRequest<{ id: string; message?: string }>(`/programs/${programId}`, {
    method: "DELETE",
    token
  });
}

export type MembershipUpdateResponse = {
  message?: string;
};

export type MembershipDetail = {
  member_id: string;
  member_name: string;
  username?: string;
  gender?: string;
  date_joined?: string;
  global_role?: string;
  program_role?: string;
  status?: string;
  is_active?: boolean;
  joined_at?: string | null;
};

export async function updateMembership(
  token: string,
  payload: {
    program_id: string;
    member_id: string;
    role?: string | null;
    status?: string | null;
    is_active?: boolean | null;
    joined_at?: string | null;
  }
) {
  return apiRequest<MembershipUpdateResponse>("/program-memberships", {
    method: "PUT",
    token,
    body: payload
  });
}

export async function removeMembership(
  token: string,
  payload: { program_id: string; member_id: string }
) {
  return apiRequest<{ message?: string }>("/program-memberships", {
    method: "DELETE",
    token,
    body: payload
  });
}

export async function fetchMembershipDetails(token: string, programId: string) {
  const params = new URLSearchParams({ programId });
  return apiRequest<MembershipDetail[]>(`/program-memberships/details?${params.toString()}`, {
    token
  });
}

export async function leaveProgram(token: string, programId: string) {
  return apiRequest<{ message?: string; program_id?: string }>("/program-memberships/leave", {
    method: "PUT",
    token,
    body: { program_id: programId }
  });
}
