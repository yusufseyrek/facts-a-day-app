#!/usr/bin/env python3
"""Generate Android widget XML layouts with ViewFlipper + 5 pages.

Each page has unique IDs (e.g. widget_image_0, widget_title_0, ...) so the
Kotlin provider can populate all pages from a single onUpdate call. The
ViewFlipper then auto-cycles through them every FLIP_INTERVAL_MS.

Outputs widget_small.xml, widget_medium.xml, widget_large.xml into
android-widget/res/layout/.
"""
import os

FLIP_INTERVAL_MS = 10000  # iOS parity: rotate every 10 seconds
NUM_PAGES = 5
HERE = os.path.dirname(__file__)
OUT_DIR = os.path.join(HERE, "res", "layout")

# (size_key, title_sp, badge_sp, badge_pad_h, badge_pad_v, title_max_lines, padding_dp, dot_size_dp, bulb_dp, bottom_spacing_dp)
# Android widgets have tighter system insets than iOS WidgetKit, so padding is
# pushed up a bit here to compensate. Small 2×2 gets the biggest bump because
# its content was hugging the edges on Android launchers.
SIZES = [
    ("small",  12, 9,  6, 2, 5, 18, 5, 20, 6),
    ("medium", 15, 11, 9, 3, 4, 22, 5, 22, 8),
    ("large",  18, 12, 10, 4, 5, 25, 5, 24, 10),
]


def dots_xml(page_index, dot_size):
    """Build 5 dot ImageViews. The page_index'th dot is active, others inactive."""
    parts = []
    for d in range(NUM_PAGES):
        drawable = "widget_dot_active" if d == page_index else "widget_dot_inactive"
        margin_end = ' android:layout_marginEnd="4dp"' if d < NUM_PAGES - 1 else ''
        parts.append(
            f'        <ImageView android:layout_width="{dot_size}dp" '
            f'android:layout_height="{dot_size}dp"{margin_end} '
            f'android:src="@drawable/{drawable}" '
            f'android:contentDescription="@null" />'
        )
    return "\n".join(parts)


def page_xml(size, page_index):
    (key, title_sp, badge_sp, badge_ph, badge_pv, title_max, pad, dot_size, bulb_dp, bottom_sp) = size
    # Title is bold-ish; large variant uses heavier weight via textStyle="bold"
    title_style = ' android:textStyle="bold"' if key == "large" else ''
    return f'''    <FrameLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:background="@drawable/widget_fallback_bg">

        <ImageView
            android:id="@+id/widget_image_{page_index}"
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:scaleType="centerCrop"
            android:contentDescription="@null" />

        <FrameLayout
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:background="@drawable/widget_gradient_overlay" />

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:orientation="vertical"
            android:padding="{pad}dp">

            <TextView
                android:id="@+id/widget_badge_{page_index}"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:textSize="{badge_sp}sp"
                android:textColor="#FFFFFF"
                android:fontFamily="sans-serif-medium"
                android:paddingStart="{badge_ph}dp"
                android:paddingEnd="{badge_ph}dp"
                android:paddingTop="{badge_pv}dp"
                android:paddingBottom="{badge_pv}dp"
                android:background="@drawable/widget_badge_bg"
                android:text="" />

            <FrameLayout
                android:layout_width="match_parent"
                android:layout_height="0dp"
                android:layout_weight="1" />

            <TextView
                android:id="@+id/widget_title_{page_index}"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:textSize="{title_sp}sp"
                android:textColor="#FFFFFF"
                android:fontFamily="sans-serif-medium"{title_style}
                android:maxLines="{title_max}"
                android:ellipsize="end"
                android:shadowColor="#66000000"
                android:shadowRadius="2"
                android:shadowDx="0"
                android:shadowDy="1"
                android:text="" />

            <LinearLayout
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:gravity="center_vertical"
                android:layout_marginTop="{bottom_sp}dp">

{dots_xml(page_index, dot_size)}

                <FrameLayout
                    android:layout_width="0dp"
                    android:layout_height="1dp"
                    android:layout_weight="1" />

                <ImageView
                    android:id="@+id/widget_bulb_{page_index}"
                    android:layout_width="{bulb_dp}dp"
                    android:layout_height="{bulb_dp}dp"
                    android:src="@drawable/widget_app_icon"
                    android:contentDescription="@null" />
            </LinearLayout>

        </LinearLayout>

    </FrameLayout>
'''


def layout_xml(size):
    pages = "\n".join(page_xml(size, i) for i in range(NUM_PAGES))
    return f'''<?xml version="1.0" encoding="utf-8"?>
<ViewFlipper xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_flipper"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:flipInterval="{FLIP_INTERVAL_MS}"
    android:autoStart="true"
    android:measureAllChildren="false">

{pages}
</ViewFlipper>
'''


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        key = size[0]
        path = os.path.join(OUT_DIR, f"widget_{key}.xml")
        with open(path, "w") as f:
            f.write(layout_xml(size))
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()
