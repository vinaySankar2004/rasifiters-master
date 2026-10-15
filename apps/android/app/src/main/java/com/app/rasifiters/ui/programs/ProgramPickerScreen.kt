package com.app.rasifiters.ui.programs

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.VersionGate
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.net.ProgramDTO
import com.app.rasifiters.ui.Routes
import com.app.rasifiters.ui.auth.AppTextField
import com.app.rasifiters.ui.components.kit.ErrorView
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import com.app.rasifiters.ui.people.ActivityVisibilityNoticeHost
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The post-auth landing — "My Programs" (the Android analog of iOS `ProgramPickerView` / web `/programs`).
 * Lists the member's programs as cards; opens a program (→ the shell), deletes managed programs (Android-idiom
 * overflow menu vs the iOS swipe), reaches the account sheet, and carries the net-new drag-to-reorder + floating
 * search (iOS D-N1). Invites come from the ONE inbox (`/my-invites`, invites §3.1) in the [ProgramActionsSheet]
 * (Inbox / Create; the "+" badge = the server inbox badge) — cards no longer accept inline; a "requested" card keeps
 * Cancel Request. The account sheet reaches the settings screens via [onNavigate].
 *
 * Kit (frontend-kit §5–6): the cached list shows first, then refreshes; programs + invites load in parallel; a
 * failed first load → ErrorView; offline / stale / update-available → ONE floating banner above the FABs; pull to
 * refresh.
 *
 * Android-idiom deviations (recorded in specs/pages/android/program-picker/SPEC.md):
 *  • Edit/Delete via a per-card overflow (⋮) menu, not iOS swipe actions — long-press is the reorder gesture.
 *  • Reorder = long-press-drag over the LazyColumn (Material idiom for SwiftUI `.onMove`); disabled while searching.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProgramPickerScreen(
    programContext: ProgramContext,
    onOpenProgram: (ProgramDTO) -> Unit,
    onNavigate: (String) -> Unit,
    versionGate: VersionGate,
) {
    val programs by programContext.programs.collectAsStateWithLifecycle()
    val loadState by programContext.programsState.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val updateAvailable by versionGate.updateAvailable.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val invitesState by programContext.invites.collectAsStateWithLifecycle()
    val invitesSheetRequest by programContext.inbox.invitesSheetRequest.collectAsStateWithLifecycle()
    val inboxCounts by programContext.inbox.counts.collectAsStateWithLifecycle()
    val workoutSync by programContext.health.workoutEnabled.collectAsStateWithLifecycle()
    val isGlobalAdmin = programContext.isGlobalAdmin
    val scope = rememberCoroutineScope()

    var query by remember { mutableStateOf("") }
    var searchOpen by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showAccount by remember { mutableStateOf(false) }
    var showActions by remember { mutableStateOf(false) }
    var actionsOnInbox by remember { mutableStateOf(false) }
    var showSignOut by remember { mutableStateOf(false) }
    var deleteTarget by remember { mutableStateOf<ProgramDTO?>(null) }
    var pulling by remember { mutableStateOf(false) }

    // Programs + the invite inbox load in parallel (board §6.5).
    suspend fun reloadAll() = coroutineScope {
        launch { programContext.loadPrograms() }
        launch { programContext.loadInvites() }
        launch { programContext.inbox.refreshCounts() }
    }
    LaunchedEffect(Unit) { reloadAll() }
    // D-KIT-13: back online → a failed / stale list reloads by itself; polish #2: so does a failed / stale invite inbox.
    LaunchedEffect(Unit) {
        programContext.isOnline.drop(1).filter { it }.collect {
            val programsSt = programContext.programsState.value
            val invitesSt = programContext.invites.value
            coroutineScope {
                if (programsSt is UiState.Failed || programsSt is UiState.Stale) launch { programContext.loadPrograms() }
                if (invitesSt is UiState.Failed || invitesSt is UiState.Stale) launch { programContext.loadInvites() }
            }
        }
    }
    // An `invites` push / toast target opens the actions sheet on its Inbox tab, then refreshes.
    LaunchedEffect(invitesSheetRequest) {
        if (!invitesSheetRequest) return@LaunchedEffect
        programContext.inbox.consumeInvitesSheetRequest()
        actionsOnInbox = true; showActions = true
        reloadAll()
    }

    val visiblePrograms = remember(programs, query) {
        val q = query.trim()
        if (q.isEmpty()) programs else programs.filter { it.name.contains(q, ignoreCase = true) }
    }
    val reorderEnabled = query.isBlank()
    // The server badge (unread except invite items + pending invites — each invite once); join requests no longer count
    // (polish #40 badge half). Until the first count arrives: the member's own invites (0 for global admins).
    val inboxBadge = inboxCounts?.badge ?: if (isGlobalAdmin) 0 else invitesState.dataOrNull?.size ?: 0

    // One floating banner slot (A6/A7): offline (the global monitor) › stale › update available.
    val banner: FloatingBannerVariant? = when {
        !online -> FloatingBannerVariant.Offline
        loadState is UiState.Stale -> FloatingBannerVariant.Stale
        updateAvailable -> FloatingBannerVariant.UpdateAvailable
        else -> null
    }

    val navBarBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

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

            PullToRefreshBox(
                isRefreshing = pulling,
                onRefresh = { pulling = true; scope.launch { reloadAll(); pulling = false } },
                modifier = Modifier.weight(1f).fillMaxWidth(),
            ) {
                val current = loadState
                when {
                    // polish-1 rule 6: nothing to show while offline → the kit's offline view + Retry, never a spinner.
                    programs.isEmpty() && current.dataOrNull == null && !online ->
                        ErrorView(AppError(AppErrorKind.OFFLINE), Modifier.align(Alignment.Center), onRetry = { scope.launch { reloadAll() } })
                    programs.isEmpty() && current is UiState.Failed ->
                        ErrorView(current.error, Modifier.align(Alignment.Center), onRetry = { scope.launch { reloadAll() } })
                    programs.isEmpty() && (current is UiState.Loading || current is UiState.Idle) ->
                        CircularProgressIndicator(Modifier.align(Alignment.Center))
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
                                                    errorMessage = "Couldn't save program order. ${it.toAppError().message}"
                                                }
                                            }
                                        }
                                    },
                                    onDragCancel = { reorderState.onDragEnd() },
                                )
                            },
                        // The floating banner sits above the FABs; the last card must still scroll clear of it (A6):
                        // 146 inset + 12 + 52 + 12 banner block + a 16 gap, above the system nav bar.
                        contentPadding = PaddingValues(
                            start = 20.dp, end = 20.dp, top = 4.dp,
                            bottom = if (banner != null) BANNER_LIST_CLEARANCE + navBarBottom else 120.dp,
                        ),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        itemsIndexed(visiblePrograms, key = { _, p -> p.id }) { index, program ->
                            val dragging = reorderState.draggingIndex == index
                            ProgramCard(
                                program = program,
                                isGlobalAdmin = isGlobalAdmin,
                                onOpen = { if (program.canOpen(isGlobalAdmin)) onOpenProgram(program) },
                                onDelete = { deleteTarget = program },
                                onEdit = {
                                    // Polish #40: Edit from the card (iOS `programToEdit`) — select the program, then edit it.
                                    programContext.selectProgram(program)
                                    onNavigate(Routes.PROGRAM_EDIT)
                                },
                                onCancelRequest = {
                                    scope.launch {
                                        programContext.cancelJoinRequest(program.id).onFailure { errorMessage = it.toAppError().message }
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
                // Polish #36: the spoken label carries the badge ("Program actions, 3 new").
                contentDescription = if (inboxBadge > 0) "Program actions, ${if (inboxBadge > 99) "99+" else inboxBadge} new" else "Program actions",
                badgeCount = inboxBadge,
                onClick = { showActions = true },
            )
        }

        banner?.let { v ->
            FloatingBanner(
                v, Modifier.align(Alignment.BottomCenter).navigationBarsPadding(), bottomInset = 146.dp,
                onRetry = if (v == FloatingBannerVariant.Stale) ({ scope.launch { reloadAll() } }) else null,
                onUpdate = if (v == FloatingBannerVariant.UpdateAvailable) ({ versionGate.openStore(context) }) else null,
                onDismiss = if (v == FloatingBannerVariant.UpdateAvailable) ({ versionGate.dismissUpdate() }) else null,
            )
        }
    }

    if (showActions) {
        ProgramActionsSheet(
            programContext = programContext,
            onDismiss = { showActions = false; actionsOnInbox = false },
            openOnInbox = actionsOnInbox,
        )
    }

    if (showAccount) {
        AccountMenuSheet(
            programContext = programContext,
            onDismiss = { showAccount = false },
            onNavigate = { route -> showAccount = false; onNavigate(route) },
            onSignOut = { showAccount = false; showSignOut = true },
        )
    }

    // People: members already syncing Health Connect workouts see the activity notice once after the update.
    ActivityVisibilityNoticeHost(programContext, enabled = workoutSync)

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
                            .onFailure { errorMessage = it.toAppError().message }
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

/** List bottom padding while the floating banner shows: 146 (FAB inset) + 12 + 52 + 12 (banner) + 16 gap. */
private val BANNER_LIST_CLEARANCE = 238.dp

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
    onEdit: () -> Unit,
    onCancelRequest: () -> Unit,
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
                    // Polish #36: a 48dp IconButton target inside the old 32dp footprint, so the card header and the ⋮ stay put.
                    IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(32.dp).requiredSize(48.dp)) {
                        Icon(
                            Icons.Filled.MoreVert,
                            contentDescription = "Manage program",
                            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        )
                    }
                    com.app.rasifiters.ui.components.AppDropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(text = { Text("Edit") }, onClick = { menuOpen = false; onEdit() })
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

        // An "invited" card is answered in the inbox (invites §3.1, A10); a "requested" card keeps Cancel Request.
        if (program.myStatus == "requested") {
            InvitePill("Cancel Request", MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), onClick = onCancelRequest)
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
                    .height(22.dp)
                    .widthIn(min = 22.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.error)
                    .padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (badgeCount > 99) "99+" else badgeCount.toString(),
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
    // D3 (programs SPEC §9): one number — the backend counts active and total members the same way (F2).
    else -> if (program.totalMembers == 1) "1 member" else "${program.totalMembers} members"
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
