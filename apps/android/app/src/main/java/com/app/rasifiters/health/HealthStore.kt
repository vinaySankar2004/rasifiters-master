package com.app.rasifiters.health

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

/**
 * Client-persisted Health Connect sync state — the Android analog of the iOS Apple-Health `UserDefaults` keys and
 * the first-sync gating. Since health-sync v2 the server remembers the review + last success (`/health-sync/state`);
 * this store keeps the toggles, selections, changes token, local confirms/exclusions and the upgrade bookkeeping.
 *
 * Per member (health-sync §8 rule 7): every key is `m.<memberId>.<name>`; with no member signed in, reads return the
 * default and writes are no-ops. The file `rasi.health` is excluded from Auto Backup (backup_rules.xml).
 */
class HealthStore private constructor(
    private val prefs: SharedPreferences,
    private val memberId: () -> String?,
    private val beforeWrite: () -> Unit,
) {
    constructor(context: Context, memberId: () -> String?) :
        this(context.applicationContext.getSharedPreferences("rasi.health", Context.MODE_PRIVATE), memberId, {})

    /** A view pinned to [id] for ONE sync run: its keys never follow a later sign-in, and [beforeWrite] runs before every
     *  write (the runner throws there to abort when the session moved on). */
    fun pinnedTo(id: String, beforeWrite: () -> Unit) = HealthStore(prefs, { id }, beforeWrite)

    // ── Flow selector: workouts / sleep / steps share the same code paths, keyed by prefix ──
    enum class Flow(val prefix: String, val kind: String) { WORKOUTS("hc", "workout"), SLEEP("hc.sleep", "sleep"), STEPS("hc.steps", "steps") }

    // ── Workout settings ──
    var workoutEnabled: Boolean
        get() = bool("hc.enabled")
        set(v) = putBool("hc.enabled", v)
    var workoutProgramIds: Set<String>
        get() = set("hc.syncProgramIds")
        set(v) = putSet("hc.syncProgramIds", v)
    var lastWorkoutSyncMillis: Long
        get() = long("hc.lastSyncMillis")
        set(v) = putLong("hc.lastSyncMillis", v)
    var lastWorkoutSyncCount: Int
        get() = int("hc.lastSyncCount")
        set(v) = putInt("hc.lastSyncCount", v)
    var lastWorkoutSyncFailed: Boolean
        get() = bool("hc.lastSyncFailed")
        set(v) = putBool("hc.lastSyncFailed", v)
    /** (Re)connect timestamp: the floor of a workout window read (H2). 0 = unset. */
    var workoutConnectMillis: Long
        get() = long("hc.connectMillis")
        set(v) = putLong("hc.connectMillis", v)
    /** The Health Connect changes token (the anchor analog) — committed ONLY after a run that may advance (rule 5). */
    var workoutChangesToken: String?
        get() = string("hc.changesToken")
        set(v) = putString("hc.changesToken", v)

    // ── Sleep settings ──
    var sleepEnabled: Boolean
        get() = bool("hc.sleep.enabled")
        set(v) = putBool("hc.sleep.enabled", v)
    var sleepProgramIds: Set<String>
        get() = set("hc.sleep.syncProgramIds")
        set(v) = putSet("hc.sleep.syncProgramIds", v)
    var lastSleepSyncMillis: Long
        get() = long("hc.sleep.lastSyncMillis")
        set(v) = putLong("hc.sleep.lastSyncMillis", v)
    var lastSleepSyncCount: Int
        get() = int("hc.sleep.lastSyncCount")
        set(v) = putInt("hc.sleep.lastSyncCount", v)
    var lastSleepSyncFailed: Boolean
        get() = bool("hc.sleep.lastSyncFailed")
        set(v) = putBool("hc.sleep.lastSyncFailed", v)
    var sleepConnectMillis: Long
        get() = long("hc.sleep.connectMillis")
        set(v) = putLong("hc.sleep.connectMillis", v)

    // ── Steps settings ──
    var stepsEnabled: Boolean
        get() = bool("hc.steps.enabled")
        set(v) = putBool("hc.steps.enabled", v)
    var stepsProgramIds: Set<String>
        get() = set("hc.steps.syncProgramIds")
        set(v) = putSet("hc.steps.syncProgramIds", v)
    var lastStepsSyncMillis: Long
        get() = long("hc.steps.lastSyncMillis")
        set(v) = putLong("hc.steps.lastSyncMillis", v)
    var lastStepsSyncCount: Int
        get() = int("hc.steps.lastSyncCount")
        set(v) = putInt("hc.steps.lastSyncCount", v)
    var lastStepsSyncFailed: Boolean
        get() = bool("hc.steps.lastSyncFailed")
        set(v) = putBool("hc.steps.lastSyncFailed", v)
    var stepsConnectMillis: Long
        get() = long("hc.steps.connectMillis")
        set(v) = putLong("hc.steps.connectMillis", v)

    // ── v2 bookkeeping (health-sync §8 rule 9) ──
    var v2Initialized: Boolean
        get() = bool("hc.v2.initialized")
        set(v) = putBool("hc.v2.initialized", v)
    /** Set only when the old build left a ledger (H3): the workout first-sync rule reads today − 30 d, never the connect date. */
    var upgradeMarker: Boolean
        get() = bool("hc.v2.upgradeMarker")
        set(v) = putBool("hc.v2.upgradeMarker", v)
    /** review_done entries (`<programId>|<kind>`) not yet accepted by PUT /state: the rule-9 carry-over plus user
     *  confirms whose PUT failed. A silent 0-row confirm is never added (H1). */
    var pendingReviewDone: Set<String>
        get() = set("hc.v2.pendingReviewDone")
        set(v) = putSet("hc.v2.pendingReviewDone", v)

    fun addPendingReviewDone(programId: String, flow: Flow) { pendingReviewDone = pendingReviewDone + "$programId|${flow.kind}" }

    // ── First-sync gating (local confirms; the server's review_done_at also confirms — rule 6) ──

    fun confirmedProgramIds(flow: Flow): Set<String> = set("${flow.prefix}.confirmedProgramIds")

    fun markProgramConfirmed(id: String, flow: Flow) {
        val current = confirmedProgramIds(flow)
        if (id !in current) putSet("${flow.prefix}.confirmedProgramIds", current + id)
    }

    fun excludedKeys(flow: Flow): Set<String> = set("${flow.prefix}.excludedKeys")

    fun addExcludedKeys(keys: Collection<String>, flow: Flow) {
        if (keys.isEmpty()) return
        putSet("${flow.prefix}.excludedKeys", excludedKeys(flow) + keys)
    }

    /** Drop excluded keys (`…|yyyy-MM-dd`) older than [keepDays] — they can never be re-read. */
    fun pruneExcludedKeys(flow: Flow, keepDays: Long) {
        val keys = excludedKeys(flow)
        if (keys.isEmpty()) return
        val cutoff = HealthDates.localYMD(System.currentTimeMillis() - keepDays * DAY_MS)
        val kept = keys.filter { key -> key.substringAfterLast('|') >= cutoff }.toSet()
        if (kept.size != keys.size) putSet("${flow.prefix}.excludedKeys", kept)
    }

    // ── The old build's applied-sample ledger (rule 9) — read + retired only, never written ──

    data class LedgerEntry(val key: String, val sampleId: String, val programId: String, val date: String)

    /** The old build's `hc.ledger|<uuid>|<programId>` → date entries. */
    fun ledgerEntries(): List<LedgerEntry> {
        val prefix = key("hc.ledger|") ?: return emptyList()
        return prefs.all.mapNotNull { (k, v) ->
            if (!k.startsWith(prefix) || v !is String) return@mapNotNull null
            val parts = k.removePrefix(prefix).split('|')
            if (parts.size != 2) null else LedgerEntry(k, parts[0], parts[1], v)
        }
    }

    fun ledgerRemove(fullKey: String) { beforeWrite(); prefs.edit { remove(fullKey) } }

    /** One-shot (W4 §8): move the old build's un-namespaced keys under [memberId] — the member signed in at upgrade,
     *  else the first one to sign in afterwards. */
    fun adoptLegacyKeys(memberId: String) {
        if (prefs.getBoolean(ADOPTED, false)) return
        val legacy = prefs.all.filterKeys { !it.startsWith("m.") && it != ADOPTED }
        prefs.edit {
            legacy.forEach { (k, v) ->
                val nk = "m.$memberId.$k"
                when (v) {
                    is Boolean -> putBoolean(nk, v)
                    is Long -> putLong(nk, v)
                    is Int -> putInt(nk, v)
                    is Float -> putFloat(nk, v)
                    is String -> putString(nk, v)
                    is Set<*> -> putStringSet(nk, v.filterIsInstance<String>().toSet())
                }
                remove(k)
            }
            putBoolean(ADOPTED, true)
        }
    }

    // ── Per-member key helpers ──

    private fun key(name: String): String? = memberId()?.let { "m.$it.$name" }
    private fun bool(name: String): Boolean = key(name)?.let { prefs.getBoolean(it, false) } ?: false
    private fun putBool(name: String, v: Boolean) { beforeWrite(); key(name)?.let { k -> prefs.edit { putBoolean(k, v) } } }
    private fun long(name: String): Long = key(name)?.let { prefs.getLong(it, 0L) } ?: 0L
    private fun putLong(name: String, v: Long) { beforeWrite(); key(name)?.let { k -> prefs.edit { putLong(k, v) } } }
    private fun int(name: String): Int = key(name)?.let { prefs.getInt(it, 0) } ?: 0
    private fun putInt(name: String, v: Int) { beforeWrite(); key(name)?.let { k -> prefs.edit { putInt(k, v) } } }
    private fun set(name: String): Set<String> = key(name)?.let { prefs.getStringSet(it, emptySet())?.toSet() } ?: emptySet()
    private fun putSet(name: String, v: Set<String>) { beforeWrite(); key(name)?.let { k -> prefs.edit { putStringSet(k, v) } } }
    private fun string(name: String): String? = key(name)?.let { prefs.getString(it, null) }
    private fun putString(name: String, v: String?) {
        beforeWrite()
        key(name)?.let { k -> prefs.edit { if (v == null) remove(k) else putString(k, v) } }
    }

    private companion object {
        const val DAY_MS = 86_400_000L
        const val ADOPTED = "v2.legacyAdopted"
    }
}
