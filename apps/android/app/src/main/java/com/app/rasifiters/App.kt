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
        createNotificationChannels()   // first: a PUT /device {inbox:true} lets the server name these channels
        container = AppContainer(this)
    }

    /** The channels FCM pushes post into (minSdk 26 = always required): `rasi_default` (the manifest default),
     *  high-importance `rasi_invites` (invites + membership changes) and one per new notification category.
     *  Created before the container, so before any `PUT /device {inbox:true}` can make the server name them (a post to a
     *  missing channel is dropped). */
    private fun createNotificationChannels() {
        val manager = getSystemService(NotificationManager::class.java)
        listOf(
            Triple(R.string.default_notification_channel_id, R.string.default_notification_channel_name, NotificationManager.IMPORTANCE_DEFAULT),
            Triple(R.string.invites_notification_channel_id, R.string.invites_notification_channel_name, NotificationManager.IMPORTANCE_HIGH),
            Triple(R.string.activity_notification_channel_id, R.string.activity_notification_channel_name, NotificationManager.IMPORTANCE_DEFAULT),
            Triple(R.string.reminders_notification_channel_id, R.string.reminders_notification_channel_name, NotificationManager.IMPORTANCE_DEFAULT),
            Triple(R.string.digest_notification_channel_id, R.string.digest_notification_channel_name, NotificationManager.IMPORTANCE_LOW),
            Triple(R.string.announcements_notification_channel_id, R.string.announcements_notification_channel_name, NotificationManager.IMPORTANCE_DEFAULT),
        ).forEach { (id, name, importance) ->
            manager.createNotificationChannel(NotificationChannel(getString(id), getString(name), importance))
        }
    }
}
