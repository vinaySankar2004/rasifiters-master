export type ThemePreference = "system" | "light" | "dark";

const THEME_KEY = "rf:appearance";

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function setStoredTheme(value: ThemePreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_KEY, value);
  applyTheme(value);
}

export function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = resolveTheme(preference);
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  syncThemeColorMeta(resolved);
}

// The mobile status-bar tint (iOS Safari notch area / Android address bar) is driven by the
// `theme-color` meta. It must track the RESOLVED app theme (`data-theme`, which can be an
// explicit user override), not the OS `prefers-color-scheme`. layout.tsx no longer emits any
// theme-color meta, so this single JS-owned meta is authoritative — the pre-paint bootstrap in
// layout.tsx creates it, and this keeps it in sync on runtime toggles / system changes.
// IMPORTANT: update-or-create only — never removeChild. The meta is ours (React does not manage
// it); removing nodes React tracks corrupted the head tree and crashed on client navigation.
function syncThemeColorMeta(resolved: "light" | "dark") {
  const color = resolved === "dark" ? "#070809" : "#f4f3f7";
  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", color);
}

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return preference;
}

export function watchSystemTheme(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => onChange();
  if (media.addEventListener) {
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }
  media.addListener(handler);
  return () => media.removeListener(handler);
}
