"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchProgramMembers, type Member } from "@/lib/api/programs";
import {
  fetchHealthTimeline,
  fetchWorkoutTypeHighestParticipation,
  fetchWorkoutTypeLongestDuration,
  fetchWorkoutTypeMostPopular,
  fetchWorkoutTypePopularity,
  fetchWorkoutTypesTotal,
  type HealthTimelinePoint,
  type WorkoutTypePopularity
} from "@/lib/api/lifestyle";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { PageShell } from "@/components/ui/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconDumbbell as DumbbellIcon } from "@/components/icons";
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

export default function LifestylePage() {
  const router = useRouter();
  const { session, program, token, programId } = useAuthGuard();
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

  const membersQuery = useQuery({
    queryKey: ["lifestyle", "members", programId],
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

  const workoutTypesTotalQuery = useQuery({
    queryKey: ["lifestyle", "workoutTypes", "total", programId, memberIdForMetrics ?? "program"],
    queryFn: () => fetchWorkoutTypesTotal(token, programId, memberIdForMetrics),
    enabled: !!token && !!programId && hasMemberContext
  });

  const workoutTypeMostPopularQuery = useQuery({
    queryKey: ["lifestyle", "workoutTypes", "mostPopular", programId, memberIdForMetrics ?? "program"],
    queryFn: () => fetchWorkoutTypeMostPopular(token, programId, memberIdForMetrics),
    enabled: !!token && !!programId && hasMemberContext
  });

  const workoutTypeLongestDurationQuery = useQuery({
    queryKey: ["lifestyle", "workoutTypes", "longest", programId, memberIdForMetrics ?? "program"],
    queryFn: () => fetchWorkoutTypeLongestDuration(token, programId, memberIdForMetrics),
    enabled: !!token && !!programId && hasMemberContext
  });

  const workoutTypeHighestParticipationQuery = useQuery({
    queryKey: ["lifestyle", "workoutTypes", "participation", programId],
    queryFn: () => fetchWorkoutTypeHighestParticipation(token, programId),
    enabled: !!token && !!programId
  });

  const workoutTypePopularityQuery = useQuery({
    queryKey: ["lifestyle", "workoutTypes", "popularity", programId, memberIdForMetrics ?? "program"],
    queryFn: () => fetchWorkoutTypePopularity(token, programId, { memberId: memberIdForMetrics, limit: 120 }),
    enabled: !!token && !!programId && hasMemberContext
  });

  const healthTimelineQuery = useQuery({
    queryKey: ["lifestyle", "healthTimeline", programId, memberIdForMetrics ?? "program", "week"],
    queryFn: () => fetchHealthTimeline(token, "week", programId, memberIdForMetrics),
    enabled: !!token && !!programId && hasMemberContext
  });

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
              className="ml-auto inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 px-4 py-2 text-xs font-semibold text-black shadow-lg"
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

        <div className="grid gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <WorkoutStatCard
              title="Total workout types"
              accent="#f59e0b"
              chipLabel="Program to date"
              value={
                workoutTypesTotalQuery.data
                  ? String(workoutTypesTotalQuery.data.total_types)
                  : workoutTypesTotalQuery.isLoading
                    ? "…"
                    : "—"
              }
              subtitle={
                workoutTypesTotalQuery.data
                  ? "different exercises"
                  : workoutTypesTotalQuery.isLoading
                    ? "Loading"
                    : "No data"
              }
            />
            <WorkoutStatCard
              title="Most popular"
              accent="#8b5cf6"
              chipLabel="Program to date"
              value={
                workoutTypeMostPopularQuery.data?.workout_name ??
                (workoutTypeMostPopularQuery.isLoading ? "…" : "N/A")
              }
              subtitle={
                workoutTypeMostPopularQuery.data
                  ? `${workoutTypeMostPopularQuery.data.sessions} workouts`
                  : workoutTypeMostPopularQuery.isLoading
                    ? "Loading"
                    : "No data"
              }
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <WorkoutStatCard
              title="Longest duration"
              accent="#ef4444"
              chipLabel="Program to date"
              value={
                workoutTypeLongestDurationQuery.data?.workout_name ??
                (workoutTypeLongestDurationQuery.isLoading ? "…" : "N/A")
              }
              subtitle={
                workoutTypeLongestDurationQuery.data
                  ? `${workoutTypeLongestDurationQuery.data.avg_minutes} mins avg`
                  : workoutTypeLongestDurationQuery.isLoading
                    ? "Loading"
                    : "No data"
              }
            />
            <WorkoutStatCard
              title="Highest participation"
              accent="#22c55e"
              chipLabel="Program to date"
              value={
                workoutTypeHighestParticipationQuery.data?.workout_name ??
                (workoutTypeHighestParticipationQuery.isLoading ? "…" : "N/A")
              }
              subtitle={
                workoutTypeHighestParticipationQuery.data
                  ? `${workoutTypeHighestParticipationQuery.data.participation_pct.toFixed(1)}% of members`
                  : workoutTypeHighestParticipationQuery.isLoading
                    ? "Loading"
                    : "No data"
              }
            />
          </div>

          <LifestyleTimelineCard
            points={timelinePoints}
            isLoading={healthTimelineQuery.isLoading}
            onClick={() => {
              const params = memberIdForMetrics ? `?memberId=${memberIdForMetrics}` : "";
              router.push(`/lifestyle/timeline${params}`);
            }}
          />

          <WorkoutTypePopularityCard
            types={workoutTypePopularityQuery.data ?? []}
            isLoading={workoutTypePopularityQuery.isLoading}
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
  accent: string;
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
      <p className="mt-4 text-2xl font-bold" style={{ color: accent }}>
        {value}
      </p>
      <p className="mt-2 text-xs font-semibold text-rf-text-muted">{subtitle}</p>
    </GlassCard>
  );
}

function AccentChip({ label, accent }: { label: string; accent: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: `${accent}22`, color: accent }}
    >
      {label}
    </span>
  );
}

function LifestyleTimelineCard({
  points,
  isLoading,
  onClick
}: {
  points: HealthTimelinePoint[];
  isLoading: boolean;
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

      {isLoading && (
        <div className="mt-6 rounded-2xl bg-rf-surface-muted px-4 py-8 text-center text-sm text-rf-text-muted">
          Loading timeline...
        </div>
      )}

      {!isLoading && trimmed.length === 0 && (
        <div className="mt-6 rounded-2xl bg-rf-surface-muted px-4 py-8 text-center text-sm text-rf-text-muted">
          No data yet.
        </div>
      )}

      {!isLoading && trimmed.length > 0 && (
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

function WorkoutTypePopularityCard({
  types,
  isLoading
}: {
  types: WorkoutTypePopularity[];
  isLoading: boolean;
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

      {isLoading && (
        <div className="mt-4 rounded-2xl bg-rf-surface-muted px-4 py-6 text-sm text-rf-text-muted">
          Loading workout types...
        </div>
      )}

      {!isLoading && displayTypes.length === 0 && (
        <p className="mt-4 text-sm text-rf-text-muted">No workouts logged yet.</p>
      )}

      {!isLoading && displayTypes.length > 0 && (
        <>
          <div className="segmented-control mt-4 flex rounded-full p-1">
            {POPULARITY_METRICS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setMetric(item.key)}
                data-active={metric === item.key}
                className="flex-1 rounded-full px-3 py-2 text-xs font-semibold transition"
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
              className="mt-4 text-sm font-semibold text-rf-accent"
            >
              {showAll ? "Show top 10" : "Show all"}
            </button>
          )}
        </>
      )}
    </GlassCard>
  );
}

function MemberPickerModal({
  open,
  members,
  selected,
  allowNone,
  noneLabel,
  onClose,
  onSelect
}: {
  open: boolean;
  members: Member[];
  selected: Member | null;
  allowNone: boolean;
  noneLabel: string;
  onClose: () => void;
  onSelect: (member: Member | null) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = members.filter((member) =>
    member.member_name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <Modal open={open} onClose={onClose}>
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
              {noneLabel}
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
