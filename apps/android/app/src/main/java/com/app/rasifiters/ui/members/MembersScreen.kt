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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppOrangeGradientEnd
import com.app.rasifiters.net.ProgramMemberDTO
import com.app.rasifiters.ui.Routes

/**
 * The Members tab (Tab 2) — the per-member performance dashboard, bifurcated by role (iOS
 * `AdminMembersTab` / `StandardMembersTab`, selected by `isProgramAdmin`). Admins get an Invite button,
 * a metrics preview, a "View as" picker (global-admin gets "None"; program-admin auto-selects self), and
 * the 5 member cards for the picked member. Loggers/members see their own cards; loggers get a logs-only
 * view-as scoping Recent + Health. Faithful 1:1 to admin-members §4/§7 (read-only tab; load errors
 * swallowed — iOS F1). All 8 detail targets are real screens this phase (Android does the full cluster).
 */
@Composable
fun MembersScreen(programContext: ProgramContext, onNavigate: (String) -> Unit) {
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val programName = program?.name ?: ""

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (programContext.isProgramAdmin) {
                AdminMembersBody(programContext, programName, onNavigate)
            } else {
                StandardMembersBody(programContext, programName, onNavigate)
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

// ---- Admin / global-admin variant ----

@Composable
private fun AdminMembersBody(programContext: ProgramContext, programName: String, onNavigate: (String) -> Unit) {
    val isGlobalAdmin = programContext.isGlobalAdmin
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    // Roster + selection live in ProgramContext so the "View as" pick survives a detail push + return.
    val roster by programContext.members.collectAsStateWithLifecycle()
    val selectedId by programContext.membersViewAsId.collectAsStateWithLifecycle()
    var showPicker by remember { mutableStateOf(false) }

    LaunchedEffect(program?.id) { programContext.ensureMembersLoaded() }

    // Load the selected member's 5 reads whenever the persisted selection changes (or on tab re-entry).
    LaunchedEffect(selectedId) {
        val id = selectedId ?: return@LaunchedEffect
        val name = roster.firstOrNull { it.id == id }?.memberName
        programContext.focusMember(id, name)
        programContext.loadMemberOverview(id)
        programContext.loadMemberHistory(id, "week")
        programContext.loadMemberStreaks(id)
        programContext.loadMemberRecent(id, limit = 10)
        programContext.loadMemberHealthLogs(id, limit = 10)
    }

    val selected = roster.firstOrNull { it.id == selectedId }
    val viewAsLabel = selected?.memberName
        ?: if (isGlobalAdmin) "None" else (programContext.loggedInMemberName ?: "Member")

    MembersHeader(
        subtitle = programName,
        actionIcon = Icons.Filled.MailOutline,
        actionDescription = "Invite member",
        onAction = { onNavigate(Routes.MEMBER_INVITE) },
    )

    MemberMetricsPreviewCard(programContext, onClick = { onNavigate(Routes.MEMBER_METRICS) })

    ViewAsSelector(label = viewAsLabel, onClick = { showPicker = true })

    if (selected != null) {
        MemberSectionCards(programContext, focusId = selected.id, focusName = selected.memberName, onNavigate = onNavigate)
    }

    if (showPicker) {
        MemberPickerSheet(
            members = roster,
            selectedId = selectedId,
            showNone = isGlobalAdmin,
            onSelect = { member -> programContext.setMembersViewAs(member?.id); showPicker = false },
            onDismiss = { showPicker = false },
        )
    }
}

// ---- Logger / member variant ----

@Composable
private fun StandardMembersBody(programContext: ProgramContext, programName: String, onNavigate: (String) -> Unit) {
    val isLogger = programContext.loggedInUserProgramRole == "logger"
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val selfId = programContext.loggedInMemberId
    val selfName = programContext.loggedInMemberName ?: "Member"

    val roster by programContext.members.collectAsStateWithLifecycle()
    val loggerViewAsId by programContext.membersViewAsId.collectAsStateWithLifecycle()
    var loading by remember { mutableStateOf(true) }
    var selfMetrics by remember { mutableStateOf<com.app.rasifiters.net.MemberMetricsDTO?>(null) }
    var showPicker by remember { mutableStateOf(false) }

    // Self data (overview / metrics / history / streaks) — loaded once per program.
    LaunchedEffect(program?.id) {
        loading = true
        programContext.ensureMembersLoaded()
        if (selfId != null) {
            programContext.loadMemberMetrics(sort = "workouts", direction = "desc")
            selfMetrics = programContext.memberMetrics.value.firstOrNull { it.memberId == selfId }
            programContext.focusMember(selfId, selfName)
            programContext.loadMemberOverview(selfId)
            programContext.loadMemberHistory(selfId, "week")
            programContext.loadMemberStreaks(selfId)
            programContext.loadMemberRecent(selfId, limit = 10)
            programContext.loadMemberHealthLogs(selfId, limit = 10)
        }
        loading = false
    }

    // Logger view-as re-scopes Recent + Health only (the persisted selection survives detail pushes).
    LaunchedEffect(loggerViewAsId) {
        if (!isLogger) return@LaunchedEffect
        val id = loggerViewAsId ?: selfId ?: return@LaunchedEffect
        programContext.loadMemberRecent(id, limit = 10)
        programContext.loadMemberHealthLogs(id, limit = 10)
    }

    MembersHeader(
        subtitle = programName,
        actionIcon = Icons.Filled.Group,
        actionDescription = "View members",
        onAction = { onNavigate(Routes.MEMBER_ROSTER) },
    )

    if (loading) {
        Box(modifier = Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = AppOrange)
        }
        return
    }

    MemberOverviewCard(programContext)
    selfMetrics?.let { MemberMetricsCard(it, MetricSortField.WORKOUTS) }
    MemberHistoryCard(programContext, onClick = {
        programContext.focusMember(selfId, selfName); onNavigate(Routes.MEMBER_HISTORY)
    })
    MemberStreakCard(programContext, onClick = {
        programContext.focusMember(selfId, selfName); onNavigate(Routes.MEMBER_STREAKS)
    })

    val logsTarget = if (isLogger) (roster.firstOrNull { it.id == loggerViewAsId }) else null
    val logsId = logsTarget?.id ?: selfId
    val logsName = logsTarget?.memberName ?: selfName

    if (isLogger) {
        val label = logsTarget?.memberName ?: selfName
        ViewAsSelector(label = label, onClick = { showPicker = true })
    }

    MemberRecentCard(programContext, onClick = {
        programContext.focusMember(logsId, logsName); onNavigate(Routes.MEMBER_WORKOUTS)
    })
    MemberHealthCard(programContext, onClick = {
        programContext.focusMember(logsId, logsName); onNavigate(Routes.MEMBER_HEALTH)
    })

    if (showPicker) {
        MemberPickerSheet(
            members = roster,
            selectedId = loggerViewAsId,
            showNone = false,
            onSelect = { member -> programContext.setMembersViewAs(member?.id ?: selfId); showPicker = false },
            onDismiss = { showPicker = false },
        )
    }
}

/** The 5 member cards shown once a member is picked (admin body). */
@Composable
private fun MemberSectionCards(
    programContext: ProgramContext,
    focusId: String,
    focusName: String,
    onNavigate: (String) -> Unit,
) {
    MemberOverviewCard(programContext)
    MemberHistoryCard(programContext, onClick = {
        programContext.focusMember(focusId, focusName); onNavigate(Routes.MEMBER_HISTORY)
    })
    MemberStreakCard(programContext, onClick = {
        programContext.focusMember(focusId, focusName); onNavigate(Routes.MEMBER_STREAKS)
    })
    MemberRecentCard(programContext, onClick = {
        programContext.focusMember(focusId, focusName); onNavigate(Routes.MEMBER_WORKOUTS)
    })
    MemberHealthCard(programContext, onClick = {
        programContext.focusMember(focusId, focusName); onNavigate(Routes.MEMBER_HEALTH)
    })
}

// ---- Header + glass action button ----

@Composable
private fun MembersHeader(
    subtitle: String,
    actionIcon: ImageVector,
    actionDescription: String,
    onAction: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text("Members", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Text(
                subtitle,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        GlassIconButton(icon = actionIcon, contentDescription = actionDescription, onClick = onAction)
    }
}

/** The circular gradient icon button (iOS `GlassButton`) — the Members header action. */
@Composable
fun GlassIconButton(icon: ImageVector, contentDescription: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(52.dp)
            .clip(CircleShape)
            .background(Brush.linearGradient(listOf(AppOrange, AppOrangeGradientEnd)))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = contentDescription, tint = Color.Black, modifier = Modifier.size(24.dp))
    }
}

// ---- "View as" selector row ----

@Composable
private fun ViewAsSelector(label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("View as", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.weight(1f))
        Text(label, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f))
        Spacer(Modifier.size(8.dp))
        Icon(Icons.Filled.UnfoldMore, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), modifier = Modifier.size(20.dp))
    }
}

// ---- "View as" picker sheet (iOS MemberPickerView) ----

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemberPickerSheet(
    members: List<ProgramMemberDTO>,
    selectedId: String?,
    showNone: Boolean,
    onSelect: (ProgramMemberDTO?) -> Unit,
    onDismiss: () -> Unit,
    noneLabel: String = "None",
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var query by remember { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 12.dp),
        ) {
            Text("View as", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(12.dp))
            val filtered = if (query.isBlank()) members
            else members.filter { it.memberName.contains(query.trim(), ignoreCase = true) }
            LazyColumn(modifier = Modifier.fillMaxWidth().height(if (filtered.size > 6) 380.dp else (48 * (filtered.size + if (showNone) 1 else 0)).coerceAtLeast(48).dp)) {
                if (showNone) {
                    item {
                        PickerRow(name = noneLabel, selected = selectedId == null, onClick = { onSelect(null) })
                    }
                }
                items(filtered, key = { it.id }) { m ->
                    PickerRow(name = m.memberName, selected = m.id == selectedId, onClick = { onSelect(m) })
                }
            }
            Spacer(Modifier.height(12.dp))
            TextField(
                value = query,
                onValueChange = { query = it },
                singleLine = true,
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                placeholder = { Text("Search member") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
            )
        }
    }
}

@Composable
private fun PickerRow(name: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            name,
            style = MaterialTheme.typography.bodyLarge,
            color = if (selected) AppOrange else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        if (selected) Icon(Icons.Filled.Check, contentDescription = null, tint = AppOrange, modifier = Modifier.size(18.dp))
    }
}
