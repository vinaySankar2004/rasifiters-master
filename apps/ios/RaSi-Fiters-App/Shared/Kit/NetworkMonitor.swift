import Foundation
import Combine
import Network
import UIKit

/// The one app-wide connectivity monitor (frontend-kit SPEC §5) — the web `useOnlineStatus` / Android
/// `ConnectivityObserver` analog, started once at launch (AppDelegate). polish-1 (supersedes D-KIT-7's link-only rule):
/// `isOnline = linkUp && !provenOffline`. A link (`NWPathMonitor` `.satisfied`) can be up with no internet behind it (a
/// developer link, a dead or captive Wi-Fi, a just-toggled airplane mode), so an API request failing with a
/// no-connection error proves offline (`APIClient.transport`) until any HTTP answer, the link coming up, or the probe
/// clears it. Path updates arrive on the main queue, so every bit of state stays on the main actor.
final class NetworkMonitor: ObservableObject {
    static let shared = NetworkMonitor()

    @Published private(set) var isOnline = true

    private let monitor = NWPathMonitor()
    private var isStarted = false
    private var linkUp = true
    private var provenOffline = false
    private var isForeground = true
    private var probeTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    /// polish-1 rule 2: the `URLError`s that mean no connection. A timeout (a slow server) and TLS failures are not.
    private static let noConnectionCodes: Set<URLError.Code> = [
        .notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost,
        .dnsLookupFailed, .internationalRoamingOff, .dataNotAllowed
    ]

    /// Idempotent. Runs for the app's lifetime (an `NWPathMonitor` cannot restart after `cancel()`).
    func start() {
        guard !isStarted else { return }
        isStarted = true
        isForeground = UIApplication.shared.applicationState != .background      // a HealthKit wake launches in background
        monitor.pathUpdateHandler = { [weak self] path in
            let up = path.status == .satisfied
            MainActor.assumeIsolated { self?.linkChanged(up) }
        }
        monitor.start(queue: .main)
        NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .sink { [weak self] _ in self?.foregroundChanged(true) }
            .store(in: &cancellables)
        NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)
            .sink { [weak self] _ in self?.foregroundChanged(false) }
            .store(in: &cancellables)
    }

    /// From `APIClient.transport`: a request failed (rule 2 — only a no-connection error proves offline).
    func requestFailed(_ error: Error) {
        guard let code = (error as? URLError)?.code, Self.noConnectionCodes.contains(code), !provenOffline else { return }
        provenOffline = true
        update()
    }

    /// From `APIClient.transport`: a request got an HTTP answer (rule 3 — any status). One URLCache may have served
    /// without the network proves nothing: a GET whose response is cacheable (app-config's `max-age=300`, D-C2).
    func requestAnswered(_ request: URLRequest, _ response: HTTPURLResponse) {
        guard provenOffline else { return }
        let cacheable = request.cachePolicy == .useProtocolCachePolicy && (request.httpMethod ?? "GET") == "GET"
            && (response.value(forHTTPHeaderField: "Cache-Control")?.contains("max-age") ?? false)
        guard !cacheable else { return }
        provenOffline = false
        update()
    }

    private func linkChanged(_ up: Bool) {
        guard up != linkUp else {
            // An interface hand-off with no status change (Wi-Fi / cellular joined while a developer link kept the path
            // satisfied) doesn't clear on its own — while proven offline it restarts the probe, which probes at once.
            if up, provenOffline { restartProbe() }
            return
        }
        linkUp = up
        if up { provenOffline = false }
        update()
    }

    private func restartProbe() {
        probeTask?.cancel()
        probeTask = nil
        update()
    }

    private func foregroundChanged(_ foreground: Bool) {
        guard foreground != isForeground else { return }
        isForeground = foreground
        update()
    }

    /// Publishes only real changes (no re-render per path update) and runs the probe exactly while it's needed.
    private func update() {
        let online = linkUp && !provenOffline
        if isOnline != online {
            isOnline = online
            // auth §3.1 / amendment A3: back online → a refresh may run again at once (no offline back-off).
            if online { APIClient.shared.clearRefreshBackoff() }
        }
        // Rule 4: probe only while proven offline, in the foreground, over an up link.
        let needsProbe = provenOffline && linkUp && isForeground
        if needsProbe, probeTask == nil {
            probeTask = Task {
                // Probe now, then every 10 s; an answer clears `provenOffline` (via transport) → update() cancels this.
                while !Task.isCancelled {
                    await APIClient.shared.probeReachability()
                    do { try await Task.sleep(for: .seconds(10)) } catch { return }
                }
            }
        } else if !needsProbe, let task = probeTask {
            task.cancel()
            probeTask = nil
        }
    }
}
