#!/bin/bash

# Android Build and Submission Script for Facts a Day
# This script builds the Android app (AAB) for Play Store submission
# Fully automated - reads all configuration from .env.local

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
ANDROID_DIR="$PROJECT_ROOT/android"
KEYSTORE_FILE="$PROJECT_ROOT/release.keystore"
KEYSTORE_PROPERTIES="$ANDROID_DIR/keystore.properties"
BUILD_OUTPUT="$ANDROID_DIR/app/build/outputs"
AAB_PATH="$BUILD_OUTPUT/bundle/release/app-release.aab"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Facts a Day - Android Build Script${NC}"
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

# Function to print success
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to patch build.gradle for release signing
patch_build_gradle() {
    local BUILD_GRADLE="$1"
    
    # Check if already patched
    if grep -q 'def keystorePropertiesFile = rootProject.file("keystore.properties")' "$BUILD_GRADLE"; then
        return 0
    fi
    
    # Create backup
    cp "$BUILD_GRADLE" "$BUILD_GRADLE.backup"
    
    # Create a temporary file with the patched content
    awk '
    # Insert keystore loading before "def projectRoot"
    /^def projectRoot/ {
        print "// Load keystore properties for release signing"
        print "def keystorePropertiesFile = rootProject.file(\"keystore.properties\")"
        print "def keystoreProperties = new Properties()"
        print "if (keystorePropertiesFile.exists()) {"
        print "    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))"
        print "}"
        print ""
    }
    
    # Print all lines
    { print }
    
    # Add release signing config after debug signing config closes
    /storeFile file\('\''debug.keystore'\''\)/ {
        getline; print  # storePassword
        getline; print  # keyAlias
        getline; print  # keyPassword
        getline; print  # closing brace of debug
        print "        release {"
        print "            if (keystorePropertiesFile.exists()) {"
        print "                storeFile file(keystoreProperties[\"storeFile\"])"
        print "                storePassword keystoreProperties[\"storePassword\"]"
        print "                keyAlias keystoreProperties[\"keyAlias\"]"
        print "                keyPassword keystoreProperties[\"keyPassword\"]"
        print "            }"
        print "        }"
    }
    ' "$BUILD_GRADLE" > "$BUILD_GRADLE.tmp"
    
    # Replace signingConfigs.debug with signingConfigs.release ONLY in release buildType
    awk '
    BEGIN { in_buildTypes = 0; in_release = 0 }
    /buildTypes \{/ { in_buildTypes = 1 }
    in_buildTypes && /release \{/ { in_release = 1 }
    in_buildTypes && in_release && /signingConfig signingConfigs\.debug/ {
        gsub(/signingConfig signingConfigs\.debug/, "signingConfig signingConfigs.release")
    }
    in_buildTypes && in_release && /^\s*\}/ { in_release = 0 }
    /^[[:space:]]*\}[[:space:]]*$/ && in_buildTypes && !in_release { 
        if (match($0, /^[[:space:]]{4}\}/)) {
            in_buildTypes = 0
        }
    }
    { print }
    ' "$BUILD_GRADLE.tmp" > "$BUILD_GRADLE"
    rm "$BUILD_GRADLE.tmp"
    
    return 0
}

# Check for required tools
print_step "Checking requirements..."

if ! command -v java &> /dev/null; then
    print_error "Java not found. Please install JDK 17+"
    exit 1
fi

if ! command -v keytool &> /dev/null; then
    print_error "keytool not found. Please install JDK."
    exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d'.' -f1)
echo "Java version: $JAVA_VERSION"

# Navigate to project root
cd "$PROJECT_ROOT"

# Check for Environment Variables
print_step "Checking environment variables..."
missing=()
[ -z "$ANDROID_KEYSTORE_PASSWORD" ] && missing+=("ANDROID_KEYSTORE_PASSWORD")
[ -z "$ANDROID_KEY_ALIAS" ] && missing+=("ANDROID_KEY_ALIAS")
[ -z "$ANDROID_KEY_PASSWORD" ] && missing+=("ANDROID_KEY_PASSWORD")

if [ ${#missing[@]} -gt 0 ]; then
    print_error "Missing required environment variables:"
    for var in "${missing[@]}"; do
        echo "  - $var"
    done
    echo ""
    echo "Add these to your .env.local file"
    exit 1
fi

# Increment version code
print_step "Incrementing version code in app.json..."

APP_JSON="$PROJECT_ROOT/app.json"

# Get current Android version code
CURRENT_VERSION=$(grep -o '"versionCode": [0-9]*' "$APP_JSON" | grep -o '[0-9]*')
if [ -z "$CURRENT_VERSION" ]; then
    CURRENT_VERSION=1
fi
NEW_VERSION=$((CURRENT_VERSION + 1))

# Update Android versionCode in app.json
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"versionCode\": $CURRENT_VERSION/\"versionCode\": $NEW_VERSION/" "$APP_JSON"
else
    sed -i "s/\"versionCode\": $CURRENT_VERSION/\"versionCode\": $NEW_VERSION/" "$APP_JSON"
fi

echo -e "Version code incremented from $CURRENT_VERSION to ${GREEN}$NEW_VERSION${NC}"

# Generate/regenerate native Android project
print_step "Generating native Android project..."
npx expo prebuild --platform android --clean

# Generate keystore if needed
print_step "Checking release keystore..."
if [ ! -f "$KEYSTORE_FILE" ]; then
    echo -e "${YELLOW}Creating new release keystore...${NC}"
    echo "This keystore is required to sign your app for the Play Store."
    echo -e "${RED}IMPORTANT: Keep this keystore safe! You'll need it for all future updates.${NC}"
    echo ""

    # Use environment variables or defaults
    CERT_NAME="${ANDROID_CERT_NAME:-Facts a Day}"
    CERT_COUNTRY="${ANDROID_CERT_COUNTRY:-US}"
    
    # Build distinguished name
    DNAME="CN=$CERT_NAME, C=$CERT_COUNTRY"

    echo "Generating keystore with:"
    echo "  Alias: $ANDROID_KEY_ALIAS"
    echo "  Distinguished Name: $DNAME"

    keytool -genkeypair \
        -v \
        -storetype PKCS12 \
        -keystore "$KEYSTORE_FILE" \
        -alias "$ANDROID_KEY_ALIAS" \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -storepass "$ANDROID_KEYSTORE_PASSWORD" \
        -keypass "$ANDROID_KEY_PASSWORD" \
        -dname "$DNAME"

    print_success "Keystore created at $KEYSTORE_FILE"
else
    echo "Keystore exists at $KEYSTORE_FILE"
fi

# Copy keystore to android directory (required for build)
print_step "Copying keystore to Android project..."
cp "$KEYSTORE_FILE" "$ANDROID_DIR/release.keystore"
print_success "Keystore copied to android/release.keystore"

# Create keystore.properties
print_step "Creating keystore.properties..."
cat > "$KEYSTORE_PROPERTIES" << EOF
storeFile=../release.keystore
storePassword=$ANDROID_KEYSTORE_PASSWORD
keyAlias=$ANDROID_KEY_ALIAS
keyPassword=$ANDROID_KEY_PASSWORD
EOF
print_success "Keystore properties created"

# Configure release signing in build.gradle
print_step "Configuring release signing in build.gradle..."
BUILD_GRADLE="$ANDROID_DIR/app/build.gradle"
if patch_build_gradle "$BUILD_GRADLE"; then
    print_success "Release signing configured in build.gradle"
else
    print_error "Failed to patch build.gradle"
    exit 1
fi

# Clean previous builds
print_step "Cleaning previous builds..."
cd "$ANDROID_DIR"
./gradlew clean

# Build
print_step "Building release AAB..."
if [ -n "$SENTRY_AUTH_TOKEN" ]; then
    export SENTRY_AUTH_TOKEN
fi

./gradlew bundleRelease

if [ -f "$AAB_PATH" ]; then
    print_success "AAB built successfully"
    
    # Copy to a more accessible location
    mkdir -p "$PROJECT_ROOT/build/android"
    cp "$AAB_PATH" "$PROJECT_ROOT/build/android/factsaday-release.aab"
else
    print_error "AAB build failed"
    exit 1
fi

cd "$PROJECT_ROOT"

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Android Build Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "AAB: $PROJECT_ROOT/build/android/factsaday-release.aab"
echo ""
echo -e "${YELLOW}To upload to Google Play Console:${NC}"
echo "  1. Go to https://play.google.com/console"
echo "  2. Select your app"
echo "  3. Go to Release > Production"
echo "  4. Create a new release"
echo "  5. Upload the AAB file"
echo "  6. Add release notes"
echo "  7. Review and roll out"
echo ""
