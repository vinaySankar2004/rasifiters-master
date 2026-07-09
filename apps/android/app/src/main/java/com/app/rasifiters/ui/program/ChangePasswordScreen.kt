package com.app.rasifiters.ui.program

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppRed
import com.app.rasifiters.ui.auth.AppPasswordField
import com.app.rasifiters.ui.auth.AppTextField
import com.app.rasifiters.ui.auth.PillButton
import com.app.rasifiters.ui.auth.PolicyRow
import com.app.rasifiters.ui.summary.DetailTopBar
import com.app.rasifiters.ui.summary.FormErrorText
import com.app.rasifiters.ui.summary.FormFieldLabel
import kotlinx.coroutines.launch

/**
 * "Change Password" — new + confirm password with the web-parity live 5-rule policy checklist.
 * Faithful 1:1 to the iOS ChangePasswordView. On success, a confirmation dialog pops back.
 */
@Composable
fun ChangePasswordScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var visible by remember { mutableStateOf(false) }
    var isSaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showSuccess by remember { mutableStateOf(false) }

    fun matches(re: String) = Regex(re).containsMatchIn(newPassword)
    val meetsPolicy = newPassword.length >= 8 && matches("[A-Z]") && matches("[a-z]") && matches("[0-9]")
    val isValid = meetsPolicy && newPassword == confirmPassword && confirmPassword.isNotEmpty()

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Change Password")
            Column {
                Text("Change Password", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Enter your new password",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }

            FormFieldLabel("New password")
            AppPasswordField("••••••••", newPassword, { newPassword = it }, visible, { visible = !visible })
            FormFieldLabel("Confirm password")
            AppTextField("••••••••", confirmPassword, { confirmPassword = it }, visualTransformation = PasswordVisualTransformation())

            if (newPassword.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    PolicyRow("At least 8 characters", newPassword.length >= 8)
                    PolicyRow("An uppercase letter", matches("[A-Z]"))
                    PolicyRow("A lowercase letter", matches("[a-z]"))
                    PolicyRow("A number", matches("[0-9]"))
                }
            }
            if (confirmPassword.isNotEmpty() && newPassword != confirmPassword) {
                Text("Passwords do not match", style = MaterialTheme.typography.bodySmall, color = AppRed)
            }
            errorMessage?.let { FormErrorText(it) }

            PillButton(
                label = "Update Password",
                onClick = {
                    isSaving = true; errorMessage = null
                    scope.launch {
                        programContext.changePassword(newPassword)
                            .onSuccess { showSuccess = true }
                            .onFailure { errorMessage = it.message ?: "Couldn't change your password." }
                        isSaving = false
                    }
                },
                modifier = Modifier.align(Alignment.CenterHorizontally),
                enabled = isValid && !isSaving,
                loading = isSaving,
            )
        }
    }

    if (showSuccess) {
        AlertDialog(
            onDismissRequest = { showSuccess = false; onBack() },
            title = { Text("Password Updated") },
            text = { Text("Your password has been changed successfully") },
            confirmButton = { TextButton(onClick = { showSuccess = false; onBack() }) { Text("OK") } },
        )
    }
}
