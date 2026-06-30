"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-provider";
import { API_BASE_URL } from "@/lib/config";
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

const sortByCreatedAt = (items: NotificationItem[]) =>
  [...items].sort((a, b) => {
    const aTime = a.created_at ? Date.parse(a.created_at) : 0;
    const bTime = b.created_at ? Date.parse(b.created_at) : 0;
    return aTime - bTime;
  });

export function NotificationsGate() {
  const { session, isBootstrapping } = useAuth();
  const token = session?.token ?? "";
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<NotificationItem[]>([]);
  const idsRef = useRef(new Set<string>());
  const sourceRef = useRef<EventSource | null>(null);

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

  const addNotifications = (incoming: NotificationItem[]) => {
    if (incoming.length === 0) return;
    setQueue((prev) => {
      const next = [...prev];
      incoming.forEach((item) => {
        if (idsRef.current.has(item.id)) return;
        idsRef.current.add(item.id);
        next.push(item);
        void refreshQueriesForNotification(item);
      });
      return sortByCreatedAt(next);
    });
  };

  useEffect(() => {
    if (!shouldRun) {
      setQueue([]);
      idsRef.current.clear();
      return;
    }

    fetchUnacknowledgedNotifications(token)
      .then((items) => addNotifications(items))
      .catch(() => {
        // Silent fail; will retry via stream or next navigation
      });
  }, [token, shouldRun]);

  useEffect(() => {
    if (!shouldRun) {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      return;
    }

    const streamUrl = `${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(streamUrl);
    sourceRef.current = eventSource;

    const onNotification = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as NotificationItem;
        if (parsed?.id) {
          addNotifications([parsed]);
        }
      } catch {
        // ignore malformed events
      }
    };

    eventSource.addEventListener("notification", onNotification);
    eventSource.onerror = () => {
      // Let the browser auto-retry; keep existing queue
    };

    return () => {
      eventSource.removeEventListener("notification", onNotification);
      eventSource.close();
      sourceRef.current = null;
    };
  }, [token, shouldRun]);

  const handleAcknowledge = async () => {
    if (!currentNotification || !shouldRun) return;
    const notificationId = currentNotification.id;
    setQueue((prev) => prev.filter((item) => item.id !== notificationId));
    idsRef.current.delete(notificationId);
    try {
      await acknowledgeNotification(token, notificationId);
    } catch {
      // If acknowledge fails, refresh queue on next tick
      fetchUnacknowledgedNotifications(token)
        .then((items) => {
          idsRef.current.clear();
          setQueue(sortByCreatedAt(items));
          items.forEach((item) => idsRef.current.add(item.id));
        })
        .catch(() => {});
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
