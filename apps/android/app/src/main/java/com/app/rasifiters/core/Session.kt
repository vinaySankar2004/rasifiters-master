package com.app.rasifiters.core

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.crypto.AEADBadTagException

/**
 * Token + identity store. Access/refresh tokens live in an Android Keystore-backed
 * EncryptedSharedPreferences (the Keychain analog, excluded from Auto Backup); lightweight identity is cached
 * alongside. THE single token store (auth §3.1, board §2 client rule 1) — OkHttp, SSE and the root gate read it.
 */
class Session(context: Context) {
    /** [receivedAtMs] = device time the pair was stored (0 = written by 1.0.0) — expiry is lifetime-based (clock-skew safe). */
    data class Tokens(val access: String, val refresh: String, val receivedAtMs: Long)

    /** True when the encrypted store was CORRUPT at launch (keyset / decrypt failure) and was reset →
     *  auth.forced_sign_out token_store_unreadable + the A2 notice. A transient failure never sets it. */
    var recoveredFromUnreadableStore: Boolean = false
        private set

    /** null only if the Keystore stays unusable after a reset — the session then lives in memory for this process. */
    private val prefs: SharedPreferences? = openStore(context.applicationContext)

    private val _tokens = MutableStateFlow(readTokens())
    /** THE token store — no other copy exists. */
    val tokens: StateFlow<Tokens?> = _tokens.asStateFlow()

    private val _signedIn = MutableStateFlow(_tokens.value != null)
    /** Drives the root gate; flips only on sign-in ([saveTokens]) and sign-out ([clear]) — NEVER on a refresh. */
    val signedIn: StateFlow<Boolean> = _signedIn.asStateFlow()

    val accessToken: String? get() = _tokens.value?.access
    val refreshToken: String? get() = _tokens.value?.refresh
    val memberId: String? get() = prefs?.getString(KEY_MEMBER_ID, null)
    val globalRole: String? get() = prefs?.getString(KEY_GLOBAL_ROLE, null)
    val username: String? get() = prefs?.getString(KEY_USERNAME, null)
    val memberName: String? get() = prefs?.getString(KEY_MEMBER_NAME, null)

    /** Sign-in only. */
    @Synchronized
    fun saveTokens(access: String, refresh: String) {
        val t = Tokens(access, refresh, System.currentTimeMillis())
        write(t)
        _tokens.value = t
        _signedIn.value = true
    }

    /** Refresh rotation — compare-and-set on the refresh token the call used. false = the session changed while the call
     *  was in flight (signed out / another sign-in): nothing is written, so a late refresh can never resurrect a session. */
    @Synchronized
    fun rotateTokens(expectedRefresh: String, access: String, refresh: String): Boolean {
        if (_tokens.value?.refresh != expectedRefresh) return false
        val t = Tokens(access, refresh, System.currentTimeMillis())
        write(t)
        _tokens.value = t
        return true
    }

    /** `401 session_invalid` for [expectedRefresh] — clears only if that is still the stored session. */
    @Synchronized
    fun clearIfRefresh(expectedRefresh: String): Boolean {
        if (_tokens.value?.refresh != expectedRefresh) return false
        clear()
        return true
    }

    fun saveIdentity(memberId: String?, username: String?, memberName: String?, globalRole: String?) {
        prefs?.edit()?.putString(KEY_MEMBER_ID, memberId)?.putString(KEY_USERNAME, username)
            ?.putString(KEY_MEMBER_NAME, memberName)?.putString(KEY_GLOBAL_ROLE, globalRole)?.commit()
    }

    @Synchronized
    fun clear() {
        prefs?.edit()?.clear()?.commit()
        _tokens.value = null
        _signedIn.value = false
    }

    /** Board §2 rule 4: a rotated refresh token must be durable before use (commit, status checked). */
    private fun write(t: Tokens) {
        val ok = prefs?.edit()?.putString(KEY_ACCESS, t.access)?.putString(KEY_REFRESH, t.refresh)
            ?.putLong(KEY_RECEIVED_AT, t.receivedAtMs)?.commit()
        if (ok == false) Log.w(TAG, "token write failed")
    }

    /** Corruption → the store is cleared (sign-out). Any other failure → retried once, then no session for this
     *  process WITHOUT touching the file (a transient Keystore hiccup must not sign anyone out for good). */
    private fun readTokens(): Tokens? {
        repeat(2) { attempt ->
            try {
                val a = prefs?.getString(KEY_ACCESS, null)
                val r = prefs?.getString(KEY_REFRESH, null)
                return if (a.isNullOrEmpty() || r.isNullOrEmpty()) null else Tokens(a, r, prefs?.getLong(KEY_RECEIVED_AT, 0L) ?: 0L)
            } catch (e: Exception) {
                if (isCorrupt(e)) {
                    Log.w(TAG, "token store corrupt — resetting", e)
                    recoveredFromUnreadableStore = true
                    runCatching { prefs?.edit()?.clear()?.commit() }
                    return null
                }
                if (attempt == 1) Log.w(TAG, "token store unreadable — no session this process (store kept)", e)
            }
        }
        return null
    }

    /** Same rule as [readTokens]: only a corrupt keyset / ciphertext deletes the file. */
    private fun openStore(context: Context): SharedPreferences? {
        repeat(2) { attempt ->
            try {
                return create(context)
            } catch (e: Exception) {
                if (isCorrupt(e)) {
                    Log.w(TAG, "token store corrupt — resetting", e)
                    recoveredFromUnreadableStore = true
                    context.deleteSharedPreferences(FILE)
                    return try { create(context) } catch (e2: Exception) {
                        Log.e(TAG, "token store unavailable — in-memory session", e2); null
                    }
                }
                if (attempt == 1) Log.e(TAG, "token store unavailable — in-memory session (store kept)", e)
            }
        }
        return null
    }

    /** Keyset / decrypt corruption (e.g. a restored file whose Keystore key is gone) anywhere in the cause chain. */
    private fun isCorrupt(e: Throwable): Boolean = generateSequence(e) { it.cause }.take(8).any {
        it is AEADBadTagException ||
            it.javaClass.simpleName == "InvalidProtocolBufferException" ||   // Tink's shaded protobuf, or plain
            it.javaClass.simpleName == "KeyPermanentlyInvalidatedException"
    }

    private fun create(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        return EncryptedSharedPreferences.create(
            context, FILE, masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    private companion object {
        const val TAG = "RaSiSession"
        const val FILE = "rasi.fiters.session"
        const val KEY_ACCESS = "access_token"
        const val KEY_REFRESH = "refresh_token"
        const val KEY_RECEIVED_AT = "tokens_received_at"
        const val KEY_MEMBER_ID = "member_id"
        const val KEY_GLOBAL_ROLE = "global_role"
        const val KEY_USERNAME = "username"
        const val KEY_MEMBER_NAME = "member_name"
    }
}
