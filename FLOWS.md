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
                    User clicks Continue
                          ↓
                    Start downloading facts in BACKGROUND (non-blocking)
                          ↓
                    Navigate to Notifications immediately
                          ↓
                    [Step 4] Notifications (REQUIRED)
                          ↓
                    Facts continue downloading in background
                          ↓
                    Set notification time preference
                          ↓
                    User clicks "Enable Notifications"
                          ↓
                    Request Notification Permissions IMMEDIATELY
                          ↓
                    ├─ Denied → Show Alert, Block Progress
                    └─ Granted → Start Scheduling Process
                                      ↓
                                Show loading: "Getting your app ready..."
                                      ↓
                                ├─ Still Downloading → Wait for download to complete
                                └─ Download Complete → Continue immediately
                                      ↓
                                Schedule 64 Notifications
                                      ↓
                                      ├─ Scheduling Failed → Show Alert, Allow Retry
                                      └─ Scheduling Success → Navigate to Success
                                                ↓
                                          [Step 5] Success Screen
                                                ↓
                                          Show "All Set!" message
                                                ↓
                                          Save preferences to AsyncStorage
                                                ↓
                                          Mark Complete in AsyncStorage
                                                ↓
                                          Navigate to Main App
                                                ↓
                                          Main App: Auto-refresh notifications if < 64
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
router.push("/onboarding/categories");
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
router.push("/onboarding/difficulty");
```

---

#### Step 3: Difficulty (`/onboarding/difficulty`)

**Purpose**: Let users select their preferred fact complexity and trigger background fact download

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
4. **User clicks Continue**:
   - Triggers `downloadFacts(locale)` in background (non-blocking)
   - Immediately navigates to notifications screen
   - Facts download continues in background while user sets notification time

**Background Download**:

- Download starts when user clicks Continue
- Does NOT wait for download to complete before navigation
- Progress tracked via `OnboardingContext`:
  - `isDownloadingFacts`: Boolean indicating download in progress
  - `downloadProgress`: Object with downloaded/total/percentage
  - `downloadError`: Error message if download fails

**State Management**:

- Uses `OnboardingContext` for state management
- `difficulty`: Selected difficulty level
- `setDifficulty`: Updates difficulty preference
- `downloadFacts`: Triggers background fact download

**Navigation**:

```javascript
// Start background download, then navigate immediately
downloadFacts(locale);
router.push("/onboarding/notifications");
```

---

#### Step 4: Notifications (`/onboarding/notifications`) ⚠️ CRITICAL

**Purpose**: Request notification permissions, set notification time, and schedule 64 daily notifications

**🚨 MANDATORY REQUIREMENTS**:

- Users MUST grant notification permissions
- NO skip option
- Notifications are REQUIRED to complete onboarding
- App schedules 64 notifications (iOS limit) with random facts

**UI Elements**:

- Progress: 4/4
- Bell icon in circular container
- Time picker for notification preference:
  - iOS: Inline spinner picker
  - Android: Button that opens time picker dialog
- Default time: 9:00 AM
- **Button states**:
  - Normal: "Enable Notifications" (always clickable when not scheduling)
  - Loading: "Getting your app ready..." with spinner (only during scheduling)
- NO skip button

**Process**:

1. **Component Mount**:

   - Facts may still be downloading from previous screen
   - Display notification time picker with default time (9:00 AM)
   - Button is always enabled (user can click whenever ready)

2. **User Interaction**:

   - User can adjust notification time using picker
   - iOS: Inline spinner picker
   - Android: Tapping button opens native time picker dialog
   - User clicks "Enable Notifications" button (clickable even if facts still downloading)

3. **Permission Request & Scheduling Flow**:

   - **Step 1**: Request permissions IMMEDIATELY (don't wait for download)
     - Call `Notifications.requestPermissionsAsync()`
   - If DENIED → Show Alert directing to Settings, stay on screen
   - If GRANTED:
     - **Step 2**: Start scheduling process (show loading state)
     - **Step 3**: Wait for download if still in progress
       - If `isDownloadingFacts` → Call `waitForDownloadComplete()`
       - If download complete → Continue immediately
     - **Step 4**: Schedule 64 notifications with random facts:
       - Each notification set for selected time on consecutive days
       - Starts today if selected time hasn't passed yet, otherwise tomorrow
       - Uses `scheduleInitialNotifications(notificationTime, locale)`
       - Stores notification IDs and scheduled dates in database
     - If scheduling SUCCEEDS → Navigate to success screen
     - If scheduling FAILS → Show Alert, allow retry

4. **Navigation on Success**:
   ```javascript
   // After successful notification scheduling
   router.push("/onboarding/success");
   ```

**Button Behavior**:

```typescript
// Button is always clickable when not scheduling
{
  loading: isScheduling,
  disabled: isScheduling,
  text: isScheduling ? "Getting your app ready..." : "Enable Notifications"
}
```

**Flow Details**:

```typescript
const handleEnableNotifications = async () => {
  // Step 1: Request permission immediately (don't wait for download)
  const { status } = await Notifications.requestPermissionsAsync();

  if (status !== "granted") {
    // Show alert, stay on screen
    return;
  }

  // Step 2: Permission granted - start scheduling
  setIsScheduling(true);

  // Step 3: Wait for download if still in progress
  if (isDownloadingFacts) {
    await waitForDownloadComplete();
  }

  // Step 4: Schedule notifications
  const result = await scheduleInitialNotifications(notificationTime, locale);

  if (result.success) {
    router.push("/onboarding/success");
  } else {
    setIsScheduling(false);
    // Show error alert
  }
};
```

**Notification Scheduling Details**:

- **Count**: 64 notifications (iOS limit)
- **Selection**: Random facts from downloaded facts (not yet scheduled)
- **Timing**: Daily at user's selected time, starting today if selected time hasn't passed yet, otherwise tomorrow
- **Storage**: Each fact marked with:
  - `scheduled_date`: ISO date when notification fires
  - `notification_id`: Expo notification ID for cancellation
- **Database Query**: Uses `getRandomUnscheduledFacts(64, locale)`

**State Management**:

- Uses `OnboardingContext` for state management
- `notificationTime`: User's preferred notification time
- `setNotificationTime`: Updates notification time preference
- `isDownloadingFacts`: Tracks if facts still downloading from difficulty screen
- `waitForDownloadComplete`: Async method to wait until download finishes
- Local state: `isScheduling`: Tracks notification scheduling progress (waiting + scheduling)

**Error States**:

1. **Permission Denied**:

   - Show Alert with title: "Notification Permission Required"
   - Message: Brief instructions directing user to Settings > Facts A Day > Notifications
   - User remains on notifications screen
   - User MUST grant permissions to proceed

2. **Scheduling Failed**:
   - Show Alert with title: "Notification Scheduling Failed"
   - Message: "Failed to create notifications. Please try again."
   - User can click button again to retry
   - Does NOT proceed to success screen until scheduling succeeds

**Storage**:

- Database: Facts table updated with `scheduled_date` and `notification_id`
- Notification time saved to AsyncStorage on success screen
- All preferences (categories, difficulty, notificationTime) in context

---

#### Step 5: Success Screen (`/onboarding/success`)

**Purpose**: Show completion confirmation and finalize onboarding

**UI Elements**:

- Green checkmark icon in circular container
- "All Set!" heading
- "Welcome to Facts A Day!" subheading
- "Complete! Redirecting you to the app..." message
- No interactive elements (auto-navigates)

**Process**:

1. **Component Mount**:

   - Call `completeOnboarding()` from context:
     - Saves selected categories to AsyncStorage
     - Saves difficulty preference to AsyncStorage
     - Saves notification time to AsyncStorage
     - Sets `@onboarding_complete` flag to "true"
   - Show success message for 2 seconds
   - Auto-navigate to main app

2. **Navigation**:
   ```javascript
   // After 2 second delay
   router.replace("/");
   ```

**What Happens Here**:

- ✅ Facts already downloaded (from difficulty screen)
- ✅ Notifications already scheduled (from notifications screen)
- ✅ Just saves final preferences and marks onboarding complete
- ✅ Simple success confirmation for user

**State Management**:

- Uses `OnboardingContext.completeOnboarding()`
- Saves all preferences to AsyncStorage:
  - `@selected_categories`: Array of category slugs
  - `@difficulty_preference`: Difficulty level
  - `@notification_time`: ISO date string
  - `@onboarding_complete`: "true"

**Timeline**:

- Display success message: 2 seconds
- Then navigate to main app automatically

---

## Main App Flow

### App Launch Logic (`/app/_layout.tsx`)

```
App Starts
    ↓
Check AsyncStorage: @onboarding_complete
    ↓
    ├─ "true" → Show Main App → Auto-refresh notifications
    └─ not "true" → Redirect to /onboarding
```

**Navigation Rules**:

1. If onboarding incomplete AND not in onboarding → Redirect to `/onboarding/language`
2. If onboarding complete AND in onboarding → Redirect to `/` (main app)
3. Otherwise → Stay on current screen

### Notification Auto-Refresh (`/app/index.tsx`)

When the main app loads, it automatically checks and refreshes notifications:

**Process**:

1. **On Component Mount** (`useEffect`):

   - Get count of scheduled notifications from database
   - Check if count < 64

2. **If count < 64**:

   - Get saved notification time from AsyncStorage
   - Call `refreshNotificationSchedule(notificationTime, locale)`:
     - Calculate how many more needed (64 - current count)
     - Get random unscheduled facts from database
     - Schedule notifications starting after last scheduled date
     - Update database with new scheduled facts
   - Log success/failure to console

3. **If count >= 64**:
   - No action needed
   - Log "No refresh needed"

**Benefits**:

- Ensures user always has notifications queued
- Automatically tops up when facts are consumed
- Runs silently in background
- No user interaction required

**Implementation**:

```typescript
const refreshNotificationsIfNeeded = async () => {
  const scheduledCount = await database.getScheduledFactsCount(locale);

  if (scheduledCount < 64) {
    const notificationTime = await onboardingService.getNotificationTime();
    if (notificationTime) {
      const result = await notificationService.refreshNotificationSchedule(
        notificationTime,
        locale
      );
      console.log(`Refreshed ${result.count} notifications`);
    }
  }
};
```

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
Categories Selection → OnboardingContext (in-memory state)
    ↓
Difficulty Selection → OnboardingContext (in-memory state)
    ↓
Difficulty Continue → TRIGGER BACKGROUND DOWNLOAD
    ↓
Facts Download (Background) → SQLite (facts table)
    ↓
Notification Time Selection → OnboardingContext (in-memory state)
    ↓
Permission Request → Notification Permissions
    ↓
Schedule 64 Notifications → SQLite (facts.scheduled_date, facts.notification_id)
    ↓
Navigate to Success Screen
    ↓
Save All Preferences → AsyncStorage:
  - @selected_categories
  - @difficulty_preference
  - @notification_time
  - @onboarding_complete
    ↓
Navigate to Main App
    ↓
Auto-Refresh Notifications (if < 64)
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
  created_at TEXT NOT NULL,

  -- Notification scheduling columns (added in migration v1)
  scheduled_date TEXT,    -- ISO date when notification fires
  notification_id TEXT    -- Expo notification ID
);

-- Indexes for performance
CREATE INDEX idx_facts_language ON facts(language);
CREATE INDEX idx_facts_category ON facts(category);
CREATE INDEX idx_facts_scheduled_date ON facts(scheduled_date);
```

**Database Migrations**:

- Version 1: Added `scheduled_date` and `notification_id` columns
- Migrations run automatically on app start via `PRAGMA user_version`

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

4. **Notification Scheduling Errors**:
   - Scheduling fails → Show Alert with error message
   - Allow user to retry by clicking button again
   - Log error to console for debugging
   - Never proceed to success screen without successful scheduling

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

### Why Background Download on Difficulty Screen?

- Facts download in background while user sets notification time
- Better UX - no waiting on dedicated download screen
- Perceived faster onboarding (happens during user interaction)
- Can show smart button states on notifications screen

### Why 64 Scheduled Notifications?

- iOS limit: Maximum 64 scheduled local notifications
- Daily notifications: Covers ~2 months ahead
- Auto-refresh: App tops up when count drops below 64
- Random selection: Ensures variety in notification content
- Database tracking: Prevents duplicate scheduling

### Notification System Architecture

1. **Initial Scheduling** (Onboarding):

   - Schedule 64 random facts
   - Start today if selected time hasn't passed yet, otherwise tomorrow
   - Store notification ID and scheduled date in database

2. **Auto-Refresh** (Main App Launch):

   - Check scheduled count on every app open
   - If < 64: Top up with more random unscheduled facts
   - Continue from last scheduled date
   - Silent background process

3. **Rescheduling** (Settings):
   - Clear all scheduled notifications
   - Re-schedule 64 facts with new time
   - Maintain random selection

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
- `waitForDownloadComplete()` - Wait until fact download completes (used for scheduling)
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
import { useOnboarding } from "../../src/contexts";

function CategoryScreen() {
  const { selectedCategories, setSelectedCategories, isInitialized } =
    useOnboarding();

  // Guard: redirect if not initialized
  if (!isInitialized) {
    router.replace("/onboarding/language");
  }

  // Use state and methods
  const toggleCategory = (slug: string) => {
    setSelectedCategories(
      selectedCategories.includes(slug)
        ? selectedCategories.filter((s) => s !== slug)
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
│   ├── onboarding.ts             # Onboarding orchestration & AsyncStorage
│   ├── api.ts                    # Backend API client
│   ├── database.ts               # SQLite operations & migrations
│   └── notifications.ts          # Notification scheduling system (NEW)
├── components/
│   ├── CategoryCard.tsx          # Category selection card
│   ├── ProgressIndicator.tsx    # Step progress (1/4, 2/4, 3/4, 4/4)
│   └── Button.tsx                # Primary/secondary buttons (with loading state)
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
- [ ] Difficulty selection → Default "all" → Click Continue
- [ ] Difficulty Continue → Facts download starts in background → Navigates immediately
- [ ] Notifications screen → Button always clickable (shows "Enable Notifications")
- [ ] Notifications → Set time → Click button → Permission dialog appears immediately
- [ ] Notifications → Grant permission → Shows loading "Getting your app ready..."
- [ ] Notifications → Waits for download if still in progress → Then schedules 64 notifications
- [ ] Notifications → Scheduling succeeds → Navigate to success screen
- [ ] Success screen → Shows "All Set!" → Saves preferences → Auto-navigate to main app
- [ ] Main app → Auto-refreshes notifications if < 64 on launch
- [ ] Relaunch → Goes to Main App in selected language

### Error Paths

- [ ] Language screen → Network failure on Continue → Error shown with retry instructions
- [ ] Language screen → Click Continue again → Retry initialization works
- [ ] Categories: Access before initialization → Redirects to language screen
- [ ] Categories: Less than 5 selected → Button disabled
- [ ] Difficulty Continue → Facts download fails → Error shown on notifications screen
- [ ] Notifications → Permission denied → Alert shown directing to Settings, stays on screen
- [ ] Notifications → Permission denied multiple times → Still blocks progress
- [ ] Notifications → Scheduling fails → Alert shown, button allows retry
- [ ] Notifications → Retry scheduling → Works on second attempt
- [ ] Kill app during download → Context state lost, restarts from language selection

### Edge Cases

- [ ] No network → Clear error messages on language screen after Continue click
- [ ] Slow network → Loading state shown during initialization and fact download
- [ ] Slow fact download → Button remains clickable, waits for download after permission granted
- [ ] Language selection → All 8 languages display correctly
- [ ] Language changes immediately reflect in UI
- [ ] Backend returns 0 facts → Error shown, cannot schedule notifications
- [ ] User denies then grants permission → Scheduling works correctly
- [ ] Database write fails → Transaction rollback, safe state
- [ ] Database migration runs on first launch → scheduled_date and notification_id columns added
- [ ] Time picker works on both iOS and Android
- [ ] Context state persists across screen navigation
- [ ] Guards prevent accessing categories before initialization
- [ ] Main app refresh → Only refreshes if < 64 scheduled
- [ ] Main app refresh → Doesn't refresh if already at 64

---

## Common Mistakes to Avoid

1. ❌ **Skipping language selection step** → Must be first step in onboarding
2. ❌ **Not setting locale immediately** → Users expect real-time UI updates
3. ❌ **Not triggering initialization on language screen** → Must call `initializeOnboarding()` on Continue
4. ❌ **Passing data via route params** → Use `OnboardingContext` instead
5. ❌ **Not checking `isInitialized` in categories screen** → Add guard to prevent access before init
6. ❌ **Adding a skip button for notifications** → Notifications are REQUIRED
7. ❌ **Allowing less than 5 categories** → Minimum requirement is 5 categories
8. ❌ **Waiting for download to complete on difficulty screen** → Trigger download in background, navigate immediately
9. ❌ **Disabling button while facts download** → Button should always be clickable; wait happens after permission
10. ❌ **Not scheduling actual notifications** → Must call `scheduleInitialNotifications()` on permission grant
11. ❌ **Waiting for download before requesting permission** → Request permission immediately, then wait for download
12. ❌ **Ignoring notification scheduling errors** → Must show Alert and allow retry
13. ❌ **Not storing scheduled_date and notification_id** → Database must track scheduled facts
14. ❌ **Forgetting to auto-refresh on main app** → Must check and top up to 64 on app launch
15. ❌ **Scheduling more than 64 notifications** → iOS limit is 64, respect it
16. ❌ **Using inline error boxes for permission denial** → Use native Alert instead
17. ❌ **Not using transactions for database writes** → Data corruption risk
18. ❌ **Hardcoding categories or translations** → Must load from database/i18n system
19. ❌ **Forgetting to clear state on errors** → Can cause UI bugs
20. ❌ **Not showing download progress** → Poor UX
21. ❌ **Allowing onboarding completion with 0 facts** → App won't work
22. ❌ **Not showing loading state during initialization** → Users may think app is frozen

---

## Future Considerations

### Potential Enhancements

- Background fact refresh
- ✅ ~~Push notification scheduling~~ → **IMPLEMENTED** (64 notifications with auto-refresh)
- Fact favorites/bookmarks
- Sharing functionality
- Offline mode indicator
- Re-onboarding (change preferences)
- Notification time change in settings (reschedule all notifications)
- Analytics tracking
- Notification interaction tracking (fact views from notifications)

### Migration Strategy

If onboarding flow changes:

1. Version the onboarding state in AsyncStorage
2. Handle migration from old → new flow
3. Don't break existing completed users

---

## Notification Scheduling System (Detailed)

### Overview

The app implements a robust local notification scheduling system that ensures users always have notifications queued up to 64 days ahead (iOS limit).

### Key Components

#### 1. Service Layer (`src/services/notifications.ts`)

```typescript
// Main functions
scheduleInitialNotifications(time: Date, locale: string): Promise<Result>
refreshNotificationSchedule(time: Date, locale: string): Promise<Result>
clearAllScheduledNotifications(): Promise<void>
rescheduleNotifications(newTime: Date, locale: string): Promise<Result>
getScheduledNotificationsCount(): Promise<number>
```

#### 2. Database Layer (`src/services/database.ts`)

```typescript
// Notification-related queries
getRandomUnscheduledFacts(limit: number, locale?: string): Promise<Fact[]>
markFactAsScheduled(factId: number, scheduledDate: string, notificationId: string): Promise<void>
clearFactScheduling(factId: number): Promise<void>
clearAllScheduledFacts(): Promise<void>
getScheduledFactsCount(locale?: string): Promise<number>
```

#### 3. Database Schema

```sql
-- Facts table includes notification columns
scheduled_date TEXT    -- ISO date when notification fires
notification_id TEXT   -- Expo notification ID for cancellation

-- Index for fast queries
CREATE INDEX idx_facts_scheduled_date ON facts(scheduled_date);
```

### Scheduling Flow

#### Initial Scheduling (Onboarding)

1. User grants notification permission on notifications screen
2. System calls `scheduleInitialNotifications(notificationTime, locale)`:
   - Query database: `getRandomUnscheduledFacts(64, locale)`
   - Check if selected time is later today (if so, start offset = 0, else offset = 1)
   - For each fact (0-63):
     - Calculate date: (today or tomorrow based on offset) + i days at selected time
     - Schedule notification via Expo Notifications API
     - Store notification ID and scheduled date in database
3. Navigate to success screen on successful scheduling
4. Show error alert with retry option on failure

#### Auto-Refresh (Main App Launch)

1. User opens app after onboarding complete
2. `useEffect` in [app/index.tsx](app/index.tsx) triggers:
   ```typescript
   const scheduledCount = await database.getScheduledFactsCount(locale);
   if (scheduledCount < 64) {
     await refreshNotificationSchedule(notificationTime, locale);
   }
   ```
3. Refresh process:
   - Calculate needed count: `64 - scheduledCount`
   - Get random unscheduled facts
   - Find last scheduled date
   - Schedule new notifications continuing from that date
   - Update database with new scheduled facts

#### Rescheduling (Settings - Future)

1. User changes notification time in settings
2. System calls `rescheduleNotifications(newTime, locale)`:
   - Cancel all scheduled notifications
   - Clear all scheduling data from database
   - Re-schedule 64 notifications with new time
   - Random selection ensures variety

### Error Handling

**Scheduling Errors**:

- Expo API failure → Show user-visible Alert, allow retry
- Database write failure → Transaction rollback, safe state
- Network issues → N/A (all local operations)

**Edge Cases**:

- No unscheduled facts available → Return success with count=0
- User has < 64 facts total → Schedule all available facts
- Database migration fails → App startup fails safely

### Performance Optimizations

1. **Batch Operations**: All 64 notifications scheduled in single operation
2. **Database Indexing**: `idx_facts_scheduled_date` for fast queries
3. **Random Selection**: SQLite `ORDER BY RANDOM()` for efficient randomization
4. **Transaction Safety**: Database updates wrapped in transactions

### Storage Details

**AsyncStorage**:

- `@notification_time`: ISO date string of user's selected time
- Used for auto-refresh and rescheduling

**SQLite**:

- `facts.scheduled_date`: ISO date when notification fires
- `facts.notification_id`: Expo notification ID for cancellation
- Allows tracking which facts are scheduled
- Prevents duplicate scheduling

**Expo Notifications**:

- Stores actual notification triggers
- Limited to 64 on iOS, higher on Android
- Managed via Expo Notifications API

### Monitoring & Debugging

**Console Logs**:

```
"Scheduled 64 notifications"
"Refreshed 15 notifications. Total now: 64"
"Scheduled notifications: 45. Refreshing..."
"Scheduled notifications: 64. No refresh needed."
"Failed to refresh notifications: [error message]"
```

**Database Queries** (for debugging):

```sql
-- Check scheduled count
SELECT COUNT(*) FROM facts WHERE scheduled_date IS NOT NULL;

-- View upcoming notifications
SELECT id, title, scheduled_date
FROM facts
WHERE scheduled_date IS NOT NULL
ORDER BY scheduled_date ASC
LIMIT 10;

-- Find unscheduled facts
SELECT COUNT(*) FROM facts WHERE scheduled_date IS NULL;
```

### Benefits

✅ **Always Available**: Users never run out of queued notifications
✅ **Efficient**: Auto-refreshes only when needed (< 64)
✅ **Reliable**: Database tracking prevents duplicates
✅ **User Control**: Respects selected notification time
✅ **Error Recovery**: User-visible errors with retry options
✅ **Performant**: Batch operations and indexed queries
✅ **Scalable**: Can handle thousands of facts in database
