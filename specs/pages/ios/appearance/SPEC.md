# Screen: `appearance` (ios) — the account-menu "Appearance" theme picker

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `ProgramMyAccountSection` (run 57) → "Appearance"
> `NavigationLink → AppearanceSettingsView().environmentObject(themeManager)`.
> **Reference impl (legacy):** `../../../../../ios-mobile/RaSi-Fiters-App/Features/Home/Settings/AppearanceSettingsView.swift`.
> **Web parity reference:** [`web program/appearance`](../../web/program/appearance/SPEC.md) — same
> System/Light/Dark device-local picker.
> **Consumes (features):** none — pure client preference (`ThemeManager` → `UserDefaults`).
> **Stance:** **faithful 1:1 verbatim port** (D-S1). Already matches web; no deviation, no new dependency.

---

## 1. What it is + who uses it

The **theme picker** — System / Light / Dark, with a live preview card. Reached from the Program tab's My
Account section. A pure device-local preference; available to **every authenticated role**, identical for all.

## 2. Why it exists

To let a user choose the app's appearance. Each option calls `themeManager.setAppearance(_:)`, which
publishes the change (applied app-wide via `@main`'s `applyTheme`) and persists the raw value to
`UserDefaults["appearanceMode"]`. No network, no server theme field — matches web's device/browser-local
`localStorage` model.

## 3. Route / location

- **App:** `ios`. **Reached via:** `ProgramMyAccountSection` → "Appearance" (the caller injects `themeManager`).
- **Leaves to:** back to the Program tab (nav back). No forward-nav.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Heading + subheading | "Appearance" / "Choose how RaSi Fit'ers looks to you". | legacy `AppearanceSettingsView.swift:13-20` |
| Mode options | `ForEach(AppearanceMode.allCases)` (system/light/dark) — each an icon circle + name + description + a selected checkmark + `appOrange` border; tap → `setAppearance(_:)` with animation. | legacy `:24-70` |
| Preview card | A sample card rendered in the current theme. | legacy `:72-109` |

## 5. Components + features consumed

- **Components:** `AppearanceMode` (enum, `ThemeManager.swift`), `ThemeManager` (`@EnvironmentObject`,
  injected by the caller), `Color.appOrange`/`appOrangeLight`, `adaptiveShadow`. **No new component.**
- **Features:** none.

## 6. Data / API

- **None** — no endpoint, no client storage beyond `ThemeManager`'s `UserDefaults["appearanceMode"]` write.

## 7. Role-based view rules

**No role read at all** — identical for every authenticated role; a pure client preference (the absence of
role logic is the finding). **`admin_only_data_entry` = N/A.**

| Viewer | Sees | Can do |
|--------|------|--------|
| Every authenticated role | System/Light/Dark options + preview. | Set own device-local theme. |

## 8. States & edge cases

- **No loading/empty/error** — instant, synchronous selection; no network. The selected mode shows a
  checkmark + accent border; the preview re-renders live.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `.../Features/Home/Settings/AppearanceSettingsView.swift`; web parity = [`web program/appearance`](../../web/program/appearance/SPEC.md). `consumed_by = [ios]`.** | legacy `AppearanceSettingsView.swift:1-129`; web appearance SPEC. |
| **D-S1** | **Stance = faithful 1:1 verbatim port.** Already matches web (System/Light/Dark device-local); the screen uses bespoke mode-row buttons + a preview card with no shared-component equivalent, so the component-adoption cleanup (D-C3 elsewhere this run) **does not apply** — no text inputs, no generic CTA. | legacy `AppearanceSettingsView.swift`; user answer (cluster stance). |
| **D-DEPS** | **No new dependency** — `ThemeManager`/`AppearanceMode` + theme colors all ported in the foundation (run 50). | foundation inventory (run 50). |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Device-local only** — no server theme field; the preference doesn't sync across devices (web is also device/browser-local). | `ThemeManager.swift` `UserDefaults` | Kept (faithful) — mirrors web appearance F1. |
| **F2** | **Bespoke mode-row buttons + preview card** kept verbatim (not refactored to `AppPrimaryButton` etc.) — they are selection controls, not generic CTAs. | `AppearanceSettingsView.swift:24-109` | Kept (faithful) — the D-C3 component-adoption has no clean mapping here. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC authored via `question-asker` — the **Appearance theme picker** (one of the 4-screen account/settings cluster, run 58). Documents the System/Light/Dark device-local picker (`ThemeManager` → `UserDefaults`) + preview card. Decisions: **D-REF** (`consumed_by=[ios]`; legacy iOS + web parity) · **D-S1** (faithful 1:1 verbatim port — already matches web; D-C3 component-adoption N/A: bespoke selection controls, no inputs) · **D-DEPS** (no new dependency). Flagged F1 (device-local only) / F2 (bespoke controls kept). Role rules: same for every role (no role read); `admin_only_data_entry` N/A. No API. Ported `apps/ios/.../Features/Home/Settings/AppearanceSettingsView.swift`. Build green-check owned by the user (Xcode). |
