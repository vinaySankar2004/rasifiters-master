# PLAN: Phase 4 touch-up (c). The top-right initials circle on Summary and Program opens My Profile, and Back returns to the screen it came from (web/iOS/Android)

**Brief accepted**: yes (19 files: 8 code + 9 page SPECs + REGISTRY.md + HANDOFF.md)

**Feature/version prediction**: no feature bump. This is client navigation only and touches no `reference_impl` path in `specs/features/registry.json`. 9 page SPECs get a PATCH bump each, with no tags (`feature/*` tags are features-only). App versions stay as they are: iOS 1.5.2 (60) and Android 1.2.0 (7) are already in the repo.

**Surfaces in scope**: [web, ios, android]. The file sets are disjoint, so the surfaces can be done in parallel. Docs come after the code, in one commit. Backend: none.

**Open questions, resolved:**
- **OQ1 = YES.** iOS `SummaryHeader` callers switch from `adminInitials` to `loggedInUserInitials`.
  - Why: at sign-in both hold the same name, but only `loggedInUserName` updates after a rename in My Profile. That is the screen this circle now opens. Web and Android already update at once.
- **OQ2 = NO.** No `launchSingleTop`. This follows the existing `ProgramAccountSection` profile row.
- **OQ3**: SEO is HANDOFF item (f), after store submission. It is not part of this plan.

**Trade-off (decided):**
- The circle opens My Profile directly. The picker's account-menu button stays unchanged on all three surfaces, because its menu holds rows reachable only there (Apple Health / Health Connect, Support, Sign Out).
- The Summary and Program circles are decorative today, so no existing access is lost.

**D-rule name (all surfaces)**: `D-PC1` ("profile circle"). There is no collision in `specs/`.

## Steps — web (implementer W; files: `apps/web/src/app/summary/page.tsx`, `apps/web/src/app/program/page.tsx`)

1. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/summary/page.tsx:228`. Replace the `SummaryHeader` call with:
```tsx
        <SummaryHeader
          title="Summary"
          subtitle={program?.name ?? "Program"}
          initials={userInitials || "RF"}
          onOpenProfile={() => router.push("/program/profile")}
        />
```
   `router` already exists at :56.

2. Same file, `function SummaryHeader` (:400-422). Replace the whole function with:
```tsx
function SummaryHeader({
  title,
  subtitle,
  initials,
  onOpenProfile
}: {
  title: string;
  subtitle: string;
  initials: string;
  onOpenProfile: () => void;
}) {
  return (
    <div className="flex items-center gap-6">
      <div>
        <h1 className="text-3xl font-bold text-rf-text">{title}</h1>
        <p className="mt-1 text-sm font-semibold text-rf-text-muted">{subtitle}</p>
      </div>
      <div className="ml-auto flex items-center gap-3">
        {/* Touch-up (c), D-PC1: the initials circle opens My Profile; its Back (router.back) returns here. */}
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="My Profile"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-rf-accent text-base font-bold text-black"
        >
          {initials}
        </button>
      </div>
    </div>
  );
}
```

3. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/program/page.tsx:133-135`. Replace the circle `<div>…</div>` inside `<header>` with:
```tsx
          {/* Touch-up (c), D-PC1: the initials circle opens My Profile; its Back (router.back) returns here. */}
          <button
            type="button"
            onClick={() => router.push("/program/profile")}
            aria-label="My Profile"
            className="ml-auto flex h-12 w-12 items-center justify-center rounded-full bg-rf-accent text-base font-bold text-black"
          >
            {userInitials || "RF"}
          </button>
```
   - `router` already exists at :43.
   - The classes stay the same. Tailwind 3 preflight already gives `<button>` `cursor: pointer`.
   - Back works with no further change:
     - `/program/profile`'s `PageHeader` → `BackButton` calls `router.back()` when history is longer than 1.
     - Browser Back is native.
     - The active program is in storage, so it stays the same.
     - The bottom nav is hidden on `/program/profile` (`shell.tsx:16`).

## Steps — ios (implementer I; files: `SummaryCards.swift`, `StandardProgramTab.swift`, `AdminSummaryTab.swift`, `AdminProgramTab.swift`, all under `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Features/Home/Tabs/`)

4. `SummaryCards.swift:25-38` (`SummaryHeader`, after `Spacer()` at :23). Replace the `ZStack { … }` with:
```swift
            // Touch-up (c), D-PC1: the initials circle opens My Profile. It pushes on the picker's outer stack, so
            // nav back / the edge swipe returns to this tab with the tab + program intact. Plain style = same look.
            NavigationLink {
                MyProfileView()
            } label: {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color.appOrange, Color.appOrangeGradientEnd],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 52, height: 52)
                    Text(initials)
                        .font(.headline.weight(.bold))
                        .foregroundColor(.black)
                }
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("My Profile")
```
   - The struct's properties and signature do not change.
   - This is a ScrollView, not a List, so the `.dismissKeyboardOnTap()` List-row gotcha does not apply. It follows the same pattern as `ProgramCards.swift:280-315`.

5. `AdminSummaryTab.swift:46`: change `initials: programContext.adminInitials` to `initials: programContext.loggedInUserInitials`.

6. `AdminProgramTab.swift:22`: change `initials: programContext.adminInitials` to `initials: programContext.loggedInUserInitials`.

7. `StandardProgramTab.swift:43-56` (inside the tab's own `NavigationStack`, after `Spacer()` at :42). Replace the `ZStack { … }` with:
```swift
                            // Touch-up (c), D-PC1: the initials circle opens My Profile on this tab's own stack;
                            // nav back / the edge swipe pops back here. Plain style = same look.
                            NavigationLink {
                                MyProfileView()
                            } label: {
                                ZStack {
                                    Circle()
                                        .fill(
                                            LinearGradient(
                                                colors: [Color.appOrange, Color.appOrangeGradientEnd],
                                                startPoint: .topLeading,
                                                endPoint: .bottomTrailing
                                            )
                                        )
                                        .frame(width: 52, height: 52)
                                    Text(loggedInUserInitials)
                                        .font(.headline.weight(.bold))
                                        .foregroundColor(.black)
                                }
                                .contentShape(Circle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("My Profile")
```
   Keep the private `loggedInUserInitials` (:14-22) as it is.

   Do NOT touch `EdgeSwipeToReturn.swift` or `AdminHomeView.swift`; they belong to touch-up (d). `EdgeSwipeToReturn.swift:88-102` already pops one level on both the outer stack and a tab's own stack.

## Steps — android (implementer A; files: `ui/summary/SummaryScreen.kt`, `ui/program/ProgramScreen.kt` under `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/`)

8. `ui/summary/SummaryScreen.kt` imports. After `import com.app.rasifiters.ui.components.kit.FloatingBannerVariant` (:54), add:
```kotlin
import com.app.rasifiters.ui.components.tapTarget
```

9. `SummaryScreen.kt:72` (KDoc). Delete this whole line, since it is no longer a deviation (iOS matches after step 5):
```
 *  • Header avatar shows the signed-in user's initials (web parity) rather than the program admin's (iOS).
```

10. `SummaryScreen.kt:118`. Replace the call with:
```kotlin
                Header(
                    programName = program?.name ?: "",
                    initials = initialsOf(memberName),
                    onOpenProfile = { onNavigate(Routes.PROGRAM_PROFILE) },
                )
```

11. `SummaryScreen.kt:214-236`. Replace `private fun Header` with:
```kotlin
@Composable
private fun Header(programName: String, initials: String, onOpenProfile: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text("Summary", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Text(
                programName,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        // Touch-up (c), D-PC1: the initials circle opens My Profile; system back pops back here. tapTarget goes first
        // (TapTarget.kt order rule); at 52dp the look is unchanged.
        Box(
            modifier = Modifier
                .tapTarget(label = "My Profile", shape = CircleShape, onClick = onOpenProfile)
                .size(52.dp)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(AppOrange, AppOrangeGradientEnd))),
            contentAlignment = Alignment.Center,
        ) {
            Text(initials, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = androidx.compose.ui.graphics.Color.Black)
        }
    }
}
```

12. `ui/program/ProgramScreen.kt` imports. After `import com.app.rasifiters.ui.components.kit.rememberLoad` (:47), add:
```kotlin
import com.app.rasifiters.ui.components.tapTarget
```

13. `ProgramScreen.kt:108`. Replace the call with:
```kotlin
            Header(
                programName = program?.name ?: "",
                initials = initialsOf(memberName),
                onOpenProfile = { onNavigate(Routes.PROGRAM_PROFILE) },
            )
```

14. `ProgramScreen.kt:222-244`. Replace `private fun Header` with:
```kotlin
@Composable
private fun Header(programName: String, initials: String, onOpenProfile: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text("Program", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Text(
                programName,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        // Touch-up (c), D-PC1: the initials circle opens My Profile; system back pops back here. tapTarget goes first
        // (TapTarget.kt order rule); at 52dp the look is unchanged.
        Box(
            modifier = Modifier
                .tapTarget(label = "My Profile", shape = CircleShape, onClick = onOpenProfile)
                .size(52.dp)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(AppOrange, AppOrangeGradientEnd))),
            contentAlignment = Alignment.Center,
        ) {
            Text(initials, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color.Black)
        }
    }
}
```
   - `Routes`, `CircleShape`, `clip`, `Brush`, `Color` and `AppOrange*` are already imported in both files.
   - Back already works:
     - `PROGRAM_PROFILE` is an inner-NavHost route (`AppScaffold.kt:173-175`, `onBack = nav.popBackStack()`).
     - `BackHandler` is enabled only on the 4 tabs, so system back pops to the originating tab.
     - `rememberScrollState` is saveable, so the scroll position survives.

## Steps — docs (one docs pass AFTER W/I/A land; orchestrator or a single implementer; all under `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/`)

The versions below are provisional. Add each D-rule row directly after the last current row of that SPEC's §9 table (anchor by text, not line number). Add each changelog row as the first row under the table's `|---|` separator.

15. `pages/web/summary/SPEC.md`
   - :3 `**Version:** 0.4.3` → `**Version:** 0.4.4`.
   - §3: after the `- **Leaves to:**` bullet (it ends "…removed in the 2026-07-01 merge.)"), add:
     `- **Header circle (0.4.4, D-PC1):** the initials circle → \`/program/profile\`; Back returns here.`
   - §4 Header row (:60) becomes:
     `| Header | "Summary" + active program name + the user's initials circle — a button (\`aria-label="My Profile"\`) that opens \`/program/profile\` (0.4.4, D-PC1). | summary/page.tsx (\`SummaryHeader\`) |`
   - §9: after the `| **D-REL4** |` row, add:
     `| **D-PC1** | **Touch-up (c) — the header circle opens My Profile (2026-10-13).** \`SummaryHeader\`'s initials circle (was a decorative \`<div>\`) is a \`<button type="button" aria-label="My Profile">\` with the same classes; it runs \`router.push("/program/profile")\`. Back (\`BackButton\` → \`router.back()\`, or browser Back) returns to \`/summary\` with the active program intact. Parity: web \`/program\`, iOS \`SummaryHeader\`/\`StandardProgramTab\`, Android \`SummaryScreen\`/\`ProgramScreen\` (only Back is platform idiom). The \`/programs\` account button is unchanged — its menu holds rows reachable only there. | user, touch-up (c) (reliability HANDOFF) |`
   - §11: `| 0.4.4 | 2026-10-13 | **D-PC1 — touch-up (c).** The header initials circle is a button (\`aria-label="My Profile"\`, same look) → \`/program/profile\`; Back returns to Summary. |`

16. `pages/web/program/SPEC.md`
   - :3 `0.3.0` → `0.3.1`.
   - §3: after the `- **Leaves to**` bullet (it ends "…have **all since been built** (F2)."), add:
     `- **Header circle (0.3.1, D-PC1):** the initials circle → \`/program/profile\`; Back returns here.`
   - §4 Header row (:63) becomes:
     `| Header | "Program" + active program name + the user's initials circle — a button (\`aria-label="My Profile"\`) that opens \`/program/profile\` (0.3.1, D-PC1). | program/page.tsx (\`<header>\`) |`
   - §9: after the `| **D-NP1** |` row, add:
     `| **D-PC1** | **Touch-up (c) — the header circle opens My Profile (2026-10-13).** The header's initials circle (was a decorative \`<div>\`) is a \`<button type="button" aria-label="My Profile">\` with the same classes → \`router.push("/program/profile")\`; Back (\`router.back()\` / browser Back) returns to \`/program\`. Same as web summary D-PC1 and the iOS/Android Summary + Program headers. \`MyAccountSection\` keeps its profile row. | user, touch-up (c) (reliability HANDOFF) |`
   - §11: `| 0.3.1 | 2026-10-13 | **D-PC1 — touch-up (c).** The header initials circle is a button (\`aria-label="My Profile"\`, same look) → \`/program/profile\`; Back returns to Program. |`

17. `pages/web/program/profile/SPEC.md`
   - :3 `0.4.1` → `0.4.2`.
   - §3: replace the 2-line `- **Reached via:**` bullet with:
```
- **Reached via:** the [`program`](../SPEC.md) hub's "My Account" row, the `/programs` picker's "My Account" menu
  (Profile row), and the header initials circle on `/summary` and `/program` (0.4.2, summary/program D-PC1) — all
  `router.push("/program/profile")`.
```
   - §3: replace the `- **Leaves to:**` line with:
     `- **Leaves to:** Back (\`BackButton\` → \`router.back()\`, or browser Back) returns to the page it was opened from (\`/summary\`, \`/program\` or \`/programs\`); \`backHref\` is only the no-history fallback. \`/login\` after a successful account deletion.`
   - §11: `| 0.4.2 | 2026-10-13 | Reached-via grows (touch-up (c), summary/program D-PC1): the Summary / Program header circle, plus the \`/programs\` account menu (already true, now documented); Back returns to the opener. No change to this page. |`

18. `pages/ios/admin-summary/SPEC.md` (this SPEC has no header version line)
   - §4 row :33 becomes:
     `| \`SummaryHeader\` (title · program name · signed-in user's initials circle → \`MyProfileView\`, D-PC1) | legacy \`AdminHomeHelpers.swift:53\` | \`SummaryCards.swift\` |`
   - §5 :47: in the computeds list, replace `` `adminInitials` `` with `` `loggedInUserInitials` ``.
   - §9: after the `| **D-REL1** |` row, add:
     `| **D-PC1** | **Touch-up (c) — the header circle opens My Profile (2026-10-13).** \`SummaryHeader\` (shared by Summary and the admin Program tab) wraps its circle in \`NavigationLink { MyProfileView() }\` + \`.buttonStyle(.plain)\` + \`.contentShape(Circle())\` + \`.accessibilityLabel("My Profile")\` — same look. It pushes on the picker's outer stack, so nav back / the edge swipe pops to this tab with the selected tab and program intact. Initials now read \`loggedInUserInitials\` (was \`adminInitials\`: the same name at sign-in, never refreshed after a rename in My Profile) — web/Android parity; closes android/summary A-2. The picker's account button is unchanged. | user, touch-up (c) (reliability HANDOFF) |`
   - §11: prepend this bullet above `- **v0.2.3**`:
     `- **v0.2.4** (2026-10-13, **D-PC1 — touch-up (c)**) — the \`SummaryHeader\` circle is a plain-style \`NavigationLink\` → \`MyProfileView\` (label "My Profile", same look) and shows \`loggedInUserInitials\` (was \`adminInitials\`).`

19. `pages/ios/admin-program/SPEC.md`
   - :3 `0.2.1` → `0.2.2`.
   - §3: directly under `- **Leaves to:**`, insert this first sub-bullet:
     `  - \`MyProfileView()\` — also from the header initials circle, both variants (0.2.2, D-PC1).`
   - §4 admin Header row (:68) becomes:
     `| Header | \`SummaryHeader(title:"Program", subtitle:name, status:, initials:loggedInUserInitials)\`; the circle is a \`NavigationLink\` → \`MyProfileView()\` (0.2.2, D-PC1). | \`AdminProgramTab.swift:14-19\` |`
   - §4 standard Header row (:79) becomes:
     `| Header | Inline \`HStack\`: "Program" + program name + own initials avatar (orange gradient); the avatar is a \`NavigationLink\` → \`MyProfileView()\` on this tab's own stack (0.2.2, D-PC1). | \`StandardProgramTab.swift:31-55\` |`
   - §5 :97: replace `` `activeMembers`/`adminInitials`/`loggedInUserName` `` with `` `activeMembers`/`loggedInUserName` ``.
   - §9: after the `| **D-REL1** |` row, add:
     `| **D-PC1** | **Touch-up (c) — the header circle opens My Profile (2026-10-13).** Admin variant: via the shared \`SummaryHeader\` (admin-summary D-PC1), initials = \`loggedInUserInitials\`. Standard variant: the inline circle is wrapped the same way (\`NavigationLink { MyProfileView() }\`, \`.buttonStyle(.plain)\`, \`.contentShape(Circle())\`, label "My Profile") and pushes on the tab's own \`NavigationStack\`. Back / the edge swipe pops to the Program tab. \`ProgramMyAccountSection\` keeps its profile row. | user, touch-up (c) (reliability HANDOFF) |`
   - §11: `| 0.2.2 | 2026-10-13 | **D-PC1 — touch-up (c).** The header circle (both variants) opens \`MyProfileView\` (plain \`NavigationLink\`, label "My Profile", same look); the admin variant shows \`loggedInUserInitials\`. |`

20. `pages/ios/my-profile/SPEC.md`
   - :3 `0.4.0` → `0.4.1`.
   - :4-5 `> **Location:**` becomes:
```
> **Location:** pushed from `ProgramMyAccountSection` (the Program tab's My Account section, run 57) →
> "My Profile" `NavigationLink → MyProfileView()`, from the picker's `AccountMenuSheet` (Profile), and from the
> header initials circle on the Summary and Program tabs (0.4.1, D-PC1).
```
   - §3 :35-37 (the Reached via + Leaves to bullets) become:
```
- **App:** `ios`. **Reached via:** `ProgramMyAccountSection` → "My Profile"; the picker's `AccountMenuSheet` →
  Profile (`ProgramPickerView` `accountDestination`); the header initials circle on the Summary tab and both
  Program tab variants (0.4.1, admin-summary/admin-program D-PC1).
- **Leaves to:** back (nav back or the edge swipe) to the screen it was opened from, tab and program unchanged ·
  `LoginView` (after a successful **delete** → automatic `signOut()` flips the root). No forward-nav targets.
```
   - §11: `| 0.4.1 | 2026-10-13 | Reached-via grows (touch-up (c), admin-summary/admin-program D-PC1): the Summary / Program header circle, plus the picker's \`AccountMenuSheet\` (already true, now documented); back returns to the opener. No change to this screen. |`

21. `pages/android/summary/SPEC.md`
   - :3 `0.2.1` → `0.2.2`.
   - Insert this bullet immediately before the `- **Deviation A-1` bullet:
```
- **D-PC1 (0.2.2, touch-up (c)):** the header initials circle opens [`my-profile`](../my-profile/SPEC.md)
  (`Modifier.tapTarget(label = "My Profile", shape = CircleShape)` first in the chain; 52 dp, so the look is unchanged →
  `Routes.PROGRAM_PROFILE`). System back pops to Summary with its scroll and the active program intact. Parity: web
  `/summary`, iOS `SummaryHeader`.
```
   - Replace the 3-line A-2 bullet with:
```
- ~~**Deviation A-2 (header avatar = signed-in user):** the initials avatar shows the **logged-in user's**
  initials (`ProgramContext.memberName`), matching **web** ("the user's initials avatar"), not iOS's program
  admin initials — resolves the cross-app divergence toward web parity (memory `ios-matches-web-not-just-legacy`).~~
  *(No longer a deviation at 0.2.2 — iOS shows the signed-in user's initials too, `loggedInUserInitials`; D-PC1.)*
```
   - Changelog: `| 0.2.2 | 2026-10-13 | **D-PC1 — touch-up (c).** The header initials circle opens \`MyProfileScreen\` (\`tapTarget\` "My Profile", same look); system back returns to Summary. A-2 is no longer a deviation (iOS matches). |`

22. `pages/android/program/SPEC.md`
   - :3 `0.3.0` → `0.3.1`.
   - :12-13 become:
```
Header (both variants): **"Program"** + active-program name + the signed-in user's gradient initials avatar
(web-parity avatar, same as the Summary tab). **0.3.1:** tapping it opens [`my-profile`](../my-profile/SPEC.md) (D-PC1).
```
   - Insert this section immediately before `## Changelog`:
```
## Profile circle (0.3.1)

- **D-PC1 (touch-up (c)):** the header initials circle is `Modifier.tapTarget(label = "My Profile", shape =
  CircleShape)` (first in the chain; 52 dp, look unchanged) → `Routes.PROGRAM_PROFILE`. System back pops to the Program
  tab. The My Account profile row stays. Parity: web `/program`, iOS `AdminProgramTab`/`StandardProgramTab`.
```
   - Changelog: `| 0.3.1 | 2026-10-13 | **D-PC1 — touch-up (c).** The header initials circle opens \`MyProfileScreen\` (\`tapTarget\` "My Profile", same look); system back returns to Program. |`

23. `pages/android/my-profile/SPEC.md`
   - :3 `0.3.1` → `0.3.2`.
   - :5 `> **Location:**` becomes:
```
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.PROGRAM_PROFILE` (`MyProfileScreen`). Reached from the Program
> tab's profile row, the picker's account menu (`AccountMenuSheet`, root route) and — 0.3.2, summary/program D-PC1 —
> the Summary / Program header initials circle; back pops to the screen it was opened from.
```
   - Changelog: `| 0.3.2 | 2026-10-13 | Reached-via grows (touch-up (c), summary/program D-PC1): the Summary / Program header circle, plus the picker's account menu (already true, now documented). No change to this screen. |`

24. `pages/REGISTRY.md`: version cells, edited within the named row only.

   | Line | Row | Old | New |
   |---|---|---|---|
   | :22 | web `summary` | `🏗️ v0.4.3` | `🏗️ v0.4.4` |
   | :43 | web `program` | `🏗️ v0.3.0` | `🏗️ v0.3.1` |
   | :46 | web `program/profile` | `🏗️ v0.4.1` | `🏗️ v0.4.2` |
   | :69 | ios `admin-summary` | `🏗️ v0.2.3` | `🏗️ v0.2.4` |
   | :84 | ios `admin-program / standard-program` | `🏗️ v0.2.1` | `🏗️ v0.2.2` |
   | :90 | ios `my-profile` | `🏗️ v0.4.0` | `🏗️ v0.4.1` |
   | :125 | android `summary` | `🏗️ v0.2.1` | `🏗️ v0.2.2` |
   | :143 | android `program` | `🏗️ v0.3.0` | `🏗️ v0.3.1` |
   | :146 | android `my-profile` | `🏗️ v0.3.1` | `🏗️ v0.3.2` |

25. `initiatives/reliability-overhaul/HANDOFF.md`. Replace the 2-line `- (c) The top-right initials circle…` item with:
```
     - (c) 🟨 Built 2026-10-13, awaiting the user's check: the top-right initials circle on Summary + Program opens
       My Profile on all three surfaces, and Back returns to the screen it came from (D-PC1 in the page SPECs). Web is
       live after the deploy; the phones get it in iOS 1.5.2 (60) / Android 1.2.0 (7).
```

## Endgame

26. Compile-check per touched surface:
   - **web**:
     - Run `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web && npm run build && npm run lint`.
     - If the build fails in a file other than the two touched ones, report it and do not fix it (see the SEO risk below).
   - **android**:
     - Run `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android && ./gradlew :app:assembleDebug`.
     - On iCloud " 2" duplicate build files: delete the build dirs and rebuild.
   - **ios**:
     - Run `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/tools/ios-typecheck.sh` as a pre-check.
     - Then the USER presses ⌘B in Xcode. Never call `BuildProject`.
   - **Visual and live testing is the USER's** (no test suites, no staging; no migrations or auth involved). On each surface:
     - Tap the circle on Summary, then Back.
     - Tap the circle on Program as an admin, then Back.
     - Tap the circle on Program as a member (iOS `StandardProgramTab`; e.g. a testbed member login), then Back.
     - Confirm the same tab and the same program, the look unchanged, and on iOS the circle initials updating right after a rename in My Profile.
     - Web: check mobile and desktop widths.
   - Afterwards, clean `apps/web/.next` and the android build dirs, and report free disk space.
27. Migration: **none**. No backend change, no SQL, no env/flags.
28. git-version:
   - **No feature bump and no tag**: no `specs/features/**` SPEC or `reference_impl` path is touched.
   - Make 4 commits. Stage only the explicit paths in each, never `git add -A`:
     - `feat(web): Summary + Program initials circle opens My Profile (touch-up c)`: the 2 web files.
     - `feat(ios): Summary + Program initials circle opens My Profile; header initials = signed-in user (touch-up c)`: the 4 iOS files.
     - `feat(android): Summary + Program initials circle opens My Profile (touch-up c)`: the 2 android files.
     - `docs(pages): D-PC1 profile circle — 9 page SPEC patch bumps + REGISTRY + HANDOFF (c)`.
   - The page SPECs get PATCH bumps (provisional; assigned at landing if (a)/(d) land first and bump the same rows).
   - Web goes live through the usual deploy: check `vercel ls` after the push, and fall back to the CLI as described in the Risks section.

## Risks the implementer must watch

- **Uncommitted SEO work is in the tree.**
  - The files: `apps/web/src/app/layout.tsx` (modified) and the untracked `apps/web/src/app/{create-account,delete-account,forgot-password,login,privacy-policy,support}/layout.tsx` and `specs/initiatives/reliability-overhaul/plans/phase-4-seo.md`.
  - Never stage them. SEO is item (f), which comes last.
  - The CLI fallback `vercel --prod --yes --scope personal-vinayak` uploads the working tree, SEO edits included. Before that deploy, run `git stash push --include-untracked -m seo-wip -- apps/web/src/app/layout.tsx apps/web/src/app/create-account/layout.tsx apps/web/src/app/delete-account/layout.tsx apps/web/src/app/forgot-password/layout.tsx apps/web/src/app/login/layout.tsx apps/web/src/app/privacy-policy/layout.tsx apps/web/src/app/support/layout.tsx`. After the deploy, run `git stash pop`.
  - The local `npm run build` also compiles those files.
- **HANDOFF.md already carries uncommitted (b)✅/(f) lines** made by the orchestrator. Staging HANDOFF in the docs commit includes them. That is acceptable (orchestrator docs), but say so in the commit body. Touch-ups (a) and (d) may edit HANDOFF.md and REGISTRY.md too, so land the docs commits one after another, not in parallel.
- **iOS**:
  - Use `.buttonStyle(.plain)`, not the default style: the default would tint the label or flash the accent color.
  - Do not use List rows; both headers sit in ScrollViews, so the `.dismissKeyboardOnTap()` gotcha does not apply.
  - Do not touch `EdgeSwipeToReturn.swift` or `AdminHomeView.swift` (touch-up (d)).
  - The admin push lands on the picker's OUTER stack. That is intended: it is the same stack the Summary card NavigationLinks use, and AdminHomeView's `@State selectedTab` survives.
  - Add no header buttons; the existing circle is reused and nothing changes visually.
- **Android**:
  - `tapTarget` must be FIRST in the modifier chain, before `size`/`clip`/`background`; otherwise the ripple or touch area changes.
  - Do not add `launchSingleTop` (OQ2 = no, matching `ProgramAccountSection`).
  - `PROGRAM_PROFILE` is already in `SHELL_FORMS` (`RootScreen.kt:367`), so notification routing still won't navigate away from it.
- **Web**:
  - Keep the classes identical. `h-12 w-12` = 48 px, which meets the 44 px tap-target minimum.
  - Do not touch the `/programs` account fab or its modal.
  - `/program/profile` uses `useAuthGuard({ requireProgram: false })`, and its Hide-my-activity row self-gates on `PEOPLE_LIVE`. Nothing here depends on People.
- **Live-binary compat**: none. No backend or contract change; every live iOS/Android binary is unaffected.
- **Parity, with each platform-idiom difference called out**:
  - The control: web `<button>` with a pointer cursor; iOS plain `NavigationLink` with a press dim; Android `clickable` with a circular ripple.
  - Back: browser Back / `BackButton` on web; nav back or edge swipe on iOS; system back or predictive back on Android.
  - The destination and the return target are identical on all three.