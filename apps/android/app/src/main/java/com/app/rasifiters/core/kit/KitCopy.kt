package com.app.rasifiters.core.kit

/** Every user-facing string the frontend kit shows — verbatim the frontend-kit SPEC §3 copy table. Web
 *  (`src/lib/kit/copy.ts`) and iOS (`Shared/Kit/KitCopy.swift`) carry the identical strings: change all three
 *  + the SPEC table in one commit (D-KIT-2). */
object KitCopy {
    const val RETRY = "Retry"
    const val UPDATE = "Update"
    const val DISMISS = "Dismiss"
    const val BANNER_OFFLINE = "You're offline"
    const val BANNER_STALE = "Couldn't refresh"
    const val BANNER_UPDATE = "A new version of RaSi Fiters is available"
    const val ERROR_VIEW_TITLE = "Couldn't load this"

    fun messageFor(kind: AppErrorKind): String = when (kind) {
        AppErrorKind.OFFLINE -> "Can't connect. Check your internet connection and try again."
        AppErrorKind.TIMEOUT -> "This is taking longer than usual. Try again."
        AppErrorKind.SIGNED_OUT -> "Your session has ended. Please sign in again."
        AppErrorKind.FORBIDDEN -> "You don't have access to this."
        AppErrorKind.NOT_FOUND -> "We couldn't find that. It may have been removed."
        AppErrorKind.CONFLICT -> "That conflicts with something already saved. Refresh and try again."
        AppErrorKind.INVALID_INPUT -> "Some details aren't valid. Check them and try again."
        AppErrorKind.UPDATE_REQUIRED -> "This version of RaSi Fiters is no longer supported. Please update the app."
        AppErrorKind.UNAVAILABLE -> "RaSi Fiters is busy right now. Try again in a moment."
        AppErrorKind.SERVER -> "Something went wrong on our end. Try again."
        AppErrorKind.UNKNOWN -> "Something went wrong. Try again."
    }
}
