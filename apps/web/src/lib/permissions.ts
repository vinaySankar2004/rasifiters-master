import type { SessionState } from "@/lib/auth/session";
import type { ActiveProgram } from "@/lib/storage";

/** Shown wherever a write action is blocked by the admin-only data-entry lock. */
export const DATA_LOCK_MESSAGE =
  "Admin-only data entry is on for this program. Only program admins can add, edit, or delete data.";

/** True if the user is a program admin for the active program, or a global admin. */
export function isProgramAdmin(
  session: SessionState | null | undefined,
  program: ActiveProgram | null | undefined
): boolean {
  return session?.user.globalRole === "global_admin" || program?.my_role === "admin";
}

/**
 * True when the active program has admin-only data entry enabled AND the current
 * user is not an admin — i.e. they must not be able to add/edit/delete data.
 * The backend is the real guard; this only drives the disabled UI + messaging.
 */
export function isDataEntryLocked(
  session: SessionState | null | undefined,
  program: ActiveProgram | null | undefined
): boolean {
  return !!program?.admin_only_data_entry && !isProgramAdmin(session, program);
}
