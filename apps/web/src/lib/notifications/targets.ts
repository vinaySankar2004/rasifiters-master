import type { InboxItem } from "@/lib/api/notifications";
import { fetchPrograms, type Program } from "@/lib/api/programs";
import { loadActiveProgram, saveActiveProgram, type ActiveProgram } from "@/lib/storage";
import { broadcastActiveProgramUpdate } from "@/lib/use-active-program";

// Where a notification opens (the contract's targets) — the toast's View and an inbox row. Web has no push, so there is
// no cold-start tap. invites / inbox / anything unknown → the inbox ("+" sheet, Inbox tab).
export const OPEN_INBOX_EVENT = "rf:open-inbox";
export const INBOX_HREF = "/programs?open=inbox";

type Navigation = { push: (href: string) => void };

// The tab roots of an open program (app/shell.tsx's nav) and everything under them.
const PROGRAM_SCREENS = ["/summary", "/members", "/lifestyle", "/program"];

function programScreenShowing(): boolean {
  const path = window.location.pathname;
  return PROGRAM_SCREENS.some((root) => path === root || path.startsWith(`${root}/`));
}

export function toActiveProgram(program: Program): ActiveProgram {
  return {
    id: program.id,
    name: program.name,
    status: program.status ?? null,
    start_date: program.start_date ?? null,
    end_date: program.end_date ?? null,
    my_role: program.my_role ?? null,
    my_status: program.my_status ?? null,
    admin_only_data_entry: program.admin_only_data_entry ?? false
  };
}

/** True for targets that land in the inbox itself (invites, inbox, or a value newer than this build). */
export function opensInbox(target: string): boolean {
  return target !== "program" && target !== "programs" && target !== "log_workout";
}

/** Opens the "+" sheet on its Inbox tab — in place when /programs is showing (a push to the same path doesn't remount). */
export function openInbox(router: Navigation): void {
  if (window.location.pathname === "/programs") {
    window.dispatchEvent(new Event(OPEN_INBOX_EVENT));
  } else {
    router.push(INBOX_HREF);
  }
}

async function openProgram(router: Navigation, token: string, programId: string | null): Promise<void> {
  if (!programId || !token) {
    router.push("/programs");
    return;
  }
  // The routing guard: the program is already open on a program screen → stay put, only refresh the stored program.
  const stayPut = loadActiveProgram()?.id === programId && programScreenShowing();
  try {
    const program = (await fetchPrograms(token)).find((item) => item.id === programId);
    const status = program?.my_status?.toLowerCase() ?? null;
    if (!program || (status !== null && status !== "active")) {
      router.push("/programs");
      return;
    }
    saveActiveProgram(toActiveProgram(program));
    broadcastActiveProgramUpdate();
    if (!stayPut) router.push("/summary");
  } catch {
    if (!stayPut) router.push("/programs");
  }
}

export async function openNotificationTarget(
  item: Pick<InboxItem, "target" | "program_id">,
  router: Navigation,
  token: string
): Promise<void> {
  if (item.target === "program") return openProgram(router, token, item.program_id);
  if (item.target === "programs") return router.push("/programs");
  if (item.target === "log_workout") return router.push(loadActiveProgram()?.id ? "/summary/log-workout" : "/programs");
  openInbox(router);
}
