package com.app.rasifiters.ui.members

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import com.app.rasifiters.core.MemberCardKey
import com.app.rasifiters.core.MemberCardPart
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppYellow
import com.app.rasifiters.net.MemberHistoryResponse
import com.app.rasifiters.net.MemberStreaksResponse
import com.app.rasifiters.ui.components.kit.KitLoad
import com.app.rasifiters.ui.components.kit.rememberLoad
import com.app.rasifiters.ui.summary.BarLineChart
import com.app.rasifiters.ui.summary.CircleBackButton
import com.app.rasifiters.ui.summary.DetailTopBar
import com.app.rasifiters.ui.summary.PERIODS
import com.app.rasifiters.ui.summary.PeriodSelector
import com.app.rasifiters.ui.summary.axisLabels
import java.util.Locale

// The two read-only Members detail leaves — Streak Stats + Workout History. Both scoped to the focused
// member (ProgramContext.focusedMemberId, set by the tab before push). Faithful to member-streaks-detail
// (tiles + milestone ladder, ✓ achieved affordance D-C2) + the member branch of the iOS activity-timeline
// detail (W/M/Y/P single-series chart; the detail keeps its own result, polish #34).

// ---- Streak Stats detail ----

@Composable
fun MemberStreakDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val memberId by programContext.focusedMemberId.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    // Polish #29: the detail loads its member's streaks itself — a failure shows ErrorView + Retry, never "No streak data."
    // It opens on the card's numbers only when they are THIS member's (S5's held key), and refreshes underneath.
    val load = rememberLoad<MemberStreaksResponse>(
        memberId, programContext.isOnline,
        initial = {
            val pid = programContext.activeProgram.value?.id
            val held = programContext.memberCardsHeld.value[MemberCardPart.STREAKS]
            val seed = programContext.memberStreaks.value
            if (pid != null && seed != null && held == MemberCardKey(pid, memberId)) UiState.fresh(seed) else UiState.Loading
        },
    ) {
        val id = memberId ?: return@rememberLoad Result.failure(IllegalStateException("No member selected."))
        programContext.loadMemberStreaks(id)
    }
    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())   // polish #26
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Streak Stats")
            KitLoad(load.state, online, onRetry = load::reload, boxModifier = Modifier.fillMaxWidth().height(200.dp)) { s ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StreakTile(Icons.Filled.LocalFireDepartment, AppOrange, "Current", "${s.currentStreakDays} days", Modifier.weight(1f))
                    StreakTile(Icons.Filled.EmojiEvents, AppYellow, "Longest", "${s.longestStreakDays} days", Modifier.weight(1f))
                }
                Text("Milestones", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                MilestoneChips(s.milestones.map { it.dayValue to it.achieved })
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MilestoneChips(items: List<Pair<Int, Boolean>>) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items.forEach { (day, achieved) ->
            val bg = if (achieved) AppOrange.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surfaceVariant
            val fg = if (achieved) AppOrange else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
            var m = Modifier.clip(RoundedCornerShape(10.dp)).background(bg)
            if (achieved) m = m.border(1.dp, AppOrange.copy(alpha = 0.4f), RoundedCornerShape(10.dp))
            Row(
                modifier = m.padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                if (achieved) Icon(Icons.Filled.Check, contentDescription = null, tint = AppOrange, modifier = Modifier.height(14.dp))
                Text("${day}d", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = fg)
            }
        }
    }
}

// ---- Workout History detail (per-member, W/M/Y/P single series) ----

@Composable
fun MemberHistoryDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val memberId by programContext.focusedMemberId.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    var period by remember { mutableStateOf(PERIODS.first()) }
    // Polish #29/#34: one load per (period, member), kept by this screen — never written into the Members-tab card (so no
    // reset-to-week on leave), never the old period's bars under the new label, ErrorView + Retry on failure.
    val load = rememberLoad<MemberHistoryResponse>(period.key to memberId, programContext.isOnline) {
        val id = memberId ?: return@rememberLoad Result.failure(IllegalStateException("No member selected."))
        programContext.loadMemberHistory(id, period.key, publish = false)
    }
    val data = load.state.dataOrNull
    val rangeLabel = if (period.key == "week") "This Week" else data?.label?.ifBlank { null } ?: period.range

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())   // polish #26
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Workout History")
            Column {
                Text("Workout Activity Timeline", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("Workouts", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }
            PeriodSelector(selected = period, onSelect = { period = it })
            Column {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "DAILY AVERAGE",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
                        modifier = Modifier.alignByBaseline(),
                    )
                    Text(rangeLabel, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.alignByBaseline())
                }
                Text(
                    data?.let { String.format(Locale.US, "%.1f", it.dailyAverage) } ?: "\u2014",  // A4
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = AppOrange,
                )
            }
            KitLoad(load.state, online, onRetry = load::reload, boxModifier = Modifier.fillMaxWidth().height(360.dp)) { resp ->
                val buckets = resp.buckets
                if (buckets.isEmpty()) {
                    Box(modifier = Modifier.fillMaxWidth().height(360.dp), contentAlignment = Alignment.Center) {
                        Text("No data for this range yet.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    }
                } else {
                    BarLineChart(
                        values = buckets.map { it.workouts },
                        labels = axisLabels(buckets.map { it.label }, period.key),
                        lineValues = null,
                        barColor = AppOrange,
                        lineColor = AppOrange,
                        barWidth = 14.dp,
                        modifier = Modifier.fillMaxWidth().height(360.dp),
                        tooltip = { i -> memberWorkoutsTooltip(buckets[i].date, buckets[i].label, buckets[i].workouts) },
                    )
                }
            }
        }
    }
}
