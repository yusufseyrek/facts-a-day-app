#!/bin/bash

# Android Build and Submission Script for Facts a Day
# This script builds the Android app (AAB) for Play Store submission

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android"
KEYSTORE_DIR="$PROJECT_ROOT/android/app"
KEYSTORE_FILE="$KEYSTORE_DIR/release.keystore"
KEYSTORE_PROPERTIES="$ANDROID_DIR/keystore.properties"
BUILD_OUTPUT="$ANDROID_DIR/app/build/outputs"

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

# Parse arguments
CLEAN=false
BUILD_APK=false
BUILD_AAB=true
INCREMENT_VERSION=false
GENERATE_KEYSTORE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN=true
            shift
            ;;
        --apk)
            BUILD_APK=true
            BUILD_AAB=false
            shift
            ;;
        --both)
            BUILD_APK=true
            BUILD_AAB=true
            shift
            ;;
        --increment-version)
            INCREMENT_VERSION=true
            shift
            ;;
        --generate-keystore)
            GENERATE_KEYSTORE=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --clean              Clean build before building"
            echo "  --apk                Build APK instead of AAB"
            echo "  --both               Build both APK and AAB"
            echo "  --increment-version  Increment version code before building"
            echo "  --generate-keystore  Generate a new release keystore"
            echo "  --help               Show this help message"
            echo ""
            echo "Environment variables for keystore (if not using --generate-keystore):"
            echo "  KEYSTORE_PASSWORD    Password for the keystore"
            echo "  KEY_ALIAS            Alias for the key"
            echo "  KEY_PASSWORD         Password for the key"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Navigate to project root
cd "$PROJECT_ROOT"

# Check for Java
print_step "Checking requirements..."
if ! command -v java &> /dev/null; then
    print_error "Java not found. Please install JDK 17+"
    exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d'.' -f1)
echo "Java version: $JAVA_VERSION"

# Generate keystore if needed
if [ "$GENERATE_KEYSTORE" = true ] || [ ! -f "$KEYSTORE_FILE" ]; then
    print_step "Setting up release keystore..."

    if [ -f "$KEYSTORE_FILE" ] && [ "$GENERATE_KEYSTORE" = false ]; then
        echo "Keystore already exists at $KEYSTORE_FILE"
    else
        echo -e "${YELLOW}Creating new release keystore...${NC}"
        echo "This keystore is required to sign your app for the Play Store."
        echo -e "${RED}IMPORTANT: Keep this keystore safe! You'll need it for all future updates.${NC}"
        echo ""

        # Prompt for keystore details
        read -p "Enter keystore password: " -s KEYSTORE_PASSWORD
        echo ""
        read -p "Confirm keystore password: " -s KEYSTORE_PASSWORD_CONFIRM
        echo ""

        if [ "$KEYSTORE_PASSWORD" != "$KEYSTORE_PASSWORD_CONFIRM" ]; then
            print_error "Passwords do not match"
            exit 1
        fi

        read -p "Enter key alias (default: factsaday): " KEY_ALIAS
        KEY_ALIAS=${KEY_ALIAS:-factsaday}

        read -p "Enter key password (press enter to use keystore password): " -s KEY_PASSWORD
        echo ""
        KEY_PASSWORD=${KEY_PASSWORD:-$KEYSTORE_PASSWORD}

        read -p "Enter your name (for certificate): " CERT_NAME
        read -p "Enter organization (optional): " CERT_ORG
        read -p "Enter city (optional): " CERT_CITY
        read -p "Enter country code (e.g., US, DE, TR): " CERT_COUNTRY

        # Build distinguished name
        DNAME="CN=$CERT_NAME"
        [ -n "$CERT_ORG" ] && DNAME="$DNAME, O=$CERT_ORG"
        [ -n "$CERT_CITY" ] && DNAME="$DNAME, L=$CERT_CITY"
        [ -n "$CERT_COUNTRY" ] && DNAME="$DNAME, C=$CERT_COUNTRY"

        # Generate keystore
        keytool -genkeypair \
            -v \
            -storetype PKCS12 \
            -keystore "$KEYSTORE_FILE" \
            -alias "$KEY_ALIAS" \
            -keyalg RSA \
            -keysize 2048 \
            -validity 10000 \
            -storepass "$KEYSTORE_PASSWORD" \
            -keypass "$KEY_PASSWORD" \
            -dname "$DNAME"

        echo -e "${GREEN}✓ Keystore created at $KEYSTORE_FILE${NC}"

        # Create keystore.properties
        cat > "$KEYSTORE_PROPERTIES" << EOF
storeFile=app/release.keystore
storePassword=$KEYSTORE_PASSWORD
keyAlias=$KEY_ALIAS
keyPassword=$KEY_PASSWORD
EOF

        echo -e "${GREEN}✓ Keystore properties saved${NC}"
        echo -e "${RED}IMPORTANT: Add keystore.properties to .gitignore!${NC}"

        # Add to gitignore if not already there
        if ! grep -q "keystore.properties" "$PROJECT_ROOT/.gitignore" 2>/dev/null; then
            echo -e "\n# Android release keystore\nandroid/keystore.properties\nandroid/app/release.keystore" >> "$PROJECT_ROOT/.gitignore"
            echo "Added keystore files to .gitignore"
        fi
    fi
fi

# Verify keystore exists
if [ ! -f "$KEYSTORE_FILE" ]; then
    print_error "Release keystore not found at $KEYSTORE_FILE"
    echo "Run: $0 --generate-keystore"
    exit 1
fi

# Verify keystore.properties exists
if [ ! -f "$KEYSTORE_PROPERTIES" ]; then
    print_error "keystore.properties not found"
    echo "Create $KEYSTORE_PROPERTIES with your keystore credentials"
    exit 1
fi

# Update build.gradle to use keystore.properties
print_step "Checking release signing configuration..."

# Check if release signing is configured in build.gradle
if ! grep -q "keystore.properties" "$ANDROID_DIR/app/build.gradle"; then
    print_warning "Release signing not configured. Updating build.gradle..."

    # Create a backup
    cp "$ANDROID_DIR/app/build.gradle" "$ANDROID_DIR/app/build.gradle.backup"

    # We need to add the keystore configuration to build.gradle
    # This is a complex edit, so let's create a helper
    echo -e "${YELLOW}Please add the following to your android/app/build.gradle:${NC}"
    echo ""
    echo "// Add at the top, before android { block:"
    echo 'def keystorePropertiesFile = rootProject.file("keystore.properties")'
    echo 'def keystoreProperties = new Properties()'
    echo 'if (keystorePropertiesFile.exists()) {'
    echo '    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))'
    echo '}'
    echo ""
    echo "// Update signingConfigs inside android { block:"
    echo 'signingConfigs {'
    echo '    release {'
    echo '        if (keystorePropertiesFile.exists()) {'
    echo '            storeFile file(keystoreProperties["storeFile"])'
    echo '            storePassword keystoreProperties["storePassword"]'
    echo '            keyAlias keystoreProperties["keyAlias"]'
    echo '            keyPassword keystoreProperties["keyPassword"]'
    echo '        }'
    echo '    }'
    echo '}'
    echo ""
    echo "// Update buildTypes.release:"
    echo 'release {'
    echo '    signingConfig signingConfigs.release'
    echo '    ...'
    echo '}'
    echo ""
fi

# Increment version if requested
if [ "$INCREMENT_VERSION" = true ]; then
    print_step "Incrementing version code..."

    # Read current versionCode from build.gradle
    CURRENT_VERSION=$(grep -oP 'versionCode \K\d+' "$ANDROID_DIR/app/build.gradle")
    NEW_VERSION=$((CURRENT_VERSION + 1))

    # Update versionCode
    sed -i.bak "s/versionCode $CURRENT_VERSION/versionCode $NEW_VERSION/" "$ANDROID_DIR/app/build.gradle"
    rm -f "$ANDROID_DIR/app/build.gradle.bak"

    echo -e "Version code incremented from $CURRENT_VERSION to ${GREEN}$NEW_VERSION${NC}"
fi

# Clean if requested
if [ "$CLEAN" = true ]; then
    print_step "Cleaning previous builds..."
    cd "$ANDROID_DIR"
    ./gradlew clean
    cd "$PROJECT_ROOT"
fi

# Build
cd "$ANDROID_DIR"

if [ "$BUILD_AAB" = true ]; then
    print_step "Building release AAB (Android App Bundle)..."
    ./gradlew bundleRelease

    AAB_PATH="$BUILD_OUTPUT/bundle/release/app-release.aab"
    if [ -f "$AAB_PATH" ]; then
        echo -e "${GREEN}✓ AAB built successfully: $AAB_PATH${NC}"

        # Copy to a more accessible location
        mkdir -p "$PROJECT_ROOT/build/android"
        cp "$AAB_PATH" "$PROJECT_ROOT/build/android/factsaday-release.aab"
        echo "Copied to: $PROJECT_ROOT/build/android/factsaday-release.aab"
    else
        print_error "AAB build failed"
        exit 1
    fi
fi

if [ "$BUILD_APK" = true ]; then
    print_step "Building release APK..."
    ./gradlew assembleRelease

    APK_PATH="$BUILD_OUTPUT/apk/release/app-release.apk"
    if [ -f "$APK_PATH" ]; then
        echo -e "${GREEN}✓ APK built successfully: $APK_PATH${NC}"

        # Copy to a more accessible location
        mkdir -p "$PROJECT_ROOT/build/android"
        cp "$APK_PATH" "$PROJECT_ROOT/build/android/factsaday-release.apk"
        echo "Copied to: $PROJECT_ROOT/build/android/factsaday-release.apk"
    else
        print_error "APK build failed"
        exit 1
    fi
fi

cd "$PROJECT_ROOT"

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Android Build Complete!${NC}"
echo -e "${BLUE}========================================${NC}"

if [ "$BUILD_AAB" = true ]; then
    echo -e "AAB: $PROJECT_ROOT/build/android/factsaday-release.aab"
fi
if [ "$BUILD_APK" = true ]; then
    echo -e "APK: $PROJECT_ROOT/build/android/factsaday-release.apk"
fi

echo ""
echo -e "${YELLOW}To upload to Google Play Console:${NC}"
echo "  1. Go to https://play.google.com/console"
echo "  2. Select your app (or create a new one)"
echo "  3. Go to Release > Production (or Testing track)"
echo "  4. Create a new release"
echo "  5. Upload the AAB file: build/android/factsaday-release.aab"
echo "  6. Add release notes"
echo "  7. Review and roll out"
echo ""
echo -e "${YELLOW}First-time setup requirements:${NC}"
echo "  - App icon (512x512)"
echo "  - Feature graphic (1024x500)"
echo "  - Screenshots for phone and tablet"
echo "  - Privacy policy URL"
echo "  - App description in all supported languages"
