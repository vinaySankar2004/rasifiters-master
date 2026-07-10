// Generated in-theme phone screens used inside PhoneFrame for the feature rows and
// the cross-platform section. Markup, not screenshots; sharp and theme-aware.

import { IconFlame } from "./icons";

const card = "rounded-2xl border border-rf-border bg-rf-surface";

// Program status colours mirror the app's StatusBadge: active = accent (orange),
// completed = success (green), planned = info (blue).
type ProgramStatus = "active" | "completed" | "planned";
const PROGRAM_STATUS: Record<ProgramStatus, { label: string; pill: string; bar: string }> = {
  active: { label: "Active", pill: "bg-rf-accent/15 text-rf-accent", bar: "var(--rf-accent)" },
  completed: { label: "Completed", pill: "bg-rf-success/15 text-rf-success", bar: "var(--rf-success)" },
  planned: { label: "Planned", pill: "bg-rf-info/15 text-rf-info", bar: "var(--rf-info)" }
};

function ProgramCard({ name, dates, members, pct, status }: { name: string; dates: string; members: string; pct: number; status: ProgramStatus }) {
  const s = PROGRAM_STATUS[status];
  return (
    <div className={`${card} p-3.5`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight text-rf-text">{name}</p>
        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${s.pill}`}>{s.label}</span>
      </div>
      <p className="mt-1 text-[11px] text-rf-text-muted">{dates}</p>
      <p className="mt-2 text-[11px] text-rf-text-muted">{members}</p>
      <div className="progress-track mt-2 h-1.5 w-full overflow-hidden rounded-full">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: s.bar }} />
      </div>
    </div>
  );
}

export function ProgramsScreen() {
  return (
    <div className="space-y-3 p-4">
      <div>
        <p className="text-lg font-bold text-rf-text">My Programs</p>
        <p className="text-[11px] text-rf-text-muted">Manage your fitness programs</p>
      </div>
      <ProgramCard status="active" name="Construction · Phase 2" dates="Jun 8 – Sep 16, 2026" members="22 active / 22 members" pct={31} />
      <ProgramCard status="completed" name="Foundation · Phase 1" dates="Feb 28 – Jun 8, 2026" members="30 active / 30 members" pct={100} />
      <ProgramCard status="planned" name="Peak · Phase 3" dates="Sep 17 – Dec 25, 2026" members="22 members" pct={0} />
    </div>
  );
}

export function LogScreen() {
  return (
    <div className="space-y-3 p-4">
      <p className="text-lg font-bold text-rf-text">Log</p>
      <div
        className="rounded-2xl p-4 text-black"
        style={{ background: "linear-gradient(135deg, #ffb347, #ff7a00)" }}
      >
        <p className="text-base font-semibold">Add workouts</p>
        <p className="mt-1 text-[12px] opacity-80">Log one or many sessions at once.</p>
        <span className="mt-3 inline-flex rounded-full bg-black/15 px-3 py-1 text-xs font-semibold">Log sessions</span>
      </div>
      <div
        className="rounded-2xl p-4 text-white"
        style={{ background: "linear-gradient(135deg, #38bdf8, #2563eb)" }}
      >
        <p className="text-base font-semibold">Log daily health</p>
        <p className="mt-1 text-[12px] opacity-90">Sleep, diet quality and steps for the day.</p>
        <span className="mt-3 inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">Log day</span>
      </div>
    </div>
  );
}

function SyncRow({ name, detail, on }: { name: string; detail: string; on: boolean }) {
  return (
    <div className={`${card} flex items-center justify-between p-3.5`}>
      <div>
        <p className="text-sm font-semibold text-rf-text">{name}</p>
        <p className="text-[11px] text-rf-text-muted">{detail}</p>
      </div>
      <span
        className="flex h-6 w-10 items-center rounded-full p-0.5"
        style={{ background: on ? "var(--rf-success)" : "var(--rf-border)", justifyContent: on ? "flex-end" : "flex-start" }}
      >
        <span className="h-5 w-5 rounded-full bg-white shadow" />
      </span>
    </div>
  );
}

export function SyncScreen() {
  return (
    <div className="space-y-3 p-4">
      <p className="text-lg font-bold text-rf-text">Connected</p>
      <SyncRow name="Apple Health" detail="Workouts · sleep · steps" on />
      <SyncRow name="Health Connect" detail="Android · auto-log" on />
      <div className={`${card} p-3.5`}>
        <p className="text-xs font-semibold text-rf-text">New notification</p>
        <p className="mt-1 text-[11px] text-rf-text-muted">You were added to “Construction · Phase 2”.</p>
      </div>
    </div>
  );
}

const RINGS = [
  { r: 58, color: "#60a5fa", track: "rgba(96,165,250,0.16)", pct: 82 },
  { r: 43, color: "#34d399", track: "rgba(52,211,153,0.16)", pct: 66 },
  { r: 28, color: "#ff8b1f", track: "rgba(255,139,31,0.16)", pct: 90 }
];

const RING_LEGEND = [
  ["Sleep", "7h 20m", "#60a5fa"],
  ["Steps", "8,240", "#34d399"],
  ["Diet", "8 / 10", "#ff8b1f"]
] as const;

export function HealthRingsScreen() {
  return (
    <div className="space-y-3 p-4">
      <div>
        <p className="text-lg font-bold text-rf-text">Today</p>
        <p className="text-[11px] text-rf-text-muted">Synced from Apple Health</p>
      </div>
      <div className={`${card} flex flex-col items-center p-4`}>
        <div className="relative h-[150px] w-[150px] shrink-0">
          <svg viewBox="0 0 150 150" className="h-full w-full -rotate-90">
            {RINGS.map((ring) => {
              const c = 2 * Math.PI * ring.r;
              return (
                <g key={ring.r}>
                  <circle cx="75" cy="75" r={ring.r} fill="none" stroke={ring.track} strokeWidth="11" />
                  <circle cx="75" cy="75" r={ring.r} fill="none" stroke={ring.color} strokeWidth="11" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - ring.pct / 100)} />
                </g>
              );
            })}
          </svg>
        </div>
        <div className="mt-3 grid w-full grid-cols-3 gap-1 text-center">
          {RING_LEGEND.map(([label, val, color]) => (
            <div key={label}>
              <span className="mx-auto mb-1 block h-2 w-2 rounded-full" style={{ background: color }} />
              <p className="text-sm font-bold text-rf-text">{val}</p>
              <p className="text-[10px] text-rf-text-muted">{label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className={`${card} p-3`}>
          <p className="text-[11px] text-rf-text-muted">Workouts</p>
          <p className="mt-1 text-lg font-bold text-rf-text">4</p>
          <p className="text-[11px] text-rf-text-muted">this week</p>
        </div>
        <div className={`${card} p-3`}>
          <p className="text-[11px] text-rf-text-muted">Active days</p>
          <p className="mt-1 text-lg font-bold text-rf-text">5 / 7</p>
          <p className="text-[11px] text-rf-text-muted">this week</p>
        </div>
      </div>
    </div>
  );
}

const BOARD = [
  ["1", "Ava M.", "18"],
  ["2", "Liam K.", "15"],
  ["3", "You", "12"],
  ["4", "Noah R.", "11"]
] as const;

export function StreakScreen() {
  return (
    <div className="space-y-3 p-4">
      <div>
        <p className="text-lg font-bold text-rf-text">Members</p>
        <p className="text-[11px] text-rf-text-muted">Construction · Phase 2</p>
      </div>
      <div className={`${card} flex items-center gap-3 p-4`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(255,139,31,0.15)", color: "var(--rf-accent)" }}>
          <IconFlame className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm text-rf-text-muted">Current streak</p>
          <p className="text-xl font-bold text-rf-text">14 days</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className={`${card} p-3`}>
          <p className="text-[11px] text-rf-text-muted">Longest streak</p>
          <p className="mt-1 text-lg font-bold text-rf-text">28d</p>
        </div>
        <div className={`${card} p-3`}>
          <p className="text-[11px] text-rf-text-muted">Board rank</p>
          <p className="mt-1 text-lg font-bold text-rf-text">#3</p>
        </div>
      </div>
      <div className={`${card} p-4`}>
        <p className="mb-3 text-xs font-semibold text-rf-text">Leaderboard · this month</p>
        <ul className="space-y-2.5">
          {BOARD.map(([rank, name, val]) => (
            <li key={rank} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rf-surface-muted text-[11px] font-semibold text-rf-text-muted">{rank}</span>
                <span className={name === "You" ? "font-semibold text-rf-accent" : "text-rf-text"}>{name}</span>
              </span>
              <span className="text-rf-text-muted">{val} workouts</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
