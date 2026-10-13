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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.MemberCardKey
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.core.theme.AppBlue
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppRed
import com.app.rasifiters.ui.auth.AppTextField
import com.app.rasifiters.ui.auth.PillButton
import com.app.rasifiters.ui.components.kit.ErrorView
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import com.app.rasifiters.ui.summary.CircleBackButton
import com.app.rasifiters.ui.summary.DatePillField
import com.app.rasifiters.ui.summary.DetailTopBar
import com.app.rasifiters.ui.summary.FormErrorText
import com.app.rasifiters.ui.summary.FormFieldLabel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import java.time.LocalDate

// The member-management cluster (Program-tab targets, lit up early for the Members tab per the user).
// Invite (privacy-safe) · editor (global-admin only: joined-date + active toggle + remove) · "Open full stats" (staff,
// from a People profile). The roster grew into People (ui/people). Faithful to program-member-management §4/§7.

// ---- Invite Member ----

@Composable
fun InviteMemberScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var username by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showToast by remember { mutableStateOf(false) }
    val valid = username.trim().isNotEmpty()

    LaunchedEffect(showToast) { if (showToast) { delay(1800); showToast = false } }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(top = 16.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Invite Member")
            Text("Invite member", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(
                "Enter the exact username of the person you want to invite to this program.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
            FormFieldLabel("Username")
            AppTextField(
                label = "@username",
                value = username,
                onValueChange = { username = it.trim(); errorMessage = null },
            )
            Row(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(AppBlue.copy(alpha = 0.08f)).padding(14.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(Icons.Filled.Info, contentDescription = null, tint = AppBlue, modifier = Modifier.size(18.dp))
                Text(
                    "The user must have an account to receive the invitation. They will see your invite in their pending invitations.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                )
            }
            errorMessage?.let { FormErrorText(it) }
            Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                PillButton(
                    label = "Send Invitation",
                    onClick = {
                        if (valid) {
                            sending = true; errorMessage = null
                            scope.launch {
                                programContext.sendProgramInvite(username)
                                    .onSuccess { sending = false; username = ""; showToast = true }
                                    .onFailure { e -> sending = false; errorMessage = e.toAppError().message }
                            }
                        }
                    },
                    enabled = valid,
                    loading = sending,
                )
            }
        }
        if (showToast) {
            Row(
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp)
                    .clip(CircleShape).background(MaterialTheme.colorScheme.surface)
                    .border(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f), CircleShape)
                    .padding(horizontal = 18.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = AppGreen, modifier = Modifier.size(18.dp))
                Text("Invitation sent", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

// ---- Member editor (global-admin only) ----

@Composable
fun MemberDetailEditScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val details by programContext.membershipDetails.collectAsStateWithLifecycle()
    val focusId by programContext.focusedMemberId.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    // Opened from a People profile — the roster no longer preloads the membership rows, so this screen loads its own.
    // The edit-membership rule: the form shows only once THIS load succeeded (rows left over from another program's
    // earlier load never seed it), and its state is keyed on (member, loaded).
    var loaded by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<AppError?>(null) }
    suspend fun loadDetails() {
        loadError = null
        programContext.loadMembershipDetails()
            .onSuccess { loaded = true }
            .onFailure { loadError = it.toAppError() }
    }
    LaunchedEffect(Unit) { loadDetails() }
    val membership = if (loaded) details.firstOrNull { it.memberId == focusId } else null

    var joinedAt by remember(membership?.memberId, loaded) { mutableStateOf(parseDate(membership?.joinedAt) ?: LocalDate.now()) }
    var isActive by remember(membership?.memberId, loaded) { mutableStateOf(membership?.isActive ?: true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    var confirmRemove by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(top = 16.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Member Details")
            if (membership == null) {
                val err = loadError
                when {
                    loaded -> Text("Member not found.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    err != null -> ErrorView(
                        if (!online) AppError(AppErrorKind.OFFLINE) else err,
                        onRetry = { scope.launch { loadDetails() } },
                    )
                    else -> MembersSpinner()
                }
                return@Column
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                MemberInitialsAvatar(membership.memberName, 60, admin = membership.programRole == "admin")
                Spacer(Modifier.size(14.dp))
                Column {
                    Text(membership.memberName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    membership.username?.let { Text("@$it", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)) }
                    if (membership.programRole == "admin") {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Icon(Icons.Filled.Star, contentDescription = null, tint = AppOrange, modifier = Modifier.size(14.dp))
                            Text("Program Admin", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = AppOrange)
                        }
                    }
                }
            }
            FactRow("Gender", membership.gender ?: "—")
            FactRow("Date of Birth", membership.dateOfBirth ?: "—")
            FactRow("Account Created", membership.dateJoined ?: "—")

            FormFieldLabel("Joined Program")
            DatePillField(date = joinedAt, onChange = { joinedAt = it; errorMessage = null }, allowFuture = false)

            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    FormFieldLabel("Active Membership")
                    Text("Inactive members keep their history but stop counting toward participation.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                }
                Switch(checked = isActive, onCheckedChange = { isActive = it; errorMessage = null })
            }
            errorMessage?.let { FormErrorText(it) }

            Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                PillButton(
                    label = "Save changes",
                    onClick = {
                        saving = true; errorMessage = null
                        scope.launch {
                            programContext.editMembership(membership.memberId, isActive = isActive, joinedAt = joinedAt.toString())
                                .onSuccess { saving = false; onBack() }
                                .onFailure { e -> saving = false; errorMessage = e.toAppError().message }
                        }
                    },
                    enabled = !saving,
                    loading = saving,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(AppRed.copy(alpha = 0.12f))
                    .clickable(enabled = !saving) { confirmRemove = true }.padding(vertical = 14.dp),
                horizontalArrangement = Arrangement.Center,
            ) {
                Text("Remove from Program", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = AppRed)
            }
        }
    }

    if (confirmRemove && membership != null) {
        AlertDialog(
            onDismissRequest = { confirmRemove = false },
            title = { Text("Remove member") },
            text = { Text("This will remove ${membership.memberName} from the program.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmRemove = false; saving = true
                    scope.launch {
                        programContext.removeMember(membership.memberId)
                            .onSuccess { saving = false; onBack() }
                            .onFailure { e -> saving = false; errorMessage = e.toAppError().message }
                    }
                }) { Text("Remove", color = AppRed) }
            },
            dismissButton = { TextButton(onClick = { confirmRemove = false }) { Text("Cancel") } },
        )
    }
}

// ---- Open full stats (staff; reached from a People profile) ----

/** The five Members cards for [ProgramContext.focusedMemberId] (the profile focused that member before the push), on the
 *  S5 recipe: the reads together; a card shows only THIS member's data (never the tab's leftovers) — a placeholder while
 *  it loads, "—" when its read failed; nothing yet → spinner / ErrorView (offline copy offline); a failed refresh keeps
 *  the values + "Couldn't refresh · Retry"; pull to refresh; back online → reload. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemberFullStatsScreen(programContext: ProgramContext, onNavigate: (String) -> Unit, onBack: () -> Unit) {
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val focusId by programContext.focusedMemberId.collectAsStateWithLifecycle()
    val focusName by programContext.focusedMemberName.collectAsStateWithLifecycle()
    val held by programContext.memberCardsHeld.collectAsStateWithLifecycle()
    val load by programContext.memberCardsLoad.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    var reloadTick by remember { mutableIntStateOf(0) }
    var pulling by remember { mutableStateOf(false) }
    val pid = program?.id
    val id = focusId
    val view = MemberCardsView(
        if (pid != null && id != null) MEMBER_PARTS.associateWith { MemberCardKey(pid, id) } else emptyMap(),
        held,
        load,
    )

    LaunchedEffect(pid, id, reloadTick) {
        try {
            if (id != null) programContext.loadMemberCards(statsId = id, parts = MEMBER_PARTS)
        } finally {
            pulling = false
        }
    }
    val currentView by rememberUpdatedState(view)
    LaunchedEffect(Unit) {
        programContext.isOnline.drop(1).filter { it }.collect { if (currentView.needsReload) reloadTick++ }
    }
    val staleBanner = online && view.stale

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        PullToRefreshBox(
            isRefreshing = pulling,
            onRefresh = { pulling = true; reloadTick++ },
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp).padding(top = 16.dp, bottom = if (staleBanner) 96.dp else 32.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                DetailTopBar(onBack = onBack, centerTitle = "Full stats")
                when {
                    id == null -> Text("Member not found.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    !view.anyData -> MemberCardsEmpty(view, online) { reloadTick++ }
                    else -> MemberSectionCards(programContext, id, focusName ?: "Member", view, onNavigate)
                }
            }
        }
        if (staleBanner) {
            FloatingBanner(FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter), onRetry = { reloadTick++ })
        }
    }
}

@Composable
private fun FactRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f), modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
    }
}

private fun parseDate(raw: String?): LocalDate? =
    raw?.takeIf { it.isNotBlank() }?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
