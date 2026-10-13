"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-provider";
import { API_BASE_URL } from "@/lib/config";
import { forceSessionRefresh, freshSessionToken } from "@/lib/api/client";
import {
  acknowledgeNotification,
  fetchUnacknowledgedNotifications,
  type NotificationItem
} from "@/lib/api/notifications";
import { NotificationModal } from "@/components/NotificationModal";
import { fetchPrograms } from "@/lib/api/programs";
import {
  clearActiveProgram,
  loadActiveProgram,
  saveActiveProgram
} from "@/lib/storage";
import { broadcastActiveProgramUpdate } from "@/lib/use-active-program";
import { useOnlineStatus } from "@/lib/kit/use-online-status";

const sortByCreatedAt = (items: NotificationItem[]) =>
  [...items].sort((a, b) => {
    const aTime = a.created_at ? Date.parse(a.created_at) : 0;
    const bTime = b.created_at ? Date.parse(b.created_at) : 0;
    return aTime - bTime;
  });

// SSE reconnect (notifications SPEC §3.3; values identical on iOS + Android): exponential backoff with full jitter,
// a 60 s idle timeout (the server pings every 25 s), no reconnects while offline.
const SSE_BASE_DELAY_MS = 1_000;
const SSE_MAX_DELAY_MS = 30_000;
const SSE_IDLE_TIMEOUT_MS = 60_000;
const SSE_FAILURES_BEFORE_REFRESH = 3;
// A just-acknowledged id is ignored by re-fetches for a while: a fetch sent before the acknowledge landed lists it.
const ACKED_TTL_MS = 2 * 60_000;

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

export function NotificationsGate() {
  const { session, isBootstrapping } = useAuth();
  const token = session?.token ?? "";
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const visible = useDocumentVisible();
  const online = useOnlineStatus();
  const [queue, setQueue] = useState<NotificationItem[]>([]);
  const idsRef = useRef(new Set<string>());
  const ackedRef = useRef(new Map<string, number>());
  const epochRef = useRef(0); // +1 whenever the gate stops (sign-out / auth route): late fetches are discarded

  const currentNotification = queue[0];
  // D-C1: reconcile the legacy auth-route list with the rebuild's two net-new
  // public auth routes (forgot-password / reset-password, runs 17–18) so the
  // notification modal never pops over any pre-auth surface.
  const isAuthRoute = [
    "/login",
    "/create-account",
    "/splash",
    "/forgot-password",
    "/reset-password"
  ].some((route) => pathname?.startsWith(route));
  const shouldRun = !!token && !isBootstrapping && !isAuthRoute;

  const refreshActiveProgram = async () => {
    const current = loadActiveProgram();
    if (!current || !token) return;
    try {
      const programs = await fetchPrograms(token);
      const updated = programs.find((program) => program.id === current.id);
      if (updated) {
        saveActiveProgram({
          id: updated.id,
          name: updated.name,
          status: updated.status ?? null,
          start_date: updated.start_date ?? null,
          end_date: updated.end_date ?? null,
          my_role: updated.my_role ?? null,
          my_status: updated.my_status ?? null,
          admin_only_data_entry: updated.admin_only_data_entry ?? false
        });
      } else {
        clearActiveProgram();
      }
      broadcastActiveProgramUpdate();
    } catch {
      // ignore; will retry on next notification
    }
  };

  const refreshQueriesForNotification = async (notification: NotificationItem) => {
    const program = loadActiveProgram();
    const programId = program?.id ?? "";
    await queryClient.invalidateQueries({ queryKey: ["programs"] });

    if (programId) {
      // D-C2: the legacy ["program","roles",programId] invalidation is dropped —
      // no rebuilt query uses that key (the broad ["program"] invalidation in the
      // membership-event branch covers the roles cache). Every other key below
      // lands on a live rebuilt query key.
      await queryClient.invalidateQueries({ queryKey: ["program", "membership-details", programId] });
      await queryClient.invalidateQueries({ queryKey: ["members", "list", programId] });
      await queryClient.invalidateQueries({ queryKey: ["program", "workouts", programId] });
      await queryClient.invalidateQueries({ queryKey: ["members", "metrics", programId, "preview"] });
    }

    if (notification.type === "program.invite_received") {
      await queryClient.invalidateQueries({ queryKey: ["invites", true] });
      await queryClient.invalidateQueries({ queryKey: ["invites", false] });
    }

    if (
      [
        "program.role_changed",
        "program.member_removed",
        "program.member_left",
        "program.member_joined",
        "program.admin_transferred",
        "program.updated",
        "program.deleted"
      ].includes(notification.type)
    ) {
      await queryClient.invalidateQueries({ queryKey: ["program"] });
      await queryClient.invalidateQueries({ queryKey: ["members"] });
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      await queryClient.invalidateQueries({ queryKey: ["lifestyle"] });
      await refreshActiveProgram();
    }
  };

  const recentlyAcknowledged = (id: string) => {
    const at = ackedRef.current.get(id);
    if (at === undefined) return false;
    if (Date.now() - at < ACKED_TTL_MS) return true;
    ackedRef.current.delete(id);
    return false;
  };

  // New items only; each one refreshes its queries (an invite refreshes the invite inbox).
  const addNotifications = (incoming: NotificationItem[]) => {
    if (incoming.length === 0) return;
    setQueue((prev) => {
      const next = [...prev];
      incoming.forEach((item) => {
        if (idsRef.current.has(item.id) || recentlyAcknowledged(item.id)) return;
        idsRef.current.add(item.id);
        next.push(item);
        void refreshQueriesForNotification(item);
      });
      return sortByCreatedAt(next);
    });
  };

  // /unacknowledged is authoritative for what was queued before it was sent: a queued item it no longer lists was
  // acknowledged elsewhere and is dropped; items the stream added meanwhile stay.
  const fetchPending = () => {
    const epoch = epochRef.current;
    const queuedBefore = new Set(idsRef.current);
    fetchUnacknowledgedNotifications(token)
      .then((items) => {
        if (epochRef.current !== epoch) return;
        const listed = new Set(items.map((item) => item.id));
        setQueue((prev) =>
          prev.filter((item) => {
            const keep = listed.has(item.id) || !queuedBefore.has(item.id);
            if (!keep) idsRef.current.delete(item.id);
            return keep;
          })
        );
        addNotifications(items);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!shouldRun) {
      epochRef.current += 1;
      setQueue([]);
      idsRef.current.clear();
      ackedRef.current.clear();
    }
  }, [shouldRun]);

  // Foreground-only stream (§3.3). /unacknowledged is fetched on every start (independent of the stream, so pending
  // modals still pop when it can't open) and on every `ready` (the stream never replays). Every close, error or 60 s
  // of silence = reconnect with a fresh token (a deploy ends streams with a plain close; a 401 leaves EventSource
  // CLOSED for good). EventSource hides the status, so after 3 failed opens in a row one session refresh runs
  // (rate-limited in client.ts) in case the server already treats the token as expired. Re-created on every token
  // change; paused while hidden or offline (the combined online value — link + API reachability — restarts it).
  useEffect(() => {
    if (!shouldRun || !visible || !online) return;
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
      const stream = new EventSource(`${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(fresh)}`);
      source = stream;
      armIdle(stream);
      stream.addEventListener("ready", () => {
        attempt = 0;
        failuresSinceReady = 0;
        armIdle(stream);
        fetchPending();
      });
      stream.addEventListener("ping", () => armIdle(stream));
      stream.addEventListener("notification", (event: MessageEvent<string>) => {
        armIdle(stream);
        try {
          const parsed = JSON.parse(event.data) as NotificationItem;
          if (parsed?.id) addNotifications([parsed]);
        } catch {
          // ignore malformed events
        }
      });
      stream.onerror = () => {
        drop(stream);
        scheduleReconnect();
      };
    }

    fetchPending();
    void connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (idleTimer) clearTimeout(idleTimer);
      source?.close();
    };
  }, [token, shouldRun, visible, online]);

  const handleAcknowledge = async () => {
    if (!currentNotification || !shouldRun) return;
    const notificationId = currentNotification.id;
    ackedRef.current.set(notificationId, Date.now());
    setQueue((prev) => prev.filter((item) => item.id !== notificationId));
    idsRef.current.delete(notificationId);
    try {
      await acknowledgeNotification(token, notificationId);
    } catch {
      // Not acknowledged: the re-fetch brings it back.
      ackedRef.current.delete(notificationId);
      fetchPending();
    }
  };

  const modalContent = useMemo(() => {
    if (!currentNotification) return null;
    return {
      title: currentNotification.title,
      body: currentNotification.body
    };
  }, [currentNotification]);

  return (
    <NotificationModal
      open={!!modalContent}
      title={modalContent?.title ?? ""}
      body={modalContent?.body ?? ""}
      onConfirm={handleAcknowledge}
    />
  );
}
