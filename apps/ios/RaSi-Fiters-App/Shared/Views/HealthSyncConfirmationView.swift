import SwiftUI

/// First-time Apple Health sync confirmation. Presents ONE program per page: the rows that will be
/// added (each a toggleable checkbox, default on), with a top-right Liquid-Glass tick that commits the
/// current program's checked rows and advances to the next. The last page finishes the flow.
///
/// Dismissing without finishing DEFERS — nothing is written for still-unconfirmed programs, the
/// integration stays connected, and the confirmation re-appears on the next sync trigger. Presented
/// globally from `AppRootView` so it works no matter which screen triggered the sync (Account menu or
/// the in-program Apple Health entry).
struct HealthSyncConfirmationView: View {
    @EnvironmentObject private var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss

    let confirmation: PendingSyncConfirmation
    @State private var pages: [PendingSyncConfirmation.ProgramPage]
    @State private var pageIndex = 0
    @State private var isCommitting = false
    @State private var retryNotice: String?
    @State private var didComplete = false

    init(confirmation: PendingSyncConfirmation) {
        self.confirmation = confirmation
        _pages = State(initialValue: confirmation.pages)
    }

    private var flowTitle: String {
        confirmation.flow == .workouts ? "Confirm Workouts" : "Confirm Sleep"
    }

    var body: some View {
        NavigationStack {
            Group {
                if pages.indices.contains(pageIndex) {
                    pageContent(page: pages[pageIndex])
                } else {
                    ProgressView()
                }
            }
            .navigationTitle(flowTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { tickButton }
            }
        }
        .onDisappear {
            // Dismissed without tapping through every page → treat as defer (nothing lost).
            if !didComplete {
                programContext.finishConfirmation(confirmation.flow, committed: false)
            }
        }
    }

    @ViewBuilder
    private func pageContent(page: PendingSyncConfirmation.ProgramPage) -> some View {
        VStack(spacing: 0) {
            VStack(spacing: 4) {
                Text(page.programName).font(.title2.bold()).multilineTextAlignment(.center)
                Text("\(page.checkedCount) of \(page.rows.count) will be added")
                    .font(.subheadline).foregroundStyle(.secondary)
                if pages.count > 1 {
                    Text("Program \(pageIndex + 1) of \(pages.count)")
                        .font(.caption).foregroundStyle(.tertiary)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)

            List {
                ForEach(pages[pageIndex].rows) { row in
                    Button { toggle(row) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: row.isChecked ? "checkmark.circle.fill" : "circle")
                                .imageScale(.large)
                                .foregroundStyle(row.isChecked ? Color.accentColor : Color.secondary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.title).foregroundStyle(.primary)
                                Text(row.subtitle).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .listStyle(.plain)

            if let retryNotice {
                Text(retryNotice)
                    .font(.footnote).foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal).padding(.bottom, 10)
            }
        }
    }

    private var tickButton: some View {
        Button {
            Task { await confirmCurrentPage() }
        } label: {
            if isCommitting {
                ProgressView()
            } else {
                Image(systemName: "checkmark")
            }
        }
        .disabled(isCommitting)
        .modifier(GlassTickStyle())
    }

    private func toggle(_ row: PendingSyncConfirmation.Row) {
        guard pages.indices.contains(pageIndex),
              let idx = pages[pageIndex].rows.firstIndex(where: { $0.id == row.id }) else { return }
        pages[pageIndex].rows[idx].isChecked.toggle()
    }

    @MainActor
    private func confirmCurrentPage() async {
        guard pages.indices.contains(pageIndex) else { return }
        isCommitting = true
        retryNotice = nil
        let page = pages[pageIndex]

        let ok: Bool
        switch confirmation.flow {
        case .workouts: ok = await programContext.commitWorkoutPage(page)
        case .sleep:    ok = await programContext.commitSleepPage(page)
        }
        isCommitting = false

        guard ok else {
            retryNotice = "Couldn't reach the server. Check your connection and tap the tick again."
            return
        }

        if pageIndex >= pages.count - 1 {
            // Last program confirmed — finish. This commits the workout anchor (if clean) and promotes
            // any queued sleep flow; if nothing is queued the binding clears and the cover dismisses.
            didComplete = true
            programContext.finishConfirmation(confirmation.flow, committed: true)
            if programContext.pendingSyncConfirmation == nil { dismiss() }
        } else {
            pageIndex += 1
        }
    }
}

/// iOS-26 Liquid-Glass tick, with a bordered-prominent fallback on the iOS 18.6 deployment floor.
private struct GlassTickStyle: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.buttonStyle(.glassProminent)
        } else {
            content.buttonStyle(.borderedProminent)
        }
    }
}
