package com.app.rasifiters.ui.program

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.AppearanceStore
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppOrangeGradientEnd
import com.app.rasifiters.ui.Routes
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import com.app.rasifiters.ui.components.kit.STALE_BANNER_CLEARANCE
import com.app.rasifiters.ui.components.kit.initialLoadState
import com.app.rasifiters.ui.components.kit.rememberLoad
import com.app.rasifiters.ui.programs.initialsOf
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/**
 * The Program tab (Tab 4) — the Android analog of the iOS Admin/StandardProgramTab (chosen by
 * `isProgramAdmin`). Admins get Program-management action sections (Select/Edit/Leave · Members ·
 * Role Management · Workout Types); everyone else gets a read-only Program Info card + Switch + Leave.
 * Both share the My Account settings section. Faithful 1:1 to the iOS SPECs; the Apple-Health account
 * row is omitted on Android (Health Connect is Phase H/J).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProgramScreen(
    programContext: ProgramContext,
    appearanceStore: AppearanceStore,
    onNavigate: (String) -> Unit,
    onSwitchProgram: () -> Unit,
) {
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val memberName by programContext.memberName.collectAsStateWithLifecycle()
    val membershipDetails by programContext.membershipDetails.collectAsStateWithLifecycle()
    val members by programContext.members.collectAsStateWithLifecycle()
    val workoutsAll by programContext.programWorkoutsAll.collectAsStateWithLifecycle()

    val isAdmin = programContext.isProgramAdmin
    val canEdit = programContext.canEditProgramData
    val isGlobalAdmin = programContext.isGlobalAdmin
    val scope = rememberCoroutineScope()

    var showSignOut by remember { mutableStateOf(false) }
    var showLeave by remember { mutableStateOf(false) }
    var isLeaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    var pulling by remember { mutableStateOf(false) }

    // Polish #33: the three admin reads on the kit states — a section shows "—" + "Couldn't load this · Retry", never a
    // fake "0 enrolled" / "No admins" / "0 types"; a re-entry with data on screen refreshes underneath.
    val membersLoad = rememberLoad(program?.id, programContext.isOnline, enabled = isAdmin, initial = { initialLoadState(members.isNotEmpty()) }) {
        programContext.ensureMembersLoaded(force = true)
    }
    val rolesLoad = rememberLoad(program?.id, programContext.isOnline, enabled = isAdmin, initial = { initialLoadState(membershipDetails.isNotEmpty()) }) {
        programContext.loadMembershipDetails()
    }
    val typesLoad = rememberLoad(program?.id, programContext.isOnline, enabled = isAdmin, initial = { initialLoadState(workoutsAll.isNotEmpty()) }) {
        programContext.loadAllProgramWorkouts()
    }
    val adminLoads = listOf(membersLoad, rolesLoad, typesLoad)
    val anyStale = online && adminLoads.any { it.state is UiState.Stale }

    val body: @Composable () -> Unit = {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(top = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Header(programName = program?.name ?: "", initials = initialsOf(memberName))

            errorMessage?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error) }

            if (isAdmin) {
                AdminProgramInfoSection(
                    canEdit = canEdit,
                    canLeave = !isGlobalAdmin,
                    program = program,
                    isLeaving = isLeaving,
                    onSelect = onSwitchProgram,
                    onEdit = { onNavigate(Routes.PROGRAM_EDIT) },
                    onLeave = { showLeave = true },
                )
                MembersSection(
                    memberCount = members.size, state = membersLoad.state, online = online,
                    onRetry = membersLoad::reload, canInvite = canEdit, onNavigate = onNavigate,
                )
                if (canEdit) {
                    RoleManagementSection(
                        details = membershipDetails, state = rolesLoad.state, online = online,
                        onRetry = rolesLoad::reload, onNavigate = onNavigate,
                    )
                }
                WorkoutTypesSection(
                    visibleCount = workoutsAll.count { !it.isHidden },
                    customCount = workoutsAll.count { it.isCustom },
                    state = typesLoad.state, online = online, onRetry = typesLoad::reload, onNavigate = onNavigate,
                )
            } else {
                ProgramInfoReadOnlyCard(program)
                SwitchProgramCard(onSwitchProgram)
                LeaveProgramRow(isLeaving = isLeaving, onClick = { showLeave = true })
            }

            ProgramAccountSection(
                programContext = programContext,
                appearanceStore = appearanceStore,
                onNavigate = onNavigate,
                onSignOut = { showSignOut = true },
            )
            if (anyStale) Spacer(Modifier.height(STALE_BANNER_CLEARANCE))
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        if (isAdmin) {
            // Polish #33: pull to refresh re-reads the three admin lists (Android had none here).
            PullToRefreshBox(
                isRefreshing = pulling,
                onRefresh = {
                    pulling = true
                    scope.launch {
                        coroutineScope { adminLoads.forEach { l -> launch { l.refresh() } } }
                        pulling = false
                    }
                },
                modifier = Modifier.fillMaxSize(),
            ) { body() }
        } else {
            body()
        }
        if (anyStale) {
            FloatingBanner(
                FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter),
                onRetry = { adminLoads.forEach { it.reload() } },
            )
        }
    }

    if (showLeave) {
        AlertDialog(
            onDismissRequest = { showLeave = false },
            title = { Text("Leave Program?") },
            text = {
                Text(
                    "You will no longer have access to ${program?.name ?: "this program"}. Your workout history and " +
                        "data will be preserved. If you're invited back and accept, your data will be restored. If " +
                        "you're the last member, the program will be deleted automatically.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showLeave = false
                    isLeaving = true
                    errorMessage = null
                    scope.launch {
                        programContext.leaveProgram()
                            .onSuccess { onSwitchProgram() }
                            .onFailure { errorMessage = it.toAppError().message }
                        isLeaving = false
                    }
                }) { Text("Leave", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showLeave = false }) { Text("Cancel") } },
        )
    }

    if (showSignOut) {
        AlertDialog(
            onDismissRequest = { showSignOut = false },
            title = { Text("Sign Out?") },
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

@Composable
private fun Header(programName: String, initials: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text("Program", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Text(
                programName,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        Box(
            modifier = Modifier
                .size(52.dp)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(AppOrange, AppOrangeGradientEnd))),
            contentAlignment = Alignment.Center,
        ) {
            Text(initials, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color.Black)
        }
    }
}
