package com.app.rasifiters.ui.members

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppYellow
import com.app.rasifiters.ui.summary.BarLineChart
import com.app.rasifiters.ui.summary.CircleBackButton
import com.app.rasifiters.ui.summary.DetailTopBar
import com.app.rasifiters.ui.summary.axisLabels
import kotlin.math.roundToInt

// The two read-only Members detail leaves — Streak Stats + Workout History. Both scoped to the focused
// member (ProgramContext.focusedMemberId, set by the tab before push). Faithful to member-streaks-detail
// (tiles + milestone ladder, ✓ achieved affordance D-C2) + the member branch of the iOS activity-timeline
// detail (W/M/Y/P single-series chart, resets to week on leave).

// ---- Streak Stats detail ----

@Composable
fun MemberStreakDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val streaks by programContext.memberStreaks.collectAsStateWithLifecycle()
    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Streak Stats")
            val s = streaks
            if (s == null) {
                Text("No streak data.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            } else {
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

private data class HPeriod(val key: String, val short: String, val range: String)

private val HISTORY_PERIODS = listOf(
    HPeriod("week", "W", "This Week"),
    HPeriod("month", "M", "This Month"),
    HPeriod("year", "Y", "This Year"),
    HPeriod("program", "P", "Program to date"),
)

@Composable
fun MemberHistoryDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val memberId by programContext.focusedMemberId.collectAsStateWithLifecycle()
    var period by remember { mutableStateOf(HISTORY_PERIODS.first()) }
    var buckets by remember { mutableStateOf<List<com.app.rasifiters.net.MemberHistoryPoint>>(emptyList()) }
    var dailyAverage by remember { mutableStateOf(0.0) }
    var serverLabel by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(period.key, memberId) {
        val id = memberId ?: return@LaunchedEffect
        loading = true
        programContext.loadMemberHistory(id, period.key).onSuccess { resp ->
            buckets = resp.buckets
            dailyAverage = resp.dailyAverage
            serverLabel = resp.label
        }
        loading = false
    }

    val rangeLabel = if (period.key == "week") "This Week" else serverLabel.ifBlank { period.range }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Workout History")
            Column {
                Text("Workout Activity Timeline", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("Workouts", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }
            HistoryPeriodSelector(selected = period, onSelect = { period = it })
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
                Text(dailyAverage.roundToInt().toString(), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = AppOrange)
            }
            when {
                loading -> Box(modifier = Modifier.fillMaxWidth().height(360.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = AppOrange) }
                buckets.isEmpty() -> Box(modifier = Modifier.fillMaxWidth().height(360.dp), contentAlignment = Alignment.Center) {
                    Text("No data for this range yet.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                }
                else -> BarLineChart(
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

@Composable
private fun HistoryPeriodSelector(selected: HPeriod, onSelect: (HPeriod) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(11.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        HISTORY_PERIODS.forEach { p ->
            val active = p.key == selected.key
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (active) MaterialTheme.colorScheme.surfaceContainerHighest else androidx.compose.ui.graphics.Color.Transparent)
                    .clickable { onSelect(p) }
                    .padding(vertical = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    p.short,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                    color = if (active) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
        }
    }
}
