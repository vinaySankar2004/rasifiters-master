"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPrograms } from "@/lib/api/programs";
import { cachedQueryFn, useLaunchSeed } from "@/lib/cache/launch-cache";

const PROGRAMS_KEY = ["programs"];

/**
 * D1 (programs SPEC §9 D-C6): the open program's GET /programs row — the picker's own ["programs"] query (seeded from
 * the launch cache, refetched on mount / focus) — the one source of its progress on Summary and the Program tab.
 * null until the list loads, or when the program isn't in it.
 */
export function useActiveProgramRow(token: string, memberId: string | undefined, programId: string) {
  const query = useQuery({
    queryKey: PROGRAMS_KEY,
    queryFn: cachedQueryFn(memberId, PROGRAMS_KEY, () => fetchPrograms(token)),
    enabled: !!token
  });
  useLaunchSeed(memberId, [PROGRAMS_KEY]);
  return query.data?.find((program) => program.id === programId) ?? null;
}
