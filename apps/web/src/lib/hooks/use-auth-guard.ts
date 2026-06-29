"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-provider";
import { useActiveProgram } from "@/lib/use-active-program";

export type UseAuthGuardOptions = {
  /** When false, page is viewable with session only (no active program required). Default true. */
  requireProgram?: boolean;
};

export function useAuthGuard(options?: UseAuthGuardOptions) {
  const router = useRouter();
  const { session, isBootstrapping } = useAuth();
  const program = useActiveProgram();
  const requireProgram = options?.requireProgram !== false;

  useEffect(() => {
    if (!isBootstrapping && !session?.token) {
      router.push("/login");
    }
  }, [isBootstrapping, session?.token, router]);

  useEffect(() => {
    if (requireProgram && !program?.id) {
      router.push("/programs");
    }
  }, [requireProgram, program?.id, router]);

  const token = session?.token ?? "";
  const programId = program?.id ?? "";
  const isReady = requireProgram ? !!token && !!programId : !!token;

  return { session, program, token, programId, isReady, isBootstrapping };
}
