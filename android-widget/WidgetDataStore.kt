package dev.seyrek.factsaday.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import org.json.JSONObject
import java.io.File
import kotlin.math.abs

/**
 * Single source of truth for widget-wide constants. Values that are shared
 * with the JS layer (e.g. the SharedPreferences names) must be kept in sync
 * with the `WidgetBridgeModule` below and `src/services/widgetData.ts`.
 */
internal object WidgetConfig {
    const val PREFS_NAME = "widget_data"
    const val DATA_KEY = "widget_fact_data"
    const val IMAGE_CACHE_DIR = "widget_images"
    /// Widest dimension (in pixels) kept when loading a cached fact image.
    /// Matches our per-widget bitmap-memory budget (~15 MB total across all pages).
    const val MAX_IMAGE_DIMENSION = 500
}

data class WidgetFact(
    val id: Int,
    val title: String,
    val categorySlug: String,
    val categoryName: String,
    val categoryColor: String,
    val deepLink: String,
    val imageUrl: String?,
)

data class WidgetFactData(
    val facts: List<WidgetFact>,
    val updatedAt: String,
    val theme: String,
    val locale: String,
    val isPremium: Boolean,
)

/**
 * Reads the widget payload and cached images written by the main app.
 */
object WidgetDataStore {

    fun load(context: Context): WidgetFactData? {
        val prefs = context.getSharedPreferences(WidgetConfig.PREFS_NAME, Context.MODE_PRIVATE)
        val jsonString = prefs.getString(WidgetConfig.DATA_KEY, null) ?: return null

        return try {
            val json = JSONObject(jsonString)
            val factsArray = json.getJSONArray("facts")
            val facts = ArrayList<WidgetFact>(factsArray.length())
            for (i in 0 until factsArray.length()) {
                val obj = factsArray.getJSONObject(i)
                facts.add(
                    WidgetFact(
                        id = obj.getInt("id"),
                        title = obj.getString("title"),
                        categorySlug = obj.getString("categorySlug"),
                        categoryName = obj.getString("categoryName"),
                        categoryColor = obj.getString("categoryColor"),
                        deepLink = obj.getString("deepLink"),
                        imageUrl = if (obj.has("imageUrl") && !obj.isNull("imageUrl"))
                            obj.getString("imageUrl") else null,
                    )
                )
            }

            WidgetFactData(
                facts = facts,
                updatedAt = json.getString("updatedAt"),
                theme = json.getString("theme"),
                locale = json.getString("locale"),
                isPremium = json.getBoolean("isPremium"),
            )
        } catch (e: Exception) {
            null
        }
    }

    // ========================================================================
    // Image cache (populated by WidgetBridgeModule.downloadImages)
    // ========================================================================

    fun imageCacheDir(context: Context): File {
        val dir = File(context.filesDir, WidgetConfig.IMAGE_CACHE_DIR)
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    fun cacheFileFor(context: Context, urlString: String?): File? {
        if (urlString.isNullOrEmpty()) return null
        return File(imageCacheDir(context), "${abs(urlString.hashCode())}.img")
    }

    /**
     * Load a cached fact image, downscaled for widget use.
     *
     * RemoteViews enforces a per-widget bitmap memory cap (~15 MB). With five
     * pages in the ViewFlipper, each bitmap must be small — so we decode at a
     * bounded size and use RGB_565 (2 bytes/pixel instead of 4). A 500×500
     * RGB_565 bitmap is ~500 KB; five of them = ~2.5 MB total.
     */
    fun loadBitmap(context: Context, urlString: String?): Bitmap? {
        val file = cacheFileFor(context, urlString) ?: return null
        if (!file.exists()) return null
        return try {
            val boundsOpts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.absolutePath, boundsOpts)
            val srcW = boundsOpts.outWidth
            val srcH = boundsOpts.outHeight
            if (srcW <= 0 || srcH <= 0) return null

            var sampleSize = 1
            while ((srcW / sampleSize) > WidgetConfig.MAX_IMAGE_DIMENSION ||
                   (srcH / sampleSize) > WidgetConfig.MAX_IMAGE_DIMENSION) {
                sampleSize *= 2
            }

            val decodeOpts = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.RGB_565
            }
            BitmapFactory.decodeFile(file.absolutePath, decodeOpts)
        } catch (e: Exception) {
            null
        }
    }
}
