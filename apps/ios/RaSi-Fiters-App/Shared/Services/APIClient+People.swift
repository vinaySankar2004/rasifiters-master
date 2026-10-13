import Foundation

/// People client calls (People API contract §B–§F): the People list, a person's profile, kudos give / undo, and the
/// member's own "Hide my activity" (GET / PUT /members/:id `hide_activity`). JSON is snake_case.
extension APIClient {

    struct PeopleListDTO: Decodable {
        let programId: String
        let viewer: PeopleViewerDTO
        let people: [PersonDTO]
        enum CodingKeys: String, CodingKey {
            case viewer, people
            case programId = "program_id"
        }
    }

    struct PeopleViewerDTO: Decodable {
        let memberId: String
        let isStaff: Bool
        enum CodingKeys: String, CodingKey {
            case memberId = "member_id"
            case isStaff = "is_staff"
        }
    }

    /// One People row. `lastActive` ("YYYY-MM-DD") is nil when there is none or the activity is hidden from the viewer.
    struct PersonDTO: Decodable, Identifiable {
        let memberId: String
        let memberName: String
        let initials: String
        let username: String
        let programRole: String
        let isYou: Bool
        let activityVisible: Bool
        let lastActive: String?
        var id: String { memberId }
        enum CodingKeys: String, CodingKey {
            case initials, username
            case memberId = "member_id"
            case memberName = "member_name"
            case programRole = "program_role"
            case isYou = "is_you"
            case activityVisible = "activity_visible"
            case lastActive = "last_active"
        }
    }

    /// A profile. Activity hidden from this viewer → `stats`, `recentWorkouts` and `kudos` are nil (render the name only).
    struct PersonProfileDTO: Decodable {
        let programId: String
        let memberId: String
        let memberName: String
        let initials: String
        let username: String
        let programRole: String
        let isYou: Bool
        /// ISO-8601 program join timestamp (§C); not rendered today.
        let joinedAt: String?
        let activityVisible: Bool
        let canOpenFullStats: Bool
        let stats: PersonStatsDTO?
        let recentWorkouts: [PersonWorkoutDTO]?
        let kudos: KudosSummaryDTO?
        enum CodingKeys: String, CodingKey {
            case initials, username, stats, kudos
            case programId = "program_id"
            case memberId = "member_id"
            case memberName = "member_name"
            case programRole = "program_role"
            case isYou = "is_you"
            case joinedAt = "joined_at"
            case activityVisible = "activity_visible"
            case canOpenFullStats = "can_open_full_stats"
            case recentWorkouts = "recent_workouts"
        }
    }

    struct PersonStatsDTO: Decodable {
        let currentStreak: Int
        let longestStreak: Int
        let activeDaysThisMonth: Int
        let lastActive: String?
        enum CodingKeys: String, CodingKey {
            case currentStreak = "current_streak"
            case longestStreak = "longest_streak"
            case activeDaysThisMonth = "active_days_this_month"
            case lastActive = "last_active"
        }
    }

    struct PersonWorkoutDTO: Decodable {
        let workoutType: String
        let date: String?
        let durationMinutes: Int
        enum CodingKeys: String, CodingKey {
            case date
            case workoutType = "workout_type"
            case durationMinutes = "duration_minutes"
        }
    }

    /// `count` = all-time received (every program); `givenToday` = the viewer's kudos on the recipient's current day.
    struct KudosSummaryDTO: Decodable, Hashable {
        var count: Int
        var givenToday: Bool
        let canGive: Bool
        enum CodingKeys: String, CodingKey {
            case count
            case givenToday = "given_today"
            case canGive = "can_give"
        }
    }

    /// POST …/kudos → `kudos` (201 new · 200 already given today).
    struct KudosResultDTO: Decodable {
        let count: Int
        let givenToday: Bool
        enum CodingKeys: String, CodingKey {
            case count
            case givenToday = "given_today"
        }
    }

    /// DELETE …/kudos → `kudos` — no count (§E); the caller decrements its own when `removed`.
    struct KudosUndoDTO: Decodable {
        let givenToday: Bool
        let removed: Bool
        enum CodingKeys: String, CodingKey {
            case removed
            case givenToday = "given_today"
        }
    }

    private struct KudosEnvelope<Kudos: Decodable>: Decodable {
        let kudos: Kudos
    }

    private struct HideActivityField: Decodable {
        let hideActivity: Bool?
        enum CodingKeys: String, CodingKey { case hideActivity = "hide_activity" }
    }

    /// GET /people?programId — the current program's active members (§B).
    func fetchPeople(programId: String) async throws -> PeopleListDTO {
        let request = authorizedRequest("people", method: "GET", query: [URLQueryItem(name: "programId", value: programId)])
        let data = try await data(for: request)
        return try JSONDecoder().decode(PeopleListDTO.self, from: data)
    }

    /// GET /people/:memberId?programId (§C).
    func fetchPersonProfile(memberId: String, programId: String) async throws -> PersonProfileDTO {
        let request = authorizedRequest("people/\(memberId)", method: "GET",
                                        query: [URLQueryItem(name: "programId", value: programId)])
        let data = try await data(for: request)
        return try JSONDecoder().decode(PersonProfileDTO.self, from: data)
    }

    /// POST /people/:memberId/kudos { program_id } — idempotent per recipient-local day (§D).
    func giveKudos(memberId: String, programId: String) async throws -> KudosResultDTO {
        var request = authorizedRequest("people/\(memberId)/kudos", method: "POST")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["program_id": programId])
        let data = try await data(for: request)
        return try JSONDecoder().decode(KudosEnvelope<KudosResultDTO>.self, from: data).kudos
    }

    /// DELETE /people/:memberId/kudos — undo today's kudos (§E).
    func undoKudos(memberId: String) async throws -> KudosUndoDTO {
        let data = try await data(for: authorizedRequest("people/\(memberId)/kudos", method: "DELETE"))
        return try JSONDecoder().decode(KudosEnvelope<KudosUndoDTO>.self, from: data).kudos
    }

    /// GET /members/:id → `hide_activity` (self / global admin only — §F). nil = a server without the People slice.
    func fetchHideActivity(memberId: String) async throws -> Bool? {
        let data = try await data(for: authorizedRequest("members/\(memberId)", method: "GET"))
        return try JSONDecoder().decode(HideActivityField.self, from: data).hideActivity
    }

    /// PUT /members/:id { hide_activity } (own profile only; strict boolean) → the saved value. A 200 WITHOUT the field
    /// (a server without the People slice ignores it) throws — never report a save that didn't happen.
    func updateHideActivity(memberId: String, hide: Bool) async throws -> Bool {
        var request = authorizedRequest("members/\(memberId)", method: "PUT")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["hide_activity": hide])
        let data = try await data(for: request)
        guard let saved = try JSONDecoder().decode(HideActivityField.self, from: data).hideActivity else {
            throw AppError(kind: .unknown)
        }
        return saved
    }
}
