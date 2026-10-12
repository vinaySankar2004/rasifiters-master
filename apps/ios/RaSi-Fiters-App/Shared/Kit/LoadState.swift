import Foundation

/// One async state per screen (frontend-kit SPEC §5) — the same five states as web `AsyncState` and
/// Android `UiState`. "Empty" is a view decision on `.loaded` data, not a state.
enum LoadState<Value> {
    case idle
    case loading
    case loaded(Value, fetchedAt: Date, refreshing: Bool)
    case failed(AppError)
    case stale(Value, fetchedAt: Date, error: AppError)

    /// A just-fetched value.
    static func fresh(_ value: Value) -> LoadState {
        .loaded(value, fetchedAt: Date(), refreshing: false)
    }

    var value: Value? {
        switch self {
        case .loaded(let value, _, _), .stale(let value, _, _): return value
        case .idle, .loading, .failed: return nil
        }
    }

    var error: AppError? {
        switch self {
        case .failed(let error), .stale(_, _, let error): return error
        case .idle, .loading, .loaded: return nil
        }
    }

    /// A reload starts: keep any data (W7-D2), otherwise show loading.
    func refreshing() -> LoadState {
        switch self {
        case .loaded(let value, let fetchedAt, _), .stale(let value, let fetchedAt, _):
            return .loaded(value, fetchedAt: fetchedAt, refreshing: true)
        case .idle, .loading, .failed:
            return .loading
        }
    }

    /// A load failed: with data → stale (keep data + banner), without → failed (error view).
    func failing(with error: AppError) -> LoadState {
        switch self {
        case .loaded(let value, let fetchedAt, _), .stale(let value, let fetchedAt, _):
            return .stale(value, fetchedAt: fetchedAt, error: error)
        case .idle, .loading, .failed:
            return .failed(error)
        }
    }
}
