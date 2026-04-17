import SwiftUI
import WidgetKit

// MARK: - Shared subviews

struct PageDots: View {
    let count: Int
    let activeIndex: Int
    let color: Color

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<count, id: \.self) { i in
                Circle()
                    .fill(i == activeIndex ? color : color.opacity(0.3))
                    .frame(width: 5, height: 5)
            }
        }
    }
}

/// App icon shown in the bottom-right corner as a brand marker.
/// The icon-512.png file is bundled into the widget extension as a loose
/// resource by the withFactWidget config plugin.
/// App icon shown in the bottom-right corner as a brand marker.
/// Uses iOS's "squircle" corner ratio (~22.5% of width) for an Apple-native feel.
///
/// Loaded via `UIImage(named:)` because `Image("name")` does not reliably
/// find loose PNG resources inside a widget-extension bundle when there is
/// no asset catalog. The icon is bundled by the withFactWidget config plugin.
struct BrandBulb: View {
    var body: some View {
        Group {
            if let ui = UIImage(named: "icon-512") {
                Image(uiImage: ui)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
            } else {
                // Solid brand color if the icon asset is missing, so the
                // corner is never a blank spot.
                WidgetTheme.Dark.primary
            }
        }
        .frame(width: 20, height: 20)
        .clipShape(RoundedRectangle(cornerRadius: 4.5, style: .continuous))
    }
}

/// Full-bleed fact image with a readability gradient overlay.
struct FactImageBackground: View {
    let entry: FactEntry
    let fallback: Color

    var body: some View {
        ZStack {
            if let data = entry.imageData, let ui = UIImage(data: data) {
                Image(uiImage: ui)
                    .resizable()
                    .scaledToFill()
            } else {
                fallback
            }
            LinearGradient(
                gradient: WidgetTheme.imageOverlayGradient,
                startPoint: .top,
                endPoint: .bottom
            )
        }
    }
}

// MARK: - Card Style (per-family sizing)

/// Typography and spacing values that vary by widget family.
/// Layout structure is identical across sizes — only these numbers change.
struct CardStyle {
    let titleSize: CGFloat
    let badgeSize: CGFloat
    let badgePadH: CGFloat
    let badgePadV: CGFloat
    let padding: CGFloat
    let titleLines: Int
    let bottomSpacing: CGFloat

    static let small  = CardStyle(titleSize: 12, badgeSize: 9,  badgePadH: 6,  badgePadV: 2, padding: 5,  titleLines: 5, bottomSpacing: 6)
    static let medium = CardStyle(titleSize: 15, badgeSize: 11, badgePadH: 9,  badgePadV: 3, padding: 8,  titleLines: 4, bottomSpacing: 8)
    static let large  = CardStyle(titleSize: 18, badgeSize: 12, badgePadH: 10, badgePadV: 4, padding: 10, titleLines: 5, bottomSpacing: 10)

    static func forFamily(_ family: WidgetFamily) -> CardStyle {
        switch family {
        case .systemSmall:  return .small
        case .systemMedium: return .medium
        case .systemLarge:  return .large
        default:            return .small
        }
    }
}

// MARK: - Main card view (shared across all families)

struct FactCardView: View {
    let entry: FactEntry
    let fact: WidgetFact
    let style: CardStyle

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Top: category badge
            Text(fact.categoryName)
                .font(.system(size: style.badgeSize, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, style.badgePadH)
                .padding(.vertical, style.badgePadV)
                .background(Capsule().fill(Color(dynamicHex: fact.categoryColor)))

            Spacer(minLength: style.bottomSpacing)

            // Bottom: fact text + page dots + brand bulb
            VStack(alignment: .leading, spacing: style.bottomSpacing) {
                Text(fact.title)
                    .font(.system(size: style.titleSize, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(style.titleLines)
                    .fixedSize(horizontal: false, vertical: true)
                    .shadow(color: .black.opacity(0.4), radius: 2, x: 0, y: 1)

                HStack {
                    if entry.factsCount > 1 {
                        PageDots(
                            count: entry.factsCount,
                            activeIndex: entry.factIndex,
                            color: .white.opacity(0.9)
                        )
                    }
                    Spacer()
                    BrandBulb()
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(style.padding)
    }
}

// MARK: - Widget entry dispatcher

/// Single view used by all widget families. Picks a `CardStyle` off the
/// `widgetFamily` environment and renders the shared `FactCardView`.
struct FactWidgetView: View {
    @Environment(\.widgetFamily) var family
    @Environment(\.colorScheme) var colorScheme
    let entry: FactEntry

    var body: some View {
        if let fact = entry.fact {
            FactCardView(entry: entry, fact: fact, style: CardStyle.forFamily(family))
                .widgetURL(URL(string: fact.deepLink))
                .containerBackground(for: .widget) {
                    FactImageBackground(
                        entry: entry,
                        fallback: WidgetTheme.primary(for: colorScheme).opacity(0.3)
                    )
                }
        } else {
            EmptyWidgetView(colorScheme: colorScheme)
        }
    }
}

// MARK: - Empty / stale state

struct EmptyWidgetView: View {
    let colorScheme: ColorScheme

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "lightbulb.fill")
                .font(.system(size: 24))
                .foregroundColor(WidgetTheme.primary(for: colorScheme))

            Text("Open Facts a Day")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(WidgetTheme.text(for: colorScheme))

            Text("for fresh facts")
                .font(.system(size: 11))
                .foregroundColor(WidgetTheme.textMuted(for: colorScheme))
        }
        .widgetURL(URL(string: "factsaday://"))
        .containerBackground(for: .widget) {
            WidgetTheme.cardBackground(for: colorScheme)
        }
    }
}
