package com.app.rasifiters.ui.summary

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

// Shared Canvas chart primitive — the faithful analog of the iOS Swift Charts bar (+ optional line) chart.
// A left y-axis (nice ticks + faint gridlines), thin rounded orange bars, an optional Catmull-Rom-smoothed
// line with points, and (detail views) a tap/drag callout tooltip. Used by both the Summary landing cards
// and the full-screen detail drill-downs. Geometry constants below are shared by the pointer + draw passes.

private val LEFT_PAD = 30.dp
private val BOTTOM_PAD = 20.dp
private val TOP_PAD = 8.dp

/** One color-dotted value line inside a chart tooltip (e.g. orange "6 workouts", purple "6 active"). */
internal data class TooltipRow(val text: String, val color: Color)

/** The content of a chart tooltip: a bold title + color-coded value rows. One shared shape for every chart. */
internal data class TooltipData(val title: String, val rows: List<TooltipRow>)

@Composable
internal fun BarLineChart(
    values: List<Int>,
    labels: List<String>,
    lineValues: List<Int>?,
    barColor: Color,
    lineColor: Color,
    barWidth: Dp,
    modifier: Modifier = Modifier,
    tooltip: ((Int) -> TooltipData)? = null,
) {
    val measurer = rememberTextMeasurer()
    val axisColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f)
    val gridColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.10f)
    val calloutBg = MaterialTheme.colorScheme.surface
    val calloutFg = MaterialTheme.colorScheme.onSurface
    val calloutBorder = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f)
    val labelStyle = TextStyle(fontSize = 11.sp, color = axisColor)

    val dataMax = max(values.maxOrNull() ?: 0, lineValues?.maxOrNull() ?: 0).coerceAtLeast(1)
    val (axisMax, step) = niceAxis(dataMax)
    val n = values.size.coerceAtLeast(1)

    var selected by remember { mutableStateOf<Int?>(null) }
    val sel = selected?.takeIf { it in values.indices }

    // Map a touch x to the nearest bar index (shared geometry with the draw pass).
    val pointerMod = if (tooltip != null) {
        Modifier
            .pointerInput(n) {
                val leftPad = LEFT_PAD.toPx()
                fun idx(x: Float) = ((x - leftPad) / ((size.width - leftPad) / n)).toInt().coerceIn(0, n - 1)
                detectTapGestures { o ->
                    selected = if (o.x < leftPad) null else idx(o.x).let { if (it == selected) null else it }
                }
            }
            .pointerInput(n) {
                val leftPad = LEFT_PAD.toPx()
                fun idx(x: Float) = ((x - leftPad) / ((size.width - leftPad) / n)).toInt().coerceIn(0, n - 1)
                detectDragGestures { change, _ ->
                    if (change.position.x >= leftPad) selected = idx(change.position.x)
                    change.consume()
                }
            }
    } else Modifier

    Canvas(modifier = modifier.fillMaxWidth().then(pointerMod)) {
        val leftPad = LEFT_PAD.toPx()
        val plotLeft = leftPad
        val plotTop = TOP_PAD.toPx()
        val plotBottom = size.height - BOTTOM_PAD.toPx()
        val plotH = plotBottom - plotTop
        val plotW = size.width - leftPad

        fun yFor(v: Float) = plotBottom - (v / axisMax) * plotH

        var t = 0
        while (t <= axisMax) {
            val y = yFor(t.toFloat())
            drawLine(gridColor, Offset(plotLeft, y), Offset(size.width, y), strokeWidth = 1f)
            val layout = measurer.measure("$t", labelStyle)
            drawText(layout, topLeft = Offset(plotLeft - 6.dp.toPx() - layout.size.width, y - layout.size.height / 2f))
            t += step
        }

        val slot = plotW / n
        val barW = min(barWidth.toPx(), slot * 0.7f)
        val radius = CornerRadius(barW * 0.45f, barW * 0.45f)

        values.forEachIndexed { i, v ->
            val cx = plotLeft + i * slot + slot / 2f
            val h = (v / axisMax.toFloat()) * plotH
            if (h > 0f) {
                drawRoundRect(
                    color = barColor,
                    topLeft = Offset(cx - barW / 2f, plotBottom - h),
                    size = Size(barW, h),
                    cornerRadius = radius,
                )
            }
            val labelLayout = measurer.measure(labels.getOrElse(i) { "" }, labelStyle)
            drawText(labelLayout, topLeft = Offset(cx - labelLayout.size.width / 2f, plotBottom + 4.dp.toPx()))
        }

        lineValues?.let { lv ->
            val pts = lv.mapIndexed { i, v -> Offset(plotLeft + i * slot + slot / 2f, yFor(v.toFloat())) }
            if (pts.size >= 2) {
                drawPath(smoothPath(pts), color = lineColor, style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round))
            }
            pts.forEach { p ->
                drawCircle(Color.White, radius = 4.dp.toPx(), center = p)
                drawCircle(lineColor, radius = 3.dp.toPx(), center = p)
            }
        }

        // Tap/drag callout tooltip (detail views only).
        if (tooltip != null && sel != null) {
            val barTopY = plotBottom - (values[sel] / axisMax.toFloat()) * plotH
            val pointY = lineValues?.getOrNull(sel)?.let { yFor(it.toFloat()) } ?: barTopY
            val barCenterX = plotLeft + sel * slot + slot / 2f
            val anchorY = min(barTopY, pointY)
            drawCircle(calloutFg.copy(alpha = 0.35f), radius = 6.dp.toPx(), center = Offset(barCenterX, pointY))
            drawTooltip(measurer, tooltip(sel), barCenterX, anchorY, size.width, calloutBg, calloutFg, calloutBorder)
        }
    }
}

private val RIGHT_PAD = 22.dp

/**
 * The sleep/diet chart for the Lifestyle timeline — sleep-hours bars (blue) + a diet-quality line (green).
 * `dualAxis` (the detail view) scales the 0–5 diet series onto its own trailing axis so it isn't flattened
 * under the sleep bars (iOS D-C1): sleep reads on the leading "hrs" axis, diet on a trailing "/5" axis.
 * `dualAxis=false` (the preview card) shares one axis and omits the trailing labels + tooltip. Reuses the
 * one shared [drawTooltip] look (memory: android-shared-chart-tooltip).
 */
@Composable
internal fun SleepDietChart(
    labels: List<String>,
    sleepHours: List<Double>,
    dietQuality: List<Double>,
    dualAxis: Boolean,
    modifier: Modifier = Modifier,
    barColor: Color,
    lineColor: Color,
    tooltip: ((Int) -> TooltipData)? = null,
) {
    val measurer = rememberTextMeasurer()
    val axisColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f)
    val gridColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.10f)
    val calloutBg = MaterialTheme.colorScheme.surface
    val calloutFg = MaterialTheme.colorScheme.onSurface
    val calloutBorder = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f)
    val labelStyle = TextStyle(fontSize = 11.sp, color = axisColor)

    // Left ("hrs") axis: sleep hours in the dual view; combined max in the shared-axis preview.
    val sleepMax = sleepHours.maxOrNull() ?: 0.0
    val dietMax = dietQuality.maxOrNull() ?: 0.0
    val rawMax = if (dualAxis) sleepMax else max(sleepMax, dietMax)
    val (axisMax, step) = niceAxis(ceil(rawMax).toInt())
    val axisMaxF = axisMax.toFloat()
    // Diet mapped onto the left domain: dual → its own 0–5 scale (5 == top); preview → plotted raw.
    fun dietToDomain(v: Double): Float = if (dualAxis) (v / 5.0 * axisMax).toFloat() else v.toFloat()
    val n = sleepHours.size.coerceAtLeast(1)

    var selected by remember { mutableStateOf<Int?>(null) }
    val sel = selected?.takeIf { it in sleepHours.indices }

    val rightPad = if (dualAxis) RIGHT_PAD else 0.dp
    val pointerMod = if (tooltip != null) {
        Modifier
            .pointerInput(n) {
                val leftPad = LEFT_PAD.toPx()
                val rp = rightPad.toPx()
                fun idx(x: Float) = ((x - leftPad) / ((size.width - leftPad - rp) / n)).toInt().coerceIn(0, n - 1)
                detectTapGestures { o ->
                    selected = if (o.x < leftPad) null else idx(o.x).let { if (it == selected) null else it }
                }
            }
            .pointerInput(n) {
                val leftPad = LEFT_PAD.toPx()
                val rp = rightPad.toPx()
                fun idx(x: Float) = ((x - leftPad) / ((size.width - leftPad - rp) / n)).toInt().coerceIn(0, n - 1)
                detectDragGestures { change, _ ->
                    if (change.position.x >= leftPad) selected = idx(change.position.x)
                    change.consume()
                }
            }
    } else Modifier

    Canvas(modifier = modifier.fillMaxWidth().then(pointerMod)) {
        val leftPad = LEFT_PAD.toPx()
        val rp = rightPad.toPx()
        val plotLeft = leftPad
        val plotTop = TOP_PAD.toPx()
        val plotBottom = size.height - BOTTOM_PAD.toPx()
        val plotH = plotBottom - plotTop
        val plotW = size.width - leftPad - rp

        fun yFor(v: Float) = plotBottom - (v / axisMaxF) * plotH

        // Left axis ticks + horizontal gridlines ("hrs").
        var t = 0
        while (t <= axisMax) {
            val y = yFor(t.toFloat())
            drawLine(gridColor, Offset(plotLeft, y), Offset(plotLeft + plotW, y), strokeWidth = 1f)
            val layout = measurer.measure("$t", labelStyle)
            drawText(layout, topLeft = Offset(plotLeft - 6.dp.toPx() - layout.size.width, y - layout.size.height / 2f))
            t += step
        }

        // Right "/5" axis labels (dual only) — diet 0–5 aligned to the same gridlines.
        if (dualAxis) {
            for (d in 0..5) {
                val y = yFor((d / 5.0 * axisMax).toFloat())
                val layout = measurer.measure("$d", labelStyle)
                drawText(layout, topLeft = Offset(plotLeft + plotW + 6.dp.toPx(), y - layout.size.height / 2f))
            }
        }

        val slot = plotW / n
        val barW = min(10.dp.toPx(), slot * 0.7f)
        val radius = CornerRadius(barW * 0.45f, barW * 0.45f)

        sleepHours.forEachIndexed { i, v ->
            val cx = plotLeft + i * slot + slot / 2f
            val h = (v.toFloat() / axisMaxF) * plotH
            if (h > 0f) {
                drawRoundRect(
                    color = barColor,
                    topLeft = Offset(cx - barW / 2f, plotBottom - h),
                    size = Size(barW, h),
                    cornerRadius = radius,
                )
            }
            val labelLayout = measurer.measure(labels.getOrElse(i) { "" }, labelStyle)
            drawText(labelLayout, topLeft = Offset(cx - labelLayout.size.width / 2f, plotBottom + 4.dp.toPx()))
        }

        val pts = dietQuality.mapIndexed { i, v -> Offset(plotLeft + i * slot + slot / 2f, yFor(dietToDomain(v))) }
        if (pts.size >= 2) {
            drawPath(smoothPath(pts), color = lineColor, style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round))
        }
        pts.forEach { p ->
            drawCircle(Color.White, radius = 4.dp.toPx(), center = p)
            drawCircle(lineColor, radius = 3.dp.toPx(), center = p)
        }

        if (tooltip != null && sel != null) {
            val barTopY = yFor(sleepHours[sel].toFloat())
            val dietY = yFor(dietToDomain(dietQuality.getOrElse(sel) { 0.0 }))
            val cx = plotLeft + sel * slot + slot / 2f
            val anchorY = min(barTopY, dietY)
            drawCircle(calloutFg.copy(alpha = 0.35f), radius = 6.dp.toPx(), center = Offset(cx, dietY))
            drawTooltip(measurer, tooltip(sel), cx, anchorY, size.width, calloutBg, calloutFg, calloutBorder)
        }
    }
}

/**
 * The single tooltip look shared by every chart — a floating card with a soft drop shadow, a bold title, a
 * caret pointing at the datapoint, and color-dotted value rows. Auto-flips below + clamps to the edges.
 */
private fun DrawScope.drawTooltip(
    measurer: TextMeasurer,
    data: TooltipData,
    anchorX: Float,
    anchorY: Float,
    viewWidth: Float,
    bg: Color,
    fg: Color,
    border: Color,
) {
    val padH = 12.dp.toPx()
    val padV = 10.dp.toPx()
    val titleGap = 6.dp.toPx()
    val rowGap = 5.dp.toPx()
    val dotR = 3.5.dp.toPx()
    val dotGap = 7.dp.toPx()
    val caretH = 6.dp.toPx()
    val corner = CornerRadius(10.dp.toPx(), 10.dp.toPx())

    val titleStyle = TextStyle(fontSize = 13.sp, color = fg, fontWeight = FontWeight.Bold)
    val rowStyle = TextStyle(fontSize = 12.sp, color = fg.copy(alpha = 0.78f))

    val titleL = measurer.measure(data.title, titleStyle)
    val rowLs = data.rows.map { measurer.measure(it.text, rowStyle) }

    val rowsW = rowLs.maxOfOrNull { dotR * 2 + dotGap + it.size.width } ?: 0f
    val contentW = max(titleL.size.width.toFloat(), rowsW)
    var rowsH = rowLs.fold(0f) { acc, l -> acc + l.size.height }
    if (rowLs.size > 1) rowsH += rowGap * (rowLs.size - 1)
    val contentH = titleL.size.height + if (rowLs.isNotEmpty()) titleGap + rowsH else 0f
    val boxW = contentW + padH * 2
    val boxH = contentH + padV * 2

    val margin = 4.dp.toPx()
    val boxX = (anchorX - boxW / 2f).coerceIn(margin, (viewWidth - boxW - margin).coerceAtLeast(margin))
    val above = anchorY - boxH - caretH - 6.dp.toPx() >= 0f
    val boxY = if (above) anchorY - boxH - caretH - 6.dp.toPx() else anchorY + caretH + 6.dp.toPx()

    // Soft drop shadow (offset, low-alpha — reads as elevation without a blur pass).
    drawRoundRect(Color.Black.copy(alpha = 0.18f), topLeft = Offset(boxX, boxY + 2.dp.toPx()), size = Size(boxW, boxH), cornerRadius = corner)

    // Caret pointing at the datapoint.
    val caretCx = anchorX.coerceIn(boxX + 14.dp.toPx(), boxX + boxW - 14.dp.toPx())
    val caret = Path().apply {
        if (above) {
            moveTo(caretCx - 6.dp.toPx(), boxY + boxH)
            lineTo(caretCx + 6.dp.toPx(), boxY + boxH)
            lineTo(caretCx, boxY + boxH + caretH)
        } else {
            moveTo(caretCx - 6.dp.toPx(), boxY)
            lineTo(caretCx + 6.dp.toPx(), boxY)
            lineTo(caretCx, boxY - caretH)
        }
        close()
    }
    drawPath(caret, color = bg)

    drawRoundRect(bg, topLeft = Offset(boxX, boxY), size = Size(boxW, boxH), cornerRadius = corner)
    drawRoundRect(border, topLeft = Offset(boxX, boxY), size = Size(boxW, boxH), cornerRadius = corner, style = Stroke(1.dp.toPx()))

    drawText(titleL, topLeft = Offset(boxX + padH, boxY + padV))
    var y = boxY + padV + titleL.size.height + titleGap
    rowLs.forEachIndexed { i, l ->
        drawCircle(data.rows[i].color, radius = dotR, center = Offset(boxX + padH + dotR, y + l.size.height / 2f))
        drawText(l, topLeft = Offset(boxX + padH + dotR * 2 + dotGap, y))
        y += l.size.height + rowGap
    }
}

/** A rounded max + step for ~4 y-axis ticks (the Swift Charts `automatic(desiredCount:)` analog). */
internal fun niceAxis(maxV: Int): Pair<Int, Int> {
    val m = maxV.coerceAtLeast(1)
    val rawStep = (m / 4.0).coerceAtLeast(1.0)
    val magnitude = 10.0.pow(floor(log10(rawStep)))
    val norm = rawStep / magnitude
    val niceNorm = when {
        norm <= 1 -> 1.0
        norm <= 2 -> 2.0
        norm <= 5 -> 5.0
        else -> 10.0
    }
    val step = (niceNorm * magnitude).roundToInt().coerceAtLeast(1)
    val ticks = ceil(m.toDouble() / step).toInt().coerceAtLeast(1)
    return (step * ticks) to step
}

/** Catmull-Rom → cubic-bezier smoothing (the iOS `.interpolationMethod(.catmullRom)` analog). */
internal fun smoothPath(pts: List<Offset>): Path {
    val path = Path()
    if (pts.isEmpty()) return path
    path.moveTo(pts[0].x, pts[0].y)
    for (i in 0 until pts.size - 1) {
        val p0 = pts[max(0, i - 1)]
        val p1 = pts[i]
        val p2 = pts[i + 1]
        val p3 = pts[min(pts.size - 1, i + 2)]
        val c1 = Offset(p1.x + (p2.x - p0.x) / 6f, p1.y + (p2.y - p0.y) / 6f)
        val c2 = Offset(p2.x - (p3.x - p1.x) / 6f, p2.y - (p3.y - p1.y) / 6f)
        path.cubicTo(c1.x, c1.y, c2.x, c2.y, p2.x, p2.y)
    }
    return path
}

/**
 * iOS-style x-axis label thinning so dense windows don't overlap. Weekly buckets show all; daily buckets
 * (month) label only 1/8/15/22/29; monthly buckets that overflow are strided. `period` = week|month|
 * year|program.
 */
internal fun axisLabels(rawLabels: List<String>, period: String): List<String> = when (period) {
    "month" -> rawLabels.map { l -> l.toIntOrNull()?.let { d -> if ((d - 1) % 7 == 0) l else "" } ?: l }
    "year" -> rawLabels.map { it.take(1) } // J F M A M J J A S O N D
    else -> {
        if (rawLabels.size <= 12) rawLabels
        else {
            val stride = ceil(rawLabels.size / 8.0).toInt().coerceAtLeast(1)
            rawLabels.mapIndexed { i, l -> if (i % stride == 0) l else "" }
        }
    }
}
