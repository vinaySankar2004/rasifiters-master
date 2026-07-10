// Generated, in-theme recreations of the real RaSi Fiters dashboard; built from the
// live app as reference and rendered as markup (not screenshots) so they are sharp,
// responsive and adapt to light/dark automatically. Numbers mirror a real program.

const card = "rounded-2xl border border-rf-border bg-rf-surface";

function RadialProgress({ percent = 31 }: { percent?: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - percent / 100);
  return (
    <div className="relative h-[132px] w-[132px] shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--rf-border)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--rf-accent)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-rf-text">{percent}%</span>
        <span className="text-[11px] text-rf-text-muted">{percent}/100 days</span>
      </div>
    </div>
  );
}

// Two-tone activity bars, echoing the Activity Timeline chart.
const ACTIVITY = [
  ["a", 34], ["b", 16], ["a", 20], ["b", 40], ["a", 58],
  ["b", 46], ["a", 74], ["b", 62], ["a", 30], ["b", 8]
] as const;

function ActivityBars() {
  return (
    <div className="flex h-[90px] items-end gap-[6px]">
      {ACTIVITY.map(([tone, h], i) => (
        <span
          key={i}
          className="w-full rounded-full"
          style={{
            height: `${h}%`,
            background: tone === "a" ? "var(--rf-chart-1)" : "var(--rf-chart-2)"
          }}
        />
      ))}
    </div>
  );
}

// Distribution bars (single amber tone), by day of week.
const DIST = [40, 62, 78, 84, 70, 20, 6];
function DistributionBars() {
  return (
    <div className="flex h-[80px] items-end gap-2">
      {DIST.map((h, i) => (
        <span key={i} className="w-full rounded-full" style={{ height: `${h}%`, background: "var(--rf-chart-3)" }} />
      ))}
    </div>
  );
}

function StatTile({
  label,
  value,
  delta,
  positive
}: {
  label: string;
  value: string;
  delta: string;
  positive?: boolean;
}) {
  return (
    <div className={`${card} p-3`}>
      <p className="text-[11px] text-rf-text-muted">{label}</p>
      <p className="mt-1 text-lg font-bold text-rf-text">{value}</p>
      <p className={`text-[11px] font-semibold ${positive ? "text-rf-success" : "text-rf-danger"}`}>{delta}</p>
    </div>
  );
}

const TYPES = [
  ["Walking", "6d 21h", "var(--rf-chart-4)"],
  ["Yoga Flow", "23h 52m", "var(--rf-chart-1)"],
  ["HIIT Intervals", "14h 46m", "var(--rf-chart-2)"],
  ["Strength", "7h 53m", "var(--rf-chart-4)"],
  ["Pranayama", "7h 01m", "var(--rf-chart-5)"]
] as const;

function WorkoutTypes() {
  return (
    <ul className="space-y-2.5">
      {TYPES.map(([name, dur, color]) => (
        <li key={name} className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-rf-text">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {name}
          </span>
          <span className="text-rf-text-muted">{dur}</span>
        </li>
      ))}
    </ul>
  );
}

// Full dashboard for the browser frame (analytics highlight).
export function DashboardPreview() {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2">
      <div className={`${card} flex flex-col items-center justify-center p-4`}>
        <p className="mb-2 self-start text-sm font-semibold text-rf-text">Program Progress</p>
        <RadialProgress percent={31} />
        <div className="mt-3 flex gap-6 text-center text-xs text-rf-text-muted">
          <span>Elapsed<br /><b className="text-rf-text">31 days</b></span>
          <span>Remaining<br /><b className="text-rf-text">69 days</b></span>
        </div>
      </div>

      <div className={`${card} p-4`}>
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-rf-text">Activity · Last 7 days</p>
          <span className="text-xs text-rf-text-muted">avg <b className="text-rf-text">7.4</b></span>
        </div>
        <div className="mt-4"><ActivityBars /></div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
        <StatTile label="Participation" value="68.2%" delta="15 / 22 members" />
        <StatTile label="Total Workouts" value="72" delta="month to date" />
        <StatTile label="Total Duration" value="48.7 hrs" delta="month to date" />
        <StatTile label="Avg Duration" value="41 min" delta="+2.5%" positive />
      </div>

      <div className={`${card} p-4`}>
        <p className="text-sm font-semibold text-rf-text">Distribution · by day</p>
        <div className="mt-4"><DistributionBars /></div>
      </div>

      <div className={`${card} p-4`}>
        <p className="mb-3 text-sm font-semibold text-rf-text">Workout Types</p>
        <WorkoutTypes />
      </div>
    </div>
  );
}

// Condensed dashboard for the hero phone frame.
export function HeroDashboard() {
  return (
    <div className="space-y-3 p-4">
      <div>
        <p className="text-lg font-bold text-rf-text">Summary</p>
        <p className="text-[11px] text-rf-text-muted">Construction · Phase 2</p>
      </div>
      <div className={`${card} flex flex-col items-center p-4`}>
        <RadialProgress percent={31} />
        <p className="mt-2 text-[11px] font-semibold text-rf-accent">ACTIVE</p>
        <div className="mt-2 flex gap-8 text-center text-[11px] text-rf-text-muted">
          <span>Elapsed<br /><b className="text-rf-text">31 days</b></span>
          <span>Remaining<br /><b className="text-rf-text">69 days</b></span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile label="Participation" value="68.2%" delta="15 / 22" />
        <StatTile label="Workouts" value="72" delta="+ this month" positive />
      </div>
      <div className={`${card} p-4`}>
        <p className="mb-3 text-xs font-semibold text-rf-text">Workout Types</p>
        <WorkoutTypes />
      </div>
    </div>
  );
}
