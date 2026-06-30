import Foundation

extension APIClient {

    struct InviteResponse: Decodable {
        let message: String
    }

    /// DTO for pending program invites
    struct PendingInviteDTO: Decodable, Identifiable {
        let invite_id: String
        let program_id: String
        let program_name: String?
        let program_status: String?
        let program_start_date: String?
        let program_end_date: String?
        let invited_by_name: String?
        let invited_at: String?
        let expires_at: String?
        // Admin-only fields (nil for standard users)
        let invited_username: String?
        let invited_member_name: String?
        let invited_member_id: String?

        var id: String { invite_id }

        enum CodingKeys: String, CodingKey {
            case invite_id, program_id, program_name, program_status
            case program_start_date, program_end_date
            case invited_by_name, invited_at, expires_at
            case invited_username, invited_member_name, invited_member_id
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            invite_id = try container.decode(String.self, forKey: .invite_id)
            program_id = try container.decode(String.self, forKey: .program_id)
            program_name = try container.decodeIfPresent(String.self, forKey: .program_name)
            program_status = try container.decodeIfPresent(String.self, forKey: .program_status)
            program_start_date = try container.decodeIfPresent(String.self, forKey: .program_start_date)
            program_end_date = try container.decodeIfPresent(String.self, forKey: .program_end_date)
            invited_by_name = try container.decodeIfPresent(String.self, forKey: .invited_by_name)
            invited_at = try container.decodeIfPresent(String.self, forKey: .invited_at)
            expires_at = try container.decodeIfPresent(String.self, forKey: .expires_at)
            invited_username = try container.decodeIfPresent(String.self, forKey: .invited_username)
            invited_member_name = try container.decodeIfPresent(String.self, forKey: .invited_member_name)
            invited_member_id = try container.decodeIfPresent(String.self, forKey: .invited_member_id)
        }
    }

    /// Sends a program invitation to a user by username.
    /// Always returns success message for privacy (doesn't reveal if username exists).
    func sendProgramInvite(token: String, programId: String, username: String) async throws -> InviteResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-memberships/invite"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "program_id": programId,
            "username": username
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let data = try await data(for: request)
        return try JSONDecoder().decode(InviteResponse.self, from: data)
    }

    /// Fetches pending invites for the logged-in user (standard users)
    func fetchMyInvites(token: String) async throws -> [PendingInviteDTO] {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-memberships/my-invites"))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode([PendingInviteDTO].self, from: data)
    }

    /// Fetches ALL pending invites system-wide (global_admin only)
    func fetchAllInvites(token: String) async throws -> [PendingInviteDTO] {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-memberships/all-invites"))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode([PendingInviteDTO].self, from: data)
    }

    /// Responds to a program invite (accept, decline, or revoke)
    /// - Parameters:
    ///   - action: "accept", "decline", or "revoke" (revoke is admin-only)
    ///   - blockFuture: If true, blocks future invites from this program (only for decline)
    func respondToInvite(token: String, inviteId: String, action: String, blockFuture: Bool = false) async throws -> InviteResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-memberships/invite-response"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        var body: [String: Any] = [
            "invite_id": inviteId,
            "action": action
        ]
        if blockFuture {
            body["block_future"] = true
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let data = try await data(for: request)
        return try JSONDecoder().decode(InviteResponse.self, from: data)
    }
}
