import Foundation
import CryptoKit

/// Instant opens (board §6 item 5, D-9): the last good 2xx body of each launch-screen GET (program picker + Summary),
/// on disk per member, shown first and then refreshed. Raw bytes, so no DTO needs Encodable. Written only while the
/// session that asked is still the live one (amendment A14); cleared by the sign-out teardown (every member).
final class LaunchCache {
    static let shared = LaunchCache()
    private init() {}

    private let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("launch-cache", isDirectory: true)

    func data(for url: URL) -> Data? {
        guard let file = fileURL(for: url) else { return nil }
        return try? Data(contentsOf: file)
    }

    /// `epoch` = `SessionStore.epoch` when the request started: a response that lands after a sign-out is dropped.
    func store(_ data: Data, for url: URL, epoch: Int) {
        guard epoch == SessionStore.shared.epoch, SessionStore.shared.accessToken != nil,
              let file = fileURL(for: url) else { return }
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: file, options: .atomic)
    }

    func clearAll() { try? FileManager.default.removeItem(at: root) }

    /// `<root>/<member id>/<sha256 of path?query>`; nil when nobody is signed in.
    private func fileURL(for url: URL) -> URL? {
        guard let member = SessionStore.shared.memberId else { return nil }
        let key = url.path + "?" + (url.query ?? "")
        let digest = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        return root.appendingPathComponent(member, isDirectory: true).appendingPathComponent(digest)
    }
}

extension APIClient {
    enum LaunchRead { case network, cacheOnly }
    struct LaunchCacheMiss: Error {}

    /// Launch-screen GET: `.network` fetches (central auth path) and stores the 2xx body; `.cacheOnly` returns the
    /// stored body for the identical URL or throws `LaunchCacheMiss`.
    func launchData(for request: URLRequest, _ read: LaunchRead) async throws -> Data {
        guard let url = request.url else { throw LaunchCacheMiss() }
        switch read {
        case .cacheOnly:
            guard let cached = LaunchCache.shared.data(for: url) else { throw LaunchCacheMiss() }
            return cached
        case .network:
            let epoch = SessionStore.shared.epoch
            let data = try await data(for: request)
            LaunchCache.shared.store(data, for: url, epoch: epoch)
            return data
        }
    }
}
