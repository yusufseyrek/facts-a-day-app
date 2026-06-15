# App Store Connect — submission checklist

For the release that adds **server push notifications**, **comments (user-generated content)**, and **removes offline support**. Cross-referenced to Apple's App Review Guidelines. Items marked **MANDATORY** are likely-rejection if missing; **verify** means it should already be fine but confirm.

> Status legend: ☐ to do in App Store Connect · ✅ already satisfied by the app build (commits `2e08f1f`, `1dafc42`, `af09736`, `97bff9b`).

---

## 1. App Privacy ("nutrition labels") — Data Collection — **MANDATORY** (5.1.1)

Declare every data type the app + its SDKs collect. All of the below are **Linked to the user's identity = Yes** (a claimed screen name is a persistent server identity) and **not used for tracking**.

| Data type (App Store category) | What it is | Purpose |
|---|---|---|
| ☐ **Device ID** | Expo push token | App Functionality (deliver notifications) |
| ☐ **User ID** | screen name + app-user uuid | App Functionality (comments, leaderboard) |
| ☐ **User Content → Other User Content** | comment text | App Functionality |
| ☐ **Usage Data** | notification times, timezone, locale, followed categories | App Functionality |
| ☐ **Coarse/region** | device country code (from timezone) shown as a flag | App Functionality |
| ☐ **Third-party SDK data** | whatever Expo push + Firebase (App Check / Analytics if any) collect — you are responsible for declaring it | per SDK |

- ☐ Confirm the **Tracking** section still says the app does **not** track. Do not add an ad/analytics SDK that tracks without an ATT prompt.
- ☐ Comment bodies are sent to **OpenRouter** (an LLM provider) for translation + the safety filter. Disclose this processor in the privacy policy (see legal-docs task) and make sure your App Privacy answers reflect that comment text leaves the device.

## 2. Capabilities / signing — **MANDATORY** (4.5.4)

- ☐ **Push Notifications** capability enabled on the App ID.
- ☐ APNs key / Expo push credentials configured for the EAS project (`d110af35-f647-46c5-86c9-6ad19e942084`).
- ☐ Production **`aps-environment`** entitlement present in the submitted build.

## 3. Age rating — **MANDATORY** (1.3)

- ☐ Re-answer the age-rating questionnaire flagging **User-Generated Content**. Expect the rating to rise (typically **12+**) and the app to lose Kids-Category eligibility. This is unavoidable once public comments exist.

## 4. Metadata accuracy — **MANDATORY** (2.3) — *only once offline is actually removed*

> ⚠️ Offline support is still in the code today. Do these **with** the release that removes it, not before.

- ☐ Remove every "Works Offline / read offline" claim from the **description**, **keywords**, **promotional text**, and **release notes** (all locales).
- ☐ Regenerate/replace screenshots whose captions advertise offline.

## 5. App Review notes — **MANDATORY** (2.3.1)

Give the reviewer a clear path to the new features:
- ☐ Explain comments are public UGC and how to **post / report / block** (open any fact → scroll to Comments → tap a comment's **⋯** → Report / Block).
- ☐ Note the **first post** shows a community-rules agreement (EULA) and that an **objectionable-content filter** runs server-side.
- ☐ Point to **Settings → Account → Delete account & data** for account deletion.
- ☐ Note push is opt-in (permission-gated, "Maybe later") and not required for the app to function.

## 6. Privacy policy URL — **MANDATORY** (5.1.1(i))

- ☐ Confirm the Privacy Policy URL is set in App Store Connect.
- ☐ Confirm the policy text now covers push tokens, comments/UGC, screen-name identity, the OpenRouter processor, retention, and account deletion (see the legal-docs task — English first, then the 7 locales).

---

## Already satisfied by the app build (do NOT need new work, but confirm in review notes)

- ✅ **Guideline 1.2 (UGC):** content filter (LLM pass before store), **report** a comment, **block** a user, and a **zero-tolerance EULA** the user accepts before posting. The Terms must carry the matching zero-tolerance clause (legal-docs task).
- ✅ **Guideline 5.1.1(v):** in-app **account + comment deletion** (Settings → Account), backed by `DELETE /api/users/me`.
- ✅ **Guideline 4.5.4 (push):** consent-gated, no sensitive payload, app works if push is denied.

## Operational follow-ups (not blockers for the binary, but needed to honor 1.2)

- ☐ Build an **admin reports queue + ban-user** action so reports can be acted on within 24h (the `comment_reports` table + `POST /api/comments/:id/report` store them; there is no admin view yet — `setCommentStatus` can hide a comment and `deleteAppUser` can remove an abuser).
- ☐ Add an **unblock / manage-blocks** screen in Settings (`GET` / `DELETE /api/users/me/blocks` already exist).
- ☐ Translate the new English-only comment/moderation UI strings into the 7 other locales.

## Biggest approval risks (ranked)

1. **App Privacy answers incomplete** vs what the app actually collects (push token / comment text / screen name) → metadata-rejection. Fill section 1 carefully.
2. **Terms missing the UGC/EULA + zero-tolerance clause** while the app shows an EULA gate → inconsistency. Finish the legal-docs task.
3. **Inaccurate offline metadata** if offline is dropped without scrubbing the listing (section 4).
