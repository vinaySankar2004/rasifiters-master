import { useSyncExternalStore } from "react";

// Link-level connectivity (frontend-kit SPEC §5, D-KIT-7): navigator.onLine + the online/offline events.
// SSR-safe (the server snapshot is "online"). Not used by any page until Phase 3 adoption.

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const getSnapshot = (): boolean => navigator.onLine;
const getServerSnapshot = (): boolean => true;

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
