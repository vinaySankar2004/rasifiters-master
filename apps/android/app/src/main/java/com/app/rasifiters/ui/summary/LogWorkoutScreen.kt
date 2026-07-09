package com.app.rasifiters.ui.summary

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
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
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.net.ApiException
import com.app.rasifiters.net.BulkRowError
import com.app.rasifiters.net.BulkWorkoutEntry
import com.app.rasifiters.net.ProgramDTO
import com.app.rasifiters.ui.auth.PillButton
import kotlinx.coroutines.launch
import java.time.LocalDate

private const val MAX_ROWS = 200

// `internal` (not private) so the widget quick-add form (QuickAddWorkoutWidgetScreen) reuses the exact
// same row model + validation helpers + card — the iOS "same batch form as the in-app view" contract.
internal data class WorkoutRow(
    val uid: Int,
    val memberId: String,
    val workoutName: String,
    val date: LocalDate,
    val hours: String,
    val minutes: String,
)

internal fun WorkoutRow.durationMinutes(): Int = (hours.toIntOrNull() ?: 0) * 60 + (minutes.toIntOrNull() ?: 0)

internal fun WorkoutRow.isEmpty(ignoreMember: Boolean): Boolean {
    val memberEmpty = ignoreMember || memberId.isBlank()
    return memberEmpty && workoutName.isBlank() && hours.isBlank() && minutes.isBlank()
}

internal fun WorkoutRow.isValid(ignoreMember: Boolean): Boolean {
    val h = hours.toIntOrNull() ?: 0
    val m = minutes.toIntOrNull() ?: 0
    return (ignoreMember || memberId.isNotBlank()) &&
        workoutName.isNotBlank() &&
        h >= 0 && m in 0..59 && (h * 60 + m) > 0
}

/**
 * The Summary "Add workouts" multi-row log form (iOS `AddWorkoutsDetailView` / web `LogWorkoutsForm`).
 * Each row = member (admin/logger only; hidden + self-seeded for a plain member) · workout · date ·
 * duration. Up to 200 rows saved atomically via POST /workout-logs/batch. Faithful to log-workout §4/§8:
 * empty rows skipped, a non-empty invalid row blocks the whole submit, per-row backend errors highlight
 * the offending card. Success bumps the Summary refresh (D-C3) and pops back; a `dataEntryLocked` mount
 * guard pops immediately (D-C1).
 */
@Composable
fun LogWorkoutScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val baseCanSelectAnyMember = programContext.canLogForAnyMember
    val selfMemberId = programContext.loggedInMemberId
    val selfName = programContext.loggedInMemberName ?: "You"

    // Multi-program selection (DC-2): the current program is always selected; picking a program where the
    // user is neither admin nor logger locks member selection to self (DC-3 — the backend re-enforces).
    val programs by programContext.programs.collectAsStateWithLifecycle()
    val currentProgramId = programContext.activeProgram.collectAsStateWithLifecycle().value?.id ?: ""
    var selectedProgramIds by remember { mutableStateOf(setOf(currentProgramId)) }
    fun privileged(p: ProgramDTO): Boolean =
        programContext.isGlobalAdmin || p.myRole?.lowercase() in setOf("admin", "logger")
    val memberLocked = selectedProgramIds.any { id ->
        programs.firstOrNull { it.id == id }?.let { !privileged(it) } ?: false
    }
    val canSelectAnyMember = baseCanSelectAnyMember && !memberLocked
    val ignoreMember = !canSelectAnyMember
    val identityMissing = ignoreMember && selfMemberId.isNullOrBlank()

    var memberOptions by remember { mutableStateOf<List<PickerOption>>(emptyList()) }
    var workoutOptions by remember { mutableStateOf<List<PickerOption>>(emptyList()) }
    var lookupsLoaded by remember { mutableStateOf(false) }

    val rows = remember { mutableStateListOf<WorkoutRow>() }
    val nextUid = remember { mutableStateOf(0) }
    var submittedOrder by remember { mutableStateOf<List<Int>>(emptyList()) }
    var rowErrors by remember { mutableStateOf<List<BulkRowError>?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }

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
        // Editing a row clears any stale server error still shown on it (iOS AddWorkoutsDetailView parity).
        rowErrors = rowErrors?.filterNot { submittedOrder.getOrNull(it.index) == uid }?.takeIf { it.isNotEmpty() }
    }

    // Mount: lock guard (D-C1) + lookups (incl. the program list for the multi-select) + one starter row.
    LaunchedEffect(Unit) {
        if (programContext.dataEntryLocked) { onBack(); return@LaunchedEffect }
        addRows(1)
        if (programContext.programs.value.isEmpty()) programContext.loadPrograms()
        programContext.loadProgramMembers().onSuccess { list ->
            memberOptions = list.map { PickerOption(it.id, it.memberName) }
        }
        programContext.loadProgramWorkouts().onSuccess { list ->
            workoutOptions = list.map { PickerOption(it.workoutName, it.workoutName) }
        }
        lookupsLoaded = true
    }

    // Lock transition (DC-3): every row's member resets to self the moment the selection turns non-privileged.
    LaunchedEffect(memberLocked) {
        if (memberLocked) {
            for (i in rows.indices) rows[i] = rows[i].copy(memberId = selfMemberId ?: "")
        }
    }

    val nonEmpty = rows.filterNot { it.isEmpty(ignoreMember) }
    val valid = nonEmpty.filter { it.isValid(ignoreMember) }
    val invalidCount = nonEmpty.size - valid.size
    val distinctMembers = valid.map { it.memberId }.toSet().size
    val totalMinutes = valid.sumOf { it.durationMinutes() }
    val canSubmit = valid.isNotEmpty() && invalidCount == 0 && !saving && !identityMissing

    // Map backend per-row errors (indexed by submit order) back onto current rows by uid.
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
        scope.launch {
            programContext.addWorkoutLogsBatch(entries, selectedProgramIds.toList())
                .onSuccess { saving = false; onBack() }
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
            DetailTopBar(onBack = onBack, centerTitle = "Add workouts")
            Text(
                subtitle,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )

            ProgramMultiSelect(
                programs = programs,
                currentProgramId = currentProgramId,
                selectedIds = selectedProgramIds,
                isLocked = { programContext.isDataEntryLocked(it) },
                memberLockHint = if (memberLocked && baseCanSelectAnyMember)
                    "You're not an admin or logger in every selected program — logging for yourself only."
                else null,
                onToggle = { id ->
                    selectedProgramIds =
                        if (id in selectedProgramIds) selectedProgramIds - id else selectedProgramIds + id
                },
            )

            if (lookupsLoaded && workoutOptions.isEmpty()) {
                LookupHint("No workout types available for this program yet.")
            } else if (lookupsLoaded && canSelectAnyMember && memberOptions.isEmpty()) {
                LookupHint("No active members in this program yet.")
            }

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
                AddRowLink("+ Add row", enabled = rows.size < MAX_ROWS) { addRows(1) }
                AddRowLink("+ Add 5 rows", enabled = rows.size < MAX_ROWS) { addRows(5) }
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
                PillButton(
                    label = "Save all",
                    onClick = { submit() },
                    enabled = canSubmit,
                    loading = saving,
                )
            }
        }
    }
}

@Composable
internal fun WorkoutRowCard(
    index: Int,
    row: WorkoutRow,
    canSelectAnyMember: Boolean,
    selfName: String,
    memberOptions: List<PickerOption>,
    workoutOptions: List<PickerOption>,
    memberError: String?,
    workoutError: String?,
    durationError: String?,
    rowLevelError: String?,
    onMember: (String) -> Unit,
    onWorkout: (String) -> Unit,
    onDate: (LocalDate) -> Unit,
    onHours: (String) -> Unit,
    onMinutes: (String) -> Unit,
    onRemove: () -> Unit,
) {
    val hasError = rowLevelError != null
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(
                1.dp,
                if (hasError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f),
                RoundedCornerShape(20.dp),
            )
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Entry ${index + 1}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .clickable(onClick = onRemove),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Close, contentDescription = "Remove entry", tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f), modifier = Modifier.size(16.dp))
            }
        }

        if (canSelectAnyMember) {
            FormFieldLabel("Member")
            SearchablePickerField(
                placeholder = "Select member",
                sheetTitle = "Select member",
                selectedValue = row.memberId,
                options = memberOptions,
                onSelect = onMember,
            )
            memberError?.let { FormErrorText(it) }
        } else {
            FormFieldLabel("Member")
            LockedMemberField(selfName)
        }

        FormFieldLabel("Workout")
        SearchablePickerField(
            placeholder = "Select workout",
            sheetTitle = "Select workout",
            selectedValue = row.workoutName,
            options = workoutOptions,
            onSelect = onWorkout,
        )
        workoutError?.let { FormErrorText(it) }

        FormFieldLabel("Date")
        DatePillField(date = row.date, onChange = onDate, allowFuture = true)

        FormFieldLabel("Duration")
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            NumberField("Hours", row.hours, onHours, modifier = Modifier.weight(1f))
            NumberField("Minutes", row.minutes, onMinutes, modifier = Modifier.weight(1f))
        }
        durationError?.let { FormErrorText(it) }
        rowLevelError?.let { FormErrorText(it) }
    }
}

@Composable
private fun AddRowLink(label: String, enabled: Boolean, onClick: () -> Unit) {
    Text(
        label,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        color = if (enabled) AppOrange else AppOrange.copy(alpha = 0.4f),
        modifier = Modifier.clickable(enabled = enabled, onClick = onClick),
    )
}

/**
 * The multi-program selector shared by both log forms (DC-2/DC-3/DC-4). The current program is always
 * checked + disabled ("Current program"); `admin_only_data_entry` programs the user can't log to render
 * locked ("Admin-only — can't log", mirroring the health-sync program rows); hidden entirely when the
 * user belongs to only one program. `memberLockHint` (DC-3) renders as a footnote when non-null.
 */
@Composable
internal fun ProgramMultiSelect(
    programs: List<ProgramDTO>,
    currentProgramId: String,
    selectedIds: Set<String>,
    isLocked: (String) -> Boolean,
    memberLockHint: String?,
    onToggle: (String) -> Unit,
    // The widget quick-add forms have no current program, so a single visible program still needs the
    // selector (there's nothing auto-checked). `alwaysShow=true` keeps it rendered in that case.
    alwaysShow: Boolean = false,
) {
    // Show only programs the user can log to: the current program is always kept, plus any active
    // program that isn't admin-only-data-entry-locked. Drops completed/planned + locked rows.
    val visible = programs.filter { program ->
        program.id == currentProgramId ||
            ((program.status ?: "active").lowercase() == "active" && !isLocked(program.id))
    }
    if (visible.size <= 1 && !alwaysShow) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FormFieldLabel("Programs")
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f), RoundedCornerShape(14.dp)),
        ) {
            visible.forEachIndexed { index, program ->
                val isCurrent = program.id == currentProgramId
                val locked = !isCurrent && isLocked(program.id)
                val isSelected = isCurrent || program.id in selectedIds
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = !isCurrent && !locked) { onToggle(program.id) }
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(
                        when {
                            locked -> Icons.Filled.Lock
                            isSelected -> Icons.Filled.CheckCircle
                            else -> Icons.Filled.RadioButtonUnchecked
                        },
                        contentDescription = null,
                        tint = if (isSelected && !locked) AppOrange
                        else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f),
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(program.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                        Text(
                            when {
                                isCurrent -> "Current program"
                                locked -> "Admin-only — can't log"
                                else -> program.status ?: "Active"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        )
                    }
                }
                if (index != visible.lastIndex) {
                    HorizontalDivider(
                        color = MaterialTheme.colorScheme.outlineVariant,
                        modifier = Modifier.padding(start = 50.dp),
                    )
                }
            }
        }
        memberLockHint?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }
    }
}

@Composable
private fun LookupHint(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    )
}
