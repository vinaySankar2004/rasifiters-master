"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { forceSessionRefresh, freshSessionToken } from "@/lib/api/client";
import type { InboxItem } from "@/lib/api/notifications";
import { useOnlineStatus } from "@/lib/kit/use-online-status";

// The live notification stream (notifications SPEC §3.3 + the inbox contract): `?inbox=1` makes every
// `event: notification` frame an inbox item, for every type (a plain stream carries only the legacy types).
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
