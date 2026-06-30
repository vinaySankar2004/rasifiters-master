import Foundation

extension APIClient {

    struct LeaveProgramResponse: Decodable {
        let message: String
        let program_id: String
        let member_id: String
    }

    func fetchMembershipDetails(token: String, programId: String) async throws -> [MembershipDetailDTO] {
        var components = URLComponents(url: baseURL.appendingPathComponent("program-memberships/details"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "programId", value: programId)]
        guard let url = components.url else { throw APIError(message: "Invalid membership details URL") }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode([MembershipDetailDTO].self, from: data)
    }

    func updateMembership(token: String, programId: String, memberId: String, role: String?, status: String?, isActive: Bool?, joinedAt: String?) async throws -> MembershipUpdateResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-memberships"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        var body: [String: Any] = [
            "program_id": programId,
            "member_id": memberId
        ]
        if let role { body["role"] = role }
        if let status { body["status"] = status }
        if let isActive { body["is_active"] = isActive }
        if let joinedAt { body["joined_at"] = joinedAt }
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let data = try await data(for: request)
        return try JSONDecoder().decode(MembershipUpdateResponse.self, from: data)
    }

    /// Leave a program (soft removal - data is preserved for potential rejoin)
    func leaveProgram(token: String, programId: String) async throws -> LeaveProgramResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-memberships/leave"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = ["program_id": programId]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let data = try await data(for: request)
        return try JSONDecoder().decode(LeaveProgramResponse.self, from: data)
    }
}
