import Foundation

/// Notifications inbox client calls (notifications API contract C4): the inbox, its counts + read marks, and the
/// per-member preferences. Every call takes the authenticated path (`data(for:)` — refresh on 401, kit errors). JSON is
/// snake_case.
extension APIClient {

    struct InboxPageDTO: Decodable {
        let items: [NotificationDTO]
        let nextCursor: String?
        enum CodingKeys: String, CodingKey {
            case items
            case nextCursor = "next_cursor"
        }
    }

    /// `badge` = unread excluding invite items + pending invites (each invite once) — the "+" badge and the app-icon badge.
    struct InboxCountsDTO: Decodable, Equatable {
        let unread: Int
        let pendingInvites: Int
        let badge: Int
        enum CodingKeys: String, CodingKey {
            case unread, badge
            case pendingInvites = "pending_invites"
        }
    }

    /// Category keys: program · activity · reminders · digest · announcements (C2). `reminderTime` = "HH:MM", 24-hour.
    struct NotificationPreferencesDTO: Decodable, Equatable {
        var categories: [String: Bool]
        var reminderTime: String
        let timeZone: String?
        enum CodingKeys: String, CodingKey {
            case categories
            case reminderTime = "reminder_time"
            case timeZone = "time_zone"
        }
    }

    /// `authorizedRequest` + query items (a "?" in the path would be escaped by appendingPathComponent).
    func authorizedRequest(_ path: String, method: String, query: [URLQueryItem]) -> URLRequest {
        var request = authorizedRequest(path, method: method)
        if !query.isEmpty, let url = request.url { request.url = url.appending(queryItems: query) }
        return request
    }

    /// GET /notifications/inbox — newest first, last 90 days; `before` = the previous page's opaque `next_cursor`.
    func fetchInbox(before cursor: String? = nil, limit: Int = 30) async throws -> InboxPageDTO {
        var query = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor { query.append(URLQueryItem(name: "before", value: cursor)) }
        let data = try await data(for: authorizedRequest("notifications/inbox", method: "GET", query: query))
        return try JSONDecoder().decode(InboxPageDTO.self, from: data)
    }

    /// GET /notifications/inbox/unread-count.
    func fetchInboxCounts() async throws -> InboxCountsDTO {
        let data = try await data(for: authorizedRequest("notifications/inbox/unread-count", method: "GET"))
        return try JSONDecoder().decode(InboxCountsDTO.self, from: data)
    }

    /// POST /notifications/inbox/read { ids } (1–100; idempotent) → fresh counts.
    func markInboxRead(ids: [String]) async throws -> InboxCountsDTO {
        try await postInboxRead(["ids": Array(ids.prefix(100))])
    }

    /// POST /notifications/inbox/read { all: true } → fresh counts.
    func markAllInboxRead() async throws -> InboxCountsDTO {
        try await postInboxRead(["all": true])
    }

    /// DELETE /notifications/inbox/:id — this member's own item, gone on every device → fresh counts (the extra
    /// `deleted` key is ignored). 404 = unknown / not this member's / already gone.
    func deleteInboxItem(id: String) async throws -> InboxCountsDTO {
        let data = try await data(for: authorizedRequest("notifications/inbox/\(id)", method: "DELETE"))
        return try JSONDecoder().decode(InboxCountsDTO.self, from: data)
    }

    /// DELETE /notifications/inbox/all — every notification (the invitations are separate and stay) → fresh counts.
    func clearInbox() async throws -> InboxCountsDTO {
        let data = try await data(for: authorizedRequest("notifications/inbox/all", method: "DELETE"))
        return try JSONDecoder().decode(InboxCountsDTO.self, from: data)
    }

    /// GET /notifications/preferences (also stores this device's X-Time-Zone server-side).
    func fetchNotificationPreferences() async throws -> NotificationPreferencesDTO {
        let data = try await data(for: authorizedRequest("notifications/preferences", method: "GET"))
        return try JSONDecoder().decode(NotificationPreferencesDTO.self, from: data)
    }

    /// PUT /notifications/preferences — partial: only what's passed changes; answers the full preferences.
    func updateNotificationPreferences(categories: [String: Bool]? = nil,
                                       reminderTime: String? = nil) async throws -> NotificationPreferencesDTO {
        var body: [String: Any] = [:]
        if let categories { body["categories"] = categories }
        if let reminderTime { body["reminder_time"] = reminderTime }
        var request = authorizedRequest("notifications/preferences", method: "PUT")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let data = try await data(for: request)
        return try JSONDecoder().decode(NotificationPreferencesDTO.self, from: data)
    }

    private func postInboxRead(_ body: [String: Any]) async throws -> InboxCountsDTO {
        var request = authorizedRequest("notifications/inbox/read", method: "POST")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let data = try await data(for: request)
        return try JSONDecoder().decode(InboxCountsDTO.self, from: data)
    }
}
