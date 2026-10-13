import Foundation
import Security

/// Generic-password keychain items: the session pair (`SessionStore`) and the install id (`DeviceRegistry`).
/// auth §3.1 / notifications §3.1: every item is `AfterFirstUnlockThisDeviceOnly` (never restored onto another device;
/// readable by a background launch once the phone was unlocked after boot), written update-or-add with the status
/// returned, and a read tells "not found" apart from "device locked".
enum KeychainService {
    static let defaultService = Bundle.main.bundleIdentifier ?? "RaSiFitersSession"

    enum ReadResult {
        case found(Data)
        case notFound
        case locked                 // errSecInteractionNotAllowed — keep the session, read again later
        case failure(OSStatus)
    }

    struct Failure: Error { let status: OSStatus }

    static func read(_ account: String, service: String = defaultService) -> ReadResult {
        var query = baseQuery(account, service)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data else { return .failure(errSecDecode) }
            return .found(data)
        case errSecItemNotFound: return .notFound
        case errSecInteractionNotAllowed: return .locked
        default: return .failure(status)
        }
    }

    /// Update-or-add. An update also moves an existing item onto `AfterFirstUnlockThisDeviceOnly`.
    @discardableResult
    static func write(_ data: Data, for account: String, service: String = defaultService) -> OSStatus {
        let query = baseQuery(account, service)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        guard status == errSecItemNotFound else { return status }
        return SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil)
    }

    static func delete(_ account: String, service: String = defaultService) {
        SecItemDelete(baseQuery(account, service) as CFDictionary)
    }

    private static func baseQuery(_ account: String, _ service: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }
}
