plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.trainpoker.host"
    compileSdk = 35
    defaultConfig {
        applicationId = "app.trainpoker.host"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "0.5.0"
    }
    // The release key lives outside the repository (TP_SIGNING_DIR); the app can only ever be updated with it.
    val signingDir = System.getenv("TP_SIGNING_DIR")
    signingConfigs {
        if (signingDir != null) create("release") {
            storeFile = file("$signingDir/host.keystore")
            storePassword = file("$signingDir/password").readText().trim()
            keyAlias = "trainpoker"
            keyPassword = storePassword
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            if (signingDir != null) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging { jniLibs { useLegacyPackaging = false } }
}

dependencies {
    implementation("org.nanohttpd:nanohttpd:2.3.1")
    implementation("org.nanohttpd:nanohttpd-websocket:2.3.1")
    implementation("app.cash.quickjs:quickjs-android:0.9.2")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.12.1")
}
