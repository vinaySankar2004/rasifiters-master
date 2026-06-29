export type SessionUser = {
  id?: string;
  username?: string;
  memberName?: string;
  globalRole?: string;
};

export type SessionState = {
  token: string;
  refreshToken?: string;
  user: SessionUser;
};

const STORAGE_KEY = "rasi.fiters.session";
const TOKEN_COOKIE = "rasi.fiters.token";

function setCookie(name: string, value: string) {
  if (typeof window === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${secure}`;
}

function clearCookie(name: string) {
  if (typeof window === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export function saveSession(session: SessionState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  if (session.token) {
    setCookie(TOKEN_COOKIE, session.token);
  }
}

export function loadSession(): SessionState | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  clearCookie(TOKEN_COOKIE);
}
