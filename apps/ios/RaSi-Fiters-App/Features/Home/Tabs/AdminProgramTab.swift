import SwiftUI

// MARK: - Admin Program Tab (Tab 4, program/global-admin variant)
// Faithful 1:1 port of ios-mobile Features/Home/Tabs/AdminProgramTab.swift.
// The 3 management sections (Member/Role/WorkoutTypes) are deferred ScaffoldPlaceholder stubs (D-SCOPE).

struct AdminProgramTab: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var showSelectProgram = false

    var body: some View {
        ZStack(alignment: .top) {
            Color.appBackground
                .ignoresSafeArea()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    SummaryHeader(
                        title: "Program",
                        subtitle: programContext.name,
                        status: programContext.status,
                        initials: programContext.adminInitials
                    )

                    VStack(spacing: 16) {
                        // Program Info Section - everyone sees Select Program, only admins see Edit
                        ProgramInfoSection(showSelectProgram: $showSelectProgram)

                        // Member Management Section - everyone can view list
                        ProgramMemberManagementSection()

                        // Role Management Section - only global_admin and program_admin
                        if programContext.canEditProgramData {
                            ProgramRoleManagementSection()
                        }

                        // Workout Types Section - everyone can view, permissions vary
                        ProgramWorkoutTypesSection()

                        // My Account Section (always visible)
                        ProgramMyAccountSection()
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 24)
            }
        }
        .navigationDestination(isPresented: $showSelectProgram) {
            ProgramPickerView()
                .navigationBarBackButtonHidden(true)
        }
        .task {
            await programContext.loadMembershipDetails()
        }
    }
}
