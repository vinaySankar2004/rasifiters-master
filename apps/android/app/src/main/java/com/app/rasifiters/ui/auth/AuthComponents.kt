package com.app.rasifiters.ui.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import com.app.rasifiters.R
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange

/** Loose email-format check — mirrors the web/iOS regex (D-C2). */
private val EMAIL_RE = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

fun isEmailValid(email: String): Boolean = EMAIL_RE.matches(email.trim())

/** Plain solid screen background — the theme background, so the auth screens match every other page
 *  (standardized: no orange wash anywhere). */
@Composable
fun AuthBackground(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        content()
    }
}

/**
 * The shared auth-screen frame: the branded gradient + a form column that is **vertically centered**
 * when it fits the viewport and **scrolls / top-anchors** when it's long (create-account). Children
 * supply their own inter-element spacing.
 */
@Composable
fun AuthScaffold(
    centered: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    AuthBackground {
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            // heightIn(min = viewport) gives Arrangement.Center slack to center short forms; long forms
            // top-anchor with a margin and scroll.
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = maxHeight)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 28.dp)
                    .padding(top = if (centered) 20.dp else 64.dp, bottom = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = if (centered) Arrangement.Center else Arrangement.Top,
                content = content,
            )
        }
    }
}

/** The real brand mark (the orange light logo — same in dark mode), clipped to a rounded circle. iOS `BrandMark(size:)`. */
@Composable
fun BrandMark(sizeDp: Int, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.brand_icon),
        contentDescription = "RaSi Fiters",
        contentScale = ContentScale.Crop,
        modifier = modifier
            .size(sizeDp.dp)
            .clip(CircleShape),
    )
}

// One field spec shared by EVERY form field (text, password, select) so height + corners are identical
// everywhere. Compact + softly rounded — the fix for the "too big / too rectangular" Material default.
private val FieldShape = RoundedCornerShape(14.dp)
private val FieldHeight = 50.dp

@Composable
private fun fieldBorderColor() = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.22f)

@Composable
private fun fieldHintColor() = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)

/**
 * The single text-field primitive for the auth forms — a `BasicTextField` in a fixed-height, rounded,
 * bordered row with a placeholder (no floating Material label). Optional trailing slot (e.g. the password
 * eye). This is the one place field height/curve is defined, so every form stays 1:1.
 */
@Composable
fun AppTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    enabled: Boolean = true,
    trailing: @Composable (() -> Unit)? = null,
) {
    val scheme = MaterialTheme.colorScheme
    val textColor = if (enabled) scheme.onSurface else scheme.onSurface.copy(alpha = 0.5f)
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().height(FieldHeight),
        singleLine = true,
        textStyle = MaterialTheme.typography.bodyLarge.copy(color = textColor),
        cursorBrush = SolidColor(AppOrange),
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        visualTransformation = visualTransformation,
        decorationBox = { innerField ->
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(FieldShape)
                    .border(1.dp, fieldBorderColor(), FieldShape)
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(modifier = Modifier.weight(1f)) {
                    if (value.isEmpty()) {
                        Text(label, style = MaterialTheme.typography.bodyLarge, color = fieldHintColor(), maxLines = 1)
                    }
                    innerField()
                }
                if (trailing != null) {
                    Spacer(Modifier.width(8.dp))
                    trailing()
                }
            }
        },
    )
}

/** Secure field with a Show/Hide toggle — same primitive, so identical height + corners. */
@Composable
fun AppPasswordField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    visible: Boolean,
    onToggleVisible: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AppTextField(
        label = label,
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        keyboardType = KeyboardType.Password,
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        trailing = {
            Icon(
                imageVector = if (visible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                contentDescription = if (visible) "Hide password" else "Show password",
                tint = fieldHintColor(),
                modifier = Modifier
                    .size(22.dp)
                    .clickable { onToggleVisible() },
            )
        },
    )
}

/**
 * The standardized dropdown-select field: a field styled identically to the text inputs, opening a
 * plain **opaque** menu below it, width-matched to the field. The single reusable picker pattern
 * (gender now; dates/other menus later). No blur — a normal solid surface.
 */
@Composable
fun AppDropdownField(
    placeholder: String,
    value: String,
    options: List<String>,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val density = LocalDensity.current
    var expanded by remember { mutableStateOf(false) }
    var fieldWidthPx by remember { mutableStateOf(0) }

    Box(modifier = modifier.fillMaxWidth().onSizeChanged { fieldWidthPx = it.width }) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(FieldHeight)
                .clip(FieldShape)
                .border(1.dp, fieldBorderColor(), FieldShape)
                .clickable { expanded = !expanded }
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = value.ifEmpty { placeholder },
                style = MaterialTheme.typography.bodyLarge,
                color = if (value.isEmpty()) fieldHintColor() else scheme.onSurface,
                maxLines = 1,
                modifier = Modifier.weight(1f),
            )
            Icon(Icons.Filled.ArrowDropDown, contentDescription = null, tint = fieldHintColor())
        }

        if (expanded) {
            Popup(
                alignment = Alignment.TopStart,
                offset = IntOffset(0, with(density) { (FieldHeight + 6.dp).roundToPx() }),
                onDismissRequest = { expanded = false },
                properties = PopupProperties(focusable = true),
            ) {
                Column(
                    modifier = Modifier
                        .width(with(density) { fieldWidthPx.toDp() })
                        .shadow(elevation = 8.dp, shape = FieldShape, clip = false)
                        .clip(FieldShape)
                        .background(scheme.surface)
                        .border(1.dp, fieldBorderColor(), FieldShape)
                        .padding(vertical = 6.dp),
                ) {
                    options.forEach { option ->
                        val selected = option == value
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onSelect(option); expanded = false }
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = option,
                                style = MaterialTheme.typography.bodyLarge,
                                color = if (selected) AppOrange else scheme.onSurface,
                                modifier = Modifier.weight(1f),
                            )
                            if (selected) {
                                Icon(
                                    Icons.Filled.Check,
                                    contentDescription = null,
                                    tint = AppOrange,
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
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
            .height(48.dp),
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

/** The wizard's step indicator — a row of filled (current) / empty dots for the multi-page sign-up flow. */
@Composable
fun StepDots(current: Int, total: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        repeat(total) { index ->
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(
                        if (index == current) AppOrange
                        else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.3f),
                    ),
            )
        }
    }
}
