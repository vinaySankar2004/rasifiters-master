"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { fetchMemberHistory } from "@/lib/api/members";
import { useClientSearchParams } from "@/lib/use-client-search-params";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { PeriodSelector, type PeriodKey } from "@/components/ui/PeriodSelector";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  CHART_COLORS,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_GRID_PROPS,
  CHART_AXIS_TICK
} from "@/lib/chart-theme";

export default function MemberHistoryPage() {
  const router = useRouter();
  const params = useClientSearchParams();
  const memberId = params.get("memberId") ?? "";
  const memberName = params.get("name") ?? "Member";
  const { session, program, token, programId } = useAuthGuard();
  const isGlobalAdmin = session?.user.globalRole === "global_admin";
  const canViewAny = isGlobalAdmin || program?.my_role === "admin" || program?.my_role === "logger";
  const loggedInUserId = session?.user.id;
  const [period, setPeriod] = useState<PeriodKey>("week");

  useEffect(() => {
    if (!memberId) return;
    if (!canViewAny && memberId !== loggedInUserId) {
      router.push("/members");
    }
  }, [memberId, canViewAny, loggedInUserId, router]);

  const historyQuery = useQuery({
    queryKey: ["members", "history", programId, memberId, period],
    queryFn: () => fetchMemberHistory(token, programId, memberId, period),
    enabled: !!token && !!programId && !!memberId
  });

  const hasWorkouts = (historyQuery.data?.buckets ?? []).some((b) => b.workouts > 0);

  return (
    <PageShell maxWidth="4xl">
      <PageHeader title="Workout History" subtitle={memberName} backHref="/members" />

      <PeriodSelector value={period} onChange={setPeriod} />

      {historyQuery.isLoading && <LoadingState message="Loading timeline..." />}

      {historyQuery.isError && <ErrorState message={(historyQuery.error as Error).message} />}

      {historyQuery.data && (
        <GlassCard padding="lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-rf-text-muted">Range</p>
              <p className="text-lg font-semibold text-rf-text">{historyQuery.data.label}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-rf-text-muted">Daily avg</p>
              <p className="text-base font-semibold text-rf-text">
                {historyQuery.data.daily_average.toFixed(1)}
              </p>
            </div>
          </div>
          {hasWorkouts ? (
            <div className="mt-6 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={historyQuery.data.buckets}>
                  <CartesianGrid {...CHART_GRID_PROPS} />
                  <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
                  <YAxis tick={CHART_AXIS_TICK} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    formatter={(value: number) => [value, "Workouts"]}
                  />
                  <Bar dataKey="workouts" fill={CHART_COLORS[0]} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-6 text-center text-sm text-rf-text-muted">
              No workouts logged in this range.
            </p>
          )}
        </GlassCard>
      )}
    </PageShell>
  );
}
