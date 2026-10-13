import { apiRequest } from "@/lib/api/client";
import { toAppError } from "@/lib/kit/app-error";

// The announcement composer API (the notifications contract's /announcements routes, D-N16) — global admins only.
// Errors are { error, code }; the status decides the kit kind (a 400 shows the server's own text), except a 429, which
// reads the composer's own limit copy (the rate-limit rule). Also the member directory for "chosen members"
// (GET /members — the full directory for global admins, members D-C3; standard members only).

export type TargetKind = "program" | "members" | "everyone";
export type MergeField = "first_name" | "streak" | "program_name";
export type DeliveryMode = "now" | "local";
export type AnnouncementTarget =
  | { kind: "program"; program_id: string }
  | { kind: "members"; member_ids: string[] }
  | { kind: "everyone" };
export type AnnouncementDelivery = { mode: "now" } | { mode: "local"; date: string; time: string };
export type AnnouncementRequest = {
  target: AnnouncementTarget;
  title: string;
  body: string;
  delivery: AnnouncementDelivery;
};
export type AnnouncementPreview = {
  recipient_count: number;
  sample: { member_id: string; first_name: string; title: string; body: string } | null;
};
export type AnnouncementStatus = "scheduled" | "sending" | "sent" | "cancelled";
export type AnnouncementSummary = {
  id: string;
  created_at: string;
  sender_member_id: string | null;
  sender_name: string | null;
  target_kind: TargetKind;
  target_program_id: string | null;
  target_program_name: string | null;
  title: string;
  body: string;
  mode: DeliveryMode;
  send_date: string | null;
  send_time: string | null;
  status: AnnouncementStatus;
  recipient_count: number;
  sent_count: number;
  completed_at: string | null;
};
export type DirectoryMember = { id: string; member_name: string; username?: string; status?: string };

export const MERGE_FIELDS: MergeField[] = ["first_name", "streak", "program_name"];
export const TITLE_MAX = 100;
export const BODY_MAX = 500;
export const MEMBERS_MAX = 200;
export const SCHEDULE_MAX_DAYS = 30;

export const ANNOUNCEMENT_KEYS = {
  list: ["announcements", "list"] as const,
  preview: ["announcements", "preview"] as const,
  directory: ["announcements", "directory"] as const
};

const pad = (value: number) => String(value).padStart(2, "0");

/** "YYYY-MM-DD" of the browser's local today + `offsetDays` (the server checks the same range in X-Time-Zone). */
export function localDate(offsetDays: number): string {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** The browser's local "HH:MM" now. */
export function localTimeNow(): string {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** Puts `tag` over [start, end) of `value`, capped at `max`; returns the text and the caret after the tag. */
export function insertAt(value: string, start: number, end: number, tag: string, max: number) {
  const text = `${value.slice(0, start)}${tag}${value.slice(end)}`.slice(0, max);
  return { text, caret: Math.min(start + tag.length, text.length) };
}

export type ComposerFields = {
  targetKind: TargetKind;
  programId: string;
  memberIds: string[];
  title: string;
  body: string;
  mode: DeliveryMode;
  date: string;
  time: string;
};

/** The request body, or null while the form is incomplete (Send disabled, no preview). */
export function buildAnnouncementRequest(fields: ComposerFields): AnnouncementRequest | null {
  const title = fields.title.trim();
  const body = fields.body.trim();
  if (!title || !body || title.length > TITLE_MAX || body.length > BODY_MAX) return null;
  let target: AnnouncementTarget;
  if (fields.targetKind === "program") {
    if (!fields.programId) return null;
    target = { kind: "program", program_id: fields.programId };
  } else if (fields.targetKind === "members") {
    if (fields.memberIds.length === 0) return null;
    target = { kind: "members", member_ids: fields.memberIds };
  } else {
    target = { kind: "everyone" };
  }
  if (fields.mode === "local" && (!fields.date || !fields.time)) return null;
  const delivery: AnnouncementDelivery =
    fields.mode === "now" ? { mode: "now" } : { mode: "local", date: fields.date, time: fields.time };
  return { target, title, body, delivery };
}

export function listAnnouncements(token: string) {
  return apiRequest<{ announcements: AnnouncementSummary[] }>("/notifications/announcements", { token });
}

export function previewAnnouncement(token: string, request: AnnouncementRequest) {
  return apiRequest<AnnouncementPreview>("/notifications/announcements/preview", {
    method: "POST",
    token,
    body: { ...request }
  });
}

export function sendAnnouncement(token: string, request: AnnouncementRequest) {
  return apiRequest<AnnouncementSummary>("/notifications/announcements", { method: "POST", token, body: { ...request } });
}

export function cancelAnnouncement(token: string, id: string) {
  return apiRequest<{ id: string; status: "cancelled" }>(
    `/notifications/announcements/${encodeURIComponent(id)}/cancel`,
    { method: "POST", token }
  );
}

export function fetchMemberDirectory(token: string) {
  return apiRequest<DirectoryMember[]>("/members", { token });
}

const members = (count: number) => `${count} ${count === 1 ? "member" : "members"}`;

/** Who the confirm names (W15): the target kind + the exact previewed count. */
export function audienceText(kind: TargetKind, count: number, programName: string | null): string {
  if (kind === "everyone") return `every active member (${members(count)}, including you)`;
  if (kind === "program") return `everyone in ${programName ?? "the program"} (${members(count)})`;
  return `the ${members(count)} you chose`;
}

export const ANNOUNCEMENT_COPY = {
  title: "Announcements",
  subtitle: "Send a message to members",
  composeTitle: "New announcement",
  targetLabel: "Send to",
  targets: { program: "Program", members: "Members", everyone: "Everyone" } as Record<TargetKind, string>,
  chooseProgram: "Choose a program",
  everyoneHint: "Every active member, including you.",
  you: "You",
  titleLabel: "Title",
  titlePlaceholder: "e.g. Week 3, {first_name}!",
  bodyLabel: "Message",
  bodyPlaceholder: "Write your message",
  personalize: "Personalize:",
  mergeLabels: { first_name: "First name", streak: "Streak", program_name: "Program name" } as Record<MergeField, string>,
  personalizeHint:
    "Each person sees their own first name and current workout streak. Program name works when you send to a program.",
  whenLabel: "When",
  modes: { now: "Now", local: "Local time" } as Record<DeliveryMode, string>,
  dateLabel: "Date",
  timeLabel: "Time",
  localHint:
    "Each person gets it at this time in their own time zone (yours if theirs isn't known yet), within about 15 minutes. Anyone already past that time gets it at the next send.",
  pastTime: "That time has already passed today for you, so it goes out within about 15 minutes.",
  previewLabel: "Preview",
  previewIncomplete: "Choose who to send to and write a title and message to see a preview.",
  previewLoading: "Updating preview…",
  reach: (count: number) => `Reaches ${members(count)}.`,
  sampleFor: (name: string) => `What ${name} will see:`,
  sendNow: "Send now",
  schedule: "Schedule",
  sending: "Sending…",
  rateLimited: "You've reached the announcement limit. Try again later.",
  sendUncertain: "Check Recent announcements before sending again.",
  confirmTitle: "Send this announcement?",
  confirmBody: (audience: string, mode: DeliveryMode, date: string, time: string) =>
    mode === "now"
      ? `It goes to ${audience} right away and lands in their Inbox. This can't be undone.`
      : `It goes to ${audience} on ${date} at ${time}, in each person's time zone. You can cancel it under Recent announcements until it's sent.`,
  sent: (count: number) => `Sent to ${members(count)}.`,
  scheduled: (date: string, time: string, count: number) =>
    `Scheduled for ${date} at ${time} (each person's local time) for ${members(count)}.`,
  historyTitle: "Recent announcements",
  historyLoading: "Loading announcements…",
  historyEmpty: "No announcements yet.",
  status: { scheduled: "Scheduled", sending: "Sending", sent: "Sent", cancelled: "Cancelled" } as Record<
    AnnouncementStatus,
    string
  >,
  targetEveryone: "Everyone",
  targetMembers: (count: number) => `${count} chosen ${count === 1 ? "member" : "members"}`,
  targetProgramFallback: "A program",
  deliveryNow: (when: string) => `Right away, ${when}`,
  deliveryLocal: (date: string, time: string) => `${date} at ${time}, local time`,
  progress: (sent: number, total: number) => `${sent}/${total} sent`,
  cancel: "Cancel send",
  keep: "Keep",
  cancelTitle: "Cancel this announcement?",
  cancelBody: "People who haven't received it yet won't get it. Anyone who already got it keeps it.",
  directoryLoading: "Loading members…",
  searchMembers: "Search members",
  selectedCount: (count: number) => `${count} selected`,
  clear: "Clear",
  noMembers: "No members match your search."
};

/** Preview / send failure text: the composer's limit copy for a 429 (its limits last up to an hour, so the kit's
 *  "try again in a moment" would mislead), else the kit message (a 400 = the server's own text). */
export function announcementErrorMessage(error: unknown): string {
  const appErr = toAppError(error);
  return appErr.status === 429 ? ANNOUNCEMENT_COPY.rateLimited : appErr.message;
}

/** Send failure text: a timeout / unknown failure may have sent it anyway — never invite a blind second send. */
export function announcementSendErrorMessage(error: unknown): string {
  const kind = toAppError(error).kind;
  return kind === "timeout" || kind === "unknown" ? ANNOUNCEMENT_COPY.sendUncertain : announcementErrorMessage(error);
}
