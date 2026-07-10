package com.app.rasifiters.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.AppLinks
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange
import kotlinx.coroutines.launch

/**
 * Native reset-request screen (iOS `ForgotPasswordView` / web `forgot-password`) — step 1 of recovery.
 * Enter email → `forgotPassword()` (`POST /auth/forgot-password`); always shows the same generic
 * confirmation (no account enumeration). The always-visible "Contact us" mailto fallback serves migrated
 * no-email accounts. The set-new-password step still completes on the web reset-password page.
 */
@Composable
fun ForgotPasswordScreen(programContext: ProgramContext, onBackToLogin: () -> Unit) {
    var email by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var submitted by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current

    AuthScaffold {
        BrandMark(sizeDp = 64)
        Spacer(Modifier.height(16.dp))

        Text("Reset your password", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text(
            "Enter your email and we'll send you a link to reset it.",
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )

        Spacer(Modifier.height(20.dp))
        if (submitted) {
            Text(
                text = "If an account with that email exists, we've sent a password reset link. " +
                    "Check your inbox (and your spam folder).",
                style = MaterialTheme.typography.bodyMedium,
                color = AppGreen,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(AppGreen.copy(alpha = 0.12f), RoundedCornerShape(16.dp))
                    .padding(16.dp),
            )
        } else {
            Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                AppTextField("Email", email, { email = it }, keyboardType = KeyboardType.Email)
                if (email.isNotEmpty() && !isEmailValid(email)) {
                    Text(
                        "Enter a valid email address.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                errorMessage?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFFD32F2F),
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            Spacer(Modifier.height(20.dp))
            PillButton(
                label = "Send reset link",
                loading = loading,
                enabled = isEmailValid(email),
                onClick = {
                    loading = true
                    errorMessage = null
                    scope.launch {
                        programContext.forgotPassword(email.trim())
                            .onSuccess { submitted = true }
                            .onFailure {
                                errorMessage =
                                    "We couldn't send the reset email just now. Please try again, or contact us below."
                            }
                        loading = false
                    }
                },
            )
        }

        // Always-visible contact fallback — for migrated no-email accounts that can't receive an email.
        Spacer(Modifier.height(16.dp))
        Text(
            "No email on your account?",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )
        TextButton(
            onClick = { uriHandler.openUri(AppLinks.supportMailtoUri.toString()) },
            contentPadding = androidx.compose.foundation.layout.PaddingValues(4.dp),
        ) {
            Text(
                "Contact us and we'll help you get back in.",
                style = MaterialTheme.typography.bodySmall,
                color = AppOrange,
                textAlign = TextAlign.Center,
            )
        }

        Spacer(Modifier.height(8.dp))
        TextButton(onClick = onBackToLogin, contentPadding = androidx.compose.foundation.layout.PaddingValues(4.dp)) {
            Text("Back to login", color = AppOrange, style = MaterialTheme.typography.bodySmall)
        }
    }
}
