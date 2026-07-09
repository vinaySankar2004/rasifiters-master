package com.app.rasifiters.health

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

/**
 * Client-persisted Health Connect sync state — the Android analog of the iOS Apple-Health `UserDefaults`
 * keys (`ProgramContext+HealthKit`/`+HealthKitSleep`), the first-sync gating
 * (`ProgramContext+HealthSyncGating`), and the sum-on-conflict idempotency ledger
 * (`HealthKitAppliedLedger`). All sync state is client-side (F3) — there is no server preference table.
 *
 * Backed by a plain (non-encrypted) `SharedPreferences` — these are non-sensitive settings, unlike the
 * session tokens which live in `EncryptedSharedPreferences`. Synchronous reads/writes mirror
 * `UserDefaults`' semantics, which the sync orchestration assumes.
 */
class HealthStore(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("rasi.health", Context.MODE_PRIVATE)

    // ── Flow selector: workouts / sleep / steps share the same code paths, keyed by prefix ──
    enum class Flow(val prefix: String) { WORKOUTS("hc"), SLEEP("hc.sleep"), STEPS("hc.steps") }

    // ── Workout settings (iOS `healthkit.*`) ──
    var workoutEnabled: Boolean
        get() = prefs.getBoolean("hc.enabled", false)
        set(v) = prefs.edit { putBoolean("hc.enabled", v) }
    var workoutProgramIds: Set<String>
        get() = prefs.getStringSet("hc.syncProgramIds", emptySet())!!.toSet()
        set(v) = prefs.edit { putStringSet("hc.syncProgramIds", v) }
    var lastWorkoutSyncMillis: Long
        get() = prefs.getLong("hc.lastSyncMillis", 0L)
        set(v) = prefs.edit { putLong("hc.lastSyncMillis", v) }
    var lastWorkoutSyncCount: Int
        get() = prefs.getInt("hc.lastSyncCount", 0)
        set(v) = prefs.edit { putInt("hc.lastSyncCount", v) }
    var lastWorkoutSyncFailed: Boolean
        get() = prefs.getBoolean("hc.lastSyncFailed", false)
        set(v) = prefs.edit { putBoolean("hc.lastSyncFailed", v) }
    /** First-connect timestamp: bounds the first fetch so we never backfill arbitrary history. 0 = unset. */
    var workoutConnectMillis: Long
        get() = prefs.getLong("hc.connectMillis", 0L)
        set(v) = prefs.edit { putLong("hc.connectMillis", v) }
    /** The Health Connect changes token (the anchor analog) — committed ONLY after a successful sync. */
    var workoutChangesToken: String?
        get() = prefs.getString("hc.changesToken", null)
        set(v) = prefs.edit { putString("hc.changesToken", v) }

    // ── Sleep settings (iOS `healthkit.sleep.*`) ──
    var sleepEnabled: Boolean
        get() = prefs.getBoolean("hc.sleep.enabled", false)
        set(v) = prefs.edit { putBoolean("hc.sleep.enabled", v) }
    var sleepProgramIds: Set<String>
        get() = prefs.getStringSet("hc.sleep.syncProgramIds", emptySet())!!.toSet()
        set(v) = prefs.edit { putStringSet("hc.sleep.syncProgramIds", v) }
    var lastSleepSyncMillis: Long
        get() = prefs.getLong("hc.sleep.lastSyncMillis", 0L)
        set(v) = prefs.edit { putLong("hc.sleep.lastSyncMillis", v) }
    var lastSleepSyncCount: Int
        get() = prefs.getInt("hc.sleep.lastSyncCount", 0)
        set(v) = prefs.edit { putInt("hc.sleep.lastSyncCount", v) }
    var lastSleepSyncFailed: Boolean
        get() = prefs.getBoolean("hc.sleep.lastSyncFailed", false)
        set(v) = prefs.edit { putBoolean("hc.sleep.lastSyncFailed", v) }
    var sleepConnectMillis: Long
        get() = prefs.getLong("hc.sleep.connectMillis", 0L)
        set(v) = prefs.edit { putLong("hc.sleep.connectMillis", v) }

    // ── Steps settings (iOS `healthkit.steps.*`) ──
    var stepsEnabled: Boolean
        get() = prefs.getBoolean("hc.steps.enabled", false)
        set(v) = prefs.edit { putBoolean("hc.steps.enabled", v) }
    var stepsProgramIds: Set<String>
        get() = prefs.getStringSet("hc.steps.syncProgramIds", emptySet())!!.toSet()
        set(v) = prefs.edit { putStringSet("hc.steps.syncProgramIds", v) }
    var lastStepsSyncMillis: Long
        get() = prefs.getLong("hc.steps.lastSyncMillis", 0L)
        set(v) = prefs.edit { putLong("hc.steps.lastSyncMillis", v) }
    var lastStepsSyncCount: Int
        get() = prefs.getInt("hc.steps.lastSyncCount", 0)
        set(v) = prefs.edit { putInt("hc.steps.lastSyncCount", v) }
    var lastStepsSyncFailed: Boolean
        get() = prefs.getBoolean("hc.steps.lastSyncFailed", false)
        set(v) = prefs.edit { putBoolean("hc.steps.lastSyncFailed", v) }
    var stepsConnectMillis: Long
        get() = prefs.getLong("hc.steps.connectMillis", 0L)
        set(v) = prefs.edit { putLong("hc.steps.connectMillis", v) }

    // ── First-sync gating (iOS `ProgramContext+HealthSyncGating`) ──

    fun confirmedProgramIds(flow: Flow): Set<String> =
        prefs.getStringSet("${flow.prefix}.confirmedProgramIds", emptySet())!!.toSet()

    fun markProgramConfirmed(id: String, flow: Flow) {
        prefs.edit { putStringSet("${flow.prefix}.confirmedProgramIds", confirmedProgramIds(flow) + id) }
    }

    /** Re-gate every program for a flow — used on reconnect so a fresh connect re-confirms all programs. */
    fun clearConfirmedPrograms(flow: Flow) {
        prefs.edit { remove("${flow.prefix}.confirmedProgramIds") }
    }

    fun excludedKeys(flow: Flow): Set<String> =
        prefs.getStringSet("${flow.prefix}.excludedKeys", emptySet())!!.toSet()

    fun addExcludedKeys(keys: Collection<String>, flow: Flow) {
        if (keys.isEmpty()) return
        prefs.edit { putStringSet("${flow.prefix}.excludedKeys", excludedKeys(flow) + keys) }
    }

    private fun setExcludedKeys(keys: Set<String>, flow: Flow) {
        prefs.edit { putStringSet("${flow.prefix}.excludedKeys", keys) }
    }

    fun clearExcludedKeys(flow: Flow) {
        prefs.edit { remove("${flow.prefix}.excludedKeys") }
    }

    /** Drop excluded SLEEP keys aged out of the rolling look-back window — they can never be re-fetched. */
    fun pruneSleepExcludedKeys(recentDays: Int) {
        val keys = excludedKeys(Flow.SLEEP)
        if (keys.isEmpty()) return
        val cutoff = HealthDates.localYMD(System.currentTimeMillis() - recentDays * DAY_MS)
        val kept = keys.filter { key -> (key.substringAfterLast('|')) >= cutoff }.toSet()
        if (kept.size != keys.size) setExcludedKeys(kept, Flow.SLEEP)
    }

    /** Drop excluded STEPS keys aged out of the rolling look-back window — they can never be re-fetched. */
    fun pruneStepsExcludedKeys(recentDays: Int) {
        val keys = excludedKeys(Flow.STEPS)
        if (keys.isEmpty()) return
        val cutoff = HealthDates.localYMD(System.currentTimeMillis() - recentDays * DAY_MS)
        val kept = keys.filter { key -> (key.substringAfterLast('|')) >= cutoff }.toSet()
        if (kept.size != keys.size) setExcludedKeys(kept, Flow.STEPS)
    }

    // ── Applied-sample ledger (iOS `HealthKitAppliedLedger`; sum-on-conflict idempotency, D-SUM) ──
    // Keyed "<uuid>|<programId>"; value = the workout's local yyyy-MM-dd (for the age-out prune only).

    fun ledgerIsApplied(uuid: String, programId: String): Boolean =
        prefs.contains(ledgerKey(uuid, programId))

    /** Record a group's samples as applied to one program. Call ONLY after a `.created`/`.summed` write. */
    fun ledgerMarkApplied(uuids: List<String>, programId: String, date: String) {
        if (uuids.isEmpty()) return
        prefs.edit { uuids.forEach { putString(ledgerKey(it, programId), date) } }
    }

    /** Drop ledger entries whose workout day is older than `LEDGER_MAX_AGE_DAYS`. Called at each sync start. */
    fun ledgerPrune() {
        val cutoff = HealthDates.localYMD(System.currentTimeMillis() - LEDGER_MAX_AGE_DAYS * DAY_MS)
        val stale = prefs.all.filter { (k, v) ->
            k.startsWith("$LEDGER_PREFIX|") && v is String && v < cutoff
        }.keys
        if (stale.isNotEmpty()) prefs.edit { stale.forEach { remove(it) } }
    }

    fun ledgerClear() {
        val keys = prefs.all.keys.filter { it.startsWith("$LEDGER_PREFIX|") }
        if (keys.isNotEmpty()) prefs.edit { keys.forEach { remove(it) } }
    }

    private fun ledgerKey(uuid: String, programId: String) = "$LEDGER_PREFIX|$uuid|$programId"

    private companion object {
        const val DAY_MS = 86_400_000L
        const val LEDGER_MAX_AGE_DAYS = 45
        const val LEDGER_PREFIX = "hc.ledger"
    }
}
