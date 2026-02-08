#!/bin/bash
set -e

# Set Android Home / NDK
export ANDROID_HOME=$HOME/Library/Android/sdk
export ANDROID_NDK_HOME=$ANDROID_HOME/ndk/27.0.12077973

# Build the Android Bindings (Go -> AAR)
echo "📦 Building Go bindings..."
mkdir -p android/app/libs
gomobile bind -target=android -androidapi 24 -ldflags='-extldflags "-Wl,-z,max-page-size=16384"' -o android/app/libs/vortex.aar ./mobile

echo "✅ AAR generated at client/android/app/libs/vortex.aar"

# Build the Android APK
cd android

if [ -f "./gradlew" ]; then
    echo "🚀 Building Android APK..."
    ./gradlew assembleDebug
    echo "✅ APK built successfully!"
    echo "📍 Location: client/android/app/build/outputs/apk/debug/app-debug.apk"
    echo ""
    echo "📱 To install:"
    echo "   adb install -r app/build/outputs/apk/debug/app-debug.apk"
else
    echo "⚠️  Gradle Wrapper (gradlew) not found."
    echo ""
    echo "👉 Please open 'client/android' in **Android Studio**."
    echo "   It will automatically sync the project and generate the 'gradlew' script."
    echo "   Once opened, you can build from Android Studio directly,"
    echo "   or run this script again to build from terminal."
fi
