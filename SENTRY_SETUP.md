# Sentry Setup Guide

Sentry crash reporting has been integrated into the Facts A Day app. Follow these steps to complete the setup:

## 1. Create a Sentry Account

1. Go to [https://sentry.io](https://sentry.io)
2. Sign up for a free account (or use an existing one)
3. The free tier includes:
   - 5,000 errors per month
   - 10,000 performance units
   - 30 days of data retention

## 2. Create a New Project

1. Click "Create Project" in your Sentry dashboard
2. Select **React Native** as the platform
3. Choose **Expo** as the framework
4. Name your project (e.g., "facts-a-day-app")
5. Click "Create Project"

## 3. Get Your DSN

After creating the project, Sentry will show you a DSN (Data Source Name). It looks like:

```
https://abc123def456@o123456.ingest.sentry.io/7890123
```

Copy this DSN - you'll need it in the next step.

## 4. Configure Your App

### Add DSN to app.json

Open `app.json` and add your DSN to the `extra` section:

```json
{
  "expo": {
    "extra": {
      "SENTRY_DSN": "https://your-key@sentry.io/your-project-id",
      ...
    }
  }
}
```

### Update Sentry Plugin Configuration

In `app.json`, update the Sentry plugin with your organization and project slugs:

```json
{
  "plugins": [
    [
      "@sentry/react-native/expo",
      {
        "organization": "your-org-slug",
        "project": "facts-a-day-app"
      }
    ],
    ...
  ]
}
```

**To find your organization slug:**
1. Go to Settings → General in Sentry
2. Look for "Organization Slug"

**Project slug:**
- This is the name you gave your project (usually lowercase with hyphens)

## 5. Rebuild Your App

After updating the configuration, you need to rebuild your app:

```bash
# Clear cache and rebuild
rm -rf .expo
bun start --clear

# For iOS
bun ios

# For Android
bun android
```

## 6. Test Sentry Integration

To test that Sentry is working:

1. **Development Mode**: Sentry is disabled in development to avoid noise
2. **Production Mode**: Build a production version and trigger a test crash

### Test in Production Build

```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```

Then install the build on a device and trigger an error to see it in Sentry.

## Features Included

### Automatic Error Tracking
- JavaScript errors and promise rejections
- Native crashes (iOS and Android)
- Network errors

### Performance Monitoring
- Slow database queries
- API call performance
- Screen navigation tracking

### Breadcrumbs
- User navigation
- Console logs
- Network requests
- User interactions

### Context
- Device information
- OS version
- App version
- User locale

## Usage in Code

### Manually Capture Errors

```typescript
import { captureException } from '../src/config/sentry';

try {
  // Some risky operation
  await riskyOperation();
} catch (error) {
  captureException(error, {
    context: { operation: 'riskyOperation', userId: '123' }
  });
  // Show user-friendly error to user
}
```

### Add User Context

```typescript
import { setSentryUser } from '../src/config/sentry';

// After device registration
setSentryUser(deviceId, deviceKey);
```

### Log Messages

```typescript
import { captureMessage } from '../src/config/sentry';

captureMessage('Important event happened', 'info');
```

## Best Practices

### DO
- ✅ Set user context after device registration
- ✅ Add custom context for important operations
- ✅ Manually capture caught errors that users should know about
- ✅ Use breadcrumbs to track user journey before crash
- ✅ Set up alerts for critical errors

### DON'T
- ❌ Send sensitive user data (passwords, tokens, etc.)
- ❌ Capture every single console.log (handled automatically)
- ❌ Leave test crashes in production code
- ❌ Ignore Sentry alerts

## Environment Variables (Optional)

For better security, you can use environment variables instead of hardcoding in app.json:

1. Install `dotenv`:
   ```bash
   bun add dotenv
   ```

2. Create `.env` file (add to .gitignore):
   ```
   SENTRY_DSN=https://your-key@sentry.io/your-project-id
   SENTRY_ORG=your-org-slug
   SENTRY_PROJECT=facts-a-day-app
   ```

3. Update `app.json` to use environment variables (requires additional configuration)

## Monitoring & Alerts

### Set Up Alerts

1. Go to **Alerts** in Sentry
2. Create alert rules for:
   - First seen issues (new errors)
   - High-frequency issues (many users affected)
   - Regression issues (fixed bugs returning)

### Integration with Slack/Email

1. Go to **Settings → Integrations**
2. Connect Slack or set up email notifications
3. Receive real-time alerts when critical errors occur

## Cost Considerations

**Free Tier Limits:**
- 5,000 errors/month
- If you exceed this, oldest errors are deleted
- Upgrade to paid plan ($26/month) for 50K errors

**Tips to Stay Within Free Tier:**
- Use rate limiting (already configured in sentry.ts)
- Filter out non-critical errors
- Set up proper error boundaries to catch issues early
- Fix issues promptly to reduce error count

## Support

- **Sentry Docs**: https://docs.sentry.io/platforms/react-native/
- **Expo + Sentry**: https://docs.expo.dev/guides/using-sentry/
- **Questions**: Check the Sentry community forum

---

**Status**: ✅ Sentry integration is complete. Just add your DSN to start tracking errors!
