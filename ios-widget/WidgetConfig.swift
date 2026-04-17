import Foundation

/// Single source of truth for widget-wide constants. Values that are shared
/// with the React Native side (e.g. App Group ID, the UserDefaults key used
/// for the JSON payload) must be kept in sync with `withFactWidget.js` and
/// `src/services/widgetData.ts`.
enum WidgetConfig {
    /// App Group identifier — shared container between the main app and the
    /// widget extension. Must match `APP_GROUP` in plugins/withFactWidget.js
    /// and be enabled on the developer account.
    static let appGroup = "group.dev.seyrek.factsaday"

    /// UserDefaults key storing the JSON blob written by the JS layer.
    static let dataKey = "widget_fact_data"

    /// Sub-directory inside the App Group container holding cached fact images.
    static let imageCacheSubdir = "widget_images"

    /// How often the widget advances to the next fact.
    static let rotationSeconds = 10

    /// Number of timeline entries generated per refresh (~10 minutes at 10s).
    static let timelineEntryCount = 60

    /// Longest edge (in pixels) that a cached fact image is downscaled to.
    /// Keeps the per-entry bitmap under the widget memory budget.
    static let maxImagePixelSize: CGFloat = 600

    /// Network timeout for single image fetches.
    static let imageTimeout: TimeInterval = 8

    /// Total time allowed for the parallel preloader to finish.
    static let preloadTimeout: TimeInterval = 15
}
