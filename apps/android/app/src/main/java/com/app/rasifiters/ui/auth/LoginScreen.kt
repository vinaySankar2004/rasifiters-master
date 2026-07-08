package com.app.rasifiters.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.AppLinks
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import kotlinx.coroutines.launch

/**
 * Public sign-in screen (iOS `LoginView` / web `login`). Username-or-email + password → `login()`
 * (`POST /auth/login/app`); on success the root gate swaps to the app shell. Also the entry to
 * recovery ("Forgot your password?" → [ForgotPasswordScreen]) and sign-up (→ [CreateAccountScreen]).
 */
@Composable
fun LoginScreen(
    programContext: ProgramContext,
    onCreateAccount: () -> Unit,
    onForgotPassword: () -> Unit,
) {
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current

    errorMessage?.let { msg ->
        AlertDialog(
            onDismissRequest = { errorMessage = null },
            confirmButton = { TextButton(onClick = { errorMessage = null }) { Text("OK") } },
            title = { Text("Login") },
            text = { Text(msg) },
        )
    }

    AuthBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(top = 60.dp, bottom = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            BrandMark(sizeDp = 90)

            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Welcome Back", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Login to access your fitness dashboard",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }

            AppTextField("Username or Email", identifier, { identifier = it })
            AppPasswordField(
                "Password", password, { password = it }, passwordVisible,
                onToggleVisible = { passwordVisible = !passwordVisible },
            )

            PillButton(
                label = "Login",
                loading = loading,
                enabled = identifier.isNotEmpty() && password.isNotEmpty(),
                onClick = {
                    loading = true
                    scope.launch {
                        programContext.login(identifier, password)
                            .onFailure { errorMessage = it.message ?: "Something went wrong." }
                        loading = false
                    }
                },
            )

            TextButton(onClick = onForgotPassword) {
                Text("Forgot your password?", color = AppOrange, style = MaterialTheme.typography.bodySmall)
            }

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    "New here?",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
                TextButton(onClick = onCreateAccount, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                    Text("Create an account", color = AppOrange, style = MaterialTheme.typography.bodySmall)
                }
            }

            Spacer(Modifier.height(4.dp))

            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "Training hard? Login to track your progress.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
                TextButton(onClick = { uriHandler.openUri(AppLinks.privacyPolicyUri.toString()) }) {
                    Text("Privacy Policy", color = AppOrange, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
