"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMemberProfile } from "@/lib/api/members";
import { PEOPLE_COPY, peopleKeys, saveHideActivity } from "@/lib/api/people";
import { toAppError } from "@/lib/kit/app-error";
import { Modal } from "@/components/ui/Modal";

const NOTICE_PREFIX = "rasi.fiters.activityNotice."; // + member id — device-local, per member

// The one-time "Who can see your activity" notice (the activity-notice rule), shown on the People page before it first
// shows other people. A real choice — no backdrop dismiss: Keep visible, or Hide my activity (PUT /members/:id). It
// counts as seen only once the choice landed (Keep: at once; Hide: after the save succeeded). Never shown to a member
// who already hid their activity in My Profile. The flag lives in localStorage, read in an effect (no hydration
// mismatch).
export function ActivityVisibilityNotice({ token, memberId }: { token: string; memberId: string }) {
  const queryClient = useQueryClient();
  const profileKey = ["account", "profile", memberId];
  const profileQuery = useQuery({
    queryKey: profileKey,
    queryFn: () => fetchMemberProfile(token, memberId),
    enabled: !!token && !!memberId,
    refetchOnMount: "always" // the decision below waits for this fresh read, never a cached flag
  });
  const [seen, setSeen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (memberId) setSeen(localStorage.getItem(NOTICE_PREFIX + memberId) === "1");
  }, [memberId]);

  const remember = () => {
    localStorage.setItem(NOTICE_PREFIX + memberId, "1");
    setSeen(true);
  };

  const hide = useMutation({
    mutationFn: () => saveHideActivity(token, memberId, true),
    onMutate: () => setError(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileKey });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      remember();
    },
    onError: (e) => setError(toAppError(e).message)
  });

  // Decided only on a read made after this mount (success or failure): a stale cached flag must neither mark the notice
  // seen for good nor flash it open.
  const fresh = profileQuery.isFetchedAfterMount;
  const alreadyHidden = fresh && profileQuery.data?.hide_activity === true;
  useEffect(() => {
    if (seen || !alreadyHidden || !memberId) return;
    localStorage.setItem(NOTICE_PREFIX + memberId, "1");
    setSeen(true);
  }, [seen, alreadyHidden, memberId]);

  const open = !seen && fresh && !alreadyHidden;

  return (
    <Modal open={open} onClose={() => undefined}>
      {/* Modal supplies role="dialog" + aria-modal and labels itself by this panel's first heading. */}
      <div className="modal-surface w-full max-w-md rounded-3xl p-6">
        <h3 id="activity-notice-title" className="text-lg font-semibold text-rf-text">
          {PEOPLE_COPY.noticeTitle}
        </h3>
        <p className="mt-2 text-sm text-rf-text-muted">{PEOPLE_COPY.noticeBody}</p>
        {error && <p className="mt-4 text-sm font-semibold text-rf-danger">{error}</p>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={hide.isPending}
            onClick={remember}
            className="button-primary button-primary--dark-white min-h-[44px] rounded-2xl px-4 py-3 text-sm font-semibold"
          >
            {PEOPLE_COPY.noticeKeep}
          </button>
          <button
            type="button"
            disabled={hide.isPending}
            onClick={() => hide.mutate()}
            className="pill-button min-h-[44px] rounded-2xl px-4 py-3 text-sm font-semibold"
          >
            {hide.isPending ? PEOPLE_COPY.saving : PEOPLE_COPY.noticeHide}
          </button>
        </div>
      </div>
    </Modal>
  );
}
