import SwiftUI

/// Polish #29 (the frontend-kit one-detail-load-helper rule): the ONE way a screen region shows a `LoadState` — the
/// Summary recipe, so a detail screen never shows a blank page, raw text or "No data" when its load failed.
///   idle / loading → `placeholder` (the screen's own skeleton, or the default spinner); offline → the offline
///                    ErrorStateView, never a spinner that can't finish (polish #29 / PA9)
///   failed         → ErrorStateView + Retry, offline-labelled (polish-1 rule 6)
///   loaded / stale → `content(value)`; the stale banner + reconnect reload are the root's `.loadStateChrome(…)`.
struct LoadStateContent<Value, Placeholder: View, Content: View>: View {
    @EnvironmentObject private var programContext: ProgramContext
    private let state: LoadState<Value>
    private let onRetry: () -> Void
    private let placeholder: () -> Placeholder
    private let content: (Value) -> Content

    init(state: LoadState<Value>, onRetry: @escaping () -> Void,
         @ViewBuilder placeholder: @escaping () -> Placeholder,
         @ViewBuilder content: @escaping (Value) -> Content) {
        self.state = state
        self.onRetry = onRetry
        self.placeholder = placeholder
        self.content = content
    }

    var body: some View {
        switch state {
        case .idle, .loading:
            if programContext.isOnline {
                placeholder()
            } else {
                ErrorStateView(error: AppError(kind: .offline), onRetry: onRetry)
                    .frame(maxWidth: .infinity)
            }
        case .failed(let error):
            ErrorStateView(error: error.labeled(online: programContext.isOnline), onRetry: onRetry)
                .frame(maxWidth: .infinity)
        case .loaded(let value, _, _), .stale(let value, _, _):
            content(value)
        }
    }
}

extension LoadStateContent where Placeholder == LoadingPlaceholder {
    /// The default placeholder: a centred spinner (the timelines' existing loading look).
    init(state: LoadState<Value>, minHeight: CGFloat = 240, onRetry: @escaping () -> Void,
         @ViewBuilder content: @escaping (Value) -> Content) {
        self.init(state: state, onRetry: onRetry, placeholder: { LoadingPlaceholder(minHeight: minHeight) }, content: content)
    }
}

/// The default loading placeholder.
struct LoadingPlaceholder: View {
    var minHeight: CGFloat = 240

    var body: some View {
        ProgressView()
            .frame(maxWidth: .infinity, minHeight: minHeight, alignment: .center)
    }
}

/// The screen-root half of the recipe (D-KIT-13): the screen's one banner — a failed action (dismissable, polish #9)
/// beats "Couldn't refresh · Retry" over kept data, as on the program picker — hidden while offline (`ScreenBanner`,
/// A6), with its band reserved so the last row is never under it, and a reload when the connection comes back after a
/// failed load. Apply ONCE at the screen root (never inside a ScrollView).
struct LoadStateChrome: ViewModifier {
    @EnvironmentObject private var programContext: ProgramContext
    let isStale: Bool
    let hasError: Bool
    let actionError: AppError?
    let onDismissError: (() -> Void)?
    let onRetry: () -> Void

    private var banner: FloatingBanner? {
        if let actionError { return FloatingBanner(variant: .error(actionError), onDismiss: onDismissError) }
        if isStale { return FloatingBanner(variant: .stale, onRetry: onRetry) }
        return nil
    }

    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if banner != nil && programContext.isOnline {
                    Color.clear.frame(height: 76)       // 52 min height + 12 margin + 12 clearance (OfflineBanner)
                }
            }
            .floatingBanner {
                ScreenBanner(banner: banner)
            }
            .onChange(of: programContext.isOnline) { _, online in
                if online, hasError { onRetry() }      // D-IOS-KIT-3: refetch on reconnect
            }
    }
}

extension View {
    /// `actionError` + `onDismissError`: a failed action on this screen (polish #9) — shown in place of the stale banner
    /// until dismissed.
    func loadStateChrome<Value>(_ state: LoadState<Value>, actionError: AppError? = nil,
                                onDismissError: (() -> Void)? = nil, onRetry: @escaping () -> Void) -> some View {
        var isStale = false
        if case .stale = state { isStale = true }
        return modifier(LoadStateChrome(isStale: isStale, hasError: state.error != nil, actionError: actionError,
                                        onDismissError: onDismissError, onRetry: onRetry))
    }
}

/// One fetch as a load outcome: the value, or its AppError; nil = cancelled / superseded (`task(id:)` restarted, the
/// screen went away) — the caller leaves its state alone. Rule (polish #34): apply the outcome to the state AS IT IS
/// AFTER the await (`state.applying(outcome)`), and drop it when the screen's key (period / sort / filter / search)
/// changed meanwhile — a Retry or reconnect load is an unstructured Task that nothing cancels.
func loadOutcome<Value>(_ fetch: () async throws -> Value) async -> Result<Value, AppError>? {
    do {
        let value = try await fetch()
        return Task.isCancelled ? nil : .success(value)
    } catch {
        guard !Task.isCancelled, let appError = AppError(error) else { return nil }
        return .failure(appError)
    }
}

extension LoadState {
    /// A load's outcome on the current state: fresh; or failing (stale when data is kept, else failed).
    func applying(_ outcome: Result<Value, AppError>) -> LoadState {
        switch outcome {
        case .success(let value): return .fresh(value)
        case .failure(let error): return failing(with: error)
        }
    }

    /// The same state with its value edited in place (a row edited or deleted on this screen).
    func mapValue(_ transform: (Value) -> Value) -> LoadState {
        switch self {
        case .loaded(let value, let fetchedAt, let refreshing):
            return .loaded(transform(value), fetchedAt: fetchedAt, refreshing: refreshing)
        case .stale(let value, let fetchedAt, let error):
            return .stale(transform(value), fetchedAt: fetchedAt, error: error)
        case .idle, .loading, .failed:
            return self
        }
    }
}
