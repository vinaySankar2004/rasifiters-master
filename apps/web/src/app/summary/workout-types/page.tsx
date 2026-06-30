"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchWorkoutTypes } from "@/lib/api/summary";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  CHART_COLORS,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_GRID_PROPS
} from "@/lib/chart-theme";

export default function WorkoutTypesPage() {
  const { token, programId } = useAuthGuard();

  const typesQuery = useQuery({
    queryKey: ["summary", "workoutTypes", programId],
    queryFn: () => fetchWorkoutTypes(token, programId, 100),
    enabled: !!token && !!programId
  });

  const data = typesQuery.data ?? [];

  return (
    <PageShell maxWidth="4xl">
        <PageHeader title="Workout Types" subtitle="Program to date" backHref="/summary" />

        {typesQuery.isLoading && (
          <LoadingState message="Loading workout types..." />
        )}

        {typesQuery.isError && (
          <ErrorState message={(typesQuery.error as Error).message} />
        )}

        {typesQuery.data && (
          <GlassCard padding="lg">
            {data.length === 0 ? (
              // D-C1: styled empty-state panel matching the `distribution` sibling so all three
              // /summary chart drill-downs share one empty-state look (legacy used a plain <p>).
              <div className="rounded-2xl bg-rf-surface-muted px-4 py-10 text-center text-sm text-rf-text-muted">
                No workouts logged yet.
              </div>
            ) : (
              <>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data}>
                      <CartesianGrid {...CHART_GRID_PROPS} />
                      <XAxis dataKey="workout_name" tick={false} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--rf-text-muted)" }} />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                        labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                        formatter={(value: number) => [value, "Sessions"]}
                      />
                      <Bar dataKey="sessions" fill={CHART_COLORS[0]} radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <ul className="mt-6 space-y-2 text-sm">
                  {data.map((type) => (
                    <li key={type.workout_name} className="flex items-center justify-between">
                      <span className="font-semibold text-rf-text">{type.workout_name}</span>
                      <span className="text-rf-text-muted">
                        {type.sessions} sessions · avg {type.avg_duration_minutes} min
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </GlassCard>
        )}
    </PageShell>
  );
}
