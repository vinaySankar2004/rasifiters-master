# PLAN: Phase 4 touch-up (c). The top-right initials circle on Summary and Program opens My Profile, and Back returns to the screen it came from (web/iOS/Android)

**Brief accepted**: yes (19 files: 8 code files, 9 page SPECs, REGISTRY.md, HANDOFF.md)

**Feature/version prediction**: no feature bump.
- This is client navigation only. It touches no `reference_impl` path in `specs/features/registry.json`.
- The 9 page SPECs each get a PATCH bump, with no tags (`feature/*` tags are for features only).
- App versions do not change. iOS 1.5.2 (60) and Android 1.2.0 (7) are already in the repo.

**Surfaces in scope**: web, ios, android. Their file sets do not overlap, so the three can run in parallel. Docs come after the code, in one commit. Backend: none.

**Open questions, resolved:**
- **OQ1 = YES.** The iOS `SummaryHeader` callers switch from `adminInitials` to `loggedInUserInitials`.
  - At sign-in both hold the same name. Only `loggedInUserName` updates after a rename in My Profile, which is the screen this circle now opens.
  - Web and Android already show the new initials straight away.
  - `adminName` and `adminInitials` become unused. They are left in place tonight and noted in D-PC1.
- **OQ2 = NO.** No `launchSingleTop`. This matches the existing `ProgramAccountSection` profile row.
- **OQ3:** the SEO / "RaSi Fiters" spelling / Play Store search request stays HANDOFF item (f), done after store submission. It is not part of this plan.

**Trade-off (decided):** the circle opens My Profile directly. The picker's account-menu button stays unchanged on all three surfaces, because its menu holds rows reachable only there (Apple Health / Health Connect, Support, Sign Out). The Summary and Program circles do nothing today, so no access is lost.

**D-rule name (all surfaces)**: `D-PC1` ("profile circle"). The name is not used anywhere else in `specs/`.

**Cross-touch-up dependency (from the adversary's blocking objection 1):**
- The uncommitted touch-up (d) edit has a compile error at `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Components/EdgeSwipeToReturn.swift:83`: `let root =(recognizer.view?.window …`.
- (c) never edits that file. The **orchestrator has (d) correct that line to `let root = (recognizer.view?.window …`** before (c)'s iOS gate in step 26.
- The ⌘B for 1.5.2 (60) waits on that fix. See step 26 for the iOS rule.

## Steps — web (implementer W; files: `apps/web/src/app/summary/page.tsx`, `apps/web/src/app/program/page.tsx`)

1. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/summary/page.tsx:228`: replace the `SummaryHeader` call with the code below. `router` already exists at :56.
```tsx
        <SummaryHeader
          title="Summary"
          subtitle={program?.name ?? "Program"}
          initials={userInitials || "RF"}
          onOpenProfile={() => router.push("/program/profile")}
        />
```

2. Same file, `function SummaryHeader` (:400-422): replace the whole function with this:
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

3. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/app/program/page.tsx:133-135`: replace the circle `<div>…</div>` inside `<header>` with the code below.
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
   - The classes are identical to today's. Tailwind 3 preflight gives a `<button>` the pointer cursor.
   - Back needs no other change:
     - `PageHeader` → `BackButton` calls `router.back()` when history is longer than 1.
     - Browser Back is native.
     - The active program is in storage, so it stays the same.
     - The bottom nav is hidden on `/program/profile` (`shell.tsx:16`).

## Steps — ios (implementer I; files: `SummaryCards.swift`, `StandardProgramTab.swift`, `AdminSummaryTab.swift`, `AdminProgramTab.swift`, all under `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Features/Home/Tabs/`)

4. `SummaryCards.swift:25-38` (`SummaryHeader`, after `Spacer()` at :23): replace the `ZStack { … }` with the code below.
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
   - The header sits in a ScrollView, not a List, so the `.dismissKeyboardOnTap()` gotcha does not apply.
   - The pattern matches the existing link at `ProgramCards.swift:280-315`.

5. `AdminSummaryTab.swift:46`: change `initials: programContext.adminInitials` to `initials: programContext.loggedInUserInitials`.

6. `AdminProgramTab.swift:22`: change `initials: programContext.adminInitials` to `initials: programContext.loggedInUserInitials`.

7. `StandardProgramTab.swift:43-56` (inside the tab's own `NavigationStack`, after `Spacer()` at :42): replace the `ZStack { … }` with the code below. Keep the file's private `loggedInUserInitials` (:14-22) as it is.
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
   - Do NOT touch `EdgeSwipeToReturn.swift` or `AdminHomeView.swift`. They belong to touch-up (d).
   - Do NOT remove `adminName` / `adminInitials` from `ProgramContext.swift` or `ProgramContext+Auth.swift`. They are outside the brief and are left in place as unused code.

## Steps — android (implementer A; files: `ui/summary/SummaryScreen.kt`, `ui/program/ProgramScreen.kt` under `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/`)

8. `ui/summary/SummaryScreen.kt` imports: after `import com.app.rasifiters.ui.components.kit.FloatingBannerVariant` (:54), add this line.
```kotlin
import com.app.rasifiters.ui.components.tapTarget
```

9. `SummaryScreen.kt:72` (KDoc): delete this whole line. It stops being a deviation once step 5 lands.
```
 *  • Header avatar shows the signed-in user's initials (web parity) rather than the program admin's (iOS).
```

10. `SummaryScreen.kt:118`: replace the call with this.
```kotlin
                Header(
                    programName = program?.name ?: "",
                    initials = initialsOf(memberName),
                    onOpenProfile = { onNavigate(Routes.PROGRAM_PROFILE) },
                )
```

11. `SummaryScreen.kt:214-236`: replace `private fun Header` with this.
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

12. `ui/program/ProgramScreen.kt` imports: after `import com.app.rasifiters.ui.components.kit.rememberLoad` (:47), add this line.
```kotlin
import com.app.rasifiters.ui.components.tapTarget
```

13. `ProgramScreen.kt:108`: replace the call with this.
```kotlin
            Header(
                programName = program?.name ?: "",
                initials = initialsOf(memberName),
                onOpenProfile = { onNavigate(Routes.PROGRAM_PROFILE) },
            )
```

14. `ProgramScreen.kt:222-244`: replace `private fun Header` with the code below.
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
   - `PROGRAM_PROFILE` is an inner-NavHost route (`AppScaffold.kt:173-175`, `onBack = nav.popBackStack()`).
   - `BackHandler` is enabled only on the 4 tabs, so system back returns to the tab the user came from.
   - `rememberScrollState` is saveable, so the scroll position survives.

## Steps — docs (one pass after W, I and A land, by the orchestrator or one implementer; all files under `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/`)

The versions below are provisional. Each D-rule row goes directly after that SPEC's current last §9 row (anchor by the text, not the line number). Each changelog row goes first, directly under the `|---|` separator.

15. `pages/web/summary/SPEC.md`
   - :3: change `**Version:** 0.4.3` to `**Version:** 0.4.4`.
   - §3: after the `- **Leaves to:**` bullet (the one ending "…removed in the 2026-07-01 merge.)"), add:
     `- **Header circle (0.4.4, D-PC1):** the initials circle → \`/program/profile\`; Back returns here.`
   - §4: replace the Header row (:60) with:
     `| Header | "Summary" + active program name + the user's initials circle — a button (\`aria-label="My Profile"\`) that opens \`/program/profile\` (0.4.4, D-PC1). | summary/page.tsx (\`SummaryHeader\`) |`
   - §9: after the `| **D-REL4** |` row, add:
     `| **D-PC1** | **Touch-up (c) — the header circle opens My Profile (2026-10-13).** \`SummaryHeader\`'s initials circle (was a decorative \`<div>\`) is a \`<button type="button" aria-label="My Profile">\` with the same classes → \`router.push("/program/profile")\`. Back (\`BackButton\` → \`router.back()\`, or browser Back) returns to \`/summary\` with the active program intact. Parity: web \`/program\`, iOS \`SummaryHeader\`/\`StandardProgramTab\`, Android \`SummaryScreen\`/\`ProgramScreen\` (only Back is platform idiom). The \`/programs\` account button is unchanged — its menu holds rows reachable only there. | user, touch-up (c) (reliability HANDOFF) |`
   - §11: add `| 0.4.4 | 2026-10-13 | **D-PC1 — touch-up (c).** The header initials circle is a button (\`aria-label="My Profile"\`, same look) → \`/program/profile\`; Back returns to Summary. |`

16. `pages/web/program/SPEC.md`
   - :3: change `0.3.0` to `0.3.1`.
   - §3: after the `- **Leaves to**` bullet (the one ending "…have **all since been built** (F2)."), add:
     `- **Header circle (0.3.1, D-PC1):** the initials circle → \`/program/profile\`; Back returns here.`
   - §4: replace the Header row (:63) with:
     `| Header | "Program" + active program name + the user's initials circle — a button (\`aria-label="My Profile"\`) that opens \`/program/profile\` (0.3.1, D-PC1). | program/page.tsx (\`<header>\`) |`
   - §9: after the `| **D-NP1** |` row, add:
     `| **D-PC1** | **Touch-up (c) — the header circle opens My Profile (2026-10-13).** The header's initials circle (was a decorative \`<div>\`) is a \`<button type="button" aria-label="My Profile">\` with the same classes → \`router.push("/program/profile")\`; Back (\`router.back()\` / browser Back) returns to \`/program\`. Same as web summary D-PC1 and the iOS/Android Summary + Program headers. \`MyAccountSection\` keeps its profile row. | user, touch-up (c) (reliability HANDOFF) |`
   - §11: add `| 0.3.1 | 2026-10-13 | **D-PC1 — touch-up (c).** The header initials circle is a button (\`aria-label="My Profile"\`, same look) → \`/program/profile\`; Back returns to Program. |`

17. `pages/web/program/profile/SPEC.md`
   - :3: change `0.4.1` to `0.4.2`.
   - §3: replace the 2-line `- **Reached via:**` bullet with:
```
- **Reached via:** the [`program`](../SPEC.md) hub's "My Account" row, the `/programs` picker's "My Account" menu
  (Profile row), and the header initials circle on `/summary` and `/program` (0.4.2, summary/program D-PC1) — all
  `router.push("/program/profile")`.
```
   - §3: replace the `- **Leaves to:**` line with:
     `- **Leaves to:** Back (\`BackButton\` → \`router.back()\`, or browser Back) returns to the page it was opened from (\`/summary\`, \`/program\` or \`/programs\`); \`backHref\` is only the no-history fallback. \`/login\` after a successful account deletion.`
   - §11: add `| 0.4.2 | 2026-10-13 | Reached-via grows (touch-up (c), summary/program D-PC1): the Summary / Program header circle, plus the \`/programs\` account menu (already true, now documented); Back returns to the opener. No change to this page. |`

18. `pages/ios/admin-summary/SPEC.md` (this SPEC has no version line in its header)
   - §4: replace row :33 with:
     `| \`SummaryHeader\` (title · program name · signed-in user's initials circle → \`MyProfileView\`, D-PC1) | legacy \`AdminHomeHelpers.swift:53\` | \`SummaryCards.swift\` (\`SummaryHeader\`) |`
   - §5 :47: in the computeds list, replace `` `adminInitials` `` with `` `loggedInUserInitials` ``.
   - §9: after the `| **D-REL1** |` row, add:
     `| **D-PC1** | **Touch-up (c) — the header circle opens My Profile (2026-10-13).** \`SummaryHeader\` (shared by Summary and the admin Program tab) wraps its circle in \`NavigationLink { MyProfileView() }\` + \`.buttonStyle(.plain)\` + \`.contentShape(Circle())\` + \`.accessibilityLabel("My Profile")\` — same look. It pushes on the picker's outer stack, so nav back / the edge swipe pops to this tab with the selected tab and program intact. Initials now read \`loggedInUserInitials\` (was \`adminInitials\`: the same name at sign-in, never refreshed after a rename in My Profile) — web/Android parity; closes android/summary A-2. \`ProgramContext.adminInitials\`/\`adminName\` are now unused (left in place); a missing user name shows \`?\` (was "A" from the \`"Admin"\` default). The picker's account button is unchanged. | user, touch-up (c) (reliability HANDOFF) |`
   - §11: add this bullet above `- **v0.2.3**`:
     `- **v0.2.4** (2026-10-13, **D-PC1 — touch-up (c)**) — the \`SummaryHeader\` circle is a plain-style \`NavigationLink\` → \`MyProfileView\` (label "My Profile", same look) and shows \`loggedInUserInitials\` (was \`adminInitials\`, now unused).`

19. `pages/ios/admin-program/SPEC.md`
   - :3: change `0.2.1` to `0.2.2`.
   - §3: directly under `- **Leaves to:**`, insert this as the first sub-bullet:
     `  - \`MyProfileView()\` — also from the header initials circle, both variants (0.2.2, D-PC1).`
   - §4: replace the admin Header row (:68) with this. The anchor is a symbol, not lines:
     `| Header | \`SummaryHeader(title:"Program", subtitle:name, status:, initials:loggedInUserInitials)\`; the circle is a \`NavigationLink\` → \`MyProfileView()\` (0.2.2, D-PC1). | \`AdminProgramTab.swift\` (\`SummaryHeader\` call) |`
   - §4: replace the standard Header row (:79) with this. The anchor is a symbol, not lines:
     `| Header | Inline \`HStack\`: "Program" + program name + own initials avatar (orange gradient); the avatar is a \`NavigationLink\` → \`MyProfileView()\` on this tab's own stack (0.2.2, D-PC1). | \`StandardProgramTab.swift\` (header \`HStack\`) |`
   - §5 :97: replace `` `activeMembers`/`adminInitials`/`loggedInUserName` `` with `` `activeMembers`/`loggedInUserName` ``.
   - §9: after the `| **D-REL1** |` row, add:
     `| **D-PC1** | **Touch-up (c) — the header circle opens My Profile (2026-10-13).** Admin variant: via the shared \`SummaryHeader\` (admin-summary D-PC1), initials = \`loggedInUserInitials\`. Standard variant: the inline circle is wrapped the same way (\`NavigationLink { MyProfileView() }\`, \`.buttonStyle(.plain)\`, \`.contentShape(Circle())\`, label "My Profile") and pushes on the tab's own \`NavigationStack\`. Back / the edge swipe pops to the Program tab. \`ProgramMyAccountSection\` keeps its profile row. | user, touch-up (c) (reliability HANDOFF) |`
   - §11: add `| 0.2.2 | 2026-10-13 | **D-PC1 — touch-up (c).** The header circle (both variants) opens \`MyProfileView\` (plain \`NavigationLink\`, label "My Profile", same look); the admin variant shows \`loggedInUserInitials\`. |`

20. `pages/ios/my-profile/SPEC.md`
   - :3: change `0.4.0` to `0.4.1`.
   - :4-5: replace the `> **Location:**` block with:
```
> **Location:** pushed from `ProgramMyAccountSection` (the Program tab's My Account section, run 57) →
> "My Profile" `NavigationLink → MyProfileView()`, from the picker's `AccountMenuSheet` (Profile), and from the
> header initials circle on the Summary and Program tabs (0.4.1, D-PC1).
```
   - §3 :35-37: replace the Reached via and Leaves to bullets with:
```
- **App:** `ios`. **Reached via:** `ProgramMyAccountSection` → "My Profile"; the picker's `AccountMenuSheet` →
  Profile (`ProgramPickerView` `accountDestination`); the header initials circle on the Summary tab and both
  Program tab variants (0.4.1, admin-summary/admin-program D-PC1).
- **Leaves to:** back (nav back or the edge swipe) to the screen it was opened from, tab and program unchanged ·
  `LoginView` (after a successful **delete** → automatic `signOut()` flips the root). No forward-nav targets.
```
   - §11: add `| 0.4.1 | 2026-10-13 | Reached-via grows (touch-up (c), admin-summary/admin-program D-PC1): the Summary / Program header circle, plus the picker's \`AccountMenuSheet\` (already true, now documented); back returns to the opener. No change to this screen. |`

21. `pages/android/summary/SPEC.md`
   - :3: change `0.2.1` to `0.2.2`.
   - Insert this bullet directly before the `- **Deviation A-1` bullet:
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
   - Changelog: add `| 0.2.2 | 2026-10-13 | **D-PC1 — touch-up (c).** The header initials circle opens \`MyProfileScreen\` (\`tapTarget\` "My Profile", same look); system back returns to Summary. A-2 is no longer a deviation (iOS matches). |`

22. `pages/android/program/SPEC.md`
   - :3: change `0.3.0` to `0.3.1`.
   - :12-13: replace with:
```
Header (both variants): **"Program"** + active-program name + the signed-in user's gradient initials avatar
(web-parity avatar, same as the Summary tab). **0.3.1:** tapping it opens [`my-profile`](../my-profile/SPEC.md) (D-PC1).
```
   - Insert this section directly before `## Changelog`:
```
## Profile circle (0.3.1)

- **D-PC1 (touch-up (c)):** the header initials circle is `Modifier.tapTarget(label = "My Profile", shape =
  CircleShape)` (first in the chain; 52 dp, look unchanged) → `Routes.PROGRAM_PROFILE`. System back pops to the Program
  tab. The My Account profile row stays. Parity: web `/program`, iOS `AdminProgramTab`/`StandardProgramTab`.
```
   - Changelog: add `| 0.3.1 | 2026-10-13 | **D-PC1 — touch-up (c).** The header initials circle opens \`MyProfileScreen\` (\`tapTarget\` "My Profile", same look); system back returns to Program. |`

23. `pages/android/my-profile/SPEC.md`
   - :3: change `0.3.1` to `0.3.2`.
   - :5: replace the `> **Location:**` line with:
```
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.PROGRAM_PROFILE` (`MyProfileScreen`). Reached from the Program
> tab's profile row, the picker's account menu (`AccountMenuSheet`, root route) and — 0.3.2, summary/program D-PC1 —
> the Summary / Program header initials circle; back pops to the screen it was opened from.
```
   - Changelog: add `| 0.3.2 | 2026-10-13 | Reached-via grows (touch-up (c), summary/program D-PC1): the Summary / Program header circle, plus the picker's account menu (already true, now documented). No change to this screen. |`

24. `pages/REGISTRY.md`: update the version cell in each named row only.

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

25. `initiatives/reliability-overhaul/HANDOFF.md` (:79-80): replace the 2-line `- (c) The top-right initials circle…` item with:
```
     - (c) 🟨 Built 2026-10-13, awaiting the user's check: the top-right initials circle on Summary + Program opens
       My Profile on all three surfaces, and Back returns to the screen it came from (D-PC1 in the page SPECs). Web is
       live after the deploy; the phones get it in iOS 1.5.2 (60) / Android 1.2.0 (7). iOS ⌘B needs (d)'s
       `EdgeSwipeToReturn.swift:83` spacing fix first.
```

## Endgame

26. Compile-check each touched surface.
   - **web**:
     - Run `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web && npm run build && npm run lint`.
     - If an error is in a file other than the 2 touched files, report it to the orchestrator and do not fix it. The uncommitted SEO work-in-progress is compiled too.
   - **android**:
     - Run `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android && ./gradlew :app:assembleDebug`.
     - If iCloud " 2" duplicate build files appear, delete the build dirs and rebuild.
   - **ios**, in this order:
     1. Syntax gate for (c)'s own files. Run `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios && xcrun swiftc -parse RaSi-Fiters-App/Features/Home/Tabs/SummaryCards.swift RaSi-Fiters-App/Features/Home/Tabs/StandardProgramTab.swift RaSi-Fiters-App/Features/Home/Tabs/AdminSummaryTab.swift RaSi-Fiters-App/Features/Home/Tabs/AdminProgramTab.swift`. It must exit 0. This check does not depend on (d).
     2. Precondition, owned by the orchestrator / touch-up (d): `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Components/EdgeSwipeToReturn.swift:83` must read `let root = (recognizer.view?.window ?? UIApplication.shared.keyWindowRoot)?.rootViewController,`, with a space after `=`.
        - Implementer I never edits that file.
        - If line 83 still reads `let root =(`, I reports "iOS gate BLOCKED on (d): EdgeSwipeToReturn.swift:83 spacing" to the orchestrator and stops. Do not wait in a loop and do not fix it.
     3. Once the precondition holds, run `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/tools/ios-typecheck.sh`.
        - I fixes only errors in its 4 files.
        - Any error in another file is reported to the orchestrator and not fixed. This is the same rule as on web.
     4. Then the USER presses ⌘B in Xcode. Never call `BuildProject`.
        - The ⌘B for 1.5.2 (60) covers (c), (d) and (e) together, so it waits on step 2.
   - **Visual and live testing is the USER's.** There are no test suites. Staging is not used: no migration or auth change is involved. On each surface:
     - Tap the circle on Summary, then go Back.
     - Tap the circle on Program as an admin, then go Back.
     - Tap the circle on Program as a member (iOS `StandardProgramTab`, e.g. a testbed member login), then go Back.
     - Each time, confirm the same tab and program come back and the circle looks unchanged.
     - On iOS, rename yourself in My Profile and check that the circle initials update right away.
     - On web, check both mobile and desktop widths.
   - Afterwards, delete `apps/web/.next` and the Android build dirs, and report the free disk space.
27. Migration: **none**. No backend change, no SQL, no env vars or flags.
28. git-version:
   - **No feature bump and no tag.** No `specs/features/**` SPEC and no `reference_impl` path is touched.
   - Make 4 commits. Stage only the explicit paths in each, never `git add -A`.
     - `feat(web): Summary + Program initials circle opens My Profile (touch-up c)`: the 2 web files.
     - `feat(ios): Summary + Program initials circle opens My Profile; header initials = signed-in user (touch-up c)`: the 4 iOS files. Do NOT stage `EdgeSwipeToReturn.swift`, which goes in (d)'s commit.
     - `feat(android): Summary + Program initials circle opens My Profile (touch-up c)`: the 2 Android files.
     - `docs(pages): D-PC1 profile circle — 9 page SPEC patch bumps + REGISTRY + HANDOFF (c)`.
   - The page-SPEC versions are PATCH bumps and provisional. They are assigned at landing if (a) or (d) lands first and bumps the same rows.
   - Web goes live through the usual deploy. Check `vercel ls` after the push, and use the CLI fallback with the stash described in the risks below.

## Risks the implementer must watch

- **Touch-up (d)'s uncommitted `EdgeSwipeToReturn.swift` edit is in the tree and does not compile at :83.**
  - It is (d)'s file. (c) never edits or stages it, and (c)'s iOS full typecheck and ⌘B are gated on (d)'s fix (step 26).
  - The edge-swipe Back test from My Profile also needs that fix in place.
- **Uncommitted SEO work is in the tree.**
  - Files: `apps/web/src/app/layout.tsx` (modified), the untracked `apps/web/src/app/{create-account,delete-account,forgot-password,login,privacy-policy,support}/layout.tsx`, and `specs/initiatives/reliability-overhaul/plans/phase-4-seo.md`.
  - Never stage these files. SEO is item (f) and comes last.
  - The CLI fallback deploy `vercel --prod --yes --scope personal-vinayak` uploads the working tree, so it would ship the SEO edits. Before it, run:
    `git stash push --include-untracked -m seo-wip -- apps/web/src/app/layout.tsx apps/web/src/app/create-account/layout.tsx apps/web/src/app/delete-account/layout.tsx apps/web/src/app/forgot-password/layout.tsx apps/web/src/app/login/layout.tsx apps/web/src/app/privacy-policy/layout.tsx apps/web/src/app/support/layout.tsx`
  - After the deploy, run `git stash pop`.
- **`HANDOFF.md` already has uncommitted (b)✅ and (f) lines** written by the orchestrator.
  - Staging HANDOFF in the docs commit includes them. That is fine, but say so in the commit body.
  - (a) and (d) may also edit HANDOFF.md and REGISTRY.md, so land the docs commits one after another, not in parallel.
- **iOS**:
  - Use `.buttonStyle(.plain)`, not the default style, which would tint the label or flash the accent color.
  - Both headers sit in ScrollViews, not Lists, so the `.dismissKeyboardOnTap()` gotcha does not apply.
  - The admin variant pushes on the picker's OUTER stack. That is intended: it is the same stack the Summary cards' NavigationLinks use, and `AdminHomeView`'s `@State selectedTab` survives the push.
  - Add no header buttons. The existing circle is reused and nothing changes visually.
  - Leave `adminName` and `adminInitials` in place. Removing them is out of scope; they are noted as unused in admin-summary D-PC1.
- **Android**:
  - `tapTarget` must come FIRST in the modifier chain, before `size`, `clip` and `background`. Otherwise the ripple or the touch area changes.
  - Do not add `launchSingleTop` (OQ2).
  - `PROGRAM_PROFILE` is already in `SHELL_FORMS` (`RootScreen.kt:367`), so notification routing will not navigate away from it.
- **Web**:
  - Keep the classes identical. `h-12 w-12` is 48 px, above the 44 px tap-target minimum.
  - Do not touch the `/programs` account button or its modal.
  - `/program/profile` uses `useAuthGuard({ requireProgram: false })`, and its Hide-my-activity row gates itself on `PEOPLE_LIVE`. Nothing here depends on People.
- **Live binaries**: unaffected. There is no backend or contract change.
- **Parity, with each platform-idiom difference called out**:
  - The tappable circle differs by platform:
    - Web: a `<button>` with a pointer cursor.
    - iOS: a plain `NavigationLink` that dims on press.
    - Android: a `tapTarget` with a circular ripple.
  - Back differs by platform:
    - Web: browser Back or `BackButton`.
    - iOS: nav back or the edge swipe.
    - Android: system back or predictive back.
  - The destination and the screen Back returns to are identical on all three.