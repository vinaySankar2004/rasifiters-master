package com.app.rasifiters.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/*
 * Polish #36 — the ONE way to give a small control the M3 48dp minimum (the tap-target rule; platform idiom: Android
 * 48dp, web/iOS 44pt) plus a screen-reader label / role / selected state.
 * Order rule:
 *  • tapTarget goes FIRST in the chain (before size / background) — the M3 IconButton order: it reserves 48dp around what
 *    follows, so a 22dp icon or a 36dp pill keeps its look but gets a 48dp touch. [shape] clips the ripple to the control.
 *    Pass contentDescription = null on the inner Icon (the label is set here).
 *  • selectableTarget / toggleTarget go AFTER a segment's clip + background: the visible segment itself becomes ≥ 48dp.
 */
fun Modifier.tapTarget(
    label: String,
    role: Role = Role.Button,
    enabled: Boolean = true,
    shape: Shape? = null,
    onClick: () -> Unit,
): Modifier = this
    .minimumInteractiveComponentSize()
    .then(if (shape != null) Modifier.clip(shape) else Modifier)
    .clickable(enabled = enabled, onClickLabel = label, role = role, onClick = onClick)
    .semantics { contentDescription = label }

/** [tapTarget] for a control whose look must not change: the layout keeps [footprint] (rows, text width and the
 *  control's position stay as they were) while the 48dp touch target overflows it, centered on the control. Follow it
 *  with the control's own size / background. */
fun Modifier.compactTapTarget(
    footprint: Dp,
    label: String,
    role: Role = Role.Button,
    enabled: Boolean = true,
    shape: Shape? = null,
    onClick: () -> Unit,
): Modifier = this
    .size(footprint)
    .requiredSize(48.dp)
    .tapTarget(label, role, enabled, shape, onClick)
    .wrapContentSize()

/** A segment / chip / list choice: selectable with its selected state announced, + the 48dp minimum. [label] replaces a
 *  terse visible text for screen readers (e.g. "Week" for "W"). */
fun Modifier.selectableTarget(
    selected: Boolean,
    role: Role = Role.Tab,
    enabled: Boolean = true,
    label: String? = null,
    onClick: () -> Unit,
): Modifier = this
    .selectable(selected = selected, enabled = enabled, role = role, onClick = onClick)
    .then(if (label != null) Modifier.semantics { contentDescription = label } else Modifier)
    .minimumInteractiveComponentSize()

/** A row that switches something on / off (checked state announced), + the 48dp minimum. */
fun Modifier.toggleTarget(
    checked: Boolean,
    role: Role = Role.Checkbox,
    enabled: Boolean = true,
    onToggle: (Boolean) -> Unit,
): Modifier = this
    .toggleable(value = checked, enabled = enabled, role = role, onValueChange = onToggle)
    .minimumInteractiveComponentSize()
