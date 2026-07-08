package com.app.rasifiters.ui.summary

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

// Shared chrome for the five Summary detail / log screens (Phase D details). Field styling mirrors the
// auth forms (14dp corners, 50dp height, subtle border) so every input reads 1:1 across the app.

private val FieldShape = RoundedCornerShape(14.dp)
private val FieldHeight = 50.dp
private val DATE_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d, yyyy")

@Composable
private fun fieldBorderColor() = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.22f)

@Composable
private fun fieldHintColor() = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)

/** The circular back button (grey circle + chevron) top-left of every detail/log screen. */
@Composable
fun CircleBackButton(onBack: () -> Unit) {
    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onBack),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = "Back",
            tint = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.size(22.dp),
        )
    }
}

/** Back button + optional centered title — the log-form top bar (title centered over the button row). */
@Composable
fun DetailTopBar(onBack: () -> Unit, centerTitle: String? = null) {
    Box(modifier = Modifier.fillMaxWidth().height(44.dp)) {
        CircleBackButton(onBack)
        if (centerTitle != null) {
            Text(
                centerTitle,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.align(Alignment.Center),
            )
        }
    }
}

/** A bold form-field label (e.g. "Workout", "Sleep time"). */
@Composable
fun FormFieldLabel(text: String) {
    Text(text, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
}

/** An inline red error footnote (D-C4). */
@Composable
fun FormErrorText(message: String) {
    Text(
        message,
        style = MaterialTheme.typography.bodySmall,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.error,
    )
}

/** An option in a [SearchablePickerField]. */
data class PickerOption(val value: String, val label: String)

/**
 * A select field that opens a searchable bottom-sheet list — the Android analogue of iOS
 * `SearchablePickerSheet` / web's searchable `Select`. Used for the member + workout pickers.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchablePickerField(
    placeholder: String,
    sheetTitle: String,
    selectedValue: String,
    options: List<PickerOption>,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    val selectedLabel = options.firstOrNull { it.value == selectedValue }?.label

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(FieldHeight)
            .clip(FieldShape)
            .border(1.dp, fieldBorderColor(), FieldShape)
            .clickable { open = true }
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = selectedLabel ?: placeholder,
            style = MaterialTheme.typography.bodyLarge,
            color = if (selectedLabel == null) fieldHintColor() else MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Icon(Icons.Filled.UnfoldMore, contentDescription = null, tint = fieldHintColor(), modifier = Modifier.size(20.dp))
    }

    if (open) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        var query by remember { mutableStateOf("") }
        ModalBottomSheet(onDismissRequest = { open = false }, sheetState = sheetState) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 12.dp),
            ) {
                Text(sheetTitle, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(12.dp))
                TextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    placeholder = { Text("Search") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = FieldShape,
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                        unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                        focusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                        unfocusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                    ),
                )
                Spacer(Modifier.height(8.dp))
                val filtered = if (query.isBlank()) options
                else options.filter { it.label.contains(query.trim(), ignoreCase = true) }
                LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp)) {
                    items(filtered, key = { it.value }) { option ->
                        val selected = option.value == selectedValue
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onSelect(option.value); open = false }
                                .padding(vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                option.label,
                                style = MaterialTheme.typography.bodyLarge,
                                color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.weight(1f),
                            )
                            if (selected) {
                                Icon(Icons.Filled.Check, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

/** A locked, non-editable field showing the self-locked member name (member variant of the picker). */
@Composable
fun LockedMemberField(name: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(FieldHeight)
            .clip(FieldShape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, fieldBorderColor(), FieldShape)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            name,
            style = MaterialTheme.typography.bodyLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Icon(Icons.Filled.Lock, contentDescription = null, tint = fieldHintColor(), modifier = Modifier.size(18.dp))
    }
}

/** The compact date pill ("Jul 8, 2026") that opens a Material date picker. Past-only when `allowFuture=false`. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DatePillField(date: LocalDate, onChange: (LocalDate) -> Unit, allowFuture: Boolean = true) {
    var open by remember { mutableStateOf(false) }
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .clickable { open = true }
            .padding(horizontal = 18.dp, vertical = 10.dp),
    ) {
        Text(date.format(DATE_FMT), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
    }

    if (open) {
        val selectable = remember(allowFuture) {
            object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean =
                    allowFuture || !millisToLocalDate(utcTimeMillis).isAfter(LocalDate.now())
            }
        }
        val state = rememberDatePickerState(
            initialSelectedDateMillis = localDateToMillis(date),
            selectableDates = selectable,
        )
        DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { onChange(millisToLocalDate(it)) }
                    open = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text("Cancel") } },
        ) {
            DatePicker(state = state)
        }
    }
}

/** A numeric input (Hours / Minutes) — reuses the auth `AppTextField` primitive for identical styling. */
@Composable
fun NumberField(placeholder: String, value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier) {
    com.app.rasifiters.ui.auth.AppTextField(
        label = placeholder,
        value = value,
        onValueChange = { onValueChange(it.filter { ch -> ch.isDigit() }.take(2)) },
        keyboardType = KeyboardType.Number,
        modifier = modifier,
    )
}

// DatePicker exchanges UTC-midnight millis; convert via UTC so the calendar day never shifts.
private fun localDateToMillis(date: LocalDate): Long =
    date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

private fun millisToLocalDate(millis: Long): LocalDate =
    Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
