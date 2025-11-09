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
                    [Step 0] Initialization
                          ↓
                    Register Device
                          ↓
                    Fetch Metadata (categories, content_types)
                          ↓
                    Store in SQLite
                          ↓
                    [Step 1] Categories Selection
                          ↓
                    User selects interests
                          ↓
                    [Step 2] Difficulty Selection
                          ↓
                    User selects difficulty level
                          ↓
                    [Step 3] Notifications (REQUIRED)
                          ↓
                    Start Facts Download (background)
                          ↓
                    Request Notification Permissions
                          ↓
                    ├─ Denied → Show Error, Block Progress
                    └─ Granted → Wait for Download
                                      ↓
                                Download Complete?
                                      ↓
                                ├─ No → Show Progress, Wait
                                └─ Yes → Complete Onboarding
                                              ↓
                                        Mark Complete in AsyncStorage
                                              ↓
                                        Navigate to Main App
```

### Step-by-Step Details

#### Step 0: Initialization (`/onboarding/index`)
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

#### Step 1: Categories (`/onboarding/categories`)
**Purpose**: Let users select categories they're interested in

**UI Elements**:
- Progress: 1/3
- Grid of category cards (3 per row)
- Each card shows icon + category name
- Multiple selection allowed
- Continue button (disabled if no selection)

**Process**:
1. Load categories from SQLite
2. Display as grid with Lucide icons
3. User selects at least 1 category
4. Pass `selectedCategories` array to next step

**Validation**:
- At least 1 category must be selected
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

#### Step 2: Difficulty (`/onboarding/difficulty`)
**Purpose**: Let users select their preferred fact complexity

**UI Elements**:
- Progress: 2/3
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

#### Step 3: Notifications (`/onboarding/notifications`) ⚠️ CRITICAL
**Purpose**: Request notification permissions AND download all facts

**🚨 MANDATORY REQUIREMENTS**:
- Users MUST grant notification permissions
- NO skip option
- Facts must be fully downloaded before proceeding
- Onboarding cannot complete without both permissions AND data

**UI Elements**:
- Progress: 3/3
- Bell icon
- Download status indicator:
  - "Downloading facts..." (with progress)
  - "Facts downloaded" (with checkmark)
- Notification prompt button:
  - Disabled state: "Preparing..." (while downloading)
  - Enabled state: "Enable Notifications"
- NO skip button (this was a mistake in previous implementation)

**Process**:
1. **Component Mount**: Immediately start downloading facts in background
   ```javascript
   useEffect(() => {
     downloadFactsInBackground();
   }, []);
   ```

2. **Background Download**:
   ```javascript
   const result = await onboardingService.fetchAllFacts(
     locale,              // User's language
     selectedCategories,  // From previous step
     difficulty,          // From previous step
     (progress) => {
       setDownloadProgress(progress); // Update UI
     }
   );
   ```

3. **Download Progress States**:
   - `downloading`: Show "Downloading facts... X of Y"
   - `complete`: Enable notification button, show checkmark
   - `error`: Show error message, offer retry

4. **Notification Permission Flow**:
   - Button is DISABLED until download completes
   - When enabled, user clicks "Enable Notifications"
   - Call `Notifications.requestPermissionsAsync()`
   - If DENIED → Show error, keep button enabled for retry
   - If GRANTED → Auto-complete onboarding

5. **Completion Logic**:
   ```javascript
   // BOTH conditions must be true:
   if (downloadComplete && permissionGranted) {
     await completeOnboarding({
       selectedCategories,
       difficultyPreference: difficulty
     });
     router.replace('/'); // Navigate to main app
   }
   ```

**Error States**:
1. **Download Failed**:
   - Show error message
   - Keep button disabled
   - Automatically retry (up to 3 times with exponential backoff)

2. **Permission Denied**:
   - Show error: "Permission Required - We need notification permissions to send you daily facts."
   - Keep button enabled
   - User MUST grant to proceed
   - No alternative path

**Storage**:
- SQLite: `facts` table (all downloaded facts)
- AsyncStorage:
  - `@onboarding_complete: "true"`
  - `@selected_categories: ["science", "technology", ...]`
  - `@difficulty_preference: "all"`

**API Calls**:
```
GET /api/facts?language={locale}&categories={cats}&difficulty={diff}
```
- Handles pagination automatically
- Downloads ALL facts that match criteria
- Stores in SQLite with transaction

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
1. If onboarding incomplete AND not in onboarding → Redirect to `/onboarding`
2. If onboarding complete AND in onboarding → Redirect to `/` (main app)
3. Otherwise → Stay on current screen

---

## Data Flow

### Onboarding Data Pipeline

```
Backend API
    ↓
Device Registration → SecureStore (device_key)
    ↓
Metadata Fetch → SQLite (categories, content_types)
    ↓
Facts Fetch → SQLite (facts table)
    ↓
User Preferences → AsyncStorage (categories, difficulty)
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
    ├── index.tsx                  # Step 0: Initialization
    ├── categories.tsx             # Step 1: Category selection
    ├── difficulty.tsx             # Step 2: Difficulty selection
    └── notifications.tsx          # Step 3: Permissions + Download

src/
├── services/
│   ├── onboarding.ts             # Onboarding orchestration
│   ├── api.ts                    # Backend API client
│   └── database.ts               # SQLite operations
├── components/
│   ├── CategoryCard.tsx          # Category selection card
│   ├── ProgressIndicator.tsx    # Step progress (1/3, 2/3, 3/3)
│   └── Button.tsx                # Primary/secondary buttons
└── theme/
    └── tokens.ts                 # Design tokens
```

---

## Testing Checklist

### Happy Path
- [ ] Fresh install → Onboarding → Complete → Main App
- [ ] Categories selection → At least 1 selected
- [ ] Difficulty selection → Default "all"
- [ ] Notifications → Grant permission → Complete
- [ ] Facts download → Progress shown → Success
- [ ] Relaunch → Goes to Main App

### Error Paths
- [ ] Network failure on init → Retry works
- [ ] Download fails → Retry works
- [ ] Permission denied → Error shown, retry available
- [ ] Permission denied multiple times → Still blocks progress
- [ ] Kill app during download → Restart from beginning

### Edge Cases
- [ ] No network → Clear error messages
- [ ] Slow network → Progress shown
- [ ] Backend returns 0 facts → Error shown
- [ ] User denies then grants permission → Works
- [ ] Database write fails → Transaction rollback

---

## Common Mistakes to Avoid

1. ❌ **Adding a skip button for notifications** → Notifications are REQUIRED
2. ❌ **Marking onboarding complete before download finishes** → Must wait for both
3. ❌ **Not using transactions for database writes** → Data corruption risk
4. ❌ **Hardcoding categories** → Must load from database
5. ❌ **Forgetting to clear state on errors** → Can cause UI bugs
6. ❌ **Not showing download progress** → Poor UX
7. ❌ **Allowing onboarding completion with 0 facts** → App won't work

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
