package com.app.rasifiters.ui.programs

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.net.ProgramDTO
import com.app.rasifiters.ui.auth.AppTextField
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The post-auth landing — "My Programs" (the Android analog of iOS `ProgramPickerView` / web `/programs`).
 * Lists the member's programs as cards; opens a program (→ the shell), accepts/declines invites inline,
 * deletes managed programs (Android-idiom overflow menu vs the iOS swipe), reaches the account sheet, and
 * carries the net-new drag-to-reorder + floating search (iOS D-N1). Faithful 1:1 to the iOS SPEC plus its
 * one web-parity addition — a visible error banner (D-C1). Forward-nav (create/edit, account destinations)
 * is DEFERRED per the iOS D-SCOPE and stubbed until later phases.
 *
 * Android-idiom deviations (recorded in specs/pages/android/program-picker/SPEC.md):
 *  • Edit/Delete via a per-card overflow (⋮) menu, not iOS swipe actions — long-press is the reorder gesture.
 *  • Reorder = long-press-drag over the LazyColumn (Material idiom for SwiftUI `.onMove`); disabled while searching.
 */
@Composable
fun ProgramPickerScreen(
    programContext: ProgramContext,
    onOpenProgram: (ProgramDTO) -> Unit,
) {
    val programs by programContext.programs.collectAsStateWithLifecycle()
    val loading by programContext.programsLoading.collectAsStateWithLifecycle()
    val isGlobalAdmin = programContext.isGlobalAdmin
    val scope = rememberCoroutineScope()

    var query by remember { mutableStateOf("") }
    var searchOpen by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showAccount by remember { mutableStateOf(false) }
    var showSignOut by remember { mutableStateOf(false) }
    var deleteTarget by remember { mutableStateOf<ProgramDTO?>(null) }

    LaunchedEffect(Unit) {
        programContext.loadPrograms().onFailure { errorMessage = it.message ?: "Couldn't load programs." }
    }

    val visiblePrograms = remember(programs, query) {
        val q = query.trim()
        if (q.isEmpty()) programs else programs.filter { it.name.contains(q, ignoreCase = true) }
    }
    val reorderEnabled = query.isBlank()
    val pendingInvites = programs.count { it.myStatus == "invited" || it.myStatus == "requested" }

    val listState = rememberLazyListState()
    val reorderState = remember(listState) { ReorderState(listState) { from, to -> programContext.moveProgram(from, to) } }
    var orderBeforeDrag by remember { mutableStateOf<List<ProgramDTO>>(emptyList()) }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(modifier = Modifier.fillMaxSize().statusBarsPadding()) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("My Programs", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                    Text(
                        "Manage your fitness programs",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    )
                }
                CircleButton(Icons.Filled.Person, "Account", onClick = { showAccount = true })
            }

            errorMessage?.let { ErrorBanner(it) { errorMessage = null } }

            if (searchOpen) {
                SearchPill(query = query, onQueryChange = { query = it })
            }

            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                when {
                    loading && programs.isEmpty() -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                    programs.isEmpty() -> EmptyState(
                        "No programs yet",
                        "Create a program to get started.",
                    )
                    visiblePrograms.isEmpty() -> EmptyState(
                        "No matches",
                        "No programs match your search.",
                    )
                    else -> LazyColumn(
                        state = listState,
                        modifier = Modifier
                            .fillMaxSize()
                            .pointerInput(reorderEnabled) {
                                if (!reorderEnabled) return@pointerInput
                                detectDragGesturesAfterLongPress(
                                    onDragStart = { offset ->
                                        orderBeforeDrag = programContext.programs.value
                                        reorderState.onDragStart(offset.y)
                                    },
                                    onDrag = { change, dragAmount ->
                                        change.consume()
                                        reorderState.onDrag(dragAmount.y)
                                    },
                                    onDragEnd = {
                                        reorderState.onDragEnd()
                                        val before = orderBeforeDrag
                                        val after = programContext.programs.value
                                        if (before.map { it.id } != after.map { it.id }) {
                                            scope.launch {
                                                programContext.persistProgramOrder(before).onFailure {
                                                    errorMessage = "Couldn't save program order: ${it.message ?: "try again."}"
                                                }
                                            }
                                        }
                                    },
                                    onDragCancel = { reorderState.onDragEnd() },
                                )
                            },
                        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 120.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        itemsIndexed(visiblePrograms, key = { _, p -> p.id }) { index, program ->
                            val dragging = reorderState.draggingIndex == index
                            ProgramCard(
                                program = program,
                                isGlobalAdmin = isGlobalAdmin,
                                onOpen = { if (program.canOpen(isGlobalAdmin)) onOpenProgram(program) },
                                onDelete = { deleteTarget = program },
                                onRespond = { accept ->
                                    scope.launch {
                                        programContext.respondToInvite(program.id, accept)
                                            .onFailure { errorMessage = it.message ?: "Couldn't update invite." }
                                    }
                                },
                                modifier = if (dragging) {
                                    Modifier.zIndex(1f).graphicsLayer { translationY = reorderState.delta }
                                } else {
                                    Modifier.animateItem()
                                },
                            )
                        }
                    }
                }
            }
        }

        // Floating actions (search toggle stacked above the create "+")
        Column(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .navigationBarsPadding()
                .padding(20.dp),
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            CircleButton(
                icon = if (searchOpen) Icons.Filled.Close else Icons.Filled.Search,
                contentDescription = if (searchOpen) "Close search" else "Search programs",
                onClick = {
                    searchOpen = !searchOpen
                    if (!searchOpen) query = ""
                },
            )
            CircleButton(
                icon = Icons.Filled.Add,
                contentDescription = "Create program",
                badgeCount = pendingInvites,
                // DEFERRED (iOS D-SCOPE): the create-program / invites sheet lands in a later phase.
                onClick = { },
            )
        }
    }

    if (showAccount) {
        AccountMenuSheet(
            programContext = programContext,
            onDismiss = { showAccount = false },
            onSignOut = { showAccount = false; showSignOut = true },
        )
    }

    deleteTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text("Delete Program?") },
            text = { Text("\"${target.name}\" will be permanently deleted. This can't be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    deleteTarget = null
                    scope.launch {
                        programContext.deleteProgram(target.id)
                            .onFailure { errorMessage = it.message ?: "Couldn't delete program." }
                    }
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { deleteTarget = null }) { Text("Cancel") } },
        )
    }

    if (showSignOut) {
        AlertDialog(
            onDismissRequest = { showSignOut = false },
            title = { Text("Sign Out") },
            text = { Text("Are you sure you want to sign out?") },
            confirmButton = {
                TextButton(onClick = {
                    showSignOut = false
                    programContext.signOut()
                }) { Text("Sign Out", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showSignOut = false }) { Text("Cancel") } },
        )
    }
}

// ---- Role gating (client-side; the backend re-authorizes every call) ----

private fun ProgramDTO.canOpen(isGlobalAdmin: Boolean): Boolean =
    isGlobalAdmin || myStatus == "active"

private fun ProgramDTO.canManage(isGlobalAdmin: Boolean): Boolean =
    isGlobalAdmin || (myStatus == "active" && myRole == "admin")

// ---- Card ----

@Composable
private fun ProgramCard(
    program: ProgramDTO,
    isGlobalAdmin: Boolean,
    onOpen: () -> Unit,
    onDelete: () -> Unit,
    onRespond: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val accent = statusColor(program.status)
    val canManage = program.canManage(isGlobalAdmin)
    val canOpen = program.canOpen(isGlobalAdmin)
    var menuOpen by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable(enabled = canOpen, onClick = onOpen)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Text(
                program.name,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                modifier = Modifier.weight(1f).padding(end = 8.dp),
            )
            StatusPill(program.status)
            if (canManage) {
                Box {
                    IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(32.dp)) {
                        Icon(
                            Icons.Filled.MoreVert,
                            contentDescription = "Manage program",
                            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        )
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text("Delete", color = MaterialTheme.colorScheme.error) },
                            onClick = { menuOpen = false; onDelete() },
                        )
                    }
                }
            }
        }

        dateRange(program.startDate, program.endDate)?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }

        Text(
            membersOrInviteLine(program),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )

        LinearProgressIndicator(
            progress = { program.progressPercent.coerceIn(0, 100) / 100f },
            modifier = Modifier.fillMaxWidth().height(6.dp).clip(CircleShape),
            color = accent,
            trackColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f),
        )

        when (program.myStatus) {
            "invited" -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                InvitePill("Accept", accent, onClick = { onRespond(true) })
                InvitePill("Decline", MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), onClick = { onRespond(false) })
            }
            "requested" -> InvitePill(
                "Cancel Request",
                MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                onClick = { onRespond(false) },
            )
        }
    }
}

@Composable
private fun StatusPill(status: String?) {
    val color = statusColor(status)
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(color.copy(alpha = 0.18f))
            .padding(horizontal = 12.dp, vertical = 5.dp),
    ) {
        Text(
            (status ?: "—").uppercase(Locale.US),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = color,
        )
    }
}

@Composable
private fun InvitePill(label: String, color: Color, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(color.copy(alpha = 0.16f))
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 8.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = color)
    }
}

@Composable
private fun statusColor(status: String?): Color = when (status?.lowercase(Locale.US)) {
    "completed" -> AppGreen
    "active" -> AppOrange
    else -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.45f)
}

// ---- Chrome ----

@Composable
private fun CircleButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    badgeCount: Int = 0,
) {
    Box {
        Surface(
            onClick = onClick,
            shape = CircleShape,
            color = MaterialTheme.colorScheme.onBackground,
            contentColor = MaterialTheme.colorScheme.background,
            shadowElevation = 6.dp,
            modifier = Modifier.size(56.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = contentDescription, modifier = Modifier.size(24.dp))
            }
        }
        if (badgeCount > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(22.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.error),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    badgeCount.coerceAtMost(99).toString(),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
            }
        }
    }
}

@Composable
private fun SearchPill(query: String, onQueryChange: (String) -> Unit) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 8.dp)) {
        AppTextField(
            label = "Search programs",
            value = query,
            onValueChange = onQueryChange,
            modifier = Modifier.weight(1f).focusRequester(focus),
        )
    }
}

@Composable
private fun ErrorBanner(message: String, onDismiss: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .padding(bottom = 8.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.error.copy(alpha = 0.14f))
            .clickable(onClick = onDismiss)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(8.dp))
        Icon(Icons.Filled.Close, contentDescription = "Dismiss", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun EmptyState(title: String, subtitle: String) {
    Column(
        modifier = Modifier.fillMaxSize().padding(40.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        Text(
            subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            textAlign = TextAlign.Center,
        )
    }
}

// ---- Formatting ----

private val DATE_OUT = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US)

private fun formatDate(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    return try {
        LocalDate.parse(raw.take(10)).format(DATE_OUT)
    } catch (_: Exception) {
        null
    }
}

private fun dateRange(start: String?, end: String?): String? {
    val s = formatDate(start)
    val e = formatDate(end)
    return when {
        s != null && e != null -> "$s – $e"
        s != null -> s
        e != null -> e
        else -> null
    }
}

private fun membersOrInviteLine(program: ProgramDTO): String = when (program.myStatus) {
    "invited" -> "Invitation pending"
    "requested" -> "Request pending approval"
    else -> "${program.activeMembers} active / ${program.totalMembers} total members"
}

// ---- Drag-to-reorder (iOS `.onMove` analog; disabled while searching) ----

/**
 * Tracks the long-press-drag reorder over the picker's LazyColumn. On each crossing it swaps the source
 * list (via [onMove], which mutates `ProgramContext.programs` optimistically) and re-anchors the dragged
 * item under the finger by folding the offset delta — the standard Compose reorderable pattern.
 */
private class ReorderState(
    private val listState: LazyListState,
    private val onMove: (Int, Int) -> Unit,
) {
    var draggingIndex by mutableStateOf<Int?>(null)
        private set
    var delta by mutableFloatStateOf(0f)
        private set

    private fun itemInfo(index: Int) =
        listState.layoutInfo.visibleItemsInfo.firstOrNull { it.index == index }

    fun onDragStart(offsetY: Float) {
        listState.layoutInfo.visibleItemsInfo
            .firstOrNull { offsetY.toInt() in it.offset..(it.offset + it.size) }
            ?.let {
                draggingIndex = it.index
                delta = 0f
            }
    }

    fun onDrag(dragAmountY: Float) {
        delta += dragAmountY
        val current = draggingIndex ?: return
        val currentInfo = itemInfo(current) ?: return
        val draggedCenter = currentInfo.offset + currentInfo.size / 2 + delta
        val target = listState.layoutInfo.visibleItemsInfo.firstOrNull { candidate ->
            candidate.index != current &&
                draggedCenter.toInt() in candidate.offset..(candidate.offset + candidate.size)
        } ?: return
        onMove(current, target.index)
        delta += currentInfo.offset - target.offset
        draggingIndex = target.index
    }

    fun onDragEnd() {
        draggingIndex = null
        delta = 0f
    }
}
