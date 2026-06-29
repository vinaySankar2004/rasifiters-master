import { apiRequest } from "@/lib/api/client";

export type PendingInvite = {
  invite_id: string;
  program_id: string;
  program_name?: string | null;
  program_status?: string | null;
  program_start_date?: string | null;
  program_end_date?: string | null;
  invited_by_name?: string | null;
  invited_at?: string | null;
  expires_at?: string | null;
  invited_username?: string | null;
  invited_member_name?: string | null;
  invited_member_id?: string | null;
};

export type InviteResponse = {
  message: string;
};

export async function fetchMyInvites(token: string) {
  return apiRequest<PendingInvite[]>("/program-memberships/my-invites", { token });
}

export async function fetchAllInvites(token: string) {
  return apiRequest<PendingInvite[]>("/program-memberships/all-invites", { token });
}

export async function respondToInvite(
  token: string,
  payload: { invite_id: string; action: "accept" | "decline" | "revoke"; block_future?: boolean }
) {
  return apiRequest<InviteResponse>("/program-memberships/invite-response", {
    method: "PUT",
    token,
    body: payload
  });
}
