#!/bin/bash

# Facts A Day - Android Build Script
# This script opens Android Studio with Sentry source map uploads disabled for local development builds

echo "🚀 Opening Android Studio with Sentry auto-upload disabled..."
echo "   (Source maps will not be uploaded to Sentry for local builds)"

# Disable Sentry source map auto-upload for local builds
export SENTRY_DISABLE_AUTO_UPLOAD=false

# Load auth token from .env.local if you ever need it (commented out by default)
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

# Open Android Studio with the project
open -a "Android Studio" android

echo "✅ Android Studio opened successfully!"
echo ""
echo "Alternatively, to build from command line:"
echo "  cd android && SENTRY_DISABLE_AUTO_UPLOAD=true ./gradlew assembleRelease"
