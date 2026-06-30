import Foundation

extension ProgramContext {
    // MARK: - Workout Management

    @MainActor
    func deleteWorkoutLog(memberId: String, workoutName: String, date: String) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }
        guard let pid = programId else {
            throw APIError(message: "No program selected")
        }
        try await APIClient.shared.deleteWorkoutLog(
            token: token,
            programId: pid,
            memberId: memberId,
            workoutName: workoutName,
            date: date
        )
    }

    @MainActor
    func updateWorkoutLog(memberName: String?, workoutName: String, date: String, durationMinutes: Int) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }
        guard let pid = programId else {
            throw APIError(message: "No program selected")
        }
        try await APIClient.shared.updateWorkoutLog(
            token: token,
            programId: pid,
            memberName: memberName,
            workoutName: workoutName,
            date: date,
            duration: durationMinutes
        )
    }

    @MainActor
    func updateDailyHealthLog(
        memberId: String,
        logDate: String,
        sleepHours: Double?,
        foodQuality: Int?
    ) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }
        guard let pid = programId else {
            throw APIError(message: "No program selected")
        }
        try await APIClient.shared.updateDailyHealthLog(
            token: token,
            programId: pid,
            memberId: memberId,
            logDate: logDate,
            sleepHours: sleepHours,
            foodQuality: foodQuality
        )
    }

    @MainActor
    func deleteDailyHealthLog(memberId: String, logDate: String) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }
        guard let pid = programId else {
            throw APIError(message: "No program selected")
        }
        try await APIClient.shared.deleteDailyHealthLog(
            token: token,
            programId: pid,
            memberId: memberId,
            logDate: logDate
        )
    }

    @MainActor
    func loadProgramWorkouts() async {
        guard let token = authToken, !token.isEmpty else { return }
        guard let pid = programId else {
            errorMessage = "No program selected for program workouts."
            return
        }
        do {
            programWorkouts = try await APIClient.shared.fetchProgramWorkouts(token: token, programId: pid)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func toggleWorkoutVisibility(libraryWorkoutId: String) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }
        guard let pid = programId else {
            throw APIError(message: "No program selected")
        }

        _ = try await APIClient.shared.toggleProgramWorkoutVisibility(
            token: token,
            programId: pid,
            libraryWorkoutId: libraryWorkoutId
        )
        await loadProgramWorkouts()
    }

    @MainActor
    func toggleCustomWorkoutVisibility(workoutId: String) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }

        _ = try await APIClient.shared.toggleCustomWorkoutVisibility(
            token: token,
            workoutId: workoutId
        )
        await loadProgramWorkouts()
    }

    @MainActor
    func addCustomProgramWorkout(name: String) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }
        guard let pid = programId else {
            throw APIError(message: "No program selected")
        }

        _ = try await APIClient.shared.addCustomProgramWorkout(
            token: token,
            programId: pid,
            workoutName: name
        )
        await loadProgramWorkouts()
    }

    @MainActor
    func editCustomProgramWorkout(workoutId: String, name: String) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }

        _ = try await APIClient.shared.editCustomProgramWorkout(
            token: token,
            workoutId: workoutId,
            workoutName: name
        )
        await loadProgramWorkouts()
    }

    @MainActor
    func deleteCustomProgramWorkout(workoutId: String) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }

        try await APIClient.shared.deleteCustomProgramWorkout(token: token, workoutId: workoutId)
        await loadProgramWorkouts()
    }
}
