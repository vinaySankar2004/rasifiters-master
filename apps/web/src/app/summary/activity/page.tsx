"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchActivityTimeline } from "@/lib/api/summary";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PeriodSelector, type PeriodKey } from "@/components/ui/PeriodSelector";
import {
  CHART_COLORS,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_GRID_PROPS
} from "@/lib/chart-theme";

export default function ActivityTimelinePage() {
  const { token, programId } = useAuthGuard();
  const [period, setPeriod] = useState<PeriodKey>("week");

  const timelineQuery = useQuery({
    queryKey: ["summary", "timeline", programId, period],
    queryFn: () => fetchActivityTimeline(token, period, programId),
    enabled: !!token && !!programId
  });

  const buckets = timelineQuery.data?.buckets ?? [];

  return (
    <PageShell maxWidth="4xl">
        <PageHeader title="Workout Activity Timeline" subtitle="Workouts · Active members" backHref="/summary" />

        <PeriodSelector value={period} onChange={setPeriod} />

        {timelineQuery.isLoading && (
          <LoadingState message="Loading timeline..." />
        )}

        {timelineQuery.isError && (
          <ErrorState message={(timelineQuery.error as Error).message} />
        )}

        {timelineQuery.data && (
          <GlassCard padding="lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-rf-text-muted">Range</p>
                <p className="text-lg font-semibold text-rf-text">{timelineQuery.data.label}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-rf-text-muted">Daily avg</p>
                <p className="text-base font-semibold text-rf-text">
                  {timelineQuery.data.daily_average.toFixed(1)}
                </p>
              </div>
            </div>

            <div className="mt-6 h-72">
              {buckets.length === 0 ? (
                <div className="rounded-2xl bg-rf-surface-muted px-4 py-10 text-center text-sm text-rf-text-muted">
                  No data for this range yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={buckets}>
                    <CartesianGrid {...CHART_GRID_PROPS} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--rf-text-muted)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--rf-text-muted)" }} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                      formatter={(value: number, name: string) => [value, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: "var(--rf-text-muted)" }} />
                    <Bar name="Workouts" dataKey="workouts" fill={CHART_COLORS[0]} radius={[8, 8, 0, 0]} />
                    <Bar name="Active members" dataKey="active_members" fill={CHART_COLORS[1]} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </GlassCard>
        )}
    </PageShell>
  );
}
