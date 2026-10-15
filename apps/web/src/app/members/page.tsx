"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { fetchProgramMembers, type Member } from "@/lib/api/programs";
import {
  fetchMemberHealthLogs,
  fetchMemberHistory,
  fetchMemberMetrics,
  fetchMemberRecentWorkouts,
  fetchMemberStreaks,
  type MemberMetrics
} from "@/lib/api/members";
import { PEOPLE_COPY, PEOPLE_LIVE } from "@/lib/api/people";
import { avgDietLabel, initials, stepsLabel } from "@/lib/format";
import { appError } from "@/lib/kit/app-error";
import { fromQuery, retryNow, type QueryLike } from "@/lib/kit/async-state";
import { useOnlineStatus, useRefetchOnReconnect } from "@/lib/kit/use-online-status";
import { FlameIcon, IconMail as MailIcon } from "@/components/icons";
import { PageShell } from "@/components/ui/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Modal } from "@/components/ui/Modal";
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";
import {
  MemberHealthCard,
  MemberHistoryCard,
  MemberOverviewCard,
  MemberRecentCard,
  MemberStreakCard,
  toCardStatus
} from "@/components/members/MemberDashboardCards";

export default function MembersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const { session, program, token, programId } = useAuthGuard();

  const isGlobalAdmin = session?.user.globalRole === "global_admin";
  const isProgramAdmin = program?.my_role === "admin" || isGlobalAdmin;
  const isLogger = program?.my_role === "logger";
  const canInvite = isProgramAdmin;
  const canViewAs = isProgramAdmin;
  const canViewAsLogger = isLogger;
  const loggedInUserId = session?.user.id;

  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [adminSelectedMember, setAdminSelectedMember] = useState<Member | null>(null);
  const [loggerSelectedMember, setLoggerSelectedMember] = useState<Member | null>(null);
  const [showLoggerMemberPicker, setShowLoggerMemberPicker] = useState(false);

  const viewAsStorageKey = useMemo(() => {
    if (!programId || !loggedInUserId) return "";
    return `rf:members:view-as:${programId}:${loggedInUserId}`;
  }, [programId, loggedInUserId]);

  const loggerViewAsStorageKey = useMemo(() => {
    if (!programId || !loggedInUserId) return "";
    return `rf:members:view-as-logger:${programId}:${loggedInUserId}`;
  }, [programId, loggedInUserId]);

  const membersQuery = useQuery({
    queryKey: ["members", "list", programId],
    queryFn: () => fetchProgramMembers(token, programId),
    enabled: !!token && !!programId
  });

  useEffect(() => {
    if (!canViewAs) return;
    if (!viewAsStorageKey) return;
    const stored = sessionStorage.getItem(viewAsStorageKey);
    if (!stored) return;
    if (stored === "none") {
      if (isGlobalAdmin) {
        setAdminSelectedMember(null);
      }
      return;
    }
    if (!membersQuery.data) return;
    if (adminSelectedMember?.id === stored) return;
    const match = membersQuery.data.find((member) => member.id === stored);
    if (match) {
      setAdminSelectedMember(match);
    }
  }, [canViewAs, viewAsStorageKey, membersQuery.data, adminSelectedMember?.id, isGlobalAdmin]);

  useEffect(() => {
    if (!canViewAs) return;
    if (isGlobalAdmin) return;
    if (!loggedInUserId) return;
    if (adminSelectedMember) return;
    if (viewAsStorageKey && sessionStorage.getItem(viewAsStorageKey)) return;
    const match = membersQuery.data?.find((member) => member.id === loggedInUserId);
    if (match) {
      setAdminSelectedMember(match);
      if (viewAsStorageKey) {
        sessionStorage.setItem(viewAsStorageKey, match.id);
      }
    }
  }, [canViewAs, isGlobalAdmin, loggedInUserId, membersQuery.data, adminSelectedMember, viewAsStorageKey]);

  useEffect(() => {
    if (!canViewAsLogger) return;
    if (!loggerViewAsStorageKey) return;
    const stored = sessionStorage.getItem(loggerViewAsStorageKey);
    if (!stored) return;
    if (!membersQuery.data) return;
    if (loggerSelectedMember?.id === stored) return;
    const match = membersQuery.data.find((member) => member.id === stored);
    if (match) setLoggerSelectedMember(match);
  }, [canViewAsLogger, loggerViewAsStorageKey, membersQuery.data, loggerSelectedMember?.id]);

  useEffect(() => {
    if (!canViewAsLogger) return;
    if (!loggedInUserId) return;
    if (loggerSelectedMember) return;
    if (loggerViewAsStorageKey && sessionStorage.getItem(loggerViewAsStorageKey)) return;
    const match = membersQuery.data?.find((member) => member.id === loggedInUserId);
    if (match) {
      setLoggerSelectedMember(match);
      if (loggerViewAsStorageKey) sessionStorage.setItem(loggerViewAsStorageKey, match.id);
    }
  }, [canViewAsLogger, loggedInUserId, membersQuery.data, loggerSelectedMember, loggerViewAsStorageKey]);

  const selectedMember: Member | null = useMemo(() => {
    if (canViewAs) return adminSelectedMember;
    if (!loggedInUserId) return null;
    return {
      id: loggedInUserId,
      member_name: session?.user.memberName ?? "Member"
    };
  }, [canViewAs, adminSelectedMember, loggedInUserId, session?.user.memberName]);

  const selectedMemberId = selectedMember?.id ?? "";

  const overviewMemberId = canViewAsLogger ? (loggedInUserId ?? "") : selectedMemberId;
  const logsMemberId = canViewAsLogger
    ? (loggerSelectedMember?.id ?? loggedInUserId ?? "")
    : selectedMemberId;

  const metricsPreviewQuery = useQuery({
    queryKey: ["members", "metrics", programId, "preview"],
    queryFn: () =>
      fetchMemberMetrics(token, programId, {
        sort: "active_days",
        direction: "desc"
      }),
    enabled: !!token && !!programId && isProgramAdmin
  });

  const memberOverviewQuery = useQuery({
    queryKey: ["members", "overview", programId, overviewMemberId],
    queryFn: () =>
      fetchMemberMetrics(token, programId, {
        memberId: overviewMemberId
      }),
    enabled: !!token && !!programId && !!overviewMemberId
  });

  const memberHistoryQuery = useQuery({
    queryKey: ["members", "history", programId, overviewMemberId],
    queryFn: () => fetchMemberHistory(token, programId, overviewMemberId, "week"),
    enabled: !!token && !!programId && !!overviewMemberId
  });

  const memberStreakQuery = useQuery({
    queryKey: ["members", "streaks", programId, overviewMemberId],
    queryFn: () => fetchMemberStreaks(token, programId, overviewMemberId),
    enabled: !!token && !!programId && !!overviewMemberId
  });

  const memberRecentQuery = useQuery({
    queryKey: ["members", "recent", programId, logsMemberId],
    queryFn: () =>
      fetchMemberRecentWorkouts(token, programId, logsMemberId, {
        limit: 10,
        sortBy: "date",
        sortDir: "desc"
      }),
    enabled: !!token && !!programId && !!logsMemberId
  });

  const memberHealthQuery = useQuery({
    queryKey: ["members", "health", programId, logsMemberId],
    queryFn: () =>
      fetchMemberHealthLogs(token, programId, logsMemberId, {
        limit: 10,
        sortBy: "date",
        sortDir: "desc"
      }),
    enabled: !!token && !!programId && !!logsMemberId
  });

  const memberOverview = memberOverviewQuery.data?.members?.[0];

  // The Members-tab card-state rule (the frontend-kit recipe): the ErrorView + Retry only when NOTHING for this program
  // or member has loaded; on a partial failure the loaded cards stay, the failed ones read "—" and the "Couldn't
  // refresh" banner offers Retry. Never a fake 0 or "No workouts logged yet" on a failure; every read is keyed by this
  // program + member, so no other program's or member's numbers can show. The "View as" member list counts only for
  // the roles that have a picker. Failed reads reload when the connection returns (web: no pull-to-refresh).
  const dashboardReads = [
    { query: membersQuery, key: ["members", "list", programId], counted: canViewAs || canViewAsLogger },
    { query: metricsPreviewQuery, key: ["members", "metrics", programId, "preview"], counted: true },
    { query: memberOverviewQuery, key: ["members", "overview", programId, overviewMemberId], counted: true },
    { query: memberHistoryQuery, key: ["members", "history", programId, overviewMemberId], counted: true },
    { query: memberStreakQuery, key: ["members", "streaks", programId, overviewMemberId], counted: true },
    { query: memberRecentQuery, key: ["members", "recent", programId, logsMemberId], counted: true },
    { query: memberHealthQuery, key: ["members", "health", programId, logsMemberId], counted: true }
  ].filter((read) => read.counted); // each key = that read's useQuery key above
  const dashboardStates = dashboardReads.map((read) => fromQuery<unknown>(read.query));
  const dashboardHasData = dashboardStates.some((state) => state.status === "loaded" || state.status === "stale");
  const failedState = dashboardStates.find((state) => state.status === "failed");
  const dashboardFailure = failedState?.status === "failed" ? failedState.error : null;
  // Only once every read has settled: a failure while others are still loading never flashes the page ErrorView.
  const settled = dashboardStates.every((state) => state.status !== "loading");
  const dashboardError = !dashboardHasData && settled ? dashboardFailure : null;
  const dashboardStale =
    dashboardStates.some((state) => state.status === "stale") || (dashboardHasData && dashboardFailure !== null);
  const retryDashboard = () =>
    dashboardReads.forEach((read) => {
      if (read.query.isError || read.query.failureCount > 0) void retryNow(queryClient, read.key);
    });
  useRefetchOnReconnect(dashboardReads.map((read) => read.query));
  const statusOf = (query: QueryLike<unknown>) => toCardStatus(fromQuery(query));

  const viewAsLabel = useMemo(() => {
    if (!canViewAs) return "";
    if (adminSelectedMember) return adminSelectedMember.member_name;
    if (isGlobalAdmin) return "None";
    return session?.user.memberName ?? "Member";
  }, [canViewAs, adminSelectedMember, isGlobalAdmin, session?.user.memberName]);

  const loggerViewAsLabel = useMemo(() => {
    if (!canViewAsLogger) return "";
    return loggerSelectedMember?.member_name ?? session?.user.memberName ?? "Member";
  }, [canViewAsLogger, loggerSelectedMember, session?.user.memberName]);

  const logsSelectedMember: Member | null = useMemo(() => {
    if (canViewAsLogger) {
      if (loggerSelectedMember) return loggerSelectedMember;
      if (loggedInUserId) return { id: loggedInUserId, member_name: session?.user.memberName ?? "Member" };
      return null;
    }
    return selectedMember;
  }, [canViewAsLogger, loggerSelectedMember, loggedInUserId, session?.user.memberName, selectedMember]);

  const activePicker = showMemberPicker
    ? {
        selected: adminSelectedMember,
        allowNone: isGlobalAdmin,
        onClose: () => setShowMemberPicker(false),
        onSelect: (member: Member | null) => {
          setAdminSelectedMember(member);
          setShowMemberPicker(false);
          if (viewAsStorageKey) {
            sessionStorage.setItem(viewAsStorageKey, member ? member.id : "none");
          }
        }
      }
    : showLoggerMemberPicker
      ? {
          selected: loggerSelectedMember,
          allowNone: false,
          onClose: () => setShowLoggerMemberPicker(false),
          onSelect: (member: Member | null) => {
            setLoggerSelectedMember(member);
            setShowLoggerMemberPicker(false);
            if (loggerViewAsStorageKey && member) {
              sessionStorage.setItem(loggerViewAsStorageKey, member.id);
            }
          }
        }
      : null;

  return (
    <PageShell>
      <header className="flex items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-rf-text">Members</h1>
          <p className="mt-1 text-sm font-semibold text-rf-text-muted">{program?.name ?? "Program"}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* The People go-live rule: once live, one People pill for every role, and the admin Invite pill moves to
              the "Invite member" row on top of People (it also stays on the Program tab). */}
          {(PEOPLE_LIVE || !canViewAs) && (
            <button
              type="button"
              onClick={() => router.push("/members/list")}
              className="pill-button rounded-full px-4 py-2 text-xs font-semibold transition"
            >
              {PEOPLE_LIVE ? PEOPLE_COPY.title : "View Members"}
            </button>
          )}
          {canInvite && !PEOPLE_LIVE && (
            <button
              type="button"
              onClick={() => router.push("/members/invite")}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-rf-accent text-lg font-semibold text-black shadow"
              aria-label="Invite member"
            >
              <MailIcon className="h-6 w-6 text-black" />
            </button>
          )}
        </div>
      </header>

      {dashboardError && <ErrorView error={online ? dashboardError : appError("offline")} onRetry={retryDashboard} />}

      {isProgramAdmin && (
        <button
          type="button"
          onClick={() => router.push("/members/metrics")}
          className="glass-card group w-full rounded-3xl p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-rf-text-muted">Member Performance Metrics</p>
              <p className="text-xs font-semibold text-rf-text-muted">
                {metricsPreviewQuery.data
                  ? `${metricsPreviewQuery.data.total} members`
                  : statusOf(metricsPreviewQuery) === "failed"
                    ? "—"
                    : "Loading..."}
              </p>
            </div>
            <span className="text-sm font-semibold text-rf-text-muted">›</span>
          </div>
          <div className="mt-4">
            {statusOf(metricsPreviewQuery) === "loading" && (
              <div className="rounded-2xl bg-rf-surface-muted px-4 py-6 text-sm text-rf-text-muted">
                Loading metrics...
              </div>
            )}
            {statusOf(metricsPreviewQuery) === "failed" && <p className="text-sm text-rf-text-muted">—</p>}
            {metricsPreviewQuery.data && metricsPreviewQuery.data.members.length > 0 && (
              <MemberMetricsPreview metric={metricsPreviewQuery.data.members[0]} />
            )}
            {metricsPreviewQuery.data && metricsPreviewQuery.data.members.length === 0 && (
              <p className="text-sm text-rf-text-muted">No members to display yet.</p>
            )}
          </div>
        </button>
      )}

      {canViewAs && (
        <button
          type="button"
          onClick={() => setShowMemberPicker(true)}
          className="glass-card flex items-center gap-4 rounded-3xl px-5 py-4"
        >
          <p className="text-sm font-semibold text-rf-text">View as</p>
          <span className="ml-auto text-sm font-semibold text-rf-text-muted">{viewAsLabel}</span>
          <span className="text-xs text-rf-text-muted">⌄</span>
        </button>
      )}

      {!selectedMemberId && canViewAs && (
        <GlassCard padding="lg" className="text-sm text-rf-text-muted">
          Select a member to view their performance cards.
        </GlassCard>
      )}

      {selectedMemberId && canViewAs && (
        <div className="grid gap-5">
          <MemberOverviewCard
            metric={memberOverview}
            status={statusOf(memberOverviewQuery)}
            programStart={program?.start_date}
            programEnd={program?.end_date}
          />
          <div className="grid gap-5 md:grid-cols-2">
            <MemberHistoryCard
              points={memberHistoryQuery.data?.buckets ?? []}
              status={statusOf(memberHistoryQuery)}
              label={memberHistoryQuery.data?.label ?? ""}
              dailyAverage={memberHistoryQuery.data?.daily_average ?? 0}
              onClick={() => router.push(`/members/history?memberId=${selectedMemberId}&name=${encodeURIComponent(selectedMember?.member_name ?? "")}`)}
            />
            <MemberStreakCard
              current={memberStreakQuery.data?.currentStreakDays ?? 0}
              status={statusOf(memberStreakQuery)}
              longest={memberStreakQuery.data?.longestStreakDays ?? 0}
              onClick={() => router.push(`/members/streaks?memberId=${selectedMemberId}&name=${encodeURIComponent(selectedMember?.member_name ?? "")}`)}
            />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <MemberRecentCard
              items={memberRecentQuery.data?.items ?? []}
              status={statusOf(memberRecentQuery)}
              onClick={() => router.push(`/members/workouts?memberId=${selectedMemberId}&name=${encodeURIComponent(selectedMember?.member_name ?? "")}`)}
            />
            <MemberHealthCard
              items={memberHealthQuery.data?.items ?? []}
              status={statusOf(memberHealthQuery)}
              onClick={() => router.push(`/members/health?memberId=${selectedMemberId}&name=${encodeURIComponent(selectedMember?.member_name ?? "")}`)}
            />
          </div>
        </div>
      )}

      {canViewAsLogger && overviewMemberId && (
        <>
          <div className="grid gap-5">
            <MemberOverviewCard
              metric={memberOverview}
              status={statusOf(memberOverviewQuery)}
              programStart={program?.start_date}
              programEnd={program?.end_date}
            />
            <div className="grid gap-5 md:grid-cols-2">
              <MemberHistoryCard
                points={memberHistoryQuery.data?.buckets ?? []}
                status={statusOf(memberHistoryQuery)}
                label={memberHistoryQuery.data?.label ?? ""}
                dailyAverage={memberHistoryQuery.data?.daily_average ?? 0}
                onClick={() => router.push(`/members/history?memberId=${overviewMemberId}&name=${encodeURIComponent(session?.user.memberName ?? "")}`)}
              />
              <MemberStreakCard
                current={memberStreakQuery.data?.currentStreakDays ?? 0}
                status={statusOf(memberStreakQuery)}
                longest={memberStreakQuery.data?.longestStreakDays ?? 0}
                onClick={() => router.push(`/members/streaks?memberId=${overviewMemberId}&name=${encodeURIComponent(session?.user.memberName ?? "")}`)}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowLoggerMemberPicker(true)}
            className="glass-card flex items-center gap-4 rounded-3xl px-5 py-4"
          >
            <p className="text-sm font-semibold text-rf-text">View as</p>
            <span className="ml-auto text-sm font-semibold text-rf-text-muted">{loggerViewAsLabel}</span>
            <span className="text-xs text-rf-text-muted">⌄</span>
          </button>

          {logsMemberId && (
            <div className="grid gap-5 md:grid-cols-2">
              <MemberRecentCard
                items={memberRecentQuery.data?.items ?? []}
                status={statusOf(memberRecentQuery)}
                onClick={() => router.push(`/members/workouts?memberId=${logsMemberId}&name=${encodeURIComponent(logsSelectedMember?.member_name ?? "")}`)}
              />
              <MemberHealthCard
                items={memberHealthQuery.data?.items ?? []}
                status={statusOf(memberHealthQuery)}
                onClick={() => router.push(`/members/health?memberId=${logsMemberId}&name=${encodeURIComponent(logsSelectedMember?.member_name ?? "")}`)}
              />
            </div>
          )}
        </>
      )}

      {!canViewAs && !canViewAsLogger && overviewMemberId && (
        <div className="grid gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <MemberOverviewCard
              metric={memberOverview}
              status={statusOf(memberOverviewQuery)}
              programStart={program?.start_date}
              programEnd={program?.end_date}
            />
            {memberOverview && <MemberMetricsSingleCard metric={memberOverview} />}
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <MemberHistoryCard
              points={memberHistoryQuery.data?.buckets ?? []}
              status={statusOf(memberHistoryQuery)}
              label={memberHistoryQuery.data?.label ?? ""}
              dailyAverage={memberHistoryQuery.data?.daily_average ?? 0}
              onClick={() => router.push(`/members/history?memberId=${overviewMemberId}&name=${encodeURIComponent(session?.user.memberName ?? "")}`)}
            />
            <MemberStreakCard
              current={memberStreakQuery.data?.currentStreakDays ?? 0}
              status={statusOf(memberStreakQuery)}
              longest={memberStreakQuery.data?.longestStreakDays ?? 0}
              onClick={() => router.push(`/members/streaks?memberId=${overviewMemberId}&name=${encodeURIComponent(session?.user.memberName ?? "")}`)}
            />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <MemberRecentCard
              items={memberRecentQuery.data?.items ?? []}
              status={statusOf(memberRecentQuery)}
              onClick={() => router.push(`/members/workouts?memberId=${logsMemberId}&name=${encodeURIComponent(logsSelectedMember?.member_name ?? "")}`)}
            />
            <MemberHealthCard
              items={memberHealthQuery.data?.items ?? []}
              status={statusOf(memberHealthQuery)}
              onClick={() => router.push(`/members/health?memberId=${logsMemberId}&name=${encodeURIComponent(logsSelectedMember?.member_name ?? "")}`)}
            />
          </div>
        </div>
      )}

      {activePicker && (
        <MemberPickerModal
          members={membersQuery.data ?? []}
          selected={activePicker.selected}
          allowNone={activePicker.allowNone}
          onClose={activePicker.onClose}
          onSelect={activePicker.onSelect}
        />
      )}

      {/* Kit stale / partial state (loaded cards stay): hidden while the global offline banner shows; the spacer keeps
          the page end scrollable above the banner. */}
      {dashboardStale && !dashboardError && online && (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="stale" onRetry={retryDashboard} />
        </>
      )}
    </PageShell>
  );
}

function MemberMetricsPreview({ metric }: { metric: MemberMetrics }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="metric-pill flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-rf-text">
            {initials(metric.member_name)}
          </div>
          <div>
            <p className="text-base font-semibold text-rf-text">{metric.member_name}</p>
            <p className="text-xs text-rf-text-muted">Workouts {metric.workouts}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-rf-accent">{metric.active_days}</p>
          <p className="text-xs text-rf-text-muted">Active Days</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs text-rf-text-muted">
        <div className="metric-pill rounded-2xl px-3 py-2">
          <p className="font-semibold text-rf-text">{metric.active_days}</p>
          <p>Active days</p>
        </div>
        <div className="metric-pill rounded-2xl px-3 py-2">
          <p className="font-semibold text-rf-text">{metric.total_duration}</p>
          <p>Total mins</p>
        </div>
        <div className="metric-pill rounded-2xl px-3 py-2">
          <p className="font-semibold text-rf-text">{metric.workout_types}</p>
          <p>Types</p>
        </div>
        <div className="metric-pill rounded-2xl px-3 py-2">
          <p className="font-semibold text-rf-text">{metric.avg_sleep_hours?.toFixed(1) ?? "—"}</p>
          <p>Avg sleep</p>
        </div>
        <div className="metric-pill rounded-2xl px-3 py-2">
          <p className="font-semibold text-rf-text">{avgDietLabel(metric.avg_food_quality)}</p>
          <p>Avg diet</p>
        </div>
        <div className="metric-pill rounded-2xl px-3 py-2">
          <p className="font-semibold text-rf-text">{metric.longest_streak}d</p>
          <p>Longest streak</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 items-center gap-3">
        <div className="metric-pill rounded-2xl px-3 py-2 text-xs text-rf-text-muted">
          <p className="font-semibold text-rf-text">{stepsLabel(metric.avg_steps ?? null)}</p>
          <p>Avg steps</p>
        </div>
        <span className="inline-flex items-center gap-2 justify-self-start rounded-full bg-amber-200/70 px-3 py-1 text-xs font-semibold text-amber-900">
          <FlameIcon className="h-3.5 w-3.5" /> Current streak {metric.current_streak}d
        </span>
      </div>
    </div>
  );
}

function MemberMetricsSingleCard({ metric }: { metric: MemberMetrics }) {
  return (
    <GlassCard>
      <p className="text-sm font-semibold text-rf-text-muted">Member Performance Metrics</p>
      <div className="mt-3 flex items-center justify-between">
        <div>
          <p className="text-base font-semibold text-rf-text">{metric.member_name}</p>
          <p className="text-xs text-rf-text-muted">Workouts {metric.workouts}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-rf-accent">{metric.active_days}</p>
          <p className="text-xs text-rf-text-muted">Active Days</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-rf-text-muted">
        <div className="metric-pill rounded-2xl px-3 py-2">
          <p className="font-semibold text-rf-text">{metric.total_duration}</p>
          <p>Total mins</p>
        </div>
        <div className="metric-pill rounded-2xl px-3 py-2">
          <p className="font-semibold text-rf-text">{metric.avg_duration}</p>
          <p>Avg mins</p>
        </div>
        <div className="metric-pill rounded-2xl px-3 py-2">
          <p className="font-semibold text-rf-text">{metric.workout_types}</p>
          <p>Types</p>
        </div>
        <div className="metric-pill rounded-2xl px-3 py-2">
          <p className="font-semibold text-rf-text">{metric.avg_sleep_hours?.toFixed(1) ?? "—"}</p>
          <p>Avg sleep</p>
        </div>
        <div className="metric-pill rounded-2xl px-3 py-2">
          <p className="font-semibold text-rf-text">{avgDietLabel(metric.avg_food_quality)}</p>
          <p>Avg diet</p>
        </div>
        <div className="metric-pill rounded-2xl px-3 py-2">
          <p className="font-semibold text-rf-text">{metric.longest_streak}d</p>
          <p>Longest streak</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 items-center gap-3">
        <div className="metric-pill rounded-2xl px-3 py-2 text-xs text-rf-text-muted">
          <p className="font-semibold text-rf-text">{stepsLabel(metric.avg_steps ?? null)}</p>
          <p>Avg steps</p>
        </div>
        <span className="inline-flex items-center gap-2 justify-self-start rounded-full bg-amber-200/70 px-3 py-1 text-xs font-semibold text-amber-900">
          <FlameIcon className="h-3.5 w-3.5" /> Current streak {metric.current_streak}d
        </span>
      </div>
    </GlassCard>
  );
}

function MemberPickerModal({
  members,
  selected,
  allowNone,
  onClose,
  onSelect
}: {
  members: Member[];
  selected: Member | null;
  allowNone: boolean;
  onClose: () => void;
  onSelect: (member: Member | null) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = members.filter((member) =>
    member.member_name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <Modal open onClose={onClose}>
      <div className="modal-surface w-full max-w-lg rounded-3xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-rf-text">View as</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-rf-surface-muted px-3 py-1 text-xs font-semibold text-rf-text-muted"
          >
            Done
          </button>
        </div>
        <div className="mt-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search member"
            className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
          />
        </div>
        <div className="mt-4 max-h-[min(70vh,20rem)] overflow-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}>
          {allowNone && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold ${
                selected === null ? "text-rf-text" : "text-rf-text-muted"
              }`}
            >
              None
            </button>
          )}
          {filtered.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => onSelect(member)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-rf-text"
            >
              <span>{member.member_name}</span>
              {selected?.id === member.id && <span className="text-rf-accent">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
