import Foundation

extension APIClient {

    struct WorkoutDTO: Decodable {
        let workout_name: String
    }

    struct ProgramWorkoutDTO: Decodable, Identifiable {
        let id: String
        let workout_name: String
        let source: String  // "global" or "custom"
        let is_hidden: Bool
        let library_workout_id: String?

        var isGlobal: Bool { source == "global" }
        var isCustom: Bool { source == "custom" }
    }

    struct ProgramWorkoutResponse: Decodable {
        let id: String
        let workout_name: String
        let source: String
        let is_hidden: Bool
        let library_workout_id: String?
        let message: String?
    }

    struct DeleteWorkoutLogResponse: Decodable {
        let message: String
    }

    func fetchWorkouts(token: String) async throws -> [WorkoutDTO] {
        var request = URLRequest(url: baseURL.appendingPathComponent("workouts"))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode([WorkoutDTO].self, from: data)
    }

    // MARK: - Program Workouts (per-program workout management)

    func fetchProgramWorkouts(token: String, programId: String) async throws -> [ProgramWorkoutDTO] {
        var components = URLComponents(url: baseURL.appendingPathComponent("program-workouts"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "programId", value: programId)]
        guard let url = components.url else { throw APIError(message: "Invalid program workouts URL") }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode([ProgramWorkoutDTO].self, from: data)
    }

    func toggleProgramWorkoutVisibility(token: String, programId: String, libraryWorkoutId: String) async throws -> ProgramWorkoutResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-workouts/toggle-visibility"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "program_id": programId,
            "library_workout_id": libraryWorkoutId
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let data = try await data(for: request)
        return try JSONDecoder().decode(ProgramWorkoutResponse.self, from: data)
    }

    func toggleCustomWorkoutVisibility(token: String, workoutId: String) async throws -> ProgramWorkoutResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-workouts/\(workoutId)/toggle-visibility"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let data = try await data(for: request)
        return try JSONDecoder().decode(ProgramWorkoutResponse.self, from: data)
    }

    func addCustomProgramWorkout(token: String, programId: String, workoutName: String) async throws -> ProgramWorkoutResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-workouts/custom"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "program_id": programId,
            "workout_name": workoutName
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let data = try await data(for: request)
        return try JSONDecoder().decode(ProgramWorkoutResponse.self, from: data)
    }

    func editCustomProgramWorkout(token: String, workoutId: String, workoutName: String) async throws -> ProgramWorkoutResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-workouts/\(workoutId)"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let body = ["workout_name": workoutName]
        request.httpBody = try JSONEncoder().encode(body)
        let data = try await data(for: request)
        return try JSONDecoder().decode(ProgramWorkoutResponse.self, from: data)
    }

    func deleteCustomProgramWorkout(token: String, workoutId: String) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("program-workouts/\(workoutId)"))
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        _ = try await data(for: request)
    }

    func addWorkoutLog(token: String, memberName: String, workoutName: String, date: String, durationMinutes: Int, programId: String?, memberId: String?) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("workout-logs"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        var body: [String: Any] = [
            "member_name": memberName,
            "workout_name": workoutName,
            "date": date,
            "duration": durationMinutes
        ]
        if let programId { body["program_id"] = programId }
        if let memberId { body["member_id"] = memberId }

        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        _ = try await data(for: request)
    }

    func deleteWorkoutLog(token: String, programId: String, memberId: String, workoutName: String, date: String) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("workout-logs"))
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        let body: [String: Any] = [
            "program_id": programId,
            "member_id": memberId,
            "workout_name": workoutName,
            "date": date
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        _ = try await data(for: request)
    }

    func updateWorkoutLog(
        token: String,
        programId: String,
        memberName: String?,
        workoutName: String,
        date: String,
        duration: Int
    ) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("workout-logs"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        var body: [String: Any] = [
            "program_id": programId,
            "workout_name": workoutName,
            "date": date,
            "duration": duration
        ]
        if let memberName, !memberName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            body["member_name"] = memberName
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        _ = try await data(for: request)
    }
}
