"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { useClientSearchParams } from "@/lib/use-client-search-params";
import {
  fetchPersonProfile,
  formatDay,
  lastActiveValue,
  PEOPLE_COPY,
  PEOPLE_LIVE,
  peopleKeys,
  roleMarker,
  type PersonProfile
} from "@/lib/api/people";
import { formatDuration } from "@/lib/format";
import { appError } from "@/lib/kit/app-error";
import { fromQuery, retryNow } from "@/lib/kit/async-state";
import { useOnlineStatus, useRefetchOnReconnect } from "@/lib/kit/use-online-status";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";
import { KudosButton } from "@/components/people/KudosButton";

// The People go-live rule: until release day the profile isn't reachable — it sends you back to the roster.
export default function PersonProfilePage() {
  return PEOPLE_LIVE ? <PersonProfileView /> : <PeopleNotLive />;
}

function PeopleNotLive() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/members/list");
  }, [router]);
  return null;
}

// A person's profile (workouts only): streaks, active days this month, last active, the last 10 workouts and kudos.
// Hidden from this viewer → name only + one honest line. Staff get "Open full stats"; global admins also "Edit
// membership" (→ /members/detail).
function PersonProfileView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useClientSearchParams();
  const memberId = searchParams.get("memberId") ?? "";
  const { session, program, token, programId } = useAuthGuard();
  const isGlobalAdmin = session?.user.globalRole === "global_admin";
  const online = useOnlineStatus();
  const profileKey = peopleKeys.person(programId, memberId);
  const profileQuery = useQuery({
    queryKey: profileKey,
    queryFn: () => fetchPersonProfile(token, programId, memberId),
    enabled: !!token && !!programId && !!memberId
  });
  useRefetchOnReconnect([profileQuery]);
  const state = fromQuery(profileQuery);
  const profile = profileQuery.data;

  // No memberId in the URL (read straight from window.location after mount, i.e. once the params have resolved) →
  // nothing to show; back to the People list.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get("memberId")) router.replace("/members/list");
  }, [router]);

  // Open full stats: admins + global admins → the Members tab with "View as" set to this person (the sessionStorage key
  // app/members/page.tsx reads); loggers (whose tab overview is always themselves) → this person's full workout list —
  // a sanctioned web divergence.
  const openFullStats = () => {
    const viewerId = session?.user.id;
    if (!viewerId || !profile) return;
    if (program?.my_role === "admin" || isGlobalAdmin) {
      sessionStorage.setItem(`rf:members:view-as:${programId}:${viewerId}`, profile.member_id);
      router.push("/members");
      return;
    }
    router.push(`/members/workouts?memberId=${profile.member_id}&name=${encodeURIComponent(profile.member_name)}`);
  };

  return (
    <PageShell maxWidth="3xl">
      <PageHeader title={PEOPLE_COPY.profileTitle} subtitle={program?.name ?? "Program"} backHref="/members/list" />

      {state.status === "loading" && <LoadingState message={PEOPLE_COPY.profileLoading} />}
      {state.status === "failed" && (
        <ErrorView error={online ? state.error : appError("offline")} onRetry={() => void retryNow(queryClient, profileKey)} />
      )}

      {profile && (
        <>
          <ProfileHeader profile={profile} />
          {profile.activity_visible ? (
            <ActivityDetails profile={profile} token={token} programId={programId} profileKey={profileKey} />
          ) : (
            <GlassCard padding="lg" className="text-sm text-rf-text-muted">
              {profile.viewer_hides_activity ? PEOPLE_COPY.hiddenByYou : PEOPLE_COPY.hiddenProfile}
            </GlassCard>
          )}
          {(profile.can_open_full_stats || isGlobalAdmin) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {profile.can_open_full_stats && (
                <ActionRow
                  title={PEOPLE_COPY.openFullStats}
                  subtitle={PEOPLE_COPY.openFullStatsSubtitle}
                  onClick={openFullStats}
                />
              )}
              {isGlobalAdmin && (
                <ActionRow
                  title={PEOPLE_COPY.editMembership}
                  subtitle={PEOPLE_COPY.editMembershipSubtitle}
                  onClick={() => router.push(`/members/detail?memberId=${profile.member_id}`)}
                />
              )}
            </div>
          )}
        </>
      )}

      {state.status === "stale" && online && (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="stale" onRetry={() => void profileQuery.refetch()} />
        </>
      )}
    </PageShell>
  );
}

function ProfileHeader({ profile }: { profile: PersonProfile }) {
  const marker = roleMarker(profile.program_role);
  return (
    <GlassCard padding="lg">
      <div className="flex items-center gap-4">
        <div className="metric-pill flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-base font-semibold text-rf-text">
          {profile.initials}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-lg font-semibold text-rf-text">{profile.member_name}</p>
            {profile.is_you && (
              <span className="rounded-full bg-rf-accent/15 px-2 py-0.5 text-[11px] font-semibold text-rf-accent">
                {PEOPLE_COPY.you}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-rf-text-muted">
            @{profile.username}
            {marker && ` · ${marker}`}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

function ActionRow({ title, subtitle, onClick }: { title: string; subtitle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      <GlassCard padding="sm">
        <div className="flex min-h-[44px] items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-rf-text">{title}</p>
            <p className="truncate text-xs text-rf-text-muted">{subtitle}</p>
          </div>
          <span aria-hidden="true" className="shrink-0 text-rf-text-muted">›</span>
        </div>
      </GlassCard>
    </button>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-pill min-w-0 rounded-2xl px-3 py-3">
      <p className="text-xs text-rf-text-muted">{label}</p>
      <p className="mt-1 text-base font-semibold text-rf-text">{value}</p>
    </div>
  );
}

function ActivityDetails({
  profile,
  token,
  programId,
  profileKey
}: {
  profile: PersonProfile;
  token: string;
  programId: string;
  profileKey: QueryKey;
}) {
  const stats = profile.stats;
  const recent = profile.recent_workouts ?? [];
  return (
    <>
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatPill label={PEOPLE_COPY.currentStreak} value={PEOPLE_COPY.days(stats.current_streak)} />
          <StatPill label={PEOPLE_COPY.longestStreak} value={PEOPLE_COPY.days(stats.longest_streak)} />
          <StatPill label={PEOPLE_COPY.thisMonth} value={PEOPLE_COPY.days(stats.active_days_this_month)} />
          <StatPill label={PEOPLE_COPY.lastActiveLabel} value={lastActiveValue(stats.last_active)} />
        </div>
      )}
      {profile.kudos && (
        <GlassCard>
          <KudosButton
            token={token}
            programId={programId}
            memberId={profile.member_id}
            kudos={profile.kudos}
            profileKey={profileKey}
          />
        </GlassCard>
      )}
      <GlassCard>
        <p className="text-sm font-semibold text-rf-text-muted">{PEOPLE_COPY.recentWorkouts}</p>
        <div className="mt-3 space-y-2 text-sm">
          {recent.length === 0 && <p className="text-rf-text-muted">{PEOPLE_COPY.noRecentWorkouts}</p>}
          {recent.map((workout, index) => (
            <div key={`${workout.date}-${workout.workout_type}-${index}`} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-rf-text">{workout.workout_type}</p>
                <p className="text-xs text-rf-text-muted">{formatDay(workout.date)}</p>
              </div>
              <p className="shrink-0 font-semibold text-rf-text">{formatDuration(workout.duration_minutes)}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </>
  );
}
