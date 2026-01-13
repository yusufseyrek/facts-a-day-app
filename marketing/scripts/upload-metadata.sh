#!/bin/bash

# Marketing Metadata Uploader
# Uploads app store metadata (titles, descriptions, keywords) to App Store Connect and Google Play Store
# Uses official REST APIs directly (no fastlane dependency)
#
# Prerequisites:
#   - jq: brew install jq
#   - For iOS: App Store Connect API Key (set ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH)
#   - For Android: Google Play Service Account JSON (set GOOGLE_PLAY_JSON_KEY)
#
# Usage:
#   ./marketing/scripts/upload-metadata.sh --ios                    # Upload to App Store Connect
#   ./marketing/scripts/upload-metadata.sh --android                # Upload to Google Play Store
#   ./marketing/scripts/upload-metadata.sh --all                    # Upload to both stores
#   ./marketing/scripts/upload-metadata.sh --ios --locale en        # Upload specific locale
#   ./marketing/scripts/upload-metadata.sh --ios --dry-run          # Preview without uploading

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

# Metadata config file
METADATA_FILE="$MARKETING_DIR/config/metadata.json"

# Supported locales (internal codes)
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

generate_asc_token() {
    if [ -z "$ASC_KEY_ID" ] || [ -z "$ASC_ISSUER_ID" ] || [ -z "$ASC_KEY_PATH" ]; then
        echo "" 
        return 1
    fi
    
    if [ ! -f "$ASC_KEY_PATH" ]; then
        echo ""
        return 1
    fi
    
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
    
    if [ "${VERBOSE:-false}" = true ]; then
        echo "[DEBUG] $method ${ASC_API_BASE}${endpoint}" >&2
    fi
    
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

# ─────────────────────────────────────────────────────────────────────────────
# App Store Connect API - App & Version Operations
# ─────────────────────────────────────────────────────────────────────────────

get_app_id() {
    local bundle_id="$1"
    
    local token
    token=$("$SCRIPT_DIR/asc-token.js")
    
    if [ -z "$token" ]; then
        echo "Failed to generate token" >&2
        return 1
    fi
    
    local url="https://api.appstoreconnect.apple.com/v1/apps?filter%5BbundleId%5D=${bundle_id}"
    
    local response
    response=$(curl -s -X GET \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        "$url")
    
    local error_msg
    error_msg=$(echo "$response" | jq -r '.errors[0].detail // .errors[0].title // empty' 2>/dev/null)
    if [ -n "$error_msg" ]; then
        echo "API Error: $error_msg" >&2
    fi
    
    echo "$response" | jq -r '.data[0].id // empty'
}

get_app_store_version() {
    local app_id="$1"
    local response
    
    response=$(asc_api GET "/apps/$app_id/appStoreVersions?limit=10")
    
    local version_id
    version_id=$(echo "$response" | jq -r '.data[] | select(.attributes.appStoreState == "PREPARE_FOR_SUBMISSION") | .id' | head -1)
    
    if [ -n "$version_id" ]; then
        local version_string
        version_string=$(echo "$response" | jq -r ".data[] | select(.id == \"$version_id\") | .attributes.versionString")
        echo "  Found version $version_string in PREPARE_FOR_SUBMISSION state" >&2
        echo "$version_id"
        return 0
    fi
    
    echo "  No version in PREPARE_FOR_SUBMISSION state found." >&2
    echo "" >&2
    echo "  Existing versions:" >&2
    echo "$response" | jq -r '.data[] | "    - Version \(.attributes.versionString): \(.attributes.appStoreState)"' >&2
    
    return 1
}

get_or_create_localization() {
    local version_id="$1"
    local locale="$2"
    
    local response
    response=$(asc_api GET "/appStoreVersions/$version_id/appStoreVersionLocalizations")
    
    local loc_id
    loc_id=$(echo "$response" | jq -r ".data[] | select(.attributes.locale == \"$locale\") | .id" | head -1)
    
    if [ -n "$loc_id" ]; then
        echo "$loc_id"
        return 0
    fi
    
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
    echo "$loc_id"
}

# Update app store version localization metadata
update_version_localization() {
    local loc_id="$1"
    local description="$2"
    local keywords="$3"
    local whats_new="$4"
    local promo_text="$5"
    
    # Escape JSON strings properly
    local desc_escaped
    local keywords_escaped
    local whats_new_escaped
    local promo_escaped
    
    desc_escaped=$(echo "$description" | jq -Rs '.')
    keywords_escaped=$(echo "$keywords" | jq -Rs '.')
    whats_new_escaped=$(echo "$whats_new" | jq -Rs '.')
    promo_escaped=$(echo "$promo_text" | jq -Rs '.')
    
    local update_data
    update_data=$(jq -n \
        --arg desc "$description" \
        --arg kw "$keywords" \
        --arg wn "$whats_new" \
        --arg promo "$promo_text" \
        '{
            "data": {
                "type": "appStoreVersionLocalizations",
                "id": "'"$loc_id"'",
                "attributes": {
                    "description": $desc,
                    "keywords": $kw,
                    "whatsNew": $wn,
                    "promotionalText": $promo
                }
            }
        }')
    
    local response
    response=$(asc_api PATCH "/appStoreVersionLocalizations/$loc_id" "$update_data")
    
    local error_msg
    error_msg=$(echo "$response" | jq -r '.errors[0].detail // .errors[0].title // empty' 2>/dev/null)
    if [ -n "$error_msg" ]; then
        echo "    Error: $error_msg" >&2
        return 1
    fi
    
    return 0
}

# Get or create app info localization (for name and subtitle)
get_or_create_app_info_localization() {
    local app_id="$1"
    local locale="$2"
    
    # First, get the app info ID
    local app_info_response
    app_info_response=$(asc_api GET "/apps/$app_id/appInfos")
    
    local app_info_id
    app_info_id=$(echo "$app_info_response" | jq -r '.data[0].id // empty')
    
    if [ -z "$app_info_id" ]; then
        echo "  Could not get app info" >&2
        return 1
    fi
    
    # Get app info localizations
    local response
    response=$(asc_api GET "/appInfos/$app_info_id/appInfoLocalizations")
    
    local loc_id
    loc_id=$(echo "$response" | jq -r ".data[] | select(.attributes.locale == \"$locale\") | .id" | head -1)
    
    if [ -n "$loc_id" ]; then
        echo "$loc_id"
        return 0
    fi
    
    # Create new app info localization
    echo "  Creating new app info localization for $locale..." >&2
    local create_data='{
        "data": {
            "type": "appInfoLocalizations",
            "attributes": {
                "locale": "'"$locale"'"
            },
            "relationships": {
                "appInfo": {
                    "data": {
                        "type": "appInfos",
                        "id": "'"$app_info_id"'"
                    }
                }
            }
        }
    }'
    
    response=$(asc_api POST "/appInfoLocalizations" "$create_data")
    
    local error_msg
    error_msg=$(echo "$response" | jq -r '.errors[0].detail // .errors[0].title // empty' 2>/dev/null)
    if [ -n "$error_msg" ]; then
        echo "  Error creating app info localization: $error_msg" >&2
    fi
    
    loc_id=$(echo "$response" | jq -r '.data.id // empty')
    echo "$loc_id"
}

# Update app info localization (name and subtitle)
update_app_info_localization() {
    local loc_id="$1"
    local name="$2"
    local subtitle="$3"
    
    local update_data
    update_data=$(jq -n \
        --arg name "$name" \
        --arg subtitle "$subtitle" \
        '{
            "data": {
                "type": "appInfoLocalizations",
                "id": "'"$loc_id"'",
                "attributes": {
                    "name": $name,
                    "subtitle": $subtitle
                }
            }
        }')
    
    local response
    response=$(asc_api PATCH "/appInfoLocalizations/$loc_id" "$update_data")
    
    local error_msg
    error_msg=$(echo "$response" | jq -r '.errors[0].detail // .errors[0].title // empty' 2>/dev/null)
    if [ -n "$error_msg" ]; then
        echo "    Error: $error_msg" >&2
        return 1
    fi
    
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Google Play API - Authentication
# ─────────────────────────────────────────────────────────────────────────────

generate_google_token() {
    "$SCRIPT_DIR/google-token.js"
}

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

# ─────────────────────────────────────────────────────────────────────────────
# Metadata Reading
# ─────────────────────────────────────────────────────────────────────────────

# Read iOS metadata for a locale
read_ios_metadata() {
    local locale="$1"
    local store_locale
    store_locale=$(get_ios_locale "$locale")
    
    if [ ! -f "$METADATA_FILE" ]; then
        error "Metadata file not found: $METADATA_FILE"
        return 1
    fi
    
    jq -r ".ios.locales[\"$store_locale\"] // empty" "$METADATA_FILE"
}

# Read Android metadata for a locale
read_android_metadata() {
    local locale="$1"
    local store_locale
    store_locale=$(get_android_locale "$locale")
    
    if [ ! -f "$METADATA_FILE" ]; then
        error "Metadata file not found: $METADATA_FILE"
        return 1
    fi
    
    jq -r ".android.locales[\"$store_locale\"] // empty" "$METADATA_FILE"
}

# ─────────────────────────────────────────────────────────────────────────────
# Upload Functions
# ─────────────────────────────────────────────────────────────────────────────

upload_ios_metadata() {
    local locales=("$@")
    local dry_run=${DRY_RUN:-false}
    
    header "App Store Connect Metadata Upload"
    echo ""
    
    # Validate metadata file exists
    if [ ! -f "$METADATA_FILE" ]; then
        error "Metadata file not found: $METADATA_FILE"
        return 1
    fi
    
    # Validate authentication (skip in dry-run mode)
    if ! $dry_run; then
        if ! validate_ios_auth; then
            return 1
        fi
    fi
    
    info "Loading metadata from config..."
    info "Locales: ${locales[*]}"
    echo ""
    
    # Preview metadata
    info "Metadata preview:"
    for locale in "${locales[@]}"; do
        local store_locale
        store_locale=$(get_ios_locale "$locale")
        
        local name subtitle
        name=$(jq -r ".ios.locales[\"$store_locale\"].name // \"(not set)\"" "$METADATA_FILE")
        subtitle=$(jq -r ".ios.locales[\"$store_locale\"].subtitle // \"(not set)\"" "$METADATA_FILE")
        
        echo -e "  ${CYAN}$store_locale:${NC}"
        echo "    Name: $name"
        echo "    Subtitle: $subtitle"
    done
    echo ""
    
    if $dry_run; then
        warn "DRY RUN: Skipping actual upload"
        echo ""
        info "Full metadata that would be uploaded:"
        for locale in "${locales[@]}"; do
            local store_locale
            store_locale=$(get_ios_locale "$locale")
            echo ""
            echo -e "  ${BOLD}$store_locale:${NC}"
            jq -r ".ios.locales[\"$store_locale\"] | to_entries[] | \"    \(.key): \(.value | tostring | .[0:60])...\"" "$METADATA_FILE" 2>/dev/null || echo "    (no metadata)"
        done
        return 0
    fi
    
    info "Connecting to App Store Connect..."
    
    # Test API connection
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
        return 1
    fi
    success "Found app: $app_id"
    
    # Get app store version
    local version_id
    version_id=$(get_app_store_version "$app_id")
    if [ -z "$version_id" ]; then
        error "Could not find editable app store version"
        return 1
    fi
    success "Found editable version: $version_id"
    
    echo ""
    info "Uploading metadata..."
    
    local updated=0
    local failed=0
    
    for locale in "${locales[@]}"; do
        local store_locale
        store_locale=$(get_ios_locale "$locale")
        
        echo ""
        info "Processing locale: $store_locale"
        
        # Read metadata for this locale
        local metadata
        metadata=$(read_ios_metadata "$locale")
        
        if [ -z "$metadata" ] || [ "$metadata" = "null" ]; then
            warn "  No metadata found for $store_locale, skipping"
            continue
        fi
        
        local name subtitle description keywords whats_new promo_text
        name=$(echo "$metadata" | jq -r '.name // empty')
        subtitle=$(echo "$metadata" | jq -r '.subtitle // empty')
        description=$(echo "$metadata" | jq -r '.description // empty')
        keywords=$(echo "$metadata" | jq -r '.keywords // empty')
        whats_new=$(echo "$metadata" | jq -r '.whatsNew // empty')
        promo_text=$(echo "$metadata" | jq -r '.promotionalText // empty')
        
        # Update app info localization (name & subtitle)
        local app_info_loc_id
        app_info_loc_id=$(get_or_create_app_info_localization "$app_id" "$store_locale")
        
        if [ -n "$app_info_loc_id" ] && [ -n "$name" ]; then
            info "  Updating app info (name & subtitle)..."
            if update_app_info_localization "$app_info_loc_id" "$name" "$subtitle"; then
                success "    Name: $name"
                success "    Subtitle: $subtitle"
            else
                warn "    Failed to update app info"
            fi
        fi
        
        # Update version localization (description, keywords, etc.)
        local loc_id
        loc_id=$(get_or_create_localization "$version_id" "$store_locale")
        
        if [ -z "$loc_id" ]; then
            error "  Could not get/create localization for $store_locale"
            ((failed++))
            continue
        fi
        
        info "  Updating version metadata..."
        if update_version_localization "$loc_id" "$description" "$keywords" "$whats_new" "$promo_text"; then
            success "    Description: $(echo "$description" | head -c 50)..."
            success "    Keywords: $(echo "$keywords" | head -c 50)..."
            success "    What's New: $(echo "$whats_new" | head -c 50)..."
            success "    Promotional Text: $(echo "$promo_text" | head -c 50)..."
            ((updated++))
        else
            error "  Failed to update metadata for $store_locale"
            ((failed++))
        fi
    done
    
    echo ""
    if [ $failed -eq 0 ]; then
        success "Successfully updated metadata for $updated locale(s)"
    else
        warn "Updated $updated locale(s), $failed failed"
        return 1
    fi
}

upload_android_metadata() {
    local locales=("$@")
    local dry_run=${DRY_RUN:-false}
    
    header "Google Play Store Metadata Upload"
    echo ""
    
    # Validate metadata file exists
    if [ ! -f "$METADATA_FILE" ]; then
        error "Metadata file not found: $METADATA_FILE"
        return 1
    fi
    
    # Validate authentication (skip in dry-run mode)
    if ! $dry_run; then
        if ! validate_android_auth; then
            return 1
        fi
    fi
    
    info "Loading metadata from config..."
    info "Locales: ${locales[*]}"
    echo ""
    
    # Preview metadata
    info "Metadata preview:"
    for locale in "${locales[@]}"; do
        local store_locale
        store_locale=$(get_android_locale "$locale")
        
        local title short_desc
        title=$(jq -r ".android.locales[\"$store_locale\"].title // \"(not set)\"" "$METADATA_FILE")
        short_desc=$(jq -r ".android.locales[\"$store_locale\"].shortDescription // \"(not set)\"" "$METADATA_FILE")
        
        echo -e "  ${CYAN}$store_locale:${NC}"
        echo "    Title: $title"
        echo "    Short: $short_desc"
    done
    echo ""
    
    if $dry_run; then
        warn "DRY RUN: Skipping actual upload"
        echo ""
        info "Full metadata that would be uploaded:"
        for locale in "${locales[@]}"; do
            local store_locale
            store_locale=$(get_android_locale "$locale")
            echo ""
            echo -e "  ${BOLD}$store_locale:${NC}"
            jq -r ".android.locales[\"$store_locale\"] | to_entries[] | \"    \(.key): \(.value | tostring | .[0:60])...\"" "$METADATA_FILE" 2>/dev/null || echo "    (no metadata)"
        done
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
    info "Uploading metadata..."
    
    local updated=0
    local failed=0
    
    for locale in "${locales[@]}"; do
        local store_locale
        store_locale=$(get_android_locale "$locale")
        
        echo ""
        info "Processing locale: $store_locale"
        
        # Read metadata for this locale
        local metadata
        metadata=$(read_android_metadata "$locale")
        
        if [ -z "$metadata" ] || [ "$metadata" = "null" ]; then
            warn "  No metadata found for $store_locale, skipping"
            continue
        fi
        
        local title short_desc full_desc recent_changes
        title=$(echo "$metadata" | jq -r '.title // empty')
        short_desc=$(echo "$metadata" | jq -r '.shortDescription // empty')
        full_desc=$(echo "$metadata" | jq -r '.fullDescription // empty')
        recent_changes=$(echo "$metadata" | jq -r '.recentChanges // empty')
        
        # Prepare listing update data
        local listing_data
        listing_data=$(jq -n \
            --arg title "$title" \
            --arg short "$short_desc" \
            --arg full "$full_desc" \
            '{
                "title": $title,
                "shortDescription": $short,
                "fullDescription": $full
            }')
        
        # Update listing
        local response
        response=$(google_api PUT "/applications/$ANDROID_PACKAGE_NAME/edits/$edit_id/listings/$store_locale" "$listing_data")
        
        local response_lang
        response_lang=$(echo "$response" | jq -r '.language // empty')
        
        if [ -n "$response_lang" ]; then
            success "  Title: $title"
            success "  Short Description: $(echo "$short_desc" | head -c 50)..."
            success "  Full Description: $(echo "$full_desc" | head -c 50)..."
            ((updated++))
        else
            local api_error
            api_error=$(echo "$response" | jq -r '.error.message // "Unknown error"')
            error "  Failed: $api_error"
            ((failed++))
        fi
    done
    
    # Commit the edit
    echo ""
    info "Committing changes..."
    local commit_response
    commit_response=$(google_api POST "/applications/$ANDROID_PACKAGE_NAME/edits/$edit_id:commit" '{}')
    
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
        success "Successfully updated metadata for $updated locale(s)"
    else
        warn "Updated $updated locale(s), $failed failed"
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

show_help() {
    cat << 'EOF'
Upload Metadata - App store metadata uploader for Facts a Day

Uploads app names, descriptions, keywords, and release notes to App Store Connect 
and Google Play Store using official APIs (no fastlane).

USAGE:
    ./marketing/scripts/upload-metadata.sh --ios [OPTIONS]
    ./marketing/scripts/upload-metadata.sh --android [OPTIONS]
    ./marketing/scripts/upload-metadata.sh --all [OPTIONS]

PLATFORM (at least one required):
    --ios               Upload to App Store Connect
    --android           Upload to Google Play Store
    --all               Upload to both stores

OPTIONS:
    --locale <code>     Upload specific locale only (en, de, es, fr, ja, ko, tr, zh)
    --all-locales       Upload all 8 supported locales (default)
    --dry-run           Preview what would be uploaded without uploading
    --verbose, -v       Show detailed debug output
    --help, -h          Show this help

METADATA SOURCE:
    Reads from: marketing/config/metadata.json

    This file contains all localized metadata for both stores:
    - iOS: name, subtitle, description, keywords, promotionalText, whatsNew
    - Android: title, shortDescription, fullDescription, recentChanges

AUTHENTICATION:

  App Store Connect (iOS):
    Set these environment variables:
      ASC_KEY_ID        API Key ID (e.g., "ABC123XYZ")
      ASC_ISSUER_ID     Issuer ID (e.g., "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
      ASC_KEY_PATH      Path to .p8 key file (e.g., "./AuthKey_ABC123XYZ.p8")

  Google Play Store (Android):
    Set this environment variable:
      GOOGLE_PLAY_JSON_KEY    Path to service account JSON file

EXAMPLES:
    # Preview metadata upload (no actual changes)
    ./marketing/scripts/upload-metadata.sh --ios --dry-run

    # Upload iOS metadata for all locales
    ./marketing/scripts/upload-metadata.sh --ios

    # Upload Android metadata for German only
    ./marketing/scripts/upload-metadata.sh --android --locale de

    # Upload to both stores
    ./marketing/scripts/upload-metadata.sh --all

    # Export auth and upload
    export ASC_KEY_ID="ABC123XYZ"
    export ASC_ISSUER_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    export ASC_KEY_PATH="./AuthKey_ABC123XYZ.p8"
    ./marketing/scripts/upload-metadata.sh --ios

METADATA FIELDS:

  iOS App Store Connect:
    • name - App name (30 chars max)
    • subtitle - App subtitle (30 chars max)
    • description - Full description (4000 chars max)
    • keywords - Comma-separated keywords (100 chars max)
    • promotionalText - Promotional text (170 chars max)
    • whatsNew - Release notes

  Google Play Store:
    • title - App title (30 chars max)
    • shortDescription - Short description (80 chars max)
    • fullDescription - Full description (4000 chars max)
    • recentChanges - Release notes (what's new)

EOF
}

main() {
    local upload_ios=false
    local upload_android=false
    local filter_locale=""
    local dry_run=false
    local verbose=false
    
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
        echo "  ./marketing/scripts/upload-metadata.sh --ios" >&2
        echo "  ./marketing/scripts/upload-metadata.sh --android" >&2
        echo "  ./marketing/scripts/upload-metadata.sh --all" >&2
        echo "" >&2
        echo "Use --help for more options" >&2
        exit 1
    fi
    
    # Check dependencies
    check_dependencies
    
    # Verify metadata file exists
    if [ ! -f "$METADATA_FILE" ]; then
        error "Metadata file not found: $METADATA_FILE"
        echo "" >&2
        echo "Create the metadata config file with your app store content first." >&2
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
    header "Marketing Metadata Upload"
    echo ""
    info "Config:       $METADATA_FILE"
    info "Locales:      ${locales[*]}"
    info "Platforms:    $([ "$upload_ios" = true ] && echo "iOS ")$([ "$upload_android" = true ] && echo "Android")"
    $dry_run && warn "Mode:         DRY RUN (no actual upload)"
    
    local failed=0
    
    # Upload to iOS
    if $upload_ios; then
        if ! upload_ios_metadata "${locales[@]}"; then
            ((failed++))
        fi
    fi
    
    # Upload to Android
    if $upload_android; then
        if ! upload_android_metadata "${locales[@]}"; then
            ((failed++))
        fi
    fi
    
    # Summary
    echo ""
    header "Complete"
    echo ""
    
    if [ $failed -eq 0 ]; then
        success "All metadata uploads completed successfully"
    else
        error "$failed platform(s) failed"
        exit 1
    fi
}

main "$@"

