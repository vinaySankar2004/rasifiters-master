import SwiftUI

// MARK: - Program Actions Sheet (Tabbed)

struct ProgramActionsSheet: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    let onDismiss: () -> Void

    @State private var selectedTab: Int = 0

    private var hasInvites: Bool {
        !programContext.pendingInvites.isEmpty
    }

    private var invitesTabLabel: String {
        programContext.isGlobalAdmin ? "All Invites" : "My Invites"
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Tab picker
                Picker("", selection: $selectedTab) {
                    Label(invitesTabLabel, systemImage: "envelope.fill")
                        .tag(0)
                    Label("Create", systemImage: "plus")
                        .tag(1)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 8)

                // Tab content
                TabView(selection: $selectedTab) {
                    InvitesTabView(onAccepted: {
                        dismiss()
                        onDismiss()
                    })
                    .tag(0)

                    CreateProgramTabView(onCreated: {
                        dismiss()
                        onDismiss()
                    })
                    .tag(1)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
            }
            .background(
                AppGradient.sheetBackground(for: colorScheme)
                    .ignoresSafeArea()
            )
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Done") {
                        dismiss()
                        onDismiss()
                    }
                    .foregroundColor(Color(.label))
                }
            }
        }
        .onAppear {
            if hasInvites {
                selectedTab = 0
            } else {
                selectedTab = 1
            }
        }
    }
}
