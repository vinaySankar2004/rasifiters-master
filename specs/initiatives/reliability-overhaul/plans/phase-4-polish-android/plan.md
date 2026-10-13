# PLAN: Phase 4 Track P, Android polish (#9 #10 #12 #15 #16 #17 #18 #20 #21 #24 #25 #26 #27 #29 #31 #33 #34 #35 #36 #40 #42 #44 #45), revision 2

**Brief accepted:** yes. 46 files: 3 new, 42 modified Kotlin files, 1 build file. All are inside the brief's list.

**Feature/version prediction:**
- This track lands as ONE `feat(android)` commit with no version bump.
- The orchestrator's single Track P docs commit then bumps frontend-kit v0.4.0 → v0.5.0. That is MINOR: new adoption D-rules on top of the quick-wins 0.4.0. The feature and page SPECs are listed under "Docs for the orchestrator".
- No app version bump. Android stays 1.1.0 / versionCode 6.

**Surfaces in scope:** [android] only. Web, iOS and backend run in parallel tracks with disjoint files. Backend: none.

**What changed since revision 1 (one line per adversary item):**
1. **BLOCKING:** `loadAllProgramWorkouts` and `loadMembershipDetails` now write only while the same program and session are active. `afterWorkoutWrite` applies its local change only for the program the write was made in (4(o), 4(s)).
2. Distribution detail now shows "—" when the data is missing (step 31). `WorkoutTypesDetailScreen` was checked and that state can't be reached, so nothing is planned for it ("Already fixed / not reachable").
3. The BOM bump is now a **user approval item**, backed by the official doc. It runs **first** as a compile spike (step 0), and a fallback is fully written out (F35).
4. #10: the spinner gate is now derived in composition: it is reset in the same frame as the pick and keyed by program. A logger's switch spins only the Recent/Health cards (step 24).
5. MemberMetrics detail gets the stale-banner clearance (step 37).
6. Steps 5, 33, 36 and 37 are now complete copy-paste code. Step 37's imports no longer contradict each other.
7. `ProgramContext.kt`, `ApiService.kt` and `Dtos.kt` are marked SHARED (Risks).
8. `InviteMemberScreen`'s username field gets `autoCorrect = false` (step 23).
9. The page-SPEC table now includes summary, summary-workout-types-detail, members (#26 chart gesture) and every screen whose back target grows (#36).
10. Edge cases:
    - (a) Lifestyle View-as now defaults to `loggedInMemberId` without a roster lookup.
    - (b) WorkoutTypes empty copy now depends on the query.
    - (c) The failed and empty states on WorkoutTypes can be pulled to refresh.

## Decisions taken (each with a one-line why)

| Q | Decision | Why |
|---|---|---|
| OQ1 #35 BOM | **USER APPROVAL ITEM (recommended: approve).** Bump `composeBom` `2024.12.01` → `2025.04.01` (Compose UI 1.8, M3 1.3.2). It runs as step 0, a compile spike before anything else. If the user declines, apply **F35**. | The official guide (developer.android.com/develop/ui/compose/text/autofill) shows `ContentType` semantics on the **value-based** `TextField(value=…, onValueChange=…)` and says autofill "supports BasicTextField and all Material text fields that build on that component". `AppTextField` is a value-based `BasicTextField`, so fill and save do apply. The alternative is a deprecated, fill-only API. |
| OQ2 #26 | The chart scrub in `ChartPrimitives.kt` becomes **horizontal-only drag**. Tap-to-select is unchanged. | It is the only way a vertical drag over a 320–360dp chart can scroll the page. |
| OQ3 #33 roster | Build the roster load / empty / pull-to-refresh states **here**. People S4 must keep them. | The file is in this brief, and S4 rewrites the list contents, not the load plumbing. |
| OQ4 #10 Members | ProgramContext clears the program-scoped flows on a program switch and the per-member flows on a View-as change. The screens gate on a "loaded-for" key derived in composition. S5 must keep both. | Never shows the wrong member's numbers, not even for one frame. The clear also covers a partially failed reload. |
| OQ5 #45 copy | `Sync workouts, sleep and steps`. iOS converges to the same string. | Android syncs all three. |
| OQ6 #18+#44 | The PUT sends `gender` only when the profile read has loaded **or** the user touched the picker (`includeGender = memberLoaded \|\| genderTouched`). | A failed read can never wipe a saved gender, and name edits still save. |

**Anchors:** the tree is still moving. Every anchor is "≈line + quoted text". Match on the quoted text, never on the line number alone.

---

## Steps: android (prefix `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/`)

### 0. Compile spike (run FIRST, only if OQ1 is approved)

**0.** In `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/gradle/libs.versions.toml`, change `composeBom = "2024.12.01"` to `composeBom = "2025.04.01"`. Change nothing else.

Then run `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android && ./gradlew :app:assembleDebug` on the **unchanged** sources.
- If it fails in a file **outside** this brief (most likely `ui/program/NotificationsScreen.kt` `LocalLifecycleOwner`, which N5 owns): STOP and report to the orchestrator. Do not edit that file.
- If it is green: continue with steps 1–45.

**F35 fallback** (user declines the bump): skip step 0 and apply steps 9, 11, 12, 14, 15 and 16 with these removals:
- Drop the `contentType` parameter, the `autofillHint` line and `.then(autofillHint)` from step 9.
- Drop every `contentType = ContentType.…` argument.
- Drop every `val autofill = LocalAutofillManager.current` and every `.onSuccess { autofill?.commit() }`. Keep the plain `.onFailure { … }`.
- Drop the imports `androidx.compose.ui.autofill.ContentType`, `androidx.compose.ui.semantics.contentType` and `androidx.compose.ui.platform.LocalAutofillManager`.
- Keep `autoCorrect`, the keyboard types, `newPassword` (it then only documents intent) and the real password field for "confirm".

### A. New shared helpers

**1. NEW `ui/components/kit/KitLoad.kt`.** This is the one #29 helper, reused by #16 #18 #27 #31 #33 #34. Full file:

```kotlin
package com.app.rasifiters.ui.components.kit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.KitCopy
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.failing
import com.app.rasifiters.core.kit.refreshing
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.rfPalette
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

// Polish #29 (Phase 4 Track P): the ONE Android helper that puts a screen, section or detail on the kit's five states —
// the Summary recipe (SummaryScreen) packaged once. Reused by #16 #18 #27 #31 #33 #34.

/** Bottom room a list keeps while its own "Couldn't refresh" banner shows (12 + 52 + 12 banner block + 8 gap). */
val STALE_BANNER_CLEARANCE: Dp = 84.dp

/** True when the state carries data (Loaded or Stale): a section shows its value, otherwise "—". */
val UiState<*>.hasData: Boolean get() = this is UiState.Loaded || this is UiState.Stale

/** The screen's own stale banner shows (the app-wide offline banner wins — A6). */
fun UiState<*>.showsStaleBanner(online: Boolean): Boolean = online && this is UiState.Stale

/** First state of a load whose data lives in a ProgramContext flow: data already on screen → Loaded (it refreshes
 *  underneath, no flash); otherwise Loading. */
fun initialLoadState(hasData: Boolean): UiState<Unit> = if (hasData) UiState.fresh(Unit) else UiState.Loading

/** A screen-local load on the kit states (frontend-kit §5). A reload keeps its data (W7-D2: a failed reload → Stale);
 *  [reload] cancels a load in flight. Create it with [rememberLoad]. */
@Stable
class LoadHandle<T> internal constructor(
    initial: UiState<T>,
    private val scope: CoroutineScope,
    private val load: suspend () -> Result<T>,
) {
    var state: UiState<T> by mutableStateOf(initial)
        private set
    private var job: Job? = null

    /** Start (or restart) the load now. A cancelled load stays silent (toAppError rethrows cancellation). */
    fun reload() {
        job?.cancel()
        job = scope.launch {
            state = state.refreshing()
            load().onSuccess { state = UiState.fresh(it) }.onFailure { state = state.failing(it.toAppError()) }
        }
    }

    /** Pull-to-refresh: reload and wait for it. */
    suspend fun refresh() {
        reload()
        job?.join()
    }

    internal fun cancel() { job?.cancel() }
}

/**
 * One keyed screen-local load. A new [key] (put EVERY input of [load] in it) starts a fresh handle from [initial] —
 * never the previous key's data (#34: no old period's bars under the new label) — and loads at once. Back online, a
 * Failed / Stale load retries by itself (D-KIT-13). [enabled] = false never loads (state Idle).
 */
@Composable
fun <T> rememberLoad(
    key: Any?,
    isOnline: StateFlow<Boolean>,
    enabled: Boolean = true,
    initial: () -> UiState<T> = { UiState.Loading },
    load: suspend () -> Result<T>,
): LoadHandle<T> {
    val scope = rememberCoroutineScope()
    val latestLoad by rememberUpdatedState(load)
    val handle = remember(key, enabled) {
        LoadHandle(if (enabled) initial() else UiState.Idle, scope) { latestLoad() }
    }
    DisposableEffect(handle) {
        if (enabled) handle.reload()
        onDispose { handle.cancel() }
    }
    RefetchOnReconnect(
        isOnline,
        needsReload = { enabled && (handle.state is UiState.Failed || handle.state is UiState.Stale) },
    ) { handle.reload() }
    return handle
}

/** D-KIT-13: back online → [reload] when [needsReload] (a Failed / Stale state). */
@Composable
fun RefetchOnReconnect(isOnline: StateFlow<Boolean>, needsReload: () -> Boolean, reload: () -> Unit) {
    val latestNeeds by rememberUpdatedState(needsReload)
    val latestReload by rememberUpdatedState(reload)
    LaunchedEffect(isOnline) {
        isOnline.drop(1).filter { it }.collect { if (latestNeeds()) latestReload() }
    }
}

/**
 * Renders one kit state (the Summary recipe). Data → [content] (emitted into the caller's layout). No data while offline
 * → the offline ErrorView (polish-1 rule 6, never a spinner). Failed → ErrorView + Retry. Otherwise a spinner, or
 * [loading] when given (e.g. skeleton rows). [boxModifier] sizes the spinner / error box (e.g. a chart's height).
 */
@Composable
fun <T> KitLoad(
    state: UiState<T>,
    online: Boolean,
    onRetry: () -> Unit,
    boxModifier: Modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
    spinnerColor: Color = AppOrange,
    loading: (@Composable () -> Unit)? = null,
    content: @Composable (T) -> Unit,
) {
    when (state) {
        is UiState.Loaded -> content(state.data)
        is UiState.Stale -> content(state.data)
        is UiState.Failed -> Box(boxModifier, contentAlignment = Alignment.Center) {
            ErrorView(if (online) state.error else AppError(AppErrorKind.OFFLINE), onRetry = onRetry)
        }
        else -> if (!online) {
            Box(boxModifier, contentAlignment = Alignment.Center) { ErrorView(AppError(AppErrorKind.OFFLINE), onRetry = onRetry) }
        } else if (loading != null) {
            loading()
        } else {
            Box(boxModifier, contentAlignment = Alignment.Center) { CircularProgressIndicator(color = spinnerColor) }
        }
    }
}

/** The compact "Couldn't load · Retry" row for a section or a form lookup: the ErrorView copy on one line, with Retry
 *  when retryable. Shows the offline copy while offline (polish-1 rule 6). */
@Composable
fun InlineLoadError(error: AppError, online: Boolean, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    val shown = if (online) error else AppError(AppErrorKind.OFFLINE)
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(KitCopy.ERROR_VIEW_TITLE, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(shown.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (shown.retryable) {
            TextButton(onClick = onRetry) { Text(KitCopy.RETRY, color = rfPalette().accent, fontWeight = FontWeight.SemiBold) }
        }
    }
}

/** The screen's own "Couldn't refresh · Retry" (frontend-kit §6) for a Stale load — hidden while offline (A6). Place
 *  inside the screen's root Box. */
@Composable
fun BoxScope.KitStaleBanner(state: UiState<*>, online: Boolean, onRetry: () -> Unit) {
    if (state.showsStaleBanner(online)) {
        FloatingBanner(FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter), onRetry = onRetry)
    }
}
```

**2. NEW `ui/components/TapTarget.kt`.** This is the one #36 helper. Full file:

```kotlin
package com.app.rasifiters.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics

/*
 * Polish #36 — the ONE way to give a small control the M3 48dp minimum (frontend-kit D-KIT-8; platform idiom: Android
 * 48dp, web/iOS 44pt) plus a screen-reader label / role / selected state.
 * Order rule:
 *  • tapTarget goes FIRST in the chain (before size / background) — the M3 IconButton order: it reserves 48dp around what
 *    follows, so a 22dp icon or a 36dp pill keeps its look but gets a 48dp touch. [shape] clips the ripple to the control.
 *    Pass contentDescription = null on the inner Icon (the label is set here).
 *  • selectableTarget / toggleTarget go AFTER a segment's clip + background: the visible segment itself becomes ≥ 48dp.
 */
fun Modifier.tapTarget(
    label: String,
    role: Role = Role.Button,
    enabled: Boolean = true,
    shape: Shape? = null,
    onClick: () -> Unit,
): Modifier = this
    .minimumInteractiveComponentSize()
    .then(if (shape != null) Modifier.clip(shape) else Modifier)
    .clickable(enabled = enabled, onClickLabel = label, role = role, onClick = onClick)
    .semantics { contentDescription = label }

/** A segment / chip / list choice: selectable with its selected state announced, + the 48dp minimum. [label] replaces a
 *  terse visible text for screen readers (e.g. "Week" for "W"). */
fun Modifier.selectableTarget(
    selected: Boolean,
    role: Role = Role.Tab,
    enabled: Boolean = true,
    label: String? = null,
    onClick: () -> Unit,
): Modifier = this
    .selectable(selected = selected, enabled = enabled, role = role, onClick = onClick)
    .then(if (label != null) Modifier.semantics { contentDescription = label } else Modifier)
    .minimumInteractiveComponentSize()

/** A row that switches something on / off (checked state announced), + the 48dp minimum. */
fun Modifier.toggleTarget(
    checked: Boolean,
    role: Role = Role.Checkbox,
    enabled: Boolean = true,
    onToggle: (Boolean) -> Unit,
): Modifier = this
    .toggleable(value = checked, enabled = enabled, role = role, onValueChange = onToggle)
    .minimumInteractiveComponentSize()
```

**3. NEW `core/LifestyleData.kt`** (#31). Full file:

```kotlin
package com.app.rasifiters.core

import com.app.rasifiters.net.HealthTimelineResponse
import com.app.rasifiters.net.StepsStatsDTO
import com.app.rasifiters.net.WorkoutTypeDTO
import com.app.rasifiters.net.WorkoutTypeHighestParticipationDTO
import com.app.rasifiters.net.WorkoutTypeLongestDurationDTO
import com.app.rasifiters.net.WorkoutTypeMostPopularDTO

/**
 * The Lifestyle tab's analytics for one (program, "View as") scope, loaded by [ProgramContext.loadLifestyle]. Polish #31:
 * a part is null when its read failed with no previous value. The card then shows "—", never a fake 0 / "N/A" /
 * "No data" (those stay for genuinely empty loaded data).
 */
data class LifestyleData(
    val totalTypes: Int? = null,
    val mostPopular: WorkoutTypeMostPopularDTO? = null,
    val longestDuration: WorkoutTypeLongestDurationDTO? = null,
    val highestParticipation: WorkoutTypeHighestParticipationDTO? = null,
    val workoutTypes: List<WorkoutTypeDTO>? = null,
    val timeline: HealthTimelineResponse? = null,
    val steps: StepsStatsDTO? = null,
)

/** The 7 Lifestyle reads, each its own result — the `SummaryParts` pattern (A13 partial failures). */
internal class LifestyleParts(
    private val total: Result<Int>,
    private val mostPopular: Result<WorkoutTypeMostPopularDTO>,
    private val longest: Result<WorkoutTypeLongestDurationDTO>,
    private val participation: Result<WorkoutTypeHighestParticipationDTO>,
    private val types: Result<List<WorkoutTypeDTO>>,
    private val timeline: Result<HealthTimelineResponse>,
    private val steps: Result<StepsStatsDTO>,
) {
    fun errors(): List<Throwable> =
        listOf(total, mostPopular, longest, participation, types, timeline, steps).mapNotNull { it.exceptionOrNull() }

    /** Loaded parts win; a failed part keeps [prev] (this scope's previous value) when there is one, else stays null. */
    fun merge(prev: LifestyleData?) = LifestyleData(
        totalTypes = total.getOrElse { prev?.totalTypes },
        mostPopular = mostPopular.getOrElse { prev?.mostPopular },
        longestDuration = longest.getOrElse { prev?.longestDuration },
        highestParticipation = participation.getOrElse { prev?.highestParticipation },
        workoutTypes = types.getOrElse { prev?.workoutTypes },
        timeline = timeline.getOrElse { prev?.timeline },
        steps = steps.getOrElse { prev?.steps },
    )

    companion object { const val COUNT = 7 }
}
```

### B. Core / net / app

**4. `core/ProgramContext.kt`.** SHARED with N5 and S4; see Risks.

**(a) Imports:**
- Add `import com.app.rasifiters.net.MemberMetricsResponse`.
- Delete these imports, which are now unused: `com.app.rasifiters.net.UpdateMemberProfileRequest`, `StepsStatsDTO`, `WorkoutTypeHighestParticipationDTO`, `WorkoutTypeLongestDurationDTO`, `WorkoutTypeMostPopularDTO`. Each one's only other use was the moved `LifestyleData`.
- Keep `HealthTimelineResponse` and `WorkoutTypeDTO`.

**(b) #21.** Directly after `val pendingSocial: StateFlow<PendingSocial?> = _pendingSocial.asStateFlow()` (≈:273) add:

```kotlin
    /** Polish #21: leaving the sign-up wizard (Back from its first page, or "Sign in") drops an abandoned Google sign-up,
     *  so it can't stick until the app restarts. */
    fun clearPendingSocial() { _pendingSocial.value = null }
```

**(c) #12.** Replace the whole `createProgram` (≈:478-488, KDoc "POST /programs — create a program …" + body containing `loadPrograms().getOrThrow()`) with:

```kotlin
    /** POST /programs — create a program (creator becomes its admin). Polish #12: success is the write alone; the list
     *  refreshes in the background, so a failed refresh can never make a retry create a duplicate. */
    suspend fun createProgram(
        name: String,
        status: String,
        startDate: String?,
        endDate: String?,
    ): Result<Unit> = runCatching {
        api.createProgram(CreateProgramRequest(name.trim(), status, startDate, endDate))
        Unit
    }.recoverCatching { throw it.asApiError() }
        .onSuccess { scope.launch { loadPrograms() } }
```

**(d) #12.** Replace `cancelJoinRequest` (≈:539-544, KDoc "A "requested" card's Cancel Request …") with:

```kotlin
    /** A "requested" card's Cancel Request — unchanged PUT /program-memberships (status removed). Polish #12: success is
     *  the write alone — the card drops at once, then the list refreshes in the background. */
    suspend fun cancelJoinRequest(programId: String): Result<Unit> = runCatching {
        val memberId = session.memberId ?: error("Missing member id.")
        api.updateMembership(MembershipUpdateRequest(programId, memberId, "removed"))
        Unit
    }.recoverCatching { throw AppErrorException(it.toAppError()) }
        .onSuccess {
            setPrograms(_programs.value.filterNot { it.id == programId })
            scope.launch { loadPrograms() }
        }
```

**(e) #10.** Replace the whole `selectProgram` (≈:546-556, the function containing `membersSelfLoadedFor = null` / `membersLoadedFor = null` / `_membersViewAsId.value = null`) with:

```kotlin
    /** Pick a program → hydrate the active-program state the shell reads. Polish #5/#10: a different program clears every
     *  program-scoped flow first, so no tab ever shows the previous program's numbers under the new name. */
    fun selectProgram(program: ProgramDTO) {
        if (program.id != _activeProgram.value?.id) resetProgramScope()
        _activeProgram.value = program
    }
```

**(f) #10.** Replace `/** Persist the tab's "View as" pick (null = "None", global-admin only). */` and `fun setMembersViewAs(id: String?) { _membersViewAsId.value = id }` (≈:990-991) with:

```kotlin
    /** Persist the tab's "View as" pick (null = "None", global-admin only). Polish #10: a different member clears the cards
     *  it re-scopes — all five for the admin body, Recent + Health only for a logger's logs-only pick ([logsOnly]) — so a
     *  read that fails for the new member can never leave the previous member's numbers under the new name. */
    fun setMembersViewAs(id: String?, logsOnly: Boolean = false) {
        if (id == _membersViewAsId.value) return
        _membersViewAsId.value = id
        _memberRecent.value = emptyList()
        _memberHealthLogs.value = emptyList()
        if (!logsOnly) {
            _selectedMemberOverview.value = null
            _memberHistory.value = null
            _memberStreaks.value = null
        }
    }
```

**(g) #33.** Replace `ensureMembersLoaded` with its KDoc (≈:993-1007) with:

```kotlin
    /**
     * Load the roster + set the default View-as ONCE per active program (global-admin → "None"; everyone else → self).
     * Idempotent unless [force]: re-entering the tab is a no-op, so the prior selection is preserved. [force] (the Program
     * tab, polish #33) re-reads the roster but never re-defaults the pick. A program switch mid-load drops the result.
     */
    suspend fun ensureMembersLoaded(force: Boolean = false): Result<Unit> {
        val pid = _activeProgram.value?.id ?: return Result.success(Unit)
        if (!force && membersLoadedFor == pid) return Result.success(Unit)
        return runCatching {
            val list = api.getProgramMembers(pid)
            if (_activeProgram.value?.id != pid) return@runCatching
            val firstForProgram = membersLoadedFor != pid
            _members.value = list
            membersLoadedFor = pid
            if (firstForProgram) {
                _membersViewAsId.value = if (isGlobalAdmin) null else list.firstOrNull { it.id == loggedInMemberId }?.id
            }
        }.recoverCatching { throw it.asApiError() }
    }
```

**(h) #34.** Replace `loadMemberMetrics` (≈:1009-1031) with:

```kotlin
    /** GET /member-metrics — the full leaderboard (server search/sort/filter). [publish] = false for the metrics detail
     *  (polish #34): it keeps its own page, so the Members-tab preview never re-sorts under it. */
    suspend fun loadMemberMetrics(
        search: String = "",
        sort: String = "workouts",
        direction: String = "desc",
        filterParams: Map<String, String> = emptyMap(),
        publish: Boolean = true,
    ): Result<MemberMetricsResponse> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        val params = buildMap {
            put("programId", pid)
            if (search.isNotBlank()) put("search", search.trim())
            put("sort", sort)
            put("direction", direction)
            putAll(filterParams)
        }
        return runCatching {
            val resp = api.getMemberMetrics(params)
            if (publish) {
                _memberMetrics.value = resp.members
                _memberMetricsTotal.value = resp.total
                _memberMetricsRange.value = (resp.dateRange?.start to resp.dateRange?.end)
            }
            resp
        }.recoverCatching { throw it.asApiError() }
    }
```

**(i) #34.** Replace `loadMemberHistory` (≈:1043-1052) with the code below. **Then delete** `resetMemberHistoryToWeek` together with its KDoc (≈:1054-1059, text "Reset the shared member-history to the default "week" window …").

```kotlin
    /** GET /member-history — the member's W/M/Y/P timeline. [publish] = false for the history detail (polish #34): it
     *  keeps its own result, so the Members-tab card always shows its week. */
    suspend fun loadMemberHistory(memberId: String, period: String, publish: Boolean = true): Result<MemberHistoryResponse> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            val resp = api.getMemberHistory(pid, memberId, period)
            if (publish) _memberHistory.value = resp
            resp
        }.recoverCatching { throw it.asApiError() }
    }
```

**(j) #29.** Replace `loadMemberStreaks` with:

```kotlin
    /** GET /member-streaks — server-computed streaks + milestone ladder (the tab card and the streak detail, #29). */
    suspend fun loadMemberStreaks(memberId: String): Result<MemberStreaksResponse> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching { api.getMemberStreaks(pid, memberId).also { _memberStreaks.value = it } }
            .recoverCatching { throw it.asApiError() }
    }
```

**(k) #34, `loadMemberRecent`:**
- Add the trailing parameter `publish: Boolean = true,` after `maxDuration: Int? = null,`.
- Change the return type `Result<Unit>` to `Result<List<MemberRecentItem>>`.
- Replace its `return runCatching { … }.recoverCatching { … }` with:

```kotlin
        return runCatching {
            api.getMemberRecent(
                pid, memberId, limit, startDate, endDate, sortBy, sortDir, workoutType, minDuration, maxDuration,
            ).items.also { if (publish) _memberRecent.value = it }
        }.recoverCatching { throw it.asApiError() }
```

**(l) #34, `loadMemberHealthLogs`:**
- Add `publish: Boolean = true,` after `maxSteps: Int? = null,`.
- Change the return type to `Result<List<MemberHealthItem>>`.
- Replace its return block with:

```kotlin
        return runCatching {
            api.getMemberHealthLogs(
                pid, memberId, limit, startDate, endDate, sortBy, sortDir,
                minSleepHours, maxSleepHours, minFoodQuality, maxFoodQuality,
                minSteps, maxSteps,
            ).items.also { if (publish) _memberHealthLogs.value = it }
        }.recoverCatching { throw it.asApiError() }
```

**(m) #31.** Replace these four lines:

```kotlin
    private val _lifestyle = MutableStateFlow(LifestyleData())
    val lifestyle: StateFlow<LifestyleData> = _lifestyle.asStateFlow()

    private val _lifestyleLoading = MutableStateFlow(false)
    val lifestyleLoading: StateFlow<Boolean> = _lifestyleLoading.asStateFlow()
```

with:

```kotlin
    private val _lifestyleState = MutableStateFlow<UiState<LifestyleData>>(UiState.Idle)
    /** The Lifestyle tab's kit state (polish #31), keyed by (program, "View as" member): a key change starts from Loading. */
    val lifestyleState: StateFlow<UiState<LifestyleData>> = _lifestyleState.asStateFlow()
    private var lifestyleKey: Pair<String, String?>? = null
```

**(n) #31 / advisory 10a.** In `ensureLifestyleViewAsDefault`, replace `_lifestyleViewAsId.value = if (isGlobalAdmin) null else _members.value.firstOrNull { it.id == loggedInMemberId }?.id` with:

```kotlin
        // Polish #31: self is known without the roster, so a failed roster read can't leave a program admin on
        // program-wide numbers labelled with their own name (the reconnect refetch would keep it that way).
        _lifestyleViewAsId.value = if (isGlobalAdmin) null else loggedInMemberId
```

Then replace the whole `loadLifestyle` (KDoc + body, ≈:1273-1302) with:

```kotlin
    /**
     * Load the Lifestyle tab's cards for `memberId` (null = program-wide). Highest-participation is ALWAYS program-wide
     * (memberId=null), matching iOS; the health-timeline preview always loads the week window. Polish #31 (the Summary
     * recipe): the 7 reads run in parallel and each keeps its own result. A (program, member) change resets to Loading —
     * never the other scope's numbers. A partial failure keeps the parts that loaded (the rest "—") + Stale; all seven
     * failing → Failed (ErrorView) or Stale over this scope's previous data.
     */
    suspend fun loadLifestyle(memberId: String?): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        val owner = sessionOwner()
        val key = pid to memberId
        fun stillMine() = lifestyleKey == key && isCurrentOwner(owner)
        if (lifestyleKey != key) {
            lifestyleKey = key
            _lifestyleState.value = UiState.Idle
        }
        _lifestyleState.value = _lifestyleState.value.refreshing()
        val parts = coroutineScope {
            val total = async { attempt { api.getWorkoutTypesTotal(pid, memberId).totalTypes } }
            val mostPopular = async { attempt { api.getWorkoutTypeMostPopular(pid, memberId) } }
            val longest = async { attempt { api.getWorkoutTypeLongestDuration(pid, memberId) } }
            val participation = async { attempt { api.getWorkoutTypeHighestParticipation(pid, null) } }
            val types = async { attempt { api.getWorkoutTypes(pid, 100, memberId) } }
            val timeline = async { attempt { api.getHealthTimeline("week", pid, memberId) } }
            val steps = async { attempt { api.getHealthSteps(pid, memberId) } }
            LifestyleParts(
                total.await(), mostPopular.await(), longest.await(), participation.await(),
                types.await(), timeline.await(), steps.await(),
            )
        }
        if (!stillMine()) return Result.success(Unit)   // the scope or the session changed mid-load
        val errors = parts.errors()
        if (errors.size == LifestyleParts.COUNT) {
            _lifestyleState.value = _lifestyleState.value.failing(errors.first().toAppError())
            return Result.failure(errors.first())
        }
        val data = parts.merge(_lifestyleState.value.dataOrNull)
        if (errors.isEmpty()) {
            _lifestyleState.value = UiState.fresh(data)
            return Result.success(Unit)
        }
        _lifestyleState.value = UiState.Stale(data, System.currentTimeMillis(), errors.first().toAppError())
        return Result.failure(errors.first())
    }
```

**(o) #12 + BLOCKING fix.** Replace `loadAllProgramWorkouts` and the 5 workout-type writes after it (`toggleWorkoutVisibility` through `deleteCustomProgramWorkout`, ≈:1322-1359; four of the writes end in `loadAllProgramWorkouts().getOrThrow()`) with:

```kotlin
    /** Polish #12: the catalog is written only while the program it was read for is still active (and the session is the
     *  same) — a late refresh can never put one program's catalog on another (ids act on the program they came from). */
    suspend fun loadAllProgramWorkouts(): Result<Unit> {
        val pid = _activeProgram.value?.id ?: return Result.success(Unit)
        val owner = sessionOwner()
        return runCatching {
            val list = api.getProgramWorkouts(pid)
            if (_activeProgram.value?.id == pid && isCurrentOwner(owner)) _programWorkoutsAll.value = list
            Unit
        }.recoverCatching { throw it.asApiError() }
    }

    /** Polish #12: a workout-type write is judged by the write alone — the local list changes at once (only if [pid], the
     *  program the write was made in, is still active), then refreshes in the background, so a failed refresh never
     *  reports a saved write as failed (a retry would flip it back). */
    private fun afterWorkoutWrite(pid: String?, local: (List<ProgramWorkoutDTO>) -> List<ProgramWorkoutDTO>) {
        if (pid == null || _activeProgram.value?.id != pid) return
        _programWorkoutsAll.value = local(_programWorkoutsAll.value)
        scope.launch { loadAllProgramWorkouts() }
    }

    suspend fun toggleWorkoutVisibility(libraryWorkoutId: String): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching { api.toggleWorkoutVisibility(ToggleWorkoutVisibilityRequest(pid, libraryWorkoutId)); Unit }
            .recoverCatching { throw it.asApiError() }
            .onSuccess {
                afterWorkoutWrite(pid) { list ->
                    list.map { w -> if (w.libraryWorkoutId == libraryWorkoutId) w.copy(isHidden = !w.isHidden) else w }
                }
            }
    }

    suspend fun toggleCustomWorkoutVisibility(workoutId: String): Result<Unit> {
        val pid = _activeProgram.value?.id
        return runCatching { api.toggleCustomWorkoutVisibility(workoutId); Unit }
            .recoverCatching { throw it.asApiError() }
            .onSuccess { afterWorkoutWrite(pid) { list -> list.map { w -> if (w.id == workoutId) w.copy(isHidden = !w.isHidden) else w } } }
    }

    suspend fun addCustomProgramWorkout(name: String): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching { api.addCustomWorkout(AddCustomWorkoutRequest(pid, name)); Unit }
            .recoverCatching { throw it.asApiError() }
            .onSuccess { afterWorkoutWrite(pid) { list -> list } }
    }

    suspend fun editCustomProgramWorkout(workoutId: String, name: String): Result<Unit> {
        val pid = _activeProgram.value?.id
        return runCatching { api.editCustomWorkout(workoutId, EditCustomWorkoutRequest(name)); Unit }
            .recoverCatching { throw it.asApiError() }
            .onSuccess { afterWorkoutWrite(pid) { list -> list.map { w -> if (w.id == workoutId) w.copy(workoutName = name) else w } } }
    }

    suspend fun deleteCustomProgramWorkout(workoutId: String): Result<Unit> {
        val pid = _activeProgram.value?.id
        return runCatching { api.deleteCustomWorkout(workoutId); Unit }
            .recoverCatching { throw it.asApiError() }
            .onSuccess { afterWorkoutWrite(pid) { list -> list.filterNot { w -> w.id == workoutId } } }
    }
```

**(p) #44.** Replace `updateMemberProfile` with its KDoc (≈:1370-1384) with:

```kotlin
    /** PUT /members/:id — edit own name/gender. Polish #44: a JsonObject body, so a cleared gender goes out as an explicit
     *  `"gender": null` (the global Json drops nulls — explicitNulls=false); [includeGender] = false leaves it unchanged
     *  (My Profile before its read loaded, #18). On self-edit, refresh the cached name + gender. */
    suspend fun updateMemberProfile(
        memberId: String,
        firstName: String,
        lastName: String,
        gender: String?,
        includeGender: Boolean = true,
    ): Result<Unit> = runCatching {
        val body = buildJsonObject {
            put("first_name", firstName)
            put("last_name", lastName)
            if (includeGender) put("gender", gender)
        }
        api.updateMemberProfile(memberId, body)
        if (memberId == loggedInMemberId) {
            val full = "$firstName $lastName".trim()
            _memberName.value = full
            session.saveIdentity(session.memberId, session.username, full, session.globalRole)
            if (includeGender) _loggedInGender.value = gender
        }
        Unit
    }.recoverCatching { throw it.asApiError() }
```

**(q) #10.** In `clearSession()`, replace every line from `_memberMetrics.value = emptyList()` through `_programWorkoutsAll.value = emptyList()` (inclusive) with the single line `resetProgramScope()`. Then add this function directly after `clearSession()`:

```kotlin
    /** Program-scoped state (polish #10): cleared on a program switch ([selectProgram]) and by the sign-out teardown, so
     *  no screen ever shows the previous program's (or member's) numbers under the new name. N5/S4: add new program-scoped
     *  state HERE, not to clearSession. */
    private fun resetProgramScope() {
        _memberMetrics.value = emptyList()
        _memberMetricsTotal.value = 0
        _memberMetricsRange.value = null to null
        _selectedMemberOverview.value = null
        _memberHistory.value = null
        _memberStreaks.value = null
        _memberRecent.value = emptyList()
        _memberHealthLogs.value = emptyList()
        _membershipDetails.value = emptyList()
        _focusedMemberId.value = null
        _focusedMemberName.value = null
        _members.value = emptyList()
        _membersViewAsId.value = null
        membersLoadedFor = null
        membersSelfLoadedFor = null
        _lifestyleState.value = UiState.Idle
        lifestyleKey = null
        _lifestyleViewAsId.value = null
        _lifestyleViewAsChosen.value = false
        lifestyleDefaultedFor = null
        _programWorkoutsAll.value = emptyList()
    }
```

**(r)** Delete the bottom `/** The active program's Lifestyle-tab analytics … */ data class LifestyleData(…)` block (≈:1500-1509). It now lives in `LifestyleData.kt`, same package.

**(s) BLOCKING fix, same class.** In `loadMembershipDetails` (≈:1118-1127), replace its `return runCatching { … }` block with:

```kotlin
        val owner = sessionOwner()
        return runCatching {
            val details = api.getMembershipDetails(pid)
            // Polish #12/#33: never land one program's roster on another (a late reply after a program switch).
            if (_activeProgram.value?.id != pid || !isCurrentOwner(owner)) return@runCatching
            _membershipDetails.value = details
            details.firstOrNull { it.memberId == loggedInMemberId }?.let { _loggedInGender.value = it.gender }
        }.recoverCatching { throw it.asApiError() }
```

**5. `net/ApiService.kt`** (#44; SHARED). Two edits:
- Replace the single line `suspend fun updateMemberProfile(@Path("id") id: String, @Body body: UpdateMemberProfileRequest): MessageResponse` with `suspend fun updateMemberProfile(@Path("id") id: String, @Body body: JsonObject): MessageResponse`.
- Directly above its existing `@PUT("members/{id}")` line, add the comment `// JsonObject body so an explicit "gender": null survives explicitNulls=false (polish #44, as updateDailyHealthLog).`

`JsonObject` is already imported (:3).

**6. `net/Dtos.kt`** (#44; SHARED): delete the `UpdateMemberProfileRequest` block (≈:675-681), from its KDoc `/** PUT /members/:id — edit own profile … */` through its closing `)`.

**7. `MainActivity.kt`** (#20)
- In `onCreate`, replace the line `handleDeepLink(intent)` (≈:22) with:

```kotlin
        // Polish #20: the widget link is used once — a recreation (rotation, the nightly dark-mode switch) or a relaunch
        // from Recents re-delivers the original intent and must not reopen the form.
        val fromHistory = (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0
        if (savedInstanceState == null && !fromHistory) handleDeepLink(intent)
```

- Replace the body of `handleDeepLink` with:

```kotlin
        val route = WidgetRoute.fromUri(intent?.data) ?: return
        (application as App).container.programContext.setWidgetRoute(route)
        intent?.data = null   // consumed — never replayed (#20)
```

**8. `ui/RootScreen.kt`** (#40; SHARED with N5, so change only this)
- Add `import com.app.rasifiters.ui.program.EditProgramScreen`.
- Directly after the `composable(Routes.HEALTH_CONNECT) { … }` block in `SignedInGraph` add:

```kotlin
            // Polish #40: the picker card's Edit (program-picker A-1 rewritten). The picker selects the program first.
            composable(Routes.PROGRAM_EDIT) {
                SettingsInset { EditProgramScreen(programContext = programContext, onBack = { nav.popBackStack() }) }
            }
```

### C. Auth screens

**9. `ui/auth/AuthComponents.kt`** (#35, #36)

Add imports:
- `androidx.compose.ui.autofill.ContentType`
- `androidx.compose.ui.semantics.contentType`
- `androidx.compose.ui.semantics.semantics`
- `com.app.rasifiters.ui.components.tapTarget`

In `AppTextField`:
- Insert these two parameters between `enabled: Boolean = true,` and `trailing: …`:

```kotlin
    contentType: ContentType? = null,
    autoCorrect: Boolean = true,
```

- Insert as the first line of the body:

```kotlin
    // Polish #35: the autofill hint (password managers fill + offer to save — Compose 1.8 semantics autofill).
    val autofillHint = contentType?.let { type -> Modifier.semantics { this.contentType = type } } ?: Modifier
```

- Inside `BasicTextField(`, set `modifier = modifier.fillMaxWidth().height(FieldHeight).then(autofillHint),`.
- Inside `BasicTextField(`, set `keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction, autoCorrectEnabled = autoCorrect),`.

Replace `AppPasswordField` (KDoc + function, ≈:191-219) with:

```kotlin
/** Secure field with a Show/Hide toggle — same primitive, so identical height + corners. Polish #35: a password /
 *  new-password autofill hint, no autocorrect; #36: the eye is a labelled 48dp target. */
@Composable
fun AppPasswordField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    visible: Boolean,
    onToggleVisible: () -> Unit,
    modifier: Modifier = Modifier,
    newPassword: Boolean = false,
) {
    AppTextField(
        label = label,
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        keyboardType = KeyboardType.Password,
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        contentType = if (newPassword) ContentType.NewPassword else ContentType.Password,
        autoCorrect = false,
        trailing = {
            Icon(
                imageVector = if (visible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                contentDescription = null,
                tint = fieldHintColor(),
                modifier = Modifier
                    .tapTarget(if (visible) "Hide password" else "Show password", shape = CircleShape, onClick = onToggleVisible)
                    .size(22.dp),
            )
        },
    )
}
```

**10. `ui/auth/GoogleCredential.kt`** (#21)
- Add the imports `androidx.compose.material3.CircularProgressIndicator` and `androidx.compose.ui.semantics.Role`.
- `onResult: (GoogleIdResult) -> Unit,` becomes `onResult: suspend (GoogleIdResult) -> Unit,`.
- `.clickable(enabled = enabled && !inFlight) {` becomes `.clickable(enabled = enabled && !inFlight, onClickLabel = "Continue with Google", role = Role.Button) {`. The body is unchanged and now awaits the caller's sign-in before the `finally`.
- Replace the Row content (the `Icon(…)`, `Spacer(…)` and `Text(…)`, ≈:113-125) with:

```kotlin
        if (inFlight) {
            // Polish #21: busy until the caller's sign-in finishes — no second tap.
            CircularProgressIndicator(strokeWidth = 2.dp, color = scheme.onSurface, modifier = Modifier.size(18.dp))
        } else {
            Icon(
                painter = painterResource(R.drawable.ic_google_g),
                contentDescription = null,
                tint = Color.Unspecified,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(10.dp))
            Text("Continue with Google", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = contentColor)
        }
```

- KDoc: replace "a second tap while the sheet is up is ignored." with "it shows a spinner and stays disabled until [onResult] (the caller's sign-in) finishes (polish #21)."

**11. `ui/auth/LoginScreen.kt`** (#21, #35)
- Add the imports `androidx.compose.ui.autofill.ContentType`, `androidx.compose.ui.platform.LocalAutofillManager` and `androidx.compose.ui.text.input.KeyboardType`.
- After `val uriHandler = LocalUriHandler.current` add:

```kotlin
    var googleBusy by remember { mutableStateOf(false) }
    val autofill = LocalAutofillManager.current
```

- Replace `AppTextField("Username or Email", identifier, { identifier = it })` with:

```kotlin
            // Polish #35: one field takes a username OR an email (the doc's multi-type hint); Email keyboard for the @ key.
            AppTextField(
                "Username or Email", identifier, { identifier = it },
                keyboardType = KeyboardType.Email,
                contentType = ContentType.Username + ContentType.EmailAddress,
                autoCorrect = false,
            )
```

- In the Login `PillButton`:
  - set `enabled = identifier.isNotEmpty() && password.isNotEmpty() && !googleBusy,`;
  - replace `programContext.login(identifier, password)` + `.onFailure { errorMessage = it.toCredentialMessage() }` with:

```kotlin
                    programContext.login(identifier, password)
                        .onSuccess { autofill?.commit() }
                        .onFailure { errorMessage = it.toCredentialMessage() }
```

- Replace the whole `GoogleSignInButton(...)` call (≈:115-124) with:

```kotlin
        GoogleSignInButton(
            enabled = !loading,
            onResult = { google ->
                googleBusy = true
                programContext.socialSignIn(google.idToken, google.rawNonce)
                    .onSuccess { needsProfile -> if (needsProfile) onCreateAccount() }
                    .onFailure { errorMessage = it.toCredentialMessage() }
                googleBusy = false
            },
            onError = { e -> errorMessage = e.userMessage; programContext.reportGoogleProviderFailure(e.code) },
        )
```

**12. `ui/auth/CreateAccountScreen.kt`** (#17, #21, #35)

Add imports:
- `androidx.activity.compose.BackHandler`
- `androidx.compose.ui.autofill.ContentType`
- `androidx.compose.ui.platform.LocalAutofillManager`
- `com.app.rasifiters.net.ApiException`
- `com.app.rasifiters.ui.summary.FormErrorText`

After `val uriHandler = LocalUriHandler.current` add:

```kotlin
    var usernameError by remember { mutableStateOf<String?>(null) }
    var emailError by remember { mutableStateOf<String?>(null) }
    // Polish #17: once register() succeeded, a retry only signs in, with the credentials that were registered.
    var registered by remember { mutableStateOf<Pair<String, String>?>(null) }
    val autofill = LocalAutofillManager.current
```

Replace `fun submit() { … }` (≈:87-105) with:

```kotlin
    /** Polish #17: a "taken" answer from register / oauth-complete goes back to the username step with the message there. */
    fun showTaken(e: Throwable): Boolean {
        val text = (e as? ApiException)?.takeIf { it.status == 400 }?.message.orEmpty()
        when {
            text.contains("Username already exists", ignoreCase = true) -> usernameError = text
            text.contains("Email already exists", ignoreCase = true) -> emailError = text
            else -> return false
        }
        scope.launch { pagerState.animateScrollToPage(1) }
        return true
    }

    fun submit() {
        loading = true
        scope.launch {
            if (social) {
                // POST /auth/oauth/complete — the root gate swaps on success (no explicit navigate, A-3).
                programContext.completeSocial(username, gender.ifBlank { null }, firstName, lastName)
                    .onFailure { if (!showTaken(it)) errorMessage = it.toCredentialMessage() }
            } else {
                val registerResult = if (registered != null) Result.success(Unit)
                else programContext.register(firstName, lastName, username, email, password, gender.ifBlank { null })
                    .onSuccess { registered = username to password }
                registerResult
                    .onSuccess {
                        val (user, pass) = registered ?: (username to password)
                        // No token from register — auto-login for the session (iOS F2 parity).
                        programContext.login(user, pass)
                            .onSuccess { autofill?.commit() }
                            .onFailure { errorMessage = it.toCredentialMessage() }
                    }
                    .onFailure { if (!showTaken(it)) errorMessage = it.toCredentialMessage() }
            }
            loading = false
        }
    }

    // Polish #21: system Back steps back one page (it used to pop the screen and wipe the form). From the first page it
    // leaves the wizard (onSignIn = pop) and drops an abandoned Google sign-up.
    BackHandler {
        if (pagerState.currentPage > 0) scope.launch { pagerState.animateScrollToPage(pagerState.currentPage - 1) }
        else { programContext.clearPendingSocial(); onSignIn() }
    }
```

Page 0: replace the `GoogleSignInButton(...)` call (≈:178-189) with:

```kotlin
                                    GoogleSignInButton(
                                        enabled = !loading,
                                        onResult = { google ->
                                            programContext.socialSignIn(google.idToken, google.rawNonce)
                                                .onFailure { errorMessage = it.toCredentialMessage() }
                                        },
                                        onError = { e ->
                                            errorMessage = e.userMessage
                                            programContext.reportGoogleProviderFailure(e.code)
                                        },
                                    )
```

Page 1: replace `AppTextField("Username", username, { username = it })` with:

```kotlin
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                AppTextField(
                                    "Username", username, { username = it; usernameError = null },
                                    contentType = ContentType.NewUsername, autoCorrect = false,
                                )
                                usernameError?.let { FormErrorText(it) }
                            }
```

Page 1: replace the Email `AppTextField(…)` (≈:202-206) with the code below, and leave the following `if (social) MutedHint…` unchanged.

```kotlin
                                AppTextField(
                                    "Email", email, { email = it; emailError = null },
                                    keyboardType = KeyboardType.Email,
                                    enabled = !social,
                                    contentType = ContentType.EmailAddress,
                                    autoCorrect = false,
                                )
                                emailError?.let { FormErrorText(it) }
```

Page 2: add `newPassword = true,` to both `AppPasswordField(` calls, after their `onToggleVisible = …,` argument.

"Already have an account? Sign in": `TextButton(onClick = onSignIn, …)` becomes `TextButton(onClick = { programContext.clearPendingSocial(); onSignIn() }, …)`.

**13. `ui/auth/SplashScreen.kt`** (#25)
- Delete the imports `androidx.compose.animation.AnimatedVisibility`, `androidx.compose.animation.fadeIn` and `androidx.compose.animation.slideInVertically`.
- Delete `var ctaVisible by remember { mutableStateOf(false) }`.
- In the typewriter `LaunchedEffect`, delete the trailing block `if (!skipped) { delay(300); ctaVisible = true }` (≈:62-65).
- The tap handler body (≈:75-81) becomes:

```kotlin
                        if (!skipped) {
                            skipped = true
                            headline = HEADLINE
                            subheadline = SUBHEADLINE
                            headlineComplete = true
                        }
```

- Replace `AnimatedVisibility(visible = ctaVisible, enter = slideInVertically { it } + fadeIn()) { PillButton(label = "Sign in", onClick = onSignIn) }` with:

```kotlin
            // Polish #25: Sign in is there from the start; the typewriter is decoration only.
            PillButton(label = "Sign in", onClick = onSignIn)
```

- KDoc: "and reveals a single "Sign in" CTA" becomes "and shows a single "Sign in" CTA from the start (polish #25)".

**14. `ui/auth/ForgotPasswordScreen.kt`** (#35)
- Add `import androidx.compose.ui.autofill.ContentType`.
- `AppTextField("Email", email, { email = it }, keyboardType = KeyboardType.Email)` becomes `AppTextField("Email", email, { email = it }, keyboardType = KeyboardType.Email, contentType = ContentType.EmailAddress, autoCorrect = false)`.

### D. Account and program screens

**15. `ui/program/ChangePasswordScreen.kt`** (#35)
- After `var visible by remember { mutableStateOf(false) }` add `var confirmVisible by remember { mutableStateOf(false) }`.
- Replace `:82` with `AppPasswordField("••••••••", newPassword, { newPassword = it }, visible, { visible = !visible }, newPassword = true)`.
- Replace `:84` with `AppPasswordField("••••••••", confirmPassword, { confirmPassword = it }, confirmVisible, { confirmVisible = !confirmVisible }, newPassword = true)`.
- Delete the imports `com.app.rasifiters.ui.auth.AppTextField` and `androidx.compose.ui.text.input.PasswordVisualTransformation`.

**16. `ui/program/ProfileScreen.kt`** (#15, #18, #35, #44; SHARED with People S4, so change only these blocks)

Add imports:
- `androidx.compose.ui.autofill.ContentType`
- `com.app.rasifiters.core.kit.AppError`
- `com.app.rasifiters.ui.components.kit.InlineLoadError`
- `com.app.rasifiters.ui.components.kit.RefetchOnReconnect`
- `kotlinx.coroutines.coroutineScope`

State: replace `var identities by remember { mutableStateOf<List<IdentityDTO>>(emptyList()) }` and `var hasPassword by remember { mutableStateOf(true) }` with:

```kotlin
    // Polish #18: unknown until loaded — "—" with Link / Add password / Change email disabled, never a false "Not linked".
    var identities by remember { mutableStateOf<List<IdentityDTO>?>(null) }
    var hasPassword by remember { mutableStateOf<Boolean?>(null) }
    var memberLoaded by remember { mutableStateOf(false) }
    var genderTouched by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<AppError?>(null) }
    var deleteError by remember { mutableStateOf<String?>(null) }
    val online by programContext.isOnline.collectAsStateWithLifecycle()
```

Replace the `LaunchedEffect(Unit) { val id = programContext.loggedInMemberId ?: return@LaunchedEffect … listIdentities() … }` block (≈:115-122) with:

```kotlin
    suspend fun loadProfile() {
        val id = programContext.loggedInMemberId ?: return
        loadError = null
        coroutineScope {
            launch {
                programContext.fetchMember(id)
                    .onSuccess { member ->
                        currentEmail = member.email
                        if (!genderTouched) gender = member.gender.orEmpty()
                        memberLoaded = true
                    }
                    .onFailure { loadError = it.toAppError() }
            }
            launch {
                programContext.listIdentities()
                    .onSuccess { identities = it.identities; hasPassword = it.hasPassword }
                    .onFailure { loadError = it.toAppError() }
            }
        }
    }
    LaunchedEffect(Unit) { loadProfile() }
    RefetchOnReconnect(programContext.isOnline, needsReload = { loadError != null }) { scope.launch { loadProfile() } }
```

Directly after the header `Row { … }` (avatar + name), before the first `SectionDivider()`, add:

```kotlin
            loadError?.let { InlineLoadError(it, online, onRetry = { scope.launch { loadProfile() } }) }
```

Gender `AppDropdownField`: `onSelect = { picked -> gender = if (picked == "Clear") "" else picked },` becomes `onSelect = { picked -> gender = if (picked == "Clear") "" else picked; genderTouched = true },`.

Save: replace `programContext.updateMemberProfile(id, f, l, gender.ifEmpty { null })` with:

```kotlin
                        // Polish #44: "" = an explicit clear; #18: gender is sent only once it is known (or the user set it).
                        programContext.updateMemberProfile(id, f, l, gender.ifEmpty { null }, includeGender = memberLoaded || genderTouched)
```

Email form (#35): `AppTextField("you@example.com", newEmail, { newEmail = it }, keyboardType = KeyboardType.Email)` becomes `AppTextField("you@example.com", newEmail, { newEmail = it }, keyboardType = KeyboardType.Email, contentType = ContentType.EmailAddress, autoCorrect = false)`.

The "Change email" `TextButton(onClick = {` becomes `TextButton(enabled = memberLoaded, onClick = {`.

Google row:
- Replace `val googleLinked = identities.any { it.provider == "google" }` with:

```kotlin
            val ids = identities
            val googleLinked = ids?.any { it.provider == "google" } == true
```

- Its status text `if (googleLinked) identities.first { it.provider == "google" }.email ?: "Linked" else "Not linked",` becomes:

```kotlin
                        when {
                            ids == null -> "\u2014"
                            googleLinked -> ids.first { it.provider == "google" }.email ?: "Linked"
                            else -> "Not linked"
                        },
```

- `enabled = !linkBusy && !(googleLinked && identities.size <= 1),` becomes `enabled = ids != null && !linkBusy && !(googleLinked && ids.size <= 1),`.

Password row:
- `if (hasPassword) "Enabled" else "Not set",` becomes `when (hasPassword) { null -> "\u2014"; true -> "Enabled"; false -> "Not set" },`.
- `if (!hasPassword) {` becomes `if (hasPassword == false) {`.
- `if (showPwForm && !hasPassword) {` becomes `if (showPwForm && hasPassword == false) {`.
- `AppPasswordField("New password", newPassword, { newPassword = it }, pwVisible, { pwVisible = !pwVisible })` becomes `AppPasswordField("New password", newPassword, { newPassword = it }, pwVisible, { pwVisible = !pwVisible }, newPassword = true)`.

#15 Delete account:
- In the Delete dialog confirm, `showDelete = false; isDeleting = true; errorMessage = null` becomes `showDelete = false; isDeleting = true; deleteError = null`.
- Its `onFailure { errorMessage = it.toAppError().message; isDeleting = false }` becomes `onFailure { deleteError = it.toAppError().message; isDeleting = false }`.
- Directly after the Delete `Button(...) { … }` (before the "This will permanently delete…" `Text`) add:

```kotlin
                // Polish #15: a delete failure shows right under its button, in plain words (it used to appear far up the page).
                deleteError?.let { FormErrorText(it) }
```

**17. `ui/program/AppearanceScreen.kt`** (#36, #45)
- `"Choose how RaSi Fit'ers looks to you",` (≈:57) becomes `"Choose how RaSi Fiters looks to you",`.
- In `AppearanceOption`, `.clickable(onClick = onClick)` becomes `.selectableTarget(selected = selected, role = Role.RadioButton, onClick = onClick)`.
- Add the imports `androidx.compose.ui.semantics.Role` and `com.app.rasifiters.ui.components.selectableTarget`.
- Delete `import androidx.compose.foundation.clickable`.

**18. `ui/program/ProgramAccountSection.kt`** (#45; SHARED with N5): `subtitle = "Sync workouts and sleep",` becomes `subtitle = "Sync workouts, sleep and steps",`.

**19. `ui/programs/AccountMenuSheet.kt`** (#45; SHARED with N5): `"Sync workouts and sleep"` becomes `"Sync workouts, sleep and steps"`.

**20. `ui/program/ProgramSections.kt`** (#33)
- Add the imports `com.app.rasifiters.core.kit.UiState`, `com.app.rasifiters.ui.components.kit.InlineLoadError` and `com.app.rasifiters.ui.components.kit.hasData`.
- After `private val AppBlueTint = AppBlue` add `private const val UNAVAILABLE = "\u2014"`.
- Replace `MembersSection` (≈:171), `RoleManagementSection` (≈:186) and `WorkoutTypesSection` (≈:263), each with its KDoc, with:

```kotlin
/** Members section: View Members (everyone) + Invite Member (admins only). Polish #33: the count shows "—" until the
 *  roster loads, and a failed load shows "Couldn't load · Retry" under the row (never "0 enrolled"). */
@Composable
fun MembersSection(
    memberCount: Int,
    state: UiState<Unit>,
    online: Boolean,
    onRetry: () -> Unit,
    canInvite: Boolean,
    onNavigate: (String) -> Unit,
) {
    ProgramSectionCard(Icons.Filled.Groups, "Members", AppGreen) {
        ProgramSettingsRow(Icons.Filled.Groups, AppGreen, "View Members", if (state.hasData) "$memberCount enrolled" else UNAVAILABLE) {
            onNavigate(Routes.MEMBER_ROSTER)
        }
        if (state is UiState.Failed) InlineLoadError(state.error, online, onRetry)
        if (canInvite) {
            ProgramSettingsRow(Icons.Filled.MailOutline, AppBlue, "Invite Member", "Send program invitation") {
                onNavigate(Routes.MEMBER_INVITE)
            }
        }
    }
}

/** Role Management section (canEdit only). Polish #33: a spinner while loading, "Couldn't load · Retry" on failure, and
 *  "No admins or loggers assigned" only for a loaded roster that really has none. */
@Composable
fun RoleManagementSection(
    details: List<MembershipDetailDTO>,
    state: UiState<Unit>,
    online: Boolean,
    onRetry: () -> Unit,
    onNavigate: (String) -> Unit,
) {
    val admins = details.filter { it.programRole == "admin" }
    val loggers = details.filter { it.programRole == "logger" }
    ProgramSectionCard(Icons.Filled.ManageAccounts, "Role Management", AppPurple) {
        when {
            state.hasData -> {
                if (admins.isNotEmpty()) RoleGroup("Admins", Icons.Filled.Star, AppOrange, admins, AppOrange)
                if (loggers.isNotEmpty()) RoleGroup("Loggers", Icons.Filled.Edit, AppBlue, loggers, AppBlue)
                if (admins.isEmpty() && loggers.isEmpty()) {
                    Text(
                        "No admins or loggers assigned",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    )
                }
            }
            state is UiState.Failed -> InlineLoadError(state.error, online, onRetry)
            else -> Box(Modifier.fillMaxWidth().padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
            }
        }
        ProgramSettingsRow(
            Icons.Filled.ManageAccounts,
            AppPurple,
            "Manage Roles",
            "Set admin, logger, or member roles",
        ) { onNavigate(Routes.PROGRAM_ROLES) }
    }
}

/** Workout Types section. Polish #33: "—" until the catalog loads, "Couldn't load · Retry" on failure. */
@Composable
fun WorkoutTypesSection(
    visibleCount: Int,
    customCount: Int,
    state: UiState<Unit>,
    online: Boolean,
    onRetry: () -> Unit,
    onNavigate: (String) -> Unit,
) {
    val subtitle = when {
        !state.hasData -> UNAVAILABLE
        customCount > 0 -> "$visibleCount available, $customCount custom"
        else -> "$visibleCount types available"
    }
    ProgramSectionCard(Icons.Filled.FitnessCenter, "Workout Types", AppPurple) {
        ProgramSettingsRow(Icons.AutoMirrored.Filled.List, AppPurple, "Workout Types", subtitle) {
            onNavigate(Routes.LIFESTYLE_WORKOUT_TYPES)
        }
        if (state is UiState.Failed) InlineLoadError(state.error, online, onRetry)
    }
}
```

**21. `ui/program/ProgramScreen.kt`** (#33)

Add imports:
- `androidx.compose.foundation.layout.Spacer`
- `androidx.compose.foundation.layout.height`
- `androidx.compose.material3.ExperimentalMaterial3Api`
- `androidx.compose.material3.pulltorefresh.PullToRefreshBox`
- `com.app.rasifiters.core.kit.UiState`
- `com.app.rasifiters.ui.components.kit.FloatingBanner`
- `com.app.rasifiters.ui.components.kit.FloatingBannerVariant`
- `com.app.rasifiters.ui.components.kit.STALE_BANNER_CLEARANCE`
- `com.app.rasifiters.ui.components.kit.initialLoadState`
- `com.app.rasifiters.ui.components.kit.rememberLoad`
- `kotlinx.coroutines.coroutineScope`

Changes:
- Annotate `ProgramScreen` with `@OptIn(ExperimentalMaterial3Api::class)`.
- After `var errorMessage …` add:

```kotlin
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    var pulling by remember { mutableStateOf(false) }
```

- Replace the whole `LaunchedEffect(program?.id, isAdmin) { … }` (≈:72-78) with:

```kotlin
    // Polish #33: the three admin reads on the kit states — a section shows "—" + "Couldn't load · Retry", never a fake
    // "0 enrolled" / "No admins" / "0 types"; a re-entry with data on screen refreshes underneath.
    val membersLoad = rememberLoad(program?.id, programContext.isOnline, enabled = isAdmin, initial = { initialLoadState(members.isNotEmpty()) }) {
        programContext.ensureMembersLoaded(force = true)
    }
    val rolesLoad = rememberLoad(program?.id, programContext.isOnline, enabled = isAdmin, initial = { initialLoadState(membershipDetails.isNotEmpty()) }) {
        programContext.loadMembershipDetails()
    }
    val typesLoad = rememberLoad(program?.id, programContext.isOnline, enabled = isAdmin, initial = { initialLoadState(workoutsAll.isNotEmpty()) }) {
        programContext.loadAllProgramWorkouts()
    }
    val adminLoads = listOf(membersLoad, rolesLoad, typesLoad)
    val anyStale = online && adminLoads.any { it.state is UiState.Stale }
```

- Replace the whole root `Box(…) { Column(…) { … } }` (≈:80-123) with the block below. The Column body is today's, with the three section calls changed.

```kotlin
    val body: @Composable () -> Unit = {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(top = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Header(programName = program?.name ?: "", initials = initialsOf(memberName))
            errorMessage?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error) }
            if (isAdmin) {
                AdminProgramInfoSection(
                    canEdit = canEdit,
                    canLeave = !isGlobalAdmin,
                    program = program,
                    isLeaving = isLeaving,
                    onSelect = onSwitchProgram,
                    onEdit = { onNavigate(Routes.PROGRAM_EDIT) },
                    onLeave = { showLeave = true },
                )
                MembersSection(
                    memberCount = members.size, state = membersLoad.state, online = online,
                    onRetry = membersLoad::reload, canInvite = canEdit, onNavigate = onNavigate,
                )
                if (canEdit) {
                    RoleManagementSection(
                        details = membershipDetails, state = rolesLoad.state, online = online,
                        onRetry = rolesLoad::reload, onNavigate = onNavigate,
                    )
                }
                WorkoutTypesSection(
                    visibleCount = workoutsAll.count { !it.isHidden },
                    customCount = workoutsAll.count { it.isCustom },
                    state = typesLoad.state, online = online, onRetry = typesLoad::reload, onNavigate = onNavigate,
                )
            } else {
                ProgramInfoReadOnlyCard(program)
                SwitchProgramCard(onSwitchProgram)
                LeaveProgramRow(isLeaving = isLeaving, onClick = { showLeave = true })
            }
            ProgramAccountSection(
                programContext = programContext,
                appearanceStore = appearanceStore,
                onNavigate = onNavigate,
                onSignOut = { showSignOut = true },
            )
            if (anyStale) Spacer(Modifier.height(STALE_BANNER_CLEARANCE))
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        if (isAdmin) {
            // Polish #33: pull to refresh re-reads the three admin lists (Android had none here).
            PullToRefreshBox(
                isRefreshing = pulling,
                onRefresh = {
                    pulling = true
                    scope.launch {
                        coroutineScope { adminLoads.forEach { l -> launch { l.refresh() } } }
                        pulling = false
                    }
                },
                modifier = Modifier.fillMaxSize(),
            ) { body() }
        } else {
            body()
        }
        if (anyStale) {
            FloatingBanner(
                FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter),
                onRetry = { adminLoads.forEach { it.reload() } },
            )
        }
    }
```

**22. `ui/program/ManageRolesScreen.kt`** (#33, #36)

Add imports:
- `androidx.compose.foundation.layout.Spacer`
- `androidx.compose.foundation.layout.height`
- `androidx.compose.material3.ExperimentalMaterial3Api`
- `androidx.compose.material3.pulltorefresh.PullToRefreshBox`
- `androidx.compose.ui.draw.clip`
- `androidx.compose.ui.semantics.Role`
- `com.app.rasifiters.ui.components.selectableTarget`
- `com.app.rasifiters.ui.components.kit.KitLoad`
- `com.app.rasifiters.ui.components.kit.KitStaleBanner`
- `com.app.rasifiters.ui.components.kit.STALE_BANNER_CLEARANCE`
- `com.app.rasifiters.ui.components.kit.initialLoadState`
- `com.app.rasifiters.ui.components.kit.rememberLoad`
- `com.app.rasifiters.ui.components.kit.showsStaleBanner`
- `com.app.rasifiters.ui.summary.EmptyText`

Delete the imports `androidx.compose.foundation.clickable` and `androidx.compose.runtime.LaunchedEffect`.

Replace the `ManageRolesScreen` function (≈:51-101) with:

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ManageRolesScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val members by programContext.membershipDetails.collectAsStateWithLifecycle()
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var updatingId by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var pulling by remember { mutableStateOf(false) }

    // Polish #33: the roster on the kit states — a failed load shows ErrorView + Retry (never an empty card); pull to refresh.
    val load = rememberLoad(program?.id, programContext.isOnline, initial = { initialLoadState(members.isNotEmpty()) }) {
        programContext.loadMembershipDetails()
    }
    val activeAdminCount = members.count { it.programRole == "admin" && it.status == "active" }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        PullToRefreshBox(
            isRefreshing = pulling,
            onRefresh = { pulling = true; scope.launch { load.refresh(); pulling = false } },
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                DetailTopBar(onBack = onBack, centerTitle = "Manage Roles")
                errorMessage?.let { FormErrorText(it) }
                KitLoad(load.state, online, onRetry = load::reload) { _ ->
                    if (members.isEmpty()) {
                        EmptyText("No members in this program yet.")
                    } else {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(18.dp))
                                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(18.dp))
                                .padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp),
                        ) {
                            members.forEachIndexed { index, member ->
                                if (index > 0) {
                                    Box(modifier = Modifier.fillMaxWidth().size(1.dp).background(MaterialTheme.colorScheme.outlineVariant))
                                }
                                val isLastActiveAdmin = member.programRole == "admin" && member.status == "active" && activeAdminCount <= 1
                                RoleMemberRow(
                                    member = member,
                                    updating = updatingId == member.memberId,
                                    isLastActiveAdmin = isLastActiveAdmin,
                                    onSelect = { role ->
                                        if (member.programRole == role) return@RoleMemberRow
                                        updatingId = member.memberId; errorMessage = null
                                        scope.launch {
                                            programContext.updateMemberRole(member.memberId, role)
                                                .onFailure { errorMessage = it.toAppError().message }
                                            updatingId = null
                                        }
                                    },
                                )
                            }
                        }
                    }
                }
                if (load.state.showsStaleBanner(online)) Spacer(Modifier.height(STALE_BANNER_CLEARANCE))
            }
        }
        KitStaleBanner(load.state, online, onRetry = load::reload)
    }
}
```

In `RolePill`, replace the Row modifier chain (≈:154-158) with:

```kotlin
        modifier = modifier
            .clip(CircleShape)
            .background(if (selected) color else color.copy(alpha = 0.15f), CircleShape)
            .border(1.dp, if (selected) color.copy(alpha = 0.8f) else color.copy(alpha = 0.3f), CircleShape)
            // Polish #36: a 48dp pill announced as a selected/unselected role choice.
            .selectableTarget(selected = selected, role = Role.RadioButton, enabled = enabled, onClick = onClick)
            .padding(vertical = 10.dp),
```

**23. `ui/members/MemberManagementScreens.kt`** (#33 roster and #35 invite field only; SHARED with People S4)

Add imports:
- `androidx.compose.material3.ExperimentalMaterial3Api`
- `androidx.compose.material3.pulltorefresh.PullToRefreshBox`
- `com.app.rasifiters.ui.components.kit.KitLoad`
- `com.app.rasifiters.ui.components.kit.KitStaleBanner`
- `com.app.rasifiters.ui.components.kit.STALE_BANNER_CLEARANCE`
- `com.app.rasifiters.ui.components.kit.initialLoadState`
- `com.app.rasifiters.ui.components.kit.rememberLoad`
- `com.app.rasifiters.ui.components.kit.showsStaleBanner`
- `com.app.rasifiters.ui.summary.EmptyText`

`InviteMemberScreen` (#35): in `AppTextField(label = "@username", value = username, onValueChange = { … },`, add the argument `autoCorrect = false,` after `onValueChange`.

Replace `ProgramMembersListScreen` (≈:153-188) with:

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProgramMembersListScreen(programContext: ProgramContext, onNavigate: (String) -> Unit, onBack: () -> Unit) {
    val details by programContext.membershipDetails.collectAsStateWithLifecycle()
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val isGlobalAdmin = programContext.isGlobalAdmin
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var pulling by remember { mutableStateOf(false) }

    // Polish #33: the roster on the kit states — a failed load shows ErrorView + Retry (never an empty list), an honest
    // empty line, pull to refresh. People S4 keeps these states when it turns this into the People list.
    val load = rememberLoad(program?.id, programContext.isOnline, initial = { initialLoadState(details.isNotEmpty()) }) {
        programContext.loadMembershipDetails()
    }

    val filtered = if (query.isBlank()) details
    else details.filter { it.memberName.contains(query.trim(), ignoreCase = true) }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        PullToRefreshBox(
            isRefreshing = pulling,
            onRefresh = { pulling = true; scope.launch { load.refresh(); pulling = false } },
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp).padding(top = 16.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                DetailTopBar(onBack = onBack, centerTitle = "Members")
                TextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    placeholder = { Text("Search members") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                        unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                    ),
                )
                KitLoad(load.state, online, onRetry = load::reload) { _ ->
                    when {
                        details.isEmpty() -> EmptyText("No members in this program yet.")
                        filtered.isEmpty() -> EmptyText("No members match your search.")
                        else -> filtered.forEach { m ->
                            RosterRow(
                                m = m,
                                clickable = isGlobalAdmin,
                                onClick = {
                                    programContext.focusMember(m.memberId, m.memberName)
                                    onNavigate(com.app.rasifiters.ui.Routes.MEMBER_EDIT)
                                },
                            )
                        }
                    }
                }
                if (load.state.showsStaleBanner(online)) Spacer(Modifier.height(STALE_BANNER_CLEARANCE))
            }
        }
        KitStaleBanner(load.state, online, onRetry = load::reload)
    }
}
```

### E. Members and Lifestyle tabs

**24. `ui/members/MembersScreen.kt`** (#10, #36, #42; SHARED with People S4/S5)

Add the imports `androidx.compose.foundation.layout.heightIn`, `androidx.compose.ui.semantics.Role` and `com.app.rasifiters.ui.components.selectableTarget`.

**(a)** Replace the whole `AdminMembersBody` function (≈:94-147) with:

```kotlin
@Composable
private fun AdminMembersBody(programContext: ProgramContext, programName: String, onNavigate: (String) -> Unit) {
    val isGlobalAdmin = programContext.isGlobalAdmin
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    // Roster + selection live in ProgramContext so the "View as" pick survives a detail push + return.
    val roster by programContext.members.collectAsStateWithLifecycle()
    val selectedId by programContext.membersViewAsId.collectAsStateWithLifecycle()
    var showPicker by remember { mutableStateOf(false) }
    // Polish #10: the member whose 5 cards are on screen. A pick resets it in the SAME frame (onSelect) and a program
    // switch re-keys it, so the cards wait behind the spinner — never the previous member's numbers, never a frame of
    // cleared cards. A re-entry with this member's data on screen keeps the cards (they refresh underneath).
    var loadedFor by remember(program?.id) { mutableStateOf(programContext.selectedMemberOverview.value?.memberId) }

    LaunchedEffect(program?.id) { programContext.ensureMembersLoaded() }

    // The selected member's 5 reads whenever the persisted selection changes (or on tab re-entry) — in parallel (#5).
    LaunchedEffect(program?.id, selectedId) {
        val id = selectedId ?: return@LaunchedEffect
        if (programContext.selectedMemberOverview.value?.memberId != id) loadedFor = null
        val name = roster.firstOrNull { it.id == id }?.memberName
        programContext.focusMember(id, name)
        coroutineScope {
            launch { programContext.loadMemberOverview(id) }
            launch { programContext.loadMemberHistory(id, "week") }
            launch { programContext.loadMemberStreaks(id) }
            launch { programContext.loadMemberRecent(id, limit = 10) }
            launch { programContext.loadMemberHealthLogs(id, limit = 10) }
        }
        loadedFor = id
    }

    val selected = roster.firstOrNull { it.id == selectedId }
    val viewAsLabel = selected?.memberName
        ?: if (isGlobalAdmin) "None" else (programContext.loggedInMemberName ?: "Member")

    MembersHeader(
        subtitle = programName,
        actionIcon = Icons.Filled.MailOutline,
        actionDescription = "Invite member",
        onAction = { onNavigate(Routes.MEMBER_INVITE) },
    )

    MemberMetricsPreviewCard(programContext, onClick = { onNavigate(Routes.MEMBER_METRICS) })

    ViewAsSelector(label = viewAsLabel, onClick = { showPicker = true })

    if (selected != null) {
        if (loadedFor != selected.id) {
            Box(modifier = Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = AppOrange)
            }
        } else {
            MemberSectionCards(programContext, focusId = selected.id, focusName = selected.memberName, onNavigate = onNavigate)
        }
    }

    if (showPicker) {
        MemberPickerSheet(
            members = roster,
            selectedId = selectedId,
            showNone = isGlobalAdmin,
            onSelect = { member ->
                if (member?.id != selectedId) loadedFor = null
                programContext.setMembersViewAs(member?.id)
                showPicker = false
            },
            onDismiss = { showPicker = false },
        )
    }
}
```

**(b)** Replace the whole `StandardMembersBody` function (≈:151-246) with:

```kotlin
@Composable
private fun StandardMembersBody(programContext: ProgramContext, programName: String, onNavigate: (String) -> Unit) {
    val isLogger = programContext.loggedInUserProgramRole == "logger"
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val selfId = programContext.loggedInMemberId
    val selfName = programContext.loggedInMemberName ?: "Member"

    val roster by programContext.members.collectAsStateWithLifecycle()
    val loggerViewAsId by programContext.membersViewAsId.collectAsStateWithLifecycle()
    val overview by programContext.selectedMemberOverview.collectAsStateWithLifecycle()
    // Polish #5: a spinner only while nothing for this program is on screen; a tab re-entry keeps the cards.
    var loading by remember { mutableStateOf(programContext.membersSelfLoadedFor != program?.id) }
    // Recent + Health follow the member they show (a logger's View-as pick, else self).
    val logsKey = if (isLogger) (loggerViewAsId ?: selfId) else selfId
    // Polish #5/#10: the (program, member) whose Recent + Health rows are loaded. A first load for the program waits on
    // them; a logger's View-as switch spins only those two cards — never the previous member's rows under the new name.
    var logsLoadedFor by remember { mutableStateOf<Pair<String?, String?>?>(if (loading) null else program?.id to logsKey) }
    var showPicker by remember { mutableStateOf(false) }

    // Self data — every read in parallel. The self metric row IS the overview row (no all-member download, member-analytics D-C10).
    LaunchedEffect(program?.id) {
        loading = programContext.membersSelfLoadedFor != program?.id
        programContext.ensureMembersLoaded()
        if (selfId != null) {
            programContext.focusMember(selfId, selfName)
            val overviewLoaded = coroutineScope {
                val overviewOk = async { programContext.loadMemberOverview(selfId).isSuccess }
                launch { programContext.loadMemberHistory(selfId, "week") }
                launch { programContext.loadMemberStreaks(selfId) }
                overviewOk.await()
            }
            // Only a loaded overview counts as "on screen" — after a failed first load the next visit spins again.
            if (overviewLoaded) programContext.membersSelfLoadedFor = program?.id
        }
        loading = false
    }

    // A new pick restarts this effect, which cancels a slower stale load so it can never overwrite the picked member's rows.
    LaunchedEffect(program?.id, logsKey) {
        if (logsKey != null) {
            coroutineScope {
                launch { programContext.loadMemberRecent(logsKey, limit = 10) }
                launch { programContext.loadMemberHealthLogs(logsKey, limit = 10) }
            }
        }
        logsLoadedFor = program?.id to logsKey
    }

    MembersHeader(
        subtitle = programName,
        actionIcon = Icons.Filled.Group,
        actionDescription = "View members",
        onAction = { onNavigate(Routes.MEMBER_ROSTER) },
    )

    if (loading || logsLoadedFor?.first != program?.id) {
        Box(modifier = Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = AppOrange)
        }
        return
    }

    MemberOverviewCard(programContext)
    overview?.takeIf { it.memberId == selfId }?.let { MemberMetricsCard(it, MetricSortField.ACTIVE_DAYS) }
    MemberHistoryCard(programContext, onClick = {
        programContext.focusMember(selfId, selfName); onNavigate(Routes.MEMBER_HISTORY)
    })
    MemberStreakCard(programContext, onClick = {
        programContext.focusMember(selfId, selfName); onNavigate(Routes.MEMBER_STREAKS)
    })

    val logsTarget = if (isLogger) (roster.firstOrNull { it.id == loggerViewAsId }) else null
    val logsId = logsTarget?.id ?: selfId
    val logsName = logsTarget?.memberName ?: selfName

    if (isLogger) {
        val label = logsTarget?.memberName ?: selfName
        ViewAsSelector(label = label, onClick = { showPicker = true })
    }

    if (logsLoadedFor != (program?.id to logsKey)) {
        Box(modifier = Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = AppOrange)
        }
    } else {
        MemberRecentCard(programContext, onClick = {
            programContext.focusMember(logsId, logsName); onNavigate(Routes.MEMBER_WORKOUTS)
        })
        MemberHealthCard(programContext, onClick = {
            programContext.focusMember(logsId, logsName); onNavigate(Routes.MEMBER_HEALTH)
        })
    }

    if (showPicker) {
        MemberPickerSheet(
            members = roster,
            selectedId = loggerViewAsId,
            showNone = false,
            onSelect = { member ->
                // Only a different shown member re-scopes (a stored null already means self — no clear without a reload).
                val target = member?.id ?: selfId
                if (target != logsKey) programContext.setMembersViewAs(target, logsOnly = true)
                showPicker = false
            },
            onDismiss = { showPicker = false },
        )
    }
}
```

**(c) #42.** In `MemberPickerSheet`, replace `LazyColumn(modifier = Modifier.fillMaxWidth().height(if (filtered.size > 6) 380.dp else (48 * (filtered.size + if (showNone) 1 else 0)).coerceAtLeast(48).dp)) {` with:

```kotlin
            // Polish #42: the list sizes itself (rows are ~52dp; the old 48dp-per-row height clipped the last one).
            LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 380.dp)) {
```

**(d) #36.** In `PickerRow`, `.clickable(onClick = onClick)` becomes `.selectableTarget(selected = selected, role = Role.RadioButton, onClick = onClick)`.

**25. `ui/lifestyle/LifestyleCards.kt`** (#31, #36)

Add imports:
- `androidx.compose.ui.semantics.Role`
- `com.app.rasifiters.net.WorkoutTypeHighestParticipationDTO`
- `com.app.rasifiters.net.WorkoutTypeLongestDurationDTO`
- `com.app.rasifiters.net.WorkoutTypeMostPopularDTO`
- `com.app.rasifiters.ui.components.selectableTarget`

Add `private const val UNAVAILABLE = "\u2014"` on the line below `private val StepsTeal = Color(0xFF14B8A6)`.

Replace the four stat-card functions (≈:106-130, `WorkoutTypesTotalCard` through `WorkoutTypeHighestParticipationCard`) with:

```kotlin
// Polish #31: a null stat = its read failed with no previous value → "—"; "N/A" / "No data" stay for loaded empty data.

@Composable
fun WorkoutTypesTotalCard(total: Int?, modifier: Modifier = Modifier) =
    StatCard("Total workout types", AppOrange, total?.toString() ?: UNAVAILABLE, "different exercises", bigNumber = true, modifier = modifier)

@Composable
fun WorkoutTypeMostPopularCard(stat: WorkoutTypeMostPopularDTO?, modifier: Modifier = Modifier) =
    StatCard(
        "Most popular", AppPurple,
        value = if (stat == null) UNAVAILABLE else stat.workoutName ?: "N/A",
        footnote = when { stat == null -> ""; stat.workoutName == null -> "No data"; else -> "${stat.sessions} workouts" },
        bigNumber = false, modifier = modifier,
    )

@Composable
fun WorkoutTypeLongestDurationCard(stat: WorkoutTypeLongestDurationDTO?, modifier: Modifier = Modifier) =
    StatCard(
        "Longest duration", AppRed,
        value = if (stat == null) UNAVAILABLE else stat.workoutName ?: "N/A",
        footnote = when { stat == null -> ""; stat.workoutName == null -> "No data"; else -> "${stat.avgMinutes} mins avg" },
        bigNumber = false, modifier = modifier,
    )

@Composable
fun WorkoutTypeHighestParticipationCard(stat: WorkoutTypeHighestParticipationDTO?, modifier: Modifier = Modifier) =
    StatCard(
        "Highest participation", AppGreen,
        value = if (stat == null) UNAVAILABLE else stat.workoutName ?: "N/A",
        footnote = when {
            stat == null -> ""
            stat.workoutName == null -> "No data"
            else -> String.format(Locale.US, "%.1f%% of members", stat.participationPct)
        },
        bigNumber = false, modifier = modifier,
    )
```

`WorkoutTypePopularityCard`:
- Its signature becomes `fun WorkoutTypePopularityCard(types: List<WorkoutTypeDTO>?) {`.
- Replace `if (types.isEmpty()) {` (≈:208) with the block below. The `Text("No workouts logged yet.", …)` and the existing `} else {` branch stay as they are; the `types` smart-cast works because it is a parameter.

```kotlin
            if (types == null) {
                Text(
                    UNAVAILABLE,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            } else if (types.isEmpty()) {
```

`LifestyleTimelinePreviewCard` (≈:348) and `StepsTimelinePreviewCard` (≈:397): in both, replace the block from `if (points.isEmpty()) {` through the `} else {` that follows it with:

```kotlin
            if (timeline == null || points.isEmpty()) {
                Box(modifier = Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                    Text(
                        if (timeline == null) UNAVAILABLE else "No data yet",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    )
                }
            } else {
```

`MetricSegmented`: `.clickable { onSelect(m) }` becomes `.selectableTarget(selected = active, role = Role.RadioButton) { onSelect(m) }`, in the same position after `.background(...)`.

**26. `ui/lifestyle/LifestyleScreen.kt`** (#10, #31): replace the whole file with:

```kotlin
package com.app.rasifiters.ui.lifestyle

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.LifestyleData
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.ui.Routes
import com.app.rasifiters.ui.components.kit.KitLoad
import com.app.rasifiters.ui.components.kit.KitStaleBanner
import com.app.rasifiters.ui.components.kit.RefetchOnReconnect
import com.app.rasifiters.ui.components.kit.STALE_BANNER_CLEARANCE
import com.app.rasifiters.ui.components.kit.showsStaleBanner
import com.app.rasifiters.ui.members.GlassIconButton
import com.app.rasifiters.ui.members.MemberPickerSheet
import kotlinx.coroutines.launch

/**
 * The Lifestyle tab (Tab 3) — the workout-types dashboard (iOS `AdminWorkoutTypesTab` / `StandardWorkoutTypesTab`,
 * selected by `isProgramAdmin`): a header with a glass button (→ the workout-types manager), the 4 stat cards, steps,
 * the popularity chart and the two timeline previews. Admins also get a "View as" picker (global-admin → "None"/
 * program-wide; program-admin → self by default, or "Admin"/program-wide). Highest-participation is always program-wide.
 * Polish #10/#31 (the Summary recipe, superseding "load errors swallowed — iOS F1"): kit states keyed by (program, "View
 * as") — a switch starts from Loading, never the previous scope's numbers; a failed part shows "—"; ErrorView + Retry with
 * no data; "Couldn't refresh" when stale; pull to refresh; reload on reconnect.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LifestyleScreen(programContext: ProgramContext, onNavigate: (String) -> Unit) {
    val isAdmin = programContext.isProgramAdmin
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val programName = program?.name ?: ""
    val roster by programContext.members.collectAsStateWithLifecycle()
    val viewAsId by programContext.lifestyleViewAsId.collectAsStateWithLifecycle()
    val chosen by programContext.lifestyleViewAsChosen.collectAsStateWithLifecycle()
    val state by programContext.lifestyleState.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var showPicker by remember { mutableStateOf(false) }
    var pulling by remember { mutableStateOf(false) }

    // The scope the cards show: admins → the "View as" pick (null = program-wide); everyone else → self.
    fun scopeMemberId(): String? = if (isAdmin) programContext.lifestyleViewAsId.value else programContext.loggedInMemberId
    fun reload() { scope.launch { programContext.loadLifestyle(scopeMemberId()) } }

    // Apply the admin default BEFORE the first load, in ONE coroutine, so a program-admin's first fetch is already
    // self-scoped (iOS AdminWorkoutTypesTab.task). A second effect reloads only on a later, user-initiated "View as".
    val loadedOnce = remember(program?.id) { mutableStateOf(false) }
    LaunchedEffect(program?.id, isAdmin) {
        if (isAdmin) programContext.ensureLifestyleViewAsDefault()
        programContext.loadLifestyle(scopeMemberId())
        loadedOnce.value = true
    }
    LaunchedEffect(viewAsId) {
        if (isAdmin && loadedOnce.value) programContext.loadLifestyle(viewAsId)
    }
    // D-KIT-13: back online → a failed / stale Lifestyle reloads by itself.
    RefetchOnReconnect(
        programContext.isOnline,
        needsReload = { programContext.lifestyleState.value.let { it is UiState.Failed || it is UiState.Stale } },
    ) { reload() }

    val selected = roster.firstOrNull { it.id == viewAsId }
    val viewAsLabel = selected?.memberName
        ?: if (programContext.isGlobalAdmin) "Admin"
        else if (chosen) "Admin"
        else (programContext.loggedInMemberName ?: "Member")

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        PullToRefreshBox(
            isRefreshing = pulling,
            onRefresh = { pulling = true; scope.launch { programContext.loadLifestyle(scopeMemberId()); pulling = false } },
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Lifestyle", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                        Text(
                            programName,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        )
                    }
                    GlassIconButton(
                        icon = Icons.Filled.FitnessCenter,
                        contentDescription = "Workout types",
                        onClick = { onNavigate(Routes.LIFESTYLE_WORKOUT_TYPES) },
                    )
                }

                if (isAdmin) ViewAsRow(label = viewAsLabel, onClick = { showPicker = true })

                KitLoad(state, online, onRetry = { reload() }) { data -> LifestyleCardStack(data, onNavigate) }

                Spacer(Modifier.height(if (state.showsStaleBanner(online)) STALE_BANNER_CLEARANCE else 8.dp))
            }
        }
        KitStaleBanner(state, online, onRetry = { reload() })
    }

    if (showPicker) {
        MemberPickerSheet(
            members = roster,
            selectedId = viewAsId,
            showNone = true,
            noneLabel = if (programContext.isGlobalAdmin) "None" else "Admin",
            onSelect = { member -> programContext.setLifestyleViewAs(member?.id); showPicker = false },
            onDismiss = { showPicker = false },
        )
    }
}

/** The loaded cards (unchanged layout): 2×2 stats, steps, popularity, the two timeline previews. */
@Composable
private fun LifestyleCardStack(data: LifestyleData, onNavigate: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        WorkoutTypesTotalCard(total = data.totalTypes, modifier = Modifier.weight(1f))
        WorkoutTypeMostPopularCard(stat = data.mostPopular, modifier = Modifier.weight(1f))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        WorkoutTypeLongestDurationCard(stat = data.longestDuration, modifier = Modifier.weight(1f))
        WorkoutTypeHighestParticipationCard(stat = data.highestParticipation, modifier = Modifier.weight(1f))
    }
    StepsAnalyticsCard(stats = data.steps)
    WorkoutTypePopularityCard(types = data.workoutTypes)
    LifestyleTimelinePreviewCard(timeline = data.timeline, onClick = { onNavigate(Routes.LIFESTYLE_TIMELINE) })
    StepsTimelinePreviewCard(timeline = data.timeline, onClick = { onNavigate(Routes.LIFESTYLE_STEPS_TIMELINE) })
}

/** The "View as" selector row (admin only) — opens the member picker sheet. */
@Composable
private fun ViewAsRow(label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("View as", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.weight(1f))
        Text(label, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f))
        Spacer(Modifier.size(8.dp))
        Icon(Icons.Filled.UnfoldMore, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), modifier = Modifier.size(20.dp))
    }
}
```

**27. `ui/lifestyle/WorkoutTypesListScreen.kt`** (#9, #33)

Add imports:
- `androidx.compose.foundation.rememberScrollState`
- `androidx.compose.foundation.verticalScroll`
- `androidx.compose.material3.CircularProgressIndicator`
- `androidx.compose.material3.pulltorefresh.PullToRefreshBox`
- `com.app.rasifiters.ui.components.kit.KitLoad`
- `com.app.rasifiters.ui.components.kit.KitStaleBanner`
- `com.app.rasifiters.ui.components.kit.STALE_BANNER_CLEARANCE`
- `com.app.rasifiters.ui.components.kit.initialLoadState`
- `com.app.rasifiters.ui.components.kit.rememberLoad`
- `com.app.rasifiters.ui.components.kit.showsStaleBanner`
- `com.app.rasifiters.ui.summary.EmptyText`

Delete `androidx.compose.runtime.LaunchedEffect(Unit) { programContext.loadAllProgramWorkouts() }` (≈:86). In its place, after `var error by remember { mutableStateOf<String?>(null) }`, add:

```kotlin
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    var pulling by remember { mutableStateOf(false) }
    // Polish #9: the add / edit sheet shows its own saving state + error (it used to draw the error behind the sheet).
    var sheetSaving by remember { mutableStateOf(false) }
    var sheetError by remember { mutableStateOf<String?>(null) }
    // Polish #33: the catalog on the kit states — ErrorView + Retry on failure, an honest empty line, pull to refresh.
    val load = rememberLoad(program?.id, programContext.isOnline, initial = { initialLoadState(all.isNotEmpty()) }) {
        programContext.loadAllProgramWorkouts()
    }

    fun saveSheet(block: suspend () -> Result<Unit>, onSaved: () -> Unit) {
        sheetSaving = true; sheetError = null
        scope.launch {
            block().onSuccess { onSaved() }.onFailure { e ->
                val message = e.toAppError().message
                // Shown inside the open sheet; if it was swiped away meanwhile, on the list instead.
                if (showAdd || editTarget != null) sheetError = message else error = message
            }
            sheetSaving = false
        }
    }
```

Header:
- `Box(modifier = Modifier.fillMaxWidth().height(44.dp)) {` becomes `Box(modifier = Modifier.fillMaxWidth().height(48.dp)) {` (the 48dp back target, #36).
- The add `IconButton(onClick = { error = null; showAdd = true }, …)` becomes `IconButton(onClick = { error = null; sheetError = null; showAdd = true }, …)`.

Replace the `LazyColumn(modifier = Modifier.fillMaxSize()) { … }` (≈:139-166) with:

```kotlin
            PullToRefreshBox(
                isRefreshing = pulling,
                onRefresh = { pulling = true; scope.launch { load.refresh(); pulling = false } },
                modifier = Modifier.fillMaxSize(),
            ) {
                // The non-list states scroll too, so pull-to-refresh also works on an error or an empty catalog.
                KitLoad(
                    load.state, online, onRetry = load::reload,
                    boxModifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = 32.dp),
                ) { _ ->
                    if (visible.isEmpty() && (!canManage || hidden.isEmpty())) {
                        Box(
                            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = 32.dp),
                            contentAlignment = Alignment.TopCenter,
                        ) {
                            EmptyText(if (query.isBlank()) "No workout types yet." else "No workout types match your search.")
                        }
                    } else {
                        LazyColumn(modifier = Modifier.fillMaxSize()) {
                            if (visible.isNotEmpty()) {
                                item(key = "avail-header") { SectionHeader("Available (${visible.size})") }
                                items(visible, key = { "v-${it.id}" }) { w ->
                                    WorkoutRow(w, canManage, onEdit = { sheetError = null; editTarget = w }, onDelete = { deleteTarget = w },
                                        onToggle = { perform { toggle(programContext, w) } })
                                }
                            }
                            if (canManage && hidden.isNotEmpty()) {
                                item(key = "hidden-header") {
                                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)) {
                                        Icon(Icons.Filled.VisibilityOff, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f), modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.size(6.dp))
                                        Text(
                                            "Hidden (${hidden.size})",
                                            style = MaterialTheme.typography.labelLarge,
                                            fontWeight = FontWeight.SemiBold,
                                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                                        )
                                    }
                                }
                                items(hidden, key = { "h-${it.id}" }) { w ->
                                    WorkoutRow(w, canManage, onEdit = { sheetError = null; editTarget = w }, onDelete = { deleteTarget = w },
                                        onToggle = { perform { toggle(programContext, w) } })
                                }
                            }
                            item { Spacer(Modifier.height(if (load.state.showsStaleBanner(online)) STALE_BANNER_CLEARANCE else 24.dp)) }
                        }
                    }
                }
            }
```

Directly before the root `Box`'s closing brace (after the `Column`'s closing brace) add `KitStaleBanner(load.state, online, onRetry = load::reload)`.

Replace the `if (showAdd) { … }` and `editTarget?.let { … }` sheet blocks (≈:170-190) with:

```kotlin
    if (showAdd) {
        WorkoutNameSheet(
            title = "New Workout",
            initial = "",
            confirmLabel = "Add",
            saving = sheetSaving,
            error = sheetError,
            onConfirm = { name -> saveSheet({ programContext.addCustomProgramWorkout(name) }) { showAdd = false } },
            onDismiss = { showAdd = false },
        )
    }
    editTarget?.let { w ->
        WorkoutNameSheet(
            title = "Edit Workout",
            initial = w.workoutName,
            confirmLabel = "Save",
            saving = sheetSaving,
            error = sheetError,
            onConfirm = { name ->
                val id = w.id
                if (id != null) saveSheet({ programContext.editCustomProgramWorkout(id, name) }) { editTarget = null }
            },
            onDismiss = { editTarget = null },
        )
    }
```

`WorkoutNameSheet`:
- Add the parameters `saving: Boolean,` and `error: String?,` after `confirmLabel: String,`.
- Replace its button `Row(…) { TextButton(Cancel) … TextButton(confirm) … }` (≈:323-329) with:

```kotlin
            // Polish #9: the save error shows HERE, inside the open sheet.
            error?.let { FormErrorText(it) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.align(Alignment.End)) {
                TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancel") }
                TextButton(
                    onClick = { onConfirm(name.trim()) },
                    enabled = name.trim().isNotEmpty() && !saving,
                ) {
                    if (saving) CircularProgressIndicator(strokeWidth = 2.dp, color = AppOrange, modifier = Modifier.size(18.dp))
                    else Text(confirmLabel, fontWeight = FontWeight.Bold, color = AppOrange)
                }
            }
```

### F. Detail screens

**28. `ui/summary/ChartPrimitives.kt`** (#26 dependency)
- Replace `import androidx.compose.foundation.gestures.detectDragGestures` with `import androidx.compose.foundation.gestures.detectHorizontalDragGestures`.
- In both charts (≈:93 `BarLineChart`, ≈:213-217 `SleepDietChart`), replace `detectDragGestures { change, _ ->` with `detectHorizontalDragGestures { change, _ ->`. The body is unchanged.
- Add the line `// Polish #26: horizontal-only scrub — a vertical drag over the chart scrolls the page instead.` directly above each `.pointerInput(n) {` block that contains it.
- The tooltip look is untouched (the shared Android tooltip).

**29. `ui/summary/DetailChrome.kt`** (#16, #36)

Add the imports `com.app.rasifiters.ui.components.selectableTarget` and `com.app.rasifiters.ui.components.tapTarget`.

Below `private val DATE_FMT …` add:

```kotlin
// Polish #16: an empty picker says why instead of opening an empty sheet.
private const val PICKER_EMPTY_HINT = "Nothing to choose from yet."
private const val PICKER_NO_MATCH_HINT = "No matches."
```

Replace `CircleBackButton` with its KDoc (≈:70-87):

```kotlin
/** The circular back button (grey circle + chevron) top-left of every detail/log screen. Polish #36: a labelled 48dp target. */
@Composable
fun CircleBackButton(onBack: () -> Unit) {
    Box(
        modifier = Modifier
            .tapTarget("Back", shape = CircleShape, onClick = onBack)
            .size(44.dp)
            .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.size(22.dp),
        )
    }
}
```

In `DetailTopBar`, `Box(modifier = Modifier.fillMaxWidth().height(44.dp))` becomes `Box(modifier = Modifier.fillMaxWidth().height(48.dp))`.

In `SearchablePickerField`, replace the `LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp)) { … }` block (≈:192-216) with:

```kotlin
                if (filtered.isEmpty()) {
                    Text(
                        if (options.isEmpty()) PICKER_EMPTY_HINT else PICKER_NO_MATCH_HINT,
                        style = MaterialTheme.typography.bodyMedium,
                        color = fieldHintColor(),
                        modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
                    )
                } else {
                    LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp)) {
                        items(filtered, key = { it.value }) { option ->
                            val selected = option.value == selectedValue
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onSelect(option.value); open = false }
                                    .padding(vertical = 14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    option.label,
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.weight(1f),
                                )
                                if (selected) {
                                    Icon(Icons.Filled.Check, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                                }
                            }
                        }
                    }
                }
```

`PeriodSelector`:
- `.clickable { onSelect(p) }` becomes `.selectableTarget(selected = active, label = p.spokenLabel()) { onSelect(p) }`, staying after `.background(...)`.
- Add directly below `PeriodSelector`:

```kotlin
/** Polish #36: the segment's spoken name ("Week", not "W"). */
private fun Period.spokenLabel(): String = when (key) {
    "week" -> "Week"
    "month" -> "Month"
    "year" -> "Year"
    else -> "Program"
}
```

**30. `ui/summary/ActivityDetailScreen.kt`** (#26, #29, #34)
- Add imports:
  - `androidx.compose.foundation.rememberScrollState`
  - `androidx.compose.foundation.verticalScroll`
  - `androidx.lifecycle.compose.collectAsStateWithLifecycle`
  - `com.app.rasifiters.core.kit.dataOrNull`
  - `com.app.rasifiters.ui.components.kit.KitLoad`
  - `com.app.rasifiters.ui.components.kit.rememberLoad`
- Delete the imports `androidx.compose.runtime.LaunchedEffect`, `androidx.compose.material3.CircularProgressIndicator` and `com.app.rasifiters.net.ActivityTimelinePoint`.
- Replace the body of `ActivityDetailScreen` (everything inside its braces, ≈:42-129) with:

```kotlin
    var period by remember { mutableStateOf(PERIODS.first()) }
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    // Polish #29/#34: one load per period — a switch starts from Loading, so the old period's bars never sit under the
    // new label, and a failure shows ErrorView + Retry (not "No data for this range").
    val load = rememberLoad(period.key, programContext.isOnline) { programContext.loadActivityTimeline(period.key) }
    val data = load.state.dataOrNull

    // Week uses a friendly fixed label; month/year/program use the server's range label (iOS parity).
    val rangeLabel = if (period.key == "week") "This Week" else data?.label?.ifBlank { null } ?: period.range

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())   // polish #26
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            CircleBackButton(onBack)
            Column {
                Text("Workout Activity Timeline", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Workouts · Active members",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }

            PeriodSelector(selected = period, onSelect = { period = it })

            Column {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "DAILY AVERAGE",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
                        modifier = Modifier.alignByBaseline(),
                    )
                    Text(rangeLabel, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.alignByBaseline())
                }
                Text(
                    data?.let { formatAverage(it.dailyAverage) } ?: "\u2014",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = AppOrange,
                )
            }

            KitLoad(load.state, online, onRetry = load::reload, boxModifier = Modifier.fillMaxWidth().height(360.dp)) { resp ->
                val points = resp.buckets
                if (points.isEmpty()) {
                    ChartCenter { EmptyText("No data for this range yet.") }
                } else {
                    BarLineChart(
                        values = points.map { it.workouts },
                        labels = axisLabels(points.map { it.label }, period.key),
                        lineValues = points.map { it.activeMembers },
                        barColor = AppOrange,
                        lineColor = AppPurple,
                        barWidth = 14.dp,
                        modifier = Modifier.fillMaxWidth().height(360.dp),
                        tooltip = { i ->
                            val p = points[i]
                            TooltipData(
                                title = calloutTitle(p.date, p.label),
                                rows = listOf(
                                    TooltipRow("${p.workouts} ${plural(p.workouts, "workout")}", AppOrange),
                                    TooltipRow("${p.activeMembers} active", AppPurple),
                                ),
                            )
                        },
                    )
                }
            }
        }
    }
```

**31. `ui/summary/DistributionDetailScreen.kt`** (#26; advisory 2)
- Add the imports `androidx.compose.foundation.rememberScrollState` and `androidx.compose.foundation.verticalScroll`.
- In the `Column` modifier, insert `.verticalScroll(rememberScrollState())   // polish #26` directly after `.fillMaxSize()`.
- Replace `if (!hasData) {` (≈:56) with the block below. The existing `Box(…) { EmptyText("No workouts logged yet.") }` and the `} else { BarLineChart(…) }` stay as they are.

```kotlin
            if (summary.distribution == null) {
                // Polish #29: missing data reads "—", never "No workouts logged yet." (the Summary card isn't tappable then).
                Box(modifier = Modifier.fillMaxWidth().height(360.dp), contentAlignment = Alignment.Center) {
                    EmptyText("\u2014")
                }
            } else if (!hasData) {
```

**32. `ui/lifestyle/LifestyleTimelineDetailScreen.kt`** (#26, #29, #34)
- Add imports:
  - `androidx.compose.foundation.rememberScrollState`
  - `androidx.compose.foundation.verticalScroll`
  - `androidx.lifecycle.compose.collectAsStateWithLifecycle`
  - `com.app.rasifiters.core.kit.dataOrNull`
  - `com.app.rasifiters.ui.components.kit.KitLoad`
  - `com.app.rasifiters.ui.components.kit.rememberLoad`
- Delete the imports `androidx.compose.runtime.LaunchedEffect`, `androidx.compose.material3.CircularProgressIndicator` and `com.app.rasifiters.net.HealthTimelinePoint`.
- Replace everything in `LifestyleTimelineDetailScreen` from `var period by remember …` (≈:59) through the closing brace of the root `Box` (≈:128) with:

```kotlin
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    var period by remember { mutableStateOf(PERIODS.first()) }
    // Polish #29/#34: one load per (period, member) — ErrorView + Retry on failure; the old period never sits under the new label.
    val load = rememberLoad(period.key to memberId, programContext.isOnline) { programContext.loadHealthTimeline(period.key, memberId) }
    val data = load.state.dataOrNull
    val rangeLabel = if (period.key == "week") "This Week" else data?.label?.ifBlank { null } ?: period.range

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())   // polish #26
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            CircleBackButton(onBack)
            Column {
                Text("Lifestyle Timeline", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("Sleep · Diet quality", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }
            PeriodSelector(selected = period, onSelect = { period = it })
            DailyAverageHeader(rangeLabel = rangeLabel, avgSleep = data?.dailyAverageSleep, avgFood = data?.dailyAverageFood)
            KitLoad(load.state, online, onRetry = load::reload, boxModifier = Modifier.fillMaxWidth().height(320.dp), spinnerColor = AppBlue) { resp ->
                val points = resp.buckets
                if (points.isEmpty()) {
                    ChartCenter { EmptyText("No data for this range yet.") }
                } else {
                    SleepDietChart(
                        labels = axisLabels(points.map { it.label }, period.key),
                        sleepHours = points.map { it.sleepHours },
                        dietQuality = points.map { it.foodQuality },
                        dualAxis = true,
                        barColor = AppBlue.copy(alpha = 0.9f),
                        lineColor = AppGreen,
                        modifier = Modifier.fillMaxWidth().height(320.dp),
                        tooltip = { i ->
                            val p = points[i]
                            TooltipData(
                                title = calloutTitle(p.date, p.label),
                                rows = listOf(
                                    TooltipRow(String.format(Locale.US, "Sleep: %.1f hrs", p.sleepHours), AppBlue),
                                    TooltipRow(String.format(Locale.US, "Diet: %.1f / 5", p.foodQuality), AppGreen),
                                ),
                            )
                        },
                    )
                    ChartLegend()
                }
            }
        }
    }
```

`DailyAverageHeader`:
- The signature becomes `private fun DailyAverageHeader(rangeLabel: String, avgSleep: Double?, avgFood: Double?) {`.
- Its two `AverageStat` lines become:

```kotlin
            AverageStat("Sleep", avgSleep?.let { String.format(Locale.US, "%.1f hrs", it) } ?: "\u2014", AppBlue)
            AverageStat("Diet", avgFood?.let { String.format(Locale.US, "%.1f / 5", it) } ?: "\u2014", AppGreen)
```

**33. `ui/lifestyle/StepsTimelineDetailScreen.kt`** (#26, #29, #34)
- Add the same imports as step 32, and delete the same three imports.
- Replace the whole `StepsTimelineDetailScreen` function (≈:53-124) with:

```kotlin
@Composable
fun StepsTimelineDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    // Same scoping as the tab: admins → the "View as" pick (null = program-wide); everyone else → self.
    val memberId = if (programContext.isProgramAdmin) programContext.lifestyleViewAsId.value
    else programContext.loggedInMemberId
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    var period by remember { mutableStateOf(PERIODS.first()) }
    // Polish #29/#34: one load per (period, member) — ErrorView + Retry on failure; the old period never sits under the new label.
    val load = rememberLoad(period.key to memberId, programContext.isOnline) { programContext.loadHealthTimeline(period.key, memberId) }
    val data = load.state.dataOrNull
    val rangeLabel = if (period.key == "week") "This Week" else data?.label?.ifBlank { null } ?: period.range

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())   // polish #26
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            CircleBackButton(onBack)
            Column {
                Text("Steps Timeline", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("Daily steps", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }
            PeriodSelector(selected = period, onSelect = { period = it })
            DailyAverageHeader(rangeLabel = rangeLabel, avgSteps = data?.dailyAverageSteps)
            KitLoad(load.state, online, onRetry = load::reload, boxModifier = Modifier.fillMaxWidth().height(320.dp), spinnerColor = StepsTeal) { resp ->
                val points = resp.buckets
                if (points.isEmpty()) {
                    ChartCenter { EmptyText("No data for this range yet.") }
                } else {
                    BarLineChart(
                        values = points.map { it.steps },
                        labels = axisLabels(points.map { it.label }, period.key),
                        lineValues = null,
                        barColor = StepsTeal,
                        lineColor = StepsTeal,
                        barWidth = 14.dp,
                        modifier = Modifier.fillMaxWidth().height(320.dp),
                        tooltip = { i ->
                            val p = points[i]
                            TooltipData(
                                title = calloutTitle(p.date, p.label),
                                rows = listOf(TooltipRow(String.format(Locale.US, "Steps: %,d", p.steps), StepsTeal)),
                            )
                        },
                    )
                    ChartLegend()
                }
            }
        }
    }
}
```

`DailyAverageHeader`:
- The signature becomes `private fun DailyAverageHeader(rangeLabel: String, avgSteps: Int?) {`.
- Its stat line becomes `AverageStat("Steps", avgSteps?.let { String.format(Locale.US, "%,d", it) } ?: "\u2014", StepsTeal)`.

**34. `ui/members/MemberSimpleDetails.kt`** (#26, #29, #34, #36)
- Delete these imports: `androidx.compose.foundation.clickable`, `androidx.compose.runtime.DisposableEffect`, `androidx.compose.runtime.LaunchedEffect`, `androidx.compose.material3.CircularProgressIndicator`.
- Add these imports:
  - `androidx.compose.foundation.rememberScrollState`
  - `androidx.compose.foundation.verticalScroll`
  - `com.app.rasifiters.core.kit.UiState`
  - `com.app.rasifiters.core.kit.dataOrNull`
  - `com.app.rasifiters.net.MemberHistoryResponse`
  - `com.app.rasifiters.net.MemberStreaksResponse`
  - `com.app.rasifiters.ui.components.kit.KitLoad`
  - `com.app.rasifiters.ui.components.kit.rememberLoad`
  - `com.app.rasifiters.ui.summary.PERIODS`
  - `com.app.rasifiters.ui.summary.PeriodSelector`
- Delete `private data class HPeriod`, `private val HISTORY_PERIODS` and the whole `HistoryPeriodSelector` function. The shared `PeriodSelector` is the same control with the same keys, labels and ranges, and it already carries the #36 fix.
- In the file header comment, replace "(W/M/Y/P single-series chart, resets to week on leave)" with "(W/M/Y/P single-series chart; the detail keeps its own result, polish #34)".

Replace `MemberStreakDetailScreen` with:

```kotlin
@Composable
fun MemberStreakDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val memberId by programContext.focusedMemberId.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    // Polish #29: the detail loads its member's streaks itself — a failure shows ErrorView + Retry, never "No streak data."
    // It opens on the card's numbers (the card it was tapped from is this member's) and refreshes underneath.
    val load = rememberLoad<MemberStreaksResponse>(
        memberId, programContext.isOnline,
        initial = { programContext.memberStreaks.value?.let { UiState.fresh(it) } ?: UiState.Loading },
    ) {
        val id = memberId ?: return@rememberLoad Result.failure(IllegalStateException("No member selected."))
        programContext.loadMemberStreaks(id)
    }
    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())   // polish #26
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Streak Stats")
            KitLoad(load.state, online, onRetry = load::reload, boxModifier = Modifier.fillMaxWidth().height(200.dp)) { s ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StreakTile(Icons.Filled.LocalFireDepartment, AppOrange, "Current", "${s.currentStreakDays} days", Modifier.weight(1f))
                    StreakTile(Icons.Filled.EmojiEvents, AppYellow, "Longest", "${s.longestStreakDays} days", Modifier.weight(1f))
                }
                Text("Milestones", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                MilestoneChips(s.milestones.map { it.dayValue to it.achieved })
            }
        }
    }
}
```

Replace `MemberHistoryDetailScreen` with:

```kotlin
@Composable
fun MemberHistoryDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val memberId by programContext.focusedMemberId.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    var period by remember { mutableStateOf(PERIODS.first()) }
    // Polish #29/#34: one load per (period, member), kept by this screen — never written into the Members-tab card (so no
    // reset-to-week on leave), never the old period's bars under the new label, ErrorView + Retry on failure.
    val load = rememberLoad<MemberHistoryResponse>(period.key to memberId, programContext.isOnline) {
        val id = memberId ?: return@rememberLoad Result.failure(IllegalStateException("No member selected."))
        programContext.loadMemberHistory(id, period.key, publish = false)
    }
    val data = load.state.dataOrNull
    val rangeLabel = if (period.key == "week") "This Week" else data?.label?.ifBlank { null } ?: period.range

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())   // polish #26
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Workout History")
            Column {
                Text("Workout Activity Timeline", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("Workouts", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }
            PeriodSelector(selected = period, onSelect = { period = it })
            Column {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "DAILY AVERAGE",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
                        modifier = Modifier.alignByBaseline(),
                    )
                    Text(rangeLabel, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.alignByBaseline())
                }
                Text(
                    data?.let { it.dailyAverage.roundToInt().toString() } ?: "\u2014",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = AppOrange,
                )
            }
            KitLoad(load.state, online, onRetry = load::reload, boxModifier = Modifier.fillMaxWidth().height(360.dp)) { resp ->
                val buckets = resp.buckets
                if (buckets.isEmpty()) {
                    Box(modifier = Modifier.fillMaxWidth().height(360.dp), contentAlignment = Alignment.Center) {
                        Text("No data for this range yet.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    }
                } else {
                    BarLineChart(
                        values = buckets.map { it.workouts },
                        labels = axisLabels(buckets.map { it.label }, period.key),
                        lineValues = null,
                        barColor = AppOrange,
                        lineColor = AppOrange,
                        barWidth = 14.dp,
                        modifier = Modifier.fillMaxWidth().height(360.dp),
                        tooltip = { i -> memberWorkoutsTooltip(buckets[i].date, buckets[i].label, buckets[i].workouts) },
                    )
                }
            }
        }
    }
}
```

**35. `ui/members/MemberRecentDetailScreen.kt`** (#24, #29, #34, #36)

Add imports:
- `androidx.compose.material3.CircularProgressIndicator`
- `com.app.rasifiters.core.kit.dataOrNull`
- `com.app.rasifiters.ui.components.tapTarget`
- `com.app.rasifiters.ui.components.kit.KitLoad`
- `com.app.rasifiters.ui.components.kit.KitStaleBanner`
- `com.app.rasifiters.ui.components.kit.STALE_BANNER_CLEARANCE`
- `com.app.rasifiters.ui.components.kit.rememberLoad`
- `com.app.rasifiters.ui.components.kit.showsStaleBanner`

Keep `clickable` and `LaunchedEffect`; `LogSortSheet` and `WorkoutFilterSheet` still use them.

Replace the whole `MemberRecentDetailScreen` function (≈:86-224) with:

```kotlin
@Composable
fun MemberRecentDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val memberId by programContext.focusedMemberId.collectAsStateWithLifecycle()
    val memberName by programContext.focusedMemberName.collectAsStateWithLifecycle()
    val locked = programContext.dataEntryLocked

    var sortField by remember { mutableStateOf(WorkoutSortField.DATE) }
    var sortDir by remember { mutableStateOf(SortDir.DESC) }
    var filters by remember { mutableStateOf(WorkoutFilters()) }
    var showSort by remember { mutableStateOf(false) }
    var showFilter by remember { mutableStateOf(false) }
    var editItem by remember { mutableStateOf<MemberRecentItem?>(null) }
    var deleteItem by remember { mutableStateOf<MemberRecentItem?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }
    // Polish #24: a write in flight disables its buttons and spins — a double tap can't send a second delete.
    var saving by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }

    // Polish #29/#34: this screen's own list — one load per (member, sort, filters), never the Members-tab preview's rows;
    // a failed load shows ErrorView + Retry instead of "No workouts found."; the CSV is exactly the list on screen.
    val load = rememberLoad<List<MemberRecentItem>>(listOf(memberId, sortField, sortDir, filters), programContext.isOnline) {
        val id = memberId ?: return@rememberLoad Result.failure(IllegalStateException("No member selected."))
        programContext.loadMemberRecent(
            memberId = id, limit = 0,
            startDate = if (filters.custom) filters.start?.toString() else null,
            endDate = if (filters.custom) filters.end?.toString() else null,
            sortBy = sortField.api, sortDir = sortDir.api,
            workoutType = filters.workoutType,
            minDuration = filters.minDuration.toIntOrNull(),
            maxDuration = filters.maxDuration.toIntOrNull(),
            publish = false,
        )
    }
    val items = load.state.dataOrNull.orEmpty()

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            DetailTopBarWithExport(
                onBack = onBack, title = "View Workouts",
                exportEnabled = items.isNotEmpty(),
                onExport = { shareCsv(context, "Workouts_${sanitize(memberName)}.csv", workoutsCsv(items)) },
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ControlButton("Sort: ${sortField.label}", Icons.Filled.UnfoldMore, Modifier.weight(1f)) { showSort = true }
                ControlButton(if (filters.isActive) "Filter •" else "Filter", Icons.Filled.FilterList, Modifier.weight(1f)) { showFilter = true }
            }
            KitLoad(load.state, online, onRetry = load::reload, loading = { repeat(5) { SkeletonCard(height = 60.dp) } }) { list ->
                if (list.isEmpty()) {
                    Text("No workouts found.", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                    Text("Adjust filters or log a workout to get started.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                } else {
                    list.forEach { w ->
                        LogRow(
                            dotColor = AppOrange,
                            title = w.workoutType,
                            subtitle = w.workoutDate,
                            trailing = formatDurationHM(w.durationMinutes),
                            locked = locked,
                            onEdit = { editItem = w },
                            onDelete = { deleteItem = w },
                        )
                    }
                }
            }
            if (load.state.showsStaleBanner(online)) Spacer(Modifier.height(STALE_BANNER_CLEARANCE))
        }
        KitStaleBanner(load.state, online, onRetry = load::reload)
    }

    if (showSort) {
        LogSortSheet(
            fields = WorkoutSortField.entries.map { it.label },
            currentIndex = WorkoutSortField.entries.indexOf(sortField),
            direction = sortDir,
            onField = { sortField = WorkoutSortField.entries[it] },
            onDirection = { sortDir = it },
            onDismiss = { showSort = false },
        )
    }
    if (showFilter) {
        WorkoutFilterSheet(
            programContext = programContext,
            initial = filters,
            onApply = { filters = it; showFilter = false },
            onClear = { filters = WorkoutFilters(); showFilter = false },
            onDismiss = { showFilter = false },
        )
    }

    editItem?.let { item ->
        WorkoutEditSheet(
            item = item,
            saving = saving,
            onDismiss = { editItem = null },
            onSave = { minutes ->
                saving = true
                scope.launch {
                    val other = memberId != null && memberId != programContext.loggedInMemberId
                    programContext.updateWorkoutLog(
                        memberName = if (other) memberName else null,
                        workoutName = item.workoutType, date = item.workoutDate, durationMinutes = minutes,
                    ).onSuccess { editItem = null; load.reload() }
                        .onFailure { actionError = it.toAppError().message }
                    saving = false
                }
            },
        )
    }

    deleteItem?.let { item ->
        AlertDialog(
            onDismissRequest = { if (!deleting) deleteItem = null },
            title = { Text("Delete workout") },
            text = { Text("Are you sure you want to delete this ${item.workoutType} workout from ${item.workoutDate}?") },
            confirmButton = {
                TextButton(enabled = !deleting, onClick = {
                    deleting = true
                    scope.launch {
                        programContext.deleteWorkoutLog(memberId, null, item.workoutType, item.workoutDate)
                            .onSuccess { load.reload() }
                            .onFailure { actionError = it.toAppError().message }
                        deleting = false
                        deleteItem = null
                    }
                }) {
                    if (deleting) CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                    else Text("Delete", color = AppRed)
                }
            },
            dismissButton = { TextButton(enabled = !deleting, onClick = { deleteItem = null }) { Text("Cancel") } },
        )
    }

    actionError?.let { msg ->
        AlertDialog(
            onDismissRequest = { actionError = null },
            confirmButton = { TextButton(onClick = { actionError = null }) { Text("OK") } },
            title = { Text("Something went wrong") },
            text = { Text(msg) },
        )
    }
}
```

`LogRow` ⋮ (#36): replace its `Icon(Icons.Filled.MoreVert, contentDescription = "Actions", …, modifier = Modifier.padding(start = 6.dp).size(22.dp).clip(CircleShape).clickable { menuOpen = true },)` (≈:254-258) with:

```kotlin
                Icon(
                    Icons.Filled.MoreVert, contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
                    modifier = Modifier.padding(start = 6.dp).tapTarget("Actions", shape = CircleShape) { menuOpen = true }.size(22.dp),
                )
```

`WorkoutEditSheet`:
- The signature becomes `private fun WorkoutEditSheet(item: MemberRecentItem, saving: Boolean, onDismiss: () -> Unit, onSave: (Int) -> Unit) {`.
- Its button becomes `PillButton(label = "Save changes", onClick = { if (valid && !saving) onSave(total) }, enabled = valid, loading = saving)`.

**36. `ui/members/MemberHealthDetailScreen.kt`** (#24, #29, #34, #36)

Add imports:
- `androidx.compose.foundation.layout.height`
- `androidx.compose.material3.CircularProgressIndicator`
- `com.app.rasifiters.core.kit.dataOrNull`
- `com.app.rasifiters.ui.components.tapTarget`
- `com.app.rasifiters.ui.components.kit.KitLoad`
- `com.app.rasifiters.ui.components.kit.KitStaleBanner`
- `com.app.rasifiters.ui.components.kit.STALE_BANNER_CLEARANCE`
- `com.app.rasifiters.ui.components.kit.rememberLoad`
- `com.app.rasifiters.ui.components.kit.showsStaleBanner`

Delete the imports `androidx.compose.foundation.clickable` and `androidx.compose.runtime.LaunchedEffect` (only the ⋮ and the reload used them).

Replace the whole `MemberHealthDetailScreen` function (≈:87-225) with:

```kotlin
@Composable
fun MemberHealthDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val memberId by programContext.focusedMemberId.collectAsStateWithLifecycle()
    val memberName by programContext.focusedMemberName.collectAsStateWithLifecycle()
    val locked = programContext.dataEntryLocked

    var sortField by remember { mutableStateOf(HealthSortField.DATE) }
    var sortDir by remember { mutableStateOf(SortDir.DESC) }
    var filters by remember { mutableStateOf(HealthFilters()) }
    var showSort by remember { mutableStateOf(false) }
    var showFilter by remember { mutableStateOf(false) }
    var editItem by remember { mutableStateOf<MemberHealthItem?>(null) }
    var deleteItem by remember { mutableStateOf<MemberHealthItem?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }
    // Polish #24: a write in flight disables its buttons and spins — a double tap can't send a second delete.
    var saving by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }

    // Polish #29/#34: this screen's own list — one load per (member, sort, filters), never the Members-tab preview's rows;
    // a failed load shows ErrorView + Retry instead of "No daily health logs found."; the CSV is exactly the list on screen.
    val load = rememberLoad<List<MemberHealthItem>>(listOf(memberId, sortField, sortDir, filters), programContext.isOnline) {
        val id = memberId ?: return@rememberLoad Result.failure(IllegalStateException("No member selected."))
        programContext.loadMemberHealthLogs(
            memberId = id, limit = 0,
            startDate = if (filters.custom) filters.start?.toString() else null,
            endDate = if (filters.custom) filters.end?.toString() else null,
            sortBy = sortField.api, sortDir = sortDir.api,
            minSleepHours = filters.minSleep.toDoubleOrNull(),
            maxSleepHours = filters.maxSleep.toDoubleOrNull(),
            minFoodQuality = filters.minDiet.toIntOrNull(),
            maxFoodQuality = filters.maxDiet.toIntOrNull(),
            minSteps = filters.minSteps.toIntOrNull(),
            maxSteps = filters.maxSteps.toIntOrNull(),
            publish = false,
        )
    }
    val items = load.state.dataOrNull.orEmpty()

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            DetailTopBarWithExport(
                onBack = onBack, title = "View Health",
                exportEnabled = items.isNotEmpty(),
                onExport = { shareCsv(context, "HealthLogs_${sanitize(memberName)}.csv", healthCsv(items)) },
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ControlButton("Sort: ${sortField.label}", Icons.Filled.UnfoldMore, Modifier.weight(1f)) { showSort = true }
                ControlButton(if (filters.isActive) "Filter •" else "Filter", Icons.Filled.FilterList, Modifier.weight(1f)) { showFilter = true }
            }
            KitLoad(load.state, online, onRetry = load::reload, loading = { repeat(5) { SkeletonCard(height = 60.dp) } }) { list ->
                if (list.isEmpty()) {
                    Text("No daily health logs found.", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                    Text("Adjust filters or log daily health to get started.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                } else {
                    list.forEach { h ->
                        // DC-10 row: date + ⋮ on top; three labeled metric cells (Sleep / Diet / Steps, "—" when unset).
                        val sleep = h.sleepHours?.let { String.format(Locale.US, "%.1f hrs", it) } ?: "—"
                        val diet = h.foodQuality?.let { "$it/5" } ?: "—"
                        val steps = h.steps?.let { String.format(Locale.US, "%,d", it) } ?: "—"
                        HealthLogRow(
                            date = h.logDate, sleep = sleep, diet = diet, steps = steps,
                            locked = locked, onEdit = { editItem = h }, onDelete = { deleteItem = h },
                        )
                    }
                }
            }
            if (load.state.showsStaleBanner(online)) Spacer(Modifier.height(STALE_BANNER_CLEARANCE))
        }
        KitStaleBanner(load.state, online, onRetry = load::reload)
    }

    if (showSort) {
        LogSortSheet(
            fields = HealthSortField.entries.map { it.label },
            currentIndex = HealthSortField.entries.indexOf(sortField),
            direction = sortDir,
            onField = { sortField = HealthSortField.entries[it] },
            onDirection = { sortDir = it },
            onDismiss = { showSort = false },
        )
    }
    if (showFilter) {
        HealthFilterSheet(
            initial = filters,
            onApply = { filters = it; showFilter = false },
            onClear = { filters = HealthFilters(); showFilter = false },
            onDismiss = { showFilter = false },
        )
    }

    editItem?.let { item ->
        HealthEditSheet(
            item = item,
            saving = saving,
            onDismiss = { editItem = null },
            onSave = { sleepHours, foodQuality, steps ->
                val id = memberId ?: return@HealthEditSheet
                saving = true
                scope.launch {
                    programContext.updateDailyHealthLog(
                        id, item.logDate, sleepHours, foodQuality, steps, stepsProvided = true,
                    )
                        .onSuccess { editItem = null; load.reload() }
                        .onFailure { actionError = it.toAppError().message }
                    saving = false
                }
            },
        )
    }

    deleteItem?.let { item ->
        AlertDialog(
            onDismissRequest = { if (!deleting) deleteItem = null },
            title = { Text("Delete daily health log") },
            text = { Text("Are you sure you want to delete this daily health log from ${item.logDate}?") },
            confirmButton = {
                TextButton(enabled = !deleting, onClick = {
                    val id = memberId ?: return@TextButton
                    deleting = true
                    scope.launch {
                        programContext.deleteDailyHealthLog(id, item.logDate)
                            .onSuccess { load.reload() }
                            .onFailure { actionError = it.toAppError().message }
                        deleting = false
                        deleteItem = null
                    }
                }) {
                    if (deleting) CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                    else Text("Delete", color = AppRed)
                }
            },
            dismissButton = { TextButton(enabled = !deleting, onClick = { deleteItem = null }) { Text("Cancel") } },
        )
    }

    actionError?.let { msg ->
        AlertDialog(
            onDismissRequest = { actionError = null },
            confirmButton = { TextButton(onClick = { actionError = null }) { Text("OK") } },
            title = { Text("Something went wrong") },
            text = { Text(msg) },
        )
    }
}
```

`HealthLogRow` ⋮ (#36): replace its `Icon(Icons.Filled.MoreVert, contentDescription = "Actions", …, modifier = Modifier.size(22.dp).clip(CircleShape).clickable { menuOpen = true },)` (≈:255-259) with:

```kotlin
                    Icon(
                        Icons.Filled.MoreVert, contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
                        modifier = Modifier.tapTarget("Actions", shape = CircleShape) { menuOpen = true }.size(22.dp),
                    )
```

`HealthEditSheet`:
- The signature becomes `private fun HealthEditSheet(item: MemberHealthItem, saving: Boolean, onDismiss: () -> Unit, onSave: (Double?, Int?, Int?) -> Unit) {`.
- Its button becomes `PillButton(label = "Save changes", onClick = { if (valid && !saving) onSave(sleepValue, foodValue, stepsValue) }, enabled = valid, loading = saving)`.

**37. `ui/members/MemberMetricsDetailScreen.kt`** (#29, #34, #36)

Add imports:
- `androidx.compose.foundation.shape.CircleShape`
- `androidx.compose.ui.semantics.Role`
- `com.app.rasifiters.core.kit.dataOrNull`
- `com.app.rasifiters.ui.components.selectableTarget`
- `com.app.rasifiters.ui.components.tapTarget`
- `com.app.rasifiters.ui.components.kit.KitLoad`
- `com.app.rasifiters.ui.components.kit.KitStaleBanner`
- `com.app.rasifiters.ui.components.kit.STALE_BANNER_CLEARANCE`
- `com.app.rasifiters.ui.components.kit.rememberLoad`
- `com.app.rasifiters.ui.components.kit.showsStaleBanner`

Delete **only** `import androidx.compose.runtime.LaunchedEffect`. Keep `collectAsStateWithLifecycle` (used by `program` and `online`) and `clickable` (used by `ControlButton` and `SortSheet`).

Replace the whole `MemberMetricsDetailScreen` function (≈:99-199) with:

```kotlin
@Composable
fun MemberMetricsDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val context = LocalContext.current
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()

    var search by remember { mutableStateOf("") }
    var committedSearch by remember { mutableStateOf("") }
    var sortField by remember { mutableStateOf(MetricSortField.ACTIVE_DAYS) }
    var sortDir by remember { mutableStateOf(SortDir.DESC) }
    var filters by remember { mutableStateOf(MetricsFilters()) }
    var showSort by remember { mutableStateOf(false) }
    var showFilter by remember { mutableStateOf(false) }

    // Polish #29/#34: this screen's own page, one load per (search, sort, filters, program) — the Members-tab preview never
    // re-sorts under it, a failed load shows ErrorView + Retry (never "No members to display."), and the CSV is exactly
    // the list on screen.
    val load = rememberLoad(listOf(committedSearch, sortField, sortDir, filters, program?.id), programContext.isOnline) {
        programContext.loadMemberMetrics(
            search = committedSearch, sort = sortField.api, direction = sortDir.api,
            filterParams = filters.toParams(), publish = false,
        )
    }
    val page = load.state.dataOrNull
    val metrics = page?.members.orEmpty()
    val range = page?.dateRange?.start to page?.dateRange?.end

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            DetailTopBarWithExport(
                onBack = onBack,
                title = "Member Performance Metrics",
                exportEnabled = metrics.isNotEmpty(),
                onExport = { shareCsv(context, metricsCsvName(program?.name, range), metricsCsv(metrics)) },
            )

            TextField(
                value = search,
                onValueChange = { search = it; if (it.isBlank()) committedSearch = "" },
                singleLine = true,
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                trailingIcon = {
                    if (search.isNotEmpty()) {
                        Icon(
                            Icons.Filled.Close, contentDescription = null,
                            modifier = Modifier.tapTarget("Clear search", shape = CircleShape) { search = ""; committedSearch = "" }.size(20.dp),
                        )
                    }
                },
                placeholder = { Text("Search member") },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { committedSearch = search }),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
            )

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ControlButton("Sort by ${sortField.label}", Icons.Filled.UnfoldMore, Modifier.weight(1f)) { showSort = true }
                ControlButton("Filter", Icons.Filled.FilterList, Modifier.weight(1f)) { showFilter = true }
            }

            KitLoad(load.state, online, onRetry = load::reload, loading = { repeat(3) { SkeletonCard() } }) { p ->
                if (p.members.isEmpty()) {
                    Text("No members to display.", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                    Text("Adjust filters or try a different search.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                } else {
                    p.members.forEach { MemberMetricsCard(it, sortField) }
                }
            }
            if (load.state.showsStaleBanner(online)) Spacer(Modifier.height(STALE_BANNER_CLEARANCE))
        }
        KitStaleBanner(load.state, online, onRetry = load::reload)
    }

    if (showSort) {
        SortSheet(
            current = sortField,
            direction = sortDir,
            onField = { sortField = it },
            onDirection = { sortDir = it },
            onDismiss = { showSort = false },
        )
    }
    if (showFilter) {
        FilterSheet(
            initial = filters,
            programStart = program?.startDate,
            onApply = { filters = it; showFilter = false },
            onClear = { filters = MetricsFilters(); showFilter = false },
            onDismiss = { showFilter = false },
        )
    }
}
```

In `Segmented`, `.clickable { onSelect(i) }` becomes `.selectableTarget(selected = active, role = Role.RadioButton) { onSelect(i) }`, staying after `.background(...)`.

### G. Log forms, widget forms, picker, Health Connect

**38. `ui/summary/LogWorkoutScreen.kt`** (#16, #36)

Add imports:
- `com.app.rasifiters.core.kit.AppError`
- `com.app.rasifiters.ui.components.tapTarget`
- `com.app.rasifiters.ui.components.kit.InlineLoadError`
- `com.app.rasifiters.ui.components.kit.RefetchOnReconnect`
- `kotlinx.coroutines.coroutineScope`

Directly after `var lookupsLoaded by remember { mutableStateOf(false) }` (≈:113) add:

```kotlin
    var lookupError by remember { mutableStateOf<AppError?>(null) }
    val online by programContext.isOnline.collectAsStateWithLifecycle()

    // Polish #16: a failed lookup says "Couldn't load · Retry" (never a false "No workout types…"), and reloads when back online.
    suspend fun loadLookups() {
        lookupError = null
        coroutineScope {
            launch {
                programContext.loadProgramMembers()
                    .onSuccess { list -> memberOptions = list.map { PickerOption(it.id, it.memberName) } }
                    .onFailure { lookupError = it.toAppError() }
            }
            launch {
                programContext.loadProgramWorkouts()
                    .onSuccess { list -> workoutOptions = list.map { PickerOption(it.workoutName, it.workoutName) } }
                    .onFailure { lookupError = it.toAppError() }
            }
        }
        lookupsLoaded = true
    }
    RefetchOnReconnect(programContext.isOnline, needsReload = { lookupError != null }) { scope.launch { loadLookups() } }
```

In the mount `LaunchedEffect(Unit)` (≈:140-151), replace the `programContext.loadProgramMembers().onSuccess { … }` block, the `programContext.loadProgramWorkouts().onSuccess { … }` block and `lookupsLoaded = true` with the single line `loadLookups()`.

Replace `if (lookupsLoaded && workoutOptions.isEmpty()) { LookupHint(…) } else if (lookupsLoaded && canSelectAnyMember && memberOptions.isEmpty()) { LookupHint(…) }` (≈:243-247) with:

```kotlin
            val failure = lookupError
            when {
                failure != null -> InlineLoadError(failure, online, onRetry = { scope.launch { loadLookups() } })
                lookupsLoaded && workoutOptions.isEmpty() -> LookupHint("No workout types available for this program yet.")
                lookupsLoaded && canSelectAnyMember && memberOptions.isEmpty() -> LookupHint("No active members in this program yet.")
            }
```

In `WorkoutRowCard`, replace the Remove ✕ `Box(…)` (≈:343, `size(28.dp)` + `clickable(onClick = onRemove)` + Close icon) with:

```kotlin
            Box(
                modifier = Modifier
                    .tapTarget("Remove entry", shape = CircleShape, onClick = onRemove)
                    .size(28.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Close, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f), modifier = Modifier.size(16.dp))
            }
```

**39. `ui/summary/LogHealthScreen.kt`** (#16, #36)

Add imports:
- `com.app.rasifiters.core.kit.AppError`
- `com.app.rasifiters.ui.components.tapTarget`
- `com.app.rasifiters.ui.components.kit.InlineLoadError`
- `com.app.rasifiters.ui.components.kit.RefetchOnReconnect`

Directly after `var lookupsLoaded by remember { mutableStateOf(false) }` (≈:132) add:

```kotlin
    var lookupError by remember { mutableStateOf<AppError?>(null) }
    val online by programContext.isOnline.collectAsStateWithLifecycle()

    // Polish #16: a failed roster lookup says "Couldn't load · Retry" (never a false "No active members"), reloads on reconnect.
    suspend fun loadLookups() {
        lookupError = null
        programContext.loadProgramMembers()
            .onSuccess { list -> memberOptions = list.map { PickerOption(it.id, it.memberName) } }
            .onFailure { lookupError = it.toAppError() }
        lookupsLoaded = true
    }
    RefetchOnReconnect(programContext.isOnline, needsReload = { lookupError != null }) { scope.launch { loadLookups() } }
```

In the mount `LaunchedEffect(Unit)` (≈:159-167), replace the `programContext.loadProgramMembers().onSuccess { … }` block and `lookupsLoaded = true` with `loadLookups()`.

Replace `if (lookupsLoaded && canSelectAnyMember && memberOptions.isEmpty()) { Text(…) }` (≈:264) with:

```kotlin
            val failure = lookupError
            if (failure != null) {
                InlineLoadError(failure, online, onRetry = { scope.launch { loadLookups() } })
            } else if (lookupsLoaded && canSelectAnyMember && memberOptions.isEmpty()) {
                Text(
                    "No active members in this program yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                )
            }
```

In `HealthRowCard`, replace the Remove ✕ `Box(…)` (≈:371-373) with the same `Box` as in step 38.

**40. `ui/summary/QuickAddWorkoutWidgetScreen.kt`** (#16)

Add imports:
- `androidx.compose.runtime.mutableIntStateOf`
- `com.app.rasifiters.core.kit.AppError`
- `com.app.rasifiters.core.kit.UiState`
- `com.app.rasifiters.ui.components.kit.InlineLoadError`
- `com.app.rasifiters.ui.components.kit.RefetchOnReconnect`

Directly after `var showSuccessToast by remember { mutableStateOf(false) }` (≈:107) add:

```kotlin
    val programsState by programContext.programsState.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    // Polish #16: a failed program list / per-program lookup shows "Couldn't load · Retry" and reloads when back online
    // (the form used to stay empty until it was reopened).
    var lookupError by remember { mutableStateOf<AppError?>(null) }
    var lookupAttempt by remember { mutableIntStateOf(0) }
    val programsError = (programsState as? UiState.Failed)?.error?.takeIf { programs.isEmpty() }
    val loadError = programsError ?: lookupError
    fun retryLoads() {
        if (programsError != null) scope.launch { programContext.loadPrograms() }
        lookupError = null
        lookupAttempt++
    }
    RefetchOnReconnect(programContext.isOnline, needsReload = { loadError != null }) { retryLoads() }
```

- `LaunchedEffect(selectedProgramIds) {` (≈:134) becomes `LaunchedEffect(selectedProgramIds, lookupAttempt) {`.
- Replace its `for (pid in selectedProgramIds) { … }` loop (only the loop, not the intersection-pruning block after it) with:

```kotlin
        var failure: AppError? = null
        for (pid in selectedProgramIds) {
            if (membersByProgram[pid] == null) {
                programContext.fetchProgramMembersFor(pid)
                    .onSuccess { membersByProgram[pid] = it }
                    .onFailure { failure = it.toAppError() }
            }
            if (workoutsByProgram[pid] == null) {
                programContext.fetchProgramWorkoutsFor(pid)
                    .onSuccess { workoutsByProgram[pid] = it }
                    .onFailure { failure = it.toAppError() }
            }
        }
        lookupError = failure
```

- Directly after the `ProgramMultiSelect(...)` call (≈:248) add:

```kotlin
            loadError?.let { InlineLoadError(it, online, onRetry = { retryLoads() }) }
```

**41. `ui/summary/QuickAddHealthWidgetScreen.kt`** (#16)
- Add the same imports as step 40.
- Add the same state block, directly after `var showSuccessToast by remember { mutableStateOf(false) }` (≈:100).
- `LaunchedEffect(selectedProgramIds) {` (≈:125) becomes `LaunchedEffect(selectedProgramIds, lookupAttempt) {`.
- Replace its `for` loop with:

```kotlin
        var failure: AppError? = null
        for (pid in selectedProgramIds) {
            if (membersByProgram[pid] == null) {
                programContext.fetchProgramMembersFor(pid)
                    .onSuccess { membersByProgram[pid] = it }
                    .onFailure { failure = it.toAppError() }
            }
        }
        lookupError = failure
```

- Directly after the `ProgramMultiSelect(...)` call (≈:234) add `loadError?.let { InlineLoadError(it, online, onRetry = { retryLoads() }) }`.

**42. `ui/programs/ProgramPickerScreen.kt`** (#36, #40; SHARED with N5, so change only these)
- Add `import com.app.rasifiters.ui.Routes`.
- Replace `val pendingInvites = (invitesState.dataOrNull?.size ?: 0) + programs.count { it.myStatus == "requested" }` (≈:167) with:

```kotlin
    // Polish #40 (program-picker A-4 rewritten): the badge counts invites only — never your own join requests (iOS
    // `pendingInvites.count`). N5 later makes it unread notifications + invites (D-N4).
    val pendingInvites = invitesState.dataOrNull?.size ?: 0
```

- In the `ProgramCard(...)` call, directly after `onDelete = { deleteTarget = program },` add:

```kotlin
                                onEdit = {
                                    // Polish #40: Edit from the card (iOS `programToEdit`) — select the program, then edit it.
                                    programContext.selectProgram(program)
                                    onNavigate(Routes.PROGRAM_EDIT)
                                },
```

- In the `ProgramCard` parameters, add `onEdit: () -> Unit,` after `onDelete: () -> Unit,`.
- `IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(32.dp)) {` becomes `IconButton(onClick = { menuOpen = true }) {`. This is #36: the standard M3 48dp target.
- In the `AppDropdownMenu`, directly before the Delete `DropdownMenuItem(` add:

```kotlin
                        DropdownMenuItem(text = { Text("Edit") }, onClick = { menuOpen = false; onEdit() })
```

The menu stays gated by `canManage` (global admin, or an active admin of the program), the same gate as Delete.

**43. `ui/programs/InviteInbox.kt`** (#36; SHARED with N5)
- Add `import com.app.rasifiters.ui.components.tapTarget`.
- Replace the `InvitePill` Box modifier (≈:104-105) with:

```kotlin
        // Polish #36: the 36dp pill keeps its look but takes a labelled 48dp touch.
        modifier = Modifier.tapTarget(label, enabled = enabled, shape = CircleShape, onClick = onClick)
            .background(color.copy(alpha = 0.16f), CircleShape)
            .padding(horizontal = 18.dp, vertical = 8.dp),
```

**44. `ui/programs/ProgramActionsSheet.kt`** (#36; SHARED with N5)
- Add `import com.app.rasifiters.ui.components.selectableTarget`.
- In `SegmentedToggle`, `.clickable { onSelect(index) }` (≈:158) becomes `.selectableTarget(selected = selected) { onSelect(index) }`. It keeps its place after `.background(...)`, with the default role `Role.Tab`.
- Delete `import androidx.compose.foundation.clickable` only if a grep shows no other `clickable` use in the file.

**45. `ui/health/HealthConnectSettingsScreen.kt`** (#27, #36)

Add imports:
- `com.app.rasifiters.core.kit.AppError`
- `com.app.rasifiters.core.kit.AppErrorKind`
- `com.app.rasifiters.core.kit.UiState`
- `com.app.rasifiters.core.kit.dataOrNull`
- `com.app.rasifiters.ui.components.toggleTarget`
- `com.app.rasifiters.ui.components.kit.InlineLoadError`
- `com.app.rasifiters.ui.components.kit.RefetchOnReconnect`

Replace `val programs by programContext.programs.collectAsStateWithLifecycle()` (≈:75) with:

```kotlin
    val programsState by programContext.programsState.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
```

Replace `LaunchedEffect(Unit) { if (programs.isEmpty()) runCatching { programContext.loadPrograms() } }` (≈:92) with:

```kotlin
    LaunchedEffect(Unit) { if (programContext.programsState.value.dataOrNull == null) programContext.loadPrograms() }
    RefetchOnReconnect(programContext.isOnline, needsReload = { programContext.programsState.value is UiState.Failed }) {
        scope.launch { programContext.loadPrograms() }
    }
```

The three calls (≈:136, :170, :204) become:

```kotlin
                    ProgramSelection(programsState, online, onRetry = { scope.launch { programContext.loadPrograms() } }, workoutProgramIds, programContext) { health.toggleWorkoutProgram(it) }
```
```kotlin
                    ProgramSelection(programsState, online, onRetry = { scope.launch { programContext.loadPrograms() } }, sleepProgramIds, programContext) { health.toggleSleepProgram(it) }
```
```kotlin
                    ProgramSelection(programsState, online, onRetry = { scope.launch { programContext.loadPrograms() } }, stepsProgramIds, programContext) { health.toggleStepsProgram(it) }
```

Replace `ProgramSelection` (≈:297-350) with:

```kotlin
@Composable
private fun ProgramSelection(
    state: UiState<List<ProgramDTO>>,
    online: Boolean,
    onRetry: () -> Unit,
    selected: Set<String>,
    programContext: ProgramContext,
    onToggle: (String) -> Unit,
) {
    // Polish #27: only programs you're ACTIVE in can receive synced data (invited / requested never do), and the list's own
    // load state shows — never "No programs available" while it loads or after it failed.
    val programs = state.dataOrNull?.filter { it.myStatus == "active" }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Sync to Programs", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        when {
            programs == null && (state is UiState.Failed || !online) -> InlineLoadError(
                (state as? UiState.Failed)?.error ?: AppError(AppErrorKind.OFFLINE), online, onRetry,
                modifier = cardModifier().padding(14.dp),
            )
            programs == null -> Box(cardModifier().padding(14.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
            }
            programs.isEmpty() -> Text(
                "No programs available. Join or create a program first.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                modifier = cardModifier().padding(14.dp),
            )
            else -> Column(modifier = cardModifier()) {
                programs.forEachIndexed { index, program ->
                    val locked = programContext.isDataEntryLocked(program.id)
                    val isSelected = program.id in selected
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            // Polish #36: announced as a checkbox with its checked state.
                            .toggleTarget(checked = isSelected, enabled = !locked) { onToggle(program.id) }
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Icon(
                            when {
                                locked -> Icons.Filled.Lock
                                isSelected -> Icons.Filled.CheckCircle
                                else -> Icons.Filled.RadioButtonUnchecked
                            },
                            contentDescription = null,
                            tint = if (locked) MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f)
                            else if (isSelected) AppOrange else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f),
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(program.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                            Text(
                                if (locked) "Admin-only — can't sync" else (program.status ?: "Active"),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                            )
                        }
                    }
                    if (index != programs.lastIndex) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.padding(start = 50.dp))
                }
            }
        }
    }
}
```

### Already fixed / not reachable (nothing planned)

- **#15:** the spinner already exists (`ProfileScreen.kt` ~:400). Only the error placement changes (step 16).
- **#9 and #24:** the quick wins (#8) only made the copy plain. The error placement (#9) and the double-tap (#24) are fixed in steps 27, 35 and 36.
- **#29 on `WorkoutTypesDetailScreen.kt`:** not reachable. When TYPES is unavailable, `SummaryScreen.kt:192-193` renders a non-tappable `UnavailableCard`, so the detail only ever opens with loaded types. No brief change is needed. Distribution is in the same situation (`SummaryScreen.kt:190`) but gets the defensive "—" in step 31 because that file is already being edited.

---

## Endgame

1. **Compile check** (the implementer runs it):
   - Run `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android && ./gradlew :app:assembleDebug` after step 0 (the spike) and again at the end. Fix diagnostics inside this file list until BUILD SUCCESSFUL.
   - If an error appears **outside** the file list, STOP and report to the orchestrator.
   - Afterwards: `rm -rf apps/android/app/build apps/android/build` (keep the Gradle caches), then report free disk space (`df -h ~`).
   - There is no iOS, web or backend work in this track.
   - **All visual and live testing is the user's**, on prod, with a debug build on his own devices. No staging: there is no migration and no auth/session change.

   **User device checklist:**
   - **#35:**
     - Google/password-manager autofill **fills** on Login (one field offers both usernames and emails).
     - It **offers to save** after Login and Create Account.
     - Create Account suggests a strong password.
   - **#20:** rotate, or toggle system dark mode, on a widget form; it must not reopen.
   - **#26:** on the 8 chart screens:
     - vertical drag scrolls;
     - horizontal drag scrubs;
     - tap still selects;
     - the Summary and Members-tab chart cards still scrub horizontally.
   - **#21:**
     - System Back mid-wizard steps back one page.
     - Back from page 1, then reopening, shows no stale Google sign-up.
     - The Google button spins until sign-in finishes.
   - **#17:**
     - A taken username lands on page 2 with the message.
     - Turn airplane mode on after a successful sign-up, then retry: it signs in without "username exists".
   - **#36 visual growth:**
     - Segmented controls are now 48dp.
     - The picker card ⋮ is 48dp, so the card header is taller.
     - Log-entry ✕ rows and View Workouts/Health rows are taller.
     - The Back pill area is 48dp.
     - Invite pills reserve 48dp.
   - **#10/#31:** switching program or View as shows a spinner, never the old numbers, not even for one frame.
   - **#33:** with airplane mode on the Program tab, roster, roles and workout types:
     - each shows "Couldn't load · Retry" (WorkoutTypes can also be pulled to retry);
     - each reloads when back online.
   - **#40:**
     - Edit from a picker card opens Edit Program for that card.
     - Back returns to the picker.
     - The "+" badge no longer counts your own join requests.

2. **Migration:** none. **Backend:** none. Live binaries are unaffected (client-only).

3. **git-version:**
   - Land as one no-bump `feat(android): Phase 4 Track P polish (#9–#45 Android)` once the impl-adversary passes. No app version bump (1.1.0 / 6).
   - The orchestrator's single Track P docs commit (shared with web and iOS) bumps:
     - frontend-kit **0.4.0→0.5.0** (MINOR: new D-rules below; §8 adds `ui/components/kit/KitLoad.kt` and `ui/components/TapTarget.kt`)
     - auth **0.14.0→0.15.0** (#17/#21/#35)
     - programs **0.2.0→0.3.0** (#40 Edit from the picker, #12 create)
     - program-workouts **0.1.0→0.2.0** (#12)
     - member-analytics **→ next MINOR** (#34 detail-owned results; history reset removed). Re-base it against the S0/quick-wins docs, which may already be at 0.5.0/0.6.0.
     - health-connect **0.3.0→0.4.0** (#27 active-only list)
     - PATCH bumps: members (#44/#18/#10), program-memberships (#12/#33), invites (#40 badge), analytics + analytics-v2 (#29/#31/#34), workout-logs + daily-health-logs (#16/#24)
     - the page SPECs below
   - Tag after the cherry-pick to `main`.

## Docs for the orchestrator (do NOT edit in this track)

Proposed D-rules (the orchestrator assigns IDs):
- **KIT-a:** detail screens, sections and Lifestyle use ONE load helper per surface. On Android that is `KitLoad` / `rememberLoad`: keyed loads, ErrorView or InlineLoadError, reconnect refetch, and the stale banner with list clearance.
- **KIT-b:** 48dp targets plus labels and selected/checked semantics come from `TapTarget.kt`.
- **KIT-c:** program-scoped client state is written only for the active program and session, and is cleared on a program switch (`resetProgramScope`).
- **Android-only:**
  - #26 horizontal-only chart scrub (all charts);
  - #20 widget link consumed once;
  - #21 wizard `BackHandler`;
  - #35 Compose `ContentType` + BOM 2025.04.01 (if approved);
  - #40 overflow-menu Edit (program-picker **A-1 and A-4 rewritten**).

Page SPECs (`specs/pages/android/…`):

| Page | Rows |
|---|---|
| splash | #25 |
| login | #21 #35 #36 |
| create-account | #17 #21 #35 #36 |
| forgot-password | #35 |
| change-password | #35 #36 |
| my-profile | #15 #18 #35 #36 #44 |
| appearance | #36 #45 |
| program-picker | #36 #40 #45 |
| edit-program | #36 #40 |
| program | #33 #45 |
| member-management | #33 #35 |
| manage-roles | #33 #36 |
| members | #10 #26 #36 #42 |
| lifestyle | #10 #26 #31 #36 |
| lifestyle-workout-types | #9 #12 #33 #36 |
| summary | #26 |
| summary-activity-detail | #26 #29 #34 #36 |
| summary-distribution-detail | #26 #29 #36 |
| summary-workout-types-detail | #36 |
| member-history-detail | #26 #29 #34 #36 |
| member-streaks-detail | #26 #29 #36 |
| member-workouts-detail | #24 #29 #34 #36 |
| member-health-detail | #24 #29 #34 #36 |
| member-metrics-detail | #29 #34 #36 |
| lifestyle-timeline | #26 #29 #34 #36 |
| lifestyle-steps-timeline | #26 #29 #34 #36 |
| log-workout | #16 #36 |
| log-health | #16 #36 |
| widgets | #16 #20 #36 |
| health-connect | #27 #36 |

Also:
- `notifications` (N5-owned page): only its shared 48dp back target changes (#36). Tell N5.
- `specs/pages/REGISTRY.md` android rows (doc drift 5).
- `apps/android/CONTEXT.md`: the new kit helpers and the BOM.

## Risks the implementer must watch

- **Moving tree.** Quick-wins fix rounds may still land in `ProgramContext.kt`, `MembersScreen.kt`, `ProgramPickerScreen.kt` and others. Match on quoted text. `resetProgramScope()` fully covers `selectProgram`'s current 3-line reset.
- **SHARED files.** Keep each change to its own row.
  - Shared with N5: `RootScreen.kt`, `ProgramAccountSection.kt`, `AccountMenuSheet.kt`, `ProgramPickerScreen.kt`, `InviteInbox.kt`, `ProgramActionsSheet.kt`.
  - Shared with S4: `ProfileScreen.kt`, `MemberManagementScreens.kt`.
  - Shared with S4/S5: `MembersScreen.kt`.
  - Shared with N5 and S4: `ProgramContext.kt` (especially `clearSession` → `resetProgramScope`), `ApiService.kt`, `Dtos.kt`.
  - N5 and S4 must add new program-scoped teardown to `resetProgramScope()`, not to `clearSession`.
  - S4 must keep the roster kit states. S5 must keep the #10 clears, the `loadedFor` / `logsLoadedFor` gates, and `logsOnly` View-as.
- **`rememberLoad` keys must contain every input of its `load` lambda** (period, member id, sort, filters, search, program). A missing key reuses a stale handle.
- **`toAppError()` rethrows `CancellationException`.** That is correct inside `onFailure`, so never wrap it in try/catch. `LoadHandle` relies on it to stay silent when a key changes.
- **`ensureMembersLoaded(force = true)` must never re-default the View-as.** Only the first load per program sets it.
- **No new write may skip `afterWorkoutWrite(pid, …)`'s program check or the active-program guards** in `loadAllProgramWorkouts` / `loadMembershipDetails`. This is the cross-program class the adversary flagged.
- **Live binaries: none affected.**
  - `PUT /members/:id` keeps the same snake_case keys. `gender: null` is sent only on an explicit clear (memberService.js:138-139 honours `!== undefined`).
  - The `GET /member-metrics` and `/member-history` calls are unchanged; they just aren't published.
- **New copy that iOS and web must match** (parity check after):
  - `Sync workouts, sleep and steps`
  - `Nothing to choose from yet.` / `No matches.`
  - `No members in this program yet.` / `No members match your search.`
  - `No workout types yet.` / `No workout types match your search.`
- **The BOM bump is app-wide.** Run it first (step 0). If any API break shows up outside the file list, stop and report rather than widening scope.
- **`MemberDetailShared.kt`** (not in this brief) keeps its `Row(height(44.dp))`. The back button there stays 44dp high (constrained), with a 2dp shift. This is accepted; do not edit that file.
- **File sizes:**
  - `ProgramContext.kt` stays at ~1,550 lines (moving `LifestyleData` out offsets the additions).
  - `WorkoutTypesListScreen`, `ManageRolesScreen`, `ProgramScreen` and `MembersScreen` grow by 15–40 lines. They were already over ~200; this is accepted as "where practical".
