import Foundation

extension ProgramContext {
    // MARK: - App Version Check

    private static let dismissedUpdateKey = "appconfig.dismissedLatestIOSVersion"

    /// app-config §3: installed < min_ios_version → the blocking ForcedUpdateModalView (unchanged); else installed <
    /// latest_ios_version → the dismissable "Update available" banner on the program picker, once per version
    /// (D-KIT-9, amendment A7). Fails open on network errors.
    @MainActor
    func checkMinimumSupportedVersion() async {
        guard let config = try? await APIClient.shared.fetchAppConfig() else { return }
        let current = currentAppVersion()
        let minimum = Self.normalized(config.min_ios_version)
        minimumSupportedVersion = minimum
        isUpdateRequired = minimum.map { isVersion(current, lessThan: $0) } ?? false
        if !isUpdateRequired, let latest = Self.normalized(config.latest_ios_version), isVersion(current, lessThan: latest),
           UserDefaults.standard.string(forKey: Self.dismissedUpdateKey) != latest {
            updateAvailableVersion = latest
        } else {
            updateAvailableVersion = nil
        }
    }

    @MainActor
    func dismissUpdateBanner() {
        guard let version = updateAvailableVersion else { return }
        UserDefaults.standard.set(version, forKey: Self.dismissedUpdateKey)
        updateAvailableVersion = nil
    }

    private static func normalized(_ value: String?) -> String? {
        let text = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty ? nil : text
    }

    private func currentAppVersion() -> String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    }

    private func isVersion(_ current: String, lessThan minimum: String) -> Bool {
        let currentParts = versionComponents(from: current)
        let minimumParts = versionComponents(from: minimum)
        let maxCount = max(currentParts.count, minimumParts.count)

        for index in 0..<maxCount {
            let left = index < currentParts.count ? currentParts[index] : 0
            let right = index < minimumParts.count ? minimumParts[index] : 0
            if left < right { return true }
            if left > right { return false }
        }

        return false
    }

    private func versionComponents(from version: String) -> [Int] {
        version.split(separator: ".").map { part in
            let digits = part.prefix { $0.isNumber }
            return Int(digits) ?? 0
        }
    }
}
