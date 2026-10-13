"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMemberProfile, type MemberProfile } from "@/lib/api/members";
import { PEOPLE_COPY, peopleKeys, saveHideActivity } from "@/lib/api/people";
import { toAppError } from "@/lib/kit/app-error";
import { KIT_COPY } from "@/lib/kit/copy";
import { Switch } from "@/components/ui/Switch";

// "Hide my activity" in My Profile (the Hide my activity rule) — one switch for all programs, directly above "Sign out
// everywhere". Reads the profile query the page already runs (GET /members/:id returns hide_activity to the member
// themself); saves with PUT /members/:id { hide_activity } and patches only `hide_activity` in that query's cache. The
// page re-seeds its name / gender form only when member_name / gender change, so unsaved edits survive the patch.
export function HideActivityToggle({ token, memberId }: { token: string; memberId: string }) {
  const queryClient = useQueryClient();
  const profileKey = ["account", "profile", memberId];
  const profileQuery = useQuery({
    queryKey: profileKey,
    queryFn: () => fetchMemberProfile(token, memberId),
    enabled: !!token && !!memberId
  });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (hide: boolean) => saveHideActivity(token, memberId, hide),
    onMutate: () => setError(null),
    onSuccess: (value) => {
      queryClient.setQueryData<MemberProfile>(profileKey, (previous) =>
        previous ? { ...previous, hide_activity: value } : previous
      );
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
    },
    onError: (e) => setError(toAppError(e).message)
  });

  const loaded = profileQuery.data !== undefined;
  const checked = save.isPending ? save.variables === true : profileQuery.data?.hide_activity === true;

  return (
    <div className="space-y-2 border-t border-rf-border pt-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p id="hide-activity-label" className="text-sm font-semibold text-rf-text">
            {PEOPLE_COPY.hideActivityLabel}
          </p>
          <p className="mt-1 text-xs text-rf-text-muted">{PEOPLE_COPY.hideActivityHint}</p>
        </div>
        <Switch
          checked={checked}
          disabled={!loaded || save.isPending}
          labelledBy="hide-activity-label"
          onChange={(next) => save.mutate(next)}
        />
      </div>
      {!loaded && profileQuery.isError && (
        <p className="text-sm text-rf-text-muted">
          {PEOPLE_COPY.hideActivityLoadFailed}{" "}
          <button type="button" onClick={() => void profileQuery.refetch()} className="font-semibold text-rf-accent">
            {KIT_COPY.retry}
          </button>
        </p>
      )}
      {error && <p className="text-sm font-semibold text-rf-danger">{error}</p>}
    </div>
  );
}
