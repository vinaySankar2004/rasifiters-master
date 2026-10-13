package com.app.rasifiters.ui.programs

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
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.net.PendingInviteDTO
import com.app.rasifiters.net.ProgramDTO
import com.app.rasifiters.ui.OFFLINE_BANNER_RESERVE
import com.app.rasifiters.ui.components.kit.ErrorView
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import com.app.rasifiters.ui.auth.AppDropdownField
import com.app.rasifiters.ui.auth.AppTextField
import com.app.rasifiters.ui.summary.DatePillField
import com.app.rasifiters.ui.summary.FormErrorText
import com.app.rasifiters.ui.summary.FormFieldLabel
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val STATUS_OPTIONS = listOf("Planned", "Active", "Completed")
private val ISO: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")

// The tab-content region is pinned to the taller (Create) tab's height so the sheet doesn't shrink/grow
// when toggling to My Invites — the shorter tab just top-anchors within the same box.
private val TAB_CONTENT_HEIGHT = 500.dp

/**
 * The "+" actions sheet on the picker — the Android analog of the iOS `ProgramActionsSheet`: a two-tab
 * segmented control over **My Invites** (global admins: **All Invites**) and **Create** (the new-program form).
 * The invites tab is the ONE inbox (invites §3.1): `GET /my-invites` (`/all-invites` for global admins, with
 * Revoke — A10), answered through `PUT /invite-response`; the member's own "requested" programs keep their
 * Cancel Request. Opens on the invites tab when there is something to act on or when [openOnInvites] (an invite
 * push tap), else on Create (iOS onAppear parity).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProgramActionsSheet(
    programContext: ProgramContext,
    onDismiss: () -> Unit,
    openOnInvites: Boolean = false,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val invitesState by programContext.invites.collectAsStateWithLifecycle()
    val programs by programContext.programs.collectAsStateWithLifecycle()
    val isGlobalAdmin = programContext.isGlobalAdmin
    val requested = programs.filter { it.myStatus == "requested" }
    // Push tap → always the invites tab (the inbox may still be loading); else land there only when there's something to act on.
    var selectedTab by remember {
        mutableIntStateOf(if (openOnInvites || invitesState.dataOrNull.orEmpty().isNotEmpty() || requested.isNotEmpty()) 0 else 1)
    }
    LaunchedEffect(openOnInvites) { if (openOnInvites) selectedTab = 0 }
    val online by programContext.isOnline.collectAsStateWithLifecycle()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        // Polish #2 (D-KIT-17): the sheet is its own window, so the root offline banner can't show over it — it carries
        // its own, and the tab area gives up the banner's band (the sheet keeps its height) so nothing sits under it.
        Box(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 16.dp),
            ) {
                SegmentedToggle(
                    left = if (isGlobalAdmin) "All Invites" else "My Invites",
                    right = "Create",
                    selectedIndex = selectedTab,
                    onSelect = { selectedTab = it },
                )
                Spacer(Modifier.height(16.dp))

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(TAB_CONTENT_HEIGHT)
                        .padding(bottom = if (online) 0.dp else OFFLINE_BANNER_RESERVE),
                ) {
                    when (selectedTab) {
                        0 -> InvitesTab(programContext, invitesState, requested, isGlobalAdmin, onAccepted = onDismiss)
                        else -> CreateProgramTab(programContext, onCreated = onDismiss)
                    }
                }
            }
            if (!online) {
                FloatingBanner(FloatingBannerVariant.Offline, Modifier.align(Alignment.BottomCenter).navigationBarsPadding())
            }
        }
    }
}

@Composable
private fun SegmentedToggle(left: String, right: String, selectedIndex: Int, onSelect: (Int) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceContainerHigh, CircleShape)
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        listOf(left, right).forEachIndexed { index, label ->
            val selected = index == selectedIndex
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(CircleShape)
                    .background(if (selected) MaterialTheme.colorScheme.surface else Color.Transparent)
                    .clickable { onSelect(index) }
                    .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    color = if (selected) MaterialTheme.colorScheme.onSurface
                    else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
        }
    }
}

// ---- Invites tab ----

@Composable
private fun InvitesTab(
    programContext: ProgramContext,
    state: UiState<List<PendingInviteDTO>>,
    requested: List<ProgramDTO>,
    isGlobalAdmin: Boolean,
    onAccepted: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var busyId by remember { mutableStateOf<String?>(null) }
    var declineTarget by remember { mutableStateOf<PendingInviteDTO?>(null) }
    val invites = state.dataOrNull.orEmpty().let { list -> if (isGlobalAdmin) list.sortedBy { it.programName.orEmpty() } else list }

    fun respond(invite: PendingInviteDTO, action: String, block: Boolean = false) {
        busyId = invite.inviteId; errorMessage = null
        scope.launch {
            programContext.respondToInvite(invite.inviteId, action, block)
                .onSuccess { if (action == "accept") onAccepted() }
                .onFailure { errorMessage = it.toAppError().message }
            busyId = null
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                if (isGlobalAdmin) "All Program Invitations" else "Program Invitations",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Text(
                if (isGlobalAdmin) "Manage invites across all programs" else "Accept invitations to join programs",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }

        errorMessage?.let { FormErrorText(it) }

        val empty = invites.isEmpty() && requested.isEmpty()
        when {
            // polish-1 rule 6 (QA4): a failed inbox while offline reads as offline (a dead link times out), as the picker.
            empty && state is UiState.Failed -> ErrorView(
                if (!online) AppError(AppErrorKind.OFFLINE) else state.error,
                onRetry = { scope.launch { programContext.loadInvites() } },
            )
            empty && (state is UiState.Loading || state is UiState.Idle) ->
                Box(Modifier.fillMaxWidth().padding(vertical = 40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            empty -> InvitesEmptyState(isGlobalAdmin)
            else -> {
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
            }
        }
    }

    declineTarget?.let { invite ->
        DeclineInviteDialog(
            programName = invite.programName ?: "this program",
            onDecline = { block -> declineTarget = null; respond(invite, "decline", block) },
            onDismiss = { declineTarget = null },
        )
    }
}

@Composable
private fun InvitesEmptyState(isGlobalAdmin: Boolean) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(16.dp))
            .padding(vertical = 40.dp, horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            Icons.Filled.MailOutline,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f),
            modifier = Modifier.size(40.dp),
        )
        Text("No pending invitations", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(
            if (isGlobalAdmin) "There are no pending invites in the system." else "You don't have any program invitations right now.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            textAlign = TextAlign.Center,
        )
    }
}

/** The member's own join request (a "requested" program) — kept on every surface with its Cancel Request (A10). */
@Composable
private fun RequestedRow(program: ProgramDTO, onCancel: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(program.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 2)
        Text(
            "Request pending approval",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )
        InvitePill("Cancel Request", MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), onClick = onCancel)
    }
}

// ---- Create tab ----

@Composable
private fun CreateProgramTab(programContext: ProgramContext, onCreated: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("planned") }
    var startDate by remember { mutableStateOf(LocalDate.now()) }
    var endDate by remember { mutableStateOf(LocalDate.now().plusMonths(3)) }
    var isSaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val dateError = if (!startDate.isBefore(endDate)) "End date must be after the start date." else null
    val canSave = name.trim().isNotEmpty() && dateError == null && !isSaving

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Create Program", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "Set up a new fitness program.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }

        FormFieldLabel("Program name")
        AppTextField("e.g. Summer 2026 Challenge", name, { name = it })

        FormFieldLabel("Status")
        AppDropdownField(
            placeholder = "Select status",
            value = status.replaceFirstChar { it.titlecase(Locale.US) },
            options = STATUS_OPTIONS,
            onSelect = { status = it.lowercase(Locale.US) },
        )

        FormFieldLabel("Start date")
        DatePillField(date = startDate, onChange = { startDate = it }, allowFuture = true)

        FormFieldLabel("End date")
        DatePillField(date = endDate, onChange = { endDate = it }, allowFuture = true)

        dateError?.let { FormErrorText(it) }
        errorMessage?.let { FormErrorText(it) }

        Button(
            onClick = {
                isSaving = true; errorMessage = null
                scope.launch {
                    programContext.createProgram(name.trim(), status, startDate.format(ISO), endDate.format(ISO))
                        .onSuccess { onCreated() }
                        .onFailure { errorMessage = it.toAppError().message }
                    isSaving = false
                }
            },
            enabled = canSave,
            shape = CircleShape,
            colors = ButtonDefaults.buttonColors(
                containerColor = AppOrange,
                contentColor = Color.Black,
                disabledContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest,
            ),
            modifier = Modifier.fillMaxWidth().height(50.dp),
        ) {
            if (isSaving) CircularProgressIndicator(strokeWidth = 2.dp, color = Color.Black, modifier = Modifier.size(20.dp))
            else Text("Create Program", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(8.dp))
    }
}
