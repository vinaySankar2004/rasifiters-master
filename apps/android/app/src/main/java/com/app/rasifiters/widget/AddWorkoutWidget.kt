package com.app.rasifiters.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.Color
import com.app.rasifiters.MainActivity
import com.app.rasifiters.R

/**
 * "Add workout" home-screen widget (Jetpack Glance) — the Android analog of iOS WidgetKit's
 * `AddWorkoutWidget`. A single resizable widget with a compact and a wide layout (D-ANDROID-WIDGET-1);
 * tapping it deep-links `rasifiters://quick-add-workout` into MainActivity, which routes to the
 * quick-add workouts batch form. Colors use the Android theme tokens (D-ANDROID-WIDGET-2): orange
 * gradient, BLACK text.
 */
class AddWorkoutWidget : GlanceAppWidget() {

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
            Uri.parse("rasifiters://quick-add-workout"),
            context,
            MainActivity::class.java,
        )
        val black = ColorProvider(Color.Black)
        val black60 = ColorProvider(Color.Black.copy(alpha = 0.6f))
        val black65 = ColorProvider(Color.Black.copy(alpha = 0.65f))

        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(ImageProvider(R.drawable.widget_bg_workout))
                .padding(14.dp)
                .clickable(actionStartActivity(deepLink)),
        ) {
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
                        colorFilter = ColorFilter.tint(black),
                        modifier = GlanceModifier.size(16.dp),
                    )
                }
                Spacer(GlanceModifier.defaultWeight())
                Image(
                    provider = ImageProvider(R.drawable.ic_widget_chevron_right),
                    contentDescription = null,
                    colorFilter = ColorFilter.tint(black60),
                    modifier = GlanceModifier.size(18.dp),
                )
            }

            Spacer(GlanceModifier.height(6.dp))
            Text(
                text = if (wide) "Add workout session" else "Add workout",
                style = TextStyle(
                    color = black,
                    fontSize = if (wide) 18.sp else 15.sp,
                    fontWeight = FontWeight.Bold,
                ),
                maxLines = 1,
            )
            Spacer(GlanceModifier.height(2.dp))
            Text(
                text = if (wide) "Quick add a session for any program." else "Quick add",
                style = TextStyle(color = black65, fontSize = 12.sp),
                maxLines = 2,
            )

            Spacer(GlanceModifier.defaultWeight())

            Box(
                modifier = GlanceModifier
                    .height(if (wide) 32.dp else 28.dp)
                    .background(ImageProvider(R.drawable.widget_capsule_orange))
                    .padding(horizontal = if (wide) 14.dp else 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Image(
                        provider = ImageProvider(R.drawable.ic_widget_bolt),
                        contentDescription = null,
                        colorFilter = ColorFilter.tint(black),
                        modifier = GlanceModifier.size(14.dp),
                    )
                    Spacer(GlanceModifier.width(6.dp))
                    Text(
                        text = if (wide) "Log session" else "Log",
                        style = TextStyle(
                            color = black,
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

class AddWorkoutWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = AddWorkoutWidget()
}
