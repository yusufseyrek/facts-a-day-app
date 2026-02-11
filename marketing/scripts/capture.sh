#!/bin/bash

# Screenshot Automation for App Store & Play Store
# Captures marketing screenshots using Maestro
#
# Usage:
#   ./marketing/scripts/capture.sh --ios                    # Select iOS device interactively
#   ./marketing/scripts/capture.sh --android                # Select Android device interactively
#   ./marketing/scripts/capture.sh --ios --all-locales      # iOS device, all locales
#   ./marketing/scripts/capture.sh --android --locale de    # Android device, German only
#   ./marketing/scripts/capture.sh --ios --flow 6           # Capture only trivia game screen
#   ./marketing/scripts/capture.sh --ios --flow 1 --all-locales  # Home screen in all locales
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

# Flow configuration (index 0 unused, 1-10 are valid flows)
FLOW_FILES=(
    ""                      # 0: unused
    "home.yaml"             # 1
    "fact-detail.yaml"      # 2
    "story.yaml"            # 3
    "discover.yaml"         # 4
    "category-browse.yaml"  # 5
    "trivia.yaml"           # 6
    "trivia-game.yaml"      # 7
    "trivia-performance.yaml" # 8
    "trivia-results.yaml"   # 9
    "favorites.yaml"        # 10
)

FLOW_NAMES=(
    ""                      # 0: unused
    "Home Screen"           # 1
    "Fact Detail"           # 2
    "Story Screen"          # 3
    "Discover Screen"       # 4
    "Category Browse"       # 5
    "Trivia Hub"            # 6
    "Trivia Game"           # 7
    "Trivia Performance"    # 8
    "Trivia Results"        # 9
    "Favorites Screen"      # 10
)

# Flow prerequisites (which flows need to run first to set up state)
# Format: space-separated list of prerequisite flow numbers
FLOW_PREREQS=(
    ""      # 0: unused
    ""      # 1: Home - just needs app launched
    ""      # 2: Fact Detail - starts from home
    ""      # 3: Story - starts from home
    ""      # 4: Discover - navigates to tab itself
    "4"     # 5: Category Browse - needs discover screen first
    ""      # 6: Trivia Hub - navigates to tab itself
    "6"     # 7: Trivia Game - needs trivia hub first
    "6"     # 8: Trivia Performance - needs trivia hub first
    "6 8"   # 9: Trivia Results - needs trivia hub, then performance
    ""      # 10: Favorites - navigates to tab itself
)

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
    local flow_num="$4"  # Optional: specific flow number
    
    # Create and get absolute path
    mkdir -p "$output_dir"
    local abs_output_dir
    abs_output_dir="$(cd "$output_dir" && pwd)"
    
    cd "$PROJECT_DIR"
    
    # Determine which flow file to run
    local flow_file=".maestro/screenshots.yaml"
    
    if [ -n "$flow_num" ]; then
        # Running a single flow - generate temp file with prerequisites
        local prereqs="${FLOW_PREREQS[$flow_num]}"
        local temp_flow="$MAESTRO_DIR/.temp-single-flow.yaml"
        
        info "Running single flow: ${FLOW_NAMES[$flow_num]}"
        if [ -n "$prereqs" ]; then
            info "  Prerequisites: $prereqs"
        fi
        
        # Generate temporary Maestro file
        cat > "$temp_flow" << EOF
# Auto-generated single flow runner
appId: $APP_ID

---
# Launch the app with locale override
- launchApp:
    clearState: false
    clearKeychain: false
    arguments:
      AppleLanguages: "(\${LOCALE})"
      AppleLocale: "\${FULL_LOCALE}"

# Wait for app to fully load
- extendedWaitUntil:
    visible:
      id: "tab-home"
    timeout: 15000

# Wait for initial content
- extendedWaitUntil:
    visible:
      id: "fact-card-.*"
    timeout: 15000

- waitForAnimationToEnd:
    timeout: 3000

EOF
        
        # Add prerequisite flows (they set up state but we skip their screenshots)
        for prereq in $prereqs; do
            local prereq_file="${FLOW_FILES[$prereq]}"
            info "  Adding prereq: ${FLOW_NAMES[$prereq]}"
            
            # Run the prereq flow but redirect its screenshot to /dev/null
            cat >> "$temp_flow" << EOF
# Prerequisite: ${FLOW_NAMES[$prereq]} (setup only, no screenshot)
- runFlow:
    file: flows/$prereq_file
    env:
      OUTPUT_DIR: /tmp/maestro-prereq-ignored

EOF
        done
        
        # Add the target flow
        cat >> "$temp_flow" << EOF
# Target flow: ${FLOW_NAMES[$flow_num]}
- runFlow:
    file: flows/${FLOW_FILES[$flow_num]}
    env:
      OUTPUT_DIR: \${OUTPUT_DIR}
EOF
        
        flow_file="$temp_flow"
    else
        info "Running full screenshot flow..."
    fi
    
    info "  Device: $device_id"
    info "  Locale: $locale"
    info "  Output: $abs_output_dir"
    
    # Run Maestro from project directory
    local full_locale
    full_locale=$(get_full_locale "$locale")
    local result=0
    maestro --device "$device_id" test "$flow_file" \
        -e "OUTPUT_DIR=$abs_output_dir" \
        -e "LOCALE=$locale" \
        -e "FULL_LOCALE=$full_locale" \
        --no-ansi || result=$?
    
    # Clean up temp file
    [ -f "$MAESTRO_DIR/.temp-single-flow.yaml" ] && rm -f "$MAESTRO_DIR/.temp-single-flow.yaml"
    
    return $result
}

capture_locale() {
    local device_id="$1"
    local platform="$2"
    local device_type="$3"
    local locale="$4"
    local flow_num="$5"  # Optional: specific flow number
    
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
    if run_maestro "$device_id" "$output_dir" "$locale" "$flow_num"; then
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
    --flow <number>     Capture only a specific screen (1-10, see list below)
    --help              Show this help

FLOWS:
    1  Home Screen         - Facts feed
    2  Fact Detail         - Modal detail view
    3  Story Screen        - Full-screen story view
    4  Discover Screen     - Category discovery
    5  Category Browse     - Category facts list (auto-runs: 4)
    6  Trivia Hub          - Trivia main screen
    7  Trivia Game         - Active trivia question (auto-runs: 6)
    8  Trivia Performance  - Stats overview (auto-runs: 6)
    9  Trivia Results      - Session results (auto-runs: 6, 8)
    10 Favorites Screen    - Saved facts

    Note: Prerequisites are automatically run to reach the correct app state.

EXAMPLES:
    # iOS phone, English only (all screens)
    ./marketing/scripts/capture.sh --ios

    # iOS, all languages
    ./marketing/scripts/capture.sh --ios --all-locales

    # Android, German only
    ./marketing/scripts/capture.sh --android --locale de

    # Just capture the trivia game screen (flow 6)
    ./marketing/scripts/capture.sh --ios --flow 6

    # Capture home screen in all locales
    ./marketing/scripts/capture.sh --ios --flow 1 --all-locales

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
    local flow_num=""
    
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
            --flow)
                flow_num="$2"
                if [[ ! "$flow_num" =~ ^([1-9]|10)$ ]]; then
                    error "Invalid flow number: $flow_num (must be 1-10)"
                    echo "" >&2
                    echo "Available flows:" >&2
                    for i in {1..10}; do
                        echo "  $i: ${FLOW_NAMES[$i]}" >&2
                    done
                    exit 1
                fi
                shift 2
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
    if [ -n "$flow_num" ]; then
        info "Flow:        $flow_num (${FLOW_NAMES[$flow_num]})"
    else
        info "Flow:        All screens (1-10)"
    fi
    info "Output:      screenshots/$platform/$device_type/"
    
    # Capture screenshots
    local failed=0
    local total=${#locales[@]}
    local current=0
    
    for loc in "${locales[@]}"; do
        ((current++))
        echo ""
        echo -e "${CYAN}━━━ [$current/$total] $loc ━━━${NC}"
        capture_locale "$device_id" "$platform" "$device_type" "$loc" "$flow_num" || ((failed++))
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

