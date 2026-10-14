import { apiRequest } from "@/lib/api/client";

// The notification inbox + preferences API (the notifications inbox contract). Web is an inbox client: it reads the
// inbox and the ?inbox=1 stream, never the legacy pop-up feed. Read = the acknowledged flag (D-N5), so reading here
// clears an item on every device. Errors are { error, code }; the status decides the kit kind.

export type NotificationCategory = "program" | "activity" | "reminders" | "digest" | "announcements";

/** A GET /inbox item and every ?inbox=1 stream frame. `target`: invites | program | programs | log_workout | inbox
 *  (a value newer than this build opens the inbox). */
export type InboxItem = {
  id: string;
  type: string;
  category: NotificationCategory;
  target: string;
  program_id: string | null;
  actor_member_id: string | null;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type InboxPage = { items: InboxItem[]; next_cursor: string | null };
export type UnreadCounts = { unread: number; pending_invites: number; badge: number };
export type MarkReadResult = UnreadCounts & { updated: number };
export type InboxDeleteResult = UnreadCounts & { deleted: number };
export type NotificationPreferences = {
  categories: Record<NotificationCategory, boolean>;
  reminder_time: string;
  time_zone: string | null;
};
export type PreferencesUpdate = {
  categories?: Partial<Record<NotificationCategory, boolean>>;
  reminder_time?: string;
};

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = ["program", "activity", "reminders", "digest", "announcements"];
export const INBOX_PAGE_SIZE = 30;

export function fetchInbox(token: string, before: string | null) {
  const query = new URLSearchParams({ limit: String(INBOX_PAGE_SIZE) });
  if (before) query.set("before", before);
  return apiRequest<InboxPage>(`/notifications/inbox?${query.toString()}`, { token });
}

export function fetchUnreadCount(token: string) {
  return apiRequest<UnreadCounts>("/notifications/inbox/unread-count", { token });
}

export function markNotificationsRead(token: string, body: { ids: string[] } | { all: true }) {
  return apiRequest<MarkReadResult>("/notifications/inbox/read", { method: "POST", token, body });
}

/** DELETE /notifications/inbox/:id — this member's own item, gone on every device; answers fresh counts (404 = gone). */
export function removeInboxItem(token: string, id: string) {
  return apiRequest<InboxDeleteResult>(`/notifications/inbox/${encodeURIComponent(id)}`, { method: "DELETE", token });
}

/** DELETE /notifications/inbox/all — every notification (the invitations are separate and stay); answers fresh counts. */
export function clearInbox(token: string) {
  return apiRequest<InboxDeleteResult>("/notifications/inbox/all", { method: "DELETE", token });
}

export function fetchNotificationPreferences(token: string) {
  return apiRequest<NotificationPreferences>("/notifications/preferences", { token });
}

/** Partial PUT — only the fields sent change; answers the full preferences. */
export function updateNotificationPreferences(token: string, update: PreferencesUpdate) {
  return apiRequest<NotificationPreferences>("/notifications/preferences", { method: "PUT", token, body: update });
}

const NOTIFICATION_INBOX_SUBTITLE = "Invites and notifications";

// The shared Phase 4 notification copy (identical on iOS + Android; casing per surface idiom).
export const NOTIFICATION_COPY = {
  inbox: "Inbox",
  inboxSubtitle: NOTIFICATION_INBOX_SUBTITLE,
  /** The account menus' Inbox row: "<n> new" while something is waiting (web also keeps its count pill). */
  inboxRowSubtitle: (badge: number) =>
    badge > 0 ? `${badge > 99 ? "99+" : badge} new` : NOTIFICATION_INBOX_SUBTITLE,
  settingsRow: "Notifications",
  settingsRowSubtitle: "Choose what you're notified about",
  announcementsRow: "Announcements",
  announcementsRowSubtitle: "Send a message to members",
  invitationsHeading: "Invitations",
  allInvitesHeading: "All invitations",
  notificationsHeading: "Notifications",
  inboxLoading: "Loading notifications…",
  inboxEmptyTitle: "No notifications yet",
  inboxEmptyBody: "Program updates, kudos, reminders and announcements show up here.",
  unread: "Unread",
  loadMore: "Load more",
  loadingMore: "Loading…",
  clearAll: "Clear all",
  clearConfirmTitle: "Clear all notifications?",
  clearConfirmBody: "They're removed from your Inbox on all your devices. Invitations stay until you answer them.",
  clearing: "Clearing…",
  removeLabel: "Remove notification",
  removeFailed: "Couldn't remove the notification.",
  clearFailed: "Couldn't clear your notifications.",
  toastView: "View",
  toastFallbackTitle: "New notification",
  justNow: "Just now",
  minutesAgo: (minutes: number) => `${minutes}m ago`,
  hoursAgo: (hours: number) => `${hours}h ago`,
  yesterday: "Yesterday",
  settingsTitle: "Notifications",
  settingsSubtitle: "Choose what RaSi Fiters notifies you about.",
  settingsSection: "Notify me about",
  settingsLoading: "Loading notification settings…",
  optInNote:
    "Reminders and the weekly digest are off until you turn them on. With Program & invites or Announcements off, you get no alert, but they still appear in your Inbox.",
  reminderTime: "Reminder time",
  timeZone: (zone: string) => `Uses your time zone: ${zone}.`,
  webNote:
    "The web app doesn't send push alerts: here, notifications appear in your Inbox. For alerts on your phone, use the RaSi Fiters app.",
  categories: {
    program: { label: "Program & invites", hint: "Invites, role changes and updates to your programs." },
    activity: { label: "Activity", hint: "Kudos from people in your programs." },
    reminders: {
      label: "Reminders",
      hint: "One reminder a day around your chosen time, only if you haven't logged a workout that day."
    },
    digest: { label: "Weekly digest", hint: "A recap of your past week, every Monday morning." },
    announcements: { label: "Announcements", hint: "News and messages from the RaSi Fiters team." }
  } as Record<NotificationCategory, { label: string; hint: string }>
};
