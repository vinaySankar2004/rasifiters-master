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
