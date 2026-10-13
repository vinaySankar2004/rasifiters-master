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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.LifestyleData
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.ui.Routes
import com.app.rasifiters.ui.components.kit.KitLoad
import com.app.rasifiters.ui.components.kit.KitStaleBanner
import com.app.rasifiters.ui.components.kit.RefetchOnReconnect
import com.app.rasifiters.ui.components.kit.STALE_BANNER_CLEARANCE
import com.app.rasifiters.ui.components.kit.showsStaleBanner
import com.app.rasifiters.ui.members.GlassIconButton
import com.app.rasifiters.ui.members.MemberPickerSheet
import kotlinx.coroutines.launch

/**
 * The Lifestyle tab (Tab 3) — the workout-types dashboard (iOS `AdminWorkoutTypesTab` / `StandardWorkoutTypesTab`,
 * selected by `isProgramAdmin`): a header with a glass button (→ the workout-types manager), the 4 stat cards, steps,
 * the popularity chart and the two timeline previews. Admins also get a "View as" picker (global-admin → "None"/
 * program-wide; program-admin → self by default, or "Admin"/program-wide). Highest-participation is always program-wide.
 * Polish #10/#31 (the Summary recipe, superseding "load errors swallowed — iOS F1"): kit states keyed by (program, "View
 * as") — a switch starts from Loading, never the previous scope's numbers; a failed part shows "—"; ErrorView + Retry with
 * no data; "Couldn't refresh" when stale; pull to refresh; reload on reconnect.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LifestyleScreen(programContext: ProgramContext, onNavigate: (String) -> Unit) {
    val isAdmin = programContext.isProgramAdmin
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val programName = program?.name ?: ""
    val roster by programContext.members.collectAsStateWithLifecycle()
    val viewAsId by programContext.lifestyleViewAsId.collectAsStateWithLifecycle()
    val chosen by programContext.lifestyleViewAsChosen.collectAsStateWithLifecycle()
    val defaultedFor by programContext.lifestyleDefaultedFor.collectAsStateWithLifecycle()
    val state by programContext.lifestyleState.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var showPicker by remember { mutableStateOf(false) }
    var pulling by remember { mutableStateOf(false) }

    // The scope the cards show: admins → the "View as" pick (null = program-wide); everyone else → self.
    fun scopeMemberId(): String? = if (isAdmin) programContext.lifestyleViewAsId.value else programContext.loggedInMemberId
    fun reload() { scope.launch { programContext.loadLifestyle(scopeMemberId()) } }

    // Admins: the "View as" default for this program, applied once — before the picker's roster read, so a pick made
    // meanwhile is never overwritten (iOS AdminWorkoutTypesTab.task: apply the default, then load).
    LaunchedEffect(program?.id, isAdmin) { if (isAdmin) programContext.ensureLifestyleViewAsDefault() }
    // The keyed-state rule: the cards load for the scope on screen once the admin default is applied for THIS program
    // (the first fetch is already in the right scope), again on every later pick (setLifestyleViewAs resets the cards to
    // loading in the same event), and on every tab entry (a refresh underneath the data on screen).
    val ready = program?.id != null && (!isAdmin || defaultedFor == program?.id)
    LaunchedEffect(program?.id, isAdmin, ready, viewAsId) {
        if (ready) programContext.loadLifestyle(scopeMemberId())
    }
    // D-KIT-13: back online → a failed / stale Lifestyle reloads by itself.
    RefetchOnReconnect(
        programContext.isOnline,
        needsReload = { programContext.lifestyleState.value.let { it is UiState.Failed || it is UiState.Stale } },
    ) { reload() }

    val selected = roster.firstOrNull { it.id == viewAsId }
    val viewAsLabel = selected?.memberName
        ?: if (programContext.isGlobalAdmin) "Admin"
        else if (chosen) "Admin"
        else (programContext.loggedInMemberName ?: "Member")

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        PullToRefreshBox(
            isRefreshing = pulling,
            onRefresh = { pulling = true; scope.launch { programContext.loadLifestyle(scopeMemberId()); pulling = false } },
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Lifestyle", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                        Text(
                            programName,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        )
                    }
                    GlassIconButton(
                        icon = Icons.Filled.FitnessCenter,
                        contentDescription = "Workout types",
                        onClick = { onNavigate(Routes.LIFESTYLE_WORKOUT_TYPES) },
                    )
                }

                if (isAdmin) ViewAsRow(label = viewAsLabel, onClick = { showPicker = true })

                KitLoad(state, online, onRetry = { reload() }) { data -> LifestyleCardStack(data, onNavigate) }

                Spacer(Modifier.height(if (state.showsStaleBanner(online)) STALE_BANNER_CLEARANCE else 8.dp))
            }
        }
        KitStaleBanner(state, online, onRetry = { reload() })
    }

    if (showPicker) {
        MemberPickerSheet(
            members = roster,
            selectedId = viewAsId,
            showNone = true,
            noneLabel = if (programContext.isGlobalAdmin) "None" else "Admin",
            onSelect = { member -> programContext.setLifestyleViewAs(member?.id); showPicker = false },
            onDismiss = { showPicker = false },
        )
    }
}

/** The loaded cards (unchanged layout): 2×2 stats, steps, popularity, the two timeline previews. */
@Composable
private fun LifestyleCardStack(data: LifestyleData, onNavigate: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        WorkoutTypesTotalCard(total = data.totalTypes, modifier = Modifier.weight(1f))
        WorkoutTypeMostPopularCard(stat = data.mostPopular, modifier = Modifier.weight(1f))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        WorkoutTypeLongestDurationCard(stat = data.longestDuration, modifier = Modifier.weight(1f))
        WorkoutTypeHighestParticipationCard(stat = data.highestParticipation, modifier = Modifier.weight(1f))
    }
    // Steps analytics card — right after the Longest/Highest row (DC-9).
    StepsAnalyticsCard(stats = data.steps)
    WorkoutTypePopularityCard(types = data.workoutTypes)
    LifestyleTimelinePreviewCard(timeline = data.timeline, onClick = { onNavigate(Routes.LIFESTYLE_TIMELINE) })
    // Steps Timeline preview — directly after the Lifestyle Timeline card (DC-9).
    StepsTimelinePreviewCard(timeline = data.timeline, onClick = { onNavigate(Routes.LIFESTYLE_STEPS_TIMELINE) })
}

/** The "View as" selector row (admin only) — opens the member picker sheet. */
@Composable
private fun ViewAsRow(label: String, onClick: () -> Unit) {
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
