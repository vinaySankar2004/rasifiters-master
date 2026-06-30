import Foundation

enum APIConfig {
    // Simulator / local Mac loopback (matches existing web: http://localhost:5001/api)
    static let simulatorBaseURL = URL(string: "http://127.0.0.1:5001/api")!

    // Physical device on same LAN as your Mac — replace with your Mac’s IP when you test on device.
    static let deviceBaseURL = URL(string: "http://192.168.0.100:5001/api")!

    // Hosted Render URL — the NEW rasifiters-master backend (Supabase-Auth proxy),
    // not the legacy `rasi-fiters-api`. Matches the web app's prod API base. (Migration deviation.)
    static let renderBaseURL = URL(string: "https://rasifiters-api.onrender.com/api")!

    static let appStoreURL = URL(string: "https://apps.apple.com/ca/app/rasi-fiters/id6758078961")!

    // Web app base URL for public pages (privacy, support). Used by iOS to open in browser.
    static let webAppBaseURL = URL(string: "https://rasifiters.com")!
    static var privacyPolicyURL: URL { webAppBaseURL.appendingPathComponent("privacy-policy") }
    static var supportURL: URL { webAppBaseURL.appendingPathComponent("support") }

    // Active base URL; debug uses local endpoints, release uses Render.
    static var activeBaseURL: URL {
        #if DEBUG
        #if targetEnvironment(simulator)
        return simulatorBaseURL
        #else
        return deviceBaseURL
        #endif
        #else
        return renderBaseURL
        #endif
    }
}
