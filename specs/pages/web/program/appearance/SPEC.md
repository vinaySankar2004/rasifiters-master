# Page: `program/appearance` (web) — theme/appearance settings (program-settings sub-route 5 of 6)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/program/appearance` — the signed-in user's **appearance/theme picker** (System / Light / Dark →
> `localStorage["rf:appearance"]`), the fifth of the six deferred `/program/*` settings sub-routes (reached from
> the [`program`](../SPEC.md) hub's account menu).
> **Despite living under `/program/*` it is NOT a program-admin setting** like
> [`edit`](../edit/SPEC.md)/[`roles`](../roles/SPEC.md) — it sets the *requester's own* client-side theme
> preference and is therefore available to **every** role (no admin redirect). It is the **purest sub-route yet:
> a pure client-side preference page with no backend, no API call, and no new dependency** — and the **write side**
> of the contract the [`program`](../SPEC.md) hub's appearance-label only *reads* (run-24 F5).
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/program/appearance/page.tsx`.
> **Consumes (features):** none beyond the foundation — `lib/theme.ts` (the `rf:appearance` localStorage contract:
> `getStoredTheme`/`setStoredTheme`/`applyTheme`) + `useAuthGuard`. No feature SPEC owns the theme contract; it is
> page-independent foundation infra ported with the scaffold.
> **Cross-app:** the iOS **Settings → Appearance** screen offers the same System/Light/Dark choice natively
> (stored in `@AppStorage`, not `localStorage`); parity audited at the iOS port.
> **Stance:** faithful 1:1 port **+ one small cleanup** (D-C1 reuse `useAuthGuard`). Oddities flagged §10.

---

## 1. What it is + who uses it

The **appearance picker** for the signed-in member: a `GlassCard` holding three full-width option buttons —
**System** (follows the device's `prefers-color-scheme`), **Light**, **Dark** — each with an icon, title,
description, and a ✓ on the active choice. Selecting one writes the preference to `localStorage["rf:appearance"]`
and applies it immediately to `document.documentElement` (`data-theme` + `color-scheme`). Used by **any
authenticated user** to set their own theme; there is **no admin gate and no role redirect** — the only guard is
`!session?.token → /login` (now via `useAuthGuard`, D-C1).

## 2. Why it exists

To let each member choose how the app looks, independently per device/browser. It is the surface behind the hub's
"Appearance" account-menu row (which only *displays* the current label via `getStoredTheme()` — run-24 D-C1/F5;
this page is where the value is actually changed). The preference is purely client-side — there is **no server
profile field for theme** — so it never touches the backend or another member.

## 3. Route / location

- **App:** `web`. **Route:** `/program/appearance`. **Protected** — under the `middleware.ts` matcher (unauth
  edge request → `/login`). `useAuthGuard({ requireProgram: false })` — **no active program required** (you can
  set your theme with no program selected); there is **no role redirect** (every role may set own appearance).
- **Reached via:** the [`program`](../SPEC.md) hub's account menu (`router.push("/program/appearance")`).
- **Chrome:** `PageShell maxWidth="2xl"` + `PageHeader` (title "Appearance", subtitle "Choose how RaSi Fiters
  looks to you.", `backHref = program?.id ? "/program" : "/programs"` — back to the hub if a program is active,
  else the programs list). No bottom nav (sub-route, not a workspace tab).
- **Leaves to:** `/program` or `/programs` on Back; otherwise stays in place (selection is instant, no navigation).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | `PageHeader` "Appearance" + subtitle + Back → `/program` or `/programs`. | appearance/page.tsx:59-64 |
| Options card | `GlassCard padding="lg"` wrapping the `OPTIONS.map` of three theme buttons. | appearance/page.tsx:66-88 |
| Option button | Per-theme button: `metric-pill` icon chip (`IconMonitor`/`IconSun`/`IconMoon`) + title + description; active state gets `border-rf-accent bg-rf-accent/10` + a ✓; inactive gets `border-rf-border bg-rf-surface-muted text-rf-text-muted`. | appearance/page.tsx:67-87 |

## 5. Components + consumed features

- **Shared UI:** `PageShell`, `PageHeader`, `GlassCard`, icons `IconMonitor`/`IconSun`/`IconMoon` — **all already
  ported** (no new dependency this run). The `OPTIONS` array stays co-located in the page (faithful).
- **Hooks/state:** `useAuthGuard({ requireProgram: false })` (provides `program` for the back-href + the
  login-redirect); a single `useState<ThemePreference>` for the current selection; one `useEffect` to hydrate +
  apply the stored theme on mount.
- **Consumed features:** **none beyond the foundation.** `lib/theme.ts` (`getStoredTheme`/`setStoredTheme`/
  `applyTheme`/`ThemePreference`) is page-independent foundation infra (ported with the scaffold), not a feature
  SPEC. `useAuthGuard` is the foundation auth hook.

## 6. Data / API

- **No API, no backend, no network call at all.** The only persistence is the browser:
  `localStorage["rf:appearance"]` read on mount (`getStoredTheme`) and written on selection (`setStoredTheme`,
  which also calls `applyTheme` to flip `document.documentElement.dataset.theme` + `style.colorScheme`
  immediately). `applyTheme` is also called once on mount to re-assert the stored theme.
- **No backend work, no feature bump** — there is no endpoint to confirm; the theme contract is wholly
  client-side foundation infra. The sweep ports **only the page**.

## 7. Role-based view rules

| Role | Access | Notes |
|------|--------|-------|
| **global_admin** | Sets own theme. | No role gate — same UI for everyone. |
| **program admin** | Sets own theme. | — |
| **logger** | Sets own theme. | — |
| **member** | Sets own theme. | — |

- **No admin redirect** — unlike `edit`/`roles`, every role lands here and sets *their own* client-side preference;
  the page never reads a JWT-decoded role and has **no role-conditional UI**.
- **`admin_only_data_entry` effect:** **N/A** — appearance is a client-side display preference, not a workout/
  health data-entry surface; the toggle (set on `/program/edit`) gates the log forms on the workspace tabs, not
  this page.

## 8. States & edge cases

- **Initial state:** `selection` defaults to `"system"`, then the mount `useEffect` overwrites it with the stored
  value and applies it. (A first-paint flash is possible if the stored theme differs from the SSR default; faithful
  — the foundation also applies the theme at the app shell, F2.)
- **Selection:** instant — no loading/pending/error states exist (it is a synchronous `localStorage` write +
  `applyTheme`). There is no save button and no confirmation; the ✓ + active styling move on click.
- **System theme:** "System" resolves live via `window.matchMedia("(prefers-color-scheme: dark)")` at apply time.
- **Unauthenticated:** the `useAuthGuard` redirect (and the edge `middleware.ts`) send a tokenless visitor to
  `/login`.
- **No active program:** allowed — `requireProgram: false`; Back then targets `/programs`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | `consumed_by = [web]` for this page spec; the iOS Settings → Appearance screen offers the same System/Light/Dark choice (via `@AppStorage`, not `localStorage`) and is audited at the iOS port. No cross-app divergence to resolve (web-only page spec). | legacy `program/appearance/page.tsx`; iOS `Features/Settings/` |
| **D-SCOPE** | **This page only.** Port `/program/appearance` faithful 1:1; the remaining `/program/*` sub-route (privacy — the 6th & last) remains its own deferred row. | per-page cadence; [`program` SPEC §3](../SPEC.md) |
| **D-DEPS** | **No new dependency** — `PageShell`/`PageHeader`/`GlassCard`, the three icons, `lib/theme.ts`, and `useAuthGuard` are **all already ported** (the run-27 purest shape, here at its purest: nothing dragged in, not even a chrome leaf). | [lib/theme.ts](../../../../../../apps/web/src/lib/theme.ts); `components/ui/`; `components/icons/index.tsx` |
| **D-S1** | **Faithful 1:1** otherwise — same three-option `OPTIONS` array, the `metric-pill` icon chips, the active/inactive button styling (already fully `rf-*` tokenized in legacy — **no tokenize cleanup needed**, unlike runs 26–28), the mount-hydrate `useEffect`, and `backHref = program?.id ? "/program" : "/programs"`. | appearance/page.tsx |
| **D-C1** | **Reuse `useAuthGuard({ requireProgram: false })`** instead of the inline `useAuth` + `useActiveProgram` + manual `useEffect(() => !session?.token && router.push("/login"))` redirect — matches siblings [`profile`](../profile/SPEC.md)/[`password`](../password/SPEC.md) exactly; the hook subsumes the redirect AND returns `program` for the back-href, deleting the `useRouter`/`useAuth`/`useActiveProgram` imports. Legacy predated the foundation hook. | appearance/page.tsx:34-45; [use-auth-guard.ts](../../../../../../apps/web/src/lib/hooks/use-auth-guard.ts) |

## 10. Flagged characteristics (kept as-is)

- **F1 — the preference is per-device/per-browser, not synced to the account.** `rf:appearance` lives only in
  `localStorage`; there is no server theme field, so switching devices/browsers resets to "System". Faithful —
  matches legacy and iOS (`@AppStorage` is also device-local); a server-synced theme would be a rebuild feature,
  not a cleanup.
- **F2 — possible first-paint theme flash.** `selection` starts `"system"` and is corrected in a mount
  `useEffect`; if the stored theme differs, the option list can momentarily show the wrong active row. The app
  shell applies the stored theme early, so the *page chrome* is correct; only the in-card ✓ may flicker. Faithful;
  minor, rebuild-cleanup candidate.
- **F3 — no role is read at all.** Unlike `profile` (role label) / `roles`+`edit` (admin gate), this page has no
  role-conditional UI — the ABSENCE of role logic is the finding; §7 is "same for everyone." Faithful.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 29) — the **fifteenth web page spec**, the **fifth of the six deferred `/program/*` settings sub-routes**. The signed-in user's **appearance/theme picker** (System/Light/Dark → `localStorage["rf:appearance"]`) — **not** a program-admin setting (no admin redirect; available to every role; no role-conditional UI at all). The **purest sub-route yet: pure client-side, no backend, no API call, no new dependency** — and the write side of the contract the `program` hub's appearance-label only reads (run-24 F5). Decisions: **D-REF** (`consumed_by=[web]`; iOS Settings → Appearance mirrors via `@AppStorage` later) · **D-SCOPE** (this page only; privacy still deferred) · **D-DEPS** (no new dependency — purest shape) · **D-S1** (faithful 1:1; already fully tokenized, no tokenize cleanup) · **D-C1** (reuse `useAuthGuard({ requireProgram: false })` over the inline redirect). Flagged F1–F3 (device-local preference; first-paint flash; no role read at all). Consumes only foundation infra (`lib/theme.ts` + `useAuthGuard`); **no feature bump.** Ported `apps/web/src/app/program/appearance/page.tsx`. `npm run build` ✓. |
