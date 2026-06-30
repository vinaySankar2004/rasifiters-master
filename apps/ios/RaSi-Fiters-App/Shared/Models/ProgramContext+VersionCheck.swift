import Foundation

extension ProgramContext {
    // MARK: - App Version Check

    @MainActor
    func checkMinimumSupportedVersion() async {
        do {
            let config = try await APIClient.shared.fetchAppConfig()
            guard let minVersion = config.min_ios_version?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !minVersion.isEmpty else {
                minimumSupportedVersion = nil
                isUpdateRequired = false
                return
            }

            minimumSupportedVersion = minVersion
            let currentVersion = currentAppVersion()
            isUpdateRequired = isVersion(currentVersion, lessThan: minVersion)
        } catch {
            // Fail open on network errors
        }
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
