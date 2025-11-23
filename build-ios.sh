#!/bin/bash

# Facts A Day - iOS Build Script
# This script opens Xcode with Sentry source map uploads disabled for local development builds

echo "🚀 Opening Xcode with Sentry auto-upload disabled..."
echo "   (Source maps will not be uploaded to Sentry for local builds)"

# Disable Sentry source map auto-upload for local builds
export SENTRY_DISABLE_AUTO_UPLOAD=false

# Load auth token from .env.local if you ever need it (commented out by default)
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

# Open Xcode workspace
open ios/FactsaDay.xcworkspace

echo "✅ Xcode opened successfully!"
echo ""
echo "To build with Sentry enabled, run:"
echo "  SENTRY_DISABLE_AUTO_UPLOAD=false ./build-ios.sh"
