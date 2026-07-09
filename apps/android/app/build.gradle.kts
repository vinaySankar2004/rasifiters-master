plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.google.services)
}

android {
    namespace = "com.app.rasifiters"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.app.rasifiters"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "1.0.0"
        vectorDrawables { useSupportLibrary = true }
    }

    buildTypes {
        debug {
            // We ALWAYS develop/test against the main live backend (Render → live Supabase Auth/DB),
            // even in dev — so debug points at the same prod API as release, not a local loopback.
            // (Local-backend testing is the exception: temporarily swap to "http://10.0.2.2:5001/api",
            // the emulator's alias for the host Mac's localhost.)
            buildConfigField("String", "API_BASE_URL", "\"https://rasifiters-api.onrender.com/api\"")
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Same prod API base as the web + iOS release clients.
            buildConfigField("String", "API_BASE_URL", "\"https://rasifiters-api.onrender.com/api\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.sse)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.datastore.preferences)

    // Health Connect (Samsung Health / the HealthKit analog — Phase H). Reads ExerciseSessionRecord →
    // /workout-logs and SleepSessionRecord → /daily-health-logs. See the health/ module + specs/features/health-connect.
    implementation(libs.androidx.health.connect.client)

    // Quick-add home-screen widgets (Jetpack Glance) — the iOS WidgetKit AddWorkout/AddDailyHealth analog.
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.androidx.glance.material3)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
}
