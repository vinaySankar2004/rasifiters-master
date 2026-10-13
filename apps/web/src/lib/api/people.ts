import { apiRequest } from "@/lib/api/client";
import { updateMemberProfile } from "@/lib/api/members";
import { appError } from "@/lib/kit/app-error";

// People (the people SPEC §3 API contract — list, profile, kudos give / undo). JSON snake_case; errors are
// { error, code } and the status decides the kit kind. The server decides what the viewer may see (activity_visible,
// the Hide my activity rule) — the client only renders it.

/**
 * The People go-live rule: People goes live on web together with the iOS + Android store release. Until then (false)
 * every People surface is off — /members/list runs today's roster unchanged, the entry labels stay "View Members", the
 * admin Invite pill stays, no notice, no Hide my activity switch, and /members/person redirects to /members/list.
 * Flip to true in the release-day web commit (this one line).
 */
export const PEOPLE_LIVE: boolean = false;

export type ProgramRole = "admin" | "logger" | "member";
export type PersonRow = {
  member_id: string;
  member_name: string;
  initials: string;
  username: string;
  program_role: ProgramRole;
  is_you: boolean;
  activity_visible: boolean;
  last_active: string | null;
};
export type PeopleList = {
  program_id: string;
  viewer: { member_id: string; is_staff: boolean };
  people: PersonRow[];
};
export type PersonStats = {
  current_streak: number;
  longest_streak: number;
  active_days_this_month: number;
  last_active: string | null;
};
export type RecentWorkout = { workout_type: string; date: string; duration_minutes: number };
export type KudosState = { count: number; given_today: boolean; can_give: boolean };
export type PersonProfile = Omit<PersonRow, "last_active"> & {
  program_id: string;
  joined_at: string | null;
  can_open_full_stats: boolean;
  stats: PersonStats | null;
  recent_workouts: RecentWorkout[] | null;
  kudos: KudosState | null;
};

export const peopleKeys = {
  all: ["people"] as const,
  list: (programId: string) => ["people", "list", programId] as const,
  person: (programId: string, memberId: string) => ["people", "person", programId, memberId] as const
};

export function fetchPeople(token: string, programId: string) {
  return apiRequest<PeopleList>(`/people?${new URLSearchParams({ programId }).toString()}`, { token });
}

export function fetchPersonProfile(token: string, programId: string, memberId: string) {
  return apiRequest<PersonProfile>(
    `/people/${encodeURIComponent(memberId)}?${new URLSearchParams({ programId }).toString()}`,
    { token }
  );
}

/** 201 = new, 200 = already given today — the same body either way. */
export function giveKudos(token: string, memberId: string, programId: string) {
  return apiRequest<{ kudos: { count: number; given_today: boolean } }>(`/people/${encodeURIComponent(memberId)}/kudos`, {
    method: "POST",
    token,
    body: { program_id: programId }
  });
}

/** No `count` (it would leak a hidden member's count): the caller lowers its own count by one when `removed`. */
export function undoKudos(token: string, memberId: string) {
  return apiRequest<{ kudos: { given_today: boolean; removed: boolean } }>(`/people/${encodeURIComponent(memberId)}/kudos`, {
    method: "DELETE",
    token
  });
}

/**
 * Hide my activity: PUT /members/:id { hide_activity } (own profile only, strict boolean). The Hide my activity rule
 * counts a 200 without the `hide_activity` echo (a backend without People) as a failure, never as saved.
 */
export async function saveHideActivity(token: string, memberId: string, hide: boolean): Promise<boolean> {
  const data = await updateMemberProfile(token, memberId, { hide_activity: hide });
  if (typeof data.hide_activity !== "boolean") throw appError("server");
  return data.hide_activity;
}

// "YYYY-MM-DD" is parsed as a LOCAL day: new Date("2026-10-12") is UTC midnight and would read as the previous day
// west of UTC.
function parseDay(day: string): Date | null {
  const [year, month, date] = day.split("-").map(Number);
  return year && month && date ? new Date(year, month - 1, date) : null;
}

/** Days from `day` to today in the browser's calendar (0 = today, 1 = yesterday); null when unparseable. */
function daysAgo(day: string, now: Date): number | null {
  const parsed = parseDay(day);
  if (!parsed) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - parsed.getTime()) / 86_400_000);
}

/** "Oct 12" this year, "Oct 12, 2025" otherwise (the shared People date format; same as the inbox's). */
export function formatDay(day: string, now: Date = new Date()): string {
  const parsed = parseDay(day);
  if (!parsed) return day;
  return parsed.toLocaleDateString(
    undefined,
    parsed.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" }
  );
}

/** A list row's status line for a visible person: Active today · Active yesterday · Last active Oct 12 · No workouts yet. */
export function lastActiveLine(day: string | null, now: Date = new Date()): string {
  if (!day) return PEOPLE_COPY.noWorkouts;
  const ago = daysAgo(day, now);
  if (ago === 0) return PEOPLE_COPY.activeToday;
  if (ago === 1) return PEOPLE_COPY.activeYesterday;
  return PEOPLE_COPY.lastActive(formatDay(day, now));
}

/** The profile's "Last active" stat: Today · Yesterday · Oct 12 · —. */
export function lastActiveValue(day: string | null, now: Date = new Date()): string {
  if (!day) return "—";
  const ago = daysAgo(day, now);
  if (ago === 0) return PEOPLE_COPY.today;
  if (ago === 1) return PEOPLE_COPY.yesterday;
  return formatDay(day, now);
}

// The shared Phase 4 People copy (the iOS / Android tracks carry the same strings; casing per surface idiom).
export const PEOPLE_COPY = {
  title: "People",
  profileTitle: "Profile",
  you: "You",
  searchPlaceholder: "Search people",
  loading: "Loading people…",
  empty: "No one in this program yet.",
  noMatch: "No one matches your search.",
  inviteRow: "Invite member",
  inviteRowSubtitle: "Send an invite by username",
  enrolled: (count: number) => `${count} enrolled`,
  hiddenRow: "Activity hidden",
  noWorkouts: "No workouts yet",
  activeToday: "Active today",
  activeYesterday: "Active yesterday",
  lastActive: (date: string) => `Last active ${date}`,
  profileLoading: "Loading profile…",
  hiddenProfile: "This member keeps their activity private.",
  currentStreak: "Current streak",
  longestStreak: "Longest streak",
  thisMonth: "This month",
  lastActiveLabel: "Last active",
  today: "Today",
  yesterday: "Yesterday",
  recentWorkouts: "Recent workouts",
  noRecentWorkouts: "No workouts logged yet.",
  days: (count: number) => `${count} ${count === 1 ? "day" : "days"}`,
  kudosCount: (count: number) => `${count} kudos`,
  giveKudos: "Give kudos",
  kudosGiven: "Kudos given",
  kudosGivenHint: "You gave kudos today. Tap again to undo.",
  kudosLimit: "You've changed kudos too many times. Try again later.",
  openFullStats: "Open full stats",
  openFullStatsSubtitle: "History, streaks, health",
  editMembership: "Edit membership",
  editMembershipSubtitle: "Joined date, status, remove",
  hideActivityLabel: "Hide my activity",
  hideActivityHint:
    "Hides your workouts, streaks and kudos from other members of your programs. Program admins and loggers still see them.",
  hideActivityLoadFailed: "Couldn't load this setting.",
  noticeTitle: "Who can see your activity",
  noticeBody:
    "Members of your programs can see your workouts, streaks and kudos — including workouts synced from Apple Health or Health Connect. Sleep, diet and steps stay private to you and your program's staff.",
  noticeKeep: "Keep visible",
  noticeHide: "Hide my activity",
  saving: "Saving…"
};

/** Row / profile markers: "Admin" · "Logger"; plain members get no marker. */
export function roleMarker(role: string): string | null {
  if (role === "admin") return "Admin";
  if (role === "logger") return "Logger";
  return null;
}
