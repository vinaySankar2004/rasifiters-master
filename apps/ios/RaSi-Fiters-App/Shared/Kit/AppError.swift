import Foundation

/// The shared error vocabulary (frontend-kit SPEC §4) — identical kinds, status rules and copy on web
/// (`src/lib/kit/app-error.ts`) and Android (`core/kit/AppError.kt`). The kit only LABELS errors; it never
/// signs anyone out (sign-out policy is the sessions contract, DESIGN_BOARD §2).
///
/// Scope rule — credential endpoints (SPEC §4): on login, sign-up, OAuth (Google / Apple), link / unlink,
/// set / change password and the email re-auth, a 401 means wrong credentials, not an ended session. Those
/// callers keep the server's own text and do NOT route errors through `AppError(_:)` / `fromHTTP` — a 401
/// there must never become `.signedOut` ("Your session has ended").
enum AppErrorKind: String {
    case offline, timeout, signedOut, forbidden, notFound, conflict, invalidInput, updateRequired, unavailable, server, unknown
}

struct AppError: LocalizedError {
    let kind: AppErrorKind
    /// User-facing copy (raw server text only for `.invalidInput` or when `rowErrors` are present).
    let message: String
    let status: Int?
    /// Backend machine code when known (`session_invalid`, `auth_unavailable`). Never changes `kind`.
    let code: String?
    /// Whole seconds from a `Retry-After` header (`.unavailable`).
    let retryAfter: Int?
    /// Per-row errors from the batch log endpoints (Add-workouts / Add-health row highlighting).
    let rowErrors: [APIClient.BulkRowError]

    var errorDescription: String? { message }

    var isRetryable: Bool {
        switch kind {
        case .offline, .timeout, .unavailable, .server, .unknown: return true
        case .signedOut, .forbidden, .notFound, .conflict, .invalidInput, .updateRequired: return false
        }
    }

    init(
        kind: AppErrorKind,
        message: String? = nil,
        status: Int? = nil,
        code: String? = nil,
        retryAfter: Int? = nil,
        rowErrors: [APIClient.BulkRowError] = []
    ) {
        self.kind = kind
        self.message = message ?? KitCopy.message(for: kind)
        self.status = status
        self.code = code
        self.retryAfter = retryAfter
        self.rowErrors = rowErrors
    }

    /// Any thrown error → AppError. `nil` for cancellation: a superseded load is not a failure (D-KIT-4).
    /// Not for credential endpoints (see the scope rule above).
    init?(_ error: Error) {
        if let appError = error as? AppError {
            self = appError
        } else if error is CancellationError {
            return nil
        } else if let urlError = error as? URLError {
            switch urlError.code {
            case .cancelled: return nil
            case .timedOut: self = AppError(kind: .timeout)
            default: self = AppError(kind: .offline)
            }
        } else if let httpError = error as? APIHTTPError {
            self = AppError.fromHTTP(status: httpError.statusCode, serverMessage: httpError.message)
        } else if let bulkError = error as? APIClient.BulkWorkoutError {
            // No status until Phase 3 (D-KIT-5). With rowErrors it is the batch forms' row-level 400 / 409 →
            // invalidInput + the server's text (web / Android label a 409 `conflict`; same text shown).
            // Without rowErrors the status is unknowable → unknown.
            self = bulkError.rowErrors.isEmpty
                ? AppError(kind: .unknown)
                : AppError(kind: .invalidInput, message: AppError.serverText(bulkError.message), rowErrors: bulkError.rowErrors)
        } else {
            // `APIError` carries no status until Phase 3 sessions adds one (D-KIT-5); `DecodingError` and
            // anything else → unknown.
            self = AppError(kind: .unknown)
        }
    }

    /// Pure HTTP → AppError mapping: the status decides the kind; `code` is carried, never decisive.
    /// A 401 maps to `.signedOut` for display only — except on credential endpoints (scope rule above).
    static func fromHTTP(
        status: Int,
        code: String? = nil,
        retryAfter: Int? = nil,
        serverMessage: String? = nil,
        rowErrors: [APIClient.BulkRowError] = []
    ) -> AppError {
        let resolved = Self.kindFor(status: status)
        let useServerText = resolved == .invalidInput || !rowErrors.isEmpty
        return AppError(
            kind: resolved,
            message: useServerText ? serverText(serverMessage) : nil,
            status: status,
            code: code,
            retryAfter: retryAfter,
            rowErrors: rowErrors
        )
    }

    /// The server's text when it is specific (non-empty, not the generic `Request failed (N)`), else nil.
    static func serverText(_ message: String?) -> String? {
        let text = message?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty || text.hasPrefix("Request failed (") ? nil : text
    }

    /// `Retry-After` → whole seconds within Int32 (Android's range); anything else (incl. an HTTP-date) → nil.
    static func parseRetryAfter(_ value: String?) -> Int? {
        guard let text = value?.trimmingCharacters(in: .whitespaces), !text.isEmpty,
              text.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
        return Int32(text).map(Int.init)
    }

    private static func kindFor(status: Int) -> AppErrorKind {
        switch status {
        case 400, 422: return .invalidInput
        case 401: return .signedOut
        case 403: return .forbidden
        case 404: return .notFound
        case 408: return .timeout
        case 409: return .conflict
        case 426: return .updateRequired
        case 429, 503: return .unavailable
        case 500...: return .server
        default: return .unknown
        }
    }
}
