#!/bin/bash

# Marketing Screenshot Uploader
# Uploads framed marketing screenshots to App Store Connect and Google Play Store
# Uses official REST APIs directly (no fastlane dependency)
#
# Prerequisites:
#   - jq: brew install jq
#   - For iOS: App Store Connect API Key (set ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH)
#   - For Android: Google Play Service Account JSON (set GOOGLE_PLAY_JSON_KEY)
#
# Usage:
#   ./marketing/scripts/upload.sh --ios                    # Upload to App Store Connect
#   ./marketing/scripts/upload.sh --android                # Upload to Google Play Store
#   ./marketing/scripts/upload.sh --all                    # Upload to both stores
#   ./marketing/scripts/upload.sh --ios --locale en        # Upload specific locale
#   ./marketing/scripts/upload.sh --ios --dry-run          # Preview without uploading
#
# Input Structure (from frame.sh output):
#   marketing/output/
#   ├── ios/
#   │   ├── phone/{locale}/
#   │   └── tablet/{locale}/
#   └── android/
#       ├── phone/{locale}/
#       └── tablet/{locale}/

set -e

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKETING_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$MARKETING_DIR")"

# App identifiers
IOS_BUNDLE_ID="dev.seyrek.factsaday"
ANDROID_PACKAGE_NAME="dev.seyrek.factsaday"

# Input directories
INPUT_DIR="$MARKETING_DIR/output"

# Supported locales
ALL_LOCALES=("en" "de" "es" "fr" "ja" "ko" "tr" "zh")

# API endpoints
ASC_API_BASE="https://api.appstoreconnect.apple.com/v1"
GOOGLE_PLAY_API_BASE="https://androidpublisher.googleapis.com/androidpublisher/v3"

# ─────────────────────────────────────────────────────────────────────────────
# Locale Mappings
# ─────────────────────────────────────────────────────────────────────────────

# Maps internal locale codes to App Store Connect locale codes
get_ios_locale() {
    case "$1" in
        en) echo "en-US" ;;
        de) echo "de-DE" ;;
        es) echo "es-MX" ;;
        fr) echo "fr-FR" ;;
        ja) echo "ja" ;;
        ko) echo "ko" ;;
        tr) echo "tr" ;;
        zh) echo "zh-Hans" ;;
        *)  echo "$1" ;;
    esac
}

# Maps internal locale codes to Google Play Console locale codes
get_android_locale() {
    case "$1" in
        en) echo "en-US" ;;
        de) echo "de-DE" ;;
        es) echo "es-419" ;;
        fr) echo "fr-FR" ;;
        ja) echo "ja-JP" ;;
        ko) echo "ko-KR" ;;
        tr) echo "tr-TR" ;;
        zh) echo "zh-CN" ;;
        *)  echo "$1" ;;
    esac
}

# ─────────────────────────────────────────────────────────────────────────────
# Screenshot Type Mappings
# ─────────────────────────────────────────────────────────────────────────────

# Get device list based on DEVICE_FILTER environment variable
# Returns "phone tablet", "phone", or "tablet"
get_device_list() {
    case "${DEVICE_FILTER:-}" in
        phone)  echo "phone" ;;
        tablet) echo "tablet" ;;
        *)      echo "phone tablet" ;;
    esac
}

# iOS App Store screenshot display types by device
# Reference: https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications
get_ios_screenshot_type() {
    local device="$1"
    case "$device" in
        phone)  echo "APP_IPHONE_65" ;;      # iPhone 6.5" (iPhone 15 Plus, 14 Plus, 11 Pro Max, XS Max)
        tablet) echo "APP_IPAD_PRO_3GEN_129" ;;   # iPad Pro 12.9" (3rd gen and later)
        *)      echo "" ;;
    esac
}

# Google Play screenshot types by device
get_android_screenshot_types() {
    local device="$1"
    case "$device" in
        phone)  echo "phoneScreenshots" ;;
        tablet) echo "sevenInchScreenshots tenInchScreenshots" ;;  # Upload to both 7" and 10" tablet slots
        *)      echo "" ;;
    esac
}

# ─────────────────────────────────────────────────────────────────────────────
# Colors
# ─────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

info()    { echo -e "${BLUE}▸${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn()    { echo -e "${YELLOW}!${NC} $1"; }
error()   { echo -e "${RED}✗${NC} $1" >&2; }

header() {
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}  $1${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

check_dependencies() {
    local missing=()
    
    if ! command -v jq &>/dev/null; then
        missing+=("jq")
    fi
    
    if ! command -v ruby &>/dev/null; then
        missing+=("ruby")
    fi
    
    if [ ${#missing[@]} -gt 0 ]; then
        error "Missing dependencies: ${missing[*]}"
        echo "" >&2
        echo "Install with:" >&2
        echo "  brew install ${missing[*]}" >&2
        exit 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Authentication Validation
# ─────────────────────────────────────────────────────────────────────────────

validate_ios_auth() {
    local has_error=false
    
    if [ -z "$ASC_KEY_ID" ]; then
        error "ASC_KEY_ID not set (App Store Connect API Key ID)"
        has_error=true
    fi
    
    if [ -z "$ASC_ISSUER_ID" ]; then
        error "ASC_ISSUER_ID not set (App Store Connect Issuer ID)"
        has_error=true
    fi
    
    if [ -z "$ASC_KEY_PATH" ]; then
        error "ASC_KEY_PATH not set (Path to .p8 API key file)"
        has_error=true
    elif [ ! -f "$ASC_KEY_PATH" ]; then
        error "API key file not found: $ASC_KEY_PATH"
        has_error=true
    fi
    
    if $has_error; then
        echo "" >&2
        echo "To set up App Store Connect API authentication:" >&2
        echo "" >&2
        echo "1. Create an API key at:" >&2
        echo "   https://appstoreconnect.apple.com/access/api" >&2
        echo "" >&2
        echo "2. Set environment variables:" >&2
        echo "   export ASC_KEY_ID=\"YOUR_KEY_ID\"" >&2
        echo "   export ASC_ISSUER_ID=\"YOUR_ISSUER_ID\"" >&2
        echo "   export ASC_KEY_PATH=\"/path/to/AuthKey_XXXXX.p8\"" >&2
        echo "" >&2
        return 1
    fi
    
    return 0
}

validate_android_auth() {
    if [ -z "$GOOGLE_PLAY_JSON_KEY" ]; then
        error "GOOGLE_PLAY_JSON_KEY not set (Path to service account JSON)"
        echo "" >&2
        echo "To set up Google Play Store authentication:" >&2
        echo "" >&2
        echo "1. Create a service account at:" >&2
        echo "   https://console.cloud.google.com/iam-admin/serviceaccounts" >&2
        echo "" >&2
        echo "2. Grant access in Google Play Console:" >&2
        echo "   Settings → API access → Link the service account" >&2
        echo "" >&2
        echo "3. Set environment variable:" >&2
        echo "   export GOOGLE_PLAY_JSON_KEY=\"/path/to/service-account.json\"" >&2
        echo "" >&2
        return 1
    fi
    
    if [ ! -f "$GOOGLE_PLAY_JSON_KEY" ]; then
        error "Service account file not found: $GOOGLE_PLAY_JSON_KEY"
        return 1
    fi
    
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# App Store Connect API - JWT Token Generation
# ─────────────────────────────────────────────────────────────────────────────

# Generate JWT token for App Store Connect API using Ruby helper script
generate_asc_token() {
    # Validate inputs
    if [ -z "$ASC_KEY_ID" ] || [ -z "$ASC_ISSUER_ID" ] || [ -z "$ASC_KEY_PATH" ]; then
        echo "" 
        return 1
    fi
    
    if [ ! -f "$ASC_KEY_PATH" ]; then
        echo ""
        return 1
    fi
    
    # Use the Ruby helper script
    "$SCRIPT_DIR/asc-token.js"
}

# Make authenticated API call to App Store Connect
asc_api() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    
    local token
    token=$(generate_asc_token)
    
    if [ -z "$token" ]; then
        echo '{"errors":[{"title":"Token generation failed"}]}' 
        return 1
    fi
    
    # Debug output if VERBOSE is set
    if [ "${VERBOSE:-false}" = true ]; then
        echo "[DEBUG] $method ${ASC_API_BASE}${endpoint}" >&2
    fi
    
    # Make the API call
    local response
    if [ -n "$data" ]; then
        response=$(curl -s -X "$method" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "${ASC_API_BASE}${endpoint}")
    else
        response=$(curl -s -X "$method" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            "${ASC_API_BASE}${endpoint}")
    fi
    
    if [ "${VERBOSE:-false}" = true ]; then
        echo "[DEBUG] Response: $(echo "$response" | head -c 500)" >&2
    fi
    
    echo "$response"
}

# Upload file to App Store Connect
asc_upload_file() {
    local upload_url="$1"
    local file_path="$2"
    
    local token
    token=$(generate_asc_token)
    
    # Determine content type
    local content_type="image/png"
    [[ "$file_path" == *.jpg ]] && content_type="image/jpeg"
    [[ "$file_path" == *.jpeg ]] && content_type="image/jpeg"
    
    curl -s -X PUT \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: $content_type" \
        --data-binary "@$file_path" \
        "$upload_url"
}

# ─────────────────────────────────────────────────────────────────────────────
# App Store Connect API - Screenshot Operations
# ─────────────────────────────────────────────────────────────────────────────

# Get app ID by bundle identifier
get_app_id() {
    local bundle_id="$1"
    
    # Generate token
    local token
    token=$("$SCRIPT_DIR/asc-token.js")
    
    if [ -z "$token" ]; then
        echo "Failed to generate token" >&2
        return 1
    fi
    
    # URL encode the filter - brackets need to be escaped
    local url="https://api.appstoreconnect.apple.com/v1/apps?filter%5BbundleId%5D=${bundle_id}"
    
    local response
    response=$(curl -s -X GET \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        "$url")
    
    # Debug: show error if any
    local error_msg
    error_msg=$(echo "$response" | jq -r '.errors[0].detail // .errors[0].title // empty' 2>/dev/null)
    if [ -n "$error_msg" ]; then
        echo "API Error: $error_msg" >&2
    fi
    
    # Debug: show what we got
    if [ "${VERBOSE:-false}" = true ]; then
        local count
        count=$(echo "$response" | jq -r '.data | length // 0' 2>/dev/null)
        echo "[DEBUG] Found $count apps matching filter" >&2
        echo "$response" | jq -r '.data[]? | "  - \(.attributes.bundleId) (\(.id))"' 2>/dev/null >&2
    fi
    
    echo "$response" | jq -r '.data[0].id // empty'
}

# List all apps accessible to this API key (for debugging)
list_all_apps() {
    echo "Apps accessible to this API key:" >&2
    
    # Generate token directly for debugging
    local token
    token=$("$SCRIPT_DIR/asc-token.js")
    echo "  Token length: ${#token}" >&2
    
    if [ -z "$token" ]; then
        echo "  ERROR: Failed to generate token" >&2
        return 1
    fi
    
    # Make curl call and show what happens
    echo "  Calling API..." >&2
    local response
    response=$(curl -s -X GET \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        "https://api.appstoreconnect.apple.com/v1/apps?limit=5")
    
    echo "  Response length: ${#response}" >&2
    
    # Show apps if any
    local count
    count=$(echo "$response" | jq -r '.data | length // 0' 2>/dev/null)
    echo "  Apps found: $count" >&2
    
    if [ "$count" -gt 0 ]; then
        echo "$response" | jq -r '.data[]? | "  - \(.attributes.bundleId) (\(.attributes.name))"' 2>/dev/null >&2
    else
        echo "  Response preview: $(echo "$response" | head -c 300)" >&2
    fi
}

# Get the latest app store version (for editing)
get_app_store_version() {
    local app_id="$1"
    local response
    
    # Get all versions and filter locally (API filter syntax can be unreliable)
    response=$(asc_api GET "/apps/$app_id/appStoreVersions?limit=10")
    
    # Find version in PREPARE_FOR_SUBMISSION state
    local version_id
    version_id=$(echo "$response" | jq -r '.data[] | select(.attributes.appStoreState == "PREPARE_FOR_SUBMISSION") | .id' | head -1)
    
    if [ -n "$version_id" ]; then
        local version_string
        version_string=$(echo "$response" | jq -r ".data[] | select(.id == \"$version_id\") | .attributes.versionString")
        echo "  Found version $version_string in PREPARE_FOR_SUBMISSION state" >&2
        echo "$version_id"
        return 0
    fi
    
    # If no editable version found, show all versions for debugging
    echo "  No version in PREPARE_FOR_SUBMISSION state found." >&2
    echo "" >&2
    echo "  Existing versions:" >&2
    echo "$response" | jq -r '.data[] | "    - Version \(.attributes.versionString): \(.attributes.appStoreState)"' >&2
    
    echo "" >&2
    echo "  To upload screenshots, you need a version in 'Prepare for Submission' state." >&2
    echo "  Go to App Store Connect and create a new version, or edit an existing draft." >&2
    
    return 1
}

# Get app store version localizations
get_version_localizations() {
    local version_id="$1"
    local response
    response=$(asc_api GET "/appStoreVersions/$version_id/appStoreVersionLocalizations")
    echo "$response"
}

# Get or create localization for a version
get_or_create_localization() {
    local version_id="$1"
    local locale="$2"
    
    # Get all localizations and filter locally (API filter can be unreliable)
    local response
    response=$(asc_api GET "/appStoreVersions/$version_id/appStoreVersionLocalizations")
    
    if [ "${VERBOSE:-false}" = true ]; then
        echo "[DEBUG] Localizations response: $(echo "$response" | head -c 500)" >&2
    fi
    
    # Find matching locale
    local loc_id
    loc_id=$(echo "$response" | jq -r ".data[] | select(.attributes.locale == \"$locale\") | .id" | head -1)
    
    if [ -n "$loc_id" ]; then
        echo "  Found existing localization: $loc_id" >&2
        echo "$loc_id"
        return 0
    fi
    
    # Show available localizations for debugging
    echo "  Available localizations:" >&2
    echo "$response" | jq -r '.data[].attributes.locale' 2>/dev/null | while read -r loc; do
        echo "    - $loc" >&2
    done
    
    # Create new localization
    echo "  Creating new localization for $locale..." >&2
    local create_data='{
        "data": {
            "type": "appStoreVersionLocalizations",
            "attributes": {
                "locale": "'"$locale"'"
            },
            "relationships": {
                "appStoreVersion": {
                    "data": {
                        "type": "appStoreVersions",
                        "id": "'"$version_id"'"
                    }
                }
            }
        }
    }'
    
    response=$(asc_api POST "/appStoreVersionLocalizations" "$create_data")
    
    local error_msg
    error_msg=$(echo "$response" | jq -r '.errors[0].detail // .errors[0].title // empty' 2>/dev/null)
    if [ -n "$error_msg" ]; then
        echo "  Error creating localization: $error_msg" >&2
    fi
    
    loc_id=$(echo "$response" | jq -r '.data.id // empty')
    if [ -n "$loc_id" ]; then
        echo "  Created localization: $loc_id" >&2
    fi
    
    echo "$loc_id"
}

# Get screenshot sets for a localization
get_screenshot_sets() {
    local localization_id="$1"
    local response
    response=$(asc_api GET "/appStoreVersionLocalizations/$localization_id/appScreenshotSets")
    echo "$response"
}

# Get or create screenshot set
get_or_create_screenshot_set() {
    local localization_id="$1"
    local display_type="$2"
    
    # Get all screenshot sets and filter locally (API filter can be unreliable)
    local response
    response=$(asc_api GET "/appStoreVersionLocalizations/$localization_id/appScreenshotSets")
    
    # Find matching display type
    local set_id
    set_id=$(echo "$response" | jq -r ".data[] | select(.attributes.screenshotDisplayType == \"$display_type\") | .id" | head -1)
    
    if [ -n "$set_id" ]; then
        echo "$set_id"
        return 0
    fi
    
    # Show existing screenshot sets for debugging
    if [ "${VERBOSE:-false}" = true ]; then
        echo "    [DEBUG] Existing screenshot sets:" >&2
        echo "$response" | jq -r '.data[].attributes.screenshotDisplayType' 2>/dev/null | while read -r t; do
            echo "      - $t" >&2
        done
    fi
    
    # Create new screenshot set
    echo "    Creating screenshot set for $display_type..." >&2
    local create_data='{
        "data": {
            "type": "appScreenshotSets",
            "attributes": {
                "screenshotDisplayType": "'"$display_type"'"
            },
            "relationships": {
                "appStoreVersionLocalization": {
                    "data": {
                        "type": "appStoreVersionLocalizations",
                        "id": "'"$localization_id"'"
                    }
                }
            }
        }
    }'
    
    response=$(asc_api POST "/appScreenshotSets" "$create_data")
    
    local error_msg
    error_msg=$(echo "$response" | jq -r '.errors[0].detail // .errors[0].title // empty' 2>/dev/null)
    if [ -n "$error_msg" ]; then
        echo "    Error: $error_msg" >&2
        # Show valid values if provided in error
        local valid_values
        valid_values=$(echo "$response" | jq -r '.errors[0].meta.associatedErrors // empty' 2>/dev/null)
        if [ -n "$valid_values" ]; then
            echo "    Valid values: $valid_values" >&2
        fi
    fi
    
    set_id=$(echo "$response" | jq -r '.data.id // empty')
    echo "$set_id"
}

# Get screenshots in a set
get_screenshots_in_set() {
    local set_id="$1"
    local response
    response=$(asc_api GET "/appScreenshotSets/$set_id/appScreenshots")
    echo "$response"
}

# Delete a screenshot
delete_screenshot() {
    local screenshot_id="$1"
    asc_api DELETE "/appScreenshots/$screenshot_id" >/dev/null
}

# Reserve a screenshot slot and get upload URL
reserve_screenshot() {
    local set_id="$1"
    local file_path="$2"
    local file_name
    file_name=$(basename "$file_path")
    local file_size
    file_size=$(stat -f%z "$file_path" 2>/dev/null || stat -c%s "$file_path" 2>/dev/null)
    
    local create_data='{
        "data": {
            "type": "appScreenshots",
            "attributes": {
                "fileName": "'"$file_name"'",
                "fileSize": '"$file_size"'
            },
            "relationships": {
                "appScreenshotSet": {
                    "data": {
                        "type": "appScreenshotSets",
                        "id": "'"$set_id"'"
                    }
                }
            }
        }
    }'
    
    local response
    response=$(asc_api POST "/appScreenshots" "$create_data")
    echo "$response"
}

# Commit screenshot upload
commit_screenshot() {
    local screenshot_id="$1"
    local checksum="$2"
    
    local commit_data='{
        "data": {
            "type": "appScreenshots",
            "id": "'"$screenshot_id"'",
            "attributes": {
                "uploaded": true,
                "sourceFileChecksum": "'"$checksum"'"
            }
        }
    }'
    
    asc_api PATCH "/appScreenshots/$screenshot_id" "$commit_data"
}

# Upload a single screenshot to App Store Connect
upload_screenshot_to_asc() {
    local set_id="$1"
    local file_path="$2"
    
    local file_name
    file_name=$(basename "$file_path")
    
    # 1. Reserve screenshot slot
    local reserve_response
    reserve_response=$(reserve_screenshot "$set_id" "$file_path")
    
    local screenshot_id
    screenshot_id=$(echo "$reserve_response" | jq -r '.data.id // empty')
    
    if [ -z "$screenshot_id" ]; then
        local api_error
        api_error=$(echo "$reserve_response" | jq -r '.errors[0].detail // .errors[0].title // "Unknown error"')
        error "Failed to reserve screenshot: $api_error"
        return 1
    fi
    
    # Get upload operations
    local upload_ops
    upload_ops=$(echo "$reserve_response" | jq -r '.data.attributes.uploadOperations')
    
    if [ "$upload_ops" = "null" ] || [ -z "$upload_ops" ]; then
        error "No upload operations returned"
        return 1
    fi
    
    # 2. Upload file parts
    local num_parts
    num_parts=$(echo "$upload_ops" | jq 'length')
    
    for ((i=0; i<num_parts; i++)); do
        local url method offset length
        url=$(echo "$upload_ops" | jq -r ".[$i].url")
        method=$(echo "$upload_ops" | jq -r ".[$i].method")
        offset=$(echo "$upload_ops" | jq -r ".[$i].offset")
        length=$(echo "$upload_ops" | jq -r ".[$i].length")
        
        # Extract headers
        local headers=()
        while IFS= read -r header; do
            headers+=(-H "$header")
        done < <(echo "$upload_ops" | jq -r ".[$i].requestHeaders[] | \"\(.name): \(.value)\"")
        
        # Upload the part
        dd if="$file_path" bs=1 skip="$offset" count="$length" 2>/dev/null | \
            curl -s -X "$method" "${headers[@]}" --data-binary @- "$url" >/dev/null
    done
    
    # 3. Calculate checksum and commit
    local checksum
    checksum=$(md5 -q "$file_path" 2>/dev/null || md5sum "$file_path" | awk '{print $1}')
    
    local commit_response
    commit_response=$(commit_screenshot "$screenshot_id" "$checksum")
    
    local state
    state=$(echo "$commit_response" | jq -r '.data.attributes.assetDeliveryState.state // empty')
    
    if [ "$state" = "UPLOAD_COMPLETE" ] || [ "$state" = "COMPLETE" ]; then
        return 0
    else
        # Check for error
        local api_error
        api_error=$(echo "$commit_response" | jq -r '.errors[0].detail // empty')
        if [ -n "$api_error" ]; then
            error "Commit failed: $api_error"
        fi
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Google Play API - Authentication
# ─────────────────────────────────────────────────────────────────────────────

# Generate OAuth2 access token for Google Play API using Node.js helper
generate_google_token() {
    "$SCRIPT_DIR/google-token.js"
}

# Make authenticated API call to Google Play
google_api() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    
    local token
    token=$(generate_google_token)
    
    if [ -z "$token" ]; then
        error "Failed to generate Google API token"
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

# Upload image to Google Play
google_upload_image() {
    local endpoint="$1"
    local file_path="$2"
    
    local token
    token=$(generate_google_token)
    
    if [ -z "$token" ]; then
        error "Failed to generate Google API token"
        return 1
    fi
    
    # Determine content type
    local content_type="image/png"
    [[ "$file_path" == *.jpg ]] && content_type="image/jpeg"
    [[ "$file_path" == *.jpeg ]] && content_type="image/jpeg"
    
    curl -s -X POST \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: $content_type" \
        --data-binary "@$file_path" \
        "https://androidpublisher.googleapis.com/upload/androidpublisher/v3${endpoint}"
}

# ─────────────────────────────────────────────────────────────────────────────
# Upload Functions
# ─────────────────────────────────────────────────────────────────────────────

upload_ios() {
    local locales=("$@")
    local dry_run=${DRY_RUN:-false}
    
    header "App Store Connect Upload"
    echo ""
    
    # Validate authentication (skip in dry-run mode)
    if ! $dry_run; then
        if ! validate_ios_auth; then
            return 1
        fi
    fi
    
    info "Preparing screenshots..."
    
    # Count screenshots
    local total_count=0
    for locale in "${locales[@]}"; do
        for device in $(get_device_list); do
            local dir="$INPUT_DIR/ios/$device/$locale"
            if [ -d "$dir" ]; then
                local count
                count=$(find "$dir" -maxdepth 1 \( -name "*.jpg" -o -name "*.png" \) -type f | wc -l | tr -d ' ')
                total_count=$((total_count + count))
            fi
        done
    done
    
    if [ "$total_count" -eq 0 ]; then
        warn "No screenshots found to upload"
        return 1
    fi
    
    info "Found $total_count screenshots"
    info "Locales: ${locales[*]}"
    echo ""
    
    # Show preview
    info "Screenshot structure:"
    for locale in "${locales[@]}"; do
        local store_locale
        store_locale=$(get_ios_locale "$locale")
        for device in $(get_device_list); do
            local dir="$INPUT_DIR/ios/$device/$locale"
            if [ -d "$dir" ]; then
                local display_type
                display_type=$(get_ios_screenshot_type "$device")
                find "$dir" -maxdepth 1 \( -name "*.jpg" -o -name "*.png" \) -type f | head -3 | while read -r f; do
                    echo "  $store_locale/$display_type/$(basename "$f")"
                done
            fi
        done
    done | head -10
    [ "$total_count" -gt 10 ] && echo "  ... and $((total_count - 10)) more"
    echo ""
    
    if $dry_run; then
        warn "DRY RUN: Skipping actual upload"
        return 0
    fi
    
    info "Connecting to App Store Connect..."
    
    # Test API connection first
    info "Testing API authentication..."
    local test_response
    test_response=$(asc_api GET "/apps?limit=1")
    local test_error
    test_error=$(echo "$test_response" | jq -r '.errors[0].detail // .errors[0].title // empty' 2>/dev/null)
    if [ -n "$test_error" ]; then
        error "API authentication failed: $test_error"
        return 1
    fi
    success "API authentication successful"
    
    # Get app ID
    local app_id
    app_id=$(get_app_id "$IOS_BUNDLE_ID")
    if [ -z "$app_id" ]; then
        error "Could not find app with bundle ID: $IOS_BUNDLE_ID"
        echo ""
        list_all_apps
        echo ""
        info "Make sure your API key has access to the app"
        return 1
    fi
    success "Found app: $app_id"
    
    # Get app store version
    local version_id
    version_id=$(get_app_store_version "$app_id")
    if [ -z "$version_id" ]; then
        error "Could not find editable app store version (see above for details)"
        return 1
    fi
    success "Found editable version: $version_id"
    
    echo ""
    info "Uploading screenshots..."
    
    local uploaded=0
    local failed=0
    
    for locale in "${locales[@]}"; do
        local store_locale
        store_locale=$(get_ios_locale "$locale")
        
        echo ""
        info "Processing locale: $store_locale"
        
        # Get or create localization
        local loc_id
        loc_id=$(get_or_create_localization "$version_id" "$store_locale")
        if [ -z "$loc_id" ]; then
            error "Could not get/create localization for $store_locale"
            continue
        fi
        
        for device in $(get_device_list); do
            local dir="$INPUT_DIR/ios/$device/$locale"
            [ -d "$dir" ] || continue
            
            local display_type
            display_type=$(get_ios_screenshot_type "$device")
            
            info "  $display_type..."
            
            # Get or create screenshot set
            local set_id
            set_id=$(get_or_create_screenshot_set "$loc_id" "$display_type")
            if [ -z "$set_id" ]; then
                error "Could not get/create screenshot set for $display_type"
                continue
            fi
            
            # Delete existing screenshots in set
            local existing
            existing=$(get_screenshots_in_set "$set_id")
            echo "$existing" | jq -r '.data[].id // empty' | while read -r ss_id; do
                [ -n "$ss_id" ] && delete_screenshot "$ss_id"
            done
            
            # Upload new screenshots
            while IFS= read -r -d '' img; do
                local filename
                filename=$(basename "$img")
                if upload_screenshot_to_asc "$set_id" "$img"; then
                    success "    $filename"
                    ((uploaded++))
                else
                    error "    $filename"
                    ((failed++))
                fi
            done < <(find "$dir" -maxdepth 1 \( -name "*.jpg" -o -name "*.png" \) -type f -print0 | sort -z)
        done
    done
    
    echo ""
    if [ $failed -eq 0 ]; then
        success "Successfully uploaded $uploaded screenshots"
    else
        warn "Uploaded $uploaded screenshots, $failed failed"
        return 1
    fi
}

upload_android() {
    local locales=("$@")
    local dry_run=${DRY_RUN:-false}
    
    header "Google Play Store Upload"
    echo ""
    
    # Validate authentication (skip in dry-run mode)
    if ! $dry_run; then
        if ! validate_android_auth; then
            return 1
        fi
    fi
    
    info "Preparing screenshots..."
    
    # Count screenshots
    local total_count=0
    for locale in "${locales[@]}"; do
        for device in $(get_device_list); do
            local dir="$INPUT_DIR/android/$device/$locale"
            if [ -d "$dir" ]; then
                local count
                count=$(find "$dir" -maxdepth 1 \( -name "*.jpg" -o -name "*.png" \) -type f | wc -l | tr -d ' ')
                total_count=$((total_count + count))
            fi
        done
    done
    
    if [ "$total_count" -eq 0 ]; then
        warn "No screenshots found to upload"
        return 1
    fi
    
    info "Found $total_count screenshots"
    info "Locales: ${locales[*]}"
    echo ""
    
    # Show preview
    info "Screenshot structure:"
    for locale in "${locales[@]}"; do
        local store_locale
        store_locale=$(get_android_locale "$locale")
        for device in $(get_device_list); do
            local dir="$INPUT_DIR/android/$device/$locale"
            if [ -d "$dir" ]; then
                local image_types
                image_types=$(get_android_screenshot_types "$device")
                for image_type in $image_types; do
                    find "$dir" -maxdepth 1 \( -name "*.jpg" -o -name "*.png" \) -type f | sort | head -3 | while read -r f; do
                        echo "  $store_locale/$image_type/$(basename "$f")"
                    done
                done
            fi
        done
    done | head -10
    [ "$total_count" -gt 10 ] && echo "  ... and more (max 8 per type)"
    echo ""
    
    if $dry_run; then
        warn "DRY RUN: Skipping actual upload"
        return 0
    fi
    
    info "Connecting to Google Play..."
    
    # Create an edit
    local edit_response
    edit_response=$(google_api POST "/applications/$ANDROID_PACKAGE_NAME/edits" '{}')
    local edit_id
    edit_id=$(echo "$edit_response" | jq -r '.id // empty')
    
    if [ -z "$edit_id" ]; then
        local api_error
        api_error=$(echo "$edit_response" | jq -r '.error.message // "Unknown error"')
        error "Could not create edit: $api_error"
        return 1
    fi
    success "Created edit: $edit_id"
    
    echo ""
    info "Uploading screenshots..."
    
    local uploaded=0
    local failed=0
    
    for locale in "${locales[@]}"; do
        local store_locale
        store_locale=$(get_android_locale "$locale")
        
        echo ""
        info "Processing locale: $store_locale"
        
        for device in $(get_device_list); do
            local dir="$INPUT_DIR/android/$device/$locale"
            [ -d "$dir" ] || continue
            
            local image_types
            image_types=$(get_android_screenshot_types "$device")
            
            for image_type in $image_types; do
                info "  $image_type..."
                
                # Delete existing screenshots
                google_api DELETE "/applications/$ANDROID_PACKAGE_NAME/edits/$edit_id/listings/$store_locale/$image_type" >/dev/null 2>&1 || true
                
                # Upload new screenshots (max 8 per type)
                local count=0
                while IFS= read -r -d '' img; do
                    [ $count -ge 8 ] && break
                    
                    local filename
                    filename=$(basename "$img")
                    local upload_response
                    upload_response=$(google_upload_image "/applications/$ANDROID_PACKAGE_NAME/edits/$edit_id/listings/$store_locale/$image_type" "$img")
                    
                    local image_id
                    image_id=$(echo "$upload_response" | jq -r '.image.id // empty')
                    
                    if [ -n "$image_id" ]; then
                        success "    $filename"
                        ((uploaded++))
                        ((count++))
                    else
                        error "    $filename"
                        ((failed++))
                    fi
                done < <(find "$dir" -maxdepth 1 \( -name "*.jpg" -o -name "*.png" \) -type f -print0 | sort -z)
            done
        done
    done
    
    # Commit the edit
    echo ""
    info "Committing changes..."
    local commit_response
    commit_response=$(google_api POST "/applications/$ANDROID_PACKAGE_NAME/edits/$edit_id:commit?changesNotSentForReview=true" '{}')
    
    if echo "$commit_response" | jq -e '.id' >/dev/null 2>&1; then
        success "Changes committed successfully"
    else
        local api_error
        api_error=$(echo "$commit_response" | jq -r '.error.message // "Unknown error"')
        error "Failed to commit: $api_error"
        return 1
    fi
    
    echo ""
    if [ $failed -eq 0 ]; then
        success "Successfully uploaded $uploaded screenshots"
    else
        warn "Uploaded $uploaded screenshots, $failed failed"
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

show_help() {
    cat << 'EOF'
Upload - Marketing screenshot uploader for Facts a Day

Uses official App Store Connect and Google Play APIs directly (no fastlane).

USAGE:
    ./marketing/scripts/upload.sh --ios [OPTIONS]
    ./marketing/scripts/upload.sh --android [OPTIONS]
    ./marketing/scripts/upload.sh --all [OPTIONS]

PLATFORM (at least one required):
    --ios               Upload to App Store Connect
    --android           Upload to Google Play Store
    --all               Upload to both stores

OPTIONS:
    --locale <code>     Upload specific locale only (en, de, es, fr, ja, ko, tr, zh)
    --all-locales       Upload all 8 supported locales (default)
    --phone-only        Upload phone screenshots only
    --tablet-only       Upload tablet screenshots only
    --dry-run           Preview what would be uploaded without uploading
    --verbose, -v       Show detailed debug output
    --help, -h          Show this help

AUTHENTICATION:

  App Store Connect (iOS):
    Set these environment variables:
      ASC_KEY_ID        API Key ID (e.g., "ABC123XYZ")
      ASC_ISSUER_ID     Issuer ID (e.g., "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
      ASC_KEY_PATH      Path to .p8 key file (e.g., "./AuthKey_ABC123XYZ.p8")

    Create API key at: https://appstoreconnect.apple.com/access/api

  Google Play Store (Android):
    Set this environment variable:
      GOOGLE_PLAY_JSON_KEY    Path to service account JSON file

    Create service account at: https://console.cloud.google.com/iam-admin/serviceaccounts
    Then grant access in: Google Play Console → Settings → API access

EXAMPLES:
    # Upload iOS screenshots (all locales)
    ./marketing/scripts/upload.sh --ios

    # Upload Android screenshots (German only)
    ./marketing/scripts/upload.sh --android --locale de

    # Upload to both stores
    ./marketing/scripts/upload.sh --all

    # Upload tablet screenshots only
    ./marketing/scripts/upload.sh --ios --tablet-only

    # Upload phone screenshots for specific locale
    ./marketing/scripts/upload.sh --ios --phone-only --locale en

    # Preview upload without actually uploading
    ./marketing/scripts/upload.sh --ios --dry-run

    # Export auth and upload
    export ASC_KEY_ID="ABC123XYZ"
    export ASC_ISSUER_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    export ASC_KEY_PATH="./AuthKey_ABC123XYZ.p8"
    ./marketing/scripts/upload.sh --ios

INPUT:
    Reads framed screenshots from marketing/output/:
    ├── ios/
    │   ├── phone/{locale}/*.jpg
    │   └── tablet/{locale}/*.jpg
    └── android/
        ├── phone/{locale}/*.jpg
        └── tablet/{locale}/*.jpg

    Run ./marketing/scripts/frame.sh first to generate these files.

SCREENSHOT TYPES:
    iOS:
      - Phone: APP_IPHONE_65 (6.5" - iPhone 15 Plus, 14 Plus, 11 Pro Max)
      - Tablet: APP_IPAD_PRO_3GEN_129 (12.9" iPad Pro 3rd gen+)

    Android:
      - Phone: phoneScreenshots
      - Tablet: tenInchScreenshots (10" tablets)

EOF
}

main() {
    local upload_ios=false
    local upload_android=false
    local filter_locale=""
    local dry_run=false
    local verbose=false
    local device_filter=""  # "", "phone", or "tablet"
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --ios)
                upload_ios=true
                shift
                ;;
            --android)
                upload_android=true
                shift
                ;;
            --all)
                upload_ios=true
                upload_android=true
                shift
                ;;
            --locale)
                filter_locale="$2"
                shift 2
                ;;
            --all-locales)
                filter_locale=""
                shift
                ;;
            --dry-run)
                dry_run=true
                shift
                ;;
            --verbose|-v)
                verbose=true
                shift
                ;;
            --phone-only)
                device_filter="phone"
                shift
                ;;
            --tablet-only)
                device_filter="tablet"
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                echo "Use --help for usage information" >&2
                exit 1
                ;;
        esac
    done
    
    # Export verbose flag
    export VERBOSE=$verbose
    
    # Require at least one platform
    if ! $upload_ios && ! $upload_android; then
        error "Platform required: --ios, --android, or --all"
        echo "" >&2
        echo "Usage:" >&2
        echo "  ./marketing/scripts/upload.sh --ios" >&2
        echo "  ./marketing/scripts/upload.sh --android" >&2
        echo "  ./marketing/scripts/upload.sh --all" >&2
        echo "" >&2
        echo "Use --help for more options" >&2
        exit 1
    fi
    
    # Check dependencies
    check_dependencies
    
    # Verify input directory exists
    if [ ! -d "$INPUT_DIR" ]; then
        error "Input directory not found: $INPUT_DIR"
        echo "" >&2
        echo "Run frame.sh first to generate marketing screenshots:" >&2
        echo "  ./marketing/scripts/frame.sh" >&2
        exit 1
    fi
    
    # Determine locales
    local locales=()
    if [ -n "$filter_locale" ]; then
        locales=("$filter_locale")
    else
        locales=("${ALL_LOCALES[@]}")
    fi
    
    # Export dry run flag for upload functions
    export DRY_RUN=$dry_run
    
    # Print header
    header "Marketing Screenshot Upload"
    echo ""
    info "Input:        $INPUT_DIR/"
    info "Locales:      ${locales[*]}"
    info "Platforms:    $([ "$upload_ios" = true ] && echo "iOS ")$([ "$upload_android" = true ] && echo "Android")"
    [ -n "$device_filter" ] && info "Device:       $device_filter only"
    $dry_run && warn "Mode:         DRY RUN (no actual upload)"
    
    # Export device filter for upload functions
    export DEVICE_FILTER="$device_filter"
    
    local failed=0
    
    # Upload to iOS
    if $upload_ios; then
        if ! upload_ios "${locales[@]}"; then
            ((failed++))
        fi
    fi
    
    # Upload to Android
    if $upload_android; then
        if ! upload_android "${locales[@]}"; then
            ((failed++))
        fi
    fi
    
    # Summary
    echo ""
    header "Complete"
    echo ""
    
    if [ $failed -eq 0 ]; then
        success "All uploads completed successfully"
    else
        error "$failed platform(s) failed"
        exit 1
    fi
}

main "$@"
