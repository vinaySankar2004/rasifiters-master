"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient
} from "@tanstack/react-query";
import {
  fetchInbox,
  fetchNotificationPreferences,
  fetchUnreadCount,
  markNotificationsRead,
  updateNotificationPreferences,
  type InboxPage,
  type MarkReadResult,
  type NotificationPreferences,
  type PreferencesUpdate,
  type UnreadCounts
} from "@/lib/api/notifications";

// Notification query keys + hooks (the notifications inbox contract). No member id in the keys: the sign-out teardown
// clears the whole QueryClient (auth-provider). The gate keeps the unread count + preferences cached app-wide; the
// stream's start / `ready` and every live item invalidate the unread count and the inbox.
export const NOTIFICATION_KEYS = {
  unread: ["notifications", "unread"] as const,
  inbox: ["notifications", "inbox"] as const,
  preferences: ["notifications", "preferences"] as const
};

export function useUnreadCount(token: string, enabled = true) {
  return useQuery({
    queryKey: NOTIFICATION_KEYS.unread,
    queryFn: () => fetchUnreadCount(token),
    enabled: !!token && enabled
  });
}

export function usePreferencesQuery(token: string, enabled = true) {
  return useQuery({
    queryKey: NOTIFICATION_KEYS.preferences,
    queryFn: () => fetchNotificationPreferences(token),
    enabled: !!token && enabled
  });
}

/** Newest first, 30 per page, keyset-paged by the opaque next_cursor. */
export function useInboxQuery(token: string) {
  return useInfiniteQuery({
    queryKey: NOTIFICATION_KEYS.inbox,
    queryFn: ({ pageParam }) => fetchInbox(token, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: InboxPage) => lastPage.next_cursor,
    enabled: !!token
  });
}

type ReadTarget = string[] | "all";

/** A mark-read answer: the server's fresh counts, and the read items marked read in the cached inbox. */
function applyReadResult(queryClient: QueryClient, result: MarkReadResult, target: ReadTarget): void {
  queryClient.setQueryData<UnreadCounts>(NOTIFICATION_KEYS.unread, {
    unread: result.unread,
    pending_invites: result.pending_invites,
    badge: result.badge
  });
  const readAt = new Date().toISOString();
  const isRead = (id: string) => target === "all" || target.includes(id);
  queryClient.setQueryData<InfiniteData<InboxPage>>(NOTIFICATION_KEYS.inbox, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.read_at === null && isRead(item.id) ? { ...item, read_at: readAt } : item
            )
          }))
        }
      : data
  );
}

export function useMarkRead(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (target: ReadTarget) =>
      markNotificationsRead(token, target === "all" ? { all: true } : { ids: target }),
    onSuccess: (result, target) => applyReadResult(queryClient, result, target)
  });
}

/** After an invite is accepted / declined, that program's unread invite items are marked read (the contract's
 *  invite-answer rule). */
export async function markInviteItemsRead(queryClient: QueryClient, token: string, programId: string): Promise<void> {
  const data = queryClient.getQueryData<InfiniteData<InboxPage>>(NOTIFICATION_KEYS.inbox);
  const ids = (data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((item) => item.type === "program.invite_received" && item.program_id === programId && item.read_at === null)
    .map((item) => item.id)
    .slice(0, 100);
  if (ids.length > 0) {
    try {
      applyReadResult(queryClient, await markNotificationsRead(token, { ids }), ids);
      return;
    } catch {
      // the next inbox open marks them read
    }
  }
  await queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.unread });
}

/** Partial PUT with an optimistic switch flip (reverted on failure); the answer is the full preferences. */
export function useUpdatePreferences(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: PreferencesUpdate) => updateNotificationPreferences(token, change),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATION_KEYS.preferences });
      const previous = queryClient.getQueryData<NotificationPreferences>(NOTIFICATION_KEYS.preferences);
      if (previous) {
        queryClient.setQueryData<NotificationPreferences>(NOTIFICATION_KEYS.preferences, {
          ...previous,
          categories: { ...previous.categories, ...change.categories },
          reminder_time: change.reminder_time ?? previous.reminder_time
        });
      }
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) queryClient.setQueryData(NOTIFICATION_KEYS.preferences, context.previous);
    },
    onSuccess: (preferences) => queryClient.setQueryData(NOTIFICATION_KEYS.preferences, preferences)
  });
}
