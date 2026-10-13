package com.app.rasifiters

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import com.app.rasifiters.core.AppContainer

/** Application entry point; owns the process-scoped DI container. */
class App : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        createNotificationChannels()
    }

    /** The channels FCM pushes post into (Android 8+ requires one; minSdk 26 = always present): `rasi_default` (the
     *  manifest default) + the high-importance `rasi_invites` for invites + membership changes (notifications §3.2). */
    private fun createNotificationChannels() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                getString(R.string.default_notification_channel_id),
                getString(R.string.default_notification_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT,
            ),
        )
        manager.createNotificationChannel(
            NotificationChannel(
                getString(R.string.invites_notification_channel_id),
                getString(R.string.invites_notification_channel_name),
                NotificationManager.IMPORTANCE_HIGH,
            ),
        )
    }
}
