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
import com.app.rasifiters.net.BulkHealthEntry
import com.app.rasifiters.net.BulkRowError
import com.app.rasifiters.net.ProgramMemberDTO
import com.app.rasifiters.ui.auth.PillButton
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.Locale

private const val MAX_ROWS = 200

/**
 * The home-screen-widget deep-link target for "Log daily health" — the SAME multi-row batch form as the
 * in-app [LogHealthScreen] (reusing its `internal` [HealthRow] model + validation helpers +
 * [HealthRowCard]), reached when the Glance `AddDailyHealthWidget` deep-links `rasifiters://quick-add-health`
 * (D-ANDROID-WIDGET-3). Two deltas from the in-app form (1:1 with iOS `QuickAddHealthWidgetEntryView`):
 *   1. NO auto-selected program — `currentProgramId = ""`, nothing force-checked, member options are the
 *      INTERSECTION across the selected programs (per-program lookups cached below). No workout list.
 *   2. Back / system-back / the post-save dwell exit to My Programs; the batch save passes the first
 *      selected program as the primary `program_id` + the full set as `program_ids`. A row is valid with
 *      ANY ONE of sleep / diet / steps (R-1); in-batch (member, date) duplicates are flagged client-side.
 */
@Composable
fun QuickAddHealthWidgetScreen(programContext: ProgramContext, onExit: () -> Unit) {
    val scope = rememberCoroutineScope()
    val selfMemberId = programContext.loggedInMemberId
    val selfName = programContext.loggedInMemberName ?: "You"

    val programs by programContext.programs.collectAsStateWithLifecycle()
    var selectedProgramIds by remember { mutableStateOf<Set<String>>(emptySet()) }

    val baseCanSelectAnyMember = programContext.canLogForAnyProgramMember
    val selectedPrograms = programs.filter { it.id in selectedProgramIds }
    val memberLocked = selectedProgramIds.isNotEmpty() && selectedPrograms.any { !programContext.isPrivilegedIn(it) }
    val canSelectAnyMember = selectedProgramIds.isNotEmpty() && baseCanSelectAnyMember && !memberLocked
    val ignoreMember = !canSelectAnyMember
    val identityMissing = ignoreMember && selfMemberId.isNullOrBlank()

    // Per-program member lookups (no single active program), intersected across the selection.
    val membersByProgram = remember { mutableStateMapOf<String, List<ProgramMemberDTO>>() }
    val allLookupsPresent = selectedProgramIds.isNotEmpty() && selectedProgramIds.all { membersByProgram[it] != null }

    val memberOptions: List<PickerOption> =
        if (allLookupsPresent)
            memberIntersection(selectedProgramIds.map { membersByProgram[it]!! })
                .map { PickerOption(it.id, it.memberName) }
                .sortedBy { it.label.lowercase() }
        else emptyList()

    val rows = remember { mutableStateListOf<HealthRow>() }
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
            rows.add(HealthRow(nextUid.value++, seedMember, baseDate, "", "", "", ""))
        }
    }

    fun updateRow(uid: Int, transform: (HealthRow) -> HealthRow) {
        val i = rows.indexOfFirst { it.uid == uid }
        if (i >= 0) rows[i] = transform(rows[i])
        rowErrors = rowErrors?.filterNot { submittedOrder.getOrNull(it.index) == uid }?.takeIf { it.isNotEmpty() }
    }

    LaunchedEffect(Unit) {
        if (programContext.programs.value.isEmpty()) programContext.loadPrograms()
        if (rows.isEmpty()) addRows(1)
    }

    // Selection changed: fetch missing per-program member lookups, then (once ALL present) drop per-row
    // members no longer shared across the selection. Never wiped on a transient miss (iOS parity).
    LaunchedEffect(selectedProgramIds) {
        for (pid in selectedProgramIds) {
            if (membersByProgram[pid] == null) {
                programContext.fetchProgramMembersFor(pid).onSuccess { membersByProgram[pid] = it }
            }
        }
        if (selectedProgramIds.isNotEmpty() && selectedProgramIds.all { membersByProgram[it] != null }) {
            val memberIds = memberIntersection(selectedProgramIds.map { membersByProgram[it]!! }).map { it.id }.toSet()
            for (i in rows.indices) {
                val r = rows[i]
                if (!ignoreMember && r.memberId.isNotBlank() && r.memberId !in memberIds) {
                    rows[i] = r.copy(memberId = "")
                }
            }
        }
    }

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
    val canSubmit = selectedProgramIds.isNotEmpty() && valid.isNotEmpty() && invalidCount == 0 && !saving && !identityMissing

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
        val ids = selectedProgramIds.sorted()
        val primary = ids.firstOrNull() ?: return
        submittedOrder = included.map { it.uid }
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
        showSuccessToast = false
        scope.launch {
            programContext.addDailyHealthLogsBatchExplicit(primary, ids, entries)
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
                        errorMessage = e.message ?: "Couldn't save the daily logs."
                    }
                }
        }
    }

    BackHandler { onExit() }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DetailTopBar(onBack = onExit, centerTitle = "Log daily health")
            Text(
                "Add a row per day — sleep, diet quality, and steps — then save them all at once.",
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
                WidgetHealthAddRowLink("+ Add row", enabled = rows.size < MAX_ROWS) { addRows(1) }
                WidgetHealthAddRowLink("+ Add 5 rows", enabled = rows.size < MAX_ROWS) { addRows(5) }
            }

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

        if (showSuccessToast) {
            WidgetHealthSuccessToast(
                text = "Daily health logged",
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp),
            )
        }
    }
}

@Composable
private fun WidgetHealthAddRowLink(label: String, enabled: Boolean, onClick: () -> Unit) {
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
private fun WidgetHealthSuccessToast(text: String, modifier: Modifier = Modifier) {
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
