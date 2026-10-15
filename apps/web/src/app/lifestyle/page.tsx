"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchProgramMembers, type Member } from "@/lib/api/programs";
import {
  fetchHealthTimeline,
  fetchStepsStats,
  fetchWorkoutTypeHighestParticipation,
  fetchWorkoutTypeLongestDuration,
  fetchWorkoutTypeMostPopular,
  fetchWorkoutTypePopularity,
  fetchWorkoutTypesTotal,
  type HealthTimelinePoint,
  type StepsStats,
  type WorkoutTypePopularity
} from "@/lib/api/lifestyle";
import { stepsLabel } from "@/lib/format";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { PageShell } from "@/components/ui/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconDumbbell as DumbbellIcon, IconSteps } from "@/components/icons";
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";
import { MemberPickerModal } from "@/components/MemberPickerModal";
import { appError } from "@/lib/kit/app-error";
import { fromQuery, retryNow, type QueryLike } from "@/lib/kit/async-state";
import { useOnlineStatus, useRefetchOnReconnect } from "@/lib/kit/use-online-status";
import {
  CHART_COLORS,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_AXIS_TICK,
  CHART_GRID_PROPS
} from "@/lib/chart-theme";

type PopularityMetricKey = "count" | "totalMinutes" | "avgMinutes";

type PopularityMetric = {
  key: PopularityMetricKey;
  title: string;
  axisLabel: string;
};

const POPULARITY_METRICS: PopularityMetric[] = [
  { key: "count", title: "Count", axisLabel: "Workouts" },
  { key: "totalMinutes", title: "Total Minutes", axisLabel: "Minutes" },
  { key: "avgMinutes", title: "Avg Minutes", axisLabel: "Avg mins" }
];

type CardStatus = "loading" | "failed" | "ready";

/** polish #31: "…" while a card's read is in flight (or waiting for the session), "—" when it failed. */
function cardStatus(query: QueryLike<unknown>): CardStatus {
  if (query.data !== undefined) return "ready";
  return fromQuery(query).status === "failed" ? "failed" : "loading";
}

function missingText(status: CardStatus, loadingText: string): string {
  return status === "failed" ? "—" : loadingText;
}

type AccentTone = { tint: string; text: string };
// polish #43: the bright hue tints the chip; text uses a dark-aware shade (globals.css --rf-accent-*) that passes
// contrast on light cards and keeps the bright hue in dark mode.
const ACCENTS: Record<"amber" | "violet" | "red" | "green" | "teal", AccentTone> = {
  amber: { tint: "#f59e0b", text: "var(--rf-accent-amber)" },
  violet: { tint: "#8b5cf6", text: "var(--rf-accent-violet)" },
  red: { tint: "#ef4444", text: "var(--rf-accent-red)" },
  green: { tint: "#22c55e", text: "var(--rf-accent-green)" },
  teal: { tint: "#14b8a6", text: "var(--rf-accent-teal)" }
};

export default function LifestylePage() {
  const router = useRouter();
  const { session, program, token, programId } = useAuthGuard();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const loggedInUserId = session?.user.id;

  const globalRole = session?.user.globalRole ?? "standard";
  const programRole = program?.my_role ?? "member";
  const isGlobalAdmin = globalRole === "global_admin";
  const isProgramAdmin = programRole === "admin" || isGlobalAdmin;
  const canViewAs = isProgramAdmin;
  const canAddWorkouts = isGlobalAdmin || (globalRole === "standard" && programRole === "admin");

  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [adminSelectedMember, setAdminSelectedMember] = useState<Member | null>(null);
  const [hasUserChosenViewAs, setHasUserChosenViewAs] = useState(false);

  const viewAsStorageKey = useMemo(() => {
    if (!programId || !loggedInUserId) return "";
    return `rf:lifestyle:view-as:${programId}:${loggedInUserId}`;
  }, [programId, loggedInUserId]);

  useEffect(() => {
    setAdminSelectedMember(null);
    setHasUserChosenViewAs(false);
  }, [programId, loggedInUserId]);

  const membersKey = ["lifestyle", "members", programId];
  const membersQuery = useQuery({
    queryKey: membersKey,
    queryFn: () => fetchProgramMembers(token, programId),
    enabled: !!token && !!programId && canViewAs
  });

  useEffect(() => {
    if (!canViewAs) return;
    if (!viewAsStorageKey) return;
    const stored = sessionStorage.getItem(viewAsStorageKey);
    if (!stored) return;
    setHasUserChosenViewAs(true);
    if (stored === "none") {
      setAdminSelectedMember(null);
      return;
    }
    if (!membersQuery.data) return;
    if (adminSelectedMember?.id === stored) return;
    const match = membersQuery.data.find((member) => member.id === stored);
    if (match) {
      setAdminSelectedMember(match);
    }
  }, [canViewAs, viewAsStorageKey, membersQuery.data, adminSelectedMember?.id]);

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
  }, [
    canViewAs,
    isGlobalAdmin,
    loggedInUserId,
    membersQuery.data,
    adminSelectedMember,
    viewAsStorageKey
  ]);

  const memberIdForMetrics = canViewAs ? adminSelectedMember?.id : loggedInUserId;
  const hasMemberContext = canViewAs || !!loggedInUserId;
  const metricKey = memberIdForMetrics ?? "program";
  const keys = {
    total: ["lifestyle", "workoutTypes", "total", programId, metricKey],
    mostPopular: ["lifestyle", "workoutTypes", "mostPopular", programId, metricKey],
    longest: ["lifestyle", "workoutTypes", "longest", programId, metricKey],
    participation: ["lifestyle", "workoutTypes", "participation", programId],
    popularity: ["lifestyle", "workoutTypes", "popularity", programId, metricKey],
    timeline: ["lifestyle", "healthTimeline", programId, metricKey, "week"],
    steps: ["lifestyle", "steps", programId, metricKey]
  };

  const workoutTypesTotalQuery = useQuery({
    queryKey: keys.total,
    queryFn: () => fetchWorkoutTypesTotal(token, programId, memberIdForMetrics),
    enabled: !!token && !!programId && hasMemberContext
  });

  const workoutTypeMostPopularQuery = useQuery({
    queryKey: keys.mostPopular,
    queryFn: () => fetchWorkoutTypeMostPopular(token, programId, memberIdForMetrics),
    enabled: !!token && !!programId && hasMemberContext
  });

  const workoutTypeLongestDurationQuery = useQuery({
    queryKey: keys.longest,
    queryFn: () => fetchWorkoutTypeLongestDuration(token, programId, memberIdForMetrics),
    enabled: !!token && !!programId && hasMemberContext
  });

  const workoutTypeHighestParticipationQuery = useQuery({
    queryKey: keys.participation,
    queryFn: () => fetchWorkoutTypeHighestParticipation(token, programId),
    enabled: !!token && !!programId
  });

  const workoutTypePopularityQuery = useQuery({
    queryKey: keys.popularity,
    queryFn: () => fetchWorkoutTypePopularity(token, programId, { memberId: memberIdForMetrics, limit: 120 }),
    enabled: !!token && !!programId && hasMemberContext
  });

  const healthTimelineQuery = useQuery({
    queryKey: keys.timeline,
    queryFn: () => fetchHealthTimeline(token, "week", programId, memberIdForMetrics),
    enabled: !!token && !!programId && hasMemberContext
  });

  const stepsStatsQuery = useQuery({
    queryKey: keys.steps,
    queryFn: () => fetchStepsStats(token, programId, memberIdForMetrics),
    enabled: !!token && !!programId && hasMemberContext
  });

  // polish #31: the Summary recipe. One ErrorView + Retry when a read fails with nothing to show, the stale banner
  // when a reload fails over shown data, refetch on reconnect; cards show "…" while loading and "—" on failure.
  const lifestyleQueries = [
    membersQuery,
    workoutTypesTotalQuery,
    workoutTypeMostPopularQuery,
    workoutTypeLongestDurationQuery,
    workoutTypeHighestParticipationQuery,
    workoutTypePopularityQuery,
    healthTimelineQuery,
    stepsStatsQuery
  ];
  const lifestyleKeys = [
    membersKey,
    keys.total,
    keys.mostPopular,
    keys.longest,
    keys.participation,
    keys.popularity,
    keys.timeline,
    keys.steps
  ]; // same order as lifestyleQueries
  const lifestyleStates = lifestyleQueries.map((query) => fromQuery<unknown>(query));
  const failedState = lifestyleStates.find((state) => state.status === "failed");
  const lifestyleError = failedState?.status === "failed" ? failedState.error : null;
  const lifestyleStale = lifestyleStates.some((state) => state.status === "stale");
  const retryLifestyle = () =>
    lifestyleQueries.forEach((query, index) => {
      if (query.isError || query.failureCount > 0) void retryNow(queryClient, lifestyleKeys[index]);
    });
  useRefetchOnReconnect(lifestyleQueries);
  const totalStatus = cardStatus(workoutTypesTotalQuery);
  const mostPopularStatus = cardStatus(workoutTypeMostPopularQuery);
  const longestStatus = cardStatus(workoutTypeLongestDurationQuery);
  const participationStatus = cardStatus(workoutTypeHighestParticipationQuery);

  const viewAsLabel = useMemo(() => {
    if (!canViewAs) return "";
    if (adminSelectedMember) return adminSelectedMember.member_name;
    if (isGlobalAdmin) return "Admin";
    if (hasUserChosenViewAs) return "Admin";
    return session?.user.memberName ?? "Member";
  }, [canViewAs, adminSelectedMember, isGlobalAdmin, hasUserChosenViewAs, session?.user.memberName]);

  const timelinePoints = healthTimelineQuery.data?.buckets ?? [];

  return (
    <PageShell>
        <header className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-rf-text">Lifestyle</h1>
            <p className="mt-1 text-sm font-semibold text-rf-text-muted">{program?.name ?? "Program"}</p>
          </div>
          {!!programId && (
            <button
              type="button"
              onClick={() => router.push("/lifestyle/workouts")}
              className="ml-auto inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 px-4 py-2 text-xs font-semibold text-black shadow-lg"
              aria-label={canAddWorkouts ? "View and add workout types" : "View workout types"}
            >
              <DumbbellIcon className="h-5 w-5 text-black" />
              <span>{canAddWorkouts ? "Manage workouts" : "View workouts"}</span>
            </button>
          )}
        </header>

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

        {!canViewAs && !loggedInUserId && (
          <EmptyState message="Unable to identify the logged-in member." />
        )}

        {/* polish-1 rule 6: a read that failed while offline shows the kit's offline view. */}
        {lifestyleError && <ErrorView error={online ? lifestyleError : appError("offline")} onRetry={retryLifestyle} />}

        <div className="grid gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <WorkoutStatCard
              title="Total workout types"
              accent={ACCENTS.amber}
              chipLabel="Program to date"
              value={
                workoutTypesTotalQuery.data
                  ? String(workoutTypesTotalQuery.data.total_types)
                  : missingText(totalStatus, "…")
              }
              subtitle={workoutTypesTotalQuery.data ? "different exercises" : missingText(totalStatus, "Loading")}
            />
            <WorkoutStatCard
              title="Most popular"
              accent={ACCENTS.violet}
              chipLabel="Program to date"
              value={
                workoutTypeMostPopularQuery.data
                  ? workoutTypeMostPopularQuery.data.workout_name ?? "N/A"
                  : missingText(mostPopularStatus, "…")
              }
              subtitle={
                workoutTypeMostPopularQuery.data
                  ? workoutTypeMostPopularQuery.data.workout_name == null
                    ? "No data"
                    : `${workoutTypeMostPopularQuery.data.sessions} workouts`
                  : missingText(mostPopularStatus, "Loading")
              }
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <WorkoutStatCard
              title="Longest duration"
              accent={ACCENTS.red}
              chipLabel="Program to date"
              value={
                workoutTypeLongestDurationQuery.data
                  ? workoutTypeLongestDurationQuery.data.workout_name ?? "N/A"
                  : missingText(longestStatus, "…")
              }
              subtitle={
                workoutTypeLongestDurationQuery.data
                  ? workoutTypeLongestDurationQuery.data.workout_name == null
                    ? "No data"
                    : `${workoutTypeLongestDurationQuery.data.avg_minutes} mins avg`
                  : missingText(longestStatus, "Loading")
              }
            />
            <WorkoutStatCard
              title="Highest participation"
              accent={ACCENTS.green}
              chipLabel="Program to date"
              value={
                workoutTypeHighestParticipationQuery.data
                  ? workoutTypeHighestParticipationQuery.data.workout_name ?? "N/A"
                  : missingText(participationStatus, "…")
              }
              subtitle={
                workoutTypeHighestParticipationQuery.data
                  ? workoutTypeHighestParticipationQuery.data.workout_name == null
                    ? "No data"
                    : `${workoutTypeHighestParticipationQuery.data.participation_pct.toFixed(1)}% of members`
                  : missingText(participationStatus, "Loading")
              }
            />
          </div>

          <StepsStatsCard stats={stepsStatsQuery.data} status={cardStatus(stepsStatsQuery)} />

          <WorkoutTypePopularityCard
            types={workoutTypePopularityQuery.data ?? []}
            status={cardStatus(workoutTypePopularityQuery)}
          />

          <LifestyleTimelineCard
            points={timelinePoints}
            status={cardStatus(healthTimelineQuery)}
            onClick={() => {
              const params = memberIdForMetrics ? `?memberId=${memberIdForMetrics}` : "";
              router.push(`/lifestyle/timeline${params}`);
            }}
          />

          <StepsTimelineCard
            points={timelinePoints}
            status={cardStatus(healthTimelineQuery)}
            onClick={() => {
              const params = memberIdForMetrics ? `?memberId=${memberIdForMetrics}` : "";
              router.push(`/lifestyle/steps-timeline${params}`);
            }}
          />
        </div>

      <MemberPickerModal
        open={showMemberPicker}
        members={membersQuery.data ?? []}
        selected={adminSelectedMember}
        allowNone
        noneLabel={isGlobalAdmin ? "None" : "Admin"}
        onClose={() => setShowMemberPicker(false)}
        onSelect={(member) => {
          setAdminSelectedMember(member);
          setHasUserChosenViewAs(true);
          setShowMemberPicker(false);
          if (viewAsStorageKey) {
            sessionStorage.setItem(viewAsStorageKey, member ? member.id : "none");
          }
        }}
      />

      {lifestyleStale && !lifestyleError && online && (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="stale" onRetry={retryLifestyle} />
        </>
      )}
    </PageShell>
  );
}

function WorkoutStatCard({
  title,
  accent,
  chipLabel,
  value,
  subtitle
}: {
  title: string;
  accent: AccentTone;
  chipLabel: string;
  value: string;
  subtitle: string;
}) {
  return (
    <GlassCard padding="md">
      <p className="text-sm font-semibold text-rf-text-muted">{title}</p>
      <div className="mt-2">
        <AccentChip label={chipLabel} accent={accent} />
      </div>
      <p className="mt-4 text-2xl font-bold" style={{ color: accent.text }}>
        {value}
      </p>
      <p className="mt-2 text-xs font-semibold text-rf-text-muted">{subtitle}</p>
    </GlassCard>
  );
}

function AccentChip({ label, accent }: { label: string; accent: AccentTone }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: `${accent.tint}22`, color: accent.text }}
    >
      {label}
    </span>
  );
}

function LifestyleTimelineCard({
  points,
  status,
  onClick
}: {
  points: HealthTimelinePoint[];
  status: CardStatus;
  onClick: () => void;
}) {
  const trimmed = useMemo(() => points.slice(-10), [points]);
  const yMax = Math.max(1, ...trimmed.map((point) => Math.max(point.sleep_hours, point.food_quality)));

  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card group rounded-3xl p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
      aria-label="View lifestyle timeline"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-rf-text-muted">Lifestyle Timeline</p>
          <p className="text-lg font-semibold text-rf-text">Sleep · Diet quality</p>
        </div>
        <span className="text-sm font-semibold text-rf-text-muted opacity-60 transition group-hover:opacity-100">›</span>
      </div>

      {status === "loading" && (
        <div className="mt-6 rounded-2xl bg-rf-surface-muted px-4 py-8 text-center text-sm text-rf-text-muted">
          Loading timeline...
        </div>
      )}

      {status === "failed" && (
        <div className="mt-6 rounded-2xl bg-rf-surface-muted px-4 py-8 text-center text-sm text-rf-text-muted">—</div>
      )}

      {status === "ready" && trimmed.length === 0 && (
        <div className="mt-6 rounded-2xl bg-rf-surface-muted px-4 py-8 text-center text-sm text-rf-text-muted">
          No data yet.
        </div>
      )}

      {status === "ready" && trimmed.length > 0 && (
        <div className="mt-4 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trimmed}>
              <CartesianGrid {...CHART_GRID_PROPS} />
              <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
              <YAxis hide domain={[0, yMax * 1.1]} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                formatter={(value: number, name: string) => {
                  if (name === "sleep_hours") return [`${value} hrs`, "Sleep"];
                  return [`${value} / 5`, "Diet"];
                }}
              />
              <Bar dataKey="sleep_hours" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
              <Line type="monotone" dataKey="food_quality" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </button>
  );
}

const STEPS_ACCENT = "#14b8a6";

function StepsStatsCard({ stats, status }: { stats?: StepsStats; status: CardStatus }) {
  return (
    <GlassCard padding="md">
      <div className="flex items-center gap-2">
        <span className="inline-flex" style={{ color: ACCENTS.teal.text }}>
          <IconSteps className="h-5 w-5" />
        </span>
        <p className="text-sm font-semibold text-rf-text-muted">Steps</p>
        <AccentChip label="Program to date" accent={ACCENTS.teal} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-rf-text-muted">Total steps</p>
          <p className="mt-1 text-2xl font-bold" style={{ color: ACCENTS.teal.text }}>
            {stats ? stepsLabel(stats.total_steps) : missingText(status, "…")}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-rf-text-muted">Avg steps/day</p>
          <p className="mt-1 text-2xl font-bold" style={{ color: ACCENTS.teal.text }}>
            {stats ? stepsLabel(stats.avg_steps_per_day) : missingText(status, "…")}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

function StepsTimelineCard({
  points,
  status,
  onClick
}: {
  points: HealthTimelinePoint[];
  status: CardStatus;
  onClick: () => void;
}) {
  const trimmed = useMemo(() => points.slice(-10), [points]);
  const yMax = Math.max(1, ...trimmed.map((point) => point.steps));

  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card group rounded-3xl p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
      aria-label="View steps timeline"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-rf-text-muted">Steps Timeline</p>
          <p className="text-lg font-semibold text-rf-text">Daily steps</p>
        </div>
        <span className="text-sm font-semibold text-rf-text-muted opacity-60 transition group-hover:opacity-100">›</span>
      </div>

      {status === "loading" && (
        <div className="mt-6 rounded-2xl bg-rf-surface-muted px-4 py-8 text-center text-sm text-rf-text-muted">
          Loading timeline...
        </div>
      )}

      {status === "failed" && (
        <div className="mt-6 rounded-2xl bg-rf-surface-muted px-4 py-8 text-center text-sm text-rf-text-muted">—</div>
      )}

      {status === "ready" && trimmed.length === 0 && (
        <div className="mt-6 rounded-2xl bg-rf-surface-muted px-4 py-8 text-center text-sm text-rf-text-muted">
          No data yet.
        </div>
      )}

      {status === "ready" && trimmed.length > 0 && (
        <div className="mt-4 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trimmed}>
              <CartesianGrid {...CHART_GRID_PROPS} />
              <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
              <YAxis hide domain={[0, yMax * 1.1]} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                formatter={(value: number) => [value.toLocaleString(), "Steps"]}
              />
              <Bar dataKey="steps" fill={STEPS_ACCENT} radius={[6, 6, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </button>
  );
}

function WorkoutTypePopularityCard({
  types,
  status
}: {
  types: WorkoutTypePopularity[];
  status: CardStatus;
}) {
  const [metric, setMetric] = useState<PopularityMetricKey>("count");
  const [showAll, setShowAll] = useState(false);

  const metricConfig = POPULARITY_METRICS.find((item) => item.key === metric) ?? POPULARITY_METRICS[0];

  const sortedTypes = useMemo(() => {
    return [...types].sort((a, b) => metricValue(metric, b) - metricValue(metric, a));
  }, [types, metric]);

  const displayTypes = useMemo(() => {
    if (!showAll) return sortedTypes.slice(0, 10);
    return sortedTypes;
  }, [sortedTypes, showAll]);

  const maxValue = Math.max(1, ...displayTypes.map((item) => metricValue(metric, item)));

  return (
    <GlassCard padding="md">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-rf-text-muted">Workout Type Popularity</p>
          <p className="text-base font-semibold text-rf-text">Program to date</p>
        </div>
      </div>

      {status === "loading" && (
        <div className="mt-4 rounded-2xl bg-rf-surface-muted px-4 py-6 text-sm text-rf-text-muted">
          Loading workout types...
        </div>
      )}

      {status === "failed" && <p className="mt-4 text-sm text-rf-text-muted">—</p>}

      {status === "ready" && displayTypes.length === 0 && (
        <p className="mt-4 text-sm text-rf-text-muted">No workouts logged yet.</p>
      )}

      {status === "ready" && displayTypes.length > 0 && (
        <>
          <div className="segmented-control mt-4 flex rounded-full p-1">
            {POPULARITY_METRICS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setMetric(item.key)}
                data-active={metric === item.key}
                aria-pressed={metric === item.key}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-full px-3 text-xs font-semibold transition"
              >
                {item.title}
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs font-semibold text-rf-text-muted">{metricConfig.axisLabel}</p>
          <div className="mt-3 space-y-3">
            {displayTypes.map((item) => {
              const value = metricValue(metric, item);
              const width = Math.max(6, (value / maxValue) * 100);
              const color = workoutTypeColor(item.workout_name);
              return (
                <div key={item.workout_name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-rf-text">{item.workout_name}</span>
                    <span className="text-rf-text-muted">{metricFormattedValue(metric, item)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-rf-surface-muted">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${width}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {sortedTypes.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="mt-4 inline-flex min-h-[44px] items-center text-sm font-semibold text-rf-accent"
            >
              {showAll ? "Show top 10" : "Show all"}
            </button>
          )}
        </>
      )}
    </GlassCard>
  );
}

function metricValue(metric: PopularityMetricKey, type: WorkoutTypePopularity) {
  switch (metric) {
    case "totalMinutes":
      return type.total_duration;
    case "avgMinutes":
      return type.avg_duration_minutes;
    default:
      return type.sessions;
  }
}

function metricFormattedValue(metric: PopularityMetricKey, type: WorkoutTypePopularity) {
  switch (metric) {
    case "totalMinutes":
      return `${type.total_duration} mins`;
    case "avgMinutes":
      return `${type.avg_duration_minutes} mins`;
    default:
      return `${type.sessions}`;
  }
}

function workoutTypeColor(name: string) {
  const palette = [
    "#f59e0b",
    "#38bdf8",
    "#22c55e",
    "#a855f7",
    "#f43f5e",
    "#14b8a6",
    "#fb7185",
    "#60a5fa",
    "#f59e0b",
    "#84cc16",
    "#0ea5a4",
    "#db2777"
  ];
  let hash = 5381;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash << 5) + hash + name.charCodeAt(i);
  }
  const idx = Math.abs(hash) % palette.length;
  return palette[idx];
}
