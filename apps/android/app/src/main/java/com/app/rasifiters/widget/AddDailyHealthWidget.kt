package com.app.rasifiters.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.unit.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import com.app.rasifiters.MainActivity
import com.app.rasifiters.R

/**
 * "Log health" home-screen widget (Jetpack Glance) — the Android analog of iOS WidgetKit's
 * `AddDailyHealthWidget`. A single resizable widget with a compact and a wide layout
 * (D-ANDROID-WIDGET-1); tapping it deep-links `rasifiters://quick-add-health` into MainActivity, which
 * routes to the quick-add daily-health batch form. Colors use the Android theme tokens
 * (D-ANDROID-WIDGET-2): blue gradient, WHITE text.
 */
class AddDailyHealthWidget : GlanceAppWidget() {

    override val sizeMode = SizeMode.Responsive(
        setOf(DpSize(110.dp, 110.dp), DpSize(250.dp, 110.dp)),
    )

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent { Content(context) }
    }

    @Composable
    private fun Content(context: Context) {
        val wide = LocalSize.current.width >= 200.dp
        val deepLink = Intent(
            Intent.ACTION_VIEW,
            Uri.parse("rasifiters://quick-add-health"),
            context,
            MainActivity::class.java,
        )
        val white = ColorProvider(Color.White)
        val white75 = ColorProvider(Color.White.copy(alpha = 0.75f))

        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(ImageProvider(R.drawable.widget_bg_health))
                .padding(14.dp)
                .clickable(actionStartActivity(deepLink)),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Top affordance row: add-circle (left) + chevron (right) — matches the workout tile.
            Row(
                modifier = GlanceModifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = GlanceModifier
                        .size(32.dp)
                        .background(ImageProvider(R.drawable.widget_icon_circle)),
                    contentAlignment = Alignment.Center,
                ) {
                    Image(
                        provider = ImageProvider(R.drawable.ic_widget_plus),
                        contentDescription = null,
                        colorFilter = ColorFilter.tint(white),
                        modifier = GlanceModifier.size(16.dp),
                    )
                }
                Spacer(GlanceModifier.defaultWeight())
                Image(
                    provider = ImageProvider(R.drawable.ic_widget_chevron_right),
                    contentDescription = null,
                    colorFilter = ColorFilter.tint(white75),
                    modifier = GlanceModifier.size(18.dp),
                )
            }

            // Hero glyph + short label, centered in the flexible middle (twin weighted
            // spacers keep the block centered and gap-free at any widget height — D-ANDROID-WIDGET-4).
            Spacer(GlanceModifier.defaultWeight())
            Image(
                provider = ImageProvider(R.drawable.ic_widget_bed),
                contentDescription = null,
                colorFilter = ColorFilter.tint(white),
                modifier = GlanceModifier.size(if (wide) 48.dp else 36.dp),
            )
            Spacer(GlanceModifier.height(8.dp))
            Text(
                text = if (wide) "Log health" else "Health",
                style = TextStyle(
                    color = white,
                    fontSize = if (wide) 16.sp else 13.sp,
                    fontWeight = FontWeight.Bold,
                ),
                maxLines = 1,
            )
            Spacer(GlanceModifier.defaultWeight())

            // Full-width CTA pinned to the bottom (capsule is a radius-999 shape drawable → stretches cleanly).
            Box(
                modifier = GlanceModifier
                    .fillMaxWidth()
                    .height(if (wide) 40.dp else 34.dp)
                    .background(ImageProvider(R.drawable.widget_capsule_translucent)),
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Image(
                        provider = ImageProvider(R.drawable.ic_widget_plus),
                        contentDescription = null,
                        colorFilter = ColorFilter.tint(white),
                        modifier = GlanceModifier.size(14.dp),
                    )
                    Spacer(GlanceModifier.width(6.dp))
                    Text(
                        text = if (wide) "Log day" else "Log",
                        style = TextStyle(
                            color = white,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                        ),
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

class AddDailyHealthWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = AddDailyHealthWidget()
}
