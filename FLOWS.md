# Facts A Day - App Flows Documentation

## Overview
Facts A Day is a React Native app built with Expo that delivers daily interesting facts to users based on their preferences.

## Critical Rules

### 🚨 MANDATORY REQUIREMENTS
1. **Notification Permissions are REQUIRED** - Users MUST grant notification permissions to complete onboarding
2. **No Skip Option** - There is NO way to skip notification permissions
3. **Onboarding is Sequential** - Users must complete all steps in order
4. **Database Must be Populated** - Onboarding only completes AFTER all facts are successfully downloaded and stored

---

## App Architecture

### Storage Layer
- **AsyncStorage**: User preferences, onboarding status
- **SQLite**: Categories, content types, facts (local database)
- **Expo SecureStore**: Device authentication key (encrypted)

### Key Services
- `src/services/onboarding.ts` - Onboarding orchestration
- `src/services/api.ts` - Backend API communication
- `src/services/database.ts` - SQLite operations

---

## Complete Onboarding Flow

### Flow Diagram
```
App Launch
    ↓
Check Onboarding Status (AsyncStorage)
    ↓
    ├─ Complete → Main App
    └─ Not Complete → Onboarding Flow
                          ↓
                    [Step 1] Language Selection
                          ↓
                    User selects preferred language
                          ↓
                    Set locale immediately
                          ↓
                    User clicks Continue
                          ↓
                    Initialize Onboarding (in background):
                      - Show loading state
                      - Register Device
                      - Fetch Metadata (categories, content_types)
                      - Store in SQLite
                          ↓
                    ├─ Error → Show error, allow retry
                    └─ Success → Navigate to Categories
                          ↓
                    [Step 2] Categories Selection
                          ↓
                    User selects interests (minimum 5)
                          ↓
                    [Step 3] Difficulty Selection
                          ↓
                    User selects difficulty level
                          ↓
                    [Step 4] Notifications (REQUIRED)
                          ↓
                    Set notification time preference
                          ↓
                    Request Notification Permissions
                          ↓
                    ├─ Denied → Show Alert, Block Progress
                    └─ Granted → Download Facts & Complete
                                      ↓
                                Download all facts with progress
                                      ↓
                                Mark Complete in AsyncStorage
                                      ↓
                                Navigate to Main App
```

### Step-by-Step Details

#### Step 1: Language Selection & Initialization (`/onboarding/language`)
**Purpose**: Allow users to select their preferred language and initialize the app

**UI Elements**:
- Progress: 1/4
- 3-column grid of language cards
- Each card shows:
  - Flag emoji
  - Language name in native script
- 8 supported languages: English, German, Spanish, French, Japanese, Korean, Turkish, Chinese
- Continue button (always enabled, uses current locale as default)
- Loading spinner (shown during initialization)
- Error message (shown if initialization fails)

**Process**:
1. Display language options in 3-column grid layout
2. User selects a language by tapping card
3. **Immediately set locale** using `setLocale(languageCode)` on selection
4. UI updates in real-time to show selected language
5. User clicks Continue button
6. **Initialization starts** (via `initializeOnboarding(selectedLanguage)`):
   - Button shows "Getting Ready..." and disables
   - Loading spinner appears below button
   - Backend calls:
     - Get device information (platform, model, OS version, language)
     - Call `POST /api/devices/register` with device info
     - Receive and store `device_key` in SecureStore
     - Call `GET /api/metadata?language={locale}`
     - Store categories and content_types in SQLite
7. On success → Navigate to `/onboarding/categories`
8. On error → Show error message with retry instructions

**Languages**:
- 🇬🇧 English (en)
- 🇩🇪 German (de)
- 🇪🇸 Spanish (es)
- 🇫🇷 French (fr)
- 🇯🇵 Japanese (ja)
- 🇰🇷 Korean (ko)
- 🇹🇷 Turkish (tr)
- 🇨🇳 Chinese (zh)

**Validation**:
- No validation required - defaults to current system locale
- User can select any language regardless of system settings

**Error Handling**:
- Network errors → Show error message: "Check your internet connection"
- API errors → Display error with retry instructions
- User can click Continue again to retry

**Storage**:
- AsyncStorage: `@app_locale` (automatically saved by i18n system)
- SecureStore: `device_key` (saved during initialization)
- SQLite: `categories` table, `content_types` table (saved during initialization)

**State Management**:
- Uses `OnboardingContext` for state management
- `isInitializing`: Controls loading state
- `initializationError`: Stores error message if initialization fails
- `isInitialized`: Tracks whether initialization completed successfully

**Navigation**:
```javascript
// On successful initialization
router.push('/onboarding/categories');
```

---

#### Step 2: Categories (`/onboarding/categories`)
**Purpose**: Let users select categories they're interested in

**UI Elements**:
- Progress: 2/4
- Grid of category cards (3 per row)
- Each card shows icon + category name
- Multiple selection allowed
- Continue button (disabled until at least 5 categories selected)

**Process**:
1. Check if onboarding is initialized (guard redirect if not)
2. Load categories from SQLite
3. Display as grid with Lucide icons
4. User selects at least 5 categories
5. Categories stored in `OnboardingContext`

**Validation**:
- At least 5 categories must be selected
- Categories are loaded from database (not hardcoded)
- Redirects to language screen if initialization not complete

**State Management**:
- Uses `OnboardingContext` for state management
- `selectedCategories`: Array of selected category slugs
- `setSelectedCategories`: Updates selected categories
- `isInitialized`: Guards against accessing screen before initialization

**Navigation**:
```javascript
// No params needed - using context
router.push('/onboarding/difficulty');
```

---

#### Step 3: Difficulty (`/onboarding/difficulty`)
**Purpose**: Let users select their preferred fact complexity

**UI Elements**:
- Progress: 3/4
- 4 option cards:
  - Beginner: "Simple and easy-to-understand facts"
  - Intermediate: "Moderately detailed and engaging facts"
  - Advanced: "In-depth and complex facts"
  - All Levels: "Mix of all difficulty levels" (default)
- Continue button (always enabled, defaults to "all")

**Process**:
1. Display difficulty options
2. User selects one option (default: "all")
3. Difficulty stored in `OnboardingContext`

**State Management**:
- Uses `OnboardingContext` for state management
- `difficulty`: Selected difficulty level
- `setDifficulty`: Updates difficulty preference

**Navigation**:
```javascript
// No params needed - using context
router.push('/onboarding/notifications');
```

---

#### Step 4: Notifications (`/onboarding/notifications`) ⚠️ CRITICAL
**Purpose**: Request notification permissions and set notification time preference

**🚨 MANDATORY REQUIREMENTS**:
- Users MUST grant notification permissions
- NO skip option
- Notifications are REQUIRED to complete onboarding

**UI Elements**:
- Progress: 4/4
- Bell icon in circular container
- Time picker for notification preference:
  - iOS: Inline spinner picker
  - Android: Button that opens time picker dialog
- Default time: 9:00 AM
- "Enable Notifications" button (always enabled)
- NO skip button

**Process**:
1. **Component Mount**: Display notification time picker with default time (9:00 AM)

2. **User Interaction**:
   - User can adjust notification time using picker
   - iOS: Inline spinner picker
   - Android: Tapping button opens native time picker dialog

3. **Permission Request Flow**:
   - User clicks "Enable Notifications" button
   - Call `Notifications.requestPermissionsAsync()`
   - If DENIED → Show Alert with brief message directing to Settings
   - If GRANTED → Navigate to success screen with preferences

4. **Navigation on Success**:
   ```javascript
   // No params needed - using context
   router.push('/onboarding/success');
   ```

**State Management**:
- Uses `OnboardingContext` for state management
- `notificationTime`: User's preferred notification time
- `setNotificationTime`: Updates notification time preference
- All preferences (categories, difficulty, notificationTime) stored in context

**Error States**:
1. **Permission Denied**:
   - Show Alert with title: "Notification Permission Required"
   - Message: Brief instructions directing user to Settings > Facts A Day > Notifications
   - Alert has single "OK" button to dismiss
   - User remains on notifications screen
   - User MUST grant permissions to proceed
   - No alternative path or skip option

**Storage**:
- Notification time preference is passed to success screen via navigation params
- No direct storage happens on this screen

---

## Main App Flow

### App Launch Logic (`/app/_layout.tsx`)

```
App Starts
    ↓
Check AsyncStorage: @onboarding_complete
    ↓
    ├─ "true" → Show Main App
    └─ not "true" → Redirect to /onboarding
```

**Navigation Rules**:
1. If onboarding incomplete AND not in onboarding → Redirect to `/onboarding/language`
2. If onboarding complete AND in onboarding → Redirect to `/` (main app)
3. Otherwise → Stay on current screen

---

## Data Flow

### Onboarding Data Pipeline

```
Language Selection → AsyncStorage (@app_locale)
    ↓
Backend API
    ↓
Device Registration → SecureStore (device_key)
    ↓
Metadata Fetch → SQLite (categories, content_types)
    ↓
User Preferences → AsyncStorage (categories, difficulty)
    ↓
Notification Permission Request
    ↓
Success Screen → Facts Download → SQLite (facts table)
    ↓
Completion Flag → AsyncStorage (@onboarding_complete)
```

### Database Schema

#### Categories Table
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

#### Content Types Table
```sql
CREATE TABLE content_types (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT
);
```

#### Facts Table
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
  created_at TEXT NOT NULL
);
```

---

## Error Handling Principles

### Onboarding Errors

1. **Initialization Errors**:
   - Network failure → Retry button
   - API error → Show message + retry
   - Never proceed without metadata

2. **Download Errors**:
   - Network failure → Auto-retry (3 attempts, exponential backoff)
   - API error → Show error, manual retry
   - Never mark onboarding complete without facts

3. **Permission Errors**:
   - User denial → Show explanation, require approval
   - System error → Show error message
   - NO alternative path - MUST grant permissions

### Fail-Safe Mechanisms

1. **Transaction-Based Writes**:
   ```javascript
   await database.withTransactionAsync(async () => {
     // All inserts here
   });
   // Either all succeed or all rollback
   ```

2. **Retry Logic**:
   ```javascript
   async function getAllFactsWithRetry(maxRetries = 3) {
     for (let attempt = 0; attempt < maxRetries; attempt++) {
       try {
         return await getAllFacts();
       } catch (error) {
         if (attempt === maxRetries - 1) throw error;
         await sleep(1000 * Math.pow(2, attempt)); // Exponential backoff
       }
     }
   }
   ```

3. **State Validation**:
   - Never mark onboarding complete if facts count = 0
   - Always verify database writes succeeded
   - Check both permission AND download before proceeding

---

## Key Technical Decisions

### Why SQLite for Local Storage?
- Efficient querying for facts display
- Supports complex filtering (category, difficulty, language)
- Transaction support for data integrity
- Works offline after initial download

### Why SecureStore for Device Key?
- Encrypted storage for authentication token
- Required for all API calls
- Persists across app restarts

### Why AsyncStorage for Preferences?
- Simple key-value storage
- Fast access for app launch checks
- User preferences don't require encryption

### Why Background Download on Notifications Screen?
- Better UX - user reads about notifications while downloading
- Perceived faster onboarding
- Can show progress during permission request

---

## State Management

### OnboardingContext Architecture

The app uses React Context API for centralized onboarding state management. All onboarding screens access shared state through the `useOnboarding()` hook.

**Context Provider**:
```tsx
<OnboardingProvider>
  {/* All onboarding screens have access to context */}
</OnboardingProvider>
```

**State Structure**:
```typescript
interface OnboardingState {
  // User selections
  selectedCategories: string[];
  difficulty: DifficultyLevel;
  notificationTime: Date;

  // Initialization state
  isInitialized: boolean;
  isInitializing: boolean;
  initializationError: string | null;

  // Facts download state
  isDownloadingFacts: boolean;
  downloadProgress: {
    downloaded: number;
    total: number;
    percentage: number;
  } | null;
  downloadError: string | null;
}
```

**Available Methods**:
- `setSelectedCategories(categories: string[])` - Update selected categories
- `setDifficulty(difficulty: DifficultyLevel)` - Update difficulty preference
- `setNotificationTime(time: Date)` - Update notification time
- `initializeOnboarding(locale: SupportedLocale)` - Register device and fetch metadata
- `retryInitialization()` - Retry initialization with last used locale
- `downloadFacts(locale: SupportedLocale)` - Download facts with progress tracking
- `completeOnboarding()` - Save preferences and mark onboarding complete
- `resetOnboarding()` - Reset all state

**Benefits**:
- ✅ No route params needed - all state in context
- ✅ Automatic state synchronization across screens
- ✅ Built-in loading and error states
- ✅ Type-safe state management
- ✅ Easy to test and debug

**Usage Example**:
```tsx
import { useOnboarding } from '../../src/contexts';

function CategoryScreen() {
  const { selectedCategories, setSelectedCategories, isInitialized } = useOnboarding();

  // Guard: redirect if not initialized
  if (!isInitialized) {
    router.replace('/onboarding/language');
  }

  // Use state and methods
  const toggleCategory = (slug: string) => {
    setSelectedCategories(
      selectedCategories.includes(slug)
        ? selectedCategories.filter(s => s !== slug)
        : [...selectedCategories, slug]
    );
  };
}
```

---

## File Structure

```
app/
├── _layout.tsx                    # Root layout with onboarding check & OnboardingProvider
├── index.tsx                      # Main app (after onboarding)
└── onboarding/
    ├── _layout.tsx                # Onboarding stack navigation
    ├── language.tsx               # Step 1: Language selection + initialization
    ├── categories.tsx             # Step 2: Category selection (min 5)
    ├── difficulty.tsx             # Step 3: Difficulty selection
    ├── notifications.tsx          # Step 4: Permissions + Time preference
    └── success.tsx                # Download screen + Completion

src/
├── contexts/
│   ├── OnboardingContext.tsx     # Centralized onboarding state management
│   └── index.ts                  # Context exports
├── services/
│   ├── onboarding.ts             # Onboarding orchestration
│   ├── api.ts                    # Backend API client
│   └── database.ts               # SQLite operations
├── components/
│   ├── CategoryCard.tsx          # Category selection card
│   ├── ProgressIndicator.tsx    # Step progress (1/4, 2/4, 3/4, 4/4)
│   └── Button.tsx                # Primary/secondary buttons
├── i18n/
│   ├── config.ts                 # i18n configuration
│   ├── translations.ts           # Translation strings (8 languages)
│   └── useTranslation.tsx        # Translation hook
└── theme/
    └── tokens.ts                 # Design tokens
```

---

## Testing Checklist

### Happy Path
- [ ] Fresh install → Language selection → Initialize on Continue → Complete → Main App
- [ ] Language selection → Select language → UI updates immediately
- [ ] Language selection → Click Continue → Initialization starts (loading state shown)
- [ ] Initialization → Device registered → Metadata fetched → Navigate to categories
- [ ] Categories selection → At least 5 selected → Can proceed
- [ ] Difficulty selection → Default "all"
- [ ] Notifications → Set time → Grant permission → Navigate to success
- [ ] Success screen → Facts download → Progress shown → Complete
- [ ] Relaunch → Goes to Main App in selected language

### Error Paths
- [ ] Language screen → Network failure on Continue → Error shown with retry instructions
- [ ] Language screen → Click Continue again → Retry initialization works
- [ ] Categories: Access before initialization → Redirects to language screen
- [ ] Categories: Less than 5 selected → Button disabled
- [ ] Permission denied → Alert shown directing to Settings
- [ ] Permission denied multiple times → Still blocks progress
- [ ] Kill app during download → Restart from language selection

### Edge Cases
- [ ] No network → Clear error messages on language screen after Continue click
- [ ] Slow network → Loading state shown during initialization
- [ ] Language selection → All 8 languages display correctly
- [ ] Language changes immediately reflect in UI
- [ ] Backend returns 0 facts → Error shown on success screen
- [ ] User denies then grants permission → Works correctly
- [ ] Database write fails → Transaction rollback
- [ ] Time picker works on both iOS and Android
- [ ] Context state persists across screen navigation
- [ ] Guards prevent accessing categories before initialization

---

## Common Mistakes to Avoid

1. ❌ **Skipping language selection step** → Must be first step in onboarding
2. ❌ **Not setting locale immediately** → Users expect real-time UI updates
3. ❌ **Not triggering initialization on language screen** → Must call `initializeOnboarding()` on Continue
4. ❌ **Passing data via route params** → Use `OnboardingContext` instead
5. ❌ **Not checking `isInitialized` in categories screen** → Add guard to prevent access before init
6. ❌ **Adding a skip button for notifications** → Notifications are REQUIRED
7. ❌ **Allowing less than 5 categories** → Minimum requirement is 5 categories
8. ❌ **Using inline error boxes for permission denial** → Use native Alert instead
9. ❌ **Not using transactions for database writes** → Data corruption risk
10. ❌ **Hardcoding categories or translations** → Must load from database/i18n system
11. ❌ **Forgetting to clear state on errors** → Can cause UI bugs
12. ❌ **Not showing download progress** → Poor UX
13. ❌ **Allowing onboarding completion with 0 facts** → App won't work
14. ❌ **Not showing loading state during initialization** → Users may think app is frozen

---

## Future Considerations

### Potential Enhancements
- Background fact refresh
- Push notification scheduling
- Fact favorites/bookmarks
- Sharing functionality
- Offline mode indicator
- Re-onboarding (change preferences)
- Analytics tracking

### Migration Strategy
If onboarding flow changes:
1. Version the onboarding state in AsyncStorage
2. Handle migration from old → new flow
3. Don't break existing completed users
