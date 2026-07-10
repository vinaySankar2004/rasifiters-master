package com.app.rasifiters.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.AppLinks
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import kotlinx.coroutines.launch

private val GENDER_OPTIONS = listOf("Female", "Male", "Non-binary", "Prefer not to say")

/**
 * Public sign-up screen (iOS `CreateAccountView` / web `create-account`), now a **`HorizontalPager` wizard**.
 *
 * Two modes, driven by `ProgramContext.pendingSocial`:
 *  - **Email mode** (no pending social) — 3 pages: names → username+gender+email → password/confirm; then
 *    `register()` → auto-`login()` (register returns no token, so a login leg follows; the root gate swaps).
 *  - **Social mode** (a brand-new Google user's pending session) — 2 pages: names (prefilled, editable) →
 *    username+gender+**locked email** (from Google); no password page; then `completeSocial(...)` finishes the
 *    `POST /auth/oauth/complete` and the root gate swaps. Inline email validation (D-C2), live password
 *    checklist (D-C3), muted mismatch hint (D-C4) mirror the sibling clients.
 */
@Composable
fun CreateAccountScreen(programContext: ProgramContext, onSignIn: () -> Unit) {
    val pending by programContext.pendingSocial.collectAsStateWithLifecycle()
    val social = pending != null

    var firstName by remember(pending) { mutableStateOf(pending?.firstName ?: "") }
    var lastName by remember(pending) { mutableStateOf(pending?.lastName ?: "") }
    var username by remember { mutableStateOf("") }
    var email by remember(pending) { mutableStateOf(pending?.email ?: "") }
    var gender by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var confirmVisible by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current

    val pageCount = if (social) 2 else 3
    val pagerState = rememberPagerState(pageCount = { pageCount })

    val passwordPolicyMet = password.length >= 8 &&
        password.any { it.isUpperCase() } && password.any { it.isLowerCase() } && password.any { it.isDigit() }

    // Per-page Continue gate (final page also gates submit).
    fun canAdvance(page: Int): Boolean = when (page) {
        0 -> firstName.isNotBlank() && lastName.isNotBlank()
        1 -> username.isNotBlank() && isEmailValid(email)
        else -> passwordPolicyMet && password == confirm
    }
    val isLastPage = pagerState.currentPage == pageCount - 1

    fun submit() {
        loading = true
        scope.launch {
            if (social) {
                // POST /auth/oauth/complete — the root gate swaps on success (no explicit navigate, A-3).
                programContext.completeSocial(username, gender.ifBlank { null }, firstName, lastName)
                    .onFailure { errorMessage = it.message ?: "Something went wrong." }
            } else {
                programContext.register(firstName, lastName, username, email, password, gender.ifBlank { null })
                    .onSuccess {
                        // No token from register — auto-login for the session (iOS F2 parity).
                        programContext.login(username, password)
                            .onFailure { errorMessage = it.message ?: "Account created — please sign in." }
                    }
                    .onFailure { errorMessage = it.message ?: "Something went wrong." }
            }
            loading = false
        }
    }

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
                .statusBarsPadding()
                .padding(horizontal = 28.dp)
                .padding(top = 24.dp, bottom = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(24.dp))
            BrandMark(sizeDp = 84)
            Spacer(Modifier.height(16.dp))
            Text("Create Account", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(6.dp))
            Text(
                if (social) "Just a couple details to finish" else "Start tracking your fitness journey",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )

            Spacer(Modifier.height(20.dp))
            StepDots(current = pagerState.currentPage, total = pageCount)
            Spacer(Modifier.height(20.dp))

            // The wizard pages. Swipe is disabled — navigation is button-driven so each page's Continue gate
            // bites. Each page verticalScrolls as a short-device fallback (A-5).
            HorizontalPager(
                state = pagerState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                userScrollEnabled = false,
            ) { page ->
                Column(
                    modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    when (page) {
                        0 -> {
                            AppTextField("First Name", firstName, { firstName = it })
                            AppTextField("Last Name", lastName, { lastName = it })
                        }
                        1 -> {
                            AppTextField("Username", username, { username = it })
                            AppDropdownField(
                                placeholder = "Gender (optional)",
                                value = gender,
                                options = GENDER_OPTIONS,
                                onSelect = { gender = it },
                            )
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                AppTextField(
                                    "Email", email, { email = it },
                                    keyboardType = KeyboardType.Email,
                                    enabled = !social,
                                )
                                if (social) {
                                    MutedHint("Signed in with Google — your email is locked.")
                                } else if (email.isNotEmpty() && !isEmailValid(email)) {
                                    MutedHint("Enter a valid email address.")
                                }
                            }
                        }
                        else -> {
                            AppPasswordField(
                                "Password", password, { password = it }, passwordVisible,
                                onToggleVisible = { passwordVisible = !passwordVisible },
                            )
                            AppPasswordField(
                                "Confirm Password", confirm, { confirm = it }, confirmVisible,
                                onToggleVisible = { confirmVisible = !confirmVisible },
                            )
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (pagerState.currentPage > 0) {
                    PillButton(
                        label = "Back",
                        onClick = { scope.launch { pagerState.animateScrollToPage(pagerState.currentPage - 1) } },
                        modifier = Modifier.weight(1f),
                    )
                }
                PillButton(
                    label = if (isLastPage) "Create Account" else "Continue",
                    loading = loading,
                    enabled = canAdvance(pagerState.currentPage),
                    onClick = {
                        if (isLastPage) submit()
                        else scope.launch { pagerState.animateScrollToPage(pagerState.currentPage + 1) }
                    },
                    modifier = Modifier.weight(1f),
                )
            }

            Spacer(Modifier.height(12.dp))
            TextButton(
                onClick = { uriHandler.openUri(AppLinks.privacyPolicyUri.toString()) },
                contentPadding = androidx.compose.foundation.layout.PaddingValues(4.dp),
            ) {
                Text("Privacy Policy", color = AppOrange, style = MaterialTheme.typography.bodySmall)
            }
            TextButton(onClick = onSignIn, contentPadding = androidx.compose.foundation.layout.PaddingValues(4.dp)) {
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
