# Facts-a-Day App

A minimalist React Native app built with **Expo**, **Tamagui**, and **Expo Router** featuring multi-language support and light/dark themes.

## 🎨 Features

- ✅ **Multi-language support** (English, Español, Français)
- ✅ **Light and Dark mode** with automatic system detection
- ✅ **Persistent preferences** (theme and language)
- ✅ **Type-safe** with TypeScript
- ✅ **Expo Router** for file-based navigation
- ✅ **Tamagui** for styling and theming
- ✅ **Minimal component set** (Typography + Button only)

## 📁 Project Structure

```
src/
├── components/          # UI components (minimal)
│   ├── Typography.tsx   # H1, H2, BodyText, LabelText
│   ├── Button.tsx       # Button with variants
│   └── index.ts
├── theme/               # Theme configuration
│   ├── tokens.ts        # Design tokens
│   ├── config.ts        # Tamagui configuration
│   ├── ThemeProvider.tsx
│   └── index.ts
└── i18n/                # Internationalization
    ├── translations.ts  # Translation strings (en, es, fr)
    ├── config.ts
    ├── useTranslation.tsx
    └── index.ts

app/
├── _layout.tsx          # Root layout with providers
└── index.tsx            # Main app screen
```

## 🎨 Design Tokens

### Colors

**Light Mode:**
- Primary: `#0066FF`
- Neutral: `#647488`
- Neutral Light: `#E2E8F0`
- Background: `#F8FAFC`

**Dark Mode:**
- Primary: `#0066FF`
- Neutral: `#8892A6`
- Neutral Light: `#404756`
- Background: `#0F1419`

### Typography
- **H1**: 24px, Bold
- **H2**: 18px, Bold
- **Body**: 14px, Regular
- **Label**: 14px, Medium

### Spacing
- xs: 4px, sm: 8px, md: 12px, lg: 16px, xl: 24px, xxl: 32px

### Border Radius
- sm: 8px, md: 12px, lg: 16px, xl: 24px, full: 9999px

## 🚀 Getting Started

```bash
# Install dependencies
bun install

# Start development server
bun start

# Run on specific platforms
bun ios      # iOS simulator
bun android  # Android emulator
bun web      # Web browser
```

## 🌍 Multi-language Support

The app supports 8 languages:
- **Deutsch** (de) - German
- **English** (en)
- **Español** (es) - Spanish
- **Français** (fr) - French
- **日本語** (ja) - Japanese
- **한국어** (ko) - Korean
- **Türkçe** (tr) - Turkish
- **中文** (zh) - Chinese

### Using Translations

```tsx
import { useTranslation } from '../src/i18n';

function MyComponent() {
  const { t, locale, setLocale } = useTranslation();

  return (
    <View>
      <Text>{t('welcomeMessage')}</Text>
      <Button onPress={() => setLocale('es')}>
        Switch to Spanish
      </Button>
    </View>
  );
}
```

### Adding New Translation Keys

Add the key-value pair to all languages in [src/i18n/translations.ts](src/i18n/translations.ts):

```typescript
export const translations = {
  en: { newKey: 'New translation' },
  es: { newKey: 'Nueva traducción' },
  fr: { newKey: 'Nouvelle traduction' },
};
```

## 🌓 Theme System

### Using the Theme

```tsx
import { useTheme } from '../src/theme';

function MyComponent() {
  const { theme, toggleTheme } = useTheme();

  return (
    <View backgroundColor="$background">
      <Text color="$text">Current theme: {theme}</Text>
      <Button onPress={toggleTheme}>Toggle Theme</Button>
    </View>
  );
}
```

## 🧩 Components

### Typography

```tsx
import { H1, H2, BodyText, LabelText } from '../src/components';

<H1>Main Heading</H1>
<H2>Subheading</H2>
<BodyText>Regular text content</BodyText>
<LabelText>Label or caption text</LabelText>
```

### Button

```tsx
import { Button } from '../src/components';

// Primary button (default)
<Button onPress={() => console.log('Clicked')}>
  Continue
</Button>

// Secondary button
<Button variant="secondary" onPress={() => console.log('Clicked')}>
  Cancel
</Button>
```

## 🎯 Design Principles

- **Minimal** - Only essential components (Typography + Button)
- **Theme-first** - All components support light/dark modes
- **Type-safe** - Full TypeScript support
- **Internationalized** - Multi-language built-in
- **Consistent** - Shared design tokens

## 📦 Dependencies

- **expo** - React Native framework
- **expo-router** - File-based routing
- **tamagui** - UI framework and styling
- **@tamagui/lucide-icons** - Icon library for Tamagui
- **react-native-svg** - SVG rendering support
- **i18n-js** - Internationalization
- **expo-localization** - Device locale detection
- **@react-native-async-storage/async-storage** - Persistent storage

## 🎨 Styling with Tamagui

```tsx
import { styled, View } from '@tamagui/core';
import { YStack } from 'tamagui';
import { tokens } from '../src/theme/tokens';

const Container = styled(YStack, {
  padding: tokens.space.lg,
  backgroundColor: '$background',
  borderRadius: tokens.radius.md,
});
```

## 🔧 Development Tips

1. **Theme tokens**: Use `$` prefix (e.g., `$primary`, `$text`)
2. **Translations**: Use `t()` for all user-facing strings
3. **Stack components**: Import `XStack`/`YStack` from `'tamagui'`
4. **Add components**: Create in `src/components/` and export from `index.ts`

## 📱 Main Screen

The demo screen ([app/index.tsx](app/index.tsx)) showcases:
- Typography examples (H1, H2, Body)
- Button variants (Primary, Secondary)
- Theme toggle (light/dark)
- Language selector (en/es/fr)
- All translations applied

## 🚧 Next Steps

- Add more components as needed (Input, Card, Modal, etc.)
- Implement navigation between screens
- Add form validation
- Create custom hooks
- Add animations

## 📄 License

MIT
