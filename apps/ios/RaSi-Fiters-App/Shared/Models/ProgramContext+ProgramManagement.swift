import Foundation

extension ProgramContext {
    // MARK: - Program Management

    func apply(program: APIClient.ProgramDTO) {
        name = program.name
        status = program.status ?? "Active"
        activeMembers = program.active_members ?? 0
        atRiskMembers = 0
        programId = program.id
        if let role = program.my_role {
            loggedInUserProgramRole = role
        }

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        if let start = program.start_date, let d = formatter.date(from: start) {
            startDate = d
        }
        if let end = program.end_date, let d = formatter.date(from: end) {
            endDate = d
        }
    }

    @MainActor
    func updateProgram(name: String?, status: String?, startDate: Date?, endDate: Date?) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }
        guard let pid = programId else {
            throw APIError(message: "No program selected")
        }

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"

        let startStr = startDate.map { formatter.string(from: $0) }
        let endStr = endDate.map { formatter.string(from: $0) }

        let response = try await APIClient.shared.updateProgram(
            token: token,
            programId: pid,
            name: name,
            status: status,
            startDate: startStr,
            endDate: endStr
        )

        // Update local state
        if let newName = name { self.name = newName }
        if let newStatus = status { self.status = newStatus }
        if let newStart = startDate { self.startDate = newStart }
        if let newEnd = endDate { self.endDate = newEnd }
    }

    @MainActor
    func deleteProgram(programId: String) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }

        _ = try await APIClient.shared.deleteProgram(token: token, programId: programId)

        // Remove from local programs array
        programs.removeAll { $0.id == programId }

        // Clear selection if deleted program was selected
        if self.programId == programId {
            self.programId = nil
            self.name = ""
            self.status = ""
        }
    }

    @MainActor
    func createProgram(name: String, status: String, startDate: Date?, endDate: Date?) async throws {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"

        let startStr = startDate.map { formatter.string(from: $0) }
        let endStr = endDate.map { formatter.string(from: $0) }

        let response = try await APIClient.shared.createProgram(
            token: token,
            name: name,
            status: status,
            startDate: startStr,
            endDate: endStr
        )

        // Refresh programs list to include the new program
        let updatedPrograms = try await APIClient.shared.fetchPrograms(token: token)
        programs = updatedPrograms
    }

    /// Loads pending invites - fetches appropriate invites based on user's global role
    /// Global admin sees all invites system-wide, standard users see only their own
    @MainActor
    func loadPendingInvites() async {
        guard let token = authToken, !token.isEmpty else {
            return
        }
        do {
            if isGlobalAdmin {
                pendingInvites = try await APIClient.shared.fetchAllInvites(token: token)
            } else {
                pendingInvites = try await APIClient.shared.fetchMyInvites(token: token)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Responds to an invite (accept, decline, or revoke)
    /// - Parameters:
    ///   - inviteId: The ID of the invite
    ///   - action: "accept", "decline", or "revoke" (revoke is admin-only)
    ///   - blockFuture: If true, blocks future invites from this program (only for decline)
    /// - Returns: The response message from the server
    @MainActor
    func respondToInvite(inviteId: String, action: String, blockFuture: Bool = false) async throws -> String {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }

        let response = try await APIClient.shared.respondToInvite(
            token: token,
            inviteId: inviteId,
            action: action,
            blockFuture: blockFuture
        )

        // Refresh invites list after responding
        await loadPendingInvites()

        // If accepted, refresh programs list as user may have joined a new program
        if action == "accept" {
            await loadLookupData()
        }

        return response.message
    }

    /// Leave the current program (soft removal - data is preserved)
    @MainActor
    func leaveProgram() async throws -> String {
        guard let token = authToken, !token.isEmpty else {
            throw APIError(message: "No auth token")
        }
        guard let pid = programId else {
            throw APIError(message: "No program selected")
        }

        let response = try await APIClient.shared.leaveProgram(token: token, programId: pid)

        // Clear current program selection
        programId = nil
        name = ""
        status = ""
        loggedInUserProgramRole = "member"
        membershipDetails = []

        // Refresh programs list to reflect the change
        await loadLookupData()

        // Persist the session without the program
        persistSession()

        return response.message
    }
}
