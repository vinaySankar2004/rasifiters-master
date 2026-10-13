package com.app.rasifiters.ui.inbox

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
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
import com.app.rasifiters.net.InboxItemDTO
import com.app.rasifiters.net.PendingInviteDTO
import com.app.rasifiters.ui.components.kit.ErrorView
import com.app.rasifiters.ui.programs.DeclineInviteDialog
import com.app.rasifiters.ui.programs.InviteCard
import com.app.rasifiters.ui.summary.FormErrorText
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

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
                SectionLabel("Notifications")
                when {
                    itemsError != null -> ErrorView(offlineOr(itemsError), onRetry = { scope.launch { reloadInbox(programContext) } })
                    items == null ->
                        Box(Modifier.fillMaxWidth().padding(vertical = 24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                    items.isEmpty() -> InboxEmptyState()
                    else -> {
                        items.forEach { item ->
                            InboxRow(
                                item,
                                unread = item.readAt == null || item.id in visitNew,
                                onClick = if (item.opensSomewhere()) ({ onOpenItem(item) }) else null,
                            )
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

/** One notification: unread dot · title + time · body; a chevron when it opens something. */
@Composable
private fun InboxRow(item: InboxItemDTO, unread: Boolean, onClick: (() -> Unit)?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
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
