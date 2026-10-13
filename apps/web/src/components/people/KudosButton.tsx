"use client";

import { useState } from "react";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { giveKudos, undoKudos, PEOPLE_COPY, type KudosState, type PersonProfile } from "@/lib/api/people";
import { toAppError } from "@/lib/kit/app-error";
import { cn } from "@/lib/utils";

// Kudos (the kudos rule): one per person per day (their day), a count only, and ONE toggle — "Give kudos" ↔ "Kudos
// given"; tapping "Kudos given" undoes it. Give answers the new count; undo answers none (it would leak a hidden member's
// count), so the shown count drops by one when `removed`. A 403 = the person just hid their activity → the profile
// re-fetches and shows the hidden state. A 429 (pair / burst limit) reads its own line. Mutations never auto-retry.
// `profileKey` is the exact key the profile page reads (built from its URL id), so every patch lands on that cache.
export function KudosButton({
  token,
  programId,
  memberId,
  kudos,
  profileKey
}: {
  token: string;
  programId: string;
  memberId: string;
  kudos: KudosState;
  profileKey: QueryKey;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const patch = (next: (current: KudosState) => Partial<KudosState>) =>
    queryClient.setQueryData<PersonProfile>(profileKey, (previous) =>
      previous?.kudos ? { ...previous, kudos: { ...previous.kudos, ...next(previous.kudos) } } : previous
    );
  const fail = (e: unknown) => {
    const appErr = toAppError(e);
    if (appErr.status === 403) void queryClient.invalidateQueries({ queryKey: profileKey });
    setError(appErr.status === 429 ? PEOPLE_COPY.kudosLimit : appErr.message);
  };
  const give = useMutation({
    mutationFn: () => giveKudos(token, memberId, programId),
    onMutate: () => setError(null),
    onSuccess: (result) => patch(() => ({ count: result.kudos.count, given_today: result.kudos.given_today })),
    onError: fail
  });
  const undo = useMutation({
    mutationFn: () => undoKudos(token, memberId),
    onMutate: () => setError(null),
    onSuccess: (result) =>
      patch((current) =>
        result.kudos.removed ? { count: Math.max(0, current.count - 1), given_today: false } : { given_today: false }
      ),
    onError: fail
  });
  const busy = give.isPending || undo.isPending;
  const given = kudos.given_today;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base font-semibold text-rf-text">{PEOPLE_COPY.kudosCount(kudos.count)}</p>
        {kudos.can_give && (
          <button
            type="button"
            aria-pressed={given}
            disabled={busy}
            onClick={() => (given ? undo.mutate() : give.mutate())}
            className={cn(
              "min-h-[44px] rounded-full px-5 text-sm font-semibold disabled:opacity-50",
              given ? "bg-rf-accent/15 text-rf-accent" : "bg-rf-accent text-black"
            )}
          >
            {given ? PEOPLE_COPY.kudosGiven : PEOPLE_COPY.giveKudos}
          </button>
        )}
      </div>
      {kudos.can_give && given && <p className="text-xs text-rf-text-muted">{PEOPLE_COPY.kudosGivenHint}</p>}
      {error && <p className="text-sm font-semibold text-rf-danger">{error}</p>}
    </div>
  );
}
