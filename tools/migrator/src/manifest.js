// manifest.js — the canonical tables to copy, in FK-safe order, with conflict targets.
//
// Order satisfies every FK (parents before children). The composite-FK tables
// (workout_logs, daily_health_logs) come after program_memberships.
//
// NOT copied (Supabase Auth owns / cruft): member_credentials, refresh_tokens,
// auth_identities, email_verification_tokens, legacy_*. member_credentials is consumed
// by the auth import (importAuth.js), not copied as a table.

export const TABLES = [
  { table: "members", pk: ["id"] },
  { table: "workouts_library", pk: ["id"] },
  { table: "programs", pk: ["id"] },
  { table: "program_memberships", pk: ["program_id", "member_id"] },
  { table: "program_workouts", pk: ["id"] },
  { table: "workout_logs", pk: ["program_id", "member_id", "program_workout_id", "log_date"] },
  { table: "daily_health_logs", pk: ["program_id", "member_id", "log_date"] },
  { table: "member_emails", pk: ["id"] },
  { table: "member_push_tokens", pk: ["id"] },
  { table: "program_invites", pk: ["id"] },
  { table: "program_invite_blocks", pk: ["id"] },
  { table: "notifications", pk: ["id"] },
  { table: "notification_recipients", pk: ["notification_id", "member_id"] },
];

// members.auth_user_id is set by the auth import, not present in the legacy source —
// never overwrite it during a data re-sync.
export const NEVER_OVERWRITE = { members: ["auth_user_id"] };
