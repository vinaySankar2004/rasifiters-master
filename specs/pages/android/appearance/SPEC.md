# Screen: `appearance` (android) — light/dark/system chooser

> **Status:** 🏗️ built · **Version:** 0.1.1 · **App:** `android` (Compose) · **Thin port-note.**
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

## Phase 4 polish (0.1.1)

- **D-REL1 (#36, #45 — frontend-kit D-KIT-22; polish amendments PA1):** #45 the subtitle reads `Choose how RaSi Fiters
  looks to you` (was "RaSi Fit'ers"). #36 each option card is a `selectableTarget` with `Role.RadioButton`, so TalkBack
  announces the selected mode; the back button is the shared labelled 48 dp `Back`.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.1 | 2026-10-13 | **D-REL1 — Phase 4 polish (`0b0a0a3`).** #45 subtitle `Choose how RaSi Fiters looks to you`; #36 option cards announced as radio buttons with selected state, 48 dp back. |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase G). |
