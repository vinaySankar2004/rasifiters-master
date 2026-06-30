import Foundation

extension APIClient {

    struct NotificationDTO: Decodable, Identifiable {
        let id: String
        let type: String
        let title: String
        let body: String
        let programId: String?
        let actorMemberId: String?
        let createdAt: String?

        enum CodingKeys: String, CodingKey {
            case id
            case type
            case title
            case body
            case programId = "program_id"
            case actorMemberId = "actor_member_id"
            case createdAt = "created_at"
        }
    }

    struct NotificationAckResponse: Decodable {
        let message: String?
    }

    func fetchUnacknowledgedNotifications(token: String) async throws -> [NotificationDTO] {
        var request = URLRequest(url: baseURL.appendingPathComponent("notifications/unacknowledged"))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let data = try await data(for: request)
        return try JSONDecoder().decode([NotificationDTO].self, from: data)
    }

    func acknowledgeNotification(token: String, notificationId: String) async throws -> NotificationAckResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("notifications/\(notificationId)/acknowledge"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let data = try await data(for: request)
        return try JSONDecoder().decode(NotificationAckResponse.self, from: data)
    }
}
