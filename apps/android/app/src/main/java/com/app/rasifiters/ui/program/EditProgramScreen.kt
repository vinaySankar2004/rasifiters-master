package com.app.rasifiters.ui.program

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.ui.auth.AppDropdownField
import com.app.rasifiters.ui.auth.AppTextField
import com.app.rasifiters.ui.summary.DatePillField
import com.app.rasifiters.ui.summary.DetailTopBar
import com.app.rasifiters.ui.summary.FormErrorText
import com.app.rasifiters.ui.summary.FormFieldLabel
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private val STATUS_OPTIONS = listOf("Active", "Planned", "Completed")
private val ISO: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")

/**
 * "Edit Program" — admin edit of name / status / start-end dates / admin-only-data-entry lock.
 * Faithful 1:1 to the iOS EditProgramInfoView (client date-range validation + no-op-save skip).
 */
@Composable
fun EditProgramScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    var name by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("active") }
    var startDate by remember { mutableStateOf(LocalDate.now()) }
    var endDate by remember { mutableStateOf(LocalDate.now()) }
    var adminOnly by remember { mutableStateOf(false) }
    var isSaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var loaded by remember { mutableStateOf(false) }

    LaunchedEffect(program?.id) {
        val p = program ?: return@LaunchedEffect
        name = p.name
        status = (p.status ?: "active").lowercase()
        startDate = parseProgramDate(p.startDate) ?: LocalDate.now()
        endDate = parseProgramDate(p.endDate) ?: LocalDate.now()
        adminOnly = p.adminOnlyDataEntry
        loaded = true
    }

    val dateError = if (!startDate.isBefore(endDate)) "End date must be after the start date." else null
    val canSave = name.trim().isNotEmpty() && dateError == null && !isSaving

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Edit Program")
            Column {
                Text("Edit Program", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Update program details",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }

            FormFieldLabel("Program name")
            AppTextField("e.g. Winter Fitness Challenge", name, { name = it })

            FormFieldLabel("Status")
            AppDropdownField(
                placeholder = "Select status",
                value = status.replaceFirstChar { it.uppercase() },
                options = STATUS_OPTIONS,
                onSelect = { status = it.lowercase() },
            )

            FormFieldLabel("Start date")
            DatePillField(date = startDate, onChange = { startDate = it }, allowFuture = true)

            FormFieldLabel("End date")
            DatePillField(date = endDate, onChange = { endDate = it }, allowFuture = true)

            // Admin-only data entry toggle card
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(programRowColor(), RoundedCornerShape(12.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Admin-only data entry",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f),
                    )
                    Switch(
                        checked = adminOnly,
                        onCheckedChange = { adminOnly = it },
                        colors = SwitchDefaults.colors(checkedTrackColor = AppOrange, checkedThumbColor = Color.White),
                    )
                }
                Text(
                    "When on, only admins can add, edit, or delete workouts and health logs. Loggers and members are blocked.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }

            dateError?.let { FormErrorText(it) }
            errorMessage?.let { FormErrorText(it) }

            Button(
                onClick = {
                    // Skip a no-op save (web/iOS parity).
                    val p = program
                    if (p != null && p.name == name && (p.status ?: "").lowercase() == status &&
                        parseProgramDate(p.startDate) == startDate && parseProgramDate(p.endDate) == endDate &&
                        p.adminOnlyDataEntry == adminOnly
                    ) { onBack(); return@Button }

                    isSaving = true; errorMessage = null
                    scope.launch {
                        programContext.updateProgram(name.trim(), status, startDate.format(ISO), endDate.format(ISO), adminOnly)
                            .onSuccess { onBack() }
                            .onFailure { errorMessage = it.message ?: "Couldn't update the program." }
                        isSaving = false
                    }
                },
                enabled = canSave,
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(
                    containerColor = AppOrange,
                    contentColor = Color.Black,
                    disabledContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest,
                ),
                modifier = Modifier.fillMaxWidth().height(50.dp),
            ) {
                if (isSaving) CircularProgressIndicator(strokeWidth = 2.dp, color = Color.Black, modifier = Modifier.padding(2.dp))
                else Text("Save changes", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            }
        }
    }
}
