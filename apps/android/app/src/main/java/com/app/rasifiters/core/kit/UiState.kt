package com.app.rasifiters.core.kit

/** One async state per screen (frontend-kit SPEC §5) — the same five states as web `AsyncState` and iOS
 *  `LoadState`. "Empty" is a view decision on [Loaded] data, not a state. */
sealed interface UiState<out T> {
    data object Idle : UiState<Nothing>
    data object Loading : UiState<Nothing>
    data class Loaded<out T>(val data: T, val fetchedAt: Long, val refreshing: Boolean = false) : UiState<T>
    data class Failed(val error: AppError) : UiState<Nothing>
    data class Stale<out T>(val data: T, val fetchedAt: Long, val error: AppError) : UiState<T>

    companion object {
        /** A just-fetched value. */
        fun <T> fresh(data: T): UiState<T> = Loaded(data, System.currentTimeMillis())
    }
}

val <T> UiState<T>.dataOrNull: T?
    get() = when (this) {
        is UiState.Loaded -> data
        is UiState.Stale -> data
        else -> null
    }

val UiState<*>.errorOrNull: AppError?
    get() = when (this) {
        is UiState.Failed -> error
        is UiState.Stale -> error
        else -> null
    }

/** A reload starts: keep any data (W7-D2), otherwise show loading. */
fun <T> UiState<T>.refreshing(): UiState<T> = when (this) {
    is UiState.Loaded -> UiState.Loaded(data, fetchedAt, refreshing = true)
    is UiState.Stale -> UiState.Loaded(data, fetchedAt, refreshing = true)
    else -> UiState.Loading
}

/** A load failed: with data → Stale (keep data + banner), without → Failed (error view). */
fun <T> UiState<T>.failing(error: AppError): UiState<T> = when (this) {
    is UiState.Loaded -> UiState.Stale(data, fetchedAt, error)
    is UiState.Stale -> UiState.Stale(data, fetchedAt, error)
    else -> UiState.Failed(error)
}
