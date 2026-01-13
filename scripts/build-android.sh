#!/bin/bash

# Android Build and Submission Script for Facts a Day
# This script builds the Android app (AAB) for Play Store submission
# and optionally uploads it to Google Play Console
# Fully automated - reads all configuration from .env.local
#
# Usage:
#   ./scripts/build-android.sh                    # Build and upload to production track
#   ./scripts/build-android.sh --no-upload        # Build only, skip upload
#   ./scripts/build-android.sh --track production # Upload to production track
#   ./scripts/build-android.sh --track beta       # Upload to beta track
#
# Environment Variables (in .env.local):
#   ANDROID_KEYSTORE_PASSWORD   - Keystore password
#   ANDROID_KEY_ALIAS           - Key alias
#   ANDROID_KEY_PASSWORD        - Key password
#   GOOGLE_PLAY_JSON_KEY        - Path to service account JSON file (for upload)

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
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android"
KEYSTORE_FILE="$PROJECT_ROOT/release.keystore"
KEYSTORE_PROPERTIES="$ANDROID_DIR/keystore.properties"
BUILD_OUTPUT="$ANDROID_DIR/app/build/outputs"
AAB_PATH="$BUILD_OUTPUT/bundle/release/app-release.aab"
FINAL_AAB_PATH="$PROJECT_ROOT/build/android/factsaday-release.aab"

# Google Play Configuration
ANDROID_PACKAGE_NAME="dev.seyrek.factsaday"
GOOGLE_PLAY_API_BASE="https://androidpublisher.googleapis.com/androidpublisher/v3"
GOOGLE_UPLOAD_API_BASE="https://androidpublisher.googleapis.com/upload/androidpublisher/v3"

# Default options
UPLOAD_ENABLED=true
TRACK="production"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-upload)
            UPLOAD_ENABLED=false
            shift
            ;;
        --track)
            TRACK="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --no-upload         Skip uploading to Google Play Console"
            echo "  --track <track>     Release track: internal, alpha, beta, production (default: production)"
            echo "  --help, -h          Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  ANDROID_KEYSTORE_PASSWORD   Keystore password (required)"
            echo "  ANDROID_KEY_ALIAS           Key alias (required)"
            echo "  ANDROID_KEY_PASSWORD        Key password (required)"
            echo "  GOOGLE_PLAY_JSON_KEY        Path to service account JSON (required for upload)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

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

# ─────────────────────────────────────────────────────────────────────────────
# Google Play API Functions
# ─────────────────────────────────────────────────────────────────────────────

# Validate Google Play authentication
validate_google_auth() {
    if [ -z "$GOOGLE_PLAY_JSON_KEY" ]; then
        print_error "GOOGLE_PLAY_JSON_KEY not set (Path to service account JSON)"
        echo ""
        echo "To set up Google Play Store authentication:"
        echo ""
        echo "1. Create a service account at:"
        echo "   https://console.cloud.google.com/iam-admin/serviceaccounts"
        echo ""
        echo "2. Grant access in Google Play Console:"
        echo "   Settings → API access → Link the service account"
        echo ""
        echo "3. Add to .env.local:"
        echo "   GOOGLE_PLAY_JSON_KEY=\"/path/to/service-account.json\""
        echo ""
        return 1
    fi
    
    if [ ! -f "$GOOGLE_PLAY_JSON_KEY" ]; then
        print_error "Service account file not found: $GOOGLE_PLAY_JSON_KEY"
        return 1
    fi
    
    return 0
}

# Generate OAuth2 access token for Google Play API
generate_google_token() {
    local TOKEN_SCRIPT="$PROJECT_ROOT/marketing/scripts/google-token.js"
    
    if [ ! -f "$TOKEN_SCRIPT" ]; then
        print_error "Token generation script not found: $TOKEN_SCRIPT"
        return 1
    fi
    
    node "$TOKEN_SCRIPT"
}

# Make authenticated API call to Google Play
google_api() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    
    local token
    token=$(generate_google_token)
    
    if [ -z "$token" ]; then
        print_error "Failed to generate Google API token"
        return 1
    fi
    
    local curl_args=(
        -s
        -X "$method"
        -H "Authorization: Bearer $token"
        -H "Content-Type: application/json"
    )
    
    if [ -n "$data" ]; then
        curl_args+=(-d "$data")
    fi
    
    curl "${curl_args[@]}" "${GOOGLE_PLAY_API_BASE}${endpoint}"
}

# Upload AAB to Google Play
upload_aab_to_google_play() {
    local aab_file="$1"
    local track="$2"
    
    print_step "Uploading AAB to Google Play Console..."
    echo -e "Track: ${CYAN}$track${NC}"
    echo ""
    
    # Validate authentication
    if ! validate_google_auth; then
        return 1
    fi
    
    # Check dependencies
    if ! command -v jq &>/dev/null; then
        print_error "jq is required for Google Play upload. Install with: brew install jq"
        return 1
    fi
    
    if ! command -v node &>/dev/null; then
        print_error "Node.js is required for token generation"
        return 1
    fi
    
    # Verify AAB file exists
    if [ ! -f "$aab_file" ]; then
        print_error "AAB file not found: $aab_file"
        return 1
    fi
    
    local aab_size
    aab_size=$(stat -f%z "$aab_file" 2>/dev/null || stat -c%s "$aab_file" 2>/dev/null)
    echo "AAB size: $(numfmt --to=iec-i --suffix=B $aab_size 2>/dev/null || echo "$aab_size bytes")"
    echo ""
    
    # Step 1: Create an edit
    echo -e "${BLUE}▸${NC} Creating edit..."
    local edit_response
    edit_response=$(google_api POST "/applications/$ANDROID_PACKAGE_NAME/edits" '{}')
    
    local edit_id
    edit_id=$(echo "$edit_response" | jq -r '.id // empty')
    
    if [ -z "$edit_id" ]; then
        local api_error
        api_error=$(echo "$edit_response" | jq -r '.error.message // "Unknown error"')
        print_error "Could not create edit: $api_error"
        return 1
    fi
    print_success "Created edit: $edit_id"
    
    # Step 2: Upload the AAB bundle
    echo -e "${BLUE}▸${NC} Uploading AAB bundle (this may take a while)..."
    
    local token
    token=$(generate_google_token)
    
    local upload_response
    upload_response=$(curl -s -X POST \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/octet-stream" \
        --data-binary "@$aab_file" \
        "${GOOGLE_UPLOAD_API_BASE}/applications/$ANDROID_PACKAGE_NAME/edits/$edit_id/bundles?uploadType=media")
    
    local version_code
    version_code=$(echo "$upload_response" | jq -r '.versionCode // empty')
    
    if [ -z "$version_code" ]; then
        local api_error
        api_error=$(echo "$upload_response" | jq -r '.error.message // "Unknown error"')
        print_error "Failed to upload AAB: $api_error"
        
        # Try to delete the edit to clean up
        google_api DELETE "/applications/$ANDROID_PACKAGE_NAME/edits/$edit_id" >/dev/null 2>&1 || true
        return 1
    fi
    print_success "Uploaded bundle with version code: $version_code"
    
    # Step 3: Assign the bundle to the track
    echo -e "${BLUE}▸${NC} Assigning to $track track..."
    
    local track_data
    track_data=$(cat <<EOF
{
    "releases": [
        {
            "versionCodes": ["$version_code"],
            "status": "completed"
        }
    ]
}
EOF
)
    
    local track_response
    track_response=$(google_api PUT "/applications/$ANDROID_PACKAGE_NAME/edits/$edit_id/tracks/$track" "$track_data")
    
    local track_name
    track_name=$(echo "$track_response" | jq -r '.track // empty')
    
    if [ -z "$track_name" ]; then
        local api_error
        api_error=$(echo "$track_response" | jq -r '.error.message // "Unknown error"')
        print_error "Failed to assign to track: $api_error"
        
        # Try to delete the edit to clean up
        google_api DELETE "/applications/$ANDROID_PACKAGE_NAME/edits/$edit_id" >/dev/null 2>&1 || true
        return 1
    fi
    print_success "Assigned to track: $track_name"
    
    # Step 4: Commit the edit
    echo -e "${BLUE}▸${NC} Committing changes..."
    
    local commit_response
    commit_response=$(google_api POST "/applications/$ANDROID_PACKAGE_NAME/edits/$edit_id:commit" '{}')
    
    if echo "$commit_response" | jq -e '.id' >/dev/null 2>&1; then
        print_success "Changes committed successfully!"
    else
        local api_error
        api_error=$(echo "$commit_response" | jq -r '.error.message // "Unknown error"')
        print_error "Failed to commit: $api_error"
        return 1
    fi
    
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
    cp "$AAB_PATH" "$FINAL_AAB_PATH"
else
    print_error "AAB build failed"
    exit 1
fi

cd "$PROJECT_ROOT"

# Upload to Google Play Console
UPLOAD_SUCCESS=false
if [ "$UPLOAD_ENABLED" = true ]; then
    echo ""
    if upload_aab_to_google_play "$FINAL_AAB_PATH" "$TRACK"; then
        UPLOAD_SUCCESS=true
    else
        print_warning "Upload failed, but AAB was built successfully"
    fi
fi

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Android Build Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "AAB: $FINAL_AAB_PATH"
echo -e "Version Code: $NEW_VERSION"
echo ""

if [ "$UPLOAD_ENABLED" = true ]; then
    if [ "$UPLOAD_SUCCESS" = true ]; then
        echo -e "${GREEN}✓ Uploaded to Google Play Console ($TRACK track)${NC}"
        echo ""
        echo -e "${YELLOW}Next steps:${NC}"
        echo "  1. Go to https://play.google.com/console"
        echo "  2. Select your app → Release → $TRACK"
        echo "  3. Add release notes"
        echo "  4. Send changes for review"
        echo "  5. Review and roll out"
    else
        echo -e "${YELLOW}Upload failed. To upload manually:${NC}"
        echo "  1. Go to https://play.google.com/console"
        echo "  2. Select your app"
        echo "  3. Go to Release > $TRACK"
        echo "  4. Create a new release"
        echo "  5. Upload: $FINAL_AAB_PATH"
        echo "  6. Add release notes"
        echo "  7. Review and roll out"
    fi
else
    echo -e "${YELLOW}To upload to Google Play Console:${NC}"
    echo "  ./scripts/build-android.sh --track $TRACK"
    echo ""
    echo "Or manually:"
    echo "  1. Go to https://play.google.com/console"
    echo "  2. Select your app"
    echo "  3. Go to Release > Production"
    echo "  4. Create a new release"
    echo "  5. Upload the AAB file"
    echo "  6. Add release notes"
    echo "  7. Review and roll out"
fi
echo ""
