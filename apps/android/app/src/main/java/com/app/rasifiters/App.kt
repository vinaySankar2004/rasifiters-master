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
        createNotificationChannel()
    }

    /** The channel background FCM pushes post into (Android 8+ requires one). minSdk 26 = always present. */
    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            getString(R.string.default_notification_channel_id),
            getString(R.string.default_notification_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
