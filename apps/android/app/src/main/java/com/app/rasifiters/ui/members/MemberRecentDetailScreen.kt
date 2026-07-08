package com.app.rasifiters.ui.members

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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppBlue
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppRed
import com.app.rasifiters.net.MemberRecentItem
import com.app.rasifiters.ui.auth.AppTextField
import com.app.rasifiters.ui.auth.PillButton
import com.app.rasifiters.ui.summary.DatePillField
import com.app.rasifiters.ui.summary.FormFieldLabel
import com.app.rasifiters.ui.summary.PickerOption
import com.app.rasifiters.ui.summary.SearchablePickerField
import kotlinx.coroutines.launch
import java.time.LocalDate

/**
 * Per-member Workout history (iOS `MemberRecentDetail`) — a sorted/filterable list + per-row Edit
 * (duration only, F6) / Delete + CSV export. `admin_only_data_entry` LIVE: Edit/Delete are hidden when
 * `dataEntryLocked` (non-admins under the lock; admins are exempt). Server-driven fetch on control change.
 */
enum class WorkoutSortField(val api: String, val label: String) {
    DATE("date", "Date"), DURATION("duration", "Duration"), WORKOUT_TYPE("workoutType", "Workout Type"),
}

data class WorkoutFilters(
    val custom: Boolean = false,
    val start: LocalDate? = null,
    val end: LocalDate? = null,
    val workoutType: String? = null,
    val minDuration: String = "",
    val maxDuration: String = "",
) {
    val isActive: Boolean get() = custom || workoutType != null || minDuration.isNotBlank() || maxDuration.isNotBlank()
}

@Composable
fun MemberRecentDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val items by programContext.memberRecent.collectAsStateWithLifecycle()
    val memberId by programContext.focusedMemberId.collectAsStateWithLifecycle()
    val memberName by programContext.focusedMemberName.collectAsStateWithLifecycle()
    val locked = programContext.dataEntryLocked

    var sortField by remember { mutableStateOf(WorkoutSortField.DATE) }
    var sortDir by remember { mutableStateOf(SortDir.DESC) }
    var filters by remember { mutableStateOf(WorkoutFilters()) }
    var showSort by remember { mutableStateOf(false) }
    var showFilter by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    var editItem by remember { mutableStateOf<MemberRecentItem?>(null) }
    var deleteItem by remember { mutableStateOf<MemberRecentItem?>(null) }

    suspend fun reload() {
        val id = memberId ?: return
        loading = true
        programContext.loadMemberRecent(
            memberId = id, limit = 0,
            startDate = if (filters.custom) filters.start?.toString() else null,
            endDate = if (filters.custom) filters.end?.toString() else null,
            sortBy = sortField.api, sortDir = sortDir.api,
            workoutType = filters.workoutType,
            minDuration = filters.minDuration.toIntOrNull(),
            maxDuration = filters.maxDuration.toIntOrNull(),
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
                onBack = onBack, title = "View Workouts",
                exportEnabled = items.isNotEmpty(),
                onExport = { shareCsv(context, "Workouts_${sanitize(memberName)}.csv", workoutsCsv(items)) },
            )

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ControlButton("Sort: ${sortField.label}", Icons.Filled.UnfoldMore, Modifier.weight(1f)) { showSort = true }
                ControlButton(if (filters.isActive) "Filter •" else "Filter", Icons.Filled.FilterList, Modifier.weight(1f)) { showFilter = true }
            }

            when {
                loading && items.isEmpty() -> repeat(5) { SkeletonCard(height = 60.dp) }
                items.isEmpty() -> {
                    Text("No workouts found.", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                    Text("Adjust filters or log a workout to get started.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                }
                else -> items.forEach { w ->
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
            onDismiss = { editItem = null },
            onSave = { minutes ->
                scope.launch {
                    val other = memberId != null && memberId != programContext.loggedInMemberId
                    programContext.updateWorkoutLog(
                        memberName = if (other) memberName else null,
                        workoutName = item.workoutType, date = item.workoutDate, durationMinutes = minutes,
                    ).onSuccess { editItem = null; reload() }
                }
            },
        )
    }

    deleteItem?.let { item ->
        AlertDialog(
            onDismissRequest = { deleteItem = null },
            title = { Text("Delete workout") },
            text = { Text("Are you sure you want to delete this ${item.workoutType} workout from ${item.workoutDate}?") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        programContext.deleteWorkoutLog(memberId, null, item.workoutType, item.workoutDate).onSuccess { deleteItem = null; reload() }
                    }
                }) { Text("Delete", color = AppRed) }
            },
            dismissButton = { TextButton(onClick = { deleteItem = null }) { Text("Cancel") } },
        )
    }
}

/** A log row with an optional trailing ⋮ menu (Edit / Delete) — the Android analogue of iOS swipe actions. */
@Composable
fun LogRow(
    dotColor: androidx.compose.ui.graphics.Color,
    title: String,
    subtitle: String,
    trailing: String,
    locked: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(dotColor))
        Spacer(Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }
        Text(trailing, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
        if (!locked) {
            Box {
                Icon(
                    Icons.Filled.MoreVert, contentDescription = "Actions",
                    tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
                    modifier = Modifier.padding(start = 6.dp).size(22.dp).clip(CircleShape).clickable { menuOpen = true },
                )
                com.app.rasifiters.ui.components.AppDropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    DropdownMenuItem(text = { Text("Edit") }, onClick = { menuOpen = false; onEdit() })
                    DropdownMenuItem(text = { Text("Delete", color = AppRed) }, onClick = { menuOpen = false; onDelete() })
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LogSortSheet(
    fields: List<String>,
    currentIndex: Int,
    direction: SortDir,
    onField: (Int) -> Unit,
    onDirection: (SortDir) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 16.dp)) {
            Text("Sort", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.CenterHorizontally))
            Spacer(Modifier.height(12.dp))
            Text("Sort by", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            fields.forEachIndexed { i, label ->
                Row(modifier = Modifier.fillMaxWidth().clickable { onField(i) }.padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(label, style = MaterialTheme.typography.bodyLarge, color = if (i == currentIndex) AppOrange else MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
                    if (i == currentIndex) Icon(Icons.Filled.Check, contentDescription = null, tint = AppOrange, modifier = Modifier.size(18.dp))
                }
            }
            Spacer(Modifier.height(8.dp))
            Text("Direction", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            Spacer(Modifier.height(8.dp))
            Segmented(SortDir.entries.map { it.label }, SortDir.entries.indexOf(direction)) { onDirection(SortDir.entries[it]) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WorkoutFilterSheet(
    programContext: ProgramContext,
    initial: WorkoutFilters,
    onApply: (WorkoutFilters) -> Unit,
    onClear: () -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var f by remember { mutableStateOf(initial) }
    var typeOptions by remember { mutableStateOf(listOf(PickerOption("", "Any"))) }
    LaunchedEffect(Unit) {
        programContext.loadProgramWorkouts().onSuccess { list ->
            typeOptions = listOf(PickerOption("", "Any")) + list.map { PickerOption(it.workoutName, it.workoutName) }
        }
    }
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
            }
            FormFieldLabel("Workout Type")
            SearchablePickerField(
                placeholder = "Any", sheetTitle = "Workout type",
                selectedValue = f.workoutType ?: "",
                options = typeOptions,
                onSelect = { f = f.copy(workoutType = it.ifBlank { null }) },
            )
            FormFieldLabel("Duration (mins)")
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppTextField(label = "Min", value = f.minDuration, onValueChange = { f = f.copy(minDuration = it.filter { c -> c.isDigit() }) }, keyboardType = KeyboardType.Number, modifier = Modifier.weight(1f))
                AppTextField(label = "Max", value = f.maxDuration, onValueChange = { f = f.copy(maxDuration = it.filter { c -> c.isDigit() }) }, keyboardType = KeyboardType.Number, modifier = Modifier.weight(1f))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WorkoutEditSheet(item: MemberRecentItem, onDismiss: () -> Unit, onSave: (Int) -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var hours by remember { mutableStateOf((item.durationMinutes / 60).toString()) }
    var minutes by remember { mutableStateOf((item.durationMinutes % 60).toString()) }
    val total = (hours.toIntOrNull() ?: 0) * 60 + (minutes.toIntOrNull() ?: 0)
    val valid = total > 0
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("Edit workout", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text("${item.workoutType} · ${item.workoutDate}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            FormFieldLabel("Duration")
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppTextField(label = "Hours", value = hours, onValueChange = { hours = it.filter { c -> c.isDigit() }.take(2) }, keyboardType = KeyboardType.Number, modifier = Modifier.weight(1f))
                AppTextField(label = "Minutes", value = minutes, onValueChange = { minutes = it.filter { c -> c.isDigit() }.take(2) }, keyboardType = KeyboardType.Number, modifier = Modifier.weight(1f))
            }
            if (!valid) Text("Enter a duration greater than 0.", style = MaterialTheme.typography.bodySmall, color = AppRed, fontWeight = FontWeight.SemiBold)
            Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                PillButton(label = "Save changes", onClick = { if (valid) onSave(total) }, enabled = valid)
            }
        }
    }
}

// ---- CSV ----

private fun workoutsCsv(items: List<MemberRecentItem>): String {
    val sb = StringBuilder("Workout Type,Date,Duration (min)\n")
    items.forEach { sb.append(csvField(it.workoutType)).append(',').append(it.workoutDate).append(',').append(it.durationMinutes).append('\n') }
    return sb.toString()
}

internal fun sanitize(name: String?): String = (name ?: "member").replace(Regex("[^A-Za-z0-9]+"), "_")
