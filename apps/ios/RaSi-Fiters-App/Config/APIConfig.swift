import Foundation

enum APIConfig {
    // Simulator / local Mac loopback (matches existing web: http://localhost:5001/api)
    static let simulatorBaseURL = URL(string: "http://127.0.0.1:5001/api")!

    // Physical device on same LAN as your Mac — replace with your Mac’s IP when you test on device.
    static let deviceBaseURL = URL(string: "http://192.168.0.100:5001/api")!

    // Hosted Render URL — the NEW rasifiters-master backend (Supabase-Auth proxy),
    // not the legacy `rasi-fiters-api`. Matches the web app's prod API base. (Migration deviation.)
    static let renderBaseURL = URL(string: "https://rasifiters-api.onrender.com/api")!

    // STAGING — the free Render service `rasifiters-api-staging` (the `staging` Postgres schema; shared Supabase
    // Auth). DEBUG builds (the "RaSi-Fiters-App-Staging" scheme's Run) talk to it; Release stays on renderBaseURL.
    // Wake it before a test session (it sleeps after 15 min idle) — reliability-overhaul board §8, auth D-C13.
    static let stagingBaseURL = URL(string: "https://rasifiters-api-staging.onrender.com/api")!

    static let appStoreURL = URL(string: "https://apps.apple.com/ca/app/rasi-fiters/id6758078961")!

    // Web app base URL for public pages (privacy, support). Used by iOS to open in browser.
    static let webAppBaseURL = URL(string: "https://rasifiters.com")!
    static var privacyPolicyURL: URL { webAppBaseURL.appendingPathComponent("privacy-policy") }
    static var supportURL: URL { webAppBaseURL.appendingPathComponent("support") }

    // Recovery contact fallback — for migrated placeholder (no-email) accounts that can't receive a reset
    // email. Matches the web forgot-password page's mailto fallback (NEXT_PUBLIC_SUPPORT_EMAIL default).
    static let supportEmail = "vinay.sankara@gmail.com"
    static var supportMailtoURL: URL {
        let subject = "RaSi Fiters — account recovery help"
            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return URL(string: "mailto:\(supportEmail)?subject=\(subject)")!
    }

    // Active base URL: DEBUG → staging, Release → Render prod. (simulatorBaseURL / deviceBaseURL stay for ad-hoc
    // local-backend runs — swap one in here temporarily.)
    static var activeBaseURL: URL {
        #if DEBUG
        return stagingBaseURL
        #else
        return renderBaseURL
        #endif
    }
}
