package com.app.rasifiters

import android.app.Application
import com.app.rasifiters.core.AppContainer

/** Application entry point; owns the process-scoped DI container. */
class App : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
