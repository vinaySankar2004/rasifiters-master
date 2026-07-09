package com.app.rasifiters.ui.shell

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Eco
import androidx.compose.material.icons.filled.Group
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.app.rasifiters.core.AppearanceStore
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.ui.MainTab
import com.app.rasifiters.ui.Routes
import com.app.rasifiters.ui.members.InviteMemberScreen
import com.app.rasifiters.ui.members.MemberDetailEditScreen
import com.app.rasifiters.ui.members.MemberHealthDetailScreen
import com.app.rasifiters.ui.members.MemberHistoryDetailScreen
import com.app.rasifiters.ui.members.MemberMetricsDetailScreen
import com.app.rasifiters.ui.members.MemberRecentDetailScreen
import com.app.rasifiters.ui.members.MemberStreakDetailScreen
import com.app.rasifiters.ui.lifestyle.LifestyleScreen
import com.app.rasifiters.ui.lifestyle.LifestyleTimelineDetailScreen
import com.app.rasifiters.ui.lifestyle.WorkoutTypesListScreen
import com.app.rasifiters.ui.members.MembersScreen
import com.app.rasifiters.ui.members.ProgramMembersListScreen
import com.app.rasifiters.ui.summary.ActivityDetailScreen
import com.app.rasifiters.ui.summary.DistributionDetailScreen
import com.app.rasifiters.ui.summary.LogHealthScreen
import com.app.rasifiters.ui.summary.LogWorkoutScreen
import com.app.rasifiters.ui.summary.SummaryScreen
import com.app.rasifiters.ui.summary.WorkoutTypesDetailScreen
import com.app.rasifiters.ui.program.AppearanceScreen
import com.app.rasifiters.ui.program.ChangePasswordScreen
import com.app.rasifiters.ui.program.EditProgramScreen
import com.app.rasifiters.ui.program.ManageRolesScreen
import com.app.rasifiters.ui.program.MyProfileScreen
import com.app.rasifiters.ui.program.NotificationsScreen
import com.app.rasifiters.ui.program.ProgramScreen
import com.app.rasifiters.ui.health.HealthConnectSettingsScreen

/**
 * The per-program app shell: a bottom nav bar (Summary / Members / Lifestyle / Program) over an
 * inner NavHost. Mirrors the iOS AdminHomeView TabView and the web AppShell bottom tabs.
 * Tabs render admin/standard role variants once the real screens land (Phase D+).
 */
@Composable
fun AppScaffold(
    programContext: ProgramContext,
    appearanceStore: AppearanceStore,
    onSwitchProgram: () -> Unit,
) {
    val nav = rememberNavController()
    val backStackEntry by nav.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.hierarchy

    // System back / left-edge swipe from any of the 4 main tabs returns to the program picker (My Programs)
    // in one gesture, instead of the default tab-to-start-tab pop. On a detail/log screen this stays
    // disabled, so back there pops the detail as usual.
    val onMainTab = MainTab.entries.any { it.route == backStackEntry?.destination?.route }
    BackHandler(enabled = onMainTab) { onSwitchProgram() }

    // App-wide success confirmations (e.g. "3 workouts saved") — the Android-idiom acknowledgement of a
    // successful write, shown as a Snackbar after the form pops back (ProgramContext.messages).
    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(Unit) {
        programContext.messages.collect { snackbarHostState.showSnackbar(it) }
    }

    // Program-entry Health Connect sync trigger (iOS AdminHomeView.onAppear parity) — the guards no-op it
    // unless connected. Other triggers (launch / auth / foreground) fire from RootScreen.
    LaunchedEffect(Unit) { programContext.health.onTrigger() }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                val itemColors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.primary,
                    selectedTextColor = MaterialTheme.colorScheme.primary,
                    indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                    unselectedIconColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
                    unselectedTextColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
                )
                MainTab.entries.forEach { tab ->
                    val selected = currentRoute?.any { it.route == tab.route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            nav.navigate(tab.route) {
                                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(tab.icon(), contentDescription = tab.label) },
                        label = { Text(tab.label) },
                        colors = itemColors,
                    )
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = nav,
            startDestination = Routes.SUMMARY,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable(Routes.SUMMARY) {
                SummaryScreen(programContext = programContext, onNavigate = { nav.navigate(it) })
            }
            composable(Routes.MEMBERS) {
                MembersScreen(programContext = programContext, onNavigate = { nav.navigate(it) })
            }
            composable(Routes.LIFESTYLE) {
                LifestyleScreen(programContext = programContext, onNavigate = { nav.navigate(it) })
            }
            composable(Routes.PROGRAM) {
                ProgramScreen(
                    programContext = programContext,
                    appearanceStore = appearanceStore,
                    onNavigate = { nav.navigate(it) },
                    onSwitchProgram = onSwitchProgram,
                )
            }

            // Program tab settings + admin sub-routes (Phase G). Members section reuses MEMBER_ROSTER /
            // MEMBER_INVITE and Workout Types reuses LIFESTYLE_WORKOUT_TYPES (wired above).
            composable(Routes.PROGRAM_PROFILE) {
                MyProfileScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }
            composable(Routes.PROGRAM_PASSWORD) {
                ChangePasswordScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }
            composable(Routes.PROGRAM_APPEARANCE) {
                AppearanceScreen(appearanceStore = appearanceStore, onBack = { nav.popBackStack() })
            }
            composable(Routes.PROGRAM_NOTIFICATIONS) {
                NotificationsScreen(onBack = { nav.popBackStack() })
            }
            composable(Routes.PROGRAM_EDIT) {
                EditProgramScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }
            composable(Routes.PROGRAM_ROLES) {
                ManageRolesScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }
            composable(Routes.HEALTH_CONNECT) {
                HealthConnectSettingsScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }

            // Lifestyle forward targets (Phase F) — the workout-types manager + the timeline drill-down.
            composable(Routes.LIFESTYLE_WORKOUT_TYPES) {
                WorkoutTypesListScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }
            composable(Routes.LIFESTYLE_TIMELINE) {
                LifestyleTimelineDetailScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }

            // Members forward targets (Phase E) — the metrics/history/streak/workouts/health drill-downs
            // + the invite/roster/editor cluster (double-duty with the Program tab).
            composable(Routes.MEMBER_METRICS) {
                MemberMetricsDetailScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }
            composable(Routes.MEMBER_HISTORY) {
                MemberHistoryDetailScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }
            composable(Routes.MEMBER_STREAKS) {
                MemberStreakDetailScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }
            composable(Routes.MEMBER_WORKOUTS) {
                MemberRecentDetailScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }
            composable(Routes.MEMBER_HEALTH) {
                MemberHealthDetailScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }
            composable(Routes.MEMBER_INVITE) {
                InviteMemberScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }
            composable(Routes.MEMBER_ROSTER) {
                ProgramMembersListScreen(programContext = programContext, onNavigate = { nav.navigate(it) }, onBack = { nav.popBackStack() })
            }
            composable(Routes.MEMBER_EDIT) {
                MemberDetailEditScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }

            // Summary forward targets (Phase D details) — the 3 chart drill-downs + the 2 log forms.
            composable(Routes.SUMMARY_ACTIVITY) {
                ActivityDetailScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }
            composable(Routes.SUMMARY_DISTRIBUTION) {
                DistributionDetailScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }
            composable(Routes.SUMMARY_WORKOUT_TYPES) {
                WorkoutTypesDetailScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }
            composable(Routes.SUMMARY_LOG_WORKOUT) {
                LogWorkoutScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }
            composable(Routes.SUMMARY_LOG_HEALTH) {
                LogHealthScreen(programContext = programContext, onBack = { nav.popBackStack() })
            }
        }
    }
}

// Icon parity with iOS: bar-chart · people · leaf · calendar.
private fun MainTab.icon(): ImageVector = when (this) {
    MainTab.SUMMARY -> Icons.Filled.BarChart
    MainTab.MEMBERS -> Icons.Filled.Group
    MainTab.LIFESTYLE -> Icons.Filled.Eco
    MainTab.PROGRAM -> Icons.Filled.CalendarMonth
}
