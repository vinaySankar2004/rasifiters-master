package com.app.rasifiters.ui.auth

import android.content.Context
import android.util.Base64
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import com.app.rasifiters.BuildConfig
import com.app.rasifiters.R
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import kotlinx.coroutines.launch
import java.security.MessageDigest
import java.security.SecureRandom
import kotlin.coroutines.cancellation.CancellationException

/** A Google ID token + the raw nonce whose SHA-256 hex Google embedded in it (W5 §7.3; /auth/oauth + /auth/link re-hash it). */
data class GoogleIdResult(val idToken: String, val rawNonce: String)

/** A Credential Manager failure mapped to a human message + a short SDK code for auth.sign_in_failed. */
class GoogleSignInException(val userMessage: String, val code: String) : Exception(userMessage)

private const val MSG_NO_ACCOUNT = "No Google account is available on this device. Add one in Settings, then try again."
private const val MSG_PLAY_SERVICES = "Google sign-in isn't available right now. Update Google Play services and try again."
private const val MSG_UNSUPPORTED = "Google sign-in isn't supported on this device."
private const val MSG_INTERRUPTED = "Google sign-in was interrupted. Try again."
private const val MSG_GENERIC = "Google sign-in failed. Try again."

/**
 * "Continue with Google" — a custom dark pill (a sibling of the auth [PillButton], one emphasis step
 * lower) that runs Credential Manager on tap and hands the resulting Google id_token + raw nonce to [onResult].
 * Chrome mirrors the shared auth primitives so it reads as part of the form: the pill shape + height of
 * [PillButton] (`CircleShape`, 48dp, capped 260dp) with the fill + hairline border of [AppTextField]
 * (theme background surface + a `onSurface` alpha-0.22 border). Content is the multicolor Google "G"
 * (18dp, untinted) + "Continue with Google" in SemiBold on-surface text. The API exchange lives upstream
 * (`ProgramContext.socialSignIn`). A user-cancelled sheet is silent; a real failure surfaces via [onError] with a
 * human message; it shows a spinner and stays disabled until [onResult] (the caller's sign-in) finishes (polish #21).
 */
@Composable
fun GoogleSignInButton(
    onResult: suspend (GoogleIdResult) -> Unit,
    onError: (GoogleSignInException) -> Unit,
    enabled: Boolean = true,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val scheme = MaterialTheme.colorScheme
    var inFlight by remember { mutableStateOf(false) }
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
            .clickable(enabled = enabled && !inFlight, onClickLabel = "Continue with Google", role = Role.Button) {
                inFlight = true
                scope.launch {
                    try {
                        onResult(fetchGoogleIdToken(context))
                    } catch (_: GetCredentialCancellationException) {
                        // User dismissed the account-picker sheet — not an error, stay silent.
                    } catch (e: GoogleSignInException) {
                        onError(e)
                    } finally {
                        inFlight = false
                    }
                }
            },
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (inFlight) {
            // Polish #21: busy until the caller's sign-in finishes — no second tap.
            CircularProgressIndicator(strokeWidth = 2.dp, color = scheme.onSurface, modifier = Modifier.size(18.dp))
        } else {
            Icon(
                painter = painterResource(R.drawable.ic_google_g),
                contentDescription = null,
                tint = Color.Unspecified,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(10.dp))
            Text("Continue with Google", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = contentColor)
        }
    }
}

/** Google's button flow (GetSignInWithGoogleOption) with a fresh nonce — the sign-in button + the account-settings LINK
 *  flow. User cancel → GetCredentialCancellationException (callers stay silent); coroutine cancellation rethrown; one
 *  automatic retry on Interrupted; everything else → GoogleSignInException. */
suspend fun fetchGoogleIdToken(context: Context): GoogleIdResult {
    val rawNonce = newRawNonce()
    val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID).setNonce(sha256Hex(rawNonce)).build()
    val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
    val manager = CredentialManager.create(context)
    var retried = false
    while (true) {
        try {
            val result = manager.getCredential(context, request)
            return GoogleIdResult(GoogleIdTokenCredential.createFrom(result.credential.data).idToken, rawNonce)
        } catch (e: CancellationException) {
            throw e
        } catch (e: GetCredentialCancellationException) {
            throw e
        } catch (e: GetCredentialInterruptedException) {
            if (!retried) { retried = true; continue }
            throw GoogleSignInException(MSG_INTERRUPTED, "interrupted")
        } catch (e: NoCredentialException) {
            throw GoogleSignInException(MSG_NO_ACCOUNT, "no_credential")
        } catch (e: GetCredentialProviderConfigurationException) {
            throw GoogleSignInException(MSG_PLAY_SERVICES, "provider_configuration")
        } catch (e: GetCredentialUnsupportedException) {
            throw GoogleSignInException(MSG_UNSUPPORTED, "unsupported")
        } catch (e: GetCredentialException) {
            throw GoogleSignInException(MSG_GENERIC, e.type.takeLast(64))
        } catch (e: GoogleIdTokenParsingException) {
            throw GoogleSignInException(MSG_GENERIC, "token_parsing")
        } catch (e: Exception) {
            throw GoogleSignInException(MSG_GENERIC, "unknown")
        }
    }
}

private fun newRawNonce(): String {
    val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
    return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
}

private fun sha256Hex(value: String): String =
    MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
