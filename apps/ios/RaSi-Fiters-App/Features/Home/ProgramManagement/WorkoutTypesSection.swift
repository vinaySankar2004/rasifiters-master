import SwiftUI

// MARK: - Workout Types Section (AdminProgramTab, run 62)
// Faithful 1:1 port of ios-mobile Features/Home/Tabs/WorkoutTypesSection.swift.
// Web parity: /lifestyle/workouts. Both agree (kept faithful): non-admins DEGRADE to read-only via
// `canManage` (no redirect — web lifestyle/workouts F2); global library types can only be hidden/shown
// (never edited/deleted), customs can be edited/deleted/hidden. `admin_only_data_entry` N/A — this is
// admin-ROLE gated, not data-entry-locked (web lifestyle/workouts F1). SHARED: ViewWorkoutTypesListView
// is also the nav target of the ported AdminWorkoutTypesTab (run 56) — this removes the shared stub.
// Cleanups (run 62): clear-stale-error-on-modal-open (web D-C2) + tokenize bare colors.

struct ProgramWorkoutTypesSection: View {
    @EnvironmentObject var programContext: ProgramContext

    private var visibleCount: Int {
        programContext.programWorkouts.filter { !$0.is_hidden }.count
    }

    private var customCount: Int {
        programContext.programWorkouts.filter { $0.isCustom }.count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader(title: "Workout Types", icon: "dumbbell.fill", color: .appPurple)

            VStack(spacing: 12) {
                // View & Manage Workout Types - unified view
                NavigationLink {
                    ViewWorkoutTypesListView()
                } label: {
                    settingsRow(
                        icon: "list.bullet",
                        color: .appPurple,
                        title: "Workout Types",
                        subtitle: customCount > 0
                            ? "\(visibleCount) available, \(customCount) custom"
                            : "\(visibleCount) types available"
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(.systemBackground).opacity(0.9))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1)
        )
        .adaptiveShadow(radius: 8, y: 4)
        .task {
            await programContext.loadProgramWorkouts()
        }
    }
}

// Workout types list with swipe actions for program admins
struct ViewWorkoutTypesListView: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var searchText = ""
    @State private var showDeleteConfirm = false
    @State private var workoutToDelete: APIClient.ProgramWorkoutDTO?
    @State private var workoutToEdit: APIClient.ProgramWorkoutDTO?
    @State private var showAddSheet = false
    @State private var newWorkoutName = ""
    @State private var isProcessing = false
    @State private var errorMessage: String?

    private var canManage: Bool {
        programContext.canEditProgramData
    }

    private var filteredWorkouts: [APIClient.ProgramWorkoutDTO] {
        let workouts = programContext.programWorkouts
        if searchText.isEmpty {
            return workouts
        }
        return workouts.filter {
            $0.workout_name.localizedCaseInsensitiveContains(searchText)
        }
    }

    private var visibleWorkouts: [APIClient.ProgramWorkoutDTO] {
        filteredWorkouts.filter { !$0.is_hidden }
    }

    private var hiddenWorkouts: [APIClient.ProgramWorkoutDTO] {
        filteredWorkouts.filter { $0.is_hidden }
    }

    var body: some View {
        List {
            // Visible workouts section
            if !visibleWorkouts.isEmpty {
                Section {
                    ForEach(visibleWorkouts) { workout in
                        workoutRow(workout)
                    }
                } header: {
                    Text("Available (\(visibleWorkouts.count))")
                }
            }

            // Hidden workouts section (only show to admins)
            if canManage && !hiddenWorkouts.isEmpty {
                Section {
                    ForEach(hiddenWorkouts) { workout in
                        workoutRow(workout)
                    }
                } header: {
                    HStack {
                        Image(systemName: "eye.slash")
                        Text("Hidden (\(hiddenWorkouts.count))")
                    }
                }
            }
        }
        .searchable(text: $searchText, prompt: "Search workout types")
        .navigationTitle("Workout Types")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canManage {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        // Cleanup (run 62): clear a stale error when opening the Add modal (web D-C2).
                        errorMessage = nil
                        showAddSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
        }
        .task {
            await programContext.loadProgramWorkouts()
        }
        .refreshable {
            await programContext.loadProgramWorkouts()
        }
        .alert("Delete Custom Workout?", isPresented: $showDeleteConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                if let workout = workoutToDelete {
                    Task { await deleteWorkout(workout) }
                }
            }
        } message: {
            Text("This will delete \"\(workoutToDelete?.workout_name ?? "")\" from this program.")
        }
        .sheet(isPresented: $showAddSheet) {
            addCustomWorkoutSheet
        }
        .sheet(item: $workoutToEdit) { workout in
            editCustomWorkoutSheet(workout)
        }
    }

    @ViewBuilder
    private func workoutRow(_ workout: APIClient.ProgramWorkoutDTO) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(workout.isCustom ? Color.appGreenLight : Color.appPurpleLight)
                    .frame(width: 40, height: 40)
                Image(systemName: workout.isCustom ? "star.fill" : "dumbbell.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(workout.isCustom ? .appGreen : .appPurple)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(workout.workout_name)
                    .font(.subheadline.weight(.medium))
                HStack(spacing: 4) {
                    Text(workout.isCustom ? "Custom" : "Standard")
                        .font(.caption2)
                        .foregroundColor(Color(.secondaryLabel))
                    if workout.is_hidden {
                        Text("• Hidden")
                            .font(.caption2)
                            .foregroundColor(.appOrange)
                    }
                }
            }

            Spacer()
        }
        .opacity(workout.is_hidden ? 0.5 : 1.0)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            if canManage {
                if workout.isGlobal {
                    // Global workout: toggle visibility only
                    Button {
                        Task { await toggleVisibility(workout) }
                    } label: {
                        Label(workout.is_hidden ? "Show" : "Hide", systemImage: workout.is_hidden ? "eye" : "eye.slash")
                    }
                    .tint(workout.is_hidden ? Color.appGreen : Color.appOrange)
                } else {
                    // Custom workout: delete (will fail if has logs)
                    Button(role: .destructive) {
                        workoutToDelete = workout
                        showDeleteConfirm = true
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }

                    // Custom workout: toggle visibility (alternative to delete)
                    Button {
                        Task { await toggleCustomVisibility(workout) }
                    } label: {
                        Label(workout.is_hidden ? "Show" : "Hide", systemImage: workout.is_hidden ? "eye" : "eye.slash")
                    }
                    .tint(workout.is_hidden ? Color.appGreen : Color.appOrange)
                }
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
            if canManage && workout.isCustom && !workout.is_hidden {
                // Custom workout: edit (only if not hidden)
                Button {
                    // Cleanup (run 62): clear a stale error when opening the Edit modal (web D-C2).
                    errorMessage = nil
                    workoutToEdit = workout
                } label: {
                    Label("Edit", systemImage: "pencil")
                }
                .tint(Color.appBlue)
            }
        }
    }

    private var addCustomWorkoutSheet: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Workout name", text: $newWorkoutName)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.words)
                } header: {
                    Text("Add Custom Workout")
                } footer: {
                    Text("Create a custom workout type for this program only.")
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundColor(.appRed)
                    }
                }
            }
            .navigationTitle("New Workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        newWorkoutName = ""
                        errorMessage = nil
                        showAddSheet = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task { await addCustomWorkout() }
                    }
                    .disabled(newWorkoutName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isProcessing)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func editCustomWorkoutSheet(_ workout: APIClient.ProgramWorkoutDTO) -> some View {
        EditCustomWorkoutSheet(
            workout: workout,
            onSave: { newName in
                Task {
                    do {
                        try await programContext.editCustomProgramWorkout(workoutId: workout.id, name: newName)
                        workoutToEdit = nil
                    } catch {
                        errorMessage = error.localizedDescription
                    }
                }
            },
            onCancel: {
                workoutToEdit = nil
            }
        )
    }

    private func toggleVisibility(_ workout: APIClient.ProgramWorkoutDTO) async {
        guard let libraryId = workout.library_workout_id else { return }
        isProcessing = true
        do {
            try await programContext.toggleWorkoutVisibility(libraryWorkoutId: libraryId)
        } catch {
            errorMessage = error.localizedDescription
        }
        isProcessing = false
    }

    private func toggleCustomVisibility(_ workout: APIClient.ProgramWorkoutDTO) async {
        isProcessing = true
        do {
            try await programContext.toggleCustomWorkoutVisibility(workoutId: workout.id)
        } catch {
            errorMessage = error.localizedDescription
        }
        isProcessing = false
    }

    private func deleteWorkout(_ workout: APIClient.ProgramWorkoutDTO) async {
        isProcessing = true
        do {
            try await programContext.deleteCustomProgramWorkout(workoutId: workout.id)
        } catch {
            errorMessage = error.localizedDescription
        }
        isProcessing = false
    }

    private func addCustomWorkout() async {
        let name = newWorkoutName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }

        isProcessing = true
        errorMessage = nil
        do {
            try await programContext.addCustomProgramWorkout(name: name)
            newWorkoutName = ""
            showAddSheet = false
        } catch {
            errorMessage = error.localizedDescription
        }
        isProcessing = false
    }
}

// Helper sheet for editing custom workout
struct EditCustomWorkoutSheet: View {
    let workout: APIClient.ProgramWorkoutDTO
    let onSave: (String) -> Void
    let onCancel: () -> Void

    @State private var workoutName: String = ""
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Workout name", text: $workoutName)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.words)
                } header: {
                    Text("Edit Custom Workout")
                }
            }
            .navigationTitle("Edit Workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        isSaving = true
                        onSave(workoutName.trimmingCharacters(in: .whitespacesAndNewlines))
                    }
                    .disabled(workoutName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                }
            }
            .onAppear {
                workoutName = workout.workout_name
            }
        }
        .presentationDetents([.medium])
    }
}
