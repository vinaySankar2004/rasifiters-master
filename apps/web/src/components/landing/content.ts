// Marketing copy + constants for the public landing page (`/`).
// Single source of truth so the section components stay presentational.

export const APP_STORE_URL =
  "https://apps.apple.com/ca/app/rasi-fiters/id6758078961";
export const SUPPORT_EMAIL = "vinay.sankara@gmail.com";
export const PRIVACY_PATH = "/privacy-policy";
export const SUPPORT_PATH = "/support";

export const HERO = {
  eyebrow: "For your whole group",
  title: "Fitness programs, tracked together.",
  subtitle:
    "Join a program, log workouts and daily health, and see how your whole group is progressing.",
  trust: "Free to use · No ads · Your data stays yours"
} as const;

// Three alternating feature rows (each paired with a generated in-theme app panel).
export type FeatureRow = {
  key: "programs" | "logging" | "sync";
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
};

export const FEATURE_ROWS: FeatureRow[] = [
  {
    key: "programs",
    eyebrow: "Programs & roles",
    title: "Built around your program.",
    body:
      "Create fitness programs your group joins. Per-program roles (admin, logger and member) decide who can log sessions and who manages the program.",
    bullets: ["Unlimited members per program", "Admin / logger / member roles", "Invite links & join requests"]
  },
  {
    key: "logging",
    eyebrow: "Workouts & health",
    title: "Log workouts and daily health.",
    body:
      "Add a single session or many at once. Track sleep, steps and diet quality each day so everyone's progress stays up to date.",
    bullets: ["Bulk-log multiple sessions", "Sleep, steps & diet quality", "Any workout type, any duration"]
  },
  {
    key: "sync",
    eyebrow: "Automatic",
    title: "Syncs with Apple Health & Health Connect.",
    body:
      "Connect Apple Health on iOS or Health Connect on Android and workouts, sleep and steps log themselves. Push notifications when members join, roles change, or the program updates.",
    bullets: ["Auto-log from Apple Health", "Health Connect on Android", "Push & in-app notifications"]
  }
];

// Secondary capabilities grid.
export type GridItem = { icon: string; title: string; body: string };

export const GRID_ITEMS: GridItem[] = [
  { icon: "trophy", title: "Leaderboards", body: "See who's leading the board across your program each month." },
  { icon: "flame", title: "Streaks & milestones", body: "Daily streaks and milestone badges for every member." },
  { icon: "users", title: "Participation", body: "Month-to-date participation for the whole group." },
  { icon: "layers", title: "Workout-type mix", body: "Break activity down by type and total time invested." },
  { icon: "ticket", title: "Invites", body: "Invite members and handle join requests in a couple of taps." },
  { icon: "timeline", title: "Activity timeline", body: "A running timeline of every session the group logs." }
];

export const ANALYTICS = {
  eyebrow: "Analytics",
  title: "See how your program is actually doing.",
  body:
    "Program progress, participation, total workouts and duration, distribution by day, and a breakdown by workout type. Every number updates the moment someone logs.",
  stat: { value: "68.2%", label: "month-to-date participation" }
} as const;

export const CROSS_PLATFORM = {
  eyebrow: "Everywhere you train",
  title: "Native on iPhone and Android.",
  body:
    "The same program in your pocket. Get RaSi Fiters on iOS and Android, or use the full web app in any browser."
} as const;

export const FINAL_CTA = {
  title: "Start tracking today.",
  body: "Get RaSi Fiters on your phone, or open the web app in any browser."
} as const;
