import Foundation

extension APIClient {

    /// One notification — an SSE frame and a GET /notifications/inbox item (notifications contract C3). `category`,
    /// `target` and `read_at` arrive with the inbox (`?inbox=1` streams + the inbox); a legacy frame decodes without
    /// them (ProgramContext+Inbox resolves the C2 defaults). The legacy GET /unacknowledged + POST /:id/acknowledge calls
    /// are retired here (C7.3 — read = POST /notifications/inbox/read).
    struct NotificationDTO: Decodable, Identifiable {
        let id: String
        let type: String
        let title: String
        let body: String
        let programId: String?
        let actorMemberId: String?
        let createdAt: String?
        let category: String?
        let target: String?
        let readAt: String?

        enum CodingKeys: String, CodingKey {
            case id, type, title, body, category, target
            case programId = "program_id"
            case actorMemberId = "actor_member_id"
            case createdAt = "created_at"
            case readAt = "read_at"
        }
    }
}
