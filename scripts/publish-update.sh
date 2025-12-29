#!/bin/bash

# OTA Update Publishing Script for Facts a Day
# This script builds and uploads OTA updates to the self-hosted backend
#
# Usage:
#   ./scripts/publish-update.sh ios      # Publish iOS update
#   ./scripts/publish-update.sh android  # Publish Android update
#   ./scripts/publish-update.sh all      # Publish both platforms

set -e

# Load environment variables from .env.local if it exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.local"

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
DIST_DIR="$PROJECT_ROOT/dist"

# Function to print step
print_step() {
    echo -e "\n${GREEN}▶ $1${NC}"
}

# Function to print error (to stderr)
print_error() {
    echo -e "${RED}✗ Error: $1${NC}" >&2
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠ Warning: $1${NC}"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print info
print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Check for required tools
check_requirements() {
    print_step "Checking requirements..."
    
    if ! command -v npx &> /dev/null; then
        print_error "npx not found. Please install Node.js."
        exit 1
    fi
    
    if ! command -v curl &> /dev/null; then
        print_error "curl not found. Please install curl."
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        print_error "jq not found. Please install jq (brew install jq)."
        exit 1
    fi
}

# Check for API key
check_api_key() {
    if [ -z "$OTA_API_KEY" ]; then
        print_error "OTA_API_KEY environment variable is required"
        echo "Set it in your .env.local file:"
        echo "  OTA_API_KEY=fad_your_api_key"
        exit 1
    fi
}

# Get runtime version from app.json
get_runtime_version() {
    local version=$(cat "$PROJECT_ROOT/app.json" | jq -r '.expo.version')
    echo "$version"
}

# Get API base URL from app.json
get_api_base_url() {
    local url=$(cat "$PROJECT_ROOT/app.json" | jq -r '.expo.extra.API_BASE_URL')
    echo "$url"
}

# Get expoClient config from app.json (for manifest)
get_expo_client_config() {
    local platform="$1"
    # Extract the expo config and add extra fields required by expo-updates
    cat "$PROJECT_ROOT/app.json" | jq --arg platform "$platform" '.expo | {
        name: .name,
        slug: .slug,
        version: .version,
        orientation: .orientation,
        icon: .icon,
        userInterfaceStyle: .userInterfaceStyle,
        backgroundColor: .backgroundColor,
        scheme: .scheme,
        ios: .ios,
        android: .android,
        extra: .extra,
        runtimeVersion: .version,
        platforms: ["ios", "android"]
    }'
}

# Get git commit hash
get_git_commit() {
    if command -v git &> /dev/null && [ -d "$PROJECT_ROOT/.git" ]; then
        git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown"
    else
        echo "unknown"
    fi
}

# Export the update bundle
export_bundle() {
    local platform="$1"
    
    print_step "Exporting $platform bundle..."
    
    # Clean previous dist
    rm -rf "$DIST_DIR"
    
    # Run expo export (outputs Hermes bytecode .hbc for better performance)
    cd "$PROJECT_ROOT"
    npx expo export --platform "$platform" --output-dir "$DIST_DIR"
    
    if [ ! -d "$DIST_DIR" ]; then
        print_error "Export failed. dist directory not found."
        exit 1
    fi
    
    print_success "Bundle exported to $DIST_DIR"
}

# Find the bundle file
find_bundle() {
    local platform="$1"
    local bundle_dir="$DIST_DIR/_expo/static/js/$platform"
    
    # Find the main bundle file (entry-*.hbc for Hermes or entry-*.js)
    local bundle_file=$(find "$bundle_dir" -type f \( -name "*.hbc" -o -name "*.js" \) 2>/dev/null | head -n 1)
    
    if [ -z "$bundle_file" ]; then
        # Try alternative location
        bundle_dir="$DIST_DIR/bundles"
        bundle_file=$(find "$bundle_dir" -type f \( -name "*.$platform.hbc" -o -name "*.$platform.js" \) 2>/dev/null | head -n 1)
    fi
    
    echo "$bundle_file"
}

# Upload the update
upload_update() {
    local platform="$1"
    local message="$2"
    local runtime_version="$3"
    local git_commit="$4"
    local bundle_file="$5"
    local upload_endpoint="$6"
    local expo_client_config="$7"
    
    print_step "Uploading $platform update..."
    
    # Build metadata JSON with expoClient config
    local metadata=$(jq -n \
        --arg rv "$runtime_version" \
        --arg p "$platform" \
        --arg gc "$git_commit" \
        --arg msg "$message" \
        --argjson expoClient "$expo_client_config" \
        '{
            runtimeVersion: $rv,
            platform: $p,
            gitCommitHash: $gc,
            message: $msg,
            metadata: {},
            extra: {
                expoClient: $expoClient
            }
        }')
    
    # Determine content-type based on file extension
    local bundle_filename=$(basename "$bundle_file")
    local bundle_ext="${bundle_filename##*.}"
    local content_type="application/javascript"
    if [ "$bundle_ext" = "hbc" ]; then
        content_type="application/octet-stream"
    fi
    
    print_info "Runtime Version: $runtime_version"
    print_info "Platform: $platform"
    print_info "Git Commit: $git_commit"
    print_info "Bundle: $bundle_filename ($content_type)"
    print_info "ExpoClient: $(echo "$expo_client_config" | jq -r '.slug') v$(echo "$expo_client_config" | jq -r '.version')"
    
    # Find and add asset files
    local assets_dir="$DIST_DIR/assets"
    if [ -d "$assets_dir" ]; then
        local asset_count=0
        while IFS= read -r -d '' asset_file; do
            ((asset_count++)) || true
        done < <(find "$assets_dir" -type f -print0 2>/dev/null)
        print_info "Found $asset_count assets to upload"
    fi
    
    # Debug: show what we're sending
    print_info "Uploading from: $bundle_file"
    
    # Execute the upload with explicit content-type
    # curl uses the basename of the file path as the filename automatically
    local response=$(curl -s -w "\n%{http_code}" -X POST "$upload_endpoint" \
        -H "Authorization: Bearer $OTA_API_KEY" \
        -F "metadata=$metadata" \
        -F "bundle=@$bundle_file;type=$content_type")
    
    local http_code=$(echo "$response" | tail -n 1)
    local body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ]; then
        print_success "Update uploaded successfully!"
        echo "$body" | jq .
    else
        print_error "Upload failed with HTTP $http_code"
        echo "$body"
        exit 1
    fi
}

# Publish update for a single platform
publish_platform() {
    local platform="$1"
    local message="$2"
    
    print_info "Publishing $platform update..."
    
    local runtime_version=$(get_runtime_version)
    local git_commit=$(get_git_commit)
    local api_base_url=$(get_api_base_url)
    local upload_endpoint="$api_base_url/api/updates"
    
    print_info "API URL: $upload_endpoint"
    
    # Export the bundle
    export_bundle "$platform"
    
    # Find the bundle file
    local bundle_file=$(find_bundle "$platform")
    
    if [ -z "$bundle_file" ]; then
        print_error "Bundle file not found for $platform"
        print_info "Expected location: $DIST_DIR/_expo/static/js/$platform/"
        exit 1
    fi
    
    # Get expoClient config for the manifest
    local expo_client_config=$(get_expo_client_config "$platform")
    
    # Upload the update
    upload_update "$platform" "$message" "$runtime_version" "$git_commit" "$bundle_file" "$upload_endpoint" "$expo_client_config"
}

# Main script
main() {
    local platform="${1:-all}"
    local message="${2:-OTA Update}"
    
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}   Facts a Day - OTA Update Publisher${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    # Validate platform argument
    case "$platform" in
        ios|android|all)
            ;;
        *)
            print_error "Invalid platform: $platform"
            echo "Usage: $0 [ios|android|all] [message]"
            exit 1
            ;;
    esac
    
    check_requirements
    check_api_key
    
    cd "$PROJECT_ROOT"
    
    if [ "$platform" = "all" ]; then
        publish_platform "ios" "$message"
        publish_platform "android" "$message"
    else
        publish_platform "$platform" "$message"
    fi
    
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${GREEN}✓ OTA Update Published Successfully!${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Run main with all arguments
main "$@"

