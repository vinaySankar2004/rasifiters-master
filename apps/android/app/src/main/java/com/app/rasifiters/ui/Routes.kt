package com.app.rasifiters.ui

/**
 * Navigation route keys. The bottom-tab IA mirrors web + iOS: Summary / Members / Lifestyle / Program.
 * Detail routes are added as their screens land; foundation wires them to stubs.
 */
object Routes {
    // Auth (logged-out) graph
    const val SPLASH = "splash"
    const val LOGIN = "login"
    const val CREATE_ACCOUNT = "create_account"
    const val FORGOT_PASSWORD = "forgot_password"

    // Signed-in graph
    const val PROGRAM_PICKER = "program_picker"
    const val SHELL = "shell"

    // Per-program bottom tabs
    const val SUMMARY = "summary"
    const val MEMBERS = "members"
    const val LIFESTYLE = "lifestyle"
    const val PROGRAM = "program"

    // Summary detail / log routes (forward-nav; stubbed until the Phase D details land)
    const val SUMMARY_ACTIVITY = "summary/activity"
    const val SUMMARY_DISTRIBUTION = "summary/distribution"
    const val SUMMARY_WORKOUT_TYPES = "summary/workout-types"
    const val SUMMARY_LOG_WORKOUT = "summary/log-workout"
    const val SUMMARY_LOG_HEALTH = "summary/log-health"
}

/** Bottom navigation tabs, in order. */
enum class MainTab(val route: String, val label: String) {
    SUMMARY(Routes.SUMMARY, "Summary"),
    MEMBERS(Routes.MEMBERS, "Members"),
    LIFESTYLE(Routes.LIFESTYLE, "Lifestyle"),
    PROGRAM(Routes.PROGRAM, "Program"),
}
