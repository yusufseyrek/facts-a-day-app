import SwiftUI

/// Color constants mirrored from src/theme/hexColors.ts
enum WidgetTheme {

    // MARK: - Light Mode

    enum Light {
        static let background = Color(hex: "#E8F0FA")
        static let surface = Color(hex: "#F0F5FC")
        static let cardBackground = Color.white
        static let text = Color(hex: "#0A1628")
        static let textSecondary = Color(hex: "#4A6785")
        static let textMuted = Color(hex: "#7A99B8")
        static let primary = Color(hex: "#0077A8")
        static let accent = Color(hex: "#CC5500")
    }

    // MARK: - Dark Mode

    enum Dark {
        static let background = Color(hex: "#0A1628")
        static let surface = Color(hex: "#0F1E36")
        static let cardBackground = Color(hex: "#142238")
        static let text = Color.white
        static let textSecondary = Color(hex: "#8CA3C0")
        static let textMuted = Color(hex: "#5A7A9E")
        static let primary = Color(hex: "#00A3CC")
        static let accent = Color(hex: "#FF8C00")
    }

    // MARK: - Neon Category Colors (Dark)

    enum Neon {
        static let cyan = Color(hex: "#00D4FF")
        static let orange = Color(hex: "#FF8C00")
        static let magenta = Color(hex: "#FF00FF")
        static let green = Color(hex: "#00FF88")
        static let purple = Color(hex: "#A855F7")
        static let yellow = Color(hex: "#FFD700")
        static let red = Color(hex: "#FF3B5C")
    }

    // MARK: - Gradient (for large widget image overlay)

    static let imageOverlayGradient = Gradient(stops: [
        .init(color: .clear, location: 0.25),
        .init(color: Color.black.opacity(0.45), location: 0.55),
        .init(color: Color.black.opacity(0.85), location: 1.0),
    ])

    // MARK: - Helpers

    static func background(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Dark.background : Light.background
    }

    static func cardBackground(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Dark.cardBackground : Light.cardBackground
    }

    static func text(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Dark.text : Light.text
    }

    static func textSecondary(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Dark.textSecondary : Light.textSecondary
    }

    static func textMuted(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Dark.textMuted : Light.textMuted
    }

    static func primary(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Dark.primary : Light.primary
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let scanner = Scanner(string: hex)
        var rgbValue: UInt64 = 0
        scanner.scanHexInt64(&rgbValue)

        let r = Double((rgbValue & 0xFF0000) >> 16) / 255.0
        let g = Double((rgbValue & 0x00FF00) >> 8) / 255.0
        let b = Double(rgbValue & 0x0000FF) / 255.0

        self.init(red: r, green: g, blue: b)
    }

    /// Create a Color from a hex string at runtime (for dynamic category colors)
    init(dynamicHex: String) {
        self.init(hex: dynamicHex)
    }
}
