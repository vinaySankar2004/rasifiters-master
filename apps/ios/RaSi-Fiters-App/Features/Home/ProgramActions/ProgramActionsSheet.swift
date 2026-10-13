import SwiftUI

// MARK: - Program Actions Sheet (Tabbed)
// D-N4: tab 0 ("My Invites" / "All Invites") grew into "Inbox" for every role — InboxView: invitations first, then
// notifications.

struct ProgramActionsSheet: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    /// 0 = Inbox (a picker-routed `invites` / `inbox` target); nil = Inbox when the badge is up, else Create.
    var initialTab: Int? = nil
    let onDismiss: () -> Void

    @State private var selectedTab: Int = 0
    /// Opened before the counts loaded: the tab is decided again once they arrive (the badge rule)…
    @State private var awaitingCounts = false
    /// …unless the user already picked a tab (the segmented control or a swipe).
    @State private var userPickedTab = false

    private var tabSelection: Binding<Int> {
        Binding(get: { selectedTab }, set: {
            selectedTab = $0
            userPickedTab = true
        })
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Tab picker
                Picker("", selection: tabSelection) {
                    Label(InboxCopy.title, systemImage: "tray.fill")
                        .tag(0)
                    Label("Create", systemImage: "plus")
                        .tag(1)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 8)

                // Tab content
                TabView(selection: tabSelection) {
                    // D-KIT-17: a paged TabView page clears the offline band itself (reservesOfflineBand).
                    InboxView(isActive: selectedTab == 0, reservesOfflineBand: true, onAcceptedInvite: {
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
            awaitingCounts = initialTab == nil && programContext.inboxCounts == nil
            chooseTab()
        }
        .onChange(of: programContext.inboxCounts) { _, counts in
            guard awaitingCounts, counts != nil else { return }
            awaitingCounts = false
            if !userPickedTab { chooseTab() }
        }
        .offlineBanner()
    }

    /// The badge rule: Inbox when a target asked for it or the badge is up, otherwise Create.
    private func chooseTab() {
        if let initialTab {
            selectedTab = initialTab
        } else {
            selectedTab = programContext.inboxBadgeCount > 0 ? 0 : 1
        }
    }
}
