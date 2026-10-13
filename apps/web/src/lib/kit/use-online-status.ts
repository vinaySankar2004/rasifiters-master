import { useEffect, useRef, useSyncExternalStore } from "react";
import { API_BASE_URL } from "@/lib/config";

// Connectivity (frontend-kit SPEC §5, reliability polish-1): online = the link is up (navigator.onLine) AND the API is
// not proven unreachable. client.ts reports every request: a fetch rejected with a network error (never our own
// timeout abort — a slow server is not a lost connection) proves offline; any real HTTP answer clears it, as does a
// link down → up change or a probe. Probe = GET /app-config (public), no-store (it is cacheable for 5 min), 5 s
// timeout, right away then every 10 s — only while proven offline with the link up and the tab visible. ONE
// module-level store, so the banner, screens, SSE and refresh backoff all see the same value. SSR snapshot = online.

const PROBE_INTERVAL_MS = 10_000;
const PROBE_TIMEOUT_MS = 5_000;

let started = false;
let provenOffline = false;
let linkWasUp = true;
let lastOnline = true;
let probeTimer: ReturnType<typeof setTimeout> | undefined;
let probeInFlight = false;
const listeners = new Set<() => void>();
const reconnectListeners = new Set<() => void>();

const linkUp = (): boolean => typeof navigator === "undefined" || navigator.onLine;

/** The combined value now — also read outside React (the QueryClient retry policy). */
export function isOnlineNow(): boolean {
  return linkUp() && !provenOffline;
}

function emit(): void {
  const online = isOnlineNow();
  const reconnected = online && !lastOnline;
  lastOnline = online;
  listeners.forEach((listener) => listener());
  if (reconnected) reconnectListeners.forEach((listener) => listener());
}

const shouldProbe = (): boolean => provenOffline && linkUp() && document.visibilityState === "visible";

function stopProbe(): void {
  if (probeTimer !== undefined) clearTimeout(probeTimer);
  probeTimer = undefined;
}

function scheduleProbe(delayMs: number): void {
  if (probeTimer !== undefined || probeInFlight || !shouldProbe()) return;
  probeTimer = setTimeout(() => {
    probeTimer = undefined;
    void runProbe();
  }, delayMs);
}

// One AbortController + setTimeout (AbortSignal.timeout is missing on older iOS Safari, as in client.ts).
async function reachable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(`${API_BASE_URL}/app-config`, { cache: "no-store", signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function runProbe(): Promise<void> {
  if (!shouldProbe()) return;
  probeInFlight = true;
  const ok = await reachable();
  probeInFlight = false;
  if (ok) setProvenOffline(false);
  else scheduleProbe(PROBE_INTERVAL_MS);
}

function setProvenOffline(next: boolean): void {
  if (provenOffline === next) return;
  provenOffline = next;
  if (next) scheduleProbe(0); // one probe right away, then every 10 s
  else stopProbe();
  emit();
}

function start(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  linkWasUp = linkUp();
  lastOnline = isOnlineNow();
  window.addEventListener("online", () => {
    if (!linkWasUp) {
      provenOffline = false; // only a link down → up change clears it (a repeated `online` doesn't)
      stopProbe();
    }
    linkWasUp = true;
    emit();
  });
  window.addEventListener("offline", () => {
    linkWasUp = false;
    stopProbe(); // no probe while the link is down: its `online` event reports the change
    emit();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleProbe(0);
    else stopProbe();
  });
}

/** client.ts: the fetch rejected with a network error (not our own timeout abort). */
export function reportNoConnection(): void {
  start();
  setProvenOffline(true);
}

/** client.ts: a real HTTP answer (any status) proves the API reachable. */
export function reportHttpResponse(): void {
  if (provenOffline) setProvenOffline(false);
}

function subscribe(onChange: () => void): () => void {
  start();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

const getServerSnapshot = (): boolean => true;

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, isOnlineNow, getServerSnapshot);
}

/** Calls `listener` on every offline → online change of the combined value. Returns the unsubscribe. */
export function subscribeReconnect(listener: () => void): () => void {
  start();
  reconnectListeners.add(listener);
  return () => {
    reconnectListeners.delete(listener);
  };
}

type Refetchable = { isError: boolean; refetch: (options?: { cancelRefetch?: boolean }) => Promise<unknown> };

/**
 * Launch screens (frontend-kit D-KIT-13 "refetch on reconnect"): failed reads refetch when the combined value comes
 * back — TanStack's own reconnect refetch follows only the link. A fetch already in flight is joined, not restarted.
 */
export function useRefetchOnReconnect(queries: Refetchable[]): void {
  const latest = useRef(queries);
  latest.current = queries;
  useEffect(
    () =>
      subscribeReconnect(() => {
        latest.current.forEach((query) => {
          if (query.isError) void query.refetch({ cancelRefetch: false });
        });
      }),
    []
  );
}
