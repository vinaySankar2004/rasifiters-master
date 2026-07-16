package com.app.rasifiters.ui.members

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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.ui.auth.AppTextField
import com.app.rasifiters.ui.summary.DatePillField
import java.time.LocalDate
import java.util.Locale

/**
 * Member Performance Metrics table (iOS `MemberMetricsDetailView`) — searchable, server-sorted, server-
 * filtered scroll of MemberMetricsCards + CSV export. Every control change re-fetches (server-driven, F1).
 * Read-only, no role gate on the screen (backend `ensureProgramAccess` is the boundary — F2).
 */
data class MetricsFilters(
    val custom: Boolean = false,
    val start: LocalDate? = null,
    val end: LocalDate? = null,
    val workoutsMin: String = "", val workoutsMax: String = "",
    val totalDurationMin: String = "", val totalDurationMax: String = "",
    val avgDurationMin: String = "", val avgDurationMax: String = "",
    val avgSleepMin: String = "", val avgSleepMax: String = "",
    val activeDaysMin: String = "", val activeDaysMax: String = "",
    val workoutTypesMin: String = "", val workoutTypesMax: String = "",
    val currentStreakMin: String = "",
    val longestStreakMin: String = "",
    val avgFoodMin: String = "", val avgFoodMax: String = "",
    val avgStepsMin: String = "", val avgStepsMax: String = "",
) {
    fun toParams(): Map<String, String> = buildMap {
        if (custom) {
            start?.let { put("startDate", it.toString()) }
            end?.let { put("endDate", it.toString()) }
        }
        putIf("workoutsMin", workoutsMin); putIf("workoutsMax", workoutsMax)
        putIf("totalDurationMin", totalDurationMin); putIf("totalDurationMax", totalDurationMax)
        putIf("avgDurationMin", avgDurationMin); putIf("avgDurationMax", avgDurationMax)
        putIf("avgSleepHoursMin", avgSleepMin); putIf("avgSleepHoursMax", avgSleepMax)
        putIf("activeDaysMin", activeDaysMin); putIf("activeDaysMax", activeDaysMax)
        putIf("workoutTypesMin", workoutTypesMin); putIf("workoutTypesMax", workoutTypesMax)
        putIf("currentStreakMin", currentStreakMin)
        putIf("longestStreakMin", longestStreakMin)
        putIf("avgFoodQualityMin", avgFoodMin); putIf("avgFoodQualityMax", avgFoodMax)
        putIf("avgStepsMin", avgStepsMin); putIf("avgStepsMax", avgStepsMax)
    }

    private fun MutableMap<String, String>.putIf(key: String, v: String) { if (v.isNotBlank()) put(key, v) }
}

@Composable
fun MemberMetricsDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val context = LocalContext.current
    val metrics by programContext.memberMetrics.collectAsStateWithLifecycle()
    val range by programContext.memberMetricsRange.collectAsStateWithLifecycle()
    val program by programContext.activeProgram.collectAsStateWithLifecycle()

    var search by remember { mutableStateOf("") }
    var committedSearch by remember { mutableStateOf("") }
    var sortField by remember { mutableStateOf(MetricSortField.ACTIVE_DAYS) }
    var sortDir by remember { mutableStateOf(SortDir.DESC) }
    var filters by remember { mutableStateOf(MetricsFilters()) }
    var showSort by remember { mutableStateOf(false) }
    var showFilter by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(committedSearch, sortField, sortDir, filters, program?.id) {
        loading = true
        programContext.loadMemberMetrics(
            search = committedSearch,
            sort = sortField.api,
            direction = sortDir.api,
            filterParams = filters.toParams(),
        )
        loading = false
    }

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
                        Icon(Icons.Filled.Close, contentDescription = "Clear", modifier = Modifier.size(20.dp).clickable { search = ""; committedSearch = "" })
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

            when {
                loading && metrics.isEmpty() -> repeat(3) { SkeletonCard() }
                metrics.isEmpty() -> {
                    Text("No members to display.", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                    Text("Adjust filters or try a different search.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                }
                else -> metrics.forEach { MemberMetricsCard(it, sortField) }
            }
        }
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

@Composable
fun ControlButton(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier, onClick: () -> Unit) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.15f), RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = AppOrange, maxLines = 1)
        Icon(icon, contentDescription = null, tint = AppOrange, modifier = Modifier.size(18.dp))
    }
}

@Composable
fun SkeletonCard(height: androidx.compose.ui.unit.Dp = 130.dp) {
    Box(modifier = Modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SortSheet(
    current: MetricSortField,
    direction: SortDir,
    onField: (MetricSortField) -> Unit,
    onDirection: (SortDir) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 16.dp)) {
            Text("Sort", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.CenterHorizontally))
            Spacer(Modifier.height(12.dp))
            Text("Sort by", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            MetricSortField.entries.forEach { f ->
                Row(
                    modifier = Modifier.fillMaxWidth().clickable { onField(f) }.padding(vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(f.label, style = MaterialTheme.typography.bodyLarge, color = if (f == current) AppOrange else MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
                    if (f == current) Icon(Icons.Filled.Check, contentDescription = null, tint = AppOrange, modifier = Modifier.size(18.dp))
                }
            }
            Spacer(Modifier.height(8.dp))
            Text("Direction", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            Spacer(Modifier.height(8.dp))
            Segmented(
                options = SortDir.entries.map { it.label },
                selectedIndex = SortDir.entries.indexOf(direction),
                onSelect = { onDirection(SortDir.entries[it]) },
            )
        }
    }
}

@Composable
fun Segmented(options: List<String>, selectedIndex: Int, onSelect: (Int) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        options.forEachIndexed { i, label ->
            val active = i == selectedIndex
            Box(
                modifier = Modifier.weight(1f).clip(RoundedCornerShape(8.dp))
                    .background(if (active) MaterialTheme.colorScheme.surfaceContainerHighest else Color.Transparent)
                    .clickable { onSelect(i) }.padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = if (active) FontWeight.Bold else FontWeight.Medium, color = if (active) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FilterSheet(
    initial: MetricsFilters,
    programStart: String?,
    onApply: (MetricsFilters) -> Unit,
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
                TextButton(onClick = { onApply(f) }) { Text("Done", color = AppOrange, fontWeight = FontWeight.Bold) }
            }

            Text("Date Range", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            Segmented(listOf("All", "Custom"), if (f.custom) 1 else 0) { f = f.copy(custom = it == 1) }
            if (f.custom) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Start", modifier = Modifier.weight(1f))
                    DatePillField(date = f.start ?: LocalDate.now(), onChange = { f = f.copy(start = it) }, allowFuture = false)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("End", modifier = Modifier.weight(1f))
                    DatePillField(date = f.end ?: LocalDate.now(), onChange = { f = f.copy(end = it) }, allowFuture = false)
                }
                Text("Metrics follow the selected date range.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }

            RangeRow("Workouts", f.workoutsMin, f.workoutsMax, { f = f.copy(workoutsMin = it) }, { f = f.copy(workoutsMax = it) })
            RangeRow("Total Duration (mins)", f.totalDurationMin, f.totalDurationMax, { f = f.copy(totalDurationMin = it) }, { f = f.copy(totalDurationMax = it) })
            RangeRow("Avg Duration (mins)", f.avgDurationMin, f.avgDurationMax, { f = f.copy(avgDurationMin = it) }, { f = f.copy(avgDurationMax = it) })
            RangeRow("Avg Sleep (hrs)", f.avgSleepMin, f.avgSleepMax, { f = f.copy(avgSleepMin = it) }, { f = f.copy(avgSleepMax = it) })
            RangeRow("Active Days", f.activeDaysMin, f.activeDaysMax, { f = f.copy(activeDaysMin = it) }, { f = f.copy(activeDaysMax = it) })
            RangeRow("Workout Types", f.workoutTypesMin, f.workoutTypesMax, { f = f.copy(workoutTypesMin = it) }, { f = f.copy(workoutTypesMax = it) })
            RangeRow("Current Streak", f.currentStreakMin, "", { f = f.copy(currentStreakMin = it) }, null)
            RangeRow("Longest Streak", f.longestStreakMin, "", { f = f.copy(longestStreakMin = it) }, null)
            RangeRow("Avg Diet Quality", f.avgFoodMin, f.avgFoodMax, { f = f.copy(avgFoodMin = it) }, { f = f.copy(avgFoodMax = it) })
            RangeRow("Avg Steps", f.avgStepsMin, f.avgStepsMax, { f = f.copy(avgStepsMin = it) }, { f = f.copy(avgStepsMax = it) })
        }
    }
}

@Composable
private fun RangeRow(label: String, minV: String, maxV: String, onMin: (String) -> Unit, onMax: ((String) -> Unit)?) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AppTextField(
                label = "Min", value = minV,
                onValueChange = { onMin(it.filter { c -> c.isDigit() }) },
                keyboardType = androidx.compose.ui.text.input.KeyboardType.Number,
                modifier = Modifier.weight(1f),
            )
            if (onMax != null) {
                AppTextField(
                    label = "Max", value = maxV,
                    onValueChange = { onMax(it.filter { c -> c.isDigit() }) },
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Number,
                    modifier = Modifier.weight(1f),
                )
            } else {
                Spacer(Modifier.weight(1f))
            }
        }
    }
}

// ---- CSV export ----

private fun metricsCsv(rows: List<com.app.rasifiters.net.MemberMetricsDTO>): String {
    val sb = StringBuilder("Name,Workouts,Total Duration,Avg Duration,Avg Sleep,Avg Diet Quality,Avg Steps,Active Days,Workout Types,Current Streak,Longest Streak\n")
    rows.forEach { m ->
        sb.append(csvField(m.memberName)).append(',')
            .append(m.workouts).append(',')
            .append(m.totalDuration).append(',')
            .append(m.avgDuration).append(',')
            .append(m.avgSleepHours?.let { String.format(Locale.US, "%.1f", it) } ?: "").append(',')
            .append(m.avgFoodQuality ?: "").append(',')
            .append(m.avgSteps ?: "").append(',')
            .append(m.activeDays).append(',')
            .append(m.workoutTypes).append(',')
            .append(m.currentStreak).append(',')
            .append(m.longestStreak).append('\n')
    }
    return sb.toString()
}

private fun metricsCsvName(program: String?, range: Pair<String?, String?>): String {
    val p = (program ?: "program").replace(Regex("[^A-Za-z0-9]+"), "_")
    val start = range.first ?: "start"
    val end = range.second ?: "end"
    return "MemberPerformanceMetrics_${p}_${start}_to_$end.csv"
}
