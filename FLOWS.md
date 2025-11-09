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
                    [Step 2] Initialization
                          ↓
                    Register Device
                          ↓
                    Fetch Metadata (categories, content_types)
                          ↓
                    Store in SQLite
                          ↓
                    [Step 3] Categories Selection
                          ↓
                    User selects interests (minimum 5)
                          ↓
                    [Step 4] Difficulty Selection
                          ↓
                    User selects difficulty level
                          ↓
                    [Step 5] Notifications (REQUIRED)
                          ↓
                    Set notification time preference
                          ↓
                    Request Notification Permissions
                          ↓
                    ├─ Denied → Show Alert, Block Progress
                    └─ Granted → Complete Onboarding
                                      ↓
                                Mark Complete in AsyncStorage
                                      ↓
                                Navigate to Success Screen
```

### Step-by-Step Details

#### Step 1: Language Selection (`/onboarding/language`)
**Purpose**: Allow users to select their preferred language for the app

**UI Elements**:
- Progress: 1/4
- 3-column grid of language cards
- Each card shows:
  - Flag emoji
  - Language name in native script
- 8 supported languages: English, German, Spanish, French, Japanese, Korean, Turkish, Chinese
- Continue button (always enabled, uses current locale as default)

**Process**:
1. Display language options in 3-column grid layout
2. User selects a language by tapping card
3. **Immediately set locale** using `setLocale(languageCode)` on selection
4. UI updates in real-time to show selected language
5. Navigate to initialization screen

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

**Storage**:
- AsyncStorage: `@app_locale` (automatically saved by i18n system)

**Navigation**:
```javascript
router.push('/onboarding'); // Navigate to initialization
```

---

#### Step 2: Initialization (`/onboarding/index`)
**Purpose**: Register device and fetch metadata

**Process**:
1. Get device information (platform, model, OS version, language)
2. Call `POST /api/devices/register` with device info
3. Receive and store `device_key` in SecureStore
4. Call `GET /api/metadata?language={locale}`
5. Store categories and content_types in SQLite
6. Navigate to `/onboarding/categories`

**Error Handling**:
- Network errors → Show retry button
- API errors → Display error message with retry option

**Storage**:
- SecureStore: `device_key`
- SQLite: `categories` table, `content_types` table

---

#### Step 3: Categories (`/onboarding/categories`)
**Purpose**: Let users select categories they're interested in

**UI Elements**:
- Progress: 2/4
- Grid of category cards (3 per row)
- Each card shows icon + category name
- Multiple selection allowed
- Continue button (disabled until at least 5 categories selected)

**Process**:
1. Load categories from SQLite
2. Display as grid with Lucide icons
3. User selects at least 5 categories
4. Pass `selectedCategories` array to next step

**Validation**:
- At least 5 categories must be selected
- Categories are loaded from database (not hardcoded)

**Navigation**:
```javascript
router.push({
  pathname: '/onboarding/difficulty',
  params: {
    selectedCategories: JSON.stringify(selectedCategories)
  }
});
```

---

#### Step 4: Difficulty (`/onboarding/difficulty`)
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
1. Retrieve `selectedCategories` from params
2. Display difficulty options
3. User selects one option (default: "all")
4. Pass both `selectedCategories` and `difficulty` to next step

**Navigation**:
```javascript
router.push({
  pathname: '/onboarding/notifications',
  params: {
    selectedCategories: JSON.stringify(selectedCategories),
    difficulty: selectedDifficulty
  }
});
```

---

#### Step 5: Notifications (`/onboarding/notifications`) ⚠️ CRITICAL
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
   router.push({
     pathname: '/onboarding/success',
     params: {
       selectedCategories: JSON.stringify(selectedCategories),
       difficulty: difficulty,
       notificationTime: notificationTime.toISOString(),
     },
   });
   ```

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

## File Structure

```
app/
├── _layout.tsx                    # Root layout with onboarding check
├── index.tsx                      # Main app (after onboarding)
└── onboarding/
    ├── _layout.tsx                # Onboarding stack navigation
    ├── language.tsx               # Step 1: Language selection
    ├── index.tsx                  # Step 2: Initialization
    ├── categories.tsx             # Step 3: Category selection (min 5)
    ├── difficulty.tsx             # Step 4: Difficulty selection
    ├── notifications.tsx          # Step 5: Permissions + Time preference
    └── success.tsx                # Download screen + Completion

src/
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
- [ ] Fresh install → Language selection → Onboarding → Complete → Main App
- [ ] Language selection → Select language → UI updates immediately
- [ ] Initialization → Device registered → Metadata fetched
- [ ] Categories selection → At least 5 selected → Can proceed
- [ ] Difficulty selection → Default "all"
- [ ] Notifications → Set time → Grant permission → Navigate to success
- [ ] Success screen → Facts download → Progress shown → Complete
- [ ] Relaunch → Goes to Main App in selected language

### Error Paths
- [ ] Network failure on init → Retry works
- [ ] Network failure on metadata fetch → Retry works
- [ ] Categories: Less than 5 selected → Button disabled
- [ ] Permission denied → Alert shown directing to Settings
- [ ] Permission denied multiple times → Still blocks progress
- [ ] Kill app during download → Restart from language selection

### Edge Cases
- [ ] No network → Clear error messages on init screen
- [ ] Slow network → Progress shown on success screen
- [ ] Language selection → All 8 languages display correctly
- [ ] Language changes immediately reflect in UI
- [ ] Backend returns 0 facts → Error shown on success screen
- [ ] User denies then grants permission → Works correctly
- [ ] Database write fails → Transaction rollback
- [ ] Time picker works on both iOS and Android

---

## Common Mistakes to Avoid

1. ❌ **Skipping language selection step** → Must be first step in onboarding
2. ❌ **Not setting locale immediately** → Users expect real-time UI updates
3. ❌ **Adding a skip button for notifications** → Notifications are REQUIRED
4. ❌ **Allowing less than 5 categories** → Minimum requirement is 5 categories
5. ❌ **Using inline error boxes for permission denial** → Use native Alert instead
6. ❌ **Not using transactions for database writes** → Data corruption risk
7. ❌ **Hardcoding categories or translations** → Must load from database/i18n system
8. ❌ **Forgetting to clear state on errors** → Can cause UI bugs
9. ❌ **Not showing download progress** → Poor UX
10. ❌ **Allowing onboarding completion with 0 facts** → App won't work

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
