package com.app.rasifiters.core

import android.net.Uri

/**
 * Public-page links for the auth flow — the Android analog of the iOS `APIConfig` link block and the
 * web `config.ts` (`PRIVACY_POLICY_URL` / `SUPPORT_EMAIL`). Kept as constants (not BuildConfig) since
 * they don't vary per build type; harmonize with the other surfaces if the values ever change.
 */
object AppLinks {
    private const val WEB_APP_BASE_URL = "https://rasifiters.com"

    /** Privacy page on the app's own public site (login / create-account footers). Opens in the browser. */
    val privacyPolicyUri: Uri = Uri.parse("$WEB_APP_BASE_URL/privacy-policy")

    /** Recovery contact fallback for migrated no-email accounts (matches web/iOS mailto default). */
    const val SUPPORT_EMAIL = "vinay.sankara@gmail.com"

    /** `mailto:` for the forgot-password contact fallback, pre-filled with a recovery subject. */
    val supportMailtoUri: Uri = Uri.parse(
        "mailto:$SUPPORT_EMAIL" +
            "?subject=" + Uri.encode("RaSi Fiters — account recovery help"),
    )
}
