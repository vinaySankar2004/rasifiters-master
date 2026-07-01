import SwiftUI

struct AdminHomeView: View {
    private enum Tab {
        case summary
        case members
        case workoutTypes
        case program
    }

    enum Period: String, CaseIterable {
        case week = "W"
        case month = "M"
        case year = "Y"
        case program = "P"

        var label: String { rawValue }

        var apiValue: String {
            switch self {
            case .week: return "week"
            case .month: return "month"
            case .year: return "year"
            case .program: return "program"
            }
        }
    }

    @EnvironmentObject var programContext: ProgramContext
    @State private var selectedTab: Tab = .summary
    @State private var summaryPeriod: Period = .week

    var body: some View {
        TabView(selection: $selectedTab) {
            AdminSummaryTab(period: $summaryPeriod)
                .tabItem {
                    Label("Summary", systemImage: "chart.bar.fill")
                }
                .tag(Tab.summary)

            membersTab
                .tabItem {
                    Label("Members", systemImage: "person.3.fill")
                }
                .tag(Tab.members)

            workoutTypesTab
                .tabItem {
                    Label("Lifestyle", systemImage: "leaf.fill")
                }
                .tag(Tab.workoutTypes)

            programTab
                .tabItem {
                    Label("Program", systemImage: "calendar.badge.clock")
                }
                .tag(Tab.program)
        }
        .adaptiveTint()
        .navigationBarBackButtonHidden(true)
        .task {
            if programContext.isHealthKitEnabled {
                await programContext.performHealthKitSync()
            }
        }
    }

    @ViewBuilder
    private var membersTab: some View {
        if programContext.isProgramAdmin {
            AdminMembersTab()
        } else {
            StandardMembersTab()
        }
    }

    @ViewBuilder
    private var workoutTypesTab: some View {
        if programContext.isProgramAdmin {
            AdminWorkoutTypesTab()
        } else {
            StandardWorkoutTypesTab()
        }
    }

    @ViewBuilder
    private var programTab: some View {
        if programContext.isProgramAdmin {
            AdminProgramTab()
        } else {
            StandardProgramTab()
        }
    }
}

#Preview {
    NavigationStack {
        AdminHomeView()
            .environmentObject(ProgramContext())
    }
}
