package com.app.rasifiters.core

import android.net.Uri

/**
 * The home-screen quick-add widgets' deep-link targets (the iOS `WidgetRoute` analog,
 * ProgramContext.swift). A tapped Glance widget fires `rasifiters://quick-add-workout` /
 * `rasifiters://quick-add-health`; MainActivity resolves the URI to one of these and stashes it on
 * ProgramContext, which RootScreen replays into the signed-in nav graph.
 */
enum class WidgetRoute(val host: String) {
    QUICK_ADD_WORKOUT("quick-add-workout"),
    QUICK_ADD_HEALTH("quick-add-health");

    companion object {
        fun fromUri(uri: Uri?): WidgetRoute? =
            if (uri?.scheme != "rasifiters") null
            else entries.firstOrNull { it.host == uri.host }
    }
}
