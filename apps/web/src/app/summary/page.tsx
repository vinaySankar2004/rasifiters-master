"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  fetchActivityTimeline,
  fetchAnalyticsSummary,
  fetchAvgDurationMTD,
  fetchDistributionByDay,
  fetchMTDParticipation,
  fetchTotalDurationMTD,
  fetchTotalWorkoutsMTD,
  fetchWorkoutTypes,
  ActivityTimelinePoint,
  AnalyticsSummary,
  WorkoutType
} from "@/lib/api/summary";
import { addDailyHealthLog, addWorkoutLogsBatch, BulkRowError, BulkWorkoutEntry } from "@/lib/api/logs";
import { ApiError } from "@/lib/api/client";
import { LogWorkoutsForm } from "@/components/forms/LogWorkoutsForm";
import { LogDailyHealthForm } from "@/components/forms/LogDailyHealthForm";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { isDataEntryLocked, DATA_LOCK_MESSAGE } from "@/lib/permissions";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { PageShell } from "@/components/ui/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Modal } from "@/components/ui/Modal";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusBadge, programStatusVariant } from "@/components/ui/StatusBadge";
import {
  CHART_COLORS,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_GRID_PROPS
} from "@/lib/chart-theme";

type PeriodKey = "week" | "month" | "year" | "program";

export default function SummaryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, program, token, programId } = useAuthGuard();

  const isMobile = useIsMobile();
  const summaryPeriod: PeriodKey = "week";
  const [showWorkoutsForm, setShowWorkoutsForm] = useState(false);
  const [showHealthForm, setShowHealthForm] = useState(false);
  const canLogForAny =
    session?.user.globalRole === "global_admin" ||
    program?.my_role === "admin" ||
    program?.my_role === "logger";
  const dataEntryLocked = isDataEntryLocked(session, program);

  const analyticsQuery = useQuery({
    queryKey: ["summary", programId, summaryPeriod],
    queryFn: () => fetchAnalyticsSummary(token, summaryPeriod, programId),
    enabled: !!token && !!programId
  });

  const mtdParticipationQuery = useQuery({
    queryKey: ["summary", "mtdParticipation", programId],
    queryFn: () => fetchMTDParticipation(token, programId),
    enabled: !!token && !!programId
  });

  const totalWorkoutsQuery = useQuery({
    queryKey: ["summary", "totalWorkouts", programId],
    queryFn: () => fetchTotalWorkoutsMTD(token, programId),
    enabled: !!token && !!programId
  });

  const totalDurationQuery = useQuery({
    queryKey: ["summary", "totalDuration", programId],
    queryFn: () => fetchTotalDurationMTD(token, programId),
    enabled: !!token && !!programId
  });

  const avgDurationQuery = useQuery({
    queryKey: ["summary", "avgDuration", programId],
    queryFn: () => fetchAvgDurationMTD(token, programId),
    enabled: !!token && !!programId
  });

  const activityTimelineQuery = useQuery({
    queryKey: ["summary", "timeline", programId, summaryPeriod],
    queryFn: () => fetchActivityTimeline(token, summaryPeriod, programId),
    enabled: !!token && !!programId
  });

  const distributionQuery = useQuery({
    queryKey: ["summary", "distribution", programId],
    queryFn: () => fetchDistributionByDay(token, programId),
    enabled: !!token && !!programId
  });

  const workoutTypesQuery = useQuery({
    queryKey: ["summary", "workoutTypes", programId],
    queryFn: () => fetchWorkoutTypes(token, programId, 50),
    enabled: !!token && !!programId
  });

  const workoutsMutation = useMutation({
    mutationFn: (entries: BulkWorkoutEntry[]) =>
      addWorkoutLogsBatch(token, { program_id: programId, entries }),
    onSuccess: async () => {
      await refreshSummaryQueries(queryClient);
      setShowWorkoutsForm(false);
    }
  });

  const dailyHealthMutation = useMutation({
    mutationFn: (payload: { member_id?: string; log_date: string; sleep_hours?: number | null; food_quality?: number | null }) => {
      return addDailyHealthLog(token, {
        program_id: programId,
        ...payload
      });
    },
    onSuccess: async () => {
      await refreshSummaryQueries(queryClient);
      setShowHealthForm(false);
    }
  });

  const activityData = activityTimelineQuery.data?.buckets ?? [];
  const distributionPoints = useMemo(() => {
    const data = distributionQuery.data;
    if (!data) return [];
    return [
      { day: "Sun", value: data.Sunday },
      { day: "Mon", value: data.Monday },
      { day: "Tue", value: data.Tuesday },
      { day: "Wed", value: data.Wednesday },
      { day: "Thu", value: data.Thursday },
      { day: "Fri", value: data.Friday },
      { day: "Sat", value: data.Saturday }
    ];
  }, [distributionQuery.data]);

  const topWorkoutTypes = useMemo(() => {
    const types = workoutTypesQuery.data ?? [];
    return [...types].sort((a, b) => b.sessions - a.sessions).slice(0, 6);
  }, [workoutTypesQuery.data]);

  const userInitials = useMemo(() => {
    const name = session?.user.memberName ?? session?.user.username ?? "U";
    return name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase())
      .slice(0, 2)
      .join("");
  }, [session?.user.memberName, session?.user.username]);

  return (
    <PageShell>
        <SummaryHeader title="Summary" subtitle={program?.name ?? "Program"} initials={userInitials || "RF"} />

        {analyticsQuery.isError && (
          <ErrorState message={(analyticsQuery.error as Error).message} />
        )}

        <div className="grid gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <ProgramProgressCard summary={analyticsQuery.data} />
            <ActivityTimelineCard
              label={activityTimelineQuery.data?.label ?? "Activity"}
              dailyAverage={activityTimelineQuery.data?.daily_average ?? 0}
              points={activityData}
              onClick={() => router.push("/summary/activity")}
            />
          </div>

          {dataEntryLocked && (
            <div className="flex items-center gap-3 rounded-2xl border border-rf-border bg-rf-surface-muted px-4 py-3 text-sm font-semibold text-rf-text-muted">
              <span aria-hidden>🔒</span>
              <span>{DATA_LOCK_MESSAGE}</span>
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <AddWorkoutCard
              disabled={dataEntryLocked}
              onClick={() => (isMobile ? router.push("/summary/log-workout") : setShowWorkoutsForm(true))}
            />
            <AddHealthCard
              disabled={dataEntryLocked}
              onClick={() => (isMobile ? router.push("/summary/log-health") : setShowHealthForm(true))}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="MTD Participation"
              value={
                mtdParticipationQuery.data
                  ? `${mtdParticipationQuery.data.participation_pct.toFixed(1)}%`
                  : "—"
              }
              subtitle={
                mtdParticipationQuery.data
                  ? `${mtdParticipationQuery.data.active_members} / ${mtdParticipationQuery.data.total_members} members`
                  : "Loading..."
              }
              delta={mtdParticipationQuery.data?.change_pct}
            />
            <StatCard
              title="Total Workouts"
              value={totalWorkoutsQuery.data ? `${totalWorkoutsQuery.data.total_workouts}` : "—"}
              subtitle="Month to date"
              delta={totalWorkoutsQuery.data?.change_pct}
            />
            <StatCard
              title="Total Duration"
              value={
                totalDurationQuery.data
                  ? `${(totalDurationQuery.data.total_minutes / 60).toFixed(1)} hrs`
                  : "—"
              }
              subtitle="Month to date"
              delta={totalDurationQuery.data?.change_pct}
            />
            <StatCard
              title="Avg Duration"
              value={avgDurationQuery.data ? `${avgDurationQuery.data.avg_minutes} min` : "—"}
              subtitle="Month to date"
              delta={avgDurationQuery.data?.change_pct}
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <DistributionCard points={distributionPoints} onClick={() => router.push("/summary/distribution")} />
            <WorkoutTypesCard types={topWorkoutTypes} onClick={() => router.push("/summary/workout-types")} />
          </div>
        </div>

        <Modal open={showWorkoutsForm} onClose={() => setShowWorkoutsForm(false)}>
          <LogWorkoutsForm
            canSelectAnyMember={canLogForAny}
            selfMemberId={session?.user.id}
            programId={programId}
            token={token}
            onClose={() => setShowWorkoutsForm(false)}
            onSubmit={(entries) => workoutsMutation.mutate(entries)}
            isSaving={workoutsMutation.isPending}
            errorMessage={workoutsMutation.isError ? (workoutsMutation.error as Error).message : null}
            rowErrors={
              workoutsMutation.error instanceof ApiError
                ? (workoutsMutation.error.details as BulkRowError[] | undefined) ?? null
                : null
            }
          />
        </Modal>

        <Modal open={showHealthForm} onClose={() => setShowHealthForm(false)}>
          <LogDailyHealthForm
            canSelectAnyMember={canLogForAny}
            programId={programId}
            token={token}
            userId={session?.user.id}
            onClose={() => setShowHealthForm(false)}
            onSubmit={(payload) => dailyHealthMutation.mutate(payload)}
            isSaving={dailyHealthMutation.isPending}
            errorMessage={dailyHealthMutation.isError ? (dailyHealthMutation.error as Error).message : null}
          />
        </Modal>
    </PageShell>
  );
}

async function refreshSummaryQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ["summary"] });
}

function SummaryHeader({
  title,
  subtitle,
  initials
}: {
  title: string;
  subtitle: string;
  initials: string;
}) {
  return (
    <div className="flex items-center gap-6">
      <div>
        <h1 className="text-3xl font-bold text-rf-text">{title}</h1>
        <p className="mt-1 text-sm font-semibold text-rf-text-muted">{subtitle}</p>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rf-accent text-base font-bold text-black">
          {initials}
        </div>
      </div>
    </div>
  );
}

function ProgramProgressCard({ summary }: { summary?: AnalyticsSummary }) {
  const progress = summary?.program_progress;
  const percent = progress?.progress_percent ?? 0;
  const elapsed = progress?.elapsed_days ?? 0;
  const total = progress?.total_days ?? 0;
  const size = 120;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <GlassCard padding="lg" className="w-full">
      <h3 className="text-left text-lg font-semibold text-rf-text">Program Progress</h3>
      <div className="mt-6 flex flex-col items-center gap-4 text-center">
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="absolute inset-0">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="var(--rf-border)"
              strokeWidth={stroke}
              fill="none"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#ff8b1f"
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
            />
          </svg>
          <div className="relative z-10 text-center">
            <p className="text-2xl font-bold">{percent}%</p>
            <p className="text-xs text-rf-text-muted">
              {elapsed}/{total} days
            </p>
          </div>
        </div>
        <StatusBadge variant={programStatusVariant(progress?.status ?? "active")}>{progress?.status ?? "active"}</StatusBadge>
        <div className="flex flex-wrap items-center justify-center gap-6">
          <div>
            <p className="text-sm text-rf-text-muted">Elapsed</p>
            <p className="text-lg font-semibold text-rf-text">{elapsed} days</p>
          </div>
          <div>
            <p className="text-sm text-rf-text-muted">Remaining</p>
            <p className="text-lg font-semibold text-rf-text">{progress?.remaining_days ?? 0} days</p>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function AddWorkoutCard({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-full rounded-3xl bg-gradient-to-br from-orange-300 via-orange-400 to-orange-500 p-6 text-left text-black shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/25 text-lg font-bold">+</div>
        <span className="text-sm font-semibold">›</span>
      </div>
      <h3 className="mt-4 text-xl font-bold">Add workouts</h3>
      <p className="mt-2 text-sm text-black/70">Log one or many sessions at once and keep progress up to date.</p>
      <div className="mt-6 inline-flex items-center rounded-full bg-black/15 px-4 py-2 text-sm font-semibold">
        Log sessions
      </div>
    </button>
  );
}

function AddHealthCard({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-full rounded-3xl bg-gradient-to-br from-sky-400 via-sky-500 to-blue-600 p-6 text-left text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/25 text-lg font-bold">✦</div>
        <span className="text-sm font-semibold">›</span>
      </div>
      <h3 className="mt-4 text-xl font-bold">Log daily health</h3>
      <p className="mt-2 text-sm text-white/80">Track sleep hours and diet quality for the day.</p>
      <div className="mt-6 inline-flex items-center rounded-full bg-white/20 px-4 py-2 text-sm font-semibold">
        Log day
      </div>
    </button>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  delta
}: {
  title: string;
  value: string;
  subtitle: string;
  delta?: number;
}) {
  return (
    <GlassCard>
      <p className="text-sm font-semibold text-rf-text-muted">{title}</p>
      <p className="mt-3 text-2xl font-bold text-rf-text">{value}</p>
      <div className="mt-2 flex items-center justify-between text-xs text-rf-text-muted">
        <span>{subtitle}</span>
        {delta !== undefined && (
          <span className={delta >= 0 ? "text-emerald-600" : "text-rf-danger"}>
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(1)}%
          </span>
        )}
      </div>
    </GlassCard>
  );
}

function ActivityTimelineCard({
  label,
  dailyAverage,
  points,
  onClick
}: {
  label: string;
  dailyAverage: number;
  points: ActivityTimelinePoint[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card group rounded-3xl p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
      aria-label="View activity timeline"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-rf-text-muted">Activity Timeline</p>
          <p className="text-lg font-semibold text-rf-text">{label}</p>
        </div>
        <div className="text-right">
          <span className="text-lg font-semibold text-rf-text-muted">&gt;</span>
          <p className="mt-1 text-xs text-rf-text-muted">Daily avg</p>
          <p className="text-base font-semibold text-rf-text">{dailyAverage.toFixed(1)}</p>
        </div>
      </div>
      <div className="mt-4 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points}>
                    <CartesianGrid {...CHART_GRID_PROPS} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--rf-text-muted)" }} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                      formatter={(value: number, name: string) => [value, name === "workouts" ? "Workouts" : "Active members"]}
                    />
                    <Bar dataKey="workouts" fill={CHART_COLORS[0]} radius={[8, 8, 0, 0]} />
                    <Bar dataKey="active_members" fill={CHART_COLORS[1]} radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </button>
  );
}

function DistributionCard({
  points,
  onClick
}: {
  points: { day: string; value: number }[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card group rounded-3xl p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
      aria-label="View workout distribution"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-rf-text-muted">Workout Distribution</p>
          <p className="text-lg font-semibold text-rf-text">By day of week</p>
        </div>
        <span className="text-sm font-semibold text-rf-text-muted opacity-60 transition group-hover:opacity-100">›</span>
      </div>
      <div className="mt-4 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points}>
            <CartesianGrid {...CHART_GRID_PROPS} />
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--rf-text-muted)" }} />
            <YAxis hide />
            <Tooltip
              contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
              labelStyle={CHART_TOOLTIP_LABEL_STYLE}
              formatter={(value: number) => [value, "Workouts"]}
            />
            <Bar dataKey="value" fill={CHART_COLORS[2]} radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </button>
  );
}

function WorkoutTypesCard({ types, onClick }: { types: WorkoutType[]; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card group rounded-3xl p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
      aria-label="View workout types"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-rf-text-muted">Workout Types</p>
        <span className="text-sm font-semibold text-rf-text-muted opacity-60 transition group-hover:opacity-100">›</span>
      </div>
      {types.length === 0 ? (
        <p className="mt-4 text-sm text-rf-text-muted">No workouts logged yet.</p>
      ) : (
        <ul className="mt-4 space-y-2 text-sm">
          {types.map((type) => (
            <li key={type.workout_name} className="flex items-center justify-between">
              <span className="font-semibold text-rf-text">{type.workout_name}</span>
              <span className="text-rf-text-muted">{type.sessions} sessions</span>
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}

