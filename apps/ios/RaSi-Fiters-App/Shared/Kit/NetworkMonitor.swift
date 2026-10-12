import Foundation
import Combine
import Network

/// One app-wide, link-level connectivity monitor (frontend-kit SPEC §5, D-KIT-7) — the web
/// `useOnlineStatus` / Android `ConnectivityObserver` analog. NOT started in Phase 2; Phase 3 calls
/// `NetworkMonitor.shared.start()` once at launch. Updates are delivered on the main queue, so the
/// MainActor-isolated state is only touched on the main thread.
final class NetworkMonitor: ObservableObject {
    static let shared = NetworkMonitor()

    @Published private(set) var isOnline = true

    private let monitor = NWPathMonitor()
    private var isStarted = false

    /// Idempotent. Runs for the app's lifetime (an `NWPathMonitor` cannot restart after `cancel()`).
    func start() {
        guard !isStarted else { return }
        isStarted = true
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            MainActor.assumeIsolated {
                // Path updates also fire on interface hand-offs (Wi-Fi ↔ cellular) with no status change;
                // publishing only real changes keeps observers from re-rendering on each one.
                guard let self, self.isOnline != online else { return }
                self.isOnline = online
            }
        }
        monitor.start(queue: .main)
    }
}
