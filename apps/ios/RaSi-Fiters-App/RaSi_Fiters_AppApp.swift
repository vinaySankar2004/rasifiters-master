//
//  RaSi_Fiters_AppApp.swift
//  RaSi-Fiters-App
//
//  Created by Vinayak Sankaranarayanan on 2025-12-10.
//

import SwiftUI

@main
struct RaSi_Fiters_AppApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var themeManager = ThemeManager()

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(themeManager)
                .preferredColorScheme(themeManager.preferredColorScheme)
        }
    }
}
