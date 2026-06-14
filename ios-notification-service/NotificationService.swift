import UserNotifications
import UIKit

/// Notification Service Extension for rich push images.
///
/// Server push sets `mutable-content: 1`, which hands each incoming remote
/// notification to this extension before it is shown. We pull the image URL out
/// of the payload, download it, and attach it.
///
/// WebP wrinkle: the app's images are `.webp`, and `UNNotificationAttachment`
/// only accepts JPEG/PNG/GIF. iOS 14+ can DECODE webp via `UIImage(data:)`, so
/// we decode whatever bytes we get and re-encode to JPEG before attaching —
/// works for webp, jpg, and png alike.
class NotificationService: UNNotificationServiceExtension {
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttempt: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    let best = request.content.mutableCopy() as? UNMutableNotificationContent
    self.bestAttempt = best

    guard let best = best else {
      contentHandler(request.content)
      return
    }

    guard
      let urlString = NotificationService.extractImageURL(from: request.content.userInfo),
      let url = URL(string: urlString)
    else {
      contentHandler(best)
      return
    }

    let task = URLSession.shared.dataTask(with: url) { data, _, _ in
      if
        let data = data,
        let attachment = NotificationService.makeJPEGAttachment(from: data)
      {
        best.attachments = [attachment]
      }
      // Always deliver — with the image if it worked, otherwise the plain text.
      contentHandler(best)
    }
    task.resume()
  }

  override func serviceExtensionTimeWillExpire() {
    // The system is about to kill us (≈30s budget): deliver whatever we have.
    if let handler = contentHandler, let best = bestAttempt {
      handler(best)
    }
  }

  /// Find the image URL across the payload shapes Expo / FCM use. The server
  /// puts `image` into the push `data` for a deterministic key; the rest are
  /// resilience fallbacks across Expo versions and the Android/FCM path.
  static func extractImageURL(from userInfo: [AnyHashable: Any]) -> String? {
    // 1) Expo nests the user `data` object under the "body" key (object or
    //    JSON string, depending on SDK version).
    if let body = userInfo["body"] {
      if let dict = body as? [String: Any], let img = dict["image"] as? String, !img.isEmpty {
        return img
      }
      if
        let str = body as? String,
        let data = str.data(using: .utf8),
        let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let img = dict["image"] as? String, !img.isEmpty
      {
        return img
      }
    }
    // 2) Expo richContent.image
    if let rc = userInfo["richContent"] as? [String: Any], let img = rc["image"] as? String, !img.isEmpty {
      return img
    }
    // 3) FCM (Android) fcm_options.image
    if let fcm = userInfo["fcm_options"] as? [String: Any], let img = fcm["image"] as? String, !img.isEmpty {
      return img
    }
    // 4) Flat key
    if let img = userInfo["image"] as? String, !img.isEmpty {
      return img
    }
    return nil
  }

  /// Decode arbitrary image bytes (incl. webp) and re-encode to a JPEG temp
  /// file, returning a notification attachment. Nil if the bytes can't decode.
  static func makeJPEGAttachment(from data: Data) -> UNNotificationAttachment? {
    guard
      let image = UIImage(data: data),
      let jpeg = image.jpegData(compressionQuality: 0.9)
    else { return nil }

    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent(ProcessInfo.processInfo.globallyUniqueString, isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      let fileURL = dir.appendingPathComponent("image.jpg")
      try jpeg.write(to: fileURL)
      return try UNNotificationAttachment(identifier: "image", url: fileURL, options: nil)
    } catch {
      return nil
    }
  }
}
