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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.net.ApiException
import com.app.rasifiters.net.BulkHealthEntry
import com.app.rasifiters.net.BulkRowError
import com.app.rasifiters.net.ProgramDTO
import com.app.rasifiters.ui.auth.AppDropdownField
import com.app.rasifiters.ui.auth.AppTextField
import com.app.rasifiters.ui.auth.PillButton
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.Locale

private const val MAX_ROWS = 200
private const val CLEAR_RATING = "Clear rating"

private data class HealthRow(
    val uid: Int,
    val memberId: String,
    val date: LocalDate,
    val sleepHours: String,
    val sleepMinutes: String,
    val diet: String,
    val steps: String,
)

private fun HealthRow.isEmpty(ignoreMember: Boolean): Boolean {
    val memberEmpty = ignoreMember || memberId.isBlank()
    return memberEmpty && sleepHours.isBlank() && sleepMinutes.isBlank() && diet.isBlank() && steps.isBlank()
}

/** Combined sleep hours (h + m/60) when any part is present and parseable; null otherwise. */
private fun HealthRow.sleepTotal(): Double? {
    if (sleepHours.isBlank() && sleepMinutes.isBlank()) return null
    val h = if (sleepHours.isBlank()) 0 else sleepHours.toIntOrNull() ?: return null
    val m = if (sleepMinutes.isBlank()) 0 else sleepMinutes.toIntOrNull() ?: return null
    return h + m / 60.0
}

/** Sleep validity (web parity): parts optional; minutes 0–59; combined 0:00–24:00. */
private fun HealthRow.sleepValid(): Boolean {
    if (sleepHours.isBlank() && sleepMinutes.isBlank()) return true
    val m = if (sleepMinutes.isBlank()) 0 else sleepMinutes.toIntOrNull() ?: return false
    if (m !in 0..59) return false
    val total = sleepTotal() ?: return false
    return total in 0.0..24.0
}

private fun HealthRow.stepsValue(): Int? = steps.toIntOrNull()

private fun HealthRow.isValid(ignoreMember: Boolean): Boolean {
    if (!(ignoreMember || memberId.isNotBlank())) return false
    if (!sleepValid()) return false
    if (steps.isNotBlank() && stepsValue() == null) return false
    // At least one metric — sleep, diet, or steps (DC-6/R-1).
    return sleepTotal() != null || diet.toIntOrNull() != null || stepsValue() != null
}

/**
 * The Summary "Log daily health" MULTI-ROW form (iOS `AddDailyHealthDetailView` / web `LogDailyHealthForm`,
 * batched rebuild). Each row = member (admin/logger only; hidden + self-seeded for a plain member) · date ·
 * sleep (hr/min) · diet (1–5) · steps — at-least-one-metric per row (DC-6/R-1). Up to 200 rows saved
 * atomically per program via POST /daily-health-logs/batch (existing dates upsert, DC-5), fanned out to
 * every selected program (DC-2/DC-3). Empty rows skipped; a non-empty invalid row blocks the submit;
 * per-row backend errors highlight the offending card. Success bumps the Summary refresh (D-C3) and pops
 * back; a `dataEntryLocked` mount guard pops immediately (D-C1); inline errors (D-C4).
 */
@Composable
fun LogHealthScreen(programContext: ProgramContext, onBack: () -> Unit) {
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
    var lookupsLoaded by remember { mutableStateOf(false) }

    val rows = remember { mutableStateListOf<HealthRow>() }
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
            rows.add(HealthRow(nextUid.value++, seedMember, baseDate, "", "", "", ""))
        }
    }

    fun updateRow(uid: Int, transform: (HealthRow) -> HealthRow) {
        val i = rows.indexOfFirst { it.uid == uid }
        if (i >= 0) rows[i] = transform(rows[i])
        // Editing a row clears any stale server error still shown on it (log-workout parity).
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
        lookupsLoaded = true
    }

    // Lock transition (DC-3): every row's member resets to self the moment the selection turns non-privileged.
    LaunchedEffect(memberLocked) {
        if (memberLocked) {
            for (i in rows.indices) rows[i] = rows[i].copy(memberId = selfMemberId ?: "")
        }
    }

    val nonEmpty = rows.filterNot { it.isEmpty(ignoreMember) }
    // Client in-batch duplicate check (DC-5 mirror): two non-empty rows can't share (member, date).
    fun effectiveMemberId(r: HealthRow) = if (ignoreMember) (selfMemberId ?: "") else r.memberId
    val dupUids = nonEmpty
        .groupBy { "${effectiveMemberId(it)}|${it.date}" }
        .values.filter { it.size > 1 }
        .flatMap { group -> group.map { it.uid } }
        .toSet()
    val valid = nonEmpty.filter { it.isValid(ignoreMember) && it.uid !in dupUids }
    val invalidCount = nonEmpty.size - valid.size
    val distinctMembers = valid.map { effectiveMemberId(it) }.toSet().size
    val totalSleepMinutes = valid.sumOf { ((it.sleepTotal() ?: 0.0) * 60).toInt() }
    val totalSteps = valid.sumOf { it.stepsValue() ?: 0 }
    val canSubmit = valid.isNotEmpty() && invalidCount == 0 && !saving && !identityMissing

    // Map backend per-row errors (indexed by submit order) back onto current rows by uid.
    fun backendFieldError(uid: Int, field: String): String? {
        val errs = rowErrors ?: return null
        return errs.firstOrNull { it.field == field && submittedOrder.getOrNull(it.index) == uid }?.message
    }
    fun backendRowLevelError(uid: Int): String? {
        val errs = rowErrors ?: return null
        return errs.firstOrNull {
            it.field !in setOf("member_id", "log_date", "sleep_hours", "food_quality", "steps") &&
                submittedOrder.getOrNull(it.index) == uid
        }?.message
    }

    fun submit() {
        if (!canSubmit) return
        val included = rows.filter { !it.isEmpty(ignoreMember) && it.isValid(ignoreMember) }
        if (included.isEmpty()) return
        submittedOrder = included.map { it.uid }
        // Empty metrics are OMITTED (never null) — JSON presence drives the backend upsert (DC-5/DC-6).
        val entries = included.map {
            BulkHealthEntry(
                memberId = effectiveMemberId(it),
                logDate = it.date.toString(),
                sleepHours = it.sleepTotal(),
                foodQuality = it.diet.toIntOrNull(),
                steps = it.stepsValue(),
            )
        }
        saving = true
        errorMessage = null
        rowErrors = null
        scope.launch {
            programContext.addDailyHealthLogsBatch(entries, selectedProgramIds.toList())
                .onSuccess { saving = false; onBack() }
                .onFailure { e ->
                    saving = false
                    if (e is ApiException && !e.rowErrors.isNullOrEmpty()) {
                        rowErrors = e.rowErrors
                        errorMessage = e.message
                    } else {
                        errorMessage = e.message ?: "Couldn't save the daily logs."
                    }
                }
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Log daily health")
            Text(
                "Add a row per day — sleep, diet quality, and steps — then save them all at once.",
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

            if (lookupsLoaded && canSelectAnyMember && memberOptions.isEmpty()) {
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

            rows.forEachIndexed { index, row ->
                HealthRowCard(
                    index = index,
                    row = row,
                    canSelectAnyMember = canSelectAnyMember,
                    selfName = selfName,
                    memberOptions = memberOptions,
                    memberError = backendFieldError(row.uid, "member_id"),
                    dateError = backendFieldError(row.uid, "log_date"),
                    sleepError = backendFieldError(row.uid, "sleep_hours"),
                    dietError = backendFieldError(row.uid, "food_quality"),
                    stepsError = backendFieldError(row.uid, "steps"),
                    rowLevelError = backendRowLevelError(row.uid)
                        ?: if (row.uid in dupUids) "Duplicate date for this member" else null,
                    onMember = { updateRow(row.uid) { r -> r.copy(memberId = it) } },
                    onDate = { updateRow(row.uid) { r -> r.copy(date = it) } },
                    onSleepHours = { updateRow(row.uid) { r -> r.copy(sleepHours = it) } },
                    onSleepMinutes = { updateRow(row.uid) { r -> r.copy(sleepMinutes = it) } },
                    onDiet = { updateRow(row.uid) { r -> r.copy(diet = it) } },
                    onSteps = { updateRow(row.uid) { r -> r.copy(steps = it) } },
                    onRemove = { rows.removeAll { it.uid == row.uid } },
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                HealthAddRowLink("+ Add row", enabled = rows.size < MAX_ROWS) { addRows(1) }
                HealthAddRowLink("+ Add 5 rows", enabled = rows.size < MAX_ROWS) { addRows(5) }
            }

            // Footer per DC-11: rows • members (member column only) • sleep total • steps total.
            Text(
                buildString {
                    append("${valid.size} rows")
                    if (canSelectAnyMember) append(" • $distinctMembers members")
                    append(" • ${totalSleepMinutes / 60}h ${totalSleepMinutes % 60}m sleep")
                    append(" • ${String.format(Locale.US, "%,d", totalSteps)} steps")
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
    }
}

@Composable
private fun HealthRowCard(
    index: Int,
    row: HealthRow,
    canSelectAnyMember: Boolean,
    selfName: String,
    memberOptions: List<PickerOption>,
    memberError: String?,
    dateError: String?,
    sleepError: String?,
    dietError: String?,
    stepsError: String?,
    rowLevelError: String?,
    onMember: (String) -> Unit,
    onDate: (LocalDate) -> Unit,
    onSleepHours: (String) -> Unit,
    onSleepMinutes: (String) -> Unit,
    onDiet: (String) -> Unit,
    onSteps: (String) -> Unit,
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

        FormFieldLabel("Date")
        DatePillField(date = row.date, onChange = onDate, allowFuture = false)
        dateError?.let { FormErrorText(it) }

        FormFieldLabel("Sleep time")
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            NumberField("Hours", row.sleepHours, onSleepHours, modifier = Modifier.weight(1f))
            NumberField("Minutes", row.sleepMinutes, onSleepMinutes, modifier = Modifier.weight(1f))
        }
        if (!row.sleepValid()) FormErrorText("Sleep time must be between 0:00 and 24:00.")
        sleepError?.let { FormErrorText(it) }

        FormFieldLabel("Diet quality")
        AppDropdownField(
            placeholder = "Select rating (1-5)",
            value = row.diet,
            options = listOf("1", "2", "3", "4", "5") + if (row.diet.isNotBlank()) listOf(CLEAR_RATING) else emptyList(),
            onSelect = { onDiet(if (it == CLEAR_RATING) "" else it) },
        )
        dietError?.let { FormErrorText(it) }

        FormFieldLabel("Steps")
        // AppTextField directly (not NumberField, which caps at 2 digits) — step counts run to 6 digits.
        AppTextField(
            label = "Steps",
            value = row.steps,
            onValueChange = { onSteps(it.filter { ch -> ch.isDigit() }.take(6)) },
            keyboardType = KeyboardType.Number,
        )
        stepsError?.let { FormErrorText(it) }
        rowLevelError?.let { FormErrorText(it) }
    }
}

@Composable
private fun HealthAddRowLink(label: String, enabled: Boolean, onClick: () -> Unit) {
    Text(
        label,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        color = if (enabled) AppOrange else AppOrange.copy(alpha = 0.4f),
        modifier = Modifier.clickable(enabled = enabled, onClick = onClick),
    )
}
