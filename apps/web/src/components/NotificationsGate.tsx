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
import { NotificationToast, modalOnScreen, useModalOnScreen } from "@/components/notifications/NotificationToast";

// The app-wide notification gate (notifications SPEC §3.3 + the inbox contract; mounted once in app/shell.tsx). D-N3:
// the blocking one-at-a-time pop-up queue is gone — a live inbox item (the ?inbox=1 stream) refreshes the queries it
// affects, updates the unread badge + the inbox, and shows the small toast ("<title> · View") when the member has its
// category on and no modal / sheet is on screen (the toast rule). The legacy pop-up feed is never read; the inbox is
// ("+" sheet, D-N4). The catch-up rule: the stream never replays and pauses while the tab is hidden, so every (re)start
// and every `ready` re-reads the unread count + the inbox (if on screen), and — at most once per 5 s — the programs,
// the invites and the stored active program (role-dependent queries too when it changed). D-C6: never on the pre-auth
// routes.
const AUTH_ROUTES = ["/login", "/create-account", "/splash", "/forgot-password", "/reset-password"];
// The routing rule (navigation never discards an open form): page forms without a modal surface count as a modal — no
// toast there (the badge + inbox still update; the item stays unread).
const FORM_ROUTES = ["/program/profile", "/program/password", "/program/edit", "/members/detail", "/program/announcements"];
const onFormRoute = (path: string | null) =>
  !!path && FORM_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));
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
  const modalOpen = useModalOnScreen();
  const lastCatchUp = useRef(0);
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname?.startsWith(route));
  const shouldRun = !!token && !isBootstrapping && !isAuthRoute;
  const formRoute = onFormRoute(pathname);

  // Cached app-wide: the badge count and the preferences the toast rule reads (that GET also stores the browser's time
  // zone server-side — D-N6).
  useUnreadCount(token, shouldRun);
  const preferences = usePreferencesQuery(token, shouldRun);
  const markRead = useMarkRead(token);

  // Nothing of a previous session survives sign-out; a toast never sits over a modal / sheet or a page form.
  useEffect(() => {
    if (!shouldRun || modalOpen || formRoute) setToast(null);
  }, [shouldRun, modalOpen, formRoute]);

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

  // notifications D-C7 / D-C30: every key below lands on a live query (the broad ["program"] covers the roles cache). The general
  // program refetches run for program.* types only — a reminder, digest or "everyone" announcement refetches nothing.
  const refreshQueriesFor = async (item: InboxItem) => {
    if (item.type === "activity.kudos_received") await queryClient.invalidateQueries({ queryKey: ["people"] });
    if (!item.type.startsWith("program.")) return;
    const programId = loadActiveProgram()?.id ?? "";
    await queryClient.invalidateQueries({ queryKey: ["programs"] });
    if (programId) {
      await queryClient.invalidateQueries({ queryKey: ["program", "membership-details", programId] });
      await queryClient.invalidateQueries({ queryKey: ["members", "list", programId] });
      await queryClient.invalidateQueries({ queryKey: ["program", "workouts", programId] });
      await queryClient.invalidateQueries({ queryKey: ["members", "metrics", programId, "preview"] });
    }
    if (item.type === "program.invite_received") await queryClient.invalidateQueries({ queryKey: ["invites"] });
    if (MEMBERSHIP_TYPES.has(item.type)) {
      await refreshRoleQueries();
      await refreshActiveProgram();
    }
  };

  // The unread count is always active (above); the inbox refetches only while its list is mounted (on screen).
  const refreshInbox = () => {
    void queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.unread });
    void queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.inbox });
  };

  // A role change / removal / invite that landed while the stream was down (tab hidden, offline, deploy).
  const catchUp = () => {
    refreshInbox();
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
    onReady: catchUp,
    onItem: (item) => {
      refreshInbox();
      void refreshQueriesFor(item);
      const categoryOn = preferences.data?.categories?.[item.category] !== false;
      if (categoryOn && !formRoute && !modalOnScreen()) setToast(item);
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
