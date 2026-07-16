//
//  MemberStreakDetail.swift
//  RaSi-Fiters-App
//
//  Members tab → streak card → streak stats + milestone ladder.
//  iOS analogue of web /members/streaks (run 44). Read-only: two streak tiles
//  (current / longest, in days) + a wrapped row of milestone chips, all from the
//  server-computed ProgramContext.memberStreaks (no client math).
//
//  Faithful 1:1 port of legacy Features/Home/Detail/MemberDetailViews.swift + two
//  user-picked cleanups:
//   • D-C1 tokenize the one bare `.orange` chip foreground → Color.appOrange
//     (light-identical; run-62 D-C1 consistency).
//   • D-C2 non-color milestone affordance — achieved chips gain a ✓ prefix + a faint
//     appOrange ring so "achieved" is not signalled by color alone (matches web
//     /members/streaks D-C1; a11y parity).
//  admin_only_data_entry N/A (read-only). See specs/pages/ios/member-streaks-detail/.
//

import SwiftUI

struct MemberStreakDetail: View {
    @EnvironmentObject var programContext: ProgramContext

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let s = programContext.memberStreaks {
                HStack(spacing: 12) {
                    streakTile(title: "Current", value: s.currentStreakDays, icon: "flame.fill", color: .appOrange)
                    streakTile(title: "Longest", value: s.longestStreakDays, icon: "trophy.fill", color: .appYellow)
                }

                Text("Milestones")
                    .font(.headline.weight(.semibold))
                WrapChips(items: s.milestones.map { ($0.dayValue, $0.achieved) })
            } else {
                Text("No streak data.")
                    .font(.footnote)
                    .foregroundColor(Color(.secondaryLabel))
            }
            Spacer()
        }
        .padding(16)
        .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
        .frame(maxWidth: .infinity)
        .navigationTitle("Streak Stats")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func streakTile(title: String, value: Int, icon: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .foregroundColor(color)
                    .font(.subheadline.weight(.bold))
                Text(title)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(Color(.secondaryLabel))
            }
            Text("\(value) days")
                .font(.title2.weight(.bold))
                .foregroundColor(Color(.label))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

struct WrapChips: View {
    let items: [(Int, Bool)]
    let spacing: CGFloat = 8
    let runSpacing: CGFloat = 8

    var body: some View {
        GeometryReader { geo in
            self.generateContent(in: geo)
        }
        .frame(minHeight: 10)
    }

    private func generateContent(in geo: GeometryProxy) -> some View {
        var width = CGFloat.zero
        var height = CGFloat.zero

        return ZStack(alignment: .topLeading) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                chip(item: item)
                    .padding(.trailing, spacing)
                    .padding(.bottom, runSpacing)
                    .alignmentGuide(.leading, computeValue: { d in
                        if (abs(width - d.width) > geo.size.width) {
                            width = 0
                            height -= d.height + runSpacing
                        }
                        let result = width
                        if item == items.last! {
                            width = 0
                        } else {
                            width -= d.width
                        }
                        return result
                    })
                    .alignmentGuide(.top, computeValue: { _ in
                        let result = height
                        if item == items.last! {
                            height = 0
                        }
                        return result
                    })
            }
        }
    }

    private func chip(item: (Int, Bool)) -> some View {
        let achieved = item.1
        // D-C2 non-color affordance: achieved chips carry a ✓ prefix + a faint appOrange
        // ring so "achieved" is not conveyed by color alone (web /members/streaks D-C1).
        return Text(achieved ? "✓ \(item.0)d" : "\(item.0)d")
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(achieved ? Color.appOrangeLight : Color(.systemGray5))
            .foregroundColor(achieved ? .appOrange : Color(.secondaryLabel))  // D-C1 tokenize (was `.orange`)
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color.appOrange.opacity(0.4), lineWidth: achieved ? 1 : 0)
            )
    }
}
