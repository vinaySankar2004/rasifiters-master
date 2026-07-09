# Screen: `appearance` (android) — light/dark/system chooser

> **Status:** 🏗️ built · **Version:** 0.1.0 · **App:** `android` (Compose) · **Thin port-note.**
> Full behavior = iOS `Features/Home/Settings/AppearanceSettingsView.swift` (its `ThemeManager`).
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.PROGRAM_APPEARANCE` (`AppearanceScreen`).
> **Files:** `ui/program/AppearanceScreen.kt`; store `core/AppearanceStore.kt`; theme wiring `MainActivity`.

## Parity (iOS 1:1)

- Title + subtitle + three option cards — **System** (follows device) / **Light** / **Dark** — the selected
  one gets an orange border + a check; a **Preview** "Sample Card" below.

## Android realization

- **`AppearanceStore`** (the iOS `ThemeManager` analog): a plain (non-encrypted, **not** cleared on
  sign-out) SharedPreferences-backed `StateFlow<AppearanceMode>`, held by `AppContainer`. `MainActivity`
  collects it and maps SYSTEM→`isSystemInDarkTheme()`, LIGHT→light, DARK→dark into `RaSiFitersTheme`
  (`darkTheme`), so the whole app recomposes the instant a mode is chosen.
