# PLAN: Phase 4 Track C (web), revision 2. Notifications client (N3, plus the web parts of N7/N8) with the composer is Pass A. The People client (S2) and the Members-tab kit pass (S5 = polish #32) are Pass B.

**Brief accepted**: yes. 30 files: 11 modified, 1 deleted, 18 new, plus the orchestrator's docs. No file is outside the brief. `components/announcements/MemberPicker.tsx` also exports `AudiencePicker`, which the brief allows as a merge.

**Feature/version prediction**:
- Both feat commits are no-bump `feat(web)`.
- Docs commit after Pass A:
  - notifications takes the next MINOR (expected v0.6.1 → v0.7.0). The clients adopt contract C7, and this bump is shared with N4/N5.
  - invites v0.2.1 → v0.2.2 (PATCH).
  - observability v0.4.0 → v0.4.1 (PATCH).
- Docs commit after Pass B: people v0.1.x → v0.2.0 (MINOR, `consumed_by` += web).
- members and frontend-kit 0.4.0: no bump.

**Surfaces in scope**: [web]. Backend, iOS and Android are parallel tracks with disjoint files.

## Revision 2: how each adversary objection is resolved

| # | Resolution |
|---|---|
| 1 BLOCKING | The stream hook gains `onStart`. On every (re)start and every `ready`, the gate re-reads the stored active program and the invites (`catchUp`, at most once per 5 s). If role, status or program fields changed, it also re-reads the role-gated queries. See steps A4 and A8. |
| 2 BLOCKING | Send unlocks only when a preview exists for EXACTLY the request on screen (not a kept older one) and reaches at least 1 person. The confirm names the audience and count. Local mode defaults to tomorrow at 09:00, with a warning if the time has already passed. See steps A14 and A16. |
| 3 BLOCKING | The work is split into **two passes, each with its own gate, commit and deploy** (W16).<br>• Pass A (notifications + composer) is committed only after N-SRV is live on prod.<br>• Pass B (People + S5 + Hide toggle + People privacy text) is implemented only after Pass A is committed, and committed only after S1 is live.<br>• While `PEOPLE_LIVE` is false, `/members/list` runs today's roster code verbatim (`fetchMembershipDetails`). |
| 4 | The toast is dropped as soon as any modal opens and is never shown while one is open (`useBodyModalOpen`). The z-index comments are corrected. InboxList shows its inline stale row only while online. |
| 5 | The gate clears the toast when `shouldRun` goes false. |
| 6 | HideActivityToggle no longer writes to the profile query cache. It keeps the saved value locally, so unsaved name or gender edits survive. |
| 7 | W6 revised: loggers open that person's full workout list. |
| 8 | MemberPicker pins a "You (name)" row first. |
| 9 | The audience section moves into MemberPicker.tsx, so ComposerForm is about 225 lines (one cohesive form). The cards share a `LinkCard` helper, and `MemberMetricsSingleCard` stays in the page, so the cards file is about 210 lines. |
| 10 | The dark roster is today's code verbatim, including ★ and the Inactive badge. |
| 11 | There is a **Shared client contract** section below. The orchestrator copies it into the N4/N5/S3/S4 plans before approval. Toast = per-surface realization of the open frontend-kit §10 item. |
| 12 | Quick-wins web is committed (`095d864`), so anchors are quoted text against HEAD. Base versions are corrected. The grep pattern no longer matches comments. |
| 13 | W10 is escalated as **U-W1**. Default: not included (the task says "exactly"). If the user says yes, step A19 applies it. |
| 14 | Both account menus show the unread `badge` count on their Inbox row (W18). |

## Decisions (binding)

| # | Decision | Why |
|---|---|---|
| W1 (U-3) | `export const PEOPLE_LIVE: boolean = false;` in `lib/api/people.ts`.<br>While false: `/members/list` = today's roster verbatim, entry labels unchanged, no notice, `/members/person` reachable only by URL.<br>Release day flips it with one line. | U-3 recommends People going live with the store release. A compile-time constant is the simplest dark launch. |
| W2 | Hide my activity and the People privacy text ship ungated with Pass B, which is gated by S1 being live. | They describe a switch that exists once S1 is live. |
| W3 (U-1 b) | Build `ActivityVisibilityNotice`. localStorage key `rasi.fiters.activityNotice.<memberId>`. Shown on the first People open; skipped if the member is already hidden.<br>U-1(a): skip B8 and its render line in B5.<br>U-1(c): STOP and re-plan. | Recommended option. |
| W4 | The "+" badge = server `badge` for every role. If it's unavailable, members fall back to their pending-invite count (today's badge) and global admins get 0. | One rule on all surfaces. Global admins previously saw every system invite: deliberate change, gets a programs-page D-rule. |
| W5 | The Inbox row on the Program tab opens `/programs?open=inbox`. `OPEN_INBOX_EVENT` covers the case where /programs is already showing. | A push to the same path doesn't remount the page. |
| W6 | **Open full stats** (staff only):<br>• admins and global admins: set `rf:members:view-as:<programId>:<viewerId>` and open `/members` (the full dashboard viewing that person);<br>• loggers: open `/members/workouts?memberId=&name=` (that person's full workout list). | A logger's Members overview is always the logger themselves. |
| W7 | Global admins get "Manage membership" on a profile, which opens `/members/detail?memberId=`. | D-P11. |
| W8 | People stays at `/members/list`. New routes: `/members/person`, `/program/notifications`, `/program/announcements`. | Keeps every back and push link. All are inside the middleware matcher. |
| W9 | Opening the inbox sends `{all:true}` once the first fresh page is on screen. An item that arrives while it is open is marked read on arrival (`{ids}`). Dots stay for what was new while it stays open. | D-N5. |
| W11 | Composer history plus Cancel. | The only way to stop a scheduled send. |
| W12 | `NOTIFICATION_COPY` / `PEOPLE_COPY` are the proposed shared Phase-4 copy; the orchestrator mirrors them. `ANNOUNCEMENT_COPY` is web-only. | `AUTH_COPY` precedent. |
| W13 | The "+" sheet tab is picked only when the sheet opens: Inbox if badge > 0, else Create. | Mark-all lowers the badge while the sheet is open. |
| W14 | Toast: top-centre, z-40, outside `<main>`. Never shown while any modal is open, and dropped when one opens. One at a time, 6 s. | Never covers a sheet or dialog. |
| W15 | Preview runs automatically 2 s after the last edit, cached per body, `retry:false`. Send needs an exact, current preview with ≥1 recipient. | The live preview stays within 30/min, and the confirm count is always correct. |
| W16 | Two passes, two gates (see Endgame). Pass B starts only after Pass A is committed, so the shared files (`program/page.tsx`, the privacy pages if U-W1 is yes) are edited in sequence. | DECISIONS: "web ships as each part is reviewed". |
| W17 | Catch-up on every stream start and every `ready` (objection 1). | A4 / D-C17. |
| W18 | The Inbox rows in both account menus show `badge`. | The only unread signal outside /programs; shell.tsx is out of scope. |
| W19 | MemberPicker pins "You" first. | `GET /members` lists standard members only. |

**Escalated: U-W1.** Should the privacy pages also disclose the captured time zone and the opt-in reminders, digest and announcements?
- Recommended: yes.
- Default without an answer: no.

**Web-only divergences (platform idiom):**
- No push, no permission prompt, no app-icon badge, no channels, no `PUT /device`. Reminders and the digest land in the inbox, and the settings page says so.
- The composer is web-only (D-N16). The phones have no Announcements row.
- No pull-to-refresh; web uses Retry plus refetch on reconnect.
- The toast is web chrome.

## Shared client contract (the orchestrator copies this into N4/N5/S3/S4 before approval)

| Rule | Value |
|---|---|
| "+" badge | Server `badge` (C4) for every role, capped "99+" |
| "+" sheet | Tab picked at open: Inbox if badge > 0, else Create. The Inbox tab shows pending invites first ("Invitations"; global admins "All Invites" + Revoke), then "Notifications" |
| Opening the inbox | Mark all read once the first fresh page shows. Items that arrive while it is open are marked on arrival. Dots stay for what was new |
| Item tap / toast "View" | Mark that id read, then route by `target` (C2). Unknown target → inbox |
| Toast | "<title> · View". Only if `categories[item.category]` isn't false (missing or unknown → show). One at a time, 6 s, never over a modal or sheet |
| Stream catch-up | On every (re)start and every `ready`: unread count, inbox, active program, invites |
| Account menu order | My Profile · Inbox (count) · Notifications · Change Password · Appearance · Announcements (global admins, web only) · Privacy Policy · Sign Out |
| Settings | 5 switches, labels and hints from `NOTIFICATION_COPY.categories`, plus `optInNote`. The reminder time shows only when Reminders is on; default 19:00. Time-zone line. Web adds `webNote`; the phones show their OS permission row instead |
| People | `PEOPLE_COPY` strings:<br>• hidden row: "Activity hidden"<br>• hidden profile: "This member keeps their activity private."<br>• Open full stats per W6<br>• Manage membership: global admins only<br>• kudos 429: `kudosLimit` |
| Notice (U-1 b) | `noticeTitle` / `noticeBody` / `noticeKeep` / `noticeHide`. Device-local flag. On first People open; skipped if already hidden |

## Steps — backend / ios / android
None. Implement against N-SRV C1–C7 and People §A–§E only. Web never reads `/notifications/unacknowledged`.

## Steps — web, PASS A (notifications + composer)

All paths are under `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/`. Match anchors by the quoted text against HEAD (quick-wins `095d864` is committed).

**A1. `lib/api/client.ts`**
- (a) Replace the line `// never swapped, never refreshed. Every request: 15 s timeout, X-App-Platform / X-App-Version, a fresh X-Request-Id.` with:
```ts
// never swapped, never refreshed. Every request: 15 s timeout, X-App-Platform / X-App-Version, a fresh X-Request-Id and
// the browser's X-Time-Zone (notifications 0.6.0 C1 / D-N6 — reminders, the digest and local-time announcements).
```
- (b) Directly after the closing `}` of `export function uuid()`, insert:
```ts
/** The browser's IANA time zone (notifications 0.6.0 C1, D-N6); undefined when Intl can't tell (header omitted). */
export function browserTimeZone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === "string" && zone.length > 0 ? zone : undefined;
  } catch {
    return undefined;
  }
}
```
- (c) In `send()`:
  - After `const sentId = uuid();` add `const timeZone = browserTimeZone();`.
  - In `headers`, after `"X-Request-Id": sentId,` add `...(timeZone ? { "X-Time-Zone": timeZone } : {}),`.

**A2. `lib/api/notifications.ts`: replace the whole file.**
```ts
import { apiRequest } from "@/lib/api/client";

// The notification inbox + preferences API (notifications 0.6.0 contract C2–C4). Web is a Phase 4 client (C7): it reads
// the inbox and the ?inbox=1 stream, never the legacy pop-up feed (C7.3). Read = the acknowledged flag (D-N5), so
// reading here clears an item on every device. Errors are { error, code }; the status decides the kit kind.

export type NotificationCategory = "program" | "activity" | "reminders" | "digest" | "announcements";

/** C3 — a GET /inbox item and every ?inbox=1 stream frame. `target`: invites | program | programs | log_workout | inbox
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

export function fetchNotificationPreferences(token: string) {
  return apiRequest<NotificationPreferences>("/notifications/preferences", { token });
}

/** Partial PUT — only the fields sent change; answers the full preferences. */
export function updateNotificationPreferences(token: string, update: PreferencesUpdate) {
  return apiRequest<NotificationPreferences>("/notifications/preferences", { method: "PUT", token, body: update });
}

// Phase 4 shared client copy (W12 — the iOS / Android tracks mirror these strings; casing per surface idiom).
export const NOTIFICATION_COPY = {
  inbox: "Inbox",
  inboxSubtitle: "Invites and notifications",
  settingsRow: "Notifications",
  settingsRowSubtitle: "Choose what you're notified about",
  announcementsRow: "Announcements",
  announcementsRowSubtitle: "Send a message to members",
  invitationsHeading: "Invitations",
  allInvitesHeading: "All Invites",
  notificationsHeading: "Notifications",
  inboxLoading: "Loading notifications…",
  inboxEmptyTitle: "No notifications yet",
  inboxEmptyBody: "Program updates, kudos, reminders and announcements show up here.",
  unread: "Unread",
  loadMore: "Load more",
  loadingMore: "Loading…",
  toastView: "View",
  settingsTitle: "Notifications",
  settingsLoading: "Loading notification settings…",
  optInNote: "Reminders and the weekly digest stay off unless you turn them on.",
  reminderTime: "Reminder time",
  timeZone: (zone: string) => `Times use your time zone: ${zone}.`,
  webNote:
    "The web app doesn't send push alerts: here, notifications appear in your Inbox. For alerts on your phone, use the RaSi Fiters app.",
  categories: {
    program: {
      label: "Program & invites",
      hint: "Invites, role changes and program updates. When off, they still appear in your Inbox."
    },
    activity: { label: "Activity", hint: "Kudos from people in your programs." },
    reminders: {
      label: "Reminders",
      hint: "One reminder a day around your chosen time, only if you haven't logged a workout that day."
    },
    digest: { label: "Weekly digest", hint: "A recap of your past week, every Monday morning." },
    announcements: {
      label: "Announcements",
      hint: "Messages from the RaSi Fiters team. When off, they still appear in your Inbox."
    }
  } as Record<NotificationCategory, { label: string; hint: string }>
};
```

**A3. NEW `lib/notifications/queries.ts`**
```ts
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

// Notification query keys + hooks (notifications 0.6.0 C4). No member id in the keys: the sign-out teardown clears the
// whole QueryClient (auth-provider). The gate keeps the unread count + preferences cached app-wide; the stream's
// `ready` and every live item invalidate the unread count and the inbox.
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

/** C7.7: after an invite is accepted / declined, that program's unread invite items are marked read. */
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
```

**A4. NEW `lib/notifications/stream.ts`**
```ts
"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { forceSessionRefresh, freshSessionToken } from "@/lib/api/client";
import type { InboxItem } from "@/lib/api/notifications";
import { useOnlineStatus } from "@/lib/kit/use-online-status";

// The live notification stream (notifications SPEC §3.3; 0.6.0 C4 + C7.2): `?inbox=1` makes every
// `event: notification` frame a C3 inbox item, for every type (a plain stream carries only the legacy types).
// Reconnect values are identical on iOS + Android (A4): exponential backoff with full jitter (1 s base, x2, 30 s cap),
// reset on `ready`; a 60 s idle timeout (the server pings every 25 s); foreground only and paused while offline (the
// combined online value restarts it). Every close, error or 60 s of silence = reconnect with a fresh token (a deploy
// ends streams with a plain close; a 401 leaves EventSource CLOSED for good). EventSource hides the status, so after 3
// failed opens in a row one session refresh runs (rate-limited in client.ts). Re-created on every token change.
// onStart runs on every (re)start — tab visible again, back online, new token — even when the stream can't open;
// onReady on every `ready` (the stream never replays what was sent while it was down).
const SSE_BASE_DELAY_MS = 1_000;
const SSE_MAX_DELAY_MS = 30_000;
const SSE_IDLE_TIMEOUT_MS = 60_000;
const SSE_FAILURES_BEFORE_REFRESH = 3;

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

export function useNotificationStream({
  enabled,
  token,
  onStart,
  onReady,
  onItem
}: {
  enabled: boolean;
  token: string;
  onStart: () => void;
  onReady: () => void;
  onItem: (item: InboxItem) => void;
}): void {
  const visible = useDocumentVisible();
  const online = useOnlineStatus();
  const handlers = useRef({ onStart, onReady, onItem });
  handlers.current = { onStart, onReady, onItem };

  useEffect(() => {
    if (!enabled || !visible || !online) return;
    let cancelled = false;
    let attempt = 0;
    let failuresSinceReady = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let source: EventSource | null = null;

    const drop = (stream: EventSource) => {
      if (idleTimer) clearTimeout(idleTimer);
      stream.close();
      if (source === stream) source = null;
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      failuresSinceReady += 1;
      if (failuresSinceReady === SSE_FAILURES_BEFORE_REFRESH) void forceSessionRefresh().catch(() => undefined);
      const cap = Math.min(SSE_MAX_DELAY_MS, SSE_BASE_DELAY_MS * 2 ** attempt);
      attempt += 1;
      retryTimer = setTimeout(() => void connect(), Math.random() * cap);
    };

    // Any event (ready / ping / notification) proves the stream alive; 60 s without one = half-open → reconnect.
    const armIdle = (stream: EventSource) => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        drop(stream);
        scheduleReconnect();
      }, SSE_IDLE_TIMEOUT_MS);
    };

    async function connect() {
      const fresh = await freshSessionToken().catch(() => null);
      if (cancelled) return;
      if (!fresh) {
        scheduleReconnect();
        return;
      }
      const stream = new EventSource(
        `${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(fresh)}&inbox=1`
      );
      source = stream;
      armIdle(stream);
      stream.addEventListener("ready", () => {
        attempt = 0;
        failuresSinceReady = 0;
        armIdle(stream);
        handlers.current.onReady();
      });
      stream.addEventListener("ping", () => armIdle(stream));
      stream.addEventListener("notification", (event: MessageEvent<string>) => {
        armIdle(stream);
        try {
          const item = JSON.parse(event.data) as InboxItem;
          if (item?.id) handlers.current.onItem(item);
        } catch {
          // ignore a malformed frame
        }
      });
      stream.onerror = () => {
        drop(stream);
        scheduleReconnect();
      };
    }

    handlers.current.onStart();
    void connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (idleTimer) clearTimeout(idleTimer);
      source?.close();
    };
  }, [enabled, token, visible, online]);
}
```

**A5. NEW `lib/notifications/targets.ts`**
```ts
import type { InboxItem } from "@/lib/api/notifications";
import { fetchPrograms, type Program } from "@/lib/api/programs";
import { loadActiveProgram, saveActiveProgram, type ActiveProgram } from "@/lib/storage";
import { broadcastActiveProgramUpdate } from "@/lib/use-active-program";

// Where a notification opens (notifications 0.6.0 C2 targets) — the toast's View and an inbox row. Web has no push, so
// there is no cold-start tap. invites / inbox / anything unknown → the inbox ("+" sheet, Inbox tab).
export const OPEN_INBOX_EVENT = "rf:open-inbox";
export const INBOX_HREF = "/programs?open=inbox";

type Navigation = { push: (href: string) => void };

export function toActiveProgram(program: Program): ActiveProgram {
  return {
    id: program.id,
    name: program.name,
    status: program.status ?? null,
    start_date: program.start_date ?? null,
    end_date: program.end_date ?? null,
    my_role: program.my_role ?? null,
    my_status: program.my_status ?? null,
    admin_only_data_entry: program.admin_only_data_entry ?? false
  };
}

/** True for targets that land in the inbox itself (invites, inbox, or a value newer than this build). */
export function opensInbox(target: string): boolean {
  return target !== "program" && target !== "programs" && target !== "log_workout";
}

/** Opens the "+" sheet on its Inbox tab — in place when /programs is showing (a push to the same path doesn't remount). */
export function openInbox(router: Navigation): void {
  if (window.location.pathname === "/programs") {
    window.dispatchEvent(new Event(OPEN_INBOX_EVENT));
  } else {
    router.push(INBOX_HREF);
  }
}

async function openProgram(router: Navigation, token: string, programId: string | null): Promise<void> {
  if (!programId || !token) {
    router.push("/programs");
    return;
  }
  try {
    const program = (await fetchPrograms(token)).find((item) => item.id === programId);
    const status = program?.my_status?.toLowerCase() ?? null;
    if (!program || (status !== null && status !== "active")) {
      router.push("/programs");
      return;
    }
    saveActiveProgram(toActiveProgram(program));
    broadcastActiveProgramUpdate();
    router.push("/summary");
  } catch {
    router.push("/programs");
  }
}

export async function openNotificationTarget(
  item: Pick<InboxItem, "target" | "program_id">,
  router: Navigation,
  token: string
): Promise<void> {
  if (item.target === "program") return openProgram(router, token, item.program_id);
  if (item.target === "programs") return router.push("/programs");
  if (item.target === "log_workout") return router.push(loadActiveProgram()?.id ? "/summary/log-workout" : "/programs");
  openInbox(router);
}
```

**A6. NEW `components/notifications/NotificationToast.tsx`**
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { NOTIFICATION_COPY, type InboxItem } from "@/lib/api/notifications";
import { KIT_COPY } from "@/lib/kit/copy";

const TOAST_MS = 6_000;

/** True while any page modal / sheet / mobile select is open — they all set body.modal-open (components/ui/Modal.tsx,
 *  Select, SelectMobile). */
export function useBodyModalOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const body = document.body;
    const update = () => setOpen(body.classList.contains("modal-open"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return open;
}

// D-N3: the small floating toast that replaced the blocking pop-up — "<title> · View" (notifications 0.6.0 C7.5).
// The gate renders it OUTSIDE <main> (a z-10 stacking context), so its z-40 sits above every page element INCLUDING page
// modals — the gate therefore never shows it while a modal is open and drops it the moment one opens (W14).
// Top-centre under the safe area: never meets the bottom FloatingBanner, the bottom nav or the /programs FAB stack.
// One at a time (a newer item replaces it); closes itself after 6 s. Chrome = the kit banner's.
export function NotificationToast({
  item,
  onView,
  onDismiss
}: {
  item: InboxItem;
  onView: () => void;
  onDismiss: () => void;
}) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current(), TOAST_MS);
    return () => clearTimeout(timer);
  }, [item.id]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-40 flex min-h-[52px] w-[min(92vw,520px)] -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-rf-border bg-rf-surface py-1 pl-4 pr-1 text-sm text-rf-text shadow-rf-pill"
    >
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-rf-accent" />
      <p className="min-w-0 flex-1 truncate py-1.5 font-semibold">{item.title}</p>
      <button
        type="button"
        onClick={onView}
        className="h-11 shrink-0 rounded-full px-3 font-semibold text-rf-accent transition hover:text-rf-accent-strong"
      >
        {NOTIFICATION_COPY.toastView}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={KIT_COPY.dismiss}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg leading-none text-rf-text-muted transition hover:text-rf-text"
      >
        ×
      </button>
    </div>
  );
}
```

**A7. NEW `components/notifications/InboxList.tsx`**
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NOTIFICATION_COPY, type InboxItem, type UnreadCounts } from "@/lib/api/notifications";
import { NOTIFICATION_KEYS, useInboxQuery, useMarkRead } from "@/lib/notifications/queries";
import { appError } from "@/lib/kit/app-error";
import { fromQuery, retryNow } from "@/lib/kit/async-state";
import { KIT_COPY } from "@/lib/kit/copy";
import { useOnlineStatus } from "@/lib/kit/use-online-status";
import { ErrorView } from "@/components/kit/ErrorView";

const formatWhen = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

// The inbox (D-N4) under the pending invites in the "+" sheet: newest first, 90 days, "Load more" by next_cursor.
// D-N5 / W9: once the first FRESH page is on screen, everything is marked read with one { all: true } (the read flag is
// the legacy acknowledged flag, so it clears on every device); an item that arrives while it is open is marked read on
// arrival. Dots keep showing what was new for as long as it stays open. Kit states: loading line, ErrorView + Retry
// (offline swap, like the invites above it), an inline "Couldn't refresh" + Retry over kept items while online — offline,
// the global banner (drawn above page modals) says it.
export function InboxList({ token, onOpenItem }: { token: string; onOpenItem: (item: InboxItem) => void }) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const inboxQuery = useInboxQuery(token);
  const markRead = useMarkRead(token);
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());
  const markedAll = useRef(false);
  const state = fromQuery(inboxQuery);
  const items = inboxQuery.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    if (!inboxQuery.data || inboxQuery.isFetching || inboxQuery.isError) return;
    const unreadIds = items.filter((item) => item.read_at === null).map((item) => item.id);
    if (!markedAll.current) {
      markedAll.current = true;
      setNewIds(new Set(unreadIds));
      const unreadCount = queryClient.getQueryData<UnreadCounts>(NOTIFICATION_KEYS.unread)?.unread ?? 0;
      if (unreadIds.length > 0 || unreadCount > 0) markRead.mutate("all");
      return;
    }
    if (unreadIds.length > 0) {
      setNewIds((previous) => new Set([...previous, ...unreadIds]));
      markRead.mutate(unreadIds.slice(0, 100));
    }
  }, [inboxQuery.data, inboxQuery.isFetching, inboxQuery.isError]);

  const open = (item: InboxItem) => {
    if (item.read_at === null) markRead.mutate([item.id]);
    onOpenItem(item);
  };

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-rf-text-muted">
        {NOTIFICATION_COPY.notificationsHeading}
      </h3>
      {state.status === "loading" && (
        <p className="py-4 text-center text-sm text-rf-text-muted">{NOTIFICATION_COPY.inboxLoading}</p>
      )}
      {state.status === "failed" && (
        <ErrorView
          error={online ? state.error : appError("offline")}
          onRetry={() => void retryNow(queryClient, NOTIFICATION_KEYS.inbox)}
        />
      )}
      {state.status === "stale" && online && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-rf-surface-muted px-4 py-1 text-sm font-semibold text-rf-text-muted">
          <span className="py-2">{KIT_COPY.bannerStale}</span>
          <button
            type="button"
            onClick={() => void inboxQuery.refetch()}
            className="h-11 shrink-0 rounded-full px-3 text-rf-accent"
          >
            {KIT_COPY.retry}
          </button>
        </div>
      )}
      {(state.status === "loaded" || state.status === "stale") && items.length === 0 && (
        <div className="rounded-2xl bg-rf-surface-muted px-6 py-8 text-center">
          <p className="text-base font-semibold text-rf-text">{NOTIFICATION_COPY.inboxEmptyTitle}</p>
          <p className="mt-2 text-sm text-rf-text-muted">{NOTIFICATION_COPY.inboxEmptyBody}</p>
        </div>
      )}
      {items.map((item) => {
        const unread = item.read_at === null || newIds.has(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => open(item)}
            className="flex w-full items-start gap-3 rounded-2xl border border-rf-border bg-rf-surface p-4 text-left transition hover:border-rf-accent/60"
          >
            <span
              aria-hidden="true"
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-rf-accent" : "bg-transparent"}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-semibold text-rf-text">{item.title}</span>
              {item.body && <span className="mt-1 block break-words text-sm text-rf-text-muted">{item.body}</span>}
              <span className="mt-1 block text-xs text-rf-text-muted">{formatWhen(item.created_at)}</span>
            </span>
            {unread && <span className="sr-only">{NOTIFICATION_COPY.unread}</span>}
          </button>
        );
      })}
      {inboxQuery.hasNextPage && (
        <button
          type="button"
          disabled={inboxQuery.isFetchingNextPage}
          onClick={() => void inboxQuery.fetchNextPage()}
          className="pill-button w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {inboxQuery.isFetchingNextPage ? NOTIFICATION_COPY.loadingMore : NOTIFICATION_COPY.loadMore}
        </button>
      )}
    </section>
  );
}
```

**A8. `components/NotificationsGate.tsx`: replace the whole file.** The mount in `app/shell.tsx` is unchanged.
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-provider";
import type { InboxItem } from "@/lib/api/notifications";
import { fetchPrograms } from "@/lib/api/programs";
import { clearActiveProgram, loadActiveProgram, saveActiveProgram } from "@/lib/storage";
import { broadcastActiveProgramUpdate } from "@/lib/use-active-program";
import { NOTIFICATION_KEYS, useMarkRead, usePreferencesQuery, useUnreadCount } from "@/lib/notifications/queries";
import { useNotificationStream } from "@/lib/notifications/stream";
import { openNotificationTarget, toActiveProgram } from "@/lib/notifications/targets";
import { NotificationToast, useBodyModalOpen } from "@/components/notifications/NotificationToast";

// The app-wide notification gate (notifications SPEC §3.3 + 0.6.0 C7; mounted once in app/shell.tsx). D-N3: the
// blocking one-at-a-time pop-up queue is gone — a live inbox item (the ?inbox=1 stream) refreshes the queries it
// affects, updates the unread badge + the inbox, and shows a small toast ("<title> · View") when the member has its
// category on (C7.5) and no modal is open (W14). The legacy pop-up feed is never read (C7.3); the inbox is ("+" sheet,
// D-N4). A4 / D-C17 catch-up (W17): the stream never replays and pauses while the tab is hidden, so on every (re)start
// and every `ready` the stored active program + the invites are re-read. D-C6: never on the pre-auth routes.
const AUTH_ROUTES = ["/login", "/create-account", "/splash", "/forgot-password", "/reset-password"];
const MEMBERSHIP_TYPES = new Set([
  "program.role_changed",
  "program.member_removed",
  "program.member_left",
  "program.member_joined",
  "program.admin_transferred",
  "program.updated",
  "program.deleted"
]);
// The stored-program fields role-gated UI reads; a change in any of them re-reads the role-dependent queries.
const PROGRAM_FIELDS = ["name", "status", "start_date", "end_date", "my_role", "my_status", "admin_only_data_entry"] as const;
const CATCH_UP_GAP_MS = 5_000; // start and ready arrive together: one catch-up

export function NotificationsGate() {
  const { session, isBootstrapping } = useAuth();
  const token = session?.token ?? "";
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<InboxItem | null>(null);
  const modalOpen = useBodyModalOpen();
  const lastCatchUp = useRef(0);
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname?.startsWith(route));
  const shouldRun = !!token && !isBootstrapping && !isAuthRoute;

  // Cached app-wide: the badge count and the preferences the toast rule reads (that GET also stores the browser's time
  // zone server-side — D-N6).
  useUnreadCount(token, shouldRun);
  const preferences = usePreferencesQuery(token, shouldRun);
  const markRead = useMarkRead(token);

  // Nothing of a previous session survives sign-out; a toast never sits over a modal.
  useEffect(() => {
    if (!shouldRun || modalOpen) setToast(null);
  }, [shouldRun, modalOpen]);

  /** Re-reads the stored active program; true when it is gone or a role-relevant field changed. */
  const refreshActiveProgram = async (): Promise<boolean> => {
    const current = loadActiveProgram();
    if (!current || !token) return false;
    try {
      const updated = (await fetchPrograms(token)).find((program) => program.id === current.id);
      if (!updated) {
        clearActiveProgram();
        broadcastActiveProgramUpdate();
        return true;
      }
      const next = toActiveProgram(updated);
      saveActiveProgram(next);
      const changed = PROGRAM_FIELDS.some((key) => (next[key] ?? null) !== (current[key] ?? null));
      if (changed) broadcastActiveProgramUpdate();
      return changed;
    } catch {
      return false; // the next catch-up / item retries
    }
  };

  const refreshRoleQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ["program"] });
    await queryClient.invalidateQueries({ queryKey: ["members"] });
    await queryClient.invalidateQueries({ queryKey: ["people"] });
    await queryClient.invalidateQueries({ queryKey: ["summary"] });
    await queryClient.invalidateQueries({ queryKey: ["lifestyle"] });
  };

  // D-C2 / D-C7: every key below lands on a live query (the broad ["program"] covers the roles cache).
  const refreshQueriesFor = async (item: InboxItem) => {
    const programId = loadActiveProgram()?.id ?? "";
    await queryClient.invalidateQueries({ queryKey: ["programs"] });
    if (programId) {
      await queryClient.invalidateQueries({ queryKey: ["program", "membership-details", programId] });
      await queryClient.invalidateQueries({ queryKey: ["members", "list", programId] });
      await queryClient.invalidateQueries({ queryKey: ["program", "workouts", programId] });
      await queryClient.invalidateQueries({ queryKey: ["members", "metrics", programId, "preview"] });
    }
    if (item.type === "program.invite_received") await queryClient.invalidateQueries({ queryKey: ["invites"] });
    if (item.type === "activity.kudos_received") await queryClient.invalidateQueries({ queryKey: ["people"] });
    if (MEMBERSHIP_TYPES.has(item.type)) {
      await refreshRoleQueries();
      await refreshActiveProgram();
    }
  };

  const refreshInbox = () => {
    void queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.unread });
    void queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.inbox });
  };

  // W17: a role change / removal / invite that landed while the stream was down (tab hidden, offline, deploy).
  const catchUp = () => {
    if (Date.now() - lastCatchUp.current < CATCH_UP_GAP_MS) return;
    lastCatchUp.current = Date.now();
    void queryClient.invalidateQueries({ queryKey: ["programs"] });
    void queryClient.invalidateQueries({ queryKey: ["invites"] });
    void refreshActiveProgram().then((changed) => {
      if (changed) void refreshRoleQueries();
    });
  };

  useNotificationStream({
    enabled: shouldRun,
    token,
    onStart: catchUp,
    onReady: () => {
      refreshInbox();
      catchUp();
    },
    onItem: (item) => {
      refreshInbox();
      void refreshQueriesFor(item);
      const categoryOn = preferences.data?.categories[item.category] !== false;
      if (categoryOn && !document.body.classList.contains("modal-open")) setToast(item);
    }
  });

  if (!shouldRun || !toast) return null;
  return (
    <NotificationToast
      item={toast}
      onDismiss={() => setToast(null)}
      onView={() => {
        setToast(null);
        if (toast.read_at === null) markRead.mutate([toast.id]);
        void openNotificationTarget(toast, router, token);
      }}
    />
  );
}
```

**A9.** `git rm apps/web/src/components/NotificationModal.tsx`. Its only importer was the old gate.

**A10. NEW `components/ui/Switch.tsx`**
```tsx
"use client";

import { cn } from "@/lib/utils";

// Accessible on/off switch (role="switch" + aria-checked) — the web idiom for iOS Toggle / Android Switch. The whole
// 44px button is the tap target; the label lives next to it (aria-labelledby) or in `label`.
export function Switch({
  checked,
  onChange,
  disabled,
  labelledBy,
  label
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  labelledBy?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-7 w-12 items-center rounded-full p-0.5 transition-colors",
          checked ? "bg-rf-accent" : "bg-rf-border"
        )}
      >
        <span
          className={cn(
            "h-6 w-6 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </span>
    </button>
  );
}
```

**A11. NEW `app/program/notifications/page.tsx`**
```tsx
"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { browserTimeZone } from "@/lib/api/client";
import { NOTIFICATION_CATEGORIES, NOTIFICATION_COPY, type NotificationCategory } from "@/lib/api/notifications";
import { NOTIFICATION_KEYS, usePreferencesQuery, useUpdatePreferences } from "@/lib/notifications/queries";
import { appError, toAppError } from "@/lib/kit/app-error";
import { fromQuery, retryNow } from "@/lib/kit/async-state";
import { useOnlineStatus, useRefetchOnReconnect } from "@/lib/kit/use-online-status";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { Switch } from "@/components/ui/Switch";
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Notifications settings (notifications 0.6.0 C4 /preferences; D-N2, D-N7, D-N10): one switch per category, the daily
// reminder time (default 19:00), honest opt-in wording for Reminders + the weekly digest (App Store 4.5.4, D-N7). Each
// change is a partial PUT with an optimistic flip. Web has no push — the page says where things land instead.
export default function NotificationSettingsPage() {
  const queryClient = useQueryClient();
  const { program, token } = useAuthGuard({ requireProgram: false });
  const online = useOnlineStatus();
  const preferencesQuery = usePreferencesQuery(token);
  const update = useUpdatePreferences(token);
  useRefetchOnReconnect([preferencesQuery]);
  const state = fromQuery(preferencesQuery);
  const preferences = preferencesQuery.data;
  const [time, setTime] = useState("");

  useEffect(() => {
    if (preferences?.reminder_time) setTime(preferences.reminder_time);
  }, [preferences?.reminder_time]);

  const toggle = (category: NotificationCategory, next: boolean) =>
    update.mutate({ categories: { [category]: next } as Partial<Record<NotificationCategory, boolean>> });

  const saveTime = () => {
    if (preferences && TIME_RE.test(time) && time !== preferences.reminder_time) {
      update.mutate({ reminder_time: time });
    }
  };

  return (
    <PageShell maxWidth="3xl">
      <PageHeader title={NOTIFICATION_COPY.settingsTitle} backHref={program?.id ? "/program" : "/programs"} />

      {state.status === "loading" && <LoadingState message={NOTIFICATION_COPY.settingsLoading} />}
      {state.status === "failed" && (
        <ErrorView
          error={online ? state.error : appError("offline")}
          onRetry={() => void retryNow(queryClient, NOTIFICATION_KEYS.preferences)}
        />
      )}

      {preferences && (
        <GlassCard padding="lg" className="space-y-4">
          <p className="text-sm text-rf-text-muted">{NOTIFICATION_COPY.optInNote}</p>
          <div className="divide-y divide-rf-border">
            {NOTIFICATION_CATEGORIES.map((category) => {
              const copy = NOTIFICATION_COPY.categories[category];
              const on = preferences.categories[category];
              return (
                <div key={category} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p id={`notify-${category}`} className="text-sm font-semibold text-rf-text">
                        {copy.label}
                      </p>
                      <p className="mt-1 text-xs text-rf-text-muted">{copy.hint}</p>
                    </div>
                    <Switch checked={on} labelledBy={`notify-${category}`} onChange={(next) => toggle(category, next)} />
                  </div>
                  {category === "reminders" && on && (
                    <label className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm font-semibold text-rf-text">
                      {NOTIFICATION_COPY.reminderTime}
                      <input
                        type="time"
                        value={time}
                        onChange={(event) => setTime(event.target.value)}
                        onBlur={saveTime}
                        className="input-shell rounded-2xl px-4 py-2 text-sm font-medium"
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          {update.isError && (
            <p className="text-sm font-semibold text-rf-danger">{toAppError(update.error).message}</p>
          )}
          <p className="text-xs text-rf-text-muted">
            {NOTIFICATION_COPY.timeZone(preferences.time_zone ?? browserTimeZone() ?? "UTC")}
          </p>
          <p className="text-xs text-rf-text-muted">{NOTIFICATION_COPY.webNote}</p>
        </GlassCard>
      )}

      {state.status === "stale" && online && (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="stale" onRetry={() => void preferencesQuery.refetch()} />
        </>
      )}
    </PageShell>
  );
}
```

**A12. `app/programs/page.tsx` (wiring only)**
- (a) Replace `import { IconUser, IconLock, IconPalette, IconDocument, IconLogout, SearchIcon } from "@/components/icons";` with `import { IconUser, IconLock, IconPalette, IconDocument, IconLogout, IconMail, IconSettings, IconUsers, SearchIcon } from "@/components/icons";`.
- (b) After `import { cachedQueryFn, useLaunchSeed } from "@/lib/cache/launch-cache";`, insert:
```ts
import { useClientSearchParams } from "@/lib/use-client-search-params";
import { NOTIFICATION_COPY } from "@/lib/api/notifications";
import { markInviteItemsRead, useUnreadCount } from "@/lib/notifications/queries";
import { OPEN_INBOX_EVENT, openNotificationTarget, opensInbox } from "@/lib/notifications/targets";
import { InboxList } from "@/components/notifications/InboxList";
```
- (c) Replace `const [actionsTab, setActionsTab] = useState<"invites" | "create">("invites");` with `const [actionsTab, setActionsTab] = useState<"inbox" | "create">("inbox");`.
- (d) Directly after the `invitesQuery` `useQuery({ … });` block (the one keyed `["invites", isGlobalAdmin]`), insert:
```ts
  // D-N4 / W4: the "+" badge = the server's count (notifications 0.6.0 C4 `badge`: unread notifications other than invite
  // items + pending invites) for every role — global admins included (was: every pending invite in the system). Until it
  // loads (or if it fails) a member falls back to their pending-invite count — today's badge.
  const unreadQuery = useUnreadCount(token);
  const badge = unreadQuery.data?.badge ?? (isGlobalAdmin ? 0 : invitesQuery.data?.length ?? 0);
  const searchParams = useClientSearchParams();
```
- (e) Replace the whole `const respondInviteMutation = useMutation({ … });` block with:
```ts
  const respondInviteMutation = useMutation({
    mutationFn: (payload: {
      inviteId: string;
      action: "accept" | "decline" | "revoke";
      blockFuture?: boolean;
      /** The invite's program — its unread invite items are marked read after an accept / decline (C7.7). */
      programId?: string;
    }) => {
      if (!token) {
        return Promise.reject(new Error("Missing session."));
      }
      return respondToInvite(token, {
        invite_id: payload.inviteId,
        action: payload.action,
        block_future: payload.blockFuture
      });
    },
    // invites §3.1 (A10): a failed accept / decline / revoke shows the kit message; cleared on the next attempt.
    onMutate: () => setRespondError(null),
    onError: (error) => setRespondError(toAppError(error).message),
    onSettled: async (_data, error, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["invites", isGlobalAdmin] });
      if (!error && variables.action === "accept") {
        await queryClient.invalidateQueries({ queryKey: ["programs"] });
      }
      // notifications 0.6.0 C7.7: the answered invite's unread items are marked read; the badge's pending count drops.
      if (!error && variables.action !== "revoke" && variables.programId) {
        await markInviteItemsRead(queryClient, token, variables.programId);
      }
    }
  });
```
- (f) Replace `const pendingInvitesCount = invitesQuery.data?.length ?? 0;` and the following `useEffect(() => { if (showActions) { setActionsTab(…); } }, [showActions, pendingInvitesCount]);` with:
```ts
  // D-N4 / W13: the sheet opens on the Inbox when something is waiting (badge > 0), else on Create — picked when it
  // opens, never while it's open (reading the inbox lowers the badge). `?open=inbox` (notification targets, the Program
  // tab's Inbox row) and OPEN_INBOX_EVENT (a toast's View while this page shows) open it on the Inbox.
  const openActions = (tab?: "inbox" | "create") => {
    setRespondError(null);
    setActionsTab(tab ?? (badge > 0 ? "inbox" : "create"));
    setShowActions(true);
  };

  useEffect(() => {
    if (searchParams.get("open") !== "inbox") return;
    openActions("inbox");
    router.replace("/programs");
  }, [searchParams]);

  useEffect(() => {
    const openInboxHere = () => openActions("inbox");
    window.addEventListener(OPEN_INBOX_EVENT, openInboxHere);
    return () => window.removeEventListener(OPEN_INBOX_EVENT, openInboxHere);
  }, []);
```
- (g) Replace the whole `const renderAddButton = () => ( … );` with:
```tsx
  const renderAddButton = () => (
    <button
      type="button"
      onClick={() => openActions()}
      className="fab-button relative flex h-12 w-12 items-center justify-center rounded-full shadow-rf-pill"
      aria-label={badge > 0 ? `Program actions, ${badge} waiting` : "Program actions"}
    >
      <span className="text-xl font-semibold">+</span>
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rf-danger px-1 text-[11px] font-semibold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
```
- (h) Replace the `<TabButton active={actionsTab === "invites"} … label={isGlobalAdmin ? "All Invites" : "My Invites"} />` element with:
```tsx
            <TabButton
              active={actionsTab === "inbox"}
              onClick={() => setActionsTab("inbox")}
              label={NOTIFICATION_COPY.inbox}
            />
```
- (i) Replace from `{actionsTab === "invites" ? (` through the closing `/>` of that `<InvitesTab` (the line before `) : (`) with:
```tsx
            {actionsTab === "inbox" ? (
              <div className="space-y-6">
                <InvitesTab
                  invites={invitesQuery.data ?? []}
                  isLoading={invitesState.status === "loading"}
                  isGlobalAdmin={isGlobalAdmin}
                  error={invitesState.status === "failed" ? (online ? invitesState.error : appError("offline")) : null}
                  onRetry={() => void retryNow(queryClient, ["invites", isGlobalAdmin])}
                  respondError={respondError}
                  onAccept={async (invite) => {
                    try {
                      await respondInviteMutation.mutateAsync({
                        inviteId: invite.invite_id,
                        action: "accept",
                        programId: invite.program_id
                      });
                      setShowActions(false);
                    } catch {
                      // keep modal open on error
                    }
                  }}
                  onDecline={(invite) => {
                    setRespondError(null);
                    setDeclineInviteTarget(invite);
                    setBlockFutureInvites(false);
                  }}
                  onRevoke={(invite) =>
                    respondInviteMutation.mutate({ inviteId: invite.invite_id, action: "revoke" })
                  }
                />
                {/* D-N4: the inbox under the pending invites; a row whose target is the inbox itself stays here. */}
                <InboxList
                  token={token}
                  onOpenItem={(item) => {
                    if (opensInbox(item.target)) return;
                    setShowActions(false);
                    void openNotificationTarget(item, router, token);
                  }}
                />
              </div>
```
- (j) In the decline modal, change the `mutateAsync({ inviteId: declineInviteTarget.invite_id, action: "decline", blockFuture: blockFutureInvites })` object to:
```ts
                  await respondInviteMutation.mutateAsync({
                    inviteId: declineInviteTarget.invite_id,
                    action: "decline",
                    blockFuture: blockFutureInvites,
                    programId: declineInviteTarget.program_id
                  });
```
- (k) Account modal.
  - After the `<AccountRow title="My Profile" … />` element, insert:
```tsx
            <AccountRow
              title={NOTIFICATION_COPY.inbox}
              subtitle={NOTIFICATION_COPY.inboxSubtitle}
              icon={<IconMail className="h-5 w-5" />}
              count={badge}
              onClick={() => {
                setShowAccount(false);
                openActions("inbox");
              }}
            />
            <AccountRow
              title={NOTIFICATION_COPY.settingsRow}
              subtitle={NOTIFICATION_COPY.settingsRowSubtitle}
              icon={<IconSettings className="h-5 w-5" />}
              onClick={() => {
                setShowAccount(false);
                router.push("/program/notifications");
              }}
            />
```
  - After the `<AccountRow title="Appearance" … />` element, insert:
```tsx
            {isGlobalAdmin && (
              <AccountRow
                title={NOTIFICATION_COPY.announcementsRow}
                subtitle={NOTIFICATION_COPY.announcementsRowSubtitle}
                icon={<IconUsers className="h-5 w-5" />}
                onClick={() => {
                  setShowAccount(false);
                  router.push("/program/announcements");
                }}
              />
            )}
```
- (l) `function InvitesTab`:
  - Replace the whole `if (invites.length === 0) { return ( <div className="space-y-3"> … </div> ); }` block with:
```tsx
  // D-N4: inside the Inbox an empty invite list renders nothing (the notifications' own empty state follows).
  if (invites.length === 0) return respondLine;
```
  - In the global-admin branch, directly after `<div className="space-y-6">`, insert:
```tsx
        <h3 className="text-xs font-semibold uppercase tracking-wide text-rf-text-muted">{NOTIFICATION_COPY.allInvitesHeading}</h3>
```
  - In the final (member) branch, directly after `<div className="space-y-3">`, insert:
```tsx
      <h3 className="text-xs font-semibold uppercase tracking-wide text-rf-text-muted">{NOTIFICATION_COPY.invitationsHeading}</h3>
```
- (m) `function AccountRow`:
  - Change the destructure to `tone = "default",\n  count` and the props type to add `count?: number;`.
  - Directly before `<span className={isDanger ? "text-rf-danger" : "text-rf-text-muted"}>›</span>`, insert:
```tsx
      {count ? (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rf-danger px-1.5 text-[11px] font-semibold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
```

**A13. `app/program/page.tsx`**
- (a) After `import { toAppError } from "@/lib/kit/app-error";`, insert:
```ts
import { NOTIFICATION_COPY } from "@/lib/api/notifications";
import { useUnreadCount } from "@/lib/notifications/queries";
import { INBOX_HREF } from "@/lib/notifications/targets";
```
- (b) In `ProgramPage`, after `const { signOut } = useAuth();`, insert `const inboxBadge = useUnreadCount(token).data?.badge ?? 0; // W18`.
- (c) Replace both `<MyAccountSection onSignOut={signOut} />` with `<MyAccountSection onSignOut={signOut} isGlobalAdmin={isGlobalAdmin} inboxBadge={inboxBadge} />`.
- (d) Replace `function MyAccountSection({ onSignOut }: { onSignOut: () => Promise<void> }) {` with:
```tsx
function MyAccountSection({
  onSignOut,
  isGlobalAdmin,
  inboxBadge
}: {
  onSignOut: () => Promise<void>;
  isGlobalAdmin: boolean;
  inboxBadge: number;
}) {
```
- (e) Inside it, directly after the `</button>` that closes the `<p>My Profile</p>` button, insert:
```tsx
        <AccountLinkRow
          title={NOTIFICATION_COPY.inbox}
          subtitle={NOTIFICATION_COPY.inboxSubtitle}
          icon={<IconMail className="h-5 w-5" />}
          iconClass="bg-blue-100 text-blue-600"
          count={inboxBadge}
          onClick={() => router.push(INBOX_HREF)}
        />
        <AccountLinkRow
          title={NOTIFICATION_COPY.settingsRow}
          subtitle={NOTIFICATION_COPY.settingsRowSubtitle}
          icon={<IconSettings className="h-5 w-5" />}
          iconClass="bg-emerald-100 text-emerald-600"
          onClick={() => router.push("/program/notifications")}
        />
```
- (f) Directly after the `</button>` that closes the `<p>Appearance</p>` button, insert:
```tsx
        {isGlobalAdmin && (
          <AccountLinkRow
            title={NOTIFICATION_COPY.announcementsRow}
            subtitle={NOTIFICATION_COPY.announcementsRowSubtitle}
            icon={<IconUsers className="h-5 w-5" />}
            iconClass="bg-amber-100 text-amber-600"
            onClick={() => router.push("/program/announcements")}
          />
        )}
```
- (g) Append at the end of the file:
```tsx
function AccountLinkRow({
  title,
  subtitle,
  icon,
  iconClass,
  count,
  onClick
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconClass: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl border border-rf-border bg-rf-surface-muted px-4 py-3 text-left text-sm font-semibold text-rf-text shadow-sm transition hover:border-rf-text"
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${iconClass}`}>{icon}</span>
      <div>
        <p>{title}</p>
        <p className="text-xs text-rf-text-muted">{subtitle}</p>
      </div>
      {count ? (
        <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rf-danger px-1.5 text-[11px] font-semibold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
      <span className={`${count ? "" : "ml-auto "}text-rf-text-muted`}>›</span>
    </button>
  );
}
```

**A14. NEW `lib/api/announcements.ts`**
```ts
import { apiRequest } from "@/lib/api/client";

// The announcement composer API (notifications 0.6.0 C4, D-N16) — global admins only. Errors are { error, code }; the
// status decides the kit kind (a 400 shows the server's own text). Also the member directory for "chosen members"
// (GET /members — the full directory for global admins, members D-C3; standard members only).

export type TargetKind = "program" | "members" | "everyone";
export type MergeField = "first_name" | "streak" | "program_name";
export type DeliveryMode = "now" | "local";
export type AnnouncementTarget =
  | { kind: "program"; program_id: string }
  | { kind: "members"; member_ids: string[] }
  | { kind: "everyone" };
export type AnnouncementDelivery = { mode: "now" } | { mode: "local"; date: string; time: string };
export type AnnouncementRequest = {
  target: AnnouncementTarget;
  title: string;
  body: string;
  delivery: AnnouncementDelivery;
};
export type AnnouncementPreview = {
  recipient_count: number;
  sample: { member_id: string; first_name: string; title: string; body: string } | null;
};
export type AnnouncementStatus = "scheduled" | "sending" | "sent" | "cancelled";
export type AnnouncementSummary = {
  id: string;
  created_at: string;
  sender_member_id: string | null;
  sender_name: string | null;
  target_kind: TargetKind;
  target_program_id: string | null;
  target_program_name: string | null;
  title: string;
  body: string;
  mode: DeliveryMode;
  send_date: string | null;
  send_time: string | null;
  status: AnnouncementStatus;
  recipient_count: number;
  sent_count: number;
  completed_at: string | null;
};
export type DirectoryMember = { id: string; member_name: string; username?: string; status?: string };

export const MERGE_FIELDS: MergeField[] = ["first_name", "streak", "program_name"];
export const TITLE_MAX = 100;
export const BODY_MAX = 500;
export const MEMBERS_MAX = 200;
export const SCHEDULE_MAX_DAYS = 30;

export const ANNOUNCEMENT_KEYS = {
  list: ["announcements", "list"] as const,
  preview: ["announcements", "preview"] as const,
  directory: ["announcements", "directory"] as const
};

const pad = (value: number) => String(value).padStart(2, "0");

/** "YYYY-MM-DD" of the browser's local today + `offsetDays` (the server checks the same range in X-Time-Zone). */
export function localDate(offsetDays: number): string {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** The browser's local "HH:MM" now. */
export function localTimeNow(): string {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** Puts `tag` over [start, end) of `value`, capped at `max`; returns the text and the caret after the tag. */
export function insertAt(value: string, start: number, end: number, tag: string, max: number) {
  const text = `${value.slice(0, start)}${tag}${value.slice(end)}`.slice(0, max);
  return { text, caret: Math.min(start + tag.length, text.length) };
}

export type ComposerFields = {
  targetKind: TargetKind;
  programId: string;
  memberIds: string[];
  title: string;
  body: string;
  mode: DeliveryMode;
  date: string;
  time: string;
};

/** The request body, or null while the form is incomplete (Send disabled, no preview). */
export function buildAnnouncementRequest(fields: ComposerFields): AnnouncementRequest | null {
  const title = fields.title.trim();
  const body = fields.body.trim();
  if (!title || !body || title.length > TITLE_MAX || body.length > BODY_MAX) return null;
  let target: AnnouncementTarget;
  if (fields.targetKind === "program") {
    if (!fields.programId) return null;
    target = { kind: "program", program_id: fields.programId };
  } else if (fields.targetKind === "members") {
    if (fields.memberIds.length === 0) return null;
    target = { kind: "members", member_ids: fields.memberIds };
  } else {
    target = { kind: "everyone" };
  }
  if (fields.mode === "local" && (!fields.date || !fields.time)) return null;
  const delivery: AnnouncementDelivery =
    fields.mode === "now" ? { mode: "now" } : { mode: "local", date: fields.date, time: fields.time };
  return { target, title, body, delivery };
}

export function listAnnouncements(token: string) {
  return apiRequest<{ announcements: AnnouncementSummary[] }>("/notifications/announcements", { token });
}

export function previewAnnouncement(token: string, request: AnnouncementRequest) {
  return apiRequest<AnnouncementPreview>("/notifications/announcements/preview", {
    method: "POST",
    token,
    body: { ...request }
  });
}

export function sendAnnouncement(token: string, request: AnnouncementRequest) {
  return apiRequest<AnnouncementSummary>("/notifications/announcements", { method: "POST", token, body: { ...request } });
}

export function cancelAnnouncement(token: string, id: string) {
  return apiRequest<{ id: string; status: "cancelled" }>(
    `/notifications/announcements/${encodeURIComponent(id)}/cancel`,
    { method: "POST", token }
  );
}

export function fetchMemberDirectory(token: string) {
  return apiRequest<DirectoryMember[]>("/members", { token });
}

const members = (count: number) => `${count} ${count === 1 ? "member" : "members"}`;

/** Who the confirm names (W15): the target kind + the exact previewed count. */
export function audienceText(kind: TargetKind, count: number, programName: string | null): string {
  if (kind === "everyone") return `every active member (${members(count)}, including you)`;
  if (kind === "program") return `everyone in ${programName ?? "the program"} (${members(count)})`;
  return `the ${members(count)} you chose`;
}

export const ANNOUNCEMENT_COPY = {
  title: "Announcements",
  subtitle: "Send a message to members",
  composeTitle: "New announcement",
  targetLabel: "Send to",
  targets: { program: "Program", members: "Members", everyone: "Everyone" } as Record<TargetKind, string>,
  chooseProgram: "Choose a program",
  everyoneHint: "Every active member, including you.",
  you: "You",
  titleLabel: "Title",
  titlePlaceholder: "e.g. Week 3, {first_name}!",
  bodyLabel: "Message",
  bodyPlaceholder: "Write your message",
  personalize: "Personalize:",
  mergeLabels: { first_name: "First name", streak: "Streak", program_name: "Program name" } as Record<MergeField, string>,
  personalizeHint:
    "Each person sees their own first name and current workout streak. Program name works when you send to a program.",
  whenLabel: "When",
  modes: { now: "Now", local: "Local time" } as Record<DeliveryMode, string>,
  dateLabel: "Date",
  timeLabel: "Time",
  localHint:
    "Each person gets it at this time in their own time zone (yours if theirs isn't known yet), within about 15 minutes. Anyone already past that time gets it at the next send.",
  pastTime: "That time has already passed today for you, so it goes out within about 15 minutes.",
  previewLabel: "Preview",
  previewIncomplete: "Choose who to send to and write a title and message to see a preview.",
  previewLoading: "Updating preview…",
  reach: (count: number) => `Reaches ${members(count)}.`,
  sampleFor: (name: string) => `What ${name} will see:`,
  sendNow: "Send now",
  schedule: "Schedule",
  sending: "Sending…",
  confirmTitle: "Send this announcement?",
  confirmBody: (audience: string, mode: DeliveryMode, date: string, time: string) =>
    mode === "now"
      ? `It goes to ${audience} right away and lands in their Inbox. This can't be undone.`
      : `It goes to ${audience} on ${date} at ${time}, in each person's time zone. You can cancel it under Recent announcements until it's sent.`,
  sent: (count: number) => `Sent to ${members(count)}.`,
  scheduled: (date: string, time: string, count: number) =>
    `Scheduled for ${date} at ${time} (each person's local time) for ${members(count)}.`,
  historyTitle: "Recent announcements",
  historyLoading: "Loading announcements…",
  historyEmpty: "No announcements yet.",
  status: { scheduled: "Scheduled", sending: "Sending", sent: "Sent", cancelled: "Cancelled" } as Record<
    AnnouncementStatus,
    string
  >,
  targetEveryone: "Everyone",
  targetMembers: (count: number) => `${count} chosen ${count === 1 ? "member" : "members"}`,
  targetProgramFallback: "A program",
  deliveryNow: (when: string) => `Right away, ${when}`,
  deliveryLocal: (date: string, time: string) => `${date} at ${time}, local time`,
  progress: (sent: number, total: number) => `${sent}/${total} sent`,
  cancel: "Cancel send",
  keep: "Keep",
  cancelTitle: "Cancel this announcement?",
  cancelBody: "People who haven't received it yet won't get it. Anyone who already got it keeps it.",
  directoryLoading: "Loading members…",
  searchMembers: "Search members",
  selectedCount: (count: number) => `${count} selected`,
  clear: "Clear",
  noMembers: "No members match your search."
};
```

**A15. NEW `components/announcements/MemberPicker.tsx`**
```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPrograms } from "@/lib/api/programs";
import {
  ANNOUNCEMENT_COPY,
  ANNOUNCEMENT_KEYS,
  MEMBERS_MAX,
  fetchMemberDirectory,
  type TargetKind
} from "@/lib/api/announcements";
import { appError, toAppError } from "@/lib/kit/app-error";
import { fromQuery, retryNow } from "@/lib/kit/async-state";
import { useOnlineStatus } from "@/lib/kit/use-online-status";
import { ErrorView } from "@/components/kit/ErrorView";

const TARGET_KINDS: TargetKind[] = ["program", "members", "everyone"];
type Self = { id: string; name: string };

// The composer's "Send to" (D-N16): one program's active members · chosen members · everyone. A native <select> for the
// program (SelectMobile doesn't portal and the form sits in a .glass-card).
export function AudiencePicker({
  token,
  self,
  targetKind,
  onTargetKind,
  programId,
  onProgram,
  memberIds,
  onMemberIds
}: {
  token: string;
  self: Self;
  targetKind: TargetKind;
  onTargetKind: (kind: TargetKind) => void;
  programId: string;
  onProgram: (id: string, name: string | null) => void;
  memberIds: string[];
  onMemberIds: (ids: string[]) => void;
}) {
  const programsQuery = useQuery({ queryKey: ["programs"], queryFn: () => fetchPrograms(token), enabled: !!token });
  const programs = programsQuery.data ?? [];

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-rf-text">{ANNOUNCEMENT_COPY.targetLabel}</p>
      <div className="segmented-control flex rounded-full p-1">
        {TARGET_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            data-active={targetKind === kind}
            onClick={() => onTargetKind(kind)}
            className="min-h-[44px] flex-1 rounded-full px-2 text-sm font-semibold transition"
          >
            {ANNOUNCEMENT_COPY.targets[kind]}
          </button>
        ))}
      </div>
      {targetKind === "program" && (
        <select
          value={programId}
          onChange={(event) => {
            const id = event.target.value;
            onProgram(id, programs.find((program) => program.id === id)?.name ?? null);
          }}
          aria-label={ANNOUNCEMENT_COPY.targets.program}
          className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium text-rf-text"
        >
          <option value="">{ANNOUNCEMENT_COPY.chooseProgram}</option>
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.name}
            </option>
          ))}
        </select>
      )}
      {targetKind === "program" && programsQuery.isError && (
        <p className="text-sm font-semibold text-rf-danger">{toAppError(programsQuery.error).message}</p>
      )}
      {targetKind === "members" && <MemberPicker token={token} self={self} selected={memberIds} onChange={onMemberIds} />}
      {targetKind === "everyone" && <p className="text-xs text-rf-text-muted">{ANNOUNCEMENT_COPY.everyoneHint}</p>}
    </div>
  );
}

// "Chosen members": a multi-select over GET /api/members — the full directory for global admins (members D-C3), which
// lists standard members only, so the sender is pinned first as "You" (W19 — test a send on yourself). Only ACTIVE
// members are listed (the server rejects inactive ids); at most 200 (the server's limit).
export function MemberPicker({
  token,
  self,
  selected,
  onChange
}: {
  token: string;
  self: Self;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [search, setSearch] = useState("");
  const directoryQuery = useQuery({
    queryKey: ANNOUNCEMENT_KEYS.directory,
    queryFn: () => fetchMemberDirectory(token),
    enabled: !!token
  });
  const state = fromQuery(directoryQuery);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (directoryQuery.data ?? []).filter(
      (member) =>
        member.id !== self.id &&
        (member.status ?? "active") === "active" &&
        (!query ||
          member.member_name.toLowerCase().includes(query) ||
          (member.username ?? "").toLowerCase().includes(query))
    );
  }, [directoryQuery.data, search, self.id]);
  const chosen = new Set(selected);
  const full = selected.length >= MEMBERS_MAX;
  const toggle = (id: string) => onChange(chosen.has(id) ? selected.filter((item) => item !== id) : [...selected, id]);

  const row = (id: string, label: string, username?: string) => {
    const checked = chosen.has(id);
    return (
      <label key={id} className="flex min-h-[44px] cursor-pointer items-center gap-3 px-4 py-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-rf-accent"
          checked={checked}
          disabled={!checked && full}
          onChange={() => toggle(id)}
        />
        <span className="min-w-0 flex-1 truncate font-semibold text-rf-text">{label}</span>
        {username && <span className="max-w-[40%] shrink-0 truncate text-xs text-rf-text-muted">@{username}</span>}
      </label>
    );
  };

  if (state.status === "loading") {
    return <p className="text-sm text-rf-text-muted">{ANNOUNCEMENT_COPY.directoryLoading}</p>;
  }
  if (state.status === "failed") {
    return (
      <ErrorView
        error={online ? state.error : appError("offline")}
        onRetry={() => void retryNow(queryClient, ANNOUNCEMENT_KEYS.directory)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={ANNOUNCEMENT_COPY.searchMembers}
        className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
      />
      <div className="flex items-center justify-between text-xs font-semibold text-rf-text-muted">
        <span>{ANNOUNCEMENT_COPY.selectedCount(selected.length)}</span>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="min-h-[44px] px-2 text-rf-accent">
            {ANNOUNCEMENT_COPY.clear}
          </button>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto overscroll-contain rounded-2xl border border-rf-border">
        {row(self.id, `${ANNOUNCEMENT_COPY.you} (${self.name})`)}
        {visible.map((member) => row(member.id, member.member_name, member.username))}
        {visible.length === 0 && search.trim() && (
          <p className="px-4 py-3 text-sm text-rf-text-muted">{ANNOUNCEMENT_COPY.noMembers}</p>
        )}
      </div>
    </div>
  );
}
```

**A16. NEW `components/announcements/ComposerForm.tsx`.** The ConfirmDialog renders OUTSIDE the GlassCard, because `.glass-card`'s backdrop-filter would trap `position: fixed`.
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ANNOUNCEMENT_COPY,
  ANNOUNCEMENT_KEYS,
  BODY_MAX,
  MERGE_FIELDS,
  SCHEDULE_MAX_DAYS,
  TITLE_MAX,
  audienceText,
  buildAnnouncementRequest,
  insertAt,
  localDate,
  localTimeNow,
  previewAnnouncement,
  sendAnnouncement,
  type AnnouncementRequest,
  type DeliveryMode,
  type MergeField,
  type TargetKind
} from "@/lib/api/announcements";
import { toAppError } from "@/lib/kit/app-error";
import { KIT_COPY } from "@/lib/kit/copy";
import { GlassCard } from "@/components/ui/GlassCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AudiencePicker } from "@/components/announcements/MemberPicker";

const PREVIEW_DEBOUNCE_MS = 2_000; // the preview route allows 30 / min per admin (W15)
const MODES: DeliveryMode[] = ["now", "local"];

// D-N16 composer (notifications 0.6.0 C4): who → title + message with merge fields → now or each person's local time.
// The live preview re-renders for a sample recipient 2 s after the last edit (cached per request body). W15: Send
// unlocks only when the preview is for EXACTLY what is on screen (never a kept older one) and reaches someone, so the
// confirm's audience + count are the real ones. A 400 shows the server's own text.
export function ComposerForm({ token, self }: { token: string; self: { id: string; name: string } }) {
  const queryClient = useQueryClient();
  const [targetKind, setTargetKind] = useState<TargetKind>("program");
  const [programId, setProgramId] = useState("");
  const [programName, setProgramName] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<DeliveryMode>("now");
  const [date, setDate] = useState(() => localDate(1));
  const [time, setTime] = useState("09:00");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<"title" | "body">("body");

  const request = buildAnnouncementRequest({ targetKind, programId, memberIds, title, body, mode, date, time });
  const requestJson = request ? JSON.stringify(request) : "";
  const [previewJson, setPreviewJson] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setPreviewJson(requestJson), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [requestJson]);

  const previewQuery = useQuery({
    queryKey: [...ANNOUNCEMENT_KEYS.preview, previewJson],
    queryFn: () => previewAnnouncement(token, JSON.parse(previewJson) as AnnouncementRequest),
    enabled: !!token && previewJson !== "",
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false
  });
  const preview = previewQuery.data;
  const previewSettled = request !== null && previewJson === requestJson && !previewQuery.isFetching;
  const previewError = previewSettled && previewQuery.isError ? toAppError(previewQuery.error).message : null;
  const previewCurrent = previewSettled && previewQuery.isSuccess && !previewQuery.isPlaceholderData;
  const recipientCount = previewCurrent && preview ? preview.recipient_count : 0;
  const pastTime = mode === "local" && date === localDate(0) && time <= localTimeNow();

  const send = useMutation({
    mutationFn: (payload: AnnouncementRequest) => sendAnnouncement(token, payload),
    onMutate: () => setSentMessage(null),
    onSuccess: (summary) => {
      setSentMessage(
        summary.mode === "now"
          ? ANNOUNCEMENT_COPY.sent(summary.recipient_count)
          : ANNOUNCEMENT_COPY.scheduled(summary.send_date ?? date, summary.send_time ?? time, summary.recipient_count)
      );
      setTitle("");
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ANNOUNCEMENT_KEYS.list });
    }
  });
  const canSend = previewCurrent && recipientCount > 0 && !send.isPending;

  // Inserts {field} at the cursor of the last focused field (the chips keep focus via preventDefault on mousedown).
  const insertField = (field: MergeField) => {
    const inTitle = lastField.current === "title";
    const element = inTitle ? titleRef.current : bodyRef.current;
    const value = inTitle ? title : body;
    const { text, caret } = insertAt(
      value,
      element?.selectionStart ?? value.length,
      element?.selectionEnd ?? value.length,
      `{${field}}`,
      inTitle ? TITLE_MAX : BODY_MAX
    );
    (inTitle ? setTitle : setBody)(text);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(caret, caret);
    });
  };

  return (
    <>
      <GlassCard padding="lg" className="space-y-5">
        <p className="text-base font-semibold text-rf-text">{ANNOUNCEMENT_COPY.composeTitle}</p>
        <AudiencePicker
          token={token}
          self={self}
          targetKind={targetKind}
          onTargetKind={setTargetKind}
          programId={programId}
          onProgram={(id, name) => {
            setProgramId(id);
            setProgramName(name);
          }}
          memberIds={memberIds}
          onMemberIds={setMemberIds}
        />

        <label className="block space-y-2">
          <span className="flex items-center justify-between text-sm font-semibold text-rf-text">
            {ANNOUNCEMENT_COPY.titleLabel}
            <span className="text-xs font-medium text-rf-text-muted">{title.length}/{TITLE_MAX}</span>
          </span>
          <input
            ref={titleRef}
            value={title}
            maxLength={TITLE_MAX}
            onFocus={() => (lastField.current = "title")}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={ANNOUNCEMENT_COPY.titlePlaceholder}
            className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
          />
        </label>

        <label className="block space-y-2">
          <span className="flex items-center justify-between text-sm font-semibold text-rf-text">
            {ANNOUNCEMENT_COPY.bodyLabel}
            <span className="text-xs font-medium text-rf-text-muted">{body.length}/{BODY_MAX}</span>
          </span>
          <textarea
            ref={bodyRef}
            value={body}
            rows={4}
            maxLength={BODY_MAX}
            onFocus={() => (lastField.current = "body")}
            onChange={(event) => setBody(event.target.value)}
            placeholder={ANNOUNCEMENT_COPY.bodyPlaceholder}
            className="input-shell w-full resize-y rounded-2xl px-4 py-3 text-sm font-medium"
          />
        </label>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-rf-text-muted">{ANNOUNCEMENT_COPY.personalize}</span>
            {MERGE_FIELDS.map((field) => (
              <button
                key={field}
                type="button"
                disabled={field === "program_name" && targetKind !== "program"}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertField(field)}
                className="min-h-[44px] rounded-full border border-rf-border px-3 text-xs font-semibold text-rf-text disabled:opacity-40"
              >
                {ANNOUNCEMENT_COPY.mergeLabels[field]}
              </button>
            ))}
          </div>
          <p className="text-xs text-rf-text-muted">{ANNOUNCEMENT_COPY.personalizeHint}</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-rf-text">{ANNOUNCEMENT_COPY.whenLabel}</p>
          <div className="segmented-control flex rounded-full p-1">
            {MODES.map((value) => (
              <button
                key={value}
                type="button"
                data-active={mode === value}
                onClick={() => setMode(value)}
                className="min-h-[44px] flex-1 rounded-full px-2 text-sm font-semibold transition"
              >
                {ANNOUNCEMENT_COPY.modes[value]}
              </button>
            ))}
          </div>
          {mode === "local" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="date"
                  value={date}
                  min={localDate(0)}
                  max={localDate(SCHEDULE_MAX_DAYS)}
                  onChange={(event) => setDate(event.target.value)}
                  aria-label={ANNOUNCEMENT_COPY.dateLabel}
                  className="input-shell w-full min-w-0 rounded-2xl px-4 py-3 text-sm font-medium"
                />
                <input
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  aria-label={ANNOUNCEMENT_COPY.timeLabel}
                  className="input-shell w-full min-w-0 rounded-2xl px-4 py-3 text-sm font-medium"
                />
              </div>
              {pastTime && <p className="text-xs font-semibold text-rf-warning">{ANNOUNCEMENT_COPY.pastTime}</p>}
              <p className="text-xs text-rf-text-muted">{ANNOUNCEMENT_COPY.localHint}</p>
            </>
          )}
        </div>

        <div className="space-y-2 rounded-2xl border border-rf-border bg-rf-surface-muted p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-rf-text-muted">{ANNOUNCEMENT_COPY.previewLabel}</p>
          {!request && <p className="text-sm text-rf-text-muted">{ANNOUNCEMENT_COPY.previewIncomplete}</p>}
          {previewError && (
            <p className="text-sm font-semibold text-rf-danger">
              {previewError}{" "}
              <button type="button" onClick={() => void previewQuery.refetch()} className="text-rf-accent">
                {KIT_COPY.retry}
              </button>
            </p>
          )}
          {request && !previewCurrent && !previewError && (
            <p className="text-sm text-rf-text-muted">{ANNOUNCEMENT_COPY.previewLoading}</p>
          )}
          {request && preview && !previewError && (
            <div className={previewCurrent ? "space-y-2" : "space-y-2 opacity-60"}>
              <p className="text-sm text-rf-text-muted">{ANNOUNCEMENT_COPY.reach(preview.recipient_count)}</p>
              {preview.sample && (
                <div className="rounded-2xl bg-rf-surface p-3">
                  <p className="text-xs text-rf-text-muted">{ANNOUNCEMENT_COPY.sampleFor(preview.sample.first_name)}</p>
                  <p className="mt-1 break-words text-sm font-semibold text-rf-text">{preview.sample.title}</p>
                  <p className="mt-1 whitespace-pre-line break-words text-sm text-rf-text-muted">{preview.sample.body}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {sentMessage && <p className="text-sm font-semibold text-rf-success">{sentMessage}</p>}
        {send.isError && <p className="text-sm font-semibold text-rf-danger">{toAppError(send.error).message}</p>}
        <button
          type="button"
          disabled={!canSend}
          onClick={() => setConfirmOpen(true)}
          className="w-full rounded-2xl bg-rf-accent px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
        >
          {send.isPending ? ANNOUNCEMENT_COPY.sending : mode === "now" ? ANNOUNCEMENT_COPY.sendNow : ANNOUNCEMENT_COPY.schedule}
        </button>
      </GlassCard>

      <ConfirmDialog
        open={confirmOpen}
        title={ANNOUNCEMENT_COPY.confirmTitle}
        description={ANNOUNCEMENT_COPY.confirmBody(audienceText(targetKind, recipientCount, programName), mode, date, time)}
        confirmLabel={mode === "now" ? ANNOUNCEMENT_COPY.sendNow : ANNOUNCEMENT_COPY.schedule}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          if (request && canSend) send.mutate(request);
        }}
      />
    </>
  );
}
```

**A17. NEW `components/announcements/AnnouncementHistory.tsx`**
```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ANNOUNCEMENT_COPY,
  ANNOUNCEMENT_KEYS,
  cancelAnnouncement,
  listAnnouncements,
  type AnnouncementSummary
} from "@/lib/api/announcements";
import { appError, toAppError } from "@/lib/kit/app-error";
import { fromQuery, retryNow } from "@/lib/kit/async-state";
import { useOnlineStatus } from "@/lib/kit/use-online-status";
import { GlassCard } from "@/components/ui/GlassCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ErrorView } from "@/components/kit/ErrorView";

const STATUS_VARIANT = { scheduled: "info", sending: "accent", sent: "success", cancelled: "neutral" } as const;

const formatWhen = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const targetLabel = (item: AnnouncementSummary) =>
  item.target_kind === "everyone"
    ? ANNOUNCEMENT_COPY.targetEveryone
    : item.target_kind === "members"
      ? ANNOUNCEMENT_COPY.targetMembers(item.recipient_count)
      : item.target_program_name ?? ANNOUNCEMENT_COPY.targetProgramFallback;

const deliveryLabel = (item: AnnouncementSummary) =>
  item.mode === "local" && item.send_date && item.send_time
    ? ANNOUNCEMENT_COPY.deliveryLocal(item.send_date, item.send_time)
    : ANNOUNCEMENT_COPY.deliveryNow(formatWhen(item.created_at));

// The composer's audit (GET /announcements — newest 50): status, target, timing, progress; Cancel while scheduled /
// sending (W11 — the only way to stop a scheduled send). A 409 (already sent) reads the kit conflict copy + a reload.
export function AnnouncementHistory({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [cancelTarget, setCancelTarget] = useState<AnnouncementSummary | null>(null);
  const historyQuery = useQuery({
    queryKey: ANNOUNCEMENT_KEYS.list,
    queryFn: () => listAnnouncements(token),
    enabled: !!token
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelAnnouncement(token, id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ANNOUNCEMENT_KEYS.list })
  });
  const state = fromQuery(historyQuery);
  const announcements = historyQuery.data?.announcements ?? [];

  return (
    <>
      <GlassCard padding="lg" className="space-y-4">
        <p className="text-base font-semibold text-rf-text">{ANNOUNCEMENT_COPY.historyTitle}</p>
        {state.status === "loading" && <p className="text-sm text-rf-text-muted">{ANNOUNCEMENT_COPY.historyLoading}</p>}
        {state.status === "failed" && (
          <ErrorView
            error={online ? state.error : appError("offline")}
            onRetry={() => void retryNow(queryClient, ANNOUNCEMENT_KEYS.list)}
          />
        )}
        {cancel.isError && <p className="text-sm font-semibold text-rf-danger">{toAppError(cancel.error).message}</p>}
        {(state.status === "loaded" || state.status === "stale") && announcements.length === 0 && (
          <p className="text-sm text-rf-text-muted">{ANNOUNCEMENT_COPY.historyEmpty}</p>
        )}
        <div className="space-y-3">
          {announcements.map((item) => (
            <div key={item.id} className="rounded-2xl border border-rf-border bg-rf-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words text-sm font-semibold text-rf-text">{item.title}</p>
                <StatusBadge variant={STATUS_VARIANT[item.status]}>{ANNOUNCEMENT_COPY.status[item.status]}</StatusBadge>
              </div>
              <p className="mt-1 line-clamp-2 break-words text-sm text-rf-text-muted">{item.body}</p>
              <p className="mt-2 text-xs text-rf-text-muted">
                {[targetLabel(item), deliveryLabel(item), ANNOUNCEMENT_COPY.progress(item.sent_count, item.recipient_count)].join(" · ")}
              </p>
              {(item.status === "scheduled" || item.status === "sending") && (
                <button
                  type="button"
                  disabled={cancel.isPending}
                  onClick={() => setCancelTarget(item)}
                  className="mt-3 min-h-[44px] rounded-full border border-rf-danger px-4 text-xs font-semibold text-rf-danger disabled:opacity-50"
                >
                  {ANNOUNCEMENT_COPY.cancel}
                </button>
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      <ConfirmDialog
        open={!!cancelTarget}
        title={ANNOUNCEMENT_COPY.cancelTitle}
        description={ANNOUNCEMENT_COPY.cancelBody}
        confirmLabel={ANNOUNCEMENT_COPY.cancel}
        cancelLabel={ANNOUNCEMENT_COPY.keep}
        danger
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) cancel.mutate(cancelTarget.id);
        }}
      />
    </>
  );
}
```

**A18. NEW `app/program/announcements/page.tsx`**
```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { ANNOUNCEMENT_COPY } from "@/lib/api/announcements";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComposerForm } from "@/components/announcements/ComposerForm";
import { AnnouncementHistory } from "@/components/announcements/AnnouncementHistory";

// D-N16: the send-anytime composer — global admins only (everyone else is sent to /programs; the server answers 403 too).
// Entry points: the account menus' Announcements row (global admins only).
export default function AnnouncementsPage() {
  const router = useRouter();
  const { session, program, token } = useAuthGuard({ requireProgram: false });
  const isGlobalAdmin = session?.user.globalRole === "global_admin";

  useEffect(() => {
    if (session && !isGlobalAdmin) router.replace("/programs");
  }, [session, isGlobalAdmin, router]);

  if (!session || !isGlobalAdmin) return null;

  return (
    <PageShell maxWidth="3xl">
      <PageHeader
        title={ANNOUNCEMENT_COPY.title}
        subtitle={ANNOUNCEMENT_COPY.subtitle}
        backHref={program?.id ? "/program" : "/programs"}
      />
      <ComposerForm token={token} self={{ id: session.user.id, name: session.user.memberName ?? ANNOUNCEMENT_COPY.you }} />
      <AnnouncementHistory token={token} />
    </PageShell>
  );
}
```

**A19. ONLY IF the user answers U-W1 = yes.** Apply to BOTH `app/privacy-policy/page.tsx` and `app/program/privacy/page.tsx`.
- (a) After `<li>Device and network data: device type, OS version, and IP address.</li>`, insert:
```tsx
            <li>Time zone: your device or browser time zone (for example America/Vancouver), sent automatically so reminders and the weekly summary arrive at your local time.</li>
```
- (b) Directly after the `</li>` of the bullet beginning `<li>Deliver push and in-app notifications`, insert:
```tsx
            <li>Send a daily workout reminder and a weekly summary only if you turn them on in your notification settings, and show announcements from the RaSi Fiters team in your Inbox.</li>
```
- (c) Set `subtitle="Effective date: …"` to today's date (`date +%F`). E2 re-stamps it at commit.

## Steps — web, PASS B (People S2 + S5 + Hide toggle + People privacy text)

Start Pass B only after **Pass A is committed** and **the re-planned S1 contract is approved**. Before starting, the orchestrator re-checks People §B–§E and §F (`GET`/`PUT /members/:id hide_activity`) against the approved S1 plan. If any field, route or status changed, it amends B1/B6/B7 first.

**B1. NEW `lib/api/people.ts`**
```ts
import { apiRequest } from "@/lib/api/client";

// People (people 0.1.0 API §A–§E; phase-4 D-P1–D-P11). JSON snake_case; errors are { error, code } and the status
// decides the kit kind. The server decides what the viewer may see (activity_visible) — the client only renders it.

/**
 * W1 / U-3: People goes live on web together with the iOS + Android store release. Until then (false): /members/list
 * runs today's roster unchanged, the entry labels stay "View Members", no notice; /members/person exists by URL only.
 * Flip to true in the release-day web commit (one line).
 */
export const PEOPLE_LIVE: boolean = false;

export type ProgramRole = "admin" | "logger" | "member";
export type PersonRow = {
  member_id: string;
  member_name: string;
  initials: string;
  username: string;
  program_role: ProgramRole;
  is_you: boolean;
  activity_visible: boolean;
  last_active: string | null;
};
export type PeopleList = {
  program_id: string;
  viewer: { member_id: string; is_staff: boolean };
  people: PersonRow[];
};
export type PersonStats = {
  current_streak: number;
  longest_streak: number;
  active_days_this_month: number;
  last_active: string | null;
};
export type RecentWorkout = { workout_type: string; date: string; duration_minutes: number };
export type KudosState = { count: number; given_today: boolean; can_give: boolean };
export type PersonProfile = Omit<PersonRow, "last_active"> & {
  program_id: string;
  joined_at: string | null;
  can_open_full_stats: boolean;
  stats: PersonStats | null;
  recent_workouts: RecentWorkout[] | null;
  kudos: KudosState | null;
};

export const peopleKeys = {
  all: ["people"] as const,
  list: (programId: string) => ["people", "list", programId] as const,
  person: (programId: string, memberId: string) => ["people", "person", programId, memberId] as const
};

export function fetchPeople(token: string, programId: string) {
  return apiRequest<PeopleList>(`/people?${new URLSearchParams({ programId }).toString()}`, { token });
}

export function fetchPersonProfile(token: string, programId: string, memberId: string) {
  return apiRequest<PersonProfile>(
    `/people/${encodeURIComponent(memberId)}?${new URLSearchParams({ programId }).toString()}`,
    { token }
  );
}

/** 201 = new, 200 = already given today — the same body either way. */
export function giveKudos(token: string, memberId: string, programId: string) {
  return apiRequest<{ kudos: { count: number; given_today: boolean } }>(`/people/${encodeURIComponent(memberId)}/kudos`, {
    method: "POST",
    token,
    body: { program_id: programId }
  });
}

/** No `count` (§E): the caller lowers its own count by one when `removed`. */
export function undoKudos(token: string, memberId: string) {
  return apiRequest<{ kudos: { given_today: boolean; removed: boolean } }>(`/people/${encodeURIComponent(memberId)}/kudos`, {
    method: "DELETE",
    token
  });
}

/** "YYYY-MM-DD" → "Oct 12, 2026" in the browser's locale, parsed as a LOCAL day (new Date("2026-10-12") is UTC midnight
 *  and would show the previous day west of UTC). */
export function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Date(year, month - 1, date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Phase 4 shared client copy (W12 — the iOS / Android tracks mirror these strings; casing per surface idiom).
export const PEOPLE_COPY = {
  title: "People",
  profileTitle: "Profile",
  you: "You",
  roles: { admin: "Admin", logger: "Logger", member: "Member" } as Record<ProgramRole, string>,
  searchPlaceholder: "Search people",
  loading: "Loading people…",
  empty: "No one in this program yet.",
  noMatch: "No one matches your search.",
  hiddenRow: "Activity hidden",
  noWorkouts: "No workouts yet",
  lastActive: (date: string) => `Last active ${date}`,
  profileLoading: "Loading profile…",
  hiddenProfile: "This member keeps their activity private.",
  currentStreak: "Current streak",
  longestStreak: "Longest streak",
  activeDaysThisMonth: "Active days this month",
  lastActiveLabel: "Last active",
  recentWorkouts: "Recent workouts",
  noRecentWorkouts: "No workouts logged yet.",
  days: (count: number) => `${count} ${count === 1 ? "day" : "days"}`,
  kudosCount: (count: number) => `${count} kudos`,
  giveKudos: "Give kudos",
  kudosGiven: "Kudos given",
  undo: "Undo",
  kudosLimit: "You've changed kudos too many times. Try again later.",
  openFullStats: "Open full stats",
  manageMembership: "Manage membership",
  hideActivityLabel: "Hide my activity",
  hideActivityHint:
    "Hides your workouts, streaks and kudos from other members of your programs. Program admins and loggers still see them.",
  hideActivityLoadFailed: "Couldn't load this setting.",
  noticeTitle: "Who can see your activity",
  noticeBody:
    "Members of your programs can see your workouts, streaks and kudos — including workouts synced from Apple Health or Health Connect. Sleep, diet and steps stay private to you and your program's staff.",
  noticeKeep: "Keep visible",
  noticeHide: "Hide my activity",
  saving: "Saving…"
};

export function roleLabel(role: string): string {
  return PEOPLE_COPY.roles[role as ProgramRole] ?? PEOPLE_COPY.roles.member;
}
```

**B2. `lib/api/members.ts`**
- In `MemberProfile`, after `created_at?: string | null;`, add `hide_activity?: boolean; // people 0.1.0 — only for the member themself / a global admin`.
- In `updateMemberProfile`:
  - payload type → `{ first_name?: string; last_name?: string; gender?: string | null; hide_activity?: boolean }`;
  - response generic → `apiRequest<{ message?: string; member_name?: string; hide_activity?: boolean }>`.

**B3. NEW `components/people/HideActivityToggle.tsx`**
```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMemberProfile, updateMemberProfile } from "@/lib/api/members";
import { PEOPLE_COPY, peopleKeys } from "@/lib/api/people";
import { toAppError } from "@/lib/kit/app-error";
import { KIT_COPY } from "@/lib/kit/copy";
import { Switch } from "@/components/ui/Switch";

// "Hide my activity" (people 0.1.0 §F; D-P6 / D-P7) in My Profile — one switch for all programs. Reads the profile query
// the page already runs (GET /members/:id returns hide_activity to the member themself); saves with
// PUT /members/:id { hide_activity } (strict boolean, own profile only). It never writes that query's cache: the page
// re-seeds its name / gender form from it, which would wipe unsaved edits — the saved value is kept here instead.
export function HideActivityToggle({ token, memberId }: { token: string; memberId: string }) {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["account", "profile", memberId],
    queryFn: () => fetchMemberProfile(token, memberId),
    enabled: !!token && !!memberId
  });
  const [saved, setSaved] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (hide: boolean) => updateMemberProfile(token, memberId, { hide_activity: hide }),
    onMutate: () => setError(null),
    onSuccess: (data, hide) => {
      setSaved(data.hide_activity ?? hide);
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
    },
    onError: (e) => setError(toAppError(e).message)
  });

  const loaded = profileQuery.data !== undefined;
  const checked = save.isPending ? save.variables === true : saved ?? profileQuery.data?.hide_activity === true;

  return (
    <div className="space-y-2 border-t border-rf-border pt-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p id="hide-activity-label" className="text-sm font-semibold text-rf-text">
            {PEOPLE_COPY.hideActivityLabel}
          </p>
          <p className="mt-1 text-xs text-rf-text-muted">{PEOPLE_COPY.hideActivityHint}</p>
        </div>
        <Switch
          checked={checked}
          disabled={!loaded || save.isPending}
          labelledBy="hide-activity-label"
          onChange={(next) => save.mutate(next)}
        />
      </div>
      {!loaded && profileQuery.isError && (
        <p className="text-sm text-rf-text-muted">
          {PEOPLE_COPY.hideActivityLoadFailed}{" "}
          <button type="button" onClick={() => void profileQuery.refetch()} className="font-semibold text-rf-accent">
            {KIT_COPY.retry}
          </button>
        </p>
      )}
      {error && <p className="text-sm font-semibold text-rf-danger">{error}</p>}
    </div>
  );
}
```

**B4. `app/program/profile/page.tsx`: only this change.**
- After `import { GoogleSignInButton } from "@/components/GoogleSignInButton";`, add `import { HideActivityToggle } from "@/components/people/HideActivityToggle";`.
- Directly before the element `<div className="border-t border-rf-border pt-4">` (this exact className is unique; it wraps the sign-out-everywhere button), insert:
```tsx
          {session?.user.id && <HideActivityToggle token={token} memberId={session.user.id} />}
```

**B5. `app/members/list/page.tsx`**
1. Keep today's file body; only rename and add.
2. In the import block, apply these four edits:
   - Replace `import { useQuery } from "@tanstack/react-query";` with `import { useQuery, useQueryClient } from "@tanstack/react-query";`.
   - Replace `import { toAppError } from "@/lib/kit/app-error";` with:
```ts
import { appError, toAppError } from "@/lib/kit/app-error";
import { fromQuery, retryNow } from "@/lib/kit/async-state";
import { useOnlineStatus, useRefetchOnReconnect } from "@/lib/kit/use-online-status";
import { fetchPeople, formatDay, PEOPLE_COPY, PEOPLE_LIVE, peopleKeys, roleLabel, type PersonRow } from "@/lib/api/people";
```
   - After `import { ErrorState } from "@/components/ui/ErrorState";`, insert:
```ts
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";
import { ActivityVisibilityNotice } from "@/components/people/ActivityVisibilityNotice";
```
   - Replace the line `export default function MembersListPage() {` with:
```tsx
// /members/list (W1 / U-3). PEOPLE_LIVE false → today's roster, unchanged (RosterList: GET /program-memberships/details,
// ★ for admins, rows open only for global admins, Inactive badge). true → People (PeopleList: GET /api/people).
// RosterList + MemberRow are deleted in the post-release cleanup (Endgame E9).
export default function MembersListPage() {
  return PEOPLE_LIVE ? <PeopleList /> : <RosterList />;
}

function RosterList() {
```
3. Leave the rest of the old function body and `MemberRow` byte-for-byte.
4. Append at the end of the file:
```tsx
// People (people 0.1.0 §B; phase-4 D-P1 / D-P2 a / D-P10): the current program's active members, the caller first
// ("You"), server initials, last active, and every row opens the person's profile; a hidden member shows by name with
// "Activity hidden". Kit states throughout; the one-time "Who can see your activity" notice on the first open (W3).
function PeopleList() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, program, token, programId } = useAuthGuard();
  const online = useOnlineStatus();
  const [search, setSearch] = useState("");
  const listKey = peopleKeys.list(programId);
  const peopleQuery = useQuery({
    queryKey: listKey,
    queryFn: () => fetchPeople(token, programId),
    enabled: !!token && !!programId
  });
  useRefetchOnReconnect([peopleQuery]);
  const state = fromQuery(peopleQuery);

  const filtered = useMemo(() => {
    const people = peopleQuery.data?.people ?? [];
    const query = search.trim().toLowerCase();
    return query ? people.filter((person) => person.member_name.toLowerCase().includes(query)) : people;
  }, [peopleQuery.data, search]);

  return (
    <PageShell maxWidth="4xl">
      <PageHeader title={PEOPLE_COPY.title} subtitle={program?.name ?? "Program"} backHref="/members" />
      <GlassCard>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={PEOPLE_COPY.searchPlaceholder}
          className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
        />
      </GlassCard>
      {state.status === "loading" && <LoadingState message={PEOPLE_COPY.loading} />}
      {state.status === "failed" && (
        <ErrorView error={online ? state.error : appError("offline")} onRetry={() => void retryNow(queryClient, listKey)} />
      )}
      {peopleQuery.data && filtered.length === 0 && (
        <EmptyState message={search.trim() ? PEOPLE_COPY.noMatch : PEOPLE_COPY.empty} />
      )}
      {filtered.length > 0 && (
        <div className="grid gap-3">
          {filtered.map((person) => (
            <PersonRowCard
              key={person.member_id}
              person={person}
              onOpen={() => router.push(`/members/person?memberId=${person.member_id}`)}
            />
          ))}
        </div>
      )}
      {state.status === "stale" && online && (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="stale" onRetry={() => void peopleQuery.refetch()} />
        </>
      )}
      {session?.user.id && <ActivityVisibilityNotice token={token} memberId={session.user.id} />}
    </PageShell>
  );
}

function PersonRowCard({ person, onOpen }: { person: PersonRow; onOpen: () => void }) {
  const subline = !person.activity_visible
    ? PEOPLE_COPY.hiddenRow
    : person.last_active
      ? PEOPLE_COPY.lastActive(formatDay(person.last_active))
      : PEOPLE_COPY.noWorkouts;
  return (
    <button type="button" onClick={onOpen} className="w-full text-left">
      <GlassCard padding="sm">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rf-surface-muted text-sm font-semibold text-rf-text">
            {person.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-base font-semibold text-rf-text">{person.member_name}</p>
              {person.is_you && (
                <span className="shrink-0 rounded-full bg-rf-accent/15 px-2 py-0.5 text-[11px] font-semibold text-rf-accent">
                  {PEOPLE_COPY.you}
                </span>
              )}
              {person.program_role !== "member" && (
                <span className="shrink-0 text-xs font-semibold text-rf-text-muted">{roleLabel(person.program_role)}</span>
              )}
            </div>
            <p className="truncate text-xs text-rf-text-muted">{subline}</p>
          </div>
          <span aria-hidden="true" className="shrink-0 text-rf-text-muted">›</span>
        </div>
      </GlassCard>
    </button>
  );
}
```
The file is about 235 lines until E9 removes the roster (about 140 after).

**B6. NEW `components/people/KudosButton.tsx`**
```tsx
"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { giveKudos, undoKudos, PEOPLE_COPY, peopleKeys, type KudosState, type PersonProfile } from "@/lib/api/people";
import { toAppError } from "@/lib/kit/app-error";

// Kudos (people 0.1.0 §D / §E; D-P4 / D-P5): one per person per day (their day), undoable, a count only. Give answers
// the new count; undo answers none (it would leak a hidden member's count) — the shown count drops by one when
// `removed`. A 403 = the person just hid their activity → the profile re-fetches and shows the hidden state. A 429
// (pair / burst limit) reads its own line. Mutations never auto-retry.
export function KudosButton({
  token,
  programId,
  memberId,
  kudos
}: {
  token: string;
  programId: string;
  memberId: string;
  kudos: KudosState;
}) {
  const queryClient = useQueryClient();
  const profileKey = peopleKeys.person(programId, memberId);
  const [error, setError] = useState<string | null>(null);
  const patch = (next: Partial<KudosState>) =>
    queryClient.setQueryData<PersonProfile>(profileKey, (previous) =>
      previous?.kudos ? { ...previous, kudos: { ...previous.kudos, ...next } } : previous
    );
  const fail = (e: unknown) => {
    const appErr = toAppError(e);
    if (appErr.status === 403) void queryClient.invalidateQueries({ queryKey: profileKey });
    setError(appErr.status === 429 ? PEOPLE_COPY.kudosLimit : appErr.message);
  };
  const give = useMutation({
    mutationFn: () => giveKudos(token, memberId, programId),
    onMutate: () => setError(null),
    onSuccess: (result) => patch({ count: result.kudos.count, given_today: result.kudos.given_today }),
    onError: fail
  });
  const undo = useMutation({
    mutationFn: () => undoKudos(token, memberId),
    onMutate: () => setError(null),
    onSuccess: (result) =>
      patch(result.kudos.removed ? { count: Math.max(0, kudos.count - 1), given_today: false } : { given_today: false }),
    onError: fail
  });
  const busy = give.isPending || undo.isPending;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base font-semibold text-rf-text">{PEOPLE_COPY.kudosCount(kudos.count)}</p>
        {kudos.can_give &&
          (kudos.given_today ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-rf-accent/15 px-3 py-2 text-xs font-semibold text-rf-accent">
                {PEOPLE_COPY.kudosGiven}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => undo.mutate()}
                className="pill-button min-h-[44px] rounded-full px-4 text-sm font-semibold disabled:opacity-50"
              >
                {PEOPLE_COPY.undo}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => give.mutate()}
              className="min-h-[44px] rounded-full bg-rf-accent px-5 text-sm font-semibold text-black disabled:opacity-50"
            >
              {PEOPLE_COPY.giveKudos}
            </button>
          ))}
      </div>
      {error && <p className="text-sm font-semibold text-rf-danger">{error}</p>}
    </div>
  );
}
```

**B7. NEW `app/members/person/page.tsx`**
```tsx
"use client";

export const dynamic = "force-dynamic";

import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { useClientSearchParams } from "@/lib/use-client-search-params";
import { fetchPersonProfile, formatDay, PEOPLE_COPY, peopleKeys, roleLabel, type PersonProfile } from "@/lib/api/people";
import { formatDuration } from "@/lib/format";
import { appError } from "@/lib/kit/app-error";
import { fromQuery, retryNow } from "@/lib/kit/async-state";
import { useOnlineStatus, useRefetchOnReconnect } from "@/lib/kit/use-online-status";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";
import { KudosButton } from "@/components/people/KudosButton";

// A person's profile (people 0.1.0 §C; D-P3 workouts only, D-P11): streaks, active days this month, last active, the
// last 10 workouts and kudos. Hidden from this viewer → name only + one honest line. Staff get "Open full stats" (W6);
// global admins also "Manage membership" (W7).
export default function PersonProfilePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useClientSearchParams();
  const memberId = searchParams.get("memberId") ?? "";
  const { session, program, token, programId } = useAuthGuard();
  const isGlobalAdmin = session?.user.globalRole === "global_admin";
  const online = useOnlineStatus();
  const profileKey = peopleKeys.person(programId, memberId);
  const profileQuery = useQuery({
    queryKey: profileKey,
    queryFn: () => fetchPersonProfile(token, programId, memberId),
    enabled: !!token && !!programId && !!memberId
  });
  useRefetchOnReconnect([profileQuery]);
  const state = fromQuery(profileQuery);
  const profile = profileQuery.data;

  // W6: admins + global admins → the Members tab with "View as" set to this person (the sessionStorage key
  // app/members/page.tsx reads); loggers (whose tab overview is always themselves) → this person's full workout list.
  const openFullStats = () => {
    const viewerId = session?.user.id;
    if (!viewerId || !profile) return;
    if (program?.my_role === "admin" || isGlobalAdmin) {
      sessionStorage.setItem(`rf:members:view-as:${programId}:${viewerId}`, profile.member_id);
      router.push("/members");
      return;
    }
    router.push(`/members/workouts?memberId=${profile.member_id}&name=${encodeURIComponent(profile.member_name)}`);
  };

  return (
    <PageShell maxWidth="3xl">
      <PageHeader title={PEOPLE_COPY.profileTitle} subtitle={program?.name ?? "Program"} backHref="/members/list" />

      {state.status === "loading" && <LoadingState message={PEOPLE_COPY.profileLoading} />}
      {state.status === "failed" && (
        <ErrorView error={online ? state.error : appError("offline")} onRetry={() => void retryNow(queryClient, profileKey)} />
      )}

      {profile && (
        <>
          <ProfileHeader profile={profile} />
          {profile.activity_visible ? (
            <ActivityDetails profile={profile} token={token} programId={programId} />
          ) : (
            <GlassCard padding="lg" className="text-sm text-rf-text-muted">
              {PEOPLE_COPY.hiddenProfile}
            </GlassCard>
          )}
          {(profile.can_open_full_stats || isGlobalAdmin) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {profile.can_open_full_stats && (
                <button
                  type="button"
                  onClick={openFullStats}
                  className="pill-button min-h-[44px] rounded-2xl px-4 py-3 text-sm font-semibold"
                >
                  {PEOPLE_COPY.openFullStats}
                </button>
              )}
              {isGlobalAdmin && (
                <button
                  type="button"
                  onClick={() => router.push(`/members/detail?memberId=${profile.member_id}`)}
                  className="pill-button min-h-[44px] rounded-2xl px-4 py-3 text-sm font-semibold"
                >
                  {PEOPLE_COPY.manageMembership}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {state.status === "stale" && online && (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="stale" onRetry={() => void profileQuery.refetch()} />
        </>
      )}
    </PageShell>
  );
}

function ProfileHeader({ profile }: { profile: PersonProfile }) {
  return (
    <GlassCard padding="lg">
      <div className="flex items-center gap-4">
        <div className="metric-pill flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-base font-semibold text-rf-text">
          {profile.initials}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-lg font-semibold text-rf-text">{profile.member_name}</p>
            {profile.is_you && (
              <span className="rounded-full bg-rf-accent/15 px-2 py-0.5 text-[11px] font-semibold text-rf-accent">
                {PEOPLE_COPY.you}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-rf-text-muted">
            @{profile.username} · {roleLabel(profile.program_role)}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-pill min-w-0 rounded-2xl px-3 py-3">
      <p className="text-xs text-rf-text-muted">{label}</p>
      <p className="mt-1 text-base font-semibold text-rf-text">{value}</p>
    </div>
  );
}

function ActivityDetails({ profile, token, programId }: { profile: PersonProfile; token: string; programId: string }) {
  const stats = profile.stats;
  const recent = profile.recent_workouts ?? [];
  return (
    <>
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatPill label={PEOPLE_COPY.currentStreak} value={PEOPLE_COPY.days(stats.current_streak)} />
          <StatPill label={PEOPLE_COPY.longestStreak} value={PEOPLE_COPY.days(stats.longest_streak)} />
          <StatPill label={PEOPLE_COPY.activeDaysThisMonth} value={String(stats.active_days_this_month)} />
          <StatPill label={PEOPLE_COPY.lastActiveLabel} value={stats.last_active ? formatDay(stats.last_active) : "—"} />
        </div>
      )}
      {profile.kudos && (
        <GlassCard>
          <KudosButton token={token} programId={programId} memberId={profile.member_id} kudos={profile.kudos} />
        </GlassCard>
      )}
      <GlassCard>
        <p className="text-sm font-semibold text-rf-text-muted">{PEOPLE_COPY.recentWorkouts}</p>
        <div className="mt-3 space-y-2 text-sm">
          {recent.length === 0 && <p className="text-rf-text-muted">{PEOPLE_COPY.noRecentWorkouts}</p>}
          {recent.map((workout, index) => (
            <div key={`${workout.date}-${workout.workout_type}-${index}`} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-rf-text">{workout.workout_type}</p>
                <p className="text-xs text-rf-text-muted">{formatDay(workout.date)}</p>
              </div>
              <p className="shrink-0 font-semibold text-rf-text">{formatDuration(workout.duration_minutes)}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </>
  );
}
```

**B8. NEW `components/people/ActivityVisibilityNotice.tsx`.** U-1(b). Skip this step if U-1 = (a), and also delete its render line in B5.
```tsx
"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMemberProfile, updateMemberProfile } from "@/lib/api/members";
import { PEOPLE_COPY, peopleKeys } from "@/lib/api/people";
import { toAppError } from "@/lib/kit/app-error";
import { Modal } from "@/components/ui/Modal";

const NOTICE_PREFIX = "rasi.fiters.activityNotice."; // + member id — device-local (people D-C12, U-1 b)

// The one-time "Who can see your activity" notice (U-1 b), shown on the People page before it first shows other
// people. A real choice — no backdrop dismiss: Keep visible, or Hide my activity (PUT /members/:id). Never shown to a
// member who already hid their activity in My Profile. The flag lives in localStorage, read in an effect (no hydration
// mismatch).
export function ActivityVisibilityNotice({ token, memberId }: { token: string; memberId: string }) {
  const queryClient = useQueryClient();
  const profileKey = ["account", "profile", memberId];
  const profileQuery = useQuery({
    queryKey: profileKey,
    queryFn: () => fetchMemberProfile(token, memberId),
    enabled: !!token && !!memberId
  });
  const [seen, setSeen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (memberId) setSeen(localStorage.getItem(NOTICE_PREFIX + memberId) === "1");
  }, [memberId]);

  const remember = () => {
    localStorage.setItem(NOTICE_PREFIX + memberId, "1");
    setSeen(true);
  };

  const hide = useMutation({
    mutationFn: () => updateMemberProfile(token, memberId, { hide_activity: true }),
    onMutate: () => setError(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileKey });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      remember();
    },
    onError: (e) => setError(toAppError(e).message)
  });

  const alreadyHidden = profileQuery.data?.hide_activity === true;
  useEffect(() => {
    if (!seen && alreadyHidden) remember();
  }, [seen, alreadyHidden]);

  const open = !seen && !alreadyHidden && !profileQuery.isPending;

  return (
    <Modal open={open} onClose={() => undefined}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-notice-title"
        className="modal-surface w-full max-w-md rounded-3xl p-6"
      >
        <h3 id="activity-notice-title" className="text-lg font-semibold text-rf-text">
          {PEOPLE_COPY.noticeTitle}
        </h3>
        <p className="mt-2 text-sm text-rf-text-muted">{PEOPLE_COPY.noticeBody}</p>
        {error && <p className="mt-4 text-sm font-semibold text-rf-danger">{error}</p>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={hide.isPending}
            onClick={remember}
            className="button-primary button-primary--dark-white rounded-2xl px-4 py-3 text-sm font-semibold"
          >
            {PEOPLE_COPY.noticeKeep}
          </button>
          <button
            type="button"
            disabled={hide.isPending}
            onClick={() => hide.mutate()}
            className="pill-button rounded-2xl px-4 py-3 text-sm font-semibold"
          >
            {hide.isPending ? PEOPLE_COPY.saving : PEOPLE_COPY.noticeHide}
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

**B9. NEW `components/members/MemberDashboardCards.tsx`.** Moved from `app/members/page.tsx` with a kit `status` on each card. `MemberMetricsSingleCard` stays in the page.
```tsx
"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MemberHealthItem, MemberHistoryPoint, MemberMetrics, MemberRecentItem } from "@/lib/api/members";
import type { AsyncState } from "@/lib/kit/async-state";
import { dietLabel, formatDuration, formatShortDate, initials, sleepLabel, stepsLabel } from "@/lib/format";
import { GlassCard } from "@/components/ui/GlassCard";
import {
  CHART_AXIS_TICK,
  CHART_COLORS,
  CHART_GRID_PROPS,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_LABEL_STYLE
} from "@/lib/chart-theme";

// The Members-tab dashboard cards (moved from app/members/page.tsx — People S5 = polish #32). Each card takes the kit
// status of its read (frontend-kit §5): "loading" → "Loading..." / "…", "failed" → "—" (the page shows the one
// ErrorView + Retry), "ready" → the data; an empty list reads "No … yet" ONLY when the read succeeded.
export type CardStatus = "loading" | "failed" | "ready";

export function toCardStatus(state: AsyncState<unknown>): CardStatus {
  if (state.status === "failed") return "failed";
  if (state.status === "loaded" || state.status === "stale") return "ready";
  return "loading";
}

const valueOr = (status: CardStatus, value: string) => (status === "ready" ? value : status === "loading" ? "…" : "—");
const lineFor = (status: CardStatus, empty: string) =>
  status === "loading" ? "Loading..." : status === "failed" ? "—" : empty;

// The tappable card chrome shared by the four drill-down cards (identical classes to the originals).
function LinkCard({
  label,
  title,
  aside,
  compactTop = false,
  onClick,
  children
}: {
  label: string;
  title: string;
  aside?: React.ReactNode;
  compactTop?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`glass-card group rounded-3xl ${compactTop ? "px-5 pb-5 pt-3" : "p-5"} text-left transition hover:-translate-y-0.5 hover:shadow-lg`}
    >
      <div className={`flex ${compactTop ? "items-start" : "items-center"} justify-between`}>
        <div>
          <p className="text-sm font-semibold text-rf-text-muted">{label}</p>
          <p className="text-lg font-semibold text-rf-text">{title}</p>
        </div>
        {aside ?? <span className="text-sm font-semibold text-rf-text-muted">›</span>}
      </div>
      {children}
    </button>
  );
}

export function MemberOverviewCard({
  metric,
  status,
  programStart,
  programEnd
}: {
  metric?: MemberMetrics;
  status: CardStatus;
  programStart?: string | null;
  programEnd?: string | null;
}) {
  const totalDays = useMemo(() => {
    if (!programStart || !programEnd) return 0;
    const start = new Date(programStart);
    const end = new Date(programEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
  }, [programStart, programEnd]);
  const progressPct = metric && totalDays ? Math.round((metric.active_days / totalDays) * 100) : 0;

  return (
    <GlassCard>
      <p className="text-sm font-semibold text-rf-text-muted">Member Overview</p>
      {metric ? (
        <>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="metric-pill flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-rf-text">
                {initials(metric.member_name)}
              </div>
              <div>
                <p className="text-base font-semibold text-rf-text">{metric.member_name}</p>
                <p className="text-xs text-rf-text-muted">MTD Workouts: {metric.mtd_workouts ?? 0}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-rf-accent">{progressPct}%</p>
              <p className="text-xs text-rf-text-muted">PTD MP %</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="metric-pill rounded-2xl px-3 py-2">
              <p className="text-xs text-rf-text-muted">Total Time</p>
              <p className="text-sm font-semibold text-rf-text">
                {metric.total_hours ?? Math.round(metric.total_duration / 60)} hrs
              </p>
            </div>
            <div className="metric-pill rounded-2xl px-3 py-2">
              <p className="text-xs text-rf-text-muted">Favorite</p>
              <p className="text-sm font-semibold text-rf-text">{metric.favorite_workout ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold text-rf-text-muted">PTD - Member Progress</p>
            <div className="progress-track mt-2 h-2 w-full overflow-hidden rounded-full">
              <div className="h-full rounded-full bg-rf-accent" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="mt-2 text-xs text-rf-text-muted">
              {metric.active_days} / {totalDays} days
            </p>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-rf-text-muted">{lineFor(status, "No workouts logged yet.")}</p>
      )}
    </GlassCard>
  );
}

export function MemberHistoryCard({
  points,
  label,
  dailyAverage,
  status,
  onClick
}: {
  points: MemberHistoryPoint[];
  label: string;
  dailyAverage: number;
  status: CardStatus;
  onClick: () => void;
}) {
  return (
    <LinkCard
      label="Workout Activity"
      title={label || "Last 7 days"}
      onClick={onClick}
      aside={
        <div className="text-right">
          <p className="text-xs text-rf-text-muted">Daily avg</p>
          <p className="text-base font-semibold text-rf-text">{valueOr(status, dailyAverage.toFixed(1))}</p>
        </div>
      }
    >
      <div className="mt-4 h-36">
        {status === "ready" ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points}>
              <CartesianGrid {...CHART_GRID_PROPS} />
              <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
              <YAxis hide />
              <Tooltip
                contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                formatter={(value: number) => [value, "Workouts"]}
              />
              <Bar dataKey="workouts" fill={CHART_COLORS[0]} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-rf-text-muted">{lineFor(status, "")}</div>
        )}
      </div>
    </LinkCard>
  );
}

export function MemberStreakCard({
  current,
  longest,
  status,
  onClick
}: {
  current: number;
  longest: number;
  status: CardStatus;
  onClick: () => void;
}) {
  return (
    <LinkCard label="Streak Stats" title="Current and longest" compactTop onClick={onClick}>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="metric-pill rounded-2xl px-3 py-3">
          <p className="text-xs text-rf-text-muted">Current</p>
          <p className="text-base font-semibold text-rf-text">{valueOr(status, `${current} days`)}</p>
        </div>
        <div className="metric-pill rounded-2xl px-3 py-3">
          <p className="text-xs text-rf-text-muted">Longest</p>
          <p className="text-base font-semibold text-rf-text">{valueOr(status, `${longest} days`)}</p>
        </div>
      </div>
    </LinkCard>
  );
}

export function MemberRecentCard({
  items,
  status,
  onClick
}: {
  items: MemberRecentItem[];
  status: CardStatus;
  onClick: () => void;
}) {
  return (
    <LinkCard label="View Workouts" title="All workouts" onClick={onClick}>
      <div className="mt-4 space-y-2 text-sm">
        {(status !== "ready" || items.length === 0) && (
          <p className="text-sm text-rf-text-muted">{lineFor(status, "No workouts logged yet.")}</p>
        )}
        {status === "ready" &&
          items.slice(0, 3).map((item) => (
            <div key={item.id} className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-rf-text">{item.workoutType}</p>
                <p className="text-xs text-rf-text-muted">{formatShortDate(item.workoutDate) ?? item.workoutDate}</p>
              </div>
              <p className="font-semibold text-rf-text">{formatDuration(item.durationMinutes)}</p>
            </div>
          ))}
      </div>
    </LinkCard>
  );
}

export function MemberHealthCard({
  items,
  status,
  onClick
}: {
  items: MemberHealthItem[];
  status: CardStatus;
  onClick: () => void;
}) {
  return (
    <LinkCard label="View Health" title="Daily health logs" onClick={onClick}>
      <div className="mt-4 space-y-2 text-sm">
        {(status !== "ready" || items.length === 0) && (
          <p className="text-sm text-rf-text-muted">{lineFor(status, "No daily health logs yet.")}</p>
        )}
        {status === "ready" &&
          items.slice(0, 3).map((item) => (
            <div key={item.id}>
              <p className="font-semibold text-rf-text">{item.logDate}</p>
              <p className="text-xs text-rf-text-muted">
                Sleep {sleepLabel(item.sleepHours)} · Diet {dietLabel(item.foodQuality)} · Steps {stepsLabel(item.steps)}
              </p>
            </div>
          ))}
      </div>
    </LinkCard>
  );
}
```

**B10. `app/members/page.tsx` (People pill + S5)**
- (a) Replace the import block, from `import { useEffect, useMemo, useState } from "react";` through `} from "@/lib/chart-theme";`, with:
```tsx
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { fetchProgramMembers, type Member } from "@/lib/api/programs";
import {
  fetchMemberHealthLogs,
  fetchMemberHistory,
  fetchMemberMetrics,
  fetchMemberRecentWorkouts,
  fetchMemberStreaks,
  type MemberMetrics
} from "@/lib/api/members";
import { PEOPLE_COPY, PEOPLE_LIVE } from "@/lib/api/people";
import { initials, stepsLabel } from "@/lib/format";
import { appError } from "@/lib/kit/app-error";
import { fromQuery, retryNow, type QueryLike } from "@/lib/kit/async-state";
import { useOnlineStatus, useRefetchOnReconnect } from "@/lib/kit/use-online-status";
import { FlameIcon, IconMail as MailIcon } from "@/components/icons";
import { PageShell } from "@/components/ui/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Modal } from "@/components/ui/Modal";
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";
import {
  MemberHealthCard,
  MemberHistoryCard,
  MemberOverviewCard,
  MemberRecentCard,
  MemberStreakCard,
  toCardStatus
} from "@/components/members/MemberDashboardCards";
```
- (b) After `const router = useRouter();` in `MembersPage`, add:
```tsx
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
```
- (c) After `const memberOverview = memberOverviewQuery.data?.members?.[0];`, insert:
```tsx
  // People S5 = polish #32 (the frontend-kit Summary recipe): one ErrorView + Retry for any read that failed with nothing
  // to show, "Loading..." / "—" in the cards (never a fake 0 or "No workouts logged yet" on a failure), the stale banner
  // when a reload failed over kept data, and failed reads reload when the connection returns (web: no pull-to-refresh).
  const dashboardQueries = [membersQuery, metricsPreviewQuery, memberOverviewQuery, memberHistoryQuery,
    memberStreakQuery, memberRecentQuery, memberHealthQuery];
  const dashboardKeys = [
    ["members", "list", programId],
    ["members", "metrics", programId, "preview"],
    ["members", "overview", programId, overviewMemberId],
    ["members", "history", programId, overviewMemberId],
    ["members", "streaks", programId, overviewMemberId],
    ["members", "recent", programId, logsMemberId],
    ["members", "health", programId, logsMemberId]
  ]; // same order as dashboardQueries (= the useQuery keys above)
  const dashboardStates = dashboardQueries.map((query) => fromQuery<unknown>(query));
  const failedState = dashboardStates.find((state) => state.status === "failed");
  const dashboardError = failedState?.status === "failed" ? failedState.error : null;
  const dashboardStale = dashboardStates.some((state) => state.status === "stale");
  const retryDashboard = () =>
    dashboardQueries.forEach((query, index) => {
      if (query.isError || query.failureCount > 0) void retryNow(queryClient, dashboardKeys[index]);
    });
  useRefetchOnReconnect(dashboardQueries);
  const statusOf = (query: QueryLike<unknown>) => toCardStatus(fromQuery(query));
```
- (d) Replace the header block from `{!canViewAs && (` (the one whose button pushes `"/members/list"` and reads `View Members`) through its closing `)}` with:
```tsx
          {(PEOPLE_LIVE || !canViewAs) && (
            <button
              type="button"
              onClick={() => router.push("/members/list")}
              className="pill-button rounded-full px-4 py-2 text-xs font-semibold transition"
            >
              {PEOPLE_LIVE ? PEOPLE_COPY.title : "View Members"}
            </button>
          )}
```
- (e) Directly after `</header>`, insert:
```tsx
      {dashboardError && <ErrorView error={online ? dashboardError : appError("offline")} onRetry={retryDashboard} />}
```
- (f) Replace the whole `{isProgramAdmin && ( <button … onClick={() => router.push("/members/metrics")} …> … </button> )}` block with:
```tsx
      {isProgramAdmin && (
        <button
          type="button"
          onClick={() => router.push("/members/metrics")}
          className="glass-card group w-full rounded-3xl p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-rf-text-muted">Member Performance Metrics</p>
              <p className="text-xs font-semibold text-rf-text-muted">
                {metricsPreviewQuery.data
                  ? `${metricsPreviewQuery.data.total} members`
                  : statusOf(metricsPreviewQuery) === "failed"
                    ? "—"
                    : "Loading..."}
              </p>
            </div>
            <span className="text-sm font-semibold text-rf-text-muted">›</span>
          </div>
          <div className="mt-4">
            {statusOf(metricsPreviewQuery) === "loading" && (
              <div className="rounded-2xl bg-rf-surface-muted px-4 py-6 text-sm text-rf-text-muted">
                Loading metrics...
              </div>
            )}
            {statusOf(metricsPreviewQuery) === "failed" && <p className="text-sm text-rf-text-muted">—</p>}
            {metricsPreviewQuery.data && metricsPreviewQuery.data.members.length > 0 && (
              <MemberMetricsPreview metric={metricsPreviewQuery.data.members[0]} />
            )}
            {metricsPreviewQuery.data && metricsPreviewQuery.data.members.length === 0 && (
              <p className="text-sm text-rf-text-muted">No members to display yet.</p>
            )}
          </div>
        </button>
      )}
```
- (g) Card call sites:
  - Add `status={statusOf(memberOverviewQuery)}` to every `<MemberOverviewCard` (3 sites).
  - Add `status={statusOf(memberHistoryQuery)}` to every `<MemberHistoryCard` (3).
  - Add `status={statusOf(memberStreakQuery)}` to every `<MemberStreakCard` (3).
  - Add `status={statusOf(memberRecentQuery)}` to every `<MemberRecentCard` (3).
  - Add `status={statusOf(memberHealthQuery)}` to every `<MemberHealthCard` (3).
  - Place each new prop directly after the element's first existing prop. No other change to the role blocks.
- (h) After the `{activePicker && ( <MemberPickerModal … /> )}` block and before `</PageShell>`, insert:
```tsx
      {/* Kit stale state (kept data stays): hidden while the global offline banner shows; the spacer keeps the page end
          scrollable above the banner. */}
      {dashboardStale && !dashboardError && online && (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="stale" onRetry={retryDashboard} />
        </>
      )}
```
- (i) Delete the five functions `MemberOverviewCard`, `MemberHistoryCard`, `MemberStreakCard`, `MemberRecentCard` and `MemberHealthCard`. Keep `MemberMetricsSingleCard`, `MemberMetricsPreview` and `MemberPickerModal`.

**B11. `app/program/page.tsx`**
- After `import { INBOX_HREF } from "@/lib/notifications/targets";` (added in A13), add `import { PEOPLE_COPY, PEOPLE_LIVE } from "@/lib/api/people";`.
- Replace `<p>View Members</p>` with `<p>{PEOPLE_LIVE ? PEOPLE_COPY.title : "View Members"}</p>`.

**B12. `app/privacy-policy/page.tsx`.** People §A items 1–5, verbatim. Apply bottom-up, matching quoted text. Keep the BrandMark, and keep A19's lines if U-W1 was yes.
- (a) After `<li>Access or update your information in the app.</li>`, insert:
```tsx
            <li>Turn on Hide my activity (My Profile) to hide your workouts, workout stats and kudos from other members of your programs. You stay on your programs&apos; member lists by name, program admins and loggers still see your activity, and program totals still include it.</li>
```
- (b) Directly after `<p className="text-base font-semibold text-rf-text">Sharing of information</p>` and its following `<ul className="mt-2 list-disc space-y-1 pl-5">`, insert as the first item:
```tsx
            <li>Other members of your programs: members of a program you belong to can see your name, username and program role. They can also see your workouts, workout stats (such as streaks and active days) and the kudos you receive — including workouts synced from Apple Health or Health Connect — unless you turn on Hide my activity in My Profile. Program admins and loggers can always see your activity in their programs. Your sleep, diet and steps are visible only to you, your program&apos;s admins and loggers, and RaSi Fiters administrators. Your email address is never shown to other members.</li>
```
- (c) After the `<li>We use data read from Apple Health or Health Connect only…</li>` line, insert:
```tsx
            <li>Workouts created from Apple Health or Health Connect are part of your program activity: other members of your programs can see them, along with your streaks and active days, unless you turn on Hide my activity in My Profile. Sleep and steps are never shown to other members — only you, your program&apos;s admins and loggers, and RaSi Fiters administrators can see them.</li>
```
- (d) In the bullet beginning `<li>Deliver push and in-app notifications (for example program updates, membership or role changes).`, change the parenthesis to `(for example program updates, membership or role changes, and kudos from other members)`.
- (e) Set `subtitle="Effective date: …"` to today's date (`date +%F`). E6 re-stamps it at commit.

**B13. `app/program/privacy/page.tsx`.** The identical B12 edits (a)–(e), at the same quoted anchors.

## Docs (the orchestrator's docs commit after each pass; not the implementer)

**After Pass A:**
- Page SPECs:
  - `specs/pages/web/programs/SPEC.md` v0.3.2 → v0.4.0:
    - Inbox tab: invites first, then InboxList; the empty-invites box is removed.
    - Badge = server `badge` for every role, with fallback. This is a **deliberate change for global admins** (W4).
    - W13; `?open=inbox` / `OPEN_INBOX_EVENT`.
    - Account rows (Inbox with count, Notifications, Announcements for global admins).
    - C7.7.
  - `specs/pages/web/program/SPEC.md` v0.1.1 → v0.2.0: the three account rows plus W18.
  - NEW v0.1.0: `specs/pages/web/program/notifications/SPEC.md` and `specs/pages/web/program/announcements/SPEC.md` (W15, W19, W11).
  - If U-W1 is yes: privacy-policy v0.2.3 → v0.2.4 and program/privacy v0.2.2 → v0.2.3.
- `specs/pages/REGISTRY.md`: 2 new rows; inventory 37 → 39.
- Feature SPECs:
  - notifications: a web-realization D-rule (C7 on web; W9, W14, W17, W18; the composer), replacing D-C18's web clause. F7/F8 superseded. The D-C2/D-C5 `NotificationsGate.tsx:144` citations → `lib/notifications/stream.ts`.
  - invites: Inbox tab, global-admin badge, C7.7 (PATCH).
  - observability: §4.1 notes that web sends `X-Time-Zone` (PATCH).
- `specs/features/registry.json` and `REGISTRY.md`.
- `apps/web/CONTEXT.md`:
  - SSE bullet: `?inbox=1`, onStart/ready catch-up, no legacy feed.
  - NotificationsGate bullet: toast, no modal.
  - `~33 routes` → `~35`.

**After Pass B:**
- Page SPECs:
  - members v0.3.0 → v0.4.0 (People pill W1; S5 recipe; cards moved).
  - members/list v0.1.1 → v0.2.0 (`PEOPLE_LIVE`: RosterList vs PeopleList; the notice).
  - NEW `members/person` v0.1.0 (W6, W7).
  - program/profile v0.3.0 → v0.4.0 (Hide my activity, W2).
  - program v0.2.0 → v0.2.1 (label behind the flag).
  - privacy-policy and program/privacy: next PATCH (People §A text).
- REGISTRY.md (pages): +1 row (inventory → 40). Fix members/list `fetchProgramMembers` → `fetchMembershipDetails` / `fetchPeople`, and members/detail `removeMember` → `removeMembership`.
- people feature SPEC: `consumed_by` += web, plus a web D-rule (W1, W3 key, W6, W7).
- registry: people `consumed_by` += web.
- `apps/web/CONTEXT.md`: one `PEOPLE_LIVE` line, route count +1.

## Endgame

**E1. Pass A compile check (Claude):**
```bash
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web && npm run build
grep -rnE "fetchUnacknowledgedNotifications|acknowledgeNotification|NotificationModal|notifications/unacknowledged" src && echo "LEGACY LEFT" || echo "legacy pop-up queue gone"
rm -rf .next && df -h /System/Volumes/Data | tail -1
```
- The build must pass, and the grep must print `legacy pop-up queue gone`.
- No `npm run lint`: there is no ESLint config, so it would start an interactive setup.
- No iOS ⌘B and no gradlew: this track touches no iOS or Android files.

**E2. Pass A commit and deploy** (orchestrator, with the user's go). **Gate A:** N-SRV step 31(g) prod smoke has passed, meaning 011 is on public and the notifications 0.6.0 backend is live.
- Until gate A, Pass A stays uncommitted. Only apps/web is affected, and every other track's commit stages its own paths, never a root `git add -A`.
- Then:
```bash
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master
# only if A19 (U-W1 = yes) was applied:
TODAY=$(date +%F); sed -i '' "s/Effective date: [0-9-]*/Effective date: $TODAY/" apps/web/src/app/privacy-policy/page.tsx apps/web/src/app/program/privacy/page.tsx
git add -A -- apps/web
git commit -F - <<'EOF'
feat(web): Phase 4 notifications — Inbox in the "+" sheet, a toast instead of pop-ups, notification settings, announcement composer

N3 + composer (D-N3/D-N4/D-N5/D-N16): ?inbox=1 stream with start/ready catch-up, server badge, mark-read on open,
settings page (5 categories, reminder time, X-Time-Zone), global-admin composer with exact-preview send + history.
Plan: Phase 4 Track C web, revision 2 (Pass A). SPEC bumps follow in the orchestrator docs commit.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git push origin main
cd apps/web && vercel ls --scope personal-vinayak | head -5
```
- If the newest deployment is Canceled or Error, run `vercel --prod --yes --scope personal-vinayak`.
- Verify on the apex `https://rasifiters.com`.

**E3. Pass A: the user's checks on prod**, at 375 px and 1280 px. Staging isn't needed: there is no migration and no auth change in this track.
- The "+" badge and the Inbox row counts in both account menus.
- Inbox tab: invites first, dots, Load more, and the badge drops after opening.
- Toast: from a second account, change your role or invite you.
  - "View" routes correctly.
  - The toast never shows over an open sheet.
  - Hide the tab, demote the account from the other account, and return: the admin UI disappears (catch-up).
- Settings: a switch and the reminder time survive a reload.
- Composer, as a global admin:
  - The preview updates about 2 s after typing.
  - Send stays disabled until the preview is current.
  - Send to Members → "You" → an inbox item on web and a pop-up on an old phone app.
  - Schedule (tomorrow), then Cancel.

**E4. Pass B start condition.** Pass A is committed AND the re-planned S1 plan is approved. The orchestrator then re-checks the People contract (see the note above B1).

**E5. Pass B compile check (Claude):**
```bash
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web && npm run build
grep -n "export const PEOPLE_LIVE: boolean = false;" src/lib/api/people.ts
rm -rf .next && df -h /System/Volumes/Data | tail -1
```

**E6. Pass B commit and deploy.** **Gate B:** 012 is on public, the S1 backend is live and its prod smoke has passed. Then:
```bash
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master
TODAY=$(date +%F); sed -i '' "s/Effective date: [0-9-]*/Effective date: $TODAY/" apps/web/src/app/privacy-policy/page.tsx apps/web/src/app/program/privacy/page.tsx
git add -A -- apps/web
git commit -F - <<'EOF'
feat(web): Phase 4 People (dark until release) — Hide my activity, People list + profiles + kudos, Members tab kit states, privacy text

S2 behind PEOPLE_LIVE=false (today's roster stays until the store release), Hide my activity in My Profile, People
privacy text, S5 (polish #32) Members dashboard: loading / "Couldn't load · Retry" / no fake zeros.
Plan: Phase 4 Track C web, revision 2 (Pass B). SPEC bumps follow in the orchestrator docs commit.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git push origin main
cd apps/web && vercel ls --scope personal-vinayak | head -5
```
Use the same Vercel fallback and apex check as E2.

**E7. Pass B: the user's checks on prod** (375 / 1280 px).
- `/members/list` looks exactly like today.
- Hide my activity:
  - persists after a reload;
  - edit the name, flip the switch, then save: the name edit survives.
- Members tab with DevTools Offline: ErrorView plus Retry, cards show "—", and they recover on reconnect.
- `/members/person?memberId=<id>` opened by URL as an admin (Open full stats → View as), a logger (→ workouts list) and a plain member; a hidden member shows the hidden line.
- Kudos: give, undo, count.
- Both privacy pages.
- Optional: a local `npm run dev` against prod with `PEOPLE_LIVE` flipped temporarily and **not committed**, to review the list and the notice.

**E8. Store-release day.** A one-line `feat(web): People goes live` commit: `export const PEOPLE_LIVE: boolean = true;`.
- Push it with the store release.
- Re-check `/members/list`, the notice, the Program-tab "People" label, the Members-tab pill for every role, and kudos.

**E9. Post-release cleanup** (after E8 is verified). This is a `refactor(web)` commit in `app/members/list/page.tsx`:
- Delete `function RosterList` and `function MemberRow`.
- The default export body becomes `return <PeopleList />;`.
- Delete the now-unused imports: `fetchMembershipDetails, type MembershipDetail` (the whole `@/lib/api/programs` import), `toAppError` (keep `appError`), `initials`, `ErrorState`, and `PEOPLE_LIVE` from the people import.
- Run `npm run build`.

**E10. Migrations:** none in this track. Web depends on **011** (N-SRV) and **012** (S1); the USER runs both in those tracks.

**E11. git-version:**
- Feat commits E2, E6, E8 and E9 carry no bump.
- Docs commit after Pass A:
  - notifications: next MINOR above the N-SRV/S1 landing (expected **v0.7.0**), shared with N4/N5's adoption;
  - invites **v0.2.2**;
  - observability **v0.4.1**.
- Docs commit after Pass B: people **v0.2.0** (`consumed_by` += web).
- Tag each touched feature on its docs commit and push the tags by name.
- members and frontend-kit: FYI, no bump.

## Risks the implementer must watch
- **Pass order is load-bearing.**
  - Pass A must not be committed before gate A, because any track's push to main ships it to Vercel.
  - Pass B starts only after Pass A is committed: `program/page.tsx`, and the privacy pages if U-W1 is yes, are edited by both passes.
- **The S1 contract may still change** (its seams are being re-planned). Pass B builds only against the approved revision.
- **Glass-card containing block.** Every `Modal`/`ConfirmDialog` stays OUTSIDE a `GlassCard`. The composer uses a native `<select>`.
- **The toast and the offline banner render above page modals**, because they are outside `<main>`, a z-10 stacking context. The gate's `useBodyModalOpen` suppression is what keeps the toast off sheets; don't remove it.
- **Catch-up cost.** Every reconnect re-reads `GET /programs` (throttled to 5 s), plus the unread count and the inbox. Global admins get every program from `GET /programs` (programService.getPrograms), so the stored program is never cleared for them.
- **Read = acknowledged.** Opening the web inbox, or receiving an item while it's open, marks it read on every device, including the old apps' pop-up queues. Intended (D-N5).
- **Composer.**
  - "Everyone" includes the sender.
  - Recipients are snapshotted when sent.
  - Rate limits are per instance (preview 30/min, send 10/h).
  - A 400 shows the server's text.
  - It is testable only on prod; test with the "You" row.
- **`PEOPLE_LIVE` must be flipped on release day (E8)**, and E9 removes the dark roster afterwards.
- **"Open full stats" is coupled** to `members/page.tsx`'s `rf:members:view-as:<programId>:<viewerId>` key. If it is renamed, update `members/person/page.tsx`.
- **U-1 / U-3 / U-W1 alternatives.**
  - U-1(a): skip B8 and its render line.
  - U-1(c): STOP and re-plan.
  - U-3 "People early": set `PEOPLE_LIVE = true` in B1.
  - U-W1 yes: apply A19.
- **Parity.** The orchestrator must copy the Shared client contract table into N4/N5/S3/S4 before approval. The web-only items (the composer, the `webNote`, no pull-to-refresh, no permission or badge or channels, the `PEOPLE_LIVE` flag) are sanctioned divergences.
