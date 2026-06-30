import { apiRequest } from "@/lib/api/client";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  program_id?: string | null;
  actor_member_id?: string | null;
  created_at?: string | null;
};

export async function fetchUnacknowledgedNotifications(token: string) {
  return apiRequest<NotificationItem[]>("/notifications/unacknowledged", { token });
}

export async function acknowledgeNotification(token: string, notificationId: string) {
  return apiRequest<{ message?: string }>(`/notifications/${notificationId}/acknowledge`, {
    method: "POST",
    token
  });
}
