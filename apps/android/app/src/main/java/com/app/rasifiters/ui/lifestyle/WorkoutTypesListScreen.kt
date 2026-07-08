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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppPurple
import com.app.rasifiters.core.theme.AppRed
import com.app.rasifiters.net.ProgramWorkoutDTO
import com.app.rasifiters.ui.components.AppDropdownMenu
import com.app.rasifiters.ui.summary.CircleBackButton
import com.app.rasifiters.ui.summary.FormErrorText
import kotlinx.coroutines.launch

/**
 * The Workout Types manager (iOS `ViewWorkoutTypesListView`) — reached from the Lifestyle-tab glass button
 * (and, in Phase G, the Program tab). Lists the program's workout catalog in Available / Hidden sections.
 * Admins (`canEditProgramData`) can add customs (+), rename/delete customs, and hide/show any type; global
 * (library) types can only be hidden/shown. Non-admins get a read-only list. Android-idiom deviation: a
 * per-row ⋮ overflow menu replaces iOS swipe actions (matches the Members-tab manager, Phase E).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkoutTypesListScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val canManage = programContext.canEditProgramData
    val all by programContext.programWorkoutsAll.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    var query by remember { mutableStateOf("") }
    var showAdd by remember { mutableStateOf(false) }
    var editTarget by remember { mutableStateOf<ProgramWorkoutDTO?>(null) }
    var deleteTarget by remember { mutableStateOf<ProgramWorkoutDTO?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    androidx.compose.runtime.LaunchedEffect(Unit) { programContext.loadAllProgramWorkouts() }

    val filtered = if (query.isBlank()) all
    else all.filter { it.workoutName.contains(query.trim(), ignoreCase = true) }
    val visible = filtered.filterNot { it.isHidden }
    val hidden = filtered.filter { it.isHidden }

    fun perform(block: suspend () -> Result<Unit>) {
        error = null
        scope.launch { block().onFailure { error = it.message ?: "Something went wrong." } }
    }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp).padding(top = 16.dp)) {
            // Header: back · centered title · add (admins).
            Box(modifier = Modifier.fillMaxWidth().height(44.dp)) {
                CircleBackButton(onBack)
                Text(
                    "Workout Types",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.align(Alignment.Center),
                )
                if (canManage) {
                    IconButton(onClick = { error = null; showAdd = true }, modifier = Modifier.align(Alignment.CenterEnd)) {
                        Icon(Icons.Filled.Add, contentDescription = "Add custom workout")
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            TextField(
                value = query,
                onValueChange = { query = it },
                singleLine = true,
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                placeholder = { Text("Search workout types") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
            )

            error?.let {
                Spacer(Modifier.height(10.dp))
                FormErrorText(it)
            }

            Spacer(Modifier.height(8.dp))
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                if (visible.isNotEmpty()) {
                    item(key = "avail-header") { SectionHeader("Available (${visible.size})") }
                    items(visible, key = { "v-${it.id}" }) { w ->
                        WorkoutRow(w, canManage, onEdit = { editTarget = w }, onDelete = { deleteTarget = w },
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
                        WorkoutRow(w, canManage, onEdit = { editTarget = w }, onDelete = { deleteTarget = w },
                            onToggle = { perform { toggle(programContext, w) } })
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }

    if (showAdd) {
        WorkoutNameSheet(
            title = "New Workout",
            initial = "",
            confirmLabel = "Add",
            onConfirm = { name -> perform { programContext.addCustomProgramWorkout(name).onSuccess { showAdd = false } } },
            onDismiss = { showAdd = false },
        )
    }
    editTarget?.let { w ->
        WorkoutNameSheet(
            title = "Edit Workout",
            initial = w.workoutName,
            confirmLabel = "Save",
            onConfirm = { name ->
                val id = w.id
                if (id != null) perform { programContext.editCustomProgramWorkout(id, name).onSuccess { editTarget = null } }
            },
            onDismiss = { editTarget = null },
        )
    }
    deleteTarget?.let { w ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text("Delete Custom Workout?") },
            text = { Text("This will delete \"${w.workoutName}\" from this program.") },
            confirmButton = {
                TextButton(onClick = {
                    val id = w.id
                    deleteTarget = null
                    if (id != null) perform { programContext.deleteCustomProgramWorkout(id) }
                }) { Text("Delete", color = AppRed) }
            },
            dismissButton = { TextButton(onClick = { deleteTarget = null }) { Text("Cancel") } },
        )
    }
}

/** Hide/show the right way for the type's source (global → library toggle; custom → custom toggle). */
private suspend fun toggle(programContext: ProgramContext, w: ProgramWorkoutDTO): Result<Unit> = when {
    w.isGlobal -> w.libraryWorkoutId?.let { programContext.toggleWorkoutVisibility(it) } ?: Result.success(Unit)
    w.id != null -> programContext.toggleCustomWorkoutVisibility(w.id)
    else -> Result.success(Unit)
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        modifier = Modifier.padding(vertical = 6.dp),
    )
}

@Composable
private fun WorkoutRow(
    w: ProgramWorkoutDTO,
    canManage: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onToggle: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val accent = if (w.isCustom) AppGreen else AppPurple
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp).alpha(if (w.isHidden) 0.5f else 1f),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(40.dp).clip(CircleShape).background(accent.copy(alpha = 0.18f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (w.isCustom) Icons.Filled.Star else Icons.Filled.FitnessCenter,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(18.dp),
            )
        }
        Spacer(Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(w.workoutName, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (w.isCustom) "Custom" else "Standard",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
                if (w.isHidden) {
                    Text(" • Hidden", style = MaterialTheme.typography.bodySmall, color = AppOrange)
                }
            }
        }
        if (canManage) {
            Box {
                IconButton(onClick = { menuOpen = true }) {
                    Icon(Icons.Filled.MoreVert, contentDescription = "Actions", tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                }
                AppDropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    if (w.isCustom && !w.isHidden) {
                        DropdownMenuItem(text = { Text("Edit") }, onClick = { menuOpen = false; onEdit() })
                    }
                    DropdownMenuItem(
                        text = { Text(if (w.isHidden) "Show" else "Hide") },
                        onClick = { menuOpen = false; onToggle() },
                    )
                    if (w.isCustom) {
                        DropdownMenuItem(text = { Text("Delete", color = AppRed) }, onClick = { menuOpen = false; onDelete() })
                    }
                }
            }
        }
    }
}

/** The add / edit custom-workout bottom sheet — one text field + a confirm action. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WorkoutNameSheet(
    title: String,
    initial: String,
    confirmLabel: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var name by remember { mutableStateOf(initial) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            TextField(
                value = name,
                onValueChange = { name = it },
                singleLine = true,
                placeholder = { Text("Workout name") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.align(Alignment.End)) {
                TextButton(onClick = onDismiss) { Text("Cancel") }
                TextButton(
                    onClick = { onConfirm(name.trim()) },
                    enabled = name.trim().isNotEmpty(),
                ) { Text(confirmLabel, fontWeight = FontWeight.Bold, color = AppOrange) }
            }
        }
    }
}
