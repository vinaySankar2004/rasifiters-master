"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchHealthTimeline } from "@/lib/api/lifestyle";
import { useClientSearchParams } from "@/lib/use-client-search-params";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { PeriodSelector, type PeriodKey } from "@/components/ui/PeriodSelector";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_AXIS_TICK,
  CHART_GRID_PROPS
} from "@/lib/chart-theme";

const AXIS_LABEL_STYLE = { fontSize: 11, fill: "var(--rf-text-muted)" } as const;

const STEPS_ACCENT = "#14b8a6";

export default function StepsTimelinePage() {
  const params = useClientSearchParams();
  const memberIdParam = params.get("memberId");
  const { session, program, token, programId } = useAuthGuard();

  const isGlobalAdmin = session?.user.globalRole === "global_admin";
  const isProgramAdmin = program?.my_role === "admin" || isGlobalAdmin;
  const canViewAs = isProgramAdmin;

  const [period, setPeriod] = useState<PeriodKey>("week");

  const resolvedMemberId = useMemo(() => {
    if (memberIdParam) return memberIdParam;
    if (canViewAs) return undefined;
    return session?.user.id;
  }, [memberIdParam, canViewAs, session?.user.id]);

  const timelineQuery = useQuery({
    queryKey: ["lifestyle", "steps-timeline", programId, resolvedMemberId ?? "program", period],
    queryFn: () => fetchHealthTimeline(token, period, programId, resolvedMemberId),
    enabled: !!token && !!programId && (!!resolvedMemberId || canViewAs)
  });

  const points = timelineQuery.data?.buckets ?? [];
  const stepsMax = Math.max(1, ...points.map((point) => point.steps));

  return (
    <PageShell maxWidth="4xl">
        <PageHeader
          title="Steps Timeline"
          subtitle="Daily steps"
          backHref="/lifestyle"
        />

        <PeriodSelector value={period} onChange={setPeriod} />

        {timelineQuery.isLoading && <LoadingState message="Loading timeline..." />}

        {timelineQuery.isError && (
          <ErrorState message={(timelineQuery.error as Error).message} />
        )}

        {timelineQuery.data && (
          <GlassCard padding="lg">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-rf-text-muted">Range</p>
                <p className="text-lg font-semibold text-rf-text">{timelineQuery.data.label}</p>
              </div>
              <div className="flex items-center gap-6 text-right">
                <div>
                  <p className="text-xs text-rf-text-muted">Daily avg steps</p>
                  <p className="text-base font-semibold text-rf-text">
                    {timelineQuery.data.daily_average_steps.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 h-72">
              {points.length === 0 ? (
                <div className="rounded-2xl bg-rf-surface-muted px-4 py-10 text-center text-sm text-rf-text-muted">
                  No data for this range yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid {...CHART_GRID_PROPS} />
                    <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
                    <YAxis
                      domain={[0, stepsMax * 1.1]}
                      tick={CHART_AXIS_TICK}
                      label={{ value: "steps", angle: -90, position: "insideLeft", style: AXIS_LABEL_STYLE }}
                    />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                      formatter={(value: number) => [value.toLocaleString(), "Steps"]}
                    />
                    <Bar name="Steps" dataKey="steps" fill={STEPS_ACCENT} radius={[8, 8, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </GlassCard>
        )}
    </PageShell>
  );
}
