export type ActiveProgram = {
  id: string;
  name: string;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  my_role?: string | null;
  my_status?: string | null;
  admin_only_data_entry?: boolean | null;
};

const ACTIVE_PROGRAM_KEY = "rasi.fiters.activeProgram";

export function saveActiveProgram(program: ActiveProgram) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_PROGRAM_KEY, JSON.stringify(program));
}

export function loadActiveProgram(): ActiveProgram | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(ACTIVE_PROGRAM_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ActiveProgram;
  } catch {
    return null;
  }
}

export function clearActiveProgram() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACTIVE_PROGRAM_KEY);
}
