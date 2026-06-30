import Foundation

extension APIClient {

    struct ProgramDTO: Decodable, Identifiable, Hashable {
        let id: String
        let name: String
        let status: String?
        let start_date: String?
        let end_date: String?
        let active_members: Int?
        let total_members: Int?
        let progress_percent: Int?
        let enrollments_closed: Bool?
        let my_role: String?
        let my_status: String?
    }

    struct CreateProgramResponse: Decodable {
        let id: String
        let name: String
        let status: String
        let start_date: String?
        let end_date: String?
        let message: String?
    }

    struct DeleteProgramResponse: Decodable {
        let id: String
        let message: String
    }

    struct ProgramUpdateResponse: Decodable {
        let id: String
        let name: String
        let status: String
        let start_date: String?
        let end_date: String?
        let message: String?
    }

    func fetchPrograms(token: String) async throws -> [ProgramDTO] {
        var request = URLRequest(url: baseURL.appendingPathComponent("programs"))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode([ProgramDTO].self, from: data)
    }

    func createProgram(token: String, name: String, status: String, startDate: String?, endDate: String?) async throws -> CreateProgramResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("programs"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        var body: [String: Any] = [
            "name": name,
            "status": status
        ]
        if let startDate { body["start_date"] = startDate }
        if let endDate { body["end_date"] = endDate }
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let data = try await data(for: request)
        return try JSONDecoder().decode(CreateProgramResponse.self, from: data)
    }

    func deleteProgram(token: String, programId: String) async throws -> DeleteProgramResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("programs/\(programId)"))
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(DeleteProgramResponse.self, from: data)
    }

    func updateProgram(token: String, programId: String, name: String?, status: String?, startDate: String?, endDate: String?) async throws -> ProgramUpdateResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("programs/\(programId)"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        var body: [String: Any] = [:]
        if let name { body["name"] = name }
        if let status { body["status"] = status }
        if let startDate { body["start_date"] = startDate }
        if let endDate { body["end_date"] = endDate }
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let data = try await data(for: request)
        return try JSONDecoder().decode(ProgramUpdateResponse.self, from: data)
    }
}
