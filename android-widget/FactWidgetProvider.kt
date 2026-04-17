package dev.seyrek.factsaday.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.net.Uri
import android.os.Build
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import dev.seyrek.factsaday.R

private const val TAG = "FactWidget"

/** Number of pages hardcoded in the ViewFlipper layouts. */
private const val NUM_PAGES = 5

/** View IDs for a single carousel page. Matches the generated XML layouts. */
private data class PageIds(val image: Int, val title: Int, val badge: Int, val bulb: Int)

private val PAGE_IDS = arrayOf(
    PageIds(R.id.widget_image_0, R.id.widget_title_0, R.id.widget_badge_0, R.id.widget_bulb_0),
    PageIds(R.id.widget_image_1, R.id.widget_title_1, R.id.widget_badge_1, R.id.widget_bulb_1),
    PageIds(R.id.widget_image_2, R.id.widget_title_2, R.id.widget_badge_2, R.id.widget_bulb_2),
    PageIds(R.id.widget_image_3, R.id.widget_title_3, R.id.widget_badge_3, R.id.widget_bulb_3),
    PageIds(R.id.widget_image_4, R.id.widget_title_4, R.id.widget_badge_4, R.id.widget_bulb_4),
)

// ============================================================================
// Base provider — all three sizes share this logic; only the layout differs.
// ============================================================================

abstract class FactWidgetBaseProvider : AppWidgetProvider() {

    abstract val layoutId: Int
    abstract val sizeTag: String

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        for (widgetId in appWidgetIds) {
            try {
                renderWidget(context, appWidgetManager, widgetId)
            } catch (e: Throwable) {
                Log.e(TAG, "$sizeTag render failed (id=$widgetId)", e)
                renderFallback(context, appWidgetManager, widgetId)
            }
        }
    }

    private fun renderWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        widgetId: Int,
    ) {
        val views = RemoteViews(context.packageName, layoutId)
        val data = WidgetDataStore.load(context)

        if (data == null || data.facts.isEmpty()) {
            renderEmpty(views, context, widgetId)
            appWidgetManager.updateAppWidget(widgetId, views)
            return
        }

        // Rounded app icon is identical for every page and never changes —
        // compute once per onUpdate and reuse it.
        val roundedAppIcon = AppIconCache.get(context)

        // Populate all 5 ViewFlipper pages. If fewer than 5 facts are cached,
        // wrap around so the carousel still cycles.
        for (i in 0 until NUM_PAGES) {
            val fact = data.facts[i % data.facts.size]
            val ids = PAGE_IDS[i]

            views.setTextViewText(ids.title, fact.title)
            views.setTextViewText(ids.badge, fact.categoryName)
            tintBadge(views, ids.badge, parseColor(fact.categoryColor))
            // Badge text color (black or white) is pre-computed on the JS side
            // based on the luminance of `categoryColor`.
            views.setTextColor(ids.badge, parseColor(fact.categoryTextColor))

            val bitmap: Bitmap? = WidgetDataStore.loadBitmap(context, fact.imageUrl)
            views.setImageViewBitmap(ids.image, bitmap) // null clears any prior bitmap

            if (roundedAppIcon != null) {
                views.setImageViewBitmap(ids.bulb, roundedAppIcon)
            }
        }

        // Tapping anywhere opens the currently-visible fact. The ViewFlipper
        // auto-advances client-side, so we can't know the exact page at tap
        // time — deep-linking to the first fact is a reasonable default.
        views.setOnClickPendingIntent(
            R.id.widget_flipper,
            openPendingIntent(context, widgetId, data.facts[0].deepLink),
        )

        appWidgetManager.updateAppWidget(widgetId, views)
    }

    private fun renderEmpty(views: RemoteViews, context: Context, widgetId: Int) {
        for (i in 0 until NUM_PAGES) {
            val ids = PAGE_IDS[i]
            views.setTextViewText(ids.title, "Open Facts a Day for fresh facts")
            views.setTextViewText(ids.badge, "")
            views.setViewVisibility(ids.badge, View.INVISIBLE)
            views.setImageViewBitmap(ids.image, null)
        }
        views.setOnClickPendingIntent(
            R.id.widget_flipper,
            openPendingIntent(context, widgetId, "factsaday://"),
        )
    }

    private fun renderFallback(
        context: Context,
        appWidgetManager: AppWidgetManager,
        widgetId: Int,
    ) {
        try {
            val views = RemoteViews(context.packageName, layoutId)
            views.setTextViewText(R.id.widget_title_0, "Open Facts a Day")
            appWidgetManager.updateAppWidget(widgetId, views)
        } catch (e: Throwable) {
            Log.e(TAG, "$sizeTag fallback render failed", e)
        }
    }
}

// ============================================================================
// Concrete providers — each size is its own class because Android identifies
// widget providers by ComponentName. All real logic lives in the base class.
// ============================================================================

class FactWidgetProvider : FactWidgetBaseProvider() {
    override val layoutId = R.layout.widget_small
    override val sizeTag = "Small"
}

class FactWidgetMediumProvider : FactWidgetBaseProvider() {
    override val layoutId = R.layout.widget_medium
    override val sizeTag = "Medium"
}

class FactWidgetLargeProvider : FactWidgetBaseProvider() {
    override val layoutId = R.layout.widget_large
    override val sizeTag = "Large"
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Tint the category badge while preserving its rounded-corner shape drawable.
 * On API 31+, RemoteViews.setColorStateList targets setBackgroundTintList,
 * which leaves the shape intact. Older devices fall back to a solid color —
 * acceptable because API <31 is a shrinking minority.
 */
private fun tintBadge(views: RemoteViews, viewId: Int, color: Int) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        views.setColorStateList(viewId, "setBackgroundTintList", ColorStateList.valueOf(color))
    } else {
        views.setInt(viewId, "setBackgroundColor", color)
    }
}

private fun parseColor(hex: String): Int =
    try { Color.parseColor(hex) } catch (_: Exception) { Color.parseColor("#00D4FF") }

private fun openPendingIntent(context: Context, widgetId: Int, uri: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    return PendingIntent.getActivity(
        context, widgetId, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}

/**
 * Builds a rounded-corner bitmap of the app icon once and reuses it. The icon
 * never changes, so recomputing on every onUpdate would be wasteful.
 *
 * Size ≈ 96 px — comfortably above the largest widget bulb dimension (24dp on
 * xxxhdpi = 96 px) so Android can scale down cleanly for smaller slots.
 */
private object AppIconCache {
    private const val SIZE_PX = 96
    /// iOS-style squircle corner radius ≈ 22.5% of edge length.
    private const val CORNER_FRACTION = 0.225f

    private var cached: Bitmap? = null

    fun get(context: Context): Bitmap? {
        cached?.let { return it }
        val source = BitmapFactory.decodeResource(context.resources, R.drawable.widget_app_icon)
            ?: return null
        val scaled = Bitmap.createScaledBitmap(source, SIZE_PX, SIZE_PX, true)
        val output = Bitmap.createBitmap(SIZE_PX, SIZE_PX, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint = Paint().apply {
            isAntiAlias = true
            shader = BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        }
        val radius = SIZE_PX * CORNER_FRACTION
        canvas.drawRoundRect(RectF(0f, 0f, SIZE_PX.toFloat(), SIZE_PX.toFloat()), radius, radius, paint)
        cached = output
        return output
    }
}
