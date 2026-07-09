package com.app.rasifiters.health

import android.Manifest
import android.app.Notification
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.app.rasifiters.R

/**
 * Local notifications for Health Connect auto-sync results (iOS `HealthKitSyncNotifier`, D7). Most
 * auto-syncs happen while the app is backgrounded, so a device-level banner is how the user learns the
 * outcome; the settings screen mirrors it via Last Synced / count.
 *
 * Fires ONLY on a sync that added >= 1 item — never when nothing was new, and never on failure (D-SIL):
 * transient failures retry automatically and losslessly. If POST_NOTIFICATIONS is denied every call is a
 * silent no-op (graceful in-app-only fallback). Posts into the existing `rasi_default` channel (created in
 * `App.onCreate`), the same channel FCM pushes use.
 */
object HealthSyncNotifier {

    fun notifyWorkoutSuccess(context: Context, count: Int) {
        if (count <= 0) return
        val noun = if (count == 1) "workout" else "workouts"
        post(context, "Health Connect", "Synced $count $noun from Health Connect.")
    }

    fun notifySleepSuccess(context: Context, count: Int) {
        if (count <= 0) return
        val noun = if (count == 1) "night" else "nights"
        post(context, "Health Connect", "Synced $count $noun of sleep from Health Connect.")
    }

    fun notifyStepsSuccess(context: Context, count: Int) {
        if (count <= 0) return
        val noun = if (count == 1) "day" else "days"
        post(context, "Health Connect", "Synced steps for $count $noun from Health Connect.")
    }

    private fun post(context: Context, title: String, body: String) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return // denied / not-yet-granted → in-app status only
        }
        val channelId = context.getString(R.string.default_notification_channel_id)
        val notification: Notification = androidx.core.app.NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(HEALTH_NOTIFICATION_ID, notification)
    }

    private const val HEALTH_NOTIFICATION_ID = 4201
}
