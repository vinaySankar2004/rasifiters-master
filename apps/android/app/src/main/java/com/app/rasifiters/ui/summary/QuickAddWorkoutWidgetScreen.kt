package com.app.rasifiters.ui.summary

import androidx.activity.compose.BackHandler
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
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.net.ApiException
import com.app.rasifiters.net.BulkWorkoutEntry
import com.app.rasifiters.net.BulkRowError
import com.app.rasifiters.net.ProgramMemberDTO
import com.app.rasifiters.net.ProgramWorkoutDTO
import com.app.rasifiters.ui.auth.PillButton
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.LocalDate

private const val MAX_ROWS = 200

/**
 * The home-screen-widget deep-link target for "Add workouts" — the SAME multi-row batch form as the
 * in-app [LogWorkoutScreen] (reusing its `internal` [WorkoutRow] model + validation helpers +
 * [WorkoutRowCard]), reached when the Glance `AddWorkoutWidget` deep-links `rasifiters://quick-add-workout`
 * (D-ANDROID-WIDGET-3). Two deltas from the in-app form (1:1 with iOS `QuickAddWorkoutWidgetEntryView`):
 *   1. NO auto-selected program — `currentProgramId = ""`, nothing is force-checked, and member/workout
 *      options are the INTERSECTION across the selected programs (per-program lookups cached below).
 *   2. Back / system-back / the post-save dwell exit to My Programs; the batch save passes the first
 *      selected program as the primary `program_id` + the full set as `program_ids`.
 */
@Composable
fun QuickAddWorkoutWidgetScreen(programContext: ProgramContext, onExit: () -> Unit) {
    val scope = rememberCoroutineScope()
    val selfMemberId = programContext.loggedInMemberId
    val selfName = programContext.loggedInMemberName ?: "You"

    val programs by programContext.programs.collectAsStateWithLifecycle()
    var selectedProgramIds by remember { mutableStateOf<Set<String>>(emptySet()) }

    // Capability from the PROGRAM LIST (no active program — O1/obj-1). Member selection unlocks only when
    // the viewer is an admin/logger in EVERY selected program (else locked to self, iOS `memberLocked`).
    val baseCanSelectAnyMember = programContext.canLogForAnyProgramMember
    val selectedPrograms = programs.filter { it.id in selectedProgramIds }
    val memberLocked = selectedProgramIds.isNotEmpty() && selectedPrograms.any { !programContext.isPrivilegedIn(it) }
    val canSelectAnyMember = selectedProgramIds.isNotEmpty() && baseCanSelectAnyMember && !memberLocked
    val ignoreMember = !canSelectAnyMember
    val identityMissing = ignoreMember && selfMemberId.isNullOrBlank()

    // Per-program lookups (there is no single active program), intersected across the selection.
    val membersByProgram = remember { mutableStateMapOf<String, List<ProgramMemberDTO>>() }
    val workoutsByProgram = remember { mutableStateMapOf<String, List<ProgramWorkoutDTO>>() }

    val memberOptions: List<PickerOption> =
        if (selectedProgramIds.isNotEmpty() && selectedProgramIds.all { membersByProgram[it] != null })
            memberIntersection(selectedProgramIds.map { membersByProgram[it]!! })
                .map { PickerOption(it.id, it.memberName) }
                .sortedBy { it.label.lowercase() }
        else emptyList()
    val workoutOptions: List<PickerOption> =
        if (selectedProgramIds.isNotEmpty() && selectedProgramIds.all { workoutsByProgram[it] != null })
            workoutIntersection(selectedProgramIds.map { workoutsByProgram[it]!! })
                .map { PickerOption(it, it) }
                .sortedBy { it.label.lowercase() }
        else emptyList()

    val rows = remember { mutableStateListOf<WorkoutRow>() }
    val nextUid = remember { mutableStateOf(0) }
    var submittedOrder by remember { mutableStateOf<List<Int>>(emptyList()) }
    var rowErrors by remember { mutableStateOf<List<BulkRowError>?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    var showSuccessToast by remember { mutableStateOf(false) }

    fun addRows(count: Int) {
        if (rows.size >= MAX_ROWS) return
        val baseDate = rows.lastOrNull()?.date ?: LocalDate.now()
        val seedMember = if (ignoreMember) (selfMemberId ?: "") else ""
        val room = minOf(count, MAX_ROWS - rows.size)
        repeat(room) {
            rows.add(WorkoutRow(nextUid.value++, seedMember, "", baseDate, "", ""))
        }
    }

    fun updateRow(uid: Int, transform: (WorkoutRow) -> WorkoutRow) {
        val i = rows.indexOfFirst { it.uid == uid }
        if (i >= 0) rows[i] = transform(rows[i])
        rowErrors = rowErrors?.filterNot { submittedOrder.getOrNull(it.index) == uid }?.takeIf { it.isNotEmpty() }
    }

    // Mount: load the program list (for the multi-select) + one starter row. No lock guard — the widget
    // has no active program; per-program locks live in the ProgramMultiSelect rows (iOS parity).
    LaunchedEffect(Unit) {
        if (programContext.programs.value.isEmpty()) programContext.loadPrograms()
        if (rows.isEmpty()) addRows(1)
    }

    // Selection changed: fetch any missing per-program lookups, then (once ALL are present) drop per-row
    // member/workout no longer shared across the selection. Never wiped on a transient miss (iOS parity).
    LaunchedEffect(selectedProgramIds) {
        for (pid in selectedProgramIds) {
            if (membersByProgram[pid] == null) {
                programContext.fetchProgramMembersFor(pid).onSuccess { membersByProgram[pid] = it }
            }
            if (workoutsByProgram[pid] == null) {
                programContext.fetchProgramWorkoutsFor(pid).onSuccess { workoutsByProgram[pid] = it }
            }
        }
        if (selectedProgramIds.isNotEmpty() &&
            selectedProgramIds.all { membersByProgram[it] != null && workoutsByProgram[it] != null }
        ) {
            val memberIds = memberIntersection(selectedProgramIds.map { membersByProgram[it]!! }).map { it.id }.toSet()
            val workoutNames = workoutIntersection(selectedProgramIds.map { workoutsByProgram[it]!! }).toSet()
            for (i in rows.indices) {
                var r = rows[i]
                if (!ignoreMember && r.memberId.isNotBlank() && r.memberId !in memberIds) r = r.copy(memberId = "")
                if (r.workoutName.isNotBlank() && r.workoutName !in workoutNames) r = r.copy(workoutName = "")
                if (r != rows[i]) rows[i] = r
            }
        }
    }

    // Member column appeared/disappeared: force self when hidden (a foreign member can't be submitted),
    // clear the auto-seeded self when it reappears (iOS `onChange(ignoreMember)`).
    LaunchedEffect(ignoreMember) {
        val self = selfMemberId ?: ""
        for (i in rows.indices) {
            if (ignoreMember) {
                if (rows[i].memberId != self) rows[i] = rows[i].copy(memberId = self)
            } else if (rows[i].memberId == self) {
                rows[i] = rows[i].copy(memberId = "")
            }
        }
    }

    val nonEmpty = rows.filterNot { it.isEmpty(ignoreMember) }
    val valid = nonEmpty.filter { it.isValid(ignoreMember) }
    val invalidCount = nonEmpty.size - valid.size
    val distinctMembers = valid.map { it.memberId }.toSet().size
    val totalMinutes = valid.sumOf { it.durationMinutes() }
    val canSubmit = selectedProgramIds.isNotEmpty() && valid.isNotEmpty() && invalidCount == 0 && !saving && !identityMissing

    fun backendFieldError(uid: Int, field: String): String? {
        val errs = rowErrors ?: return null
        return errs.firstOrNull { it.field == field && submittedOrder.getOrNull(it.index) == uid }?.message
    }
    fun backendRowLevelError(uid: Int): String? {
        val errs = rowErrors ?: return null
        return errs.firstOrNull {
            it.field !in setOf("member_id", "workout_name", "date", "duration") &&
                submittedOrder.getOrNull(it.index) == uid
        }?.message
    }

    fun submit() {
        if (!canSubmit) return
        val included = rows.filter { !it.isEmpty(ignoreMember) && it.isValid(ignoreMember) }
        if (included.isEmpty()) return
        val ids = selectedProgramIds.sorted()
        val primary = ids.firstOrNull() ?: return
        submittedOrder = included.map { it.uid }
        val entries = included.map {
            BulkWorkoutEntry(
                memberId = if (ignoreMember) (selfMemberId ?: "") else it.memberId,
                workoutName = it.workoutName,
                date = it.date.toString(),
                duration = it.durationMinutes(),
            )
        }
        saving = true
        errorMessage = null
        rowErrors = null
        showSuccessToast = false
        scope.launch {
            programContext.addWorkoutLogsBatchExplicit(primary, ids, entries)
                .onSuccess {
                    saving = false
                    showSuccessToast = true
                    delay(1400)
                    onExit()
                }
                .onFailure { e ->
                    saving = false
                    if (e is ApiException && !e.rowErrors.isNullOrEmpty()) {
                        rowErrors = e.rowErrors
                        errorMessage = e.message
                    } else {
                        errorMessage = e.message ?: "Couldn't save workouts."
                    }
                }
        }
    }

    BackHandler { onExit() }

    val subtitle = if (canSelectAnyMember)
        "Add a row per session — member, workout, date, and duration — then save them all at once."
    else
        "Add a row per session — workout, date, and duration — then save them all at once."

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DetailTopBar(onBack = onExit, centerTitle = "Add workouts")
            Text(
                subtitle,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )

            ProgramMultiSelect(
                programs = programs,
                currentProgramId = "",
                selectedIds = selectedProgramIds,
                isLocked = { programContext.isDataEntryLocked(it) },
                memberLockHint = if (memberLocked && baseCanSelectAnyMember)
                    "You're not an admin or logger in every selected program — logging for yourself only."
                else null,
                onToggle = { id ->
                    selectedProgramIds =
                        if (id in selectedProgramIds) selectedProgramIds - id else selectedProgramIds + id
                },
                alwaysShow = true,
            )

            rows.forEachIndexed { index, row ->
                WorkoutRowCard(
                    index = index,
                    row = row,
                    canSelectAnyMember = canSelectAnyMember,
                    selfName = selfName,
                    memberOptions = memberOptions,
                    workoutOptions = workoutOptions,
                    memberError = backendFieldError(row.uid, "member_id"),
                    workoutError = backendFieldError(row.uid, "workout_name"),
                    durationError = backendFieldError(row.uid, "duration"),
                    rowLevelError = backendRowLevelError(row.uid),
                    onMember = { updateRow(row.uid) { r -> r.copy(memberId = it) } },
                    onWorkout = { updateRow(row.uid) { r -> r.copy(workoutName = it) } },
                    onDate = { updateRow(row.uid) { r -> r.copy(date = it) } },
                    onHours = { updateRow(row.uid) { r -> r.copy(hours = it) } },
                    onMinutes = { updateRow(row.uid) { r -> r.copy(minutes = it) } },
                    onRemove = { rows.removeAll { it.uid == row.uid } },
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                WidgetAddRowLink("+ Add row", enabled = rows.size < MAX_ROWS) { addRows(1) }
                WidgetAddRowLink("+ Add 5 rows", enabled = rows.size < MAX_ROWS) { addRows(5) }
            }

            Text(
                buildString {
                    append("${valid.size} rows")
                    if (canSelectAnyMember) append(" • $distinctMembers members")
                    append(" • $totalMinutes min total")
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )

            if (identityMissing) {
                FormErrorText("We couldn't identify your account. Please sign out and back in, then try again.")
            }
            if (invalidCount > 0) {
                FormErrorText("$invalidCount ${if (invalidCount == 1) "row needs" else "rows need"} attention before saving.")
            }
            errorMessage?.let { FormErrorText(it) }

            Spacer(Modifier.height(4.dp))
            Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                PillButton(label = "Save all", onClick = { submit() }, enabled = canSubmit, loading = saving)
            }
        }

        if (showSuccessToast) {
            WidgetSuccessToast(
                text = "Workout logged",
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp),
            )
        }
    }
}

@Composable
private fun WidgetAddRowLink(label: String, enabled: Boolean, onClick: () -> Unit) {
    Text(
        label,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        color = if (enabled) AppOrange else AppOrange.copy(alpha = 0.4f),
        modifier = Modifier.clickable(enabled = enabled, onClick = onClick),
    )
}

/** In-view success toast (iOS `WidgetSuccessToast`): checkmark + text on a rounded pill with a soft shadow. */
@Composable
private fun WidgetSuccessToast(text: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .shadow(6.dp, RoundedCornerShape(999.dp))
            .clip(RoundedCornerShape(999.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 18.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = AppGreen, modifier = Modifier.size(20.dp))
        Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
    }
}

/** Intersection of member rosters across the selected programs, keyed by member id (order from the first). */
internal fun memberIntersection(lists: List<List<ProgramMemberDTO>>): List<ProgramMemberDTO> {
    if (lists.isEmpty()) return emptyList()
    val first = lists.first().distinctBy { it.id }
    var inter = first.map { it.id }.toSet()
    for (l in lists.drop(1)) inter = inter intersect l.map { it.id }.toSet()
    return first.filter { it.id in inter }
}

/** Intersection of workout-name catalogs across the selected programs (order from the first). */
internal fun workoutIntersection(lists: List<List<ProgramWorkoutDTO>>): List<String> {
    if (lists.isEmpty()) return emptyList()
    val first = lists.first().map { it.workoutName }.distinct()
    var inter = first.toSet()
    for (l in lists.drop(1)) inter = inter intersect l.map { it.workoutName }.toSet()
    return first.filter { it in inter }
}
