package com.app.rasifiters.core

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Token + identity store. Access/refresh tokens live in an Android Keystore-backed
 * EncryptedSharedPreferences (the Keychain analog); lightweight identity is cached alongside.
 * Single source of truth for tokens — the OkHttp authenticator reads/updates it directly.
 */
class Session(context: Context) {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "rasi.fiters.session",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    val accessToken: String? get() = prefs.getString(KEY_ACCESS, null)
    val refreshToken: String? get() = prefs.getString(KEY_REFRESH, null)
    val memberId: String? get() = prefs.getString(KEY_MEMBER_ID, null)
    val globalRole: String? get() = prefs.getString(KEY_GLOBAL_ROLE, null)
    val username: String? get() = prefs.getString(KEY_USERNAME, null)
    val memberName: String? get() = prefs.getString(KEY_MEMBER_NAME, null)

    fun saveTokens(access: String, refresh: String) {
        prefs.edit().putString(KEY_ACCESS, access).putString(KEY_REFRESH, refresh).apply()
    }

    fun saveIdentity(memberId: String?, username: String?, memberName: String?, globalRole: String?) {
        prefs.edit()
            .putString(KEY_MEMBER_ID, memberId)
            .putString(KEY_USERNAME, username)
            .putString(KEY_MEMBER_NAME, memberName)
            .putString(KEY_GLOBAL_ROLE, globalRole)
            .apply()
    }

    fun clear() = prefs.edit().clear().apply()

    private companion object {
        const val KEY_ACCESS = "access_token"
        const val KEY_REFRESH = "refresh_token"
        const val KEY_MEMBER_ID = "member_id"
        const val KEY_GLOBAL_ROLE = "global_role"
        const val KEY_USERNAME = "username"
        const val KEY_MEMBER_NAME = "member_name"
    }
}
