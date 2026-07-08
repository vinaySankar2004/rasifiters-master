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
import androidx.compose.material.icons.filled.Close
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
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.net.ApiException
import com.app.rasifiters.net.BulkRowError
import com.app.rasifiters.net.BulkWorkoutEntry
import com.app.rasifiters.ui.auth.PillButton
import kotlinx.coroutines.launch
import java.time.LocalDate

private const val MAX_ROWS = 200

private data class WorkoutRow(
    val uid: Int,
    val memberId: String,
    val workoutName: String,
    val date: LocalDate,
    val hours: String,
    val minutes: String,
)

private fun WorkoutRow.durationMinutes(): Int = (hours.toIntOrNull() ?: 0) * 60 + (minutes.toIntOrNull() ?: 0)

private fun WorkoutRow.isEmpty(ignoreMember: Boolean): Boolean {
    val memberEmpty = ignoreMember || memberId.isBlank()
    return memberEmpty && workoutName.isBlank() && hours.isBlank() && minutes.isBlank()
}

private fun WorkoutRow.isValid(ignoreMember: Boolean): Boolean {
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
    val canSelectAnyMember = programContext.canLogForAnyMember
    val ignoreMember = !canSelectAnyMember
    val selfMemberId = programContext.loggedInMemberId
    val selfName = programContext.loggedInMemberName ?: "You"
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
    }

    // Mount: lock guard (D-C1) + lookups + one starter row.
    LaunchedEffect(Unit) {
        if (programContext.dataEntryLocked) { onBack(); return@LaunchedEffect }
        addRows(1)
        programContext.loadProgramMembers().onSuccess { list ->
            memberOptions = list.map { PickerOption(it.id, it.memberName) }
        }
        programContext.loadProgramWorkouts().onSuccess { list ->
            workoutOptions = list.map { PickerOption(it.workoutName, it.workoutName) }
        }
        lookupsLoaded = true
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
            programContext.addWorkoutLogsBatch(entries)
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
private fun WorkoutRowCard(
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
