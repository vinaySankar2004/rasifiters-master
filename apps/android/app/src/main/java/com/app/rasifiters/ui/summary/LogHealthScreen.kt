package com.app.rasifiters.ui.summary

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.ui.auth.AppDropdownField
import com.app.rasifiters.ui.auth.PillButton
import kotlinx.coroutines.launch
import java.time.LocalDate

private const val CLEAR_RATING = "Clear rating"

/**
 * The Summary "Log daily health" form (iOS `AddDailyHealthDetailView` / web `LogDailyHealthForm`). Logs a
 * day's sleep time (hours + minutes) and/or diet quality (1–5) for a member (admins/loggers pick anyone;
 * a plain member is locked to self) on a past/today date. At-least-one-metric is required. Faithful to
 * log-health §4/§8: sleep 0:00–24:00 validation, explicit-null diet clear, success → Summary refresh
 * (D-C3) + pop; `dataEntryLocked` mount guard pops immediately (D-C1); inline errors (D-C4).
 */
@Composable
fun LogHealthScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val canSelectAnyMember = programContext.canLogForAnyMember
    val selfMemberId = programContext.loggedInMemberId
    val selfName = programContext.loggedInMemberName ?: "You"
    val identityMissing = !canSelectAnyMember && selfMemberId.isNullOrBlank()

    var memberOptions by remember { mutableStateOf<List<PickerOption>>(emptyList()) }
    var memberId by remember { mutableStateOf(if (canSelectAnyMember) "" else (selfMemberId ?: "")) }
    var date by remember { mutableStateOf(LocalDate.now()) }
    var sleepHours by remember { mutableStateOf("") }
    var sleepMinutes by remember { mutableStateOf("") }
    var foodQuality by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        if (programContext.dataEntryLocked) { onBack(); return@LaunchedEffect }
        programContext.loadProgramMembers().onSuccess { list ->
            memberOptions = list.map { PickerOption(it.id, it.memberName) }
            // Self-lock fallback: if not picking, ensure member id is set (falls back to first — F3).
            if (!canSelectAnyMember && memberId.isBlank()) {
                memberId = selfMemberId ?: list.firstOrNull()?.id ?: ""
            }
        }
    }

    // Sleep validation (web parity): each part optional; combined 0:00–24:00.
    val hoursProvided = sleepHours.isNotBlank()
    val minutesProvided = sleepMinutes.isNotBlank()
    val hasSleepInput = hoursProvided || minutesProvided
    val hoursValue = if (hoursProvided) sleepHours.toIntOrNull() else 0
    val minutesValue = if (minutesProvided) sleepMinutes.toIntOrNull() else 0
    val hoursValid = !hoursProvided || (hoursValue != null && hoursValue in 0..24)
    val minutesValid = !minutesProvided || (minutesValue != null && minutesValue in 0..59)
    val sleepTotal: Double? = if (hasSleepInput && hoursValid && minutesValid && hoursValue != null && minutesValue != null)
        hoursValue + minutesValue / 60.0 else null
    val sleepValue = if (hasSleepInput) sleepTotal else null
    val sleepValid = !hasSleepInput || (sleepTotal != null && sleepTotal in 0.0..24.0)
    val foodValue = foodQuality.toIntOrNull()
    val hasMetric = sleepValue != null || foodValue != null
    val canSubmit = hasMetric && sleepValid && (canSelectAnyMember.not() || memberId.isNotBlank()) &&
        !saving && !identityMissing

    fun submit() {
        if (!canSubmit) return
        val target = if (canSelectAnyMember) memberId else (selfMemberId ?: memberId)
        saving = true
        errorMessage = null
        scope.launch {
            programContext.addDailyHealthLog(
                memberId = target,
                logDate = date.toString(),
                sleepHours = sleepValue,
                foodQuality = foodValue,
            ).onSuccess { saving = false; onBack() }
                .onFailure { e -> saving = false; errorMessage = e.message ?: "Couldn't save the daily log." }
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
                "Log today's sleep and diet quality.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )

            FormFieldLabel("Member")
            if (canSelectAnyMember) {
                SearchablePickerField(
                    placeholder = "Select member",
                    sheetTitle = "Select member",
                    selectedValue = memberId,
                    options = memberOptions,
                    onSelect = { memberId = it },
                )
            } else {
                LockedMemberField(selfName)
            }

            FormFieldLabel("Date")
            DatePillField(date = date, onChange = { date = it }, allowFuture = false)

            FormFieldLabel("Sleep time")
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                NumberField("Hours", sleepHours, { sleepHours = it }, modifier = Modifier.weight(1f))
                NumberField("Minutes", sleepMinutes, { sleepMinutes = it }, modifier = Modifier.weight(1f))
            }
            if (!sleepValid) FormErrorText("Sleep time must be between 0:00 and 24:00.")

            FormFieldLabel("Diet quality")
            AppDropdownField(
                placeholder = "Select rating (1-5)",
                value = foodQuality,
                options = listOf("1", "2", "3", "4", "5") + if (foodQuality.isNotBlank()) listOf(CLEAR_RATING) else emptyList(),
                onSelect = { foodQuality = if (it == CLEAR_RATING) "" else it },
            )

            if (identityMissing) {
                FormErrorText("We couldn't identify your account. Please sign out and back in, then try again.")
            }
            errorMessage?.let { FormErrorText(it) }

            Spacer(Modifier.height(4.dp))
            Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                PillButton(label = "Save daily log", onClick = { submit() }, enabled = canSubmit, loading = saving)
            }
        }
    }
}
