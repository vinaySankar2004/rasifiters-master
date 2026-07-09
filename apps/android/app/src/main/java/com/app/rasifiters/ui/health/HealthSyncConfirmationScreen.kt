package com.app.rasifiters.ui.health

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppRed
import com.app.rasifiters.health.PendingSyncConfirmation
import kotlinx.coroutines.launch

/**
 * First-time Health Connect sync confirmation — the Android analog of iOS `HealthSyncConfirmationView`.
 * One program per page: the rows that will be added (each a toggleable check, default on), with a top-right
 * tick that commits the current program's CHECKED rows and advances. The last page finishes the flow.
 *
 * Dismissing without finishing (system back) DEFERS — nothing is written for still-unconfirmed programs,
 * the integration stays connected, and the confirmation re-appears on the next sync trigger. Presented as
 * a full-screen overlay from RootScreen so it works no matter which screen triggered the sync.
 */
@Composable
fun HealthSyncConfirmationScreen(
    programContext: ProgramContext,
    confirmation: PendingSyncConfirmation,
    onFinished: (committed: Boolean) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val pages = confirmation.pages
    var pageIndex by remember { mutableIntStateOf(0) }
    var isCommitting by remember { mutableStateOf(false) }
    var retryNotice by remember { mutableStateOf<String?>(null) }

    val page = pages.getOrNull(pageIndex)
    val checks = remember(pageIndex) {
        mutableStateListOf(*(page?.rows?.map { it.isChecked } ?: emptyList()).toTypedArray())
    }
    val checkedCount = checks.count { it }

    // System back = defer (nothing lost).
    BackHandler { onFinished(false) }

    val flowTitle = when (confirmation.flow) {
        PendingSyncConfirmation.Flow.WORKOUTS -> "Confirm Workouts"
        PendingSyncConfirmation.Flow.SLEEP -> "Confirm Sleep"
        PendingSyncConfirmation.Flow.STEPS -> "Confirm Steps"
    }

    fun confirmCurrentPage() {
        val current = pages.getOrNull(pageIndex) ?: return
        val committedPage = current.copy(
            rows = current.rows.mapIndexed { i, r -> r.copy(isChecked = checks.getOrElse(i) { r.isChecked }) },
        )
        scope.launch {
            isCommitting = true; retryNotice = null
            val ok = when (confirmation.flow) {
                PendingSyncConfirmation.Flow.WORKOUTS -> programContext.health.commitWorkoutPage(committedPage)
                PendingSyncConfirmation.Flow.SLEEP -> programContext.health.commitSleepPage(committedPage)
                PendingSyncConfirmation.Flow.STEPS -> programContext.health.commitStepsPage(committedPage)
            }
            isCommitting = false
            if (!ok) {
                retryNotice = "Couldn't reach the server. Check your connection and tap the tick again."
                return@launch
            }
            if (pageIndex >= pages.size - 1) onFinished(true) else pageIndex++
        }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(modifier = Modifier.fillMaxSize().statusBarsPadding()) {
            // Top bar: title + tick.
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(flowTitle, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Box(
                    modifier = Modifier.size(40.dp).background(AppOrange, CircleShape)
                        .clickable(enabled = !isCommitting) { confirmCurrentPage() },
                    contentAlignment = Alignment.Center,
                ) {
                    if (isCommitting) CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp), color = androidx.compose.ui.graphics.Color.White)
                    else Icon(Icons.Filled.Check, contentDescription = "Confirm", tint = androidx.compose.ui.graphics.Color.White)
                }
            }

            if (page == null) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                return@Column
            }

            // Page header.
            Column(
                modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(page.programName, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                Text("$checkedCount of ${page.rows.size} will be added", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                if (pages.size > 1) {
                    Text("Program ${pageIndex + 1} of ${pages.size}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.45f))
                }
            }

            Column(modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState())) {
                page.rows.forEachIndexed { i, row ->
                    val isChecked = checks.getOrElse(i) { row.isChecked }
                    Row(
                        modifier = Modifier.fillMaxWidth()
                            .clickable { if (i < checks.size) checks[i] = !checks[i] }
                            .padding(horizontal = 20.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Icon(
                            if (isChecked) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
                            contentDescription = null,
                            tint = if (isChecked) AppOrange else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f),
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(row.title, style = MaterialTheme.typography.bodyLarge)
                            Text(row.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                        }
                    }
                }
            }

            if (retryNotice != null) {
                Text(
                    retryNotice!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = AppRed,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
                )
            }
        }
    }
}
