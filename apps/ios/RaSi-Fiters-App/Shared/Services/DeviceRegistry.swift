import Foundation
import Security

/// notifications §3.1 — this installation's push identity: a keychain install id (`…ThisDeviceOnly`, never copied to
/// another device) + ONE serial queue for register / unregister, so an unregister never lands after the next
/// sign-in's registration. iOS keeps the APNs token value itself (the login ride-along re-sends it; D-IOS-PUSH-1).
/// Cadence (amendment A12): `PUT /device` at most once per 12 h for the same token, and one unregister per denial.
final class DeviceRegistry {
    static let shared = DeviceRegistry()
    private init() {}

    private static let installService = "com.app.rasifiters.install-id"
    private static let installAccount = "install_id"
    private static let registeredTokenKey = "push.registeredToken"
    private static let registeredAtKey = "push.registeredAt"
    private static let deniedUnregisteredKey = "push.deniedUnregistered"
    private static let registerInterval: TimeInterval = 12 * 60 * 60
    private var tail: Task<Void, Never>?
    private var retryDelay: Task<Void, Never>?
    private var generation = 0

    /// The install UUID (lower-case), created on first use. nil only while the keychain is locked / failing.
    var installId: String? {
        switch KeychainService.read(Self.installAccount, service: Self.installService) {
        case .found(let data):
            return String(data: data, encoding: .utf8)
        case .notFound:
            let id = UUID().uuidString.lowercased()
            let status = KeychainService.write(Data(id.utf8), for: Self.installAccount, service: Self.installService)
            return status == errSecSuccess ? id : nil
        case .locked, .failure:
            return nil
        }
    }

    var pushToken: String? {
        guard let token = UserDefaults.standard.string(forKey: PushTokenNotification.userDefaultsKey), !token.isEmpty else { return nil }
        return token
    }

    /// The login ride-along fields for `/auth/login*` and `/auth/oauth` (call after `beginSignIn()`). No `push_token`
    /// while notification permission is denied — the sign-in must not re-register a device the user turned off.
    func signInFields() -> [String: String] {
        var fields = ["platform": "ios"]
        if let pushToken, !UserDefaults.standard.bool(forKey: Self.deniedUnregisteredKey) { fields["push_token"] = pushToken }
        if let installId { fields["device_id"] = installId }
        return fields
    }

    /// Ordering rule: a sign-in drops a pending unregister retry and waits for anything in flight.
    func beginSignIn() async {
        generation += 1
        retryDelay?.cancel()
        await tail?.value
    }

    /// PUT /device while signed in (token rotation / the foreground re-registration, after `/oauth/complete`).
    /// nil = re-send the stored APNs token. Skipped when this token was registered < 12 h ago (A12).
    func register(pushToken token: String? = nil) {
        let defaults = UserDefaults.standard
        if let token { defaults.set(token, forKey: PushTokenNotification.userDefaultsKey) }
        guard let pushToken = token ?? self.pushToken else { return }
        if defaults.string(forKey: Self.registeredTokenKey) == pushToken,
           let registeredAt = defaults.object(forKey: Self.registeredAtKey) as? Date,
           Date().timeIntervalSince(registeredAt) < Self.registerInterval { return }
        enqueue {
            guard SessionStore.shared.accessToken != nil else { return }
            guard (try? await APIClient.shared.registerDevice(pushToken: pushToken, deviceId: self.installId)) != nil else { return }
            defaults.set(pushToken, forKey: Self.registeredTokenKey)
            defaults.set(Date(), forKey: Self.registeredAtKey)
        }
    }

    /// Notification permission seen on a foreground: granted re-arms the denial memo (the registration itself comes
    /// through `didRegisterForRemoteNotifications`); denied unregisters once per denial (A12).
    func notificationPermission(granted: Bool) {
        let defaults = UserDefaults.standard
        if granted {
            defaults.set(false, forKey: Self.deniedUnregisteredKey)
        } else if !defaults.bool(forKey: Self.deniedUnregisteredKey) {
            defaults.set(true, forKey: Self.deniedUnregisteredKey)
            unregister()
        }
    }

    /// POST /device/unregister on every sign-out path (voluntary + forced) and when notification permission is denied.
    /// Both fields; one retry after 2 s on a network error / 5xx, dropped if a sign-in begins meanwhile. Forgets the
    /// registration memo, so the next sign-in registers again.
    func unregister() {
        UserDefaults.standard.removeObject(forKey: Self.registeredTokenKey)
        UserDefaults.standard.removeObject(forKey: Self.registeredAtKey)
        let token = pushToken, id = installId, startedIn = generation
        guard token != nil || id != nil else { return }
        enqueue {
            if await self.sendUnregister(token, id) { return }
            guard startedIn == self.generation else { return }
            let delay = Task<Void, Never> { _ = try? await Task.sleep(nanoseconds: 2_000_000_000) }
            self.retryDelay = delay
            await delay.value
            self.retryDelay = nil
            guard startedIn == self.generation else { return }
            _ = await self.sendUnregister(token, id)
        }
    }

    private func enqueue(_ operation: @escaping () async -> Void) {
        let previous = tail
        tail = Task {
            await previous?.value
            await operation()
        }
    }

    /// true = done (2xx, or a 4xx a retry can't fix); false = retry-worthy (transport error / 5xx).
    private func sendUnregister(_ token: String?, _ id: String?) async -> Bool {
        guard let status = try? await APIClient.shared.unregisterDevice(pushToken: token, deviceId: id) else { return false }
        return status < 500
    }
}
