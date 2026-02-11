#!/bin/bash

# Marketing Screenshot Framer
# Composites raw screenshots into device frames with titles and gradient backgrounds
#
# Prerequisites:
#   brew install imagemagick jq
#
# Usage:
#   ./marketing/scripts/frame.sh                           # Process all screenshots
#   ./marketing/scripts/frame.sh --locale en               # Process specific locale
#   ./marketing/scripts/frame.sh --platform ios            # Process specific platform
#   ./marketing/scripts/frame.sh --platform ios --device phone
#   ./marketing/scripts/frame.sh --screenshot 01_home      # Process specific screenshot
#   ./marketing/scripts/frame.sh --gradient ocean          # Use different gradient

set -e

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKETING_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$MARKETING_DIR")"

CONFIG_FILE="$MARKETING_DIR/config/titles.json"
FRAMES_DIR="$MARKETING_DIR/frames"
OUTPUT_DIR="$MARKETING_DIR/output"
SCREENSHOTS_DIR="$PROJECT_DIR/screenshots"

ALL_LOCALES=("en" "de" "es" "fr" "ja" "ko" "tr" "zh")
ALL_PLATFORMS=("ios" "android")
ALL_DEVICES=("phone" "tablet")
ALL_SCREENSHOTS=("01_home" "02_fact_detail" "03_story" "04_discover" "05_category_browse" "06_trivia" "07_trivia_game" "08_trivia_performance" "09_trivia_results" "10_favorites")

# Parallel execution settings
MAX_JOBS="${MAX_JOBS:-$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)}"

# Output format settings
DEFAULT_OUTPUT_FORMAT="jpg"
DEFAULT_JPEG_QUALITY="100"

# Screen areas within device frames (x, y, width, height)
# Measured from actual frame images by finding transparent regions
# Use: magick frame.png -alpha extract -negate -threshold 50% -format "%@" info:
# IMPORTANT: Screen area dimensions should match screenshot aspect ratio for proper fit
get_screen_area() {
    local frame="$1"
    case "$frame" in
        # iPhone: 1520x3068 frame
        # Actual transparent area: 1430x2958 at +45+55
        # Screenshot: 1320x2868 (aspect 0.460)
        # Using dimensions that match screenshot aspect ratio
        iphone)       echo "100,100,1320,2870" ;;
        
        # iPad: 2448x3132 frame
        # Actual transparent area: 2249x2936 at +99+96
        # Screenshot: 2064x2752 (aspect 0.750)
        # Using dimensions that match screenshot aspect ratio
        ipad)         echo "192,190,2064,2752" ;;
        
        # Pixel phone: 3368x6544 frame
        # Actual transparent area: 3152x6383 at +216+161
        # Screenshot: 1440x3120 (aspect 0.4615)
        # Calculated: height=6064 (95% of 6383), width=6064*0.4615=2799
        # Centered with padding: x=216+(3152-2799)/2=393, y=161+(6383-6064)/2=321
        pixel-phone)  echo "300,280,2763,5988" ;;
        
        # Pixel tablet: 2448x3133 frame (portrait)
        # Actual transparent area: 1967x2981 at +240+76
        # Screenshot: 1600x2560 (aspect 0.625)
        # Calculated: height=2772 (93% of 2981), width=2772*0.625=1733
        # Centered with 7% padding: x=240+(1967-1733)/2=357, y=76+(2981-2772)/2=181
        pixel-tablet) echo "357,193,1733,2772" ;;
        
        *)            echo "" ;;
    esac
}

# Corner radius for screen area in each device frame
# Device frames have curved screen edges that require rounded corners on screenshots
get_corner_radius() {
    local frame="$1"
    case "$frame" in
        # iPhone has prominent rounded corners (~4.2% of screen width)
        iphone)       echo "85" ;;
        
        # iPad has subtle rounded corners (~1.7% of screen width)  
        ipad)         echo "35" ;;
        
        # Pixel phone has rounded corners (~3% of screen width)
        pixel-phone)  echo "125" ;;
        
        # Pixel tablet has minimal rounded corners (disabled for cleaner look)
        pixel-tablet) echo "0" ;;
        
        *)            echo "0" ;;
    esac
}

# Font sizes for title text (font_size,line_height)
# Tablets have larger canvas so they need larger fonts
get_font_config() {
    local key="$1"
    case "$key" in
        ios_phone)     echo "120,140" ;;
        ios_tablet)    echo "150,170" ;;
        android_phone) echo "120,140" ;;
        android_tablet) echo "200,220" ;;
        *)             echo "120,140" ;;
    esac
}

# Device scale factors (how much to scale device on final canvas)
# Calculated to fit framed device within output size with room for title
# Target: device height should be ~75-80% of output height
get_device_scale() {
    local key="$1"
    case "$key" in
        # iPhone: 1520x3068 frame, 1284x2778 output
        # Target height ~2100, scale = 2100/3068 ≈ 0.68
        ios_phone)     echo "0.72" ;;
        
        # iPad: 2448x3132 frame, 2064x2752 output
        # Target height ~2100, scale = 2100/3132 ≈ 0.67
        ios_tablet)    echo "0.72" ;;
        
        # Pixel phone: 3368x6544 frame, 1440x2560 output
        # Target height ~1900, scale = 1900/6544 ≈ 0.29
        android_phone) echo "0.30" ;;
        
        # Pixel tablet: 2448x3133 frame, 2160x3840 output
        # Target height ~2900, scale = 2900/3133 ≈ 0.93
        android_tablet) echo "0.85" ;;
        
        *)             echo "0.72" ;;
    esac
}

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

check_dependencies() {
    local missing=()
    
    if ! command -v magick &>/dev/null && ! command -v convert &>/dev/null; then
        missing+=("imagemagick")
    fi
    
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

# Get ImageMagick command (magick for v7+, convert for v6)
get_magick_cmd() {
    if command -v magick &>/dev/null; then
        echo "magick"
    else
        echo "convert"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# JSON Config Helpers
# ─────────────────────────────────────────────────────────────────────────────

get_title() {
    local screenshot="$1"
    local locale="$2"
    # Get title and convert literal \n to actual newlines
    jq -r ".screenshots[\"$screenshot\"][\"$locale\"] // \"\"" "$CONFIG_FILE"
}

get_gradient() {
    local name="$1"
    # Returns colors as space-separated list
    jq -r ".gradients[\"$name\"] | join(\" \")" "$CONFIG_FILE"
}

get_screenshot_gradient() {
    local screenshot="$1"
    local fallback="${2:-default}"
    # Get screenshot-specific gradient, fallback to provided default
    local gradient
    gradient=$(jq -r ".screenshot_gradients[\"$screenshot\"] // \"\"" "$CONFIG_FILE")
    if [ -n "$gradient" ] && [ "$gradient" != "null" ]; then
        echo "$gradient"
    else
        echo "$fallback"
    fi
}

get_output_size() {
    local key="$1"
    jq -r ".output_sizes[\"$key\"]" "$CONFIG_FILE"
}

get_frame_file() {
    local key="$1"
    jq -r ".frames[\"$key\"]" "$CONFIG_FILE"
}

# ─────────────────────────────────────────────────────────────────────────────
# Image Processing
# ─────────────────────────────────────────────────────────────────────────────

create_gradient() {
    local output="$1"
    local width="$2"
    local height="$3"
    local gradient_name="${4:-default}"
    
    local colors
    colors=$(get_gradient "$gradient_name")
    
    # Parse colors (supports 2 or 3 color gradients)
    local color1 color2 color3
    color1=$(echo "$colors" | awk '{print $1}')
    color2=$(echo "$colors" | awk '{print $2}')
    color3=$(echo "$colors" | awk '{print $3}')
    
    local cmd
    cmd=$(get_magick_cmd)
    
    # Create a smooth multi-stop gradient with mesh-like effect
    # Using larger canvas for rotation, then crop
    local diag_size=$((width > height ? width * 2 : height * 2))
    
    if [ -n "$color3" ]; then
        # 3-color gradient: create two gradients and blend them
        local tmp_grad1 tmp_grad2
        tmp_grad1=$(mktemp)
        tmp_grad2=$(mktemp)
        
        # First gradient: color1 to color2 (vertical)
        $cmd -size "${diag_size}x${diag_size}" \
            gradient:"${color1}-${color2}" \
            PNG:"$tmp_grad1"
        
        # Second gradient: transparent to color3 (diagonal overlay)
        $cmd -size "${diag_size}x${diag_size}" \
            gradient:"transparent-${color3}" \
            -rotate 90 \
            PNG:"$tmp_grad2"
        
        # Composite gradients with soft light blend for rich effect
        $cmd PNG:"$tmp_grad1" PNG:"$tmp_grad2" \
            -compose soft-light -composite \
            -rotate 135 \
            -gravity center \
            -crop "${width}x${height}+0+0" \
            +repage \
            PNG:"$output"
        
        rm -f "$tmp_grad1" "$tmp_grad2"
    else
        # 2-color gradient (fallback)
        $cmd -size "${diag_size}x${diag_size}" \
            gradient:"${color1}-${color2}" \
            -rotate 135 \
            -gravity center \
            -crop "${width}x${height}+0+0" \
            +repage \
            PNG:"$output"
    fi
}

composite_screenshot_into_frame() {
    local screenshot="$1"
    local frame="$2"
    local output="$3"
    local screen_area="$4"
    local frame_name="$5"
    
    local cmd
    cmd=$(get_magick_cmd)
    
    # Parse screen area
    local x y w h
    x=$(echo "$screen_area" | cut -d',' -f1)
    y=$(echo "$screen_area" | cut -d',' -f2)
    w=$(echo "$screen_area" | cut -d',' -f3)
    h=$(echo "$screen_area" | cut -d',' -f4)
    
    # Get corner radius for this device frame
    local corner_radius
    corner_radius=$(get_corner_radius "$frame_name")
    
    # Get frame dimensions
    local frame_dims
    frame_dims=$($cmd "$frame" -format "%wx%h" info:)
    local frame_w frame_h
    frame_w=$(echo "$frame_dims" | cut -d'x' -f1)
    frame_h=$(echo "$frame_dims" | cut -d'x' -f2)
    
    # Create unique temp files
    local resized_screenshot rounded_screenshot
    resized_screenshot=$(mktemp)
    rounded_screenshot=$(mktemp)
    
    # Resize screenshot to FILL screen area completely (no gaps)
    # Use ^ to scale so image covers the entire area, then crop to exact size
    $cmd "$screenshot" \
        -resize "${w}x${h}^" \
        -gravity center \
        -extent "${w}x${h}" \
        PNG:"$resized_screenshot"
    
    # Apply rounded corners to screenshot to match device frame's curved screen edges
    # This prevents square screenshot corners from peeking out of the curved frame
    if [ "$corner_radius" -gt 0 ]; then
        # Create rounded rectangle mask and apply to screenshot
        $cmd PNG:"$resized_screenshot" \
            \( +clone -alpha extract \
               -draw "fill black polygon 0,0 0,${corner_radius} ${corner_radius},0 fill white circle ${corner_radius},${corner_radius} ${corner_radius},0" \
               \( +clone -flip \) -compose Multiply -composite \
               \( +clone -flop \) -compose Multiply -composite \
            \) -alpha off -compose CopyOpacity -composite \
            PNG:"$rounded_screenshot"
    else
        cp "$resized_screenshot" "$rounded_screenshot"
    fi
    
    # Create canvas with frame dimensions, place screenshot at screen position, overlay frame
    # Then trim to remove transparent outer areas (padding around the phone)
    $cmd -size "${frame_w}x${frame_h}" xc:none \
        PNG:"$rounded_screenshot" -geometry "+${x}+${y}" -composite \
        "$frame" -composite \
        -trim +repage \
        PNG:"$output"
    
    rm -f "$resized_screenshot" "$rounded_screenshot"
}

add_title_to_canvas() {
    local canvas="$1"
    local title="$2"
    local output="$3"
    local locale="$4"
    local title_area_height="${5:-400}"  # Default fallback
    local platform="${6:-ios}"
    local device="${7:-phone}"
    
    local cmd
    cmd=$(get_magick_cmd)
    
    # Get canvas dimensions
    local canvas_width canvas_height
    canvas_width=$($cmd PNG:"$canvas" -format "%w" info:)
    canvas_height=$($cmd PNG:"$canvas" -format "%h" info:)
    
    # Get font configuration based on device
    local font_config font_size line_height
    font_config=$(get_font_config "${platform}_${device}")
    font_size=$(echo "$font_config" | cut -d',' -f1)
    line_height=$(echo "$font_config" | cut -d',' -f2)
    local font=""
    
    # Choose font based on locale (CJK needs different handling)
    case "$locale" in
        ja|ko|zh)
            # Reduce CJK font size proportionally
            font_size=$((font_size * 85 / 100))
            line_height=$((line_height * 85 / 100))
            # Use system fonts that support CJK on macOS
            # Font names must match ImageMagick's font list: magick -list font | grep "Font:"
            if [[ "$OSTYPE" == "darwin"* ]]; then
                case "$locale" in
                    ja) font=".Hiragino-Kaku-Gothic-Interface-W7" ;;
                    ko) font="Apple-SD-Gothic-Neo-ExtraBold" ;;
                    zh) font="Heiti-SC-Medium" ;;
                esac
            fi
            ;;
        *)
            # Modern sans-serif fonts for Western text
            if [[ "$OSTYPE" == "darwin"* ]]; then
                # Avenir-Black: boldest variant, clean and modern
                font="Avenir-Black"
            fi
            ;;
    esac
    
    # Calculate total text height (for centering)
    local total_text_height=$((font_size + line_height))  # Approximate for 2 lines
    
    # Center title vertically in the title area (space above device)
    local title_y=$(( (title_area_height - total_text_height) / 2 ))
    
    # Split title into lines (handle \n in title)
    local line1 line2
    if [[ "$title" == *$'\n'* ]]; then
        line1=$(echo "$title" | head -1)
        line2=$(echo "$title" | tail -1)
    else
        line1="$title"
        line2=""
    fi
    
    # Create text layer with glow effect
    local tmp_text tmp_glow
    tmp_text=$(mktemp)
    tmp_glow=$(mktemp)
    
    # Build font arguments
    local font_args=""
    [ -n "$font" ] && font_args="-font $font"
    
    if [ -n "$line2" ]; then
        # Two-line title with proper spacing
        local y1=$title_y
        local y2=$((title_y + line_height))
        
        # Create glow/shadow layer (blurred dark text behind)
        $cmd -size "${canvas_width}x${canvas_height}" xc:transparent \
            $font_args \
            -pointsize "$font_size" \
            -gravity North \
            -fill "rgba(0,0,0,0.5)" \
            -annotate +0+$((y1 + 3)) "$line1" \
            -annotate +0+$((y2 + 3)) "$line2" \
            -blur 0x8 \
            PNG:"$tmp_glow"
        
        # Create main text layer (white with slight shadow)
        $cmd -size "${canvas_width}x${canvas_height}" xc:transparent \
            $font_args \
            -pointsize "$font_size" \
            -gravity North \
            -fill "rgba(0,0,0,0.25)" -annotate +2+$((y1 + 2)) "$line1" \
            -fill "rgba(0,0,0,0.25)" -annotate +2+$((y2 + 2)) "$line2" \
            -fill white -annotate +0+$y1 "$line1" \
            -fill white -annotate +0+$y2 "$line2" \
            PNG:"$tmp_text"
    else
        # Single line title
        # Create glow layer
        $cmd -size "${canvas_width}x${canvas_height}" xc:transparent \
            $font_args \
            -pointsize "$font_size" \
            -gravity North \
            -fill "rgba(0,0,0,0.5)" \
            -annotate +0+$((title_y + 3)) "$line1" \
            -blur 0x8 \
            PNG:"$tmp_glow"
        
        # Create main text layer
        $cmd -size "${canvas_width}x${canvas_height}" xc:transparent \
            $font_args \
            -pointsize "$font_size" \
            -gravity North \
            -fill "rgba(0,0,0,0.25)" -annotate +2+$((title_y + 2)) "$line1" \
            -fill white -annotate +0+$title_y "$line1" \
            PNG:"$tmp_text"
    fi
    
    # Composite: canvas + glow + text
    $cmd PNG:"$canvas" \
        PNG:"$tmp_glow" -composite \
        PNG:"$tmp_text" -composite \
        "$output"
    
    rm -f "$tmp_text" "$tmp_glow"
}

process_screenshot() {
    local platform="$1"
    local device="$2"
    local locale="$3"
    local screenshot_name="$4"
    local default_gradient="$5"
    local output_format="${6:-jpg}"
    local jpeg_quality="${7:-90}"
    
    # Get screenshot-specific gradient (or use default)
    local gradient_name
    gradient_name=$(get_screenshot_gradient "$screenshot_name" "$default_gradient")
    
    local frame_key="${platform}_${device}"
    local frame_file
    frame_file=$(get_frame_file "$frame_key")
    local frame_path="$FRAMES_DIR/$frame_file"
    
    # Get frame name without extension for screen area lookup
    local frame_name="${frame_file%.png}"
    local screen_area
    screen_area=$(get_screen_area "$frame_name")
    
    if [ -z "$screen_area" ]; then
        error "No screen area defined for frame: $frame_name"
        return 1
    fi
    
    local screenshot_path="$SCREENSHOTS_DIR/$platform/$device/$locale/${screenshot_name}.png"
    
    if [ ! -f "$screenshot_path" ]; then
        warn "Screenshot not found: $screenshot_path"
        return 1
    fi
    
    if [ ! -f "$frame_path" ]; then
        error "Frame not found: $frame_path"
        return 1
    fi
    
    # Get output size
    local output_size
    output_size=$(get_output_size "$frame_key")
    local output_width output_height
    output_width=$(echo "$output_size" | cut -d'x' -f1)
    output_height=$(echo "$output_size" | cut -d'x' -f2)
    
    # Get title
    local title
    title=$(get_title "$screenshot_name" "$locale")
    
    # Create output directory
    local output_subdir="$OUTPUT_DIR/$platform/$device/$locale"
    mkdir -p "$output_subdir"
    local final_output="$output_subdir/${screenshot_name}.${output_format}"
    
    # Create temp files (without extension - ImageMagick will handle format)
    local tmp_gradient tmp_framed tmp_scaled tmp_canvas tmp_titled
    tmp_gradient=$(mktemp)
    tmp_framed=$(mktemp)
    tmp_scaled=$(mktemp)
    tmp_canvas=$(mktemp)
    tmp_titled=$(mktemp)
    
    local cmd
    cmd=$(get_magick_cmd)
    
    # Step 1: Create gradient background
    create_gradient "$tmp_gradient" "$output_width" "$output_height" "$gradient_name"
    
    # Step 2: Composite screenshot into device frame
    composite_screenshot_into_frame "$screenshot_path" "$frame_path" "$tmp_framed" "$screen_area" "$frame_name"
    
    # Step 3: Scale framed device to fit on canvas
    local scale
    scale=$(get_device_scale "$frame_key")
    local framed_dims
    framed_dims=$($cmd PNG:"$tmp_framed" -format "%wx%h" info:)
    local framed_w framed_h
    framed_w=$(echo "$framed_dims" | cut -d'x' -f1)
    framed_h=$(echo "$framed_dims" | cut -d'x' -f2)
    
    local scaled_w scaled_h
    scaled_w=$(echo "$framed_w * $scale" | bc | cut -d'.' -f1)
    scaled_h=$(echo "$framed_h * $scale" | bc | cut -d'.' -f1)
    
    $cmd PNG:"$tmp_framed" \
        -resize "${scaled_w}x${scaled_h}" \
        PNG:"$tmp_scaled"
    
    # Step 4: Place scaled device on gradient canvas (centered, at bottom with padding)
    local bottom_padding=100
    $cmd PNG:"$tmp_gradient" PNG:"$tmp_scaled" \
        -gravity South \
        -geometry +0+${bottom_padding} \
        -composite \
        PNG:"$tmp_canvas"
    
    # Calculate title area height (space between top edge and device frame)
    local title_area_height=$((output_height - scaled_h - bottom_padding))
    
    # Step 5: Add title
    if [ -n "$title" ]; then
        add_title_to_canvas "$tmp_canvas" "$title" "PNG:$tmp_titled" "$locale" "$title_area_height" "$platform" "$device"
    else
        cp "$tmp_canvas" "$tmp_titled"
    fi
    
    # Step 6: Convert to final output format
    if [ "$output_format" = "jpg" ]; then
        $cmd PNG:"$tmp_titled" -quality "$jpeg_quality" -background white -flatten "$final_output"
    else
        $cmd PNG:"$tmp_titled" "$final_output"
    fi
    
    # Cleanup temp files
    rm -f "$tmp_gradient" "$tmp_framed" "$tmp_scaled" "$tmp_canvas" "$tmp_titled"
    
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

show_help() {
    cat << 'EOF'
Frame - Marketing screenshot framer for Facts a Day

USAGE:
    ./marketing/scripts/frame.sh [OPTIONS]

OPTIONS:
    --locale <code>       Process specific locale (en, de, es, fr, ja, ko, tr, zh)
    --platform <name>     Process specific platform (ios, android)
    --device <type>       Process specific device (phone, tablet)
    --screenshot <name>   Process specific screenshot (01_home, 02_fact_detail, etc.)
    --gradient <name>     Use specific gradient (default, sunset, ocean, aurora, candy)
    --format <type>       Output format: jpg or png (default: jpg)
    --quality <n>         JPEG quality 1-100 (default: 90)
    --jobs <n>            Number of parallel jobs (default: CPU cores)
    --no-parallel         Disable parallel processing
    --help                Show this help

EXAMPLES:
    # Process all screenshots (parallel by default)
    ./marketing/scripts/frame.sh

    # Process only English screenshots
    ./marketing/scripts/frame.sh --locale en

    # Process iOS phone screenshots
    ./marketing/scripts/frame.sh --platform ios --device phone

    # Process specific screenshot across all locales
    ./marketing/scripts/frame.sh --screenshot 01_home

    # Use ocean gradient
    ./marketing/scripts/frame.sh --gradient ocean

    # Run with 8 parallel jobs
    ./marketing/scripts/frame.sh --jobs 8

    # Output as PNG instead of JPEG
    ./marketing/scripts/frame.sh --format png

    # High quality JPEG output
    ./marketing/scripts/frame.sh --format jpg --quality 95

    # Disable parallel processing
    ./marketing/scripts/frame.sh --no-parallel

PREREQUISITES:
    brew install imagemagick jq

OUTPUT:
    marketing/output/
    ├── ios/
    │   ├── phone/{locale}/
    │   └── tablet/{locale}/
    └── android/
        ├── phone/{locale}/
        └── tablet/{locale}/
EOF
}

main() {
    local filter_locale=""
    local filter_platform=""
    local filter_device=""
    local filter_screenshot=""
    local gradient_name="default"
    local parallel_jobs="$MAX_JOBS"
    local parallel_enabled=true
    local output_format="$DEFAULT_OUTPUT_FORMAT"
    local jpeg_quality="$DEFAULT_JPEG_QUALITY"
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --locale)
                filter_locale="$2"
                shift 2
                ;;
            --platform)
                filter_platform="$2"
                shift 2
                ;;
            --device)
                filter_device="$2"
                shift 2
                ;;
            --screenshot)
                filter_screenshot="$2"
                shift 2
                ;;
            --gradient)
                gradient_name="$2"
                shift 2
                ;;
            --format)
                output_format="$2"
                if [[ "$output_format" != "jpg" && "$output_format" != "png" ]]; then
                    error "Invalid format: $output_format (use jpg or png)"
                    exit 1
                fi
                shift 2
                ;;
            --quality)
                jpeg_quality="$2"
                if [[ ! "$jpeg_quality" =~ ^[0-9]+$ ]] || [ "$jpeg_quality" -lt 1 ] || [ "$jpeg_quality" -gt 100 ]; then
                    error "Invalid quality: $jpeg_quality (use 1-100)"
                    exit 1
                fi
                shift 2
                ;;
            --jobs)
                parallel_jobs="$2"
                shift 2
                ;;
            --no-parallel)
                parallel_enabled=false
                parallel_jobs=1
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
    
    # Check dependencies
    check_dependencies
    
    # Verify config exists
    if [ ! -f "$CONFIG_FILE" ]; then
        error "Config file not found: $CONFIG_FILE"
        exit 1
    fi
    
    # Determine what to process
    local locales=("${ALL_LOCALES[@]}")
    local platforms=("${ALL_PLATFORMS[@]}")
    local devices=("${ALL_DEVICES[@]}")
    local screenshots=("${ALL_SCREENSHOTS[@]}")
    
    [ -n "$filter_locale" ] && locales=("$filter_locale")
    [ -n "$filter_platform" ] && platforms=("$filter_platform")
    [ -n "$filter_device" ] && devices=("$filter_device")
    [ -n "$filter_screenshot" ] && screenshots=("$filter_screenshot")
    
    header "Marketing Screenshot Framer"
    echo ""
    info "Platforms:    ${platforms[*]}"
    info "Devices:      ${devices[*]}"
    info "Locales:      ${locales[*]}"
    info "Screenshots:  ${#screenshots[@]} items"
    info "Gradient:     $gradient_name"
    if [ "$output_format" = "jpg" ]; then
        info "Format:       $output_format (quality: $jpeg_quality)"
    else
        info "Format:       $output_format"
    fi
    if $parallel_enabled; then
        info "Parallel:     $parallel_jobs jobs"
    else
        info "Parallel:     disabled"
    fi
    info "Output:       $OUTPUT_DIR/"
    
    # Calculate total
    local total=0
    for platform in "${platforms[@]}"; do
        for device in "${devices[@]}"; do
            for locale in "${locales[@]}"; do
                for screenshot in "${screenshots[@]}"; do
                    ((total++))
                done
            done
        done
    done
    
    echo ""
    info "Processing $total screenshots..."
    echo ""
    
    # Start timer
    local start_time
    start_time=$(date +%s)
    
    # Create temp directory for job results
    local results_dir
    results_dir=$(mktemp -d)
    trap "rm -rf '$results_dir'" EXIT
    
    # Track running jobs
    local running_jobs=0
    local job_pids=()
    local queued=0
    
    # Function to wait for a job slot
    wait_for_slot() {
        while [ "$running_jobs" -ge "$parallel_jobs" ]; do
            # Wait for any job to finish
            for i in "${!job_pids[@]}"; do
                if ! kill -0 "${job_pids[$i]}" 2>/dev/null; then
                    unset 'job_pids[i]'
                    ((running_jobs--))
                    break
                fi
            done
            # Small sleep to prevent busy-waiting
            [ "$running_jobs" -ge "$parallel_jobs" ] && sleep 0.1
        done
        # Reindex array
        job_pids=("${job_pids[@]}")
    }
    
    # Progress display pid (declared outside condition for scope)
    local progress_pid=""
    
    # Start progress display in background
    if $parallel_enabled && [ -t 1 ]; then
        (
            while [ ! -f "$results_dir/.done" ]; do
                local completed
                completed=$(find "$results_dir" -type f ! -name ".done" 2>/dev/null | wc -l | tr -d ' ')
                printf "\r  ${BLUE}▸${NC} Progress: %d/%d (%.0f%%)  " \
                    "$completed" "$total" "$(echo "scale=0; $completed * 100 / $total" | bc)"
                sleep 0.3
            done
        ) &
        progress_pid=$!
    fi
    
    # Process screenshots in parallel
    for platform in "${platforms[@]}"; do
        for device in "${devices[@]}"; do
            for locale in "${locales[@]}"; do
                for screenshot in "${screenshots[@]}"; do
                    local screenshot_path="$SCREENSHOTS_DIR/$platform/$device/$locale/${screenshot}.png"
                    local result_file="$results_dir/${platform}_${device}_${locale}_${screenshot}"
                    
                    # Wait for available job slot
                    wait_for_slot
                    
                    # Run job in background
                    (
                        if [ ! -f "$screenshot_path" ]; then
                            echo "skipped" > "$result_file"
                            exit 0
                        fi
                        
                        if process_screenshot "$platform" "$device" "$locale" "$screenshot" "$gradient_name" "$output_format" "$jpeg_quality" 2>/dev/null; then
                            echo "success" > "$result_file"
                        else
                            echo "failed" > "$result_file"
                        fi
                    ) &
                    
                    job_pids+=($!)
                    ((running_jobs++))
                    ((queued++))
                done
            done
        done
    done
    
    # Wait for all job pids (not progress display)
    for pid in "${job_pids[@]}"; do
        wait "$pid" 2>/dev/null || true
    done
    
    # Stop progress display
    if [ -n "$progress_pid" ]; then
        touch "$results_dir/.done"
        sleep 0.4
        kill "$progress_pid" 2>/dev/null || true
        wait "$progress_pid" 2>/dev/null || true
        printf "\r%-60s\r" " "  # Clear progress line
    fi
    
    # Count and display results
    local processed=0
    local failed=0
    local skipped=0
    
    echo ""
    echo -e "${CYAN}━━━ Results ━━━${NC}"
    
    for platform in "${platforms[@]}"; do
        for device in "${devices[@]}"; do
            for locale in "${locales[@]}"; do
                for screenshot in "${screenshots[@]}"; do
                    local result_file="$results_dir/${platform}_${device}_${locale}_${screenshot}"
                    if [ -f "$result_file" ]; then
                        local result
                        result=$(cat "$result_file")
                        case "$result" in
                            success)
                                ((processed++))
                                echo -e "  ${GREEN}✓${NC} $platform/$device/$locale/$screenshot"
                                ;;
                            failed)
                                ((failed++))
                                echo -e "  ${RED}✗${NC} $platform/$device/$locale/$screenshot"
                                ;;
                            skipped)
                                ((skipped++))
                                ;;
                        esac
                    fi
                done
            done
        done
    done
    
    # Calculate elapsed time
    local end_time elapsed_time
    end_time=$(date +%s)
    elapsed_time=$((end_time - start_time))
    
    local minutes seconds
    minutes=$((elapsed_time / 60))
    seconds=$((elapsed_time % 60))
    
    # Summary
    header "Complete"
    echo ""
    success "Processed: $processed"
    [ $skipped -gt 0 ] && warn "Skipped:   $skipped (source not found)"
    [ $failed -gt 0 ] && error "Failed:    $failed"
    echo ""
    
    if [ $minutes -gt 0 ]; then
        info "Duration:     ${minutes}m ${seconds}s"
    else
        info "Duration:     ${seconds}s"
    fi
    
    if [ $processed -gt 0 ] && [ $elapsed_time -gt 0 ]; then
        local rate
        rate=$(echo "scale=2; $processed / $elapsed_time" | bc)
        info "Speed:        ${rate} screenshots/sec"
    elif [ $processed -gt 0 ]; then
        info "Speed:        ${processed} screenshots/sec"
    fi
    
    info "Output:       $OUTPUT_DIR/"
    
    if [ -d "$OUTPUT_DIR" ]; then
        local count
        count=$(find "$OUTPUT_DIR" \( -name "*.png" -o -name "*.jpg" \) -type f 2>/dev/null | wc -l | tr -d ' ')
        info "Total files:  $count"
    fi
}

main "$@"

