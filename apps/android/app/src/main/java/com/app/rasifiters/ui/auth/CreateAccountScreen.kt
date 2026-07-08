package com.app.rasifiters.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.AppLinks
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import kotlinx.coroutines.launch

private val GENDER_OPTIONS = listOf("Female", "Male", "Non-binary", "Prefer not to say")

/**
 * Public sign-up screen (iOS `CreateAccountView` / web `create-account`). Register → auto-login:
 * `register()` (`POST /auth/register`, no token) then `login(username, …)` for the session — the root
 * gate swaps on success. Inline email validation (D-C2), live password checklist (D-C3), muted
 * mismatch hint (D-C4) mirror the sibling clients.
 */
@Composable
fun CreateAccountScreen(programContext: ProgramContext, onSignIn: () -> Unit) {
    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var gender by remember { mutableStateOf("") }
    var genderExpanded by remember { mutableStateOf(false) }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var confirmVisible by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current

    val passwordPolicyMet = password.length >= 8 &&
        password.any { it.isUpperCase() } && password.any { it.isLowerCase() } && password.any { it.isDigit() }
    val canSubmit = firstName.isNotBlank() && lastName.isNotBlank() && username.isNotBlank() &&
        isEmailValid(email) && passwordPolicyMet && password == confirm

    errorMessage?.let { msg ->
        AlertDialog(
            onDismissRequest = { errorMessage = null },
            confirmButton = { TextButton(onClick = { errorMessage = null }) { Text("OK") } },
            title = { Text("Create Account") },
            text = { Text(msg) },
        )
    }

    AuthBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(top = 40.dp, bottom = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            BrandMark(sizeDp = 90)

            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Create Account", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Start tracking your fitness journey",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }

            AppTextField("First Name", firstName, { firstName = it })
            AppTextField("Last Name", lastName, { lastName = it })
            AppTextField("Username", username, { username = it })

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                AppTextField("Email", email, { email = it }, keyboardType = KeyboardType.Email)
                if (email.isNotEmpty() && !isEmailValid(email)) {
                    MutedHint("Enter a valid email address.")
                }
            }

            // Gender (optional) — sent as-is; the backend treats blank as absent (F5).
            Box(modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = gender,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Gender (optional)") },
                    trailingIcon = {
                        IconButton(onClick = { genderExpanded = !genderExpanded }) {
                            Icon(Icons.Filled.ArrowDropDown, contentDescription = "Select gender")
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                DropdownMenu(expanded = genderExpanded, onDismissRequest = { genderExpanded = false }) {
                    GENDER_OPTIONS.forEach { option ->
                        DropdownMenuItem(text = { Text(option) }, onClick = { gender = option; genderExpanded = false })
                    }
                }
            }

            AppPasswordField(
                "Password", password, { password = it }, passwordVisible,
                onToggleVisible = { passwordVisible = !passwordVisible },
            )
            AppPasswordField(
                "Confirm Password", confirm, { confirm = it }, confirmVisible,
                onToggleVisible = { confirmVisible = !confirmVisible },
            )

            Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (password.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        PolicyRow("At least 8 characters", password.length >= 8)
                        PolicyRow("An uppercase letter", password.any { it.isUpperCase() })
                        PolicyRow("A lowercase letter", password.any { it.isLowerCase() })
                        PolicyRow("A number", password.any { it.isDigit() })
                    }
                }
                if (confirm.isNotEmpty() && confirm != password) {
                    MutedHint("Passwords don't match.")
                }
            }

            PillButton(
                label = "Create Account",
                loading = loading,
                enabled = canSubmit,
                onClick = {
                    loading = true
                    scope.launch {
                        programContext.register(firstName, lastName, username, email, password, gender.ifBlank { null })
                            .onSuccess {
                                // No token from register — auto-login for the session (iOS F2 parity).
                                programContext.login(username, password)
                                    .onFailure { errorMessage = it.message ?: "Account created — please sign in." }
                            }
                            .onFailure { errorMessage = it.message ?: "Something went wrong." }
                        loading = false
                    }
                },
            )

            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "By creating an account, you accept our",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
                TextButton(onClick = { uriHandler.openUri(AppLinks.privacyPolicyUri.toString()) }) {
                    Text("Privacy Policy", color = AppOrange, style = MaterialTheme.typography.bodySmall)
                }
            }

            TextButton(onClick = onSignIn) {
                Text(
                    "Already have an account? Sign in",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
        }
    }
}

@Composable
private fun MutedHint(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        modifier = Modifier.fillMaxWidth(),
    )
}
