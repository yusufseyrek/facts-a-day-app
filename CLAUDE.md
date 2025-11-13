# Facts A Day - Claude Code Context

## Project Overview

**Facts A Day** is a React Native mobile app built with Expo that delivers daily interesting facts to users based on their preferences. Users receive daily notifications with curated facts in their chosen language and difficulty level.

**App Type**: React Native (Expo) mobile application
**Platform**: iOS & Android
**Languages**: TypeScript, TSX
**Current Version**: 1.0.0

## Tech Stack

### Core Framework
- **Expo SDK**: ~54.0.23
- **React Native**: 0.81.5
- **React**: 19.1.0
- **Expo Router**: ^6.0.14 (file-based routing)
- **TypeScript**: ~5.9.2 (strict mode enabled)

### UI & Styling
- **Tamagui**: ^1.136.2 (Design system and UI components)
- **React Native SVG**: ^15.14.0
- **Lucide Icons**: Via @tamagui/lucide-icons

### Data & Storage
- **Expo SQLite**: ^16.0.9 (Local database for facts, categories, content types)
- **AsyncStorage**: ^2.2.0 (User preferences, onboarding status)
- **Expo SecureStore**: ^15.0.7 (Encrypted device authentication key)

### Features
- **Expo Notifications**: ^0.32.12 (Local notification scheduling)
- **Expo IAP**: ^3.1.27 (In-app purchases for subscriptions)
- **Google Mobile Ads**: ^16.0.0 (Banner and interstitial ads)
- **i18n-js**: ^4.5.1 (Internationalization - 8 languages)
- **Expo Localization**: ^17.0.7 (Device locale detection)

### Package Manager
- **Bun**: Used as package manager (see bun.lock)

## Project Structure

```
facts-a-day-app/
├── app/                          # Expo Router file-based routing
│   ├── _layout.tsx              # Root layout with onboarding check & context providers
│   ├── (tabs)/                  # Tab navigation (main app)
│   │   ├── _layout.tsx          # Tab bar configuration
│   │   ├── index.tsx            # Home/Feed screen (auto-refreshes notifications)
│   │   ├── favorites.tsx        # Favorites screen
│   │   └── settings.tsx         # Settings screen
│   ├── onboarding/              # Onboarding flow (4 steps)
│   │   ├── _layout.tsx          # Onboarding stack navigation
│   │   ├── language.tsx         # Step 1: Language selection + initialization
│   │   ├── categories.tsx       # Step 2: Category selection (min 5)
│   │   ├── difficulty.tsx       # Step 3: Difficulty selection
│   │   ├── notifications.tsx    # Step 4: Permissions + scheduling
│   │   └── success.tsx          # Step 5: Completion screen
│   ├── fact/[id].tsx            # Dynamic fact detail screen
│   ├── paywall.tsx              # Subscription paywall
│   └── settings/
│       └── categories.tsx       # Category management
├── src/
│   ├── components/              # Reusable UI components
│   │   ├── ads/                 # Ad components (Banner, Interstitial)
│   │   ├── settings/            # Settings-specific components
│   │   ├── Button.tsx
│   │   ├── CategoryCard.tsx
│   │   ├── FactCard.tsx
│   │   ├── ProgressIndicator.tsx
│   │   └── ...
│   ├── contexts/                # React Context providers
│   │   ├── OnboardingContext.tsx   # Onboarding state management
│   │   ├── SubscriptionContext.tsx # IAP & subscription state
│   │   └── index.ts
│   ├── services/                # Business logic & API layer
│   │   ├── api.ts               # Backend API client
│   │   ├── database.ts          # SQLite operations & migrations
│   │   ├── notifications.ts     # Notification scheduling system
│   │   └── onboarding.ts        # Onboarding orchestration
│   ├── i18n/                    # Internationalization
│   │   ├── config.ts            # i18n setup
│   │   ├── translations.ts      # 8 language translations
│   │   └── useTranslation.tsx   # Translation hook
│   ├── theme/                   # Design system
│   │   ├── tokens.ts            # Design tokens
│   │   └── ThemeProvider.tsx    # Theme context
│   ├── config/
│   │   └── ads.ts               # AdMob configuration
│   └── utils/
│       └── iconMapper.tsx       # Icon mapping utilities
├── assets/                      # Static assets (images, icons)
├── android/                     # Native Android project
├── ios/                         # Native iOS project
├── FLOWS.md                     # Comprehensive app flow documentation
├── app.json                     # Expo configuration
└── package.json                 # Dependencies and scripts
```

## Key Architecture Patterns

### 1. File-Based Routing (Expo Router)
- Routes are defined by file structure in `app/` directory
- `(tabs)` for tab navigation
- `[id]` for dynamic routes
- `_layout.tsx` for nested layouts

### 2. State Management
- **React Context API** for global state (Onboarding, Subscription)
- **Local state** with useState for component-specific state
- **AsyncStorage** for persistence
- **SQLite** for structured data

### 3. Data Layer Architecture
```
UI Components
    ↓
Context Providers (OnboardingContext, SubscriptionContext)
    ↓
Service Layer (api.ts, database.ts, notifications.ts, onboarding.ts)
    ↓
Storage Layer (SQLite, AsyncStorage, SecureStore)
```

### 4. Database Schema (SQLite)

**Categories Table**:
```sql
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  color_hex TEXT
);
```

**Content Types Table**:
```sql
CREATE TABLE content_types (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT
);
```

**Facts Table**:
```sql
CREATE TABLE facts (
  id INTEGER PRIMARY KEY,
  title TEXT,
  content TEXT NOT NULL,
  summary TEXT,
  difficulty TEXT,
  content_type TEXT,
  category TEXT,
  tags TEXT,              -- JSON string
  source_url TEXT,
  reading_time INTEGER,
  word_count INTEGER,
  image_url TEXT,
  language TEXT NOT NULL,
  created_at TEXT NOT NULL,

  -- Notification scheduling (migration v1)
  scheduled_date TEXT,    -- ISO date when notification fires
  notification_id TEXT    -- Expo notification ID
);

CREATE INDEX idx_facts_language ON facts(language);
CREATE INDEX idx_facts_category ON facts(category);
CREATE INDEX idx_facts_scheduled_date ON facts(scheduled_date);
```

### 5. Internationalization (i18n)

**Supported Languages**:
- English (en) 🇬🇧
- German (de) 🇩🇪
- Spanish (es) 🇪🇸
- French (fr) 🇫🇷
- Japanese (ja) 🇯🇵
- Korean (ko) 🇰🇷
- Turkish (tr) 🇹🇷
- Chinese (zh) 🇨🇳

**Usage**:
```typescript
import { useTranslation } from '../src/i18n/useTranslation';

const { t, locale, setLocale } = useTranslation();
const text = t('key.path');
```

**Storage**: `@app_locale` in AsyncStorage

## Critical Business Rules

### Onboarding Flow (MANDATORY)
1. **Notification Permissions are REQUIRED** - No skip option
2. **Sequential Steps** - Users must complete all steps in order
3. **Database Must be Populated** - Onboarding only completes after facts downloaded
4. **Minimum 5 Categories** - Users must select at least 5 categories
5. **Background Downloads** - Facts download on difficulty screen, navigate immediately

### Notification System
- **iOS Limit**: Maximum 64 scheduled notifications
- **Auto-Refresh**: App tops up to 64 on every launch if < 64
- **Random Selection**: Facts selected randomly from unscheduled pool
- **Database Tracking**: Each scheduled fact has `scheduled_date` and `notification_id`

## Important Files

### Must Read Before Changes
- **[FLOWS.md](FLOWS.md)**: Comprehensive documentation of entire app flow (1168 lines)
- **[app/_layout.tsx](app/_layout.tsx)**: Root layout with onboarding check
- **[src/contexts/OnboardingContext.tsx](src/contexts/OnboardingContext.tsx)**: Onboarding state management
- **[src/services/database.ts](src/services/database.ts)**: All SQLite operations

### Core Services
- **[src/services/api.ts](src/services/api.ts)**: Backend API communication
- **[src/services/notifications.ts](src/services/notifications.ts)**: Notification scheduling logic
- **[src/services/onboarding.ts](src/services/onboarding.ts)**: Onboarding orchestration

## Development Guidelines

### When Making Changes

1. **Always Read FLOWS.md First**
   - Contains detailed documentation of onboarding flow
   - Includes error handling, state management, and edge cases
   - Has testing checklists and common mistakes to avoid

2. **Use Context, Not Route Params**
   - Onboarding state is managed via `OnboardingContext`
   - Never pass sensitive data via route params
   - Example:
     ```typescript
     import { useOnboarding } from '../../src/contexts';
     const { selectedCategories, setSelectedCategories } = useOnboarding();
     ```

3. **Database Operations**
   - Always use transactions for multi-record operations
   - Never hardcode categories or content types
   - Always check migration status on schema changes

4. **Notifications**
   - Respect iOS 64-notification limit
   - Always update database when scheduling/canceling
   - Use `scheduleInitialNotifications()` for onboarding
   - Use `refreshNotificationSchedule()` for auto-refresh

5. **i18n**
   - Never hardcode user-facing strings
   - Always use `t('key')` from useTranslation hook
   - Add translations for all 8 supported languages
   - Set locale immediately on language selection

6. **Error Handling**
   - Use native Alert for critical errors (permission denials)
   - Show inline errors for recoverable issues
   - Always provide retry mechanisms
   - Log errors to console for debugging

### Common Commands

```bash
# Start development server
bun start

# Run on iOS
bun ios

# Run on Android
bun android

# Run on web
bun web
```

### TypeScript Configuration
- **Strict mode enabled**: All code must pass strict TypeScript checks
- **Extends**: expo/tsconfig.base

## API Integration

### Backend Configuration
- Base URL: Configured in `app.json` extra config
- Device Authentication: Via `device_key` stored in SecureStore
- Endpoints used in `src/services/api.ts`

### Key API Calls
1. `POST /api/devices/register` - Register device, get device_key
2. `GET /api/metadata?language={locale}` - Fetch categories and content types
3. Fact downloads - Details in api.ts service

## AdMob Integration

### Ad Types
- **Banner Ads**: Home screen, modal screens
- **Interstitial Ads**: Between screens
- **Configuration**: `src/config/ads.ts`

### Ad Unit IDs
- Separate IDs for iOS and Android
- Separate IDs for home banner, modal banner, interstitial
- Configured in `app.json` extra config

## In-App Purchases

### Subscription Management
- Context: `SubscriptionContext`
- Provider: expo-iap
- Manages premium subscription state
- Integration throughout app for premium features

## Common Tasks

### Adding a New Onboarding Step
1. Read FLOWS.md thoroughly
2. Add route file in `app/onboarding/`
3. Update OnboardingContext if state needed
4. Update progress indicators (x/4 → x/5)
5. Test entire flow end-to-end

### Adding a New Translation
1. Open `src/i18n/translations.ts`
2. Add key to all 8 language objects
3. Use consistent dot notation (e.g., `onboarding.welcome.title`)
4. Test with each language setting

### Modifying Database Schema
1. Update schema in `src/services/database.ts`
2. Increment migration version
3. Add migration logic in `runMigrations()`
4. Test fresh install AND migration from old version
5. Update FLOWS.md if schema affects documented behavior

### Adding a New Screen
1. Create file in appropriate `app/` directory
2. Use existing components from `src/components/`
3. Follow Tamagui component patterns
4. Add navigation logic if needed
5. Test on both iOS and Android

## Testing Considerations

### Manual Testing Checklist
- Fresh install flow (delete app, reinstall)
- Onboarding completion
- Notification permissions (grant, deny, settings change)
- Language switching
- Both iOS and Android platforms
- Background app behaviors
- Notification scheduling and delivery

### Critical Paths to Test
1. Complete onboarding flow (language → categories → difficulty → notifications → success)
2. Permission denial and recovery
3. Network failure during initialization or download
4. App restart during onboarding
5. Notification auto-refresh on app launch

## Common Pitfalls (Avoid These)

❌ **DON'T**: Add skip button for notification permissions
❌ **DON'T**: Allow < 5 categories during onboarding
❌ **DON'T**: Pass onboarding data via route params
❌ **DON'T**: Hardcode translations or categories
❌ **DON'T**: Schedule > 64 notifications on iOS
❌ **DON'T**: Mark onboarding complete without facts in database
❌ **DON'T**: Forget to set locale immediately on language selection
❌ **DON'T**: Wait for download completion before navigating from difficulty screen
❌ **DON'T**: Use database writes without transactions
❌ **DON'T**: Forget to check `isInitialized` before accessing categories

✅ **DO**: Read FLOWS.md before making changes
✅ **DO**: Use OnboardingContext for state management
✅ **DO**: Test both iOS and Android
✅ **DO**: Add loading states for async operations
✅ **DO**: Handle errors gracefully with retry options
✅ **DO**: Use transactions for database operations
✅ **DO**: Respect platform-specific behavior (iOS notification limit)
✅ **DO**: Test offline scenarios
✅ **DO**: Update both code and FLOWS.md documentation

## Environment & Configuration

### Important Config Files
- **[app.json](app.json)**: Expo configuration, API URLs, AdMob IDs
- **[package.json](package.json)**: Dependencies, scripts
- **[tsconfig.json](tsconfig.json)**: TypeScript configuration
- **[.env](.env)**: Environment variables (gitignored)

### Build Configuration
- Android: Kotlin 2.1.20
- iOS: Standard Expo configuration
- New Architecture: Enabled
- Plugins: Google Mobile Ads, Expo IAP, Build Properties

## Performance Considerations

1. **Database Indexing**: Facts table indexed on language, category, scheduled_date
2. **Batch Operations**: Schedule all 64 notifications in single operation
3. **Background Downloads**: Non-blocking fact downloads during onboarding
4. **Lazy Loading**: Components load data as needed
5. **Image Optimization**: Consider image loading strategies for fact images

## Future Development Areas

See FLOWS.md "Future Considerations" section for planned features:
- Background fact refresh
- Fact favorites/bookmarks
- Sharing functionality
- Offline mode indicator
- Re-onboarding (preference changes)
- Notification interaction tracking
- Analytics

## Resources

### Documentation
- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [Tamagui Documentation](https://tamagui.dev/)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)

### Key Decisions & Rationale
See FLOWS.md "Key Technical Decisions" section for:
- Why SQLite for local storage
- Why SecureStore for device key
- Why AsyncStorage for preferences
- Why background download on difficulty screen
- Why 64 scheduled notifications

## Quick Reference

### Get Onboarding State
```typescript
import { useOnboarding } from '../src/contexts';
const { selectedCategories, difficulty, notificationTime, isInitialized } = useOnboarding();
```

### Translation
```typescript
import { useTranslation } from '../src/i18n/useTranslation';
const { t, locale, setLocale } = useTranslation();
```

### Database Query
```typescript
import * as database from '../src/services/database';
const facts = await database.getRandomUnscheduledFacts(64, locale);
```

### Schedule Notifications
```typescript
import * as notificationService from '../src/services/notifications';
const result = await notificationService.scheduleInitialNotifications(time, locale);
```

---

**Last Updated**: 2025-11-12
**Version**: 1.0.0
**For Questions**: Refer to FLOWS.md for detailed flow documentation
