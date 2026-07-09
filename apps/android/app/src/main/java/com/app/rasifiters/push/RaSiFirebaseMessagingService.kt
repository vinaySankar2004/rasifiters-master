package com.app.rasifiters.push

import com.app.rasifiters.App
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * FCM entry point (the Android APNs-delegate analog). Two events matter:
 *  - **onNewToken** — the device's FCM registration token was (re)issued; hand it to `ProgramContext` to
 *    persist via `PUT /notifications/device` (only if signed in; otherwise it's registered on next login).
 *  - **onMessageReceived** — a push arrived while the app is in the FOREGROUND. We intentionally do nothing:
 *    the in-app SSE stream already drives the modal for a live user, so posting a tray notification too would
 *    double-alert. Background pushes are `notification` messages the system tray shows automatically (this
 *    callback isn't invoked for them), landing in the channel created in `App.onCreate`.
 */
class RaSiFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        (application as? App)?.container?.programContext?.onNewPushToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Foreground delivery — the SSE modal owns the in-app alert; nothing to do here.
    }
}
