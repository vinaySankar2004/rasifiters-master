package com.app.rasifiters.ui.summary

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppPurple
import com.app.rasifiters.ui.components.kit.KitLoad
import com.app.rasifiters.ui.components.kit.rememberLoad
import kotlin.math.roundToInt

/**
 * The Workout Activity Timeline drill-down (iOS `ActivityTimelineDetailView`). Period-switchable
 * (W/M/Y/P), re-fetching the timeline on each change; a daily-average header + the workouts bars /
 * active-members line chart. Read-only analytics (activity-detail §7 — `admin_only_data_entry` N/A).
 */
@Composable
fun ActivityDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    var period by remember { mutableStateOf(PERIODS.first()) }
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    // Polish #29/#34: one load per period — a switch starts from Loading, so the old period's bars never sit under the
    // new label, and a failure shows ErrorView + Retry (not "No data for this range").
    val load = rememberLoad(period.key, programContext.isOnline) { programContext.loadActivityTimeline(period.key) }
    val data = load.state.dataOrNull

    // Week uses a friendly fixed label; month/year/program use the server's range label (iOS parity).
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
            CircleBackButton(onBack)
            Column {
                Text("Workout Activity Timeline", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Workouts · Active members",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
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
                    data?.let { formatAverage(it.dailyAverage) } ?: "\u2014",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = AppOrange,
                )
            }

            KitLoad(load.state, online, onRetry = load::reload, boxModifier = Modifier.fillMaxWidth().height(360.dp)) { resp ->
                val points = resp.buckets
                if (points.isEmpty()) {
                    ChartCenter { EmptyText("No data for this range yet.") }
                } else {
                    BarLineChart(
                        values = points.map { it.workouts },
                        labels = axisLabels(points.map { it.label }, period.key),
                        lineValues = points.map { it.activeMembers },
                        barColor = AppOrange,
                        lineColor = AppPurple,
                        barWidth = 14.dp,
                        modifier = Modifier.fillMaxWidth().height(360.dp),
                        tooltip = { i ->
                            val p = points[i]
                            TooltipData(
                                title = calloutTitle(p.date, p.label),
                                rows = listOf(
                                    TooltipRow("${p.workouts} ${plural(p.workouts, "workout")}", AppOrange),
                                    TooltipRow("${p.activeMembers} active", AppPurple),
                                ),
                            )
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun ChartCenter(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxWidth().height(360.dp), contentAlignment = Alignment.Center) { content() }
}

@Composable
internal fun EmptyText(text: String) {
    Text(text, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
}

/** iOS `HeaderStats` shows the daily average as a whole number (6 / 2 / 1 / 4). */
private fun formatAverage(v: Double): String = v.roundToInt().toString()

/** Callout title: format the bucket's ISO date as "MMM d" (e.g. Jul 8); fall back to the bucket label. */
private fun calloutTitle(iso: String, fallback: String): String =
    runCatching { java.time.LocalDate.parse(iso.take(10)).format(java.time.format.DateTimeFormatter.ofPattern("MMM d")) }
        .getOrElse { fallback.ifBlank { "—" } }

internal fun plural(n: Int, noun: String): String = if (n == 1) noun else "${noun}s"
