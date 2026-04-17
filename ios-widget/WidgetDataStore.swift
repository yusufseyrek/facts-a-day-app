import Foundation

/// Shared data model matching the JSON written by src/services/widgetData.ts.
struct WidgetFact: Codable {
    let id: Int
    let title: String
    let categorySlug: String
    let categoryName: String
    let categoryColor: String
    /// Black or white — whichever the JS layer computed as readable on `categoryColor`.
    let categoryTextColor: String
    let deepLink: String
    let imageUrl: String?
}

struct WidgetFactData: Codable {
    let facts: [WidgetFact]
    let updatedAt: String
    let theme: String
    let locale: String
    let isPremium: Bool
}

/// Reads the widget payload written by the main app to the shared App Group.
enum WidgetDataStore {
    static func load() -> WidgetFactData? {
        guard let defaults = UserDefaults(suiteName: WidgetConfig.appGroup),
              let jsonString = defaults.string(forKey: WidgetConfig.dataKey),
              let data = jsonString.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(WidgetFactData.self, from: data)
    }
}
