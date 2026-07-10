package com.app.rasifiters.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
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

    AuthScaffold {
        BrandMark(sizeDp = 88)
        Spacer(Modifier.height(24.dp))

        Text("Welcome Back", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text(
            "Login to access your fitness dashboard",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )

        Spacer(Modifier.height(30.dp))
        Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            AppTextField("Username or Email", identifier, { identifier = it })
            AppPasswordField(
                "Password", password, { password = it }, passwordVisible,
                onToggleVisible = { passwordVisible = !passwordVisible },
            )
        }

        Spacer(Modifier.height(24.dp))
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

        Spacer(Modifier.height(20.dp))
        // "or" divider + social sign-in (Continue with Google). A needs-profile success routes to the
        // create-account wizard's social branch; an existing-member success flips the root gate automatically.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.widthIn(max = 260.dp).fillMaxWidth(),
        ) {
            HorizontalDivider(modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.2f))
            Text(
                "or",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                modifier = Modifier.padding(horizontal = 12.dp),
            )
            HorizontalDivider(modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.2f))
        }
        Spacer(Modifier.height(16.dp))
        GoogleSignInButton(
            onIdToken = { idToken ->
                scope.launch {
                    programContext.socialSignIn(idToken)
                        .onSuccess { needsProfile -> if (needsProfile) onCreateAccount() }
                        .onFailure { errorMessage = it.message ?: "Sign-in failed" }
                }
            },
            onError = { errorMessage = it },
        )

        Spacer(Modifier.height(16.dp))
        TextButton(onClick = onForgotPassword, contentPadding = androidx.compose.foundation.layout.PaddingValues(4.dp)) {
            Text("Forgot your password?", color = AppOrange, style = MaterialTheme.typography.bodySmall)
        }

        Spacer(Modifier.height(6.dp))
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

        Spacer(Modifier.height(28.dp))
        Text(
            "Training hard? Login to track your progress.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )
        TextButton(onClick = { uriHandler.openUri(AppLinks.privacyPolicyUri.toString()) }, contentPadding = androidx.compose.foundation.layout.PaddingValues(4.dp)) {
            Text("Privacy Policy", color = AppOrange, style = MaterialTheme.typography.bodySmall)
        }
    }
}
