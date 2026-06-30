import Foundation

final class SessionStore {
    static let shared = SessionStore()

    private let accessTokenKey = "auth.access_token"
    private let refreshTokenKey = "auth.refresh_token"

    private init() {}

    var accessToken: String? {
        KeychainService.loadString(for: accessTokenKey)
    }

    var refreshToken: String? {
        KeychainService.loadString(for: refreshTokenKey)
    }

    func saveTokens(accessToken: String?, refreshToken: String?) {
        if let accessToken {
            KeychainService.saveString(accessToken, for: accessTokenKey)
        } else {
            KeychainService.delete(accessTokenKey)
        }

        if let refreshToken {
            KeychainService.saveString(refreshToken, for: refreshTokenKey)
        } else {
            KeychainService.delete(refreshTokenKey)
        }
    }

    func clearTokens() {
        KeychainService.delete(accessTokenKey)
        KeychainService.delete(refreshTokenKey)
    }
}
