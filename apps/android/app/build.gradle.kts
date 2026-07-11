import java.io.FileInputStream
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.google.services)
}

// Release signing config, loaded from a gitignored per-machine keystore.properties (repo is PUBLIC — the
// keystore + passwords never live in git). If the file is absent (any other machine / CI), we skip the
// signingConfig entirely so the build still succeeds; the release output is simply unsigned there.
// See keystore.properties.template for the format.
val keystorePropertiesFile = rootProject.file("keystore.properties")
val hasReleaseKeystore = keystorePropertiesFile.exists()
val keystoreProperties = Properties().apply {
    if (hasReleaseKeystore) FileInputStream(keystorePropertiesFile).use { load(it) }
}

android {
    namespace = "com.app.rasifiters"
    compileSdk = 36

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    defaultConfig {
        applicationId = "com.app.rasifiters"
        minSdk = 26
        targetSdk = 36
        versionCode = 3
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
            // Credential Manager's serverClientId — the Google Cloud OAuth WEB client id (non-secret; it's the
            // audience the backend verifies the Google id_token against). USER must fill this in.
            buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"938606130476-9vhk5o43c2g0ib4a167l1o4mmnt52f9b.apps.googleusercontent.com\"")
        }
        release {
            // Sign with the upload key when keystore.properties is present (this machine); otherwise leave
            // unsigned so non-signing machines/CI still build.
            if (hasReleaseKeystore) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Same prod API base as the web + iOS release clients.
            buildConfigField("String", "API_BASE_URL", "\"https://rasifiters-api.onrender.com/api\"")
            // Credential Manager's serverClientId — the Google Cloud OAuth WEB client id (non-secret). USER must fill.
            buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"938606130476-9vhk5o43c2g0ib4a167l1o4mmnt52f9b.apps.googleusercontent.com\"")
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

    // Credential Manager + Google ID — "Continue with Google" (returns a Google id_token → backend /auth/oauth).
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.googleid)
}
