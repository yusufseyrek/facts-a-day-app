#!/bin/bash

# Screenshot Automation for App Store & Play Store
# Captures marketing screenshots using Maestro
#
# Usage:
#   ./marketing/scripts/capture.sh --ios                    # Select iOS device interactively
#   ./marketing/scripts/capture.sh --android                # Select Android device interactively
#   ./marketing/scripts/capture.sh --ios --all-locales      # iOS device, all locales
#   ./marketing/scripts/capture.sh --android --locale de    # Android device, German only
#
# Output Structure:
#   screenshots/
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

APP_ID="dev.seyrek.factsaday"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKETING_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$MARKETING_DIR")"
MAESTRO_DIR="$PROJECT_DIR/.maestro"
SCREENSHOTS_DIR="$PROJECT_DIR/screenshots"

ALL_LOCALES=("en" "de" "es" "fr" "ja" "ko" "tr" "zh")

# Colors
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

# ─────────────────────────────────────────────────────────────────────────────
# iOS Device Functions
# ─────────────────────────────────────────────────────────────────────────────

# Get all booted iOS simulators - stores in global array IOS_DEVICES
load_ios_devices() {
    IOS_DEVICES=()
    while IFS= read -r line; do
        if [[ "$line" =~ (iPhone|iPad) ]]; then
            local name=$(echo "$line" | sed 's/^[[:space:]]*//' | sed 's/ ([A-F0-9-]*).*$//')
            local udid=$(echo "$line" | grep -o '[A-F0-9-]\{36\}')
            local type="phone"
            [[ "$line" =~ iPad ]] && type="tablet"
            [ -n "$udid" ] && IOS_DEVICES+=("$udid|$name|$type")
        fi
    done < <(xcrun simctl list devices booted 2>/dev/null)
}

# Interactive iOS device selection - returns via global SELECTED_DEVICE
select_ios_device() {
    load_ios_devices
    
    if [ ${#IOS_DEVICES[@]} -eq 0 ]; then
        error "No booted iOS simulators found!"
        echo "" >&2
        echo "Start a simulator first:" >&2
        echo "  open -a Simulator" >&2
        echo "" >&2
        echo "Or boot a specific device:" >&2
        xcrun simctl list devices available | grep -E "iPhone|iPad" | head -5 | sed 's/^/  /' >&2
        exit 1
    fi
    
    echo "" >&2
    echo -e "${CYAN}Select iOS Simulator:${NC}" >&2
    echo "" >&2
    
    local i=1
    for device in "${IOS_DEVICES[@]}"; do
        local name=$(echo "$device" | cut -d'|' -f2)
        local type=$(echo "$device" | cut -d'|' -f3)
        echo -e "  ${BOLD}$i)${NC} $name ${DIM}($type)${NC}" >&2
        ((i++))
    done
    
    echo "" >&2
    
    # Auto-select if only one device
    if [ ${#IOS_DEVICES[@]} -eq 1 ]; then
        echo -e "Auto-selecting only available device..." >&2
        SELECTED_DEVICE="${IOS_DEVICES[0]}"
        return
    fi
    
    read -p "Choose (1-${#IOS_DEVICES[@]}): " choice
    
    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#IOS_DEVICES[@]} ]; then
        SELECTED_DEVICE="${IOS_DEVICES[$((choice-1))]}"
    else
        error "Invalid selection"
        exit 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Android Device Functions
# ─────────────────────────────────────────────────────────────────────────────

# Get all connected Android devices - stores in global array ANDROID_DEVICES
load_android_devices() {
    ANDROID_DEVICES=()
    
    # Get device IDs first (adb shell commands consume stdin, so we do it separately)
    local device_ids=()
    while IFS= read -r line; do
        if [[ "$line" =~ device$ ]]; then
            device_ids+=("$(echo "$line" | cut -f1)")
        fi
    done < <(adb devices 2>/dev/null)
    
    # Now get details for each device
    for id in "${device_ids[@]}"; do
        local name=$(adb -s "$id" shell getprop ro.product.model 2>/dev/null </dev/null | tr -d '\r')
        [ -z "$name" ] && name="$id"
        
        # Check if tablet
        local type="phone"
        local screen_width=$(adb -s "$id" shell wm size 2>/dev/null </dev/null | grep -o '[0-9]*x[0-9]*' | cut -d'x' -f1)
        local density=$(adb -s "$id" shell wm density 2>/dev/null </dev/null | grep -o '[0-9]*$')
        if [ -n "$screen_width" ] && [ -n "$density" ]; then
            local dp_width=$((screen_width * 160 / density))
            [ "$dp_width" -ge 600 ] && type="tablet"
        fi
        
        ANDROID_DEVICES+=("$id|$name|$type")
    done
}

# Interactive Android device selection - returns via global SELECTED_DEVICE
select_android_device() {
    load_android_devices
    
    if [ ${#ANDROID_DEVICES[@]} -eq 0 ]; then
        error "No Android devices found!"
        echo "" >&2
        echo "Start an emulator first, or connect a device." >&2
        exit 1
    fi
    
    echo "" >&2
    echo -e "${CYAN}Select Android Device:${NC}" >&2
    echo "" >&2
    
    local i=1
    for device in "${ANDROID_DEVICES[@]}"; do
        local name=$(echo "$device" | cut -d'|' -f2)
        local type=$(echo "$device" | cut -d'|' -f3)
        echo -e "  ${BOLD}$i)${NC} $name ${DIM}($type)${NC}" >&2
        ((i++))
    done
    
    echo "" >&2
    
    # Auto-select if only one device
    if [ ${#ANDROID_DEVICES[@]} -eq 1 ]; then
        echo -e "Auto-selecting only available device..." >&2
        SELECTED_DEVICE="${ANDROID_DEVICES[0]}"
        return
    fi
    
    read -p "Choose (1-${#ANDROID_DEVICES[@]}): " choice
    
    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#ANDROID_DEVICES[@]} ]; then
        SELECTED_DEVICE="${ANDROID_DEVICES[$((choice-1))]}"
    else
        error "Invalid selection"
        exit 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Locale Management
# ─────────────────────────────────────────────────────────────────────────────

get_full_locale() {
    case "$1" in
        en) echo "en_US" ;;
        de) echo "de_DE" ;;
        es) echo "es_ES" ;;
        fr) echo "fr_FR" ;;
        ja) echo "ja_JP" ;;
        ko) echo "ko_KR" ;;
        tr) echo "tr_TR" ;;
        zh) echo "zh_CN" ;;
        *)  echo "${1}_${1^^}" ;;
    esac
}

set_ios_locale() {
    local device_id="$1"
    local locale="$2"
    local full_locale=$(get_full_locale "$locale")
    
    xcrun simctl spawn "$device_id" defaults write "Apple Global Domain" AppleLocale -string "$full_locale"
    xcrun simctl spawn "$device_id" defaults write "Apple Global Domain" AppleLanguages -array "$locale"
}

set_android_locale() {
    local device_id="$1"
    local locale="$2"
    
    info "Setting Android locale to: $locale"
    
    # Use Android 13+ per-app locale API (app has localeConfig in manifest)
    # This requires the app to be installed and have locales_config.xml
    if ! adb -s "$device_id" shell cmd locale set-app-locales "$APP_ID" --locales "$locale" </dev/null 2>/dev/null; then
        warn "Per-app locale failed, trying system locale change..."
        
        # Fallback: Try to change system locale (requires root on emulator)
        local full_locale=$(get_full_locale "$locale")
        local locale_prop="${full_locale/_/-}"  # Convert de_DE to de-DE
        
        # Try setting system property (works on rooted emulators)
        adb -s "$device_id" shell "su 0 setprop persist.sys.locale $locale_prop" </dev/null 2>/dev/null || \
        adb -s "$device_id" shell "setprop persist.sys.locale $locale_prop" </dev/null 2>/dev/null || true
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# App Control
# ─────────────────────────────────────────────────────────────────────────────

restart_app() {
    local device_id="$1"
    local platform="$2"
    
    if [ "$platform" = "ios" ]; then
        xcrun simctl terminate "$device_id" "$APP_ID" 2>/dev/null || true
        sleep 1
    else
        # Force stop Android app to ensure locale change is applied on next launch
        adb -s "$device_id" shell am force-stop "$APP_ID" </dev/null 2>/dev/null || true
        sleep 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Screenshot Capture
# ─────────────────────────────────────────────────────────────────────────────

run_maestro() {
    local device_id="$1"
    local output_dir="$2"
    local locale="$3"
    
    # Create and get absolute path
    mkdir -p "$output_dir"
    local abs_output_dir
    abs_output_dir="$(cd "$output_dir" && pwd)"
    
    info "Running Maestro..."
    info "  Device: $device_id"
    info "  Locale: $locale"
    info "  Output: $abs_output_dir"
    
    # Run Maestro from project directory
    cd "$PROJECT_DIR"
    maestro --device "$device_id" test ".maestro/screenshots.yaml" \
        -e "OUTPUT_DIR=$abs_output_dir" \
        -e "LOCALE=$locale" \
        --no-ansi
}

capture_locale() {
    local device_id="$1"
    local platform="$2"
    local device_type="$3"
    local locale="$4"
    
    # Build absolute output path
    local output_dir="$SCREENSHOTS_DIR/$platform/$device_type/$locale"
    
    echo ""
    info "Locale: $locale"
    info "Target: $platform/$device_type/$locale/"
    
    # Set locale based on platform
    if [ "$platform" = "ios" ]; then
        set_ios_locale "$device_id" "$locale"
    else
        set_android_locale "$device_id" "$locale"
    fi
    
    # Restart app to apply locale change
    restart_app "$device_id" "$platform"
    
    # Run Maestro
    if run_maestro "$device_id" "$output_dir" "$locale"; then
        local count=$(find "$output_dir" -name "*.png" -type f 2>/dev/null | wc -l | tr -d ' ')
        success "$locale complete → $count screenshots"
        return 0
    else
        error "$locale failed"
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

show_help() {
    cat << 'EOF'
Screenshots - Marketing screenshot automation for Facts a Day

USAGE:
    ./marketing/scripts/capture.sh --ios [OPTIONS]
    ./marketing/scripts/capture.sh --android [OPTIONS]

PLATFORM (required):
    --ios               Use iOS Simulator (interactive device selection)
    --android           Use Android Emulator/Device (interactive device selection)

OPTIONS:
    --locale <code>     Capture specific locale (en, de, es, fr, ja, ko, tr, zh)
    --all-locales       Capture all 8 supported locales
    --help              Show this help

EXAMPLES:
    # iOS phone, English only
    ./marketing/scripts/capture.sh --ios

    # iOS, all languages
    ./marketing/scripts/capture.sh --ios --all-locales

    # Android, German only
    ./marketing/scripts/capture.sh --android --locale de

    # Android, all languages
    ./marketing/scripts/capture.sh --android --all-locales

PARALLEL EXECUTION:
    Run 4 terminals simultaneously with different devices booted:
    
    Terminal 1: Boot iPhone  → ./marketing/scripts/capture.sh --ios --all-locales
    Terminal 2: Boot iPad    → ./marketing/scripts/capture.sh --ios --all-locales
    Terminal 3: Start phone emulator  → ./marketing/scripts/capture.sh --android --all-locales
    Terminal 4: Start tablet emulator → ./marketing/scripts/capture.sh --android --all-locales

OUTPUT:
    screenshots/
    ├── ios/
    │   ├── phone/en/
    │   ├── phone/de/
    │   ├── tablet/en/
    │   └── ...
    └── android/
        ├── phone/en/
        └── tablet/en/
EOF
}

main() {
    local platform=""
    local locale=""
    local all_locales=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --ios)
                platform="ios"
                shift
                ;;
            --android)
                platform="android"
                shift
                ;;
            --locale)
                locale="$2"
                shift 2
                ;;
            --all-locales)
                all_locales=true
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
    
    # Require platform
    if [ -z "$platform" ]; then
        error "Platform required: --ios or --android"
        echo "" >&2
        echo "Usage:" >&2
        echo "  ./marketing/scripts/capture.sh --ios" >&2
        echo "  ./marketing/scripts/capture.sh --android" >&2
        echo "" >&2
        echo "Use --help for more options" >&2
        exit 1
    fi
    
    # Check Maestro
    if ! command -v maestro &>/dev/null; then
        error "Maestro is not installed"
        echo "Install: curl -Ls \"https://get.maestro.mobile.dev\" | bash" >&2
        exit 1
    fi
    
    # Select device interactively (stores result in SELECTED_DEVICE)
    if [ "$platform" = "ios" ]; then
        select_ios_device
    else
        select_android_device
    fi
    
    # Parse device info from SELECTED_DEVICE
    local device_id=$(echo "$SELECTED_DEVICE" | cut -d'|' -f1)
    local device_name=$(echo "$SELECTED_DEVICE" | cut -d'|' -f2)
    local device_type=$(echo "$SELECTED_DEVICE" | cut -d'|' -f3)
    
    # Determine locales to capture
    local locales=()
    if [ "$all_locales" = true ]; then
        locales=("${ALL_LOCALES[@]}")
    elif [ -n "$locale" ]; then
        locales=("$locale")
    else
        locales=("en")
    fi
    
    # Print header
    header "Screenshots: $device_name"
    echo ""
    info "Platform:    $platform"
    info "Device:      $device_name ($device_type)"
    info "Device ID:   $device_id"
    info "Locales:     ${locales[*]}"
    info "Output:      screenshots/$platform/$device_type/"
    
    # Capture screenshots
    local failed=0
    local total=${#locales[@]}
    local current=0
    
    for loc in "${locales[@]}"; do
        ((current++))
        echo ""
        echo -e "${CYAN}━━━ [$current/$total] $loc ━━━${NC}"
        capture_locale "$device_id" "$platform" "$device_type" "$loc" || ((failed++))
    done
    
    # Summary
    echo ""
    header "Complete"
    
    local captured=$((total - failed))
    success "$captured/$total locales captured"
    
    if [ $failed -gt 0 ]; then
        warn "$failed locale(s) failed"
    fi
    
    echo ""
    local output_path="$SCREENSHOTS_DIR/$platform/$device_type"
    info "Screenshots: $output_path/"
    
    if [ -d "$output_path" ]; then
        local count=$(find "$output_path" -name "*.png" -type f 2>/dev/null | wc -l | tr -d ' ')
        info "Total files: $count"
        echo ""
        echo "Preview:"
        find "$output_path" -name "*.png" -type f | head -5 | sed 's/^/  /'
        [ "$count" -gt 5 ] && echo "  ... and $((count - 5)) more"
    fi
}

main "$@"

