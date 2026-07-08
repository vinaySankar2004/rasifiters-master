package com.app.rasifiters.ui.members

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppBlueLight
import com.app.rasifiters.core.theme.AppRed
import com.app.rasifiters.net.MemberHealthItem
import com.app.rasifiters.ui.auth.AppDropdownField
import com.app.rasifiters.ui.auth.AppTextField
import com.app.rasifiters.ui.auth.PillButton
import com.app.rasifiters.ui.summary.FormFieldLabel
import kotlinx.coroutines.launch
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Per-member daily-Health logs (iOS `MemberHealthDetail`) — the write twin of View Workouts. Sorted/
 * filterable list + per-row Edit (sleep + diet, at-least-one-metric + 0:00–24:00) / Delete + CSV export.
 * `admin_only_data_entry` LIVE (Edit/Delete hidden when `dataEntryLocked`). Server-driven fetch.
 */
enum class HealthSortField(val api: String, val label: String) {
    DATE("date", "Date"), SLEEP("sleep_hours", "Sleep Hours"), DIET("food_quality", "Diet Quality"),
}

data class HealthFilters(
    val custom: Boolean = false,
    val start: java.time.LocalDate? = null,
    val end: java.time.LocalDate? = null,
    val minSleep: String = "",
    val maxSleep: String = "",
    val minDiet: String = "",
    val maxDiet: String = "",
) {
    val isActive: Boolean get() = custom || minSleep.isNotBlank() || maxSleep.isNotBlank() || minDiet.isNotBlank() || maxDiet.isNotBlank()
}

private const val CLEAR_RATING = "Clear rating"

@Composable
fun MemberHealthDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val items by programContext.memberHealthLogs.collectAsStateWithLifecycle()
    val memberId by programContext.focusedMemberId.collectAsStateWithLifecycle()
    val memberName by programContext.focusedMemberName.collectAsStateWithLifecycle()
    val locked = programContext.dataEntryLocked

    var sortField by remember { mutableStateOf(HealthSortField.DATE) }
    var sortDir by remember { mutableStateOf(SortDir.DESC) }
    var filters by remember { mutableStateOf(HealthFilters()) }
    var showSort by remember { mutableStateOf(false) }
    var showFilter by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    var editItem by remember { mutableStateOf<MemberHealthItem?>(null) }
    var deleteItem by remember { mutableStateOf<MemberHealthItem?>(null) }

    suspend fun reload() {
        val id = memberId ?: return
        loading = true
        programContext.loadMemberHealthLogs(
            memberId = id, limit = 0,
            startDate = if (filters.custom) filters.start?.toString() else null,
            endDate = if (filters.custom) filters.end?.toString() else null,
            sortBy = sortField.api, sortDir = sortDir.api,
            minSleepHours = filters.minSleep.toDoubleOrNull(),
            maxSleepHours = filters.maxSleep.toDoubleOrNull(),
            minFoodQuality = filters.minDiet.toIntOrNull(),
            maxFoodQuality = filters.maxDiet.toIntOrNull(),
        )
        loading = false
    }

    LaunchedEffect(sortField, sortDir, filters, memberId) { reload() }

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
            when {
                loading && items.isEmpty() -> repeat(5) { SkeletonCard(height = 60.dp) }
                items.isEmpty() -> {
                    Text("No daily health logs found.", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                    Text("Adjust filters or log daily health to get started.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                }
                else -> items.forEach { h ->
                    val sleep = h.sleepHours?.let { String.format(Locale.US, "Sleep %.1f hrs", it) } ?: "Sleep —"
                    val diet = h.foodQuality?.let { "Diet $it/5" } ?: "Diet —"
                    LogRow(
                        dotColor = AppBlueLight, title = sleep, subtitle = h.logDate, trailing = diet,
                        locked = locked, onEdit = { editItem = h }, onDelete = { deleteItem = h },
                    )
                }
            }
        }
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
            onDismiss = { editItem = null },
            onSave = { sleepHours, foodQuality ->
                val id = memberId ?: return@HealthEditSheet
                scope.launch {
                    programContext.updateDailyHealthLog(id, item.logDate, sleepHours, foodQuality)
                        .onSuccess { editItem = null; reload() }
                }
            },
        )
    }

    deleteItem?.let { item ->
        AlertDialog(
            onDismissRequest = { deleteItem = null },
            title = { Text("Delete daily health log") },
            text = { Text("Are you sure you want to delete this daily health log from ${item.logDate}?") },
            confirmButton = {
                TextButton(onClick = {
                    val id = memberId
                    if (id != null) scope.launch { programContext.deleteDailyHealthLog(id, item.logDate).onSuccess { deleteItem = null; reload() } }
                }) { Text("Delete", color = AppRed) }
            },
            dismissButton = { TextButton(onClick = { deleteItem = null }) { Text("Cancel") } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HealthFilterSheet(
    initial: HealthFilters,
    onApply: (HealthFilters) -> Unit,
    onClear: () -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var f by remember { mutableStateOf(initial) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onClear) { Text("Clear all") }
                Spacer(Modifier.weight(1f))
                Text("Filters", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { onApply(f) }) { Text("Done", color = com.app.rasifiters.core.theme.AppOrange, fontWeight = FontWeight.Bold) }
            }
            Text("Date Range", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            Segmented(listOf("All", "Custom"), if (f.custom) 1 else 0) { f = f.copy(custom = it == 1) }
            if (f.custom) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Start", modifier = Modifier.weight(1f))
                    com.app.rasifiters.ui.summary.DatePillField(date = f.start ?: java.time.LocalDate.now(), onChange = { f = f.copy(start = it) }, allowFuture = false)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("End", modifier = Modifier.weight(1f))
                    com.app.rasifiters.ui.summary.DatePillField(date = f.end ?: java.time.LocalDate.now(), onChange = { f = f.copy(end = it) }, allowFuture = false)
                }
            }
            FormFieldLabel("Sleep (hrs)")
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppTextField(label = "Min", value = f.minSleep, onValueChange = { f = f.copy(minSleep = it.filter { c -> c.isDigit() || c == '.' }) }, keyboardType = KeyboardType.Number, modifier = Modifier.weight(1f))
                AppTextField(label = "Max", value = f.maxSleep, onValueChange = { f = f.copy(maxSleep = it.filter { c -> c.isDigit() || c == '.' }) }, keyboardType = KeyboardType.Number, modifier = Modifier.weight(1f))
            }
            FormFieldLabel("Diet Quality (1–5)")
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppTextField(label = "Min", value = f.minDiet, onValueChange = { f = f.copy(minDiet = it.filter { c -> c.isDigit() }.take(1)) }, keyboardType = KeyboardType.Number, modifier = Modifier.weight(1f))
                AppTextField(label = "Max", value = f.maxDiet, onValueChange = { f = f.copy(maxDiet = it.filter { c -> c.isDigit() }.take(1)) }, keyboardType = KeyboardType.Number, modifier = Modifier.weight(1f))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HealthEditSheet(item: MemberHealthItem, onDismiss: () -> Unit, onSave: (Double?, Int?) -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var hours by remember { mutableStateOf(item.sleepHours?.let { it.toInt().toString() } ?: "") }
    var minutes by remember { mutableStateOf(item.sleepHours?.let { (((it - it.toInt()) * 60).roundToInt()).toString() } ?: "") }
    var diet by remember { mutableStateOf(item.foodQuality?.toString() ?: "") }

    val hasSleep = hours.isNotBlank() || minutes.isNotBlank()
    val h = if (hours.isBlank()) 0 else hours.toIntOrNull()
    val m = if (minutes.isBlank()) 0 else minutes.toIntOrNull()
    val sleepValue: Double? = if (hasSleep && h != null && m != null) h + m / 60.0 else null
    val sleepValid = !hasSleep || (sleepValue != null && sleepValue in 0.0..24.0)
    val foodValue = diet.toIntOrNull()
    val hasMetric = sleepValue != null || foodValue != null
    val valid = hasMetric && sleepValid

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("Edit daily health", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(item.logDate, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            FormFieldLabel("Sleep time")
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppTextField(label = "Hours", value = hours, onValueChange = { hours = it.filter { c -> c.isDigit() }.take(2) }, keyboardType = KeyboardType.Number, modifier = Modifier.weight(1f))
                AppTextField(label = "Minutes", value = minutes, onValueChange = { minutes = it.filter { c -> c.isDigit() }.take(2) }, keyboardType = KeyboardType.Number, modifier = Modifier.weight(1f))
            }
            if (!sleepValid) Text("Sleep time must be between 0:00 and 24:00.", style = MaterialTheme.typography.bodySmall, color = AppRed, fontWeight = FontWeight.SemiBold)
            FormFieldLabel("Diet quality")
            AppDropdownField(
                placeholder = "Select rating (1-5)",
                value = diet,
                options = listOf("1", "2", "3", "4", "5") + if (diet.isNotBlank()) listOf(CLEAR_RATING) else emptyList(),
                onSelect = { diet = if (it == CLEAR_RATING) "" else it },
            )
            if (!hasMetric) Text("Enter sleep or diet quality.", style = MaterialTheme.typography.bodySmall, color = AppRed, fontWeight = FontWeight.SemiBold)
            Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                PillButton(label = "Save changes", onClick = { if (valid) onSave(sleepValue, foodValue) }, enabled = valid)
            }
        }
    }
}

private fun healthCsv(items: List<MemberHealthItem>): String {
    val sb = StringBuilder("Date,Sleep Hours,Diet Quality\n")
    items.forEach {
        sb.append(it.logDate).append(',')
            .append(it.sleepHours?.let { s -> String.format(Locale.US, "%.1f", s) } ?: "").append(',')
            .append(it.foodQuality ?: "").append('\n')
    }
    return sb.toString()
}
