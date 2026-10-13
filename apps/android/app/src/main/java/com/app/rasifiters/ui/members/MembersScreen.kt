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
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.MemberCardKey
import com.app.rasifiters.core.MemberCardPart
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppOrangeGradientEnd
import com.app.rasifiters.net.ProgramMemberDTO
import com.app.rasifiters.ui.Routes
import com.app.rasifiters.ui.components.kit.ErrorView
import com.app.rasifiters.ui.components.selectableTarget
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter

/**
 * The Members tab (Tab 2) — the per-member performance dashboard, bifurcated by role (iOS `AdminMembersTab` /
 * `StandardMembersTab`, selected by `isProgramAdmin`). Every role's one header action opens People (the roster grew into
 * People; admins invite from People or the Program tab). Admins get the metrics preview, a "View as" picker (global-admin
 * "None"; program-admin self) and the 5 member cards; loggers / members their own cards (loggers a logs-only View-as).
 * S5 (polish #32) — the Summary recipe on the kit: the reads run together ([ProgramContext.loadMemberCards]) on every
 * entry, pick, pull, Retry and reconnect; a card shows its data only when it is THIS program's / member's
 * ([ProgramContext.memberCardsHeld]) — else a placeholder while it loads, "—" when its read failed; nothing yet → a
 * spinner, or the ErrorView when everything failed / offline; a failed refresh keeps the previous values + "Couldn't
 * refresh · Retry".
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MembersScreen(programContext: ProgramContext, onNavigate: (String) -> Unit) {
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val viewAsId by programContext.membersViewAsId.collectAsStateWithLifecycle()
    val held by programContext.memberCardsHeld.collectAsStateWithLifecycle()
    val load by programContext.memberCardsLoad.collectAsStateWithLifecycle()
    val programName = program?.name ?: ""
    val view = MemberCardsView(membersWant(programContext, program?.id, viewAsId), held, load)
    var reloadTick by remember { mutableIntStateOf(0) }
    var pulling by remember { mutableStateOf(false) }
    val reload = CardsReload(tick = reloadTick, onSettled = { pulling = false }, onRetry = { reloadTick++ })

    // D-KIT-13: back online → anything missing or failed reloads by itself.
    val currentView by rememberUpdatedState(view)
    LaunchedEffect(Unit) {
        programContext.isOnline.drop(1).filter { it }.collect { if (currentView.needsReload) reloadTick++ }
    }
    // Offline is the app-wide banner (AppScaffold, A6); this screen adds only its own "Couldn't refresh".
    val staleBanner = online && view.stale

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        PullToRefreshBox(
            isRefreshing = pulling,
            onRefresh = { pulling = true; reloadTick++ },
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                if (programContext.isProgramAdmin) {
                    AdminMembersBody(programContext, programName, view, reload, online, onNavigate)
                } else {
                    StandardMembersBody(programContext, programName, view, reload, online, onNavigate)
                }
                Spacer(Modifier.height(if (staleBanner) 84.dp else 8.dp))
            }
        }
        if (staleBanner) {
            FloatingBanner(FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter), onRetry = reload.onRetry)
        }
    }
}

// ---- Admin / global-admin variant ----

@Composable
private fun AdminMembersBody(
    programContext: ProgramContext,
    programName: String,
    view: MemberCardsView,
    reload: CardsReload,
    online: Boolean,
    onNavigate: (String) -> Unit,
) {
    val isGlobalAdmin = programContext.isGlobalAdmin
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    // Roster + selection live in ProgramContext so the "View as" pick survives a detail push + return.
    val roster by programContext.members.collectAsStateWithLifecycle()
    val selectedId by programContext.membersViewAsId.collectAsStateWithLifecycle()
    var showPicker by remember { mutableStateOf(false) }

    // The roster (once per program — a failed one retries with every reload), then the preview + the selected member's
    // five reads, together (#5) — on a new pick, every tab entry, pull, Retry and reconnect (S5). A newer run cancels a
    // slower one (it records nothing).
    LaunchedEffect(program?.id, selectedId, reload.tick) {
        try {
            programContext.ensureMembersLoaded()
            val id = selectedId
            if (id != null) programContext.focusMember(id, roster.firstOrNull { it.id == id }?.memberName)
            programContext.loadMemberCards(statsId = id, parts = if (id == null) METRICS_PART else ADMIN_PARTS)
        } finally {
            reload.onSettled()
        }
    }

    val selected = roster.firstOrNull { it.id == selectedId }
    val viewAsLabel = selected?.memberName
        ?: if (isGlobalAdmin) "None" else (programContext.loggedInMemberName ?: "Member")

    MembersHeader(subtitle = programName, onPeople = { onNavigate(Routes.MEMBER_ROSTER) })

    if (!view.anyData) {
        MemberCardsEmpty(view, online, reload.onRetry)
        return
    }

    MemberMetricsPreviewCard(programContext, state = view.stateOf(MemberCardPart.METRICS), onClick = { onNavigate(Routes.MEMBER_METRICS) })

    ViewAsSelector(label = viewAsLabel, onClick = { showPicker = true })

    if (selected != null) {
        MemberSectionCards(programContext, selected.id, selected.memberName, view, onNavigate)
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
private fun StandardMembersBody(
    programContext: ProgramContext,
    programName: String,
    view: MemberCardsView,
    reload: CardsReload,
    online: Boolean,
    onNavigate: (String) -> Unit,
) {
    val isLogger = programContext.loggedInUserProgramRole == "logger"
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val selfId = programContext.loggedInMemberId
    val selfName = programContext.loggedInMemberName ?: "Member"

    val roster by programContext.members.collectAsStateWithLifecycle()
    val loggerViewAsId by programContext.membersViewAsId.collectAsStateWithLifecycle()
    val overview by programContext.selectedMemberOverview.collectAsStateWithLifecycle()
    var showPicker by remember { mutableStateOf(false) }
    // Recent + Health follow the member they show (a logger's View-as pick, else self).
    val logsKey = if (isLogger) (loggerViewAsId ?: selfId) else selfId

    // Self data — the five reads together (#5); again on a logger's View-as pick, every tab entry, pull, Retry and
    // reconnect (S5). The self metric row IS the overview row (no all-member download, member-analytics D-C10). A newer
    // run cancels a slower one (it records nothing — ProgramContext.loadMemberCards).
    LaunchedEffect(program?.id, logsKey, reload.tick) {
        try {
            programContext.ensureMembersLoaded()
            if (selfId != null) {
                programContext.focusMember(selfId, selfName)
                programContext.loadMemberCards(statsId = selfId, logsId = logsKey ?: selfId, parts = MEMBER_PARTS)
            }
        } finally {
            reload.onSettled()
        }
    }

    MembersHeader(subtitle = programName, onPeople = { onNavigate(Routes.MEMBER_ROSTER) })

    if (!view.anyData) {
        MemberCardsEmpty(view, online, reload.onRetry)
        return
    }

    val overviewState = view.stateOf(MemberCardPart.OVERVIEW)
    MemberOverviewCard(programContext, state = overviewState)
    if (overviewState == CardState.DATA) {
        overview?.takeIf { it.memberId == selfId }?.let { MemberMetricsCard(it, MetricSortField.ACTIVE_DAYS) }
    }
    MemberHistoryCard(programContext, state = view.stateOf(MemberCardPart.HISTORY), onClick = {
        programContext.focusMember(selfId, selfName); onNavigate(Routes.MEMBER_HISTORY)
    })
    MemberStreakCard(programContext, state = view.stateOf(MemberCardPart.STREAKS), onClick = {
        programContext.focusMember(selfId, selfName); onNavigate(Routes.MEMBER_STREAKS)
    })

    val logsTarget = if (isLogger) (roster.firstOrNull { it.id == loggerViewAsId }) else null
    val logsId = logsTarget?.id ?: selfId
    val logsName = logsTarget?.memberName ?: selfName

    if (isLogger) {
        ViewAsSelector(label = logsTarget?.memberName ?: selfName, onClick = { showPicker = true })
    }

    MemberRecentCard(programContext, state = view.stateOf(MemberCardPart.RECENT), onClick = {
        programContext.focusMember(logsId, logsName); onNavigate(Routes.MEMBER_WORKOUTS)
    })
    MemberHealthCard(programContext, state = view.stateOf(MemberCardPart.HEALTH), onClick = {
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

/** The 5 member cards for [focusId] (the admin body + People "Open full stats"), each in its S5 state. */
@Composable
internal fun MemberSectionCards(
    programContext: ProgramContext,
    focusId: String,
    focusName: String,
    view: MemberCardsView,
    onNavigate: (String) -> Unit,
) {
    MemberOverviewCard(programContext, state = view.stateOf(MemberCardPart.OVERVIEW))
    MemberHistoryCard(programContext, state = view.stateOf(MemberCardPart.HISTORY), onClick = {
        programContext.focusMember(focusId, focusName); onNavigate(Routes.MEMBER_HISTORY)
    })
    MemberStreakCard(programContext, state = view.stateOf(MemberCardPart.STREAKS), onClick = {
        programContext.focusMember(focusId, focusName); onNavigate(Routes.MEMBER_STREAKS)
    })
    MemberRecentCard(programContext, state = view.stateOf(MemberCardPart.RECENT), onClick = {
        programContext.focusMember(focusId, focusName); onNavigate(Routes.MEMBER_WORKOUTS)
    })
    MemberHealthCard(programContext, state = view.stateOf(MemberCardPart.HEALTH), onClick = {
        programContext.focusMember(focusId, focusName); onNavigate(Routes.MEMBER_HEALTH)
    })
}

// ---- Header + glass action button ----

/** The tab header — every role's one action opens People. */
@Composable
private fun MembersHeader(subtitle: String, onPeople: () -> Unit) {
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
        GlassIconButton(icon = Icons.Filled.Group, contentDescription = "People", onClick = onPeople)
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
            // Polish #42: the list sizes itself (rows are ~52dp; the old 48dp-per-row height clipped the last one).
            LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 380.dp)) {
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
            .selectableTarget(selected = selected, role = Role.RadioButton, onClick = onClick)
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

// ---- S5 helpers (shared with MemberFullStatsScreen) ----

private val METRICS_PART: Set<MemberCardPart> = setOf(MemberCardPart.METRICS)
private val ADMIN_PARTS: Set<MemberCardPart> = METRICS_PART + MEMBER_PARTS

/** The program + member each card of the Members tab is for (S5): admins — the preview + the View-as member's five;
 *  loggers / members — their own three + Recent / Health for the logger's View-as (else self). */
private fun membersWant(programContext: ProgramContext, programId: String?, viewAsId: String?): Map<MemberCardPart, MemberCardKey> {
    val pid = programId ?: return emptyMap()
    if (programContext.isProgramAdmin) {
        val metrics = mapOf(MemberCardPart.METRICS to MemberCardKey(pid, null))
        return if (viewAsId == null) metrics else metrics + MEMBER_PARTS.associateWith { MemberCardKey(pid, viewAsId) }
    }
    val self = programContext.loggedInMemberId ?: return emptyMap()
    val logs = (if (programContext.loggedInUserProgramRole == "logger") viewAsId else null) ?: self
    return MEMBER_PARTS.associateWith { MemberCardKey(pid, if (it in LOGS_PARTS) logs else self) }
}

/** The tab's reload trigger (pull / Retry / reconnect) handed to the bodies' load effects. */
private class CardsReload(val tick: Int, val onSettled: () -> Unit, val onRetry: () -> Unit)

/** S5: nothing of this program / member to show yet — everything failed or offline → the kit ErrorView + Retry (the
 *  offline copy while offline: never an endless spinner, D-KIT-18), else a spinner. */
@Composable
internal fun MemberCardsEmpty(view: MemberCardsView, online: Boolean, onRetry: () -> Unit) {
    if (view.allFailed || !online) {
        ErrorView(if (!online) AppError(AppErrorKind.OFFLINE) else view.error ?: AppError(AppErrorKind.UNKNOWN), onRetry = onRetry)
    } else {
        MembersSpinner()
    }
}

@Composable
internal fun MembersSpinner() {
    Box(modifier = Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = AppOrange)
    }
}
