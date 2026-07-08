package com.app.rasifiters.ui.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.app.rasifiters.R
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange

/** Loose email-format check — mirrors the web/iOS regex (D-C2). */
private val EMAIL_RE = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

fun isEmailValid(email: String): Boolean = EMAIL_RE.matches(email.trim())

/**
 * Subtle branded gradient behind every auth screen — the analog of the iOS `AppGradient.background`.
 * A faint orange wash at the top fading into the theme background.
 */
@Composable
fun AuthBackground(content: @Composable () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(AppOrange.copy(alpha = 0.10f), scheme.background, scheme.background),
                ),
            ),
    ) {
        content()
    }
}

/** The real brand mark (theme-aware asset), clipped to a rounded circle. iOS `BrandMark(size:)`. */
@Composable
fun BrandMark(sizeDp: Int, modifier: Modifier = Modifier) {
    val res = if (isSystemInDarkTheme()) R.drawable.brand_icon_dark else R.drawable.brand_icon
    Image(
        painter = painterResource(res),
        contentDescription = "RaSi Fiters",
        contentScale = ContentScale.Crop,
        modifier = modifier
            .size(sizeDp.dp)
            .clip(CircleShape),
    )
}

/** Standard rounded text field used across the auth forms (iOS `AppInputField`). */
@Composable
fun AppTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = keyboardType),
        modifier = modifier.fillMaxWidth(),
    )
}

/** Rounded secure field with a Show/Hide visibility toggle (iOS `AppPasswordToggleButton`). */
@Composable
fun AppPasswordField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    visible: Boolean,
    onToggleVisible: () -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Password),
        trailingIcon = {
            IconButton(onClick = onToggleVisible) {
                Icon(
                    imageVector = if (visible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                    contentDescription = if (visible) "Hide password" else "Show password",
                )
            }
        },
        modifier = modifier.fillMaxWidth(),
    )
}

/** The capsule CTA shared by every auth screen (iOS's `Color(.label)`-filled `Capsule`). */
@Composable
fun PillButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val scheme = MaterialTheme.colorScheme
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        shape = CircleShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = scheme.onBackground,
            contentColor = scheme.background,
        ),
        modifier = modifier
            .widthIn(max = 260.dp)
            .fillMaxWidth()
            .height(52.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(strokeWidth = 2.dp, color = scheme.background, modifier = Modifier.size(20.dp))
        } else {
            Text(label, style = MaterialTheme.typography.titleSmall)
        }
    }
}

/** A ✓/○ password-policy line for the create-account checklist (iOS `policyRow`, web D-C3). */
@Composable
fun PolicyRow(label: String, satisfied: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(
            imageVector = if (satisfied) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
            contentDescription = null,
            tint = if (satisfied) AppGreen else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = if (satisfied) MaterialTheme.colorScheme.onSurface
            else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )
    }
}
