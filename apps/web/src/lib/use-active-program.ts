"use client";

import { useEffect, useState } from "react";
import { loadActiveProgram, type ActiveProgram } from "@/lib/storage";

const ACTIVE_PROGRAM_EVENT = "rf:active-program-updated";

export function broadcastActiveProgramUpdate() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ACTIVE_PROGRAM_EVENT));
}

export function useActiveProgram() {
  const [program, setProgram] = useState<ActiveProgram | null>(() => loadActiveProgram());

  useEffect(() => {
    const handleUpdate = () => {
      setProgram(loadActiveProgram());
    };

    window.addEventListener(ACTIVE_PROGRAM_EVENT, handleUpdate);
    window.addEventListener("storage", handleUpdate);

    return () => {
      window.removeEventListener(ACTIVE_PROGRAM_EVENT, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  return program;
}
