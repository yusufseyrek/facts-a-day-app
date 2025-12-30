#!/bin/bash

# iOS Build and Submission Script for Facts a Day
# This script builds the iOS app and submits to App Store Connect

set -e

# Load environment variables from .env.local if it exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_DIR="$PROJECT_ROOT/ios"
SCHEME="FactsaDay"
WORKSPACE="$IOS_DIR/FactsaDay.xcworkspace"
ARCHIVE_PATH="$PROJECT_ROOT/build/ios/FactsaDay.xcarchive"
EXPORT_PATH="$PROJECT_ROOT/build/ios/export"
EXPORT_OPTIONS_PLIST="$PROJECT_ROOT/scripts/assets/ExportOptions.plist"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Facts a Day - iOS Build Script${NC}"
echo -e "${BLUE}========================================${NC}"

# Function to print step
print_step() {
    echo -e "\n${GREEN}▶ $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}✗ Error: $1${NC}"
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠ Warning: $1${NC}"
}

# Check for required tools
print_step "Checking requirements..."

if ! command -v xcodebuild &> /dev/null; then
    print_error "xcodebuild not found. Please install Xcode."
    exit 1
fi

if ! command -v xcrun &> /dev/null; then
    print_error "xcrun not found. Please install Xcode Command Line Tools."
    exit 1
fi

# Parse arguments
# No arguments required - this is a full release script



# Navigate to project root
cd "$PROJECT_ROOT"

# Check for Team ID
if [ -z "$TEAM_ID" ]; then
    print_error "TEAM_ID environment variable is required"
    echo "Set it with: export TEAM_ID='YOUR_TEAM_ID'"
    echo "Find your Team ID at https://developer.apple.com/account → Membership Details"
    exit 1
fi

echo -e "Using Team ID: ${GREEN}$TEAM_ID${NC}"

# Increment build number
print_step "Incrementing build number in app.json..."

APP_JSON="$PROJECT_ROOT/app.json"

# Get current iOS build number
CURRENT_BUILD=$(grep -o '"buildNumber": "[0-9]*"' "$APP_JSON" | grep -o '[0-9]*')
if [ -z "$CURRENT_BUILD" ]; then
    CURRENT_BUILD=0
fi
NEW_BUILD=$((CURRENT_BUILD + 1))

# Update iOS buildNumber in app.json
sed -i '' "s/\"buildNumber\": \"[0-9]*\"/\"buildNumber\": \"$NEW_BUILD\"/" "$APP_JSON"

echo -e "Build number incremented from $CURRENT_BUILD to ${GREEN}$NEW_BUILD${NC}"

# Generate/regenerate native iOS project
print_step "Generating native iOS project..."
npx expo prebuild --platform ios

# Clean previous builds
print_step "Cleaning previous builds..."
rm -rf "$PROJECT_ROOT/build/ios"
xcodebuild clean -workspace "$WORKSPACE" -scheme "$SCHEME" -configuration Release

# Install pods if needed
print_step "Checking CocoaPods..."
cd "$IOS_DIR"
if [ ! -d "Pods" ] || [ "Podfile" -nt "Pods/Manifest.lock" ]; then
    print_step "Installing CocoaPods dependencies..."
    pod install
fi
cd "$PROJECT_ROOT"

# Create build directory
mkdir -p "$PROJECT_ROOT/build/ios"

# Archive the app
print_step "Archiving app for release..."
xcodebuild archive \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration Release \
    -archivePath "$ARCHIVE_PATH" \
    -destination "generic/platform=iOS" \
    CODE_SIGN_STYLE=Automatic \
    DEVELOPMENT_TEAM="$TEAM_ID" \
    -allowProvisioningUpdates

if [ ! -d "$ARCHIVE_PATH" ]; then
    print_error "Archive failed. Check the output above for errors."
    exit 1
fi

echo -e "${GREEN}✓ Archive created successfully${NC}"

# Check if ExportOptions.plist exists
if [ ! -f "$EXPORT_OPTIONS_PLIST" ]; then
    print_warning "ExportOptions.plist not found. Creating default..."
    cat > "$EXPORT_OPTIONS_PLIST" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>destination</key>
    <string>upload</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>uploadSymbols</key>
    <true/>
    <key>manageAppVersionAndBuildNumber</key>
    <false/>
</dict>
</plist>
EOF
fi

# Export and upload to App Store Connect
print_step "Exporting and uploading to App Store Connect..."
xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_PATH" \
    -exportOptionsPlist "$EXPORT_OPTIONS_PLIST" \
    -allowProvisioningUpdates

echo -e "${GREEN}✓ App uploaded to App Store Connect!${NC}"

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}✓ iOS Build Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Archive: $ARCHIVE_PATH"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Go to https://appstoreconnect.apple.com"
echo "  2. Select your app"
echo "  3. Add release notes and screenshots"
echo "  4. Submit for review"
