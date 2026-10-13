package com.app.rasifiters.push

import android.Manifest
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.app.rasifiters.App
import com.app.rasifiters.MainActivity
import com.app.rasifiters.R
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * FCM entry point (the Android APNs-delegate analog):
 *  - **onNewToken** — the device's FCM token was (re)issued → [DeviceRegistry] (registered only while signed in).
 *  - **onMessageReceived** — a push arrived while the app is in the FOREGROUND (background `notification` messages are
 *    shown by the system tray). notifications §3.2 "Android shows foreground messages" — except while the SSE stream
 *    is connected, when the in-app modal already shows it (A5). Posted on the channel its type maps to, with a tap
 *    intent carrying `notification_id` / `type` / `program_id` (MainActivity acknowledges + routes).
 */
class RaSiFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        (application as? App)?.container?.deviceRegistry?.sync(newToken = token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val container = (application as? App)?.container ?: return
        // Named `payload`, never `data`: inside Intent.apply below, `data` would bind to Intent.data.
        val payload = message.data
        if (container.programContext.isStreamConnected) return
        container.programContext.onPushReceived(payload["type"])
        val title = message.notification?.title ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val channel = message.notification?.channelId ?: channelFor(payload["type"])
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            payload["notification_id"]?.let { putExtra("notification_id", it) }
            payload["type"]?.let { putExtra("type", it) }
            payload["program_id"]?.let { putExtra("program_id", it) }
        }
        val requestCode = (payload["notification_id"] ?: title).hashCode()
        val pending = PendingIntent.getActivity(this, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(this, channel)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(message.notification?.body.orEmpty())
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        NotificationManagerCompat.from(this).notify(requestCode, notification)
    }

    private fun channelFor(type: String?) =
        getString(if (type in INVITE_TYPES) R.string.invites_notification_channel_id else R.string.default_notification_channel_id)

    private companion object {
        val INVITE_TYPES = setOf("program.invite_received", "program.role_changed", "program.admin_transferred", "program.member_removed")
    }
}
