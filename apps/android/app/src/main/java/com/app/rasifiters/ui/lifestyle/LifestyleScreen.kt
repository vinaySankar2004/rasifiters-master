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
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.ui.Routes
import com.app.rasifiters.ui.members.GlassIconButton
import com.app.rasifiters.ui.members.MemberPickerSheet

/**
 * The Lifestyle tab (Tab 3) — the workout-types dashboard (iOS `AdminWorkoutTypesTab` /
 * `StandardWorkoutTypesTab`, selected by `isProgramAdmin`). Both variants: a header with a glass button
 * (→ the workout-types manager), the 4 stat cards (total / most-popular / longest / participation), the
 * Workout Type Popularity ranked chart, and the tappable Lifestyle-timeline preview (→ the drill-down).
 * Admins additionally get a "View as" picker (global-admin → "None"/program-wide; program-admin → self by
 * default, or "Admin"/program-wide). Highest-participation is always program-wide. Faithful 1:1 to the iOS
 * tab; read-only (load errors swallowed on-screen — iOS F1).
 */
@Composable
fun LifestyleScreen(programContext: ProgramContext, onNavigate: (String) -> Unit) {
    val isAdmin = programContext.isProgramAdmin
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val programName = program?.name ?: ""
    val roster by programContext.members.collectAsStateWithLifecycle()
    val viewAsId by programContext.lifestyleViewAsId.collectAsStateWithLifecycle()
    val chosen by programContext.lifestyleViewAsChosen.collectAsStateWithLifecycle()
    val lifestyle by programContext.lifestyle.collectAsStateWithLifecycle()
    var showPicker by remember { mutableStateOf(false) }

    // Admins scope to the "View as" pick (null = program-wide); everyone else sees their own data.
    // Apply the admin default BEFORE the first load, in ONE coroutine, so a program-admin's first fetch is
    // already self-scoped — no brief program-wide flash. Mirrors iOS AdminWorkoutTypesTab.task (apply the
    // default, then load once). A second effect reloads only on a later, user-initiated "View as" change —
    // gated on loadedOnce so the initial default-set (which also moves viewAsId) doesn't double-fetch.
    val loadedOnce = remember(program?.id) { mutableStateOf(false) }
    LaunchedEffect(program?.id, isAdmin) {
        if (isAdmin) programContext.ensureLifestyleViewAsDefault()
        val memberId = if (isAdmin) programContext.lifestyleViewAsId.value else programContext.loggedInMemberId
        programContext.loadLifestyle(memberId)
        loadedOnce.value = true
    }
    LaunchedEffect(viewAsId) {
        if (isAdmin && loadedOnce.value) programContext.loadLifestyle(viewAsId)
    }

    val selected = roster.firstOrNull { it.id == viewAsId }
    val viewAsLabel = selected?.memberName
        ?: if (programContext.isGlobalAdmin) "Admin"
        else if (chosen) "Admin"
        else (programContext.loggedInMemberName ?: "Member")

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Header + workout-types manager button.
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

            if (isAdmin) {
                ViewAsRow(label = viewAsLabel, onClick = { showPicker = true })
            }

            // The 4 stat cards, 2×2.
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                WorkoutTypesTotalCard(total = lifestyle.totalTypes, modifier = Modifier.weight(1f))
                WorkoutTypeMostPopularCard(
                    name = lifestyle.mostPopular?.workoutName,
                    sessions = lifestyle.mostPopular?.sessions ?: 0,
                    modifier = Modifier.weight(1f),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                WorkoutTypeLongestDurationCard(
                    name = lifestyle.longestDuration?.workoutName,
                    avgMinutes = lifestyle.longestDuration?.avgMinutes ?: 0,
                    modifier = Modifier.weight(1f),
                )
                WorkoutTypeHighestParticipationCard(
                    name = lifestyle.highestParticipation?.workoutName,
                    participationPct = lifestyle.highestParticipation?.participationPct ?: 0.0,
                    modifier = Modifier.weight(1f),
                )
            }

            WorkoutTypePopularityCard(types = lifestyle.workoutTypes)

            LifestyleTimelinePreviewCard(
                timeline = lifestyle.timeline,
                onClick = { onNavigate(Routes.LIFESTYLE_TIMELINE) },
            )

            Spacer(Modifier.height(8.dp))
        }
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
