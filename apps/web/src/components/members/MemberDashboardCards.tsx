"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MemberHealthItem, MemberHistoryPoint, MemberMetrics, MemberRecentItem } from "@/lib/api/members";
import type { AsyncState } from "@/lib/kit/async-state";
import { dietLabel, formatDuration, formatShortDate, initials, sleepLabel, stepsLabel } from "@/lib/format";
import { ptdDays, ptdPercent } from "@/lib/program-days";
import { GlassCard } from "@/components/ui/GlassCard";
import {
  CHART_AXIS_TICK,
  CHART_COLORS,
  CHART_GRID_PROPS,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_LABEL_STYLE
} from "@/lib/chart-theme";

// The Members-tab dashboard cards (moved from app/members/page.tsx). The Members-tab card-state rule (frontend-kit
// recipe): each card takes the kit status of its own read — "loading" → "Loading..." / "…", "failed" → "—" (the page
// shows the ErrorView or the "Couldn't refresh" banner), "ready" → the data; an empty list reads "No … yet" ONLY when
// the read succeeded. Never a fake 0.
export type CardStatus = "loading" | "failed" | "ready";

export function toCardStatus(state: AsyncState<unknown>): CardStatus {
  if (state.status === "failed") return "failed";
  if (state.status === "loaded" || state.status === "stale") return "ready";
  return "loading";
}

const valueOr = (status: CardStatus, value: string) => (status === "ready" ? value : status === "loading" ? "…" : "—");
const lineFor = (status: CardStatus, empty: string) =>
  status === "loading" ? "Loading..." : status === "failed" ? "—" : empty;

// The tappable card chrome shared by the four drill-down cards (identical classes to the originals).
function LinkCard({
  label,
  title,
  aside,
  compactTop = false,
  onClick,
  children
}: {
  label: string;
  title: string;
  aside?: React.ReactNode;
  compactTop?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`glass-card group rounded-3xl ${compactTop ? "px-5 pb-5 pt-3" : "p-5"} text-left transition hover:-translate-y-0.5 hover:shadow-lg`}
    >
      <div className={`flex ${compactTop ? "items-start" : "items-center"} justify-between`}>
        <div>
          <p className="text-sm font-semibold text-rf-text-muted">{label}</p>
          <p className="text-lg font-semibold text-rf-text">{title}</p>
        </div>
        {aside ?? <span className="text-sm font-semibold text-rf-text-muted">›</span>}
      </div>
      {children}
    </button>
  );
}

export function MemberOverviewCard({
  metric,
  status,
  programStart,
  programEnd
}: {
  metric?: MemberMetrics;
  status: CardStatus;
  programStart?: string | null;
  programEnd?: string | null;
}) {
  // D2 + B1 (Members page SPEC): PTD = active days ÷ the program's days so far — start → min(end, today) inclusive, in
  // the device's local calendar day (log dates are local days) — clamped 0–100; identical on iOS + Android. 0 when a
  // date is missing.
  const totalDays = useMemo(() => ptdDays(programStart, programEnd), [programStart, programEnd]);
  const progressPct = metric ? ptdPercent(metric.active_days, totalDays) : 0;

  return (
    <GlassCard>
      <p className="text-sm font-semibold text-rf-text-muted">Member Overview</p>
      {metric ? (
        <>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="metric-pill flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-rf-text">
                {initials(metric.member_name)}
              </div>
              <div>
                <p className="text-base font-semibold text-rf-text">{metric.member_name}</p>
                <p className="text-xs text-rf-text-muted">MTD Workouts: {metric.mtd_workouts ?? 0}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-rf-accent">{progressPct}%</p>
              <p className="text-xs text-rf-text-muted">PTD MP %</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="metric-pill rounded-2xl px-3 py-2">
              <p className="text-xs text-rf-text-muted">Total Time</p>
              <p className="text-sm font-semibold text-rf-text">
                {metric.total_hours ?? Math.round(metric.total_duration / 60)} hrs
              </p>
            </div>
            <div className="metric-pill rounded-2xl px-3 py-2">
              <p className="text-xs text-rf-text-muted">Favorite</p>
              <p className="text-sm font-semibold text-rf-text">{metric.favorite_workout ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold text-rf-text-muted">PTD - Member Progress</p>
            <div className="progress-track mt-2 h-2 w-full overflow-hidden rounded-full">
              <div className="h-full rounded-full bg-rf-accent" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="mt-2 text-xs text-rf-text-muted">
              {metric.active_days} / {totalDays} days
            </p>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-rf-text-muted">{lineFor(status, "No workouts logged yet.")}</p>
      )}
    </GlassCard>
  );
}

export function MemberHistoryCard({
  points,
  label,
  dailyAverage,
  status,
  onClick
}: {
  points: MemberHistoryPoint[];
  label: string;
  dailyAverage: number;
  status: CardStatus;
  onClick: () => void;
}) {
  return (
    <LinkCard
      label="Workout Activity"
      title={label || "Last 7 days"}
      onClick={onClick}
      aside={
        <div className="text-right">
          <p className="text-xs text-rf-text-muted">Daily avg</p>
          <p className="text-base font-semibold text-rf-text">{valueOr(status, dailyAverage.toFixed(1))}</p>
        </div>
      }
    >
      <div className="mt-4 h-36">
        {status === "ready" ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points}>
              <CartesianGrid {...CHART_GRID_PROPS} />
              <XAxis dataKey="label" tick={CHART_AXIS_TICK} />
              <YAxis hide />
              <Tooltip
                contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                formatter={(value: number) => [value, "Workouts"]}
              />
              <Bar dataKey="workouts" fill={CHART_COLORS[0]} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-rf-text-muted">{lineFor(status, "")}</div>
        )}
      </div>
    </LinkCard>
  );
}

export function MemberStreakCard({
  current,
  longest,
  status,
  onClick
}: {
  current: number;
  longest: number;
  status: CardStatus;
  onClick: () => void;
}) {
  return (
    <LinkCard label="Streak Stats" title="Current and longest" compactTop onClick={onClick}>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="metric-pill rounded-2xl px-3 py-3">
          <p className="text-xs text-rf-text-muted">Current</p>
          <p className="text-base font-semibold text-rf-text">{valueOr(status, `${current} days`)}</p>
        </div>
        <div className="metric-pill rounded-2xl px-3 py-3">
          <p className="text-xs text-rf-text-muted">Longest</p>
          <p className="text-base font-semibold text-rf-text">{valueOr(status, `${longest} days`)}</p>
        </div>
      </div>
    </LinkCard>
  );
}

export function MemberRecentCard({
  items,
  status,
  onClick
}: {
  items: MemberRecentItem[];
  status: CardStatus;
  onClick: () => void;
}) {
  return (
    <LinkCard label="View Workouts" title="All workouts" onClick={onClick}>
      <div className="mt-4 space-y-2 text-sm">
        {(status !== "ready" || items.length === 0) && (
          <p className="text-sm text-rf-text-muted">{lineFor(status, "No workouts logged yet.")}</p>
        )}
        {status === "ready" &&
          items.slice(0, 3).map((item) => (
            <div key={item.id} className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-rf-text">{item.workoutType}</p>
                <p className="text-xs text-rf-text-muted">{formatShortDate(item.workoutDate) ?? item.workoutDate}</p>
              </div>
              <p className="font-semibold text-rf-text">{formatDuration(item.durationMinutes)}</p>
            </div>
          ))}
      </div>
    </LinkCard>
  );
}

export function MemberHealthCard({
  items,
  status,
  onClick
}: {
  items: MemberHealthItem[];
  status: CardStatus;
  onClick: () => void;
}) {
  return (
    <LinkCard label="View Health" title="Daily health logs" onClick={onClick}>
      <div className="mt-4 space-y-2 text-sm">
        {(status !== "ready" || items.length === 0) && (
          <p className="text-sm text-rf-text-muted">{lineFor(status, "No daily health logs yet.")}</p>
        )}
        {status === "ready" &&
          items.slice(0, 3).map((item) => (
            <div key={item.id}>
              <p className="font-semibold text-rf-text">{item.logDate}</p>
              <p className="text-xs text-rf-text-muted">
                Sleep {sleepLabel(item.sleepHours)} · Diet {dietLabel(item.foodQuality)} · Steps {stepsLabel(item.steps)}
              </p>
            </div>
          ))}
      </div>
    </LinkCard>
  );
}
