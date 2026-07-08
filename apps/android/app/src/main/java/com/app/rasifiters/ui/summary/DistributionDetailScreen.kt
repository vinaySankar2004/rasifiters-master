package com.app.rasifiters.ui.summary

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppPurple

private val DAY_FULL = listOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")

/**
 * The Workout Distribution by Day drill-down (iOS `DistributionByDayDetailView`). 7 weekday bars
 * (Sun→Sat), all-time, program-wide. Reads the counts already loaded by the Summary tab; the empty state
 * is keyed off the SUM of the 7 counts (the endpoint always returns 7 keys — distribution-detail D-C1).
 * Read-only analytics (§7 — `admin_only_data_entry` N/A).
 */
@Composable
fun DistributionDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val summary by programContext.summary.collectAsStateWithLifecycle()
    val counts = summary.distribution?.ordered() ?: emptyList()
    val hasData = counts.sum() > 0

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            CircleBackButton(onBack)
            Column {
                Text("Workout Distribution by Day", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Workouts",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }

            if (!hasData) {
                Box(modifier = Modifier.fillMaxWidth().height(360.dp), contentAlignment = Alignment.Center) {
                    EmptyText("No workouts logged yet.")
                }
            } else {
                BarLineChart(
                    values = counts,
                    labels = DAY_SHORT,
                    lineValues = null,
                    barColor = AppOrange,
                    lineColor = AppPurple,
                    barWidth = 18.dp,
                    modifier = Modifier.fillMaxWidth().height(360.dp),
                    tooltip = { i -> TooltipData(DAY_FULL[i], listOf(TooltipRow("${counts[i]} ${plural(counts[i], "workout")}", AppOrange))) },
                )
            }
        }
    }
}
