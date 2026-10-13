import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { currentSessionToken } from "@/lib/api/client";

// Instant opens (DESIGN_BOARD §6.5, D-9): the last good response of the two launch screens (program picker + Summary),
// per member, in localStorage. Seeded into empty queries only once the member is known (after AuthProvider bootstrap —
// never during SSR/hydration), then refreshed by the normal query. Written only while a session exists and cleared by
// the sign-out teardown. Program-scoped entries (Summary) are kept for the member's 10 most recently loaded programs
// so the cache can't fill localStorage. Invites are never cached (a stale invite would 404 on accept). No new dependency.

const PREFIX = "rasi.fiters.cache.";
const SCHEMA_VERSION = 1; // bump when a cached response shape changes; other versions are ignored
const MAX_PROGRAMS = 10;
const UNSCOPED = "-"; // the picker list (not tied to one program)

type Entry = { v: number; savedAt: number; data: unknown };

const memberPrefix = (memberId: string) => `${PREFIX}${memberId}:`;
const indexKey = (memberId: string) => `${memberPrefix(memberId)}index`;
const scopePrefix = (memberId: string, scope: string) => `${memberPrefix(memberId)}${scope}:`;
const storageKey = (memberId: string, scope: string, queryKey: QueryKey) =>
  `${scopePrefix(memberId, scope)}${JSON.stringify(queryKey)}`;

function removeByPrefix(prefix: string): void {
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) localStorage.removeItem(key);
  }
}

function read(memberId: string, scope: string, queryKey: QueryKey): Entry | undefined {
  try {
    const raw = localStorage.getItem(storageKey(memberId, scope, queryKey));
    const entry = raw ? (JSON.parse(raw) as Entry) : undefined;
    return entry && entry.v === SCHEMA_VERSION && typeof entry.savedAt === "number" && entry.data !== undefined
      ? entry
      : undefined;
  } catch {
    return undefined;
  }
}

/** Marks `programId` as just used; evicts the member's least recently used programs beyond MAX_PROGRAMS. */
function touchProgram(memberId: string, programId: string): void {
  let index: Record<string, number> = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(indexKey(memberId)) ?? "{}");
    if (parsed && typeof parsed === "object") index = parsed as Record<string, number>;
  } catch {
    // unreadable index: start over
  }
  index[programId] = Date.now();
  const byRecency = Object.keys(index).sort((a, b) => (index[b] ?? 0) - (index[a] ?? 0));
  for (const stale of byRecency.slice(MAX_PROGRAMS)) {
    removeByPrefix(scopePrefix(memberId, stale));
    delete index[stale];
  }
  localStorage.setItem(indexKey(memberId), JSON.stringify(index));
}

function write(memberId: string, scope: string, queryKey: QueryKey, data: unknown): void {
  try {
    if (scope !== UNSCOPED) touchProgram(memberId, scope);
    const entry: Entry = { v: SCHEMA_VERSION, savedAt: Date.now(), data };
    localStorage.setItem(storageKey(memberId, scope, queryKey), JSON.stringify(entry));
  } catch {
    // quota / disabled storage: skip
  }
}

/**
 * queryFn wrapper: every successful network response is saved for the next open (never after a sign-out).
 * `programId` scopes the entry to a program (Summary); omit it for the picker list.
 */
export function cachedQueryFn<T>(
  memberId: string | undefined,
  queryKey: QueryKey,
  fetcher: () => Promise<T>,
  programId?: string
) {
  return async (): Promise<T> => {
    const data = await fetcher();
    // A response landing after the teardown must not bring the cleared cache back (shared browsers).
    if (memberId && currentSessionToken() !== null) write(memberId, programId || UNSCOPED, queryKey, data);
    return data;
  };
}

/** Seeds still-empty queries from the cache once the member is known. */
export function useLaunchSeed(memberId: string | undefined, queryKeys: QueryKey[], programId?: string): void {
  const queryClient = useQueryClient();
  const keysRef = useRef(queryKeys);
  keysRef.current = queryKeys;
  const signature = JSON.stringify(queryKeys);
  const scope = programId || UNSCOPED;
  useEffect(() => {
    if (!memberId) return;
    for (const queryKey of keysRef.current) {
      if (queryClient.getQueryData(queryKey) !== undefined) continue;
      const entry = read(memberId, scope, queryKey);
      if (entry) queryClient.setQueryData<unknown>(queryKey, entry.data, { updatedAt: entry.savedAt });
    }
  }, [memberId, scope, signature, queryClient]);
}

export function clearLaunchCache(): void {
  try {
    removeByPrefix(PREFIX);
  } catch {
    // storage unavailable
  }
}
