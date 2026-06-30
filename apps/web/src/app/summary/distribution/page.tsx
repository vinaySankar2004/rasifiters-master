"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchDistributionByDay } from "@/lib/api/summary";
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

export default function DistributionPage() {
  const { token, programId } = useAuthGuard();

  const distributionQuery = useQuery({
    queryKey: ["summary", "distribution", programId],
    queryFn: () => fetchDistributionByDay(token, programId),
    enabled: !!token && !!programId
  });

  const data = distributionQuery.data
    ? [
        { day: "Sun", value: distributionQuery.data.Sunday },
        { day: "Mon", value: distributionQuery.data.Monday },
        { day: "Tue", value: distributionQuery.data.Tuesday },
        { day: "Wed", value: distributionQuery.data.Wednesday },
        { day: "Thu", value: distributionQuery.data.Thursday },
        { day: "Fri", value: distributionQuery.data.Friday },
        { day: "Sat", value: distributionQuery.data.Saturday }
      ]
    : [];

  // D-C1: all weekday counts are zero → show an empty-state panel instead of seven flat
  // zero-height bars (the backend always returns all 7 keys, so guard on the sum, not data.length).
  const isEmpty = data.length > 0 && data.every((d) => d.value === 0);

  return (
    <PageShell maxWidth="4xl">
        <PageHeader title="Workout Distribution by Day" subtitle="Workouts" backHref="/summary" />

        {distributionQuery.isLoading && (
          <LoadingState message="Loading distribution..." />
        )}

        {distributionQuery.isError && (
          <ErrorState message={(distributionQuery.error as Error).message} />
        )}

        {distributionQuery.data && (
          <GlassCard padding="lg">
            {isEmpty ? (
              <div className="rounded-2xl bg-rf-surface-muted px-4 py-10 text-center text-sm text-rf-text-muted">
                No workouts logged yet.
              </div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data}>
                    <CartesianGrid {...CHART_GRID_PROPS} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--rf-text-muted)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--rf-text-muted)" }} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                      formatter={(value: number) => [value, "Workouts"]}
                    />
                    <Bar dataKey="value" fill={CHART_COLORS[2]} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </GlassCard>
        )}
    </PageShell>
  );
}
