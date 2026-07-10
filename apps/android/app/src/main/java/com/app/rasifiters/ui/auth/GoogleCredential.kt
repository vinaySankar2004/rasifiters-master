package com.app.rasifiters.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.app.rasifiters.BuildConfig
import com.app.rasifiters.R
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch

/**
 * "Continue with Google" — a custom dark pill (a sibling of the auth [PillButton], one emphasis step
 * lower) that runs Credential Manager on tap and hands the resulting Google id_token to [onIdToken].
 * Chrome mirrors the shared auth primitives so it reads as part of the form: the pill shape + height of
 * [PillButton] (`CircleShape`, 48dp, capped 260dp) with the fill + hairline border of [AppTextField]
 * (theme background surface + a `onSurface` alpha-0.22 border). Content is the multicolor Google "G"
 * (18dp, untinted) + "Continue with Google" in SemiBold on-surface text. The API exchange lives upstream
 * (`ProgramContext.socialSignIn`); this composable only acquires the token. `serverClientId` is the
 * non-secret Google OAuth **web** client id (`BuildConfig.GOOGLE_WEB_CLIENT_ID`), the audience the backend
 * verifies against. A user-cancelled sheet is silent; any real failure surfaces via [onError].
 */
@Composable
fun GoogleSignInButton(
    onIdToken: (String) -> Unit,
    onError: (String) -> Unit,
    enabled: Boolean = true,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val scheme = MaterialTheme.colorScheme
    // Mirror AppTextField's chrome: transparent-over-background surface + the same 0.22 hairline border.
    val contentColor = if (enabled) scheme.onSurface else scheme.onSurface.copy(alpha = 0.5f)
    val borderColor = scheme.onSurface.copy(alpha = if (enabled) 0.22f else 0.12f)

    Row(
        modifier = Modifier
            .widthIn(max = 260.dp)
            .fillMaxWidth()
            .height(48.dp)
            .clip(CircleShape)
            .background(scheme.background)
            .border(1.dp, borderColor, CircleShape)
            .clickable(enabled = enabled) {
                scope.launch {
                    try {
                        val credentialManager = CredentialManager.create(context)
                        val googleIdOption = GetGoogleIdOption.Builder()
                            .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
                            .setFilterByAuthorizedAccounts(false)
                            .build()
                        val request = GetCredentialRequest.Builder()
                            .addCredentialOption(googleIdOption)
                            .build()
                        val result = credentialManager.getCredential(context, request)
                        val idToken = GoogleIdTokenCredential.createFrom(result.credential.data).idToken
                        onIdToken(idToken)
                    } catch (_: GetCredentialCancellationException) {
                        // User dismissed the account-picker sheet — not an error, stay silent.
                    } catch (e: Exception) {
                        onError(e.message ?: "Google sign-in failed.")
                    }
                }
            },
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(R.drawable.ic_google_g),
            contentDescription = null,
            tint = Color.Unspecified,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(10.dp))
        Text(
            "Continue with Google",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = contentColor,
        )
    }
}
