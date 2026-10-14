package com.app.rasifiters.ui.inbox

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxState
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.InboxTarget
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppRed
import com.app.rasifiters.net.InboxItemDTO
import com.app.rasifiters.net.PendingInviteDTO
import com.app.rasifiters.ui.components.kit.ErrorView
import com.app.rasifiters.ui.programs.DeclineInviteDialog
import com.app.rasifiters.ui.programs.InviteCard
import com.app.rasifiters.ui.summary.FormErrorText
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlin.math.abs

// Remove one + Clear all (notifications §3.9 rule 11) — the shared copy (identical on web / iOS).
private const val REMOVE_LABEL = "Remove"
private const val CLEAR_ALL = "Clear all"
private const val CLEAR_CONFIRM_TITLE = "Clear all notifications?"
private const val CLEAR_CONFIRM_BODY = "They're removed from your Inbox on all your devices. Invitations stay until you answer them."
private const val REMOVE_FAILED = "Couldn't remove the notification."
private const val CLEAR_FAILED = "Couldn't clear your notifications."

/** The inbox's ONE reload — open, pull, Retry, reconnect: invites + the newest page, then everything read. */
internal suspend fun reloadInbox(programContext: ProgramContext) = coroutineScope {
    launch { programContext.loadInvites() }
    launch { programContext.inbox.loadAndMarkRead() }
}

/**
 * The inbox list — shared by the "+" sheet's Inbox tab and the Inbox screen. Pending invites first with their actions
 * (the ONE invite inbox, invites §3.1: `/my-invites`; global admins `/all-invites` + Revoke — A10) and the member's own
 * join requests (Cancel Request); then the notifications, newest first, 30 a page ("Load more"). While on screen it is
 * the inbox visit (the reading rule): the newest page marks everything read, an arrival is read at once, and what was
 * new keeps its dot until the visit ends. A row whose target leads somewhere (a program, the picker, logging a workout)
 * is tappable. Kit: nothing yet → spinner; the notifications failed with no invitation showing → ONE ErrorView + Retry
 * (the offline copy while offline — QA4); otherwise a failed section shows its own ErrorView.
 */
@Composable
fun InboxList(
    programContext: ProgramContext,
    onOpenItem: (InboxItemDTO) -> Unit,
    onAccepted: () -> Unit,
    modifier: Modifier = Modifier,
    bottomPadding: Dp = 8.dp,
) {
    val inbox = programContext.inbox
    val invitesState by programContext.invites.collectAsStateWithLifecycle()
    val itemsState by inbox.items.collectAsStateWithLifecycle()
    val visitNew by inbox.visitNewIds.collectAsStateWithLifecycle()
    val canLoadMore by inbox.canLoadMore.collectAsStateWithLifecycle()
    val loadingMore by inbox.loadingMore.collectAsStateWithLifecycle()
    val programs by programContext.programs.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val isGlobalAdmin = programContext.isGlobalAdmin
    val scope = rememberCoroutineScope()
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var busyId by remember { mutableStateOf<String?>(null) }
    var declineTarget by remember { mutableStateOf<PendingInviteDTO?>(null) }
    var confirmClear by remember { mutableStateOf(false) }
    /** The last remove / Clear all failure, under the Notifications heading (invite errors keep the top line). */
    var inboxError by remember { mutableStateOf<String?>(null) }

    DisposableEffect(inbox) {
        inbox.inboxShown()
        onDispose { inbox.inboxHidden() }
    }
    LaunchedEffect(Unit) { reloadInbox(programContext) }

    fun respond(invite: PendingInviteDTO, action: String, block: Boolean = false) {
        busyId = invite.inviteId; errorMessage = null
        scope.launch {
            programContext.respondToInvite(invite.inviteId, action, block, programId = invite.programId)
                .onSuccess { if (action == "accept") onAccepted() }
                .onFailure { errorMessage = it.toAppError().message }
            busyId = null
        }
    }
    fun offlineOr(error: AppError) = if (!online) AppError(AppErrorKind.OFFLINE) else error
    // §3.9 rule 11 (D-C32): offline fails at once with the kit's words (no request, no confirm); otherwise the row leaves
    // now and comes back if the server refuses. The writes run on the inbox's own scope — leaving this screen ends only
    // the wait for the failure line. removeItem → null = refused here (the swipe springs back); otherwise the write,
    // which the swipe waits on.
    fun offlineLine(lead: String) = "$lead ${AppError(AppErrorKind.OFFLINE).message}"
    fun removeItem(item: InboxItemDTO): Job? {
        if (!online) { inboxError = offlineLine(REMOVE_FAILED); return null }
        inboxError = null
        val write = inbox.remove(item.id)
        scope.launch { write.await().onFailure { inboxError = "$REMOVE_FAILED ${offlineOr(it.toAppError()).message}" } }
        return write
    }
    fun isListed(item: InboxItemDTO) = inbox.items.value.dataOrNull.orEmpty().any { it.id == item.id }
    fun requestClearAll() {
        if (!online) { inboxError = offlineLine(CLEAR_FAILED); return }
        inboxError = null
        confirmClear = true
    }
    fun clearAll() {
        confirmClear = false
        if (!online) { inboxError = offlineLine(CLEAR_FAILED); return }
        val write = inbox.clearAll()
        scope.launch { write.await().onFailure { inboxError = "$CLEAR_FAILED ${offlineOr(it.toAppError()).message}" } }
    }

    val invites = invitesState.dataOrNull.orEmpty().let { list -> if (isGlobalAdmin) list.sortedBy { it.programName.orEmpty() } else list }
    val requested = programs.filter { it.myStatus == "requested" }
    val items = itemsState.dataOrNull
    val hasInvites = invites.isNotEmpty() || requested.isNotEmpty()
    val itemsError = (itemsState as? UiState.Failed)?.error
    val invitesError = (invitesState as? UiState.Failed)?.error

    Column(modifier = modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        errorMessage?.let { FormErrorText(it) }
        when {
            // The notifications failed and no invitation shows: one ErrorView (an invitations error is hidden).
            itemsError != null && !hasInvites ->
                ErrorView(offlineOr(itemsError), onRetry = { scope.launch { reloadInbox(programContext) } })
            items == null && !hasInvites ->
                Box(Modifier.fillMaxWidth().padding(vertical = 40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            else -> {
                if (hasInvites || invitesError != null) SectionLabel(if (isGlobalAdmin) "All invitations" else "Invitations")
                if (hasInvites) {
                    invites.forEach { invite ->
                        InviteCard(
                            invite = invite,
                            busy = busyId == invite.inviteId,
                            onAccept = { respond(invite, "accept") },
                            onDecline = { declineTarget = invite },
                            onRevoke = if (isGlobalAdmin) ({ respond(invite, "revoke") }) else null,
                        )
                    }
                    requested.forEach { program ->
                        RequestedRow(program) {
                            scope.launch {
                                programContext.cancelJoinRequest(program.id).onFailure { errorMessage = it.toAppError().message }
                            }
                        }
                    }
                } else if (invitesError != null) {
                    ErrorView(offlineOr(invitesError), onRetry = { scope.launch { programContext.loadInvites() } })
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    SectionLabel("Notifications")
                    Spacer(Modifier.weight(1f))
                    if (!items.isNullOrEmpty()) {
                        TextButton(onClick = { requestClearAll() }) {
                            Text(CLEAR_ALL, color = AppOrange, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                inboxError?.let { FormErrorText(it) }
                when {
                    itemsError != null -> ErrorView(offlineOr(itemsError), onRetry = { scope.launch { reloadInbox(programContext) } })
                    items == null ->
                        Box(Modifier.fillMaxWidth().padding(vertical = 24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                    else -> {
                        // Every loaded row removed while older pages remain: the empty state, and Load more still reaches them.
                        if (items.isEmpty()) InboxEmptyState()
                        items.forEach { item ->
                            // Keyed by id: a removed row's swipe state goes with it (never onto the next row).
                            key(item.id) {
                                SwipeToRemove(onRemove = { removeItem(item) }, isListed = { isListed(item) }) {
                                    InboxRow(
                                        item,
                                        unread = item.readAt == null || item.id in visitNew,
                                        onClick = if (item.opensSomewhere()) ({ onOpenItem(item) }) else null,
                                        onRemove = { removeItem(item) != null },
                                    )
                                }
                            }
                        }
                        if (canLoadMore) {
                            TextButton(
                                onClick = { scope.launch { inbox.loadMore() } },
                                enabled = !loadingMore,
                                modifier = Modifier.align(Alignment.CenterHorizontally),
                            ) { Text(if (loadingMore) "Loading…" else "Load more", color = AppOrange, fontWeight = FontWeight.SemiBold) }
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(bottomPadding))
    }

    declineTarget?.let { invite ->
        DeclineInviteDialog(
            programName = invite.programName ?: "this program",
            onDecline = { block -> declineTarget = null; respond(invite, "decline", block) },
            onDismiss = { declineTarget = null },
        )
    }

    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text(CLEAR_CONFIRM_TITLE) },
            text = { Text(CLEAR_CONFIRM_BODY) },
            confirmButton = { TextButton(onClick = { clearAll() }) { Text(CLEAR_ALL, color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Cancel") } },
        )
    }
}

/** A row leads somewhere only for program / programs / log-a-workout targets (`inbox` / `invites` items are already here). */
internal fun InboxItemDTO.opensSomewhere(): Boolean = when (InboxTarget.parse(target)) {
    InboxTarget.PROGRAM -> programId != null
    InboxTarget.PROGRAMS, InboxTarget.LOG_WORKOUT -> true
    InboxTarget.INBOX, InboxTarget.INVITES -> false
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
    )
}

/** How far a card must move before a swipe removes it — a fraction of its width, for drags AND flings. */
private const val REMOVE_FRACTION = 0.4f

/** The dismiss veto: M3 1.3's fling threshold is a fixed 125 dp/s, so on its own almost any leftward brush would
 *  delete (a hard delete, no undo). A dismiss is allowed only once the card has moved [REMOVE_FRACTION] of its width. */
private class RemoveGate {
    var width = 0
    var state: SwipeToDismissBoxState? = null

    fun allows(value: SwipeToDismissBoxValue): Boolean {
        if (value != SwipeToDismissBoxValue.EndToStart) return true
        val offset = state?.let { runCatching { it.requireOffset() }.getOrNull() } ?: return false
        return width > 0 && abs(offset) >= width * REMOVE_FRACTION
    }
}

/** Swipe a notification away, end → start (the Android idiom; web shows a ×, iOS reveals Remove). It removes only once
 *  the card has passed 40 % of its width, however fast — a short brush or a sloppy diagonal scroll in the sheet springs
 *  back. A refused swipe (offline) springs back; a removed row leaves, and its keyed state with it. */
@Composable
private fun SwipeToRemove(onRemove: () -> Job?, isListed: () -> Boolean, content: @Composable () -> Unit) {
    val gate = remember { RemoveGate() }
    val state = rememberSwipeToDismissBoxState(
        confirmValueChange = gate::allows,
        positionalThreshold = { totalDistance -> totalDistance * REMOVE_FRACTION },
    )
    SideEffect { gate.state = state }
    LaunchedEffect(state.currentValue) {
        if (state.currentValue != SwipeToDismissBoxValue.EndToStart) return@LaunchedEffect
        val removing = onRemove()
        if (removing == null) { state.reset(); return@LaunchedEffect }
        // A server refusal can put the row back before it ever left the composition — still listed once the remove is
        // done, it springs back instead of staying swiped away.
        removing.join()
        if (isListed()) state.reset()
    }
    SwipeToDismissBox(
        state = state,
        modifier = Modifier.onSizeChanged { gate.width = it.width },
        enableDismissFromStartToEnd = false,
        backgroundContent = {
            val swiping = state.dismissDirection == SwipeToDismissBoxValue.EndToStart
            Box(
                Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(16.dp))
                    .background(if (swiping) AppRed else Color.Transparent)
                    .padding(horizontal = 20.dp),
                contentAlignment = Alignment.CenterEnd,
            ) {
                if (swiping) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(Icons.Filled.Delete, contentDescription = null, tint = Color.White)
                        Text(REMOVE_LABEL, color = Color.White, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        },
    ) { content() }
}

/** One notification: unread dot · title + time · body; a chevron when it opens something. */
@Composable
private fun InboxRow(item: InboxItemDTO, unread: Boolean, onClick: (() -> Unit)?, onRemove: () -> Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            // One TalkBack node per row, with a "Remove" action (the swipe's accessible twin).
            .semantics(mergeDescendants = true) {
                customActions = listOf(CustomAccessibilityAction(REMOVE_LABEL) { onRemove() })
            }
            .padding(14.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .padding(top = 6.dp)
                .size(8.dp)
                .clip(CircleShape)
                .background(if (unread) AppOrange else Color.Transparent)
                .then(if (unread) Modifier.semantics { contentDescription = "Unread" } else Modifier),
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    item.title.ifBlank { "New notification" },
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = if (unread) FontWeight.Bold else FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    inboxTime(item.createdAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                    maxLines = 1,
                )
            }
            if (item.body.isNotBlank()) {
                Text(
                    item.body,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                    maxLines = 4,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (onClick != null) {
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f))
        }
    }
}
