import Foundation

/// Every user-facing string the frontend kit shows — verbatim the frontend-kit SPEC §3 copy table.
/// Web (`src/lib/kit/copy.ts`) and Android (`core/kit/KitCopy.kt`) carry the identical strings: change all
/// three + the SPEC table in one commit (D-KIT-2).
nonisolated enum KitCopy {
    static let retry = "Retry"
    static let update = "Update"
    static let dismiss = "Dismiss"
    static let bannerOffline = "You're offline"
    static let bannerStale = "Couldn't refresh"
    static let bannerUpdate = "A new version of RaSi Fiters is available"
    static let errorViewTitle = "Couldn't load this"

    static func message(for kind: AppErrorKind) -> String {
        switch kind {
        case .offline: return "Can't connect. Check your internet connection and try again."
        case .timeout: return "This is taking longer than usual. Try again."
        case .signedOut: return "Your session has ended. Please sign in again."
        case .forbidden: return "You don't have access to this."
        case .notFound: return "We couldn't find that. It may have been removed."
        case .conflict: return "That conflicts with something already saved. Refresh and try again."
        case .invalidInput: return "Some details aren't valid. Check them and try again."
        case .updateRequired: return "This version of RaSi Fiters is no longer supported. Please update the app."
        case .unavailable: return "RaSi Fiters is busy right now. Try again in a moment."
        case .server: return "Something went wrong on our end. Try again."
        case .unknown: return "Something went wrong. Try again."
        }
    }
}
