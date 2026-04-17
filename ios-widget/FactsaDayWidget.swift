import WidgetKit
import SwiftUI
import UIKit

// MARK: - Timeline Entry

struct FactEntry: TimelineEntry {
    let date: Date
    let fact: WidgetFact?
    let factIndex: Int
    let factsCount: Int
    /// Pre-fetched image bytes for this fact. Widget views render
    /// synchronously — AsyncImage does not work reliably here, so images
    /// must be resolved during timeline generation.
    let imageData: Data?
}

// MARK: - Image loading & disk cache

/// Loads fact images from the App Group disk cache, falling back to a network
/// fetch and writing successful fetches back to disk. Images are downscaled
/// to `WidgetConfig.maxImagePixelSize` so we stay within WidgetKit's per-widget
/// memory budget (`~30 MB`).
enum WidgetImageLoader {

    private static var cacheDir: URL? {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: WidgetConfig.appGroup)
        else { return nil }
        let dir = container.appendingPathComponent(WidgetConfig.imageCacheSubdir, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// Stable, short filename derived from the URL.
    private static func cacheFile(for urlString: String) -> URL? {
        guard let dir = cacheDir else { return nil }
        return dir.appendingPathComponent("\(abs(urlString.hashValue)).img")
    }

    /// Load and downscale cached image bytes. Falls back to a synchronous
    /// network fetch on a miss, and writes the result to disk for next time.
    static func load(urlString: String?) -> Data? {
        guard let urlString = urlString, let url = URL(string: urlString) else {
            return nil
        }

        if let file = cacheFile(for: urlString), let raw = try? Data(contentsOf: file) {
            return downscale(raw)
        }

        let fetched = fetchSync(url: url, timeout: WidgetConfig.imageTimeout)
        if let data = fetched, let file = cacheFile(for: urlString) {
            try? data.write(to: file, options: .atomic)
        }
        return fetched.flatMap(downscale)
    }

    /// Fetch every URL in parallel, writing successful responses straight to
    /// disk. Hits on disk are skipped. Used as an eager preloader so tapping
    /// a future timeline entry renders instantly.
    static func preloadAll(urls: [String]) {
        let group = DispatchGroup()
        let queue = DispatchQueue.global(qos: .utility)
        for urlString in urls {
            guard let url = URL(string: urlString),
                  let file = cacheFile(for: urlString),
                  !FileManager.default.fileExists(atPath: file.path)
            else { continue }
            group.enter()
            queue.async {
                let request = URLRequest(url: url, timeoutInterval: WidgetConfig.imageTimeout)
                URLSession.shared.dataTask(with: request) { data, _, _ in
                    if let data = data { try? data.write(to: file, options: .atomic) }
                    group.leave()
                }.resume()
            }
        }
        _ = group.wait(timeout: .now() + WidgetConfig.preloadTimeout)
    }

    // MARK: - helpers

    private static func fetchSync(url: URL, timeout: TimeInterval) -> Data? {
        let semaphore = DispatchSemaphore(value: 0)
        var result: Data?
        let request = URLRequest(url: url, timeoutInterval: timeout)
        URLSession.shared.dataTask(with: request) { data, _, _ in
            result = data
            semaphore.signal()
        }.resume()
        _ = semaphore.wait(timeout: .now() + timeout + 2)
        return result
    }

    /// Returns JPEG data downscaled so the longest edge is at most
    /// `WidgetConfig.maxImagePixelSize`. A full-resolution fact image can be
    /// several MB decoded; five of those in a single timeline would exceed
    /// the widget memory cap.
    private static func downscale(_ raw: Data) -> Data? {
        guard let source = UIImage(data: raw) else { return nil }
        let maxEdge = WidgetConfig.maxImagePixelSize
        let longest = max(source.size.width, source.size.height)
        if longest <= maxEdge {
            return source.jpegData(compressionQuality: 0.85) ?? raw
        }
        let scale = maxEdge / longest
        let newSize = CGSize(width: source.size.width * scale, height: source.size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: newSize, format: format)
        let downscaled = renderer.image { _ in source.draw(in: CGRect(origin: .zero, size: newSize)) }
        return downscaled.jpegData(compressionQuality: 0.85)
    }
}

// MARK: - Timeline Provider

struct FactTimelineProvider: TimelineProvider {

    func placeholder(in context: Context) -> FactEntry {
        FactEntry(
            date: Date(),
            fact: WidgetFact(
                id: 0,
                title: "Did you know? The first computer programmer was Ada Lovelace, who wrote the first algorithm in 1843.",
                categorySlug: "technology",
                categoryName: "Technology",
                categoryColor: "#A855F7",
                deepLink: "factsaday://fact/0",
                imageUrl: nil
            ),
            factIndex: 0,
            factsCount: 1,
            imageData: nil
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (FactEntry) -> Void) {
        if let data = WidgetDataStore.load(), let fact = data.facts.first {
            completion(FactEntry(
                date: Date(),
                fact: fact,
                factIndex: 0,
                factsCount: data.facts.count,
                imageData: nil
            ))
        } else {
            completion(placeholder(in: context))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FactEntry>) -> Void) {
        guard let data = WidgetDataStore.load(), !data.facts.isEmpty else {
            let entry = FactEntry(date: Date(), fact: nil, factIndex: 0, factsCount: 0, imageData: nil)
            let nextUpdate = Calendar.current.date(byAdding: .hour, value: 1, to: Date())!
            completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
            return
        }

        // Warm the disk cache for all facts in parallel, then read each back.
        // Every timeline entry renders instantly because the bitmap is ready.
        let urls = data.facts.compactMap { $0.imageUrl }
        WidgetImageLoader.preloadAll(urls: urls)
        var imageCache: [Int: Data] = [:]
        for fact in data.facts {
            if let bytes = WidgetImageLoader.load(urlString: fact.imageUrl) {
                imageCache[fact.id] = bytes
            }
        }

        let now = Date()
        let rotation = WidgetConfig.rotationSeconds
        let count = WidgetConfig.timelineEntryCount
        var entries: [FactEntry] = []
        entries.reserveCapacity(count)
        for i in 0..<count {
            let entryDate = Calendar.current.date(byAdding: .second, value: i * rotation, to: now)!
            let factIdx = i % data.facts.count
            let fact = data.facts[factIdx]
            entries.append(FactEntry(
                date: entryDate,
                fact: fact,
                factIndex: factIdx,
                factsCount: data.facts.count,
                imageData: imageCache[fact.id]
            ))
        }

        let nextReload = Calendar.current.date(byAdding: .second, value: count * rotation, to: now)!
        completion(Timeline(entries: entries, policy: .after(nextReload)))
    }
}

// MARK: - Widget Declaration

@main
struct FactsaDayWidget: Widget {
    let kind = "FactsaDayWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FactTimelineProvider()) { entry in
            FactWidgetView(entry: entry)
        }
        .configurationDisplayName("Facts a Day")
        .description("Discover a beautiful fact every few seconds.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
