import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import Reanimated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { usePremium } from '../contexts';
import { useFactAudio } from '../hooks/useFactAudio';
import { useResolvedImageUri } from '../hooks/useResolvedImageUri';
import { useTranslation } from '../i18n';
import {
  trackFactReport,
  trackPremiumGateAdResult,
  trackPremiumGateAdShown,
  trackSourceLinkClick,
} from '../services/analytics';
import * as api from '../services/api';
import { onFactViewed, onStreakMilestone, scheduleSatisfactionPrompt } from '../services/appReview';
import {
  checkAndAwardBadges,
  consumeDevDualTrigger,
  getReadingStreak,
  popModalScreen,
  pushModalScreen,
  triggerTestBadgeToast,
} from '../services/badges';
import {
  addFactDetailTimeSpent,
  mapApiFactToRelations,
  markFactDetailOpened,
  markFactDetailRead,
  MAX_FACT_DETAIL_SECONDS,
} from '../services/database';
import {
  getCachedFactImage,
  getCachedFactImageSync,
  purgeCachedFactImage,
} from '../services/images';
import { getIsConnected } from '../services/network';
import { useTabBarBannerInset } from '../services/tabBarBannerInset';
import { getCategoryNeonColor, hexColors, useTheme } from '../theme';
import { PAYWALL_GOLD } from '../theme/paywallColors';
import { getTranslatedUrl } from '../utils/browser';
import { absoluteFillObject } from '../utils/styles';
import { useResponsive } from '../utils/useResponsive';

import { showRewardedAd } from './ads/RewardedAd';
import { BannerAd } from './ads';
import { CategoryBadge } from './CategoryBadge';
import { CloseButton } from './CloseButton';
import { DialogCard } from './DialogShell';
import { FactActions } from './FactActions';
import { FactComments } from './FactComments';
import { Calendar, Crown, ExternalLink, ImagePlus, Play, RefreshCw } from './icons';
import { ModalBackdrop } from './ModalBackdrop';
import { RelatedFacts } from './RelatedFacts';
import { ReportFactModal } from './ReportFactModal';
import { styled, XStack, YStack } from './Stacks';
import { FONT_FAMILIES, Text } from './Typography';

import type { Category, FactWithRelations } from '../services/database';

interface FactModalProps {
  fact: FactWithRelations;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
  currentIndex?: number;
  totalCount?: number;
  source?: string;
  onRelatedFactPress?: (factId: number) => void;
  /**
   * Whether the host route is presented as an iOS modal (true) or a full-screen
   * card (false/undefined). It changes only the iOS header top padding: a modal
   * is laid out BELOW the status bar (small fixed pad), whereas a card draws
   * UNDER it (needs the real safe-area inset). No effect on Android.
   */
  presentedAsModal?: boolean;
  /** True when rendered by the in-tab overlay host (vs a card/modal route): the
   *  persistent tab-bar banner floats above, so FactModal drops its own banner
   *  and reserves clearance for the persistent one. */
  inOverlay?: boolean;
}

// Automatic hero-image retry tuning.
const MAX_IMAGE_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 600; // backoff: 600 / 1200 / 1800ms

// Styled components without static responsive values - use inline props with useResponsive()
const HeaderTitleContainer = styled(XStack, {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
});

function slugToTitleCase(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatLastUpdated(dateString: string, locale: string): string {
  try {
    // SQLite CURRENT_TIMESTAMP returns "YYYY-MM-DD HH:MM:SS" in UTC with no
    // timezone marker. Hermes/V8 parse that non-ISO form as local time, which
    // makes toLocaleString echo the UTC clock value. Normalize to ISO UTC so
    // the device's local timezone offset is applied.
    const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(dateString)
      ? dateString
      : dateString.replace(' ', 'T') + 'Z';
    const date = new Date(normalized);
    return date.toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function FactModal({
  fact,
  onClose,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
  currentIndex,
  totalCount,
  source,
  onRelatedFactPress,
  presentedAsModal,
  inOverlay,
}: FactModalProps) {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const { isPremium } = usePremium();
  // iOS 26: the bottom chrome floats over the scroll content (see bottomBarHeight).
  const useGlassChrome = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const {
    typography,
    spacing,
    iconSizes,
    isTablet,
    screenWidth: SCREEN_WIDTH,
    screenHeight: SCREEN_HEIGHT,
    radius,
    borderWidths,
    media,
  } = useResponsive();

  const insets = useSafeAreaInsets();
  // In the in-tab overlay the persistent tab-bar banner floats above the action
  // bar; reserve room for it so scroll content clears its top edge.
  const persistentBannerInset = useTabBarBannerInset();
  const isLandscape = SCREEN_WIDTH > SCREEN_HEIGHT;
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const currentScrollY = useRef(0);
  const [titleHeight, setTitleHeight] = useState<number>(typography.lineHeight.headline); // Default to 1 line height
  const [containerWidth, setContainerWidth] = useState(SCREEN_WIDTH); // Actual modal width
  // With Liquid Glass the bottom bar (banner + actions) floats over the scroll
  // content so the glass has something to refract; the scroll content gets
  // padded by the bar's measured height so nothing hides behind it.
  const [bottomBarHeight, setBottomBarHeight] = useState(0);
  const [adUnlocked, setAdUnlocked] = useState(false);

  // Max scroll for the header progress border. The border is full when the thin
  // divider under the source link (the comments/"more from category" tail's top
  // edge) scrolls up to meet the header border line, i.e. screen-y === headerHeight.
  // tailTopY = the article's end offset (full content minus the measured tail and
  // the glass bottom inset); completion is tailTopY − headerHeight.
  const [maxScroll, setMaxScroll] = useState(0);
  const contentHeightRef = useRef(0);
  const tailHeightRef = useRef(0);
  const headerHeightRef = useRef(0);
  const recomputeMaxScroll = useCallback(() => {
    const tail = tailHeightRef.current + (useGlassChrome ? bottomBarHeight : 0);
    const tailTopY = Math.max(0, contentHeightRef.current - tail);
    const next = Math.max(0, tailTopY - headerHeightRef.current);
    setMaxScroll((prev) => (Math.abs(prev - next) > 1 ? next : prev));
  }, [useGlassChrome, bottomBarHeight]);

  // Reset ad unlock when navigating to a different fact
  useEffect(() => {
    setAdUnlocked(false);
  }, [fact.id]);

  // Image loading state tracked via expo-image callbacks
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isImageError, setIsImageError] = useState(false);
  // True only when a real expo-image paint callback (onLoad/onDisplay) fired
  // for the current fact. isImageLoaded can also be set by the availability
  // effect's safety reveal — an ASSUMPTION that the bitmap painted — so error
  // UI must key off this confirmed signal, not isImageLoaded; otherwise a
  // load that fails after the safety reveal leaves a permanently blank slot
  // with no retry affordance.
  const [hasPainted, setHasPainted] = useState(false);
  // Automatic retry for intermittent front-layer load failures (Android Glide
  // race / dropped fetch). On retry we remount the front <Image> (key) AND vary
  // its source URL (cache-buster) so expo-image actually re-fetches instead of
  // short-circuiting to the cached failure. Manual overlay only after exhaustion.
  const [retryCount, setRetryCount] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fail-safe fallback chain. When the current source has exhausted its
  // automatic retries, swap to the other source for this fact (remote URL ↔
  // disk cache) instead of giving up: a failing remote may have a good cached
  // copy, and a corrupt cache file may still load fine from the network.
  // `triedUrisRef` guards against ping-ponging between two dead sources.
  const [fallbackUri, setFallbackUri] = useState<string | null>(null);
  const triedUrisRef = useRef<Set<string>>(new Set());

  // Double-buffer: keep the previous image visible until the new one loads.
  // `displayedImageUri` is the last successfully loaded image — it stays on screen
  // as a "back" layer while the new image loads on the "front" layer.
  // Seed from the sync cache so the back layer renders on first paint when the
  // image is already on disk — without this, expo-image v56 always shows the
  // blurhash placeholder + transition fade even on cache hits.
  const [displayedImageUri, setDisplayedImageUri] = useState<string | null>(() =>
    getCachedFactImageSync(fact.id)
  );

  // Related facts for the current fact's category
  const [relatedFacts, setRelatedFacts] = useState<FactWithRelations[]>([]);
  // Report dialog is hosted HERE (screen root), not in the action bar: the
  // bar can be absolute bottom chrome, and the dialog's inline overlay fills
  // its parent — inside the bar it was squeezed into the bar's box.
  const [showReportModal, setShowReportModal] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRelatedFacts([]);

    const categorySlug = fact.categoryData?.slug || fact.category;
    if (!categorySlug) return;

    // Related = a few facts from the same category (cursor feed), minus this one.
    api
      .getFactsFeed({ language: locale, categories: categorySlug, limit: 4 })
      .then((res) => {
        if (cancelled) return;
        const related = res.facts
          .filter((f) => f.id !== fact.id)
          .slice(0, 3)
          .map(mapApiFactToRelations);
        setRelatedFacts(related);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [fact.id, fact.category, fact.categoryData?.slug, locale]);

  // Shimmer animation for loading placeholder
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  // Reset error state when fact changes; keep isImageLoaded true if we have
  // a displayed image so the placeholder overlay doesn't flash
  useEffect(() => {
    setIsImageError(false);
    setRetryCount(0);
    setHasPainted(false);
    setFallbackUri(null);
    triedUrisRef.current.clear();
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (!displayedImageUri) {
      setIsImageLoaded(false);
    }
  }, [fact.id]);

  // Clear any pending backoff retry on unmount so it can't setState after teardown.
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // Show placeholder when loading OR when error (before image loads).
  // Suppressed when a back-buffered image is already on screen — otherwise
  // the shimmer overlay would flash on top of the cached image we just rendered.
  const showImagePlaceholder = !!fact.image_url && !isImageLoaded && !displayedImageUri;

  // Show error state when image fails. Keys off hasPainted (confirmed paint),
  // NOT isImageLoaded: the safety reveal sets isImageLoaded optimistically, and
  // an error after that must still surface the retry overlay instead of
  // leaving a silently blank image slot.
  const isImageFailed = !!fact.image_url && isImageError && !hasPainted;

  // Run shimmer animation only during actual loading (not on permanent error)
  const isActivelyLoading = showImagePlaceholder && !isImageFailed;
  useEffect(() => {
    if (isActivelyLoading) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      shimmerAnim.setValue(0);
    }
  }, [isActivelyLoading, shimmerAnim]);

  // Track modal screen for badge toast deferral
  useEffect(() => {
    pushModalScreen();
    return () => popModalScreen();
  }, []);

  // Track fact view for app review prompt and interstitial ads
  useEffect(() => {
    onFactViewed(source);
  }, [fact.id]);

  // Track detail interactions
  // Active (foreground) time accounting for "time spent" + read detection. We
  // sum only the spans where the app is foregrounded and this modal is mounted,
  // so a backgrounded app or an idle device never inflates the recorded time
  // (see the AppState effect below). activeStartRef is the live span's start, or
  // null while paused; activeElapsedMsRef banks the completed spans.
  const activeStartRef = useRef<number | null>(Date.now());
  const activeElapsedMsRef = useRef(0);
  const getActiveSeconds = useCallback(() => {
    const live = activeStartRef.current != null ? Date.now() - activeStartRef.current : 0;
    return Math.round((activeElapsedMsRef.current + live) / 1000);
  }, []);
  const hasMarkedRead = useRef(false);
  const hasScrolledToBottom = useRef(false);

  // Pause the active-time clock while the app is backgrounded/inactive, so
  // locking the phone or leaving the app doesn't accrue "time spent".
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        if (activeStartRef.current == null) activeStartRef.current = Date.now();
      } else if (activeStartRef.current != null) {
        activeElapsedMsRef.current += Date.now() - activeStartRef.current;
        activeStartRef.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  // Mark detail as opened on mount
  useEffect(() => {
    markFactDetailOpened(fact.id)
      .then(() => checkAndAwardBadges())
      .then(() => getReadingStreak())
      .then((streak) => onStreakMilestone(streak))
      .then((result) => {
        if (result === 'show_satisfaction') {
          scheduleSatisfactionPrompt();
        }
      })
      .catch(() => {});
    activeElapsedMsRef.current = 0;
    activeStartRef.current = AppState.currentState === 'active' ? Date.now() : null;
    hasMarkedRead.current = false;
    hasScrolledToBottom.current = false;

    return () => {
      // Dev-only: arm a synthetic badge toast + satisfaction prompt when the
      // user has tapped "Test Satisfaction Modal" in developer settings, so we
      // can reproduce the toast/modal overlap deterministically.
      if (__DEV__ && consumeDevDualTrigger()) {
        triggerTestBadgeToast();
        scheduleSatisfactionPrompt();
      }
      // Track time spent on unmount — active foreground seconds only, capped so
      // a screen left open / idle device can't book hours of phantom time.
      const seconds = Math.min(getActiveSeconds(), MAX_FACT_DETAIL_SECONDS);
      if (seconds > 0) {
        addFactDetailTimeSpent(fact.id, seconds)
          .then(() => checkAndAwardBadges())
          .catch(() => {});
      }
      // If user scrolled to bottom but hadn't spent enough time during scroll,
      // check again on unmount with final elapsed time
      if (hasScrolledToBottom.current && !hasMarkedRead.current) {
        const wordCount = (fact.content || '').split(/\s+/).length;
        const estimatedSeconds = (wordCount / 200) * 60;
        const minReadingTime = Math.max(10, Math.min(30, Math.round(estimatedSeconds * 0.4)));
        if (seconds >= minReadingTime) {
          hasMarkedRead.current = true;
          markFactDetailRead(fact.id)
            .then(() => checkAndAwardBadges())
            .catch(() => {});
        }
      }
    };
  }, [fact.id]);

  // Use remote URL (online) → local cache (offline).
  // When online, prefer remote URL so expo-image resolves by URL (avoids stale
  // decoded images cached against fixed local file paths).
  // When offline, only use locally cached images — don't fall back to remote URLs
  // that will never load (avoids showing a placeholder for nothing).
  //
  // NOTE: legacy notification images (notification-images/ dir) are deliberately
  // NOT used here. That directory is purged wholesale at startup
  // (cleanupOldNotificationImages), so preferring those files raced the purge:
  // the modal could latch onto a file:// URI that was deleted mid-load, fail all
  // retries against the dead path, and render the fact with no image.
  const initialImageUri = getIsConnected()
    ? fact.image_url || getCachedFactImageSync(fact.id)
    : getCachedFactImageSync(fact.id);
  const resolvedImageUri = useResolvedImageUri(fact.id, fact.image_url, initialImageUri);

  const imageUri = fallbackUri || resolvedImageUri;

  // Guards tryNextImageSource against applying a stale fallback: it awaits a
  // disk check, and the user can swipe to another fact mid-await.
  const imageFactIdRef = useRef(fact.id);
  imageFactIdRef.current = fact.id;

  const tryNextImageSource = useCallback(
    async (failedUri: string) => {
      const factId = fact.id;
      triedUrisRef.current.add(failedUri);

      if (failedUri.startsWith('file://')) {
        // The cached file is undecodable (passed size checks but won't render):
        // purge it so resolveFactImageUri can't keep returning the broken path.
        purgeCachedFactImage(factId).catch(() => {});

        const remote = fact.image_url;
        if (remote && getIsConnected() && !triedUrisRef.current.has(remote)) {
          setRetryCount(0);
          setFallbackUri(remote);
          return;
        }
      } else {
        const local = await getCachedFactImage(factId);
        if (imageFactIdRef.current !== factId) return; // fact changed mid-await
        if (local && !triedUrisRef.current.has(local)) {
          setRetryCount(0);
          setFallbackUri(local);
          return;
        }
      }

      setIsImageError(true); // no untried source left → manual retry overlay
    },
    [fact.id, fact.image_url]
  );

  // Front-layer source with a cache-buster on retry only. expo-image caches the
  // FAILURE for a url key, so re-passing the same uri after onError is a no-op;
  // varying the query string forces a fresh native fetch. file:// is local and
  // never needs busting; retryCount===0 keeps the happy path byte-identical.
  const frontImageSource = useMemo(() => {
    if (!imageUri) return undefined;
    if (retryCount === 0 || imageUri.startsWith('file://')) return { uri: imageUri };
    const sep = imageUri.includes('?') ? '&' : '?';
    return { uri: `${imageUri}${sep}retry=${retryCount}` };
  }, [imageUri, retryCount]);

  // Smart image availability check: local file / cache / network → safety timeout.
  //
  // This is also the backstop for a real Android bug: two same-uri expo-image
  // instances (modal-hero background + modal-main front) co-mount, and the
  // front layer can silently drop BOTH its onLoad and onDisplay dispatches in
  // the Glide race. isImageLoaded then never flips true, so the opaque
  // placeholder overlay stays on top and the front image reads as blank —
  // intermittently ("sometimes"), correlated with cache state. So whenever we
  // can independently confirm the bitmap is available (local file, or in
  // expo-image's disk cache), we clear the placeholder ourselves instead of
  // waiting on a callback that may never come.
  useEffect(() => {
    if (!imageUri || isImageLoaded || isImageError) return;

    let cancelled = false;
    let safetyTimeoutId: ReturnType<typeof setTimeout>;

    const reveal = () => {
      if (cancelled) return;
      setIsImageLoaded(true);
      setDisplayedImageUri(imageUri);
    };

    async function checkImageAvailability() {
      // Local file URIs (from our cache) are always available → reveal now.
      if (imageUri!.startsWith('file://')) {
        reveal();
        return;
      }

      // Remote URL already in expo-image's disk cache → it will paint with no
      // network; reveal now rather than risk a dropped callback.
      try {
        const cachePath = await Image.getCachePathAsync(imageUri!);
        if (cancelled) return;
        if (cachePath) {
          reveal();
          return;
        }
      } catch {
        // silently ignore cache check
      }

      // Not cached — if offline, the remote URL can't load. Don't error out
      // immediately: a disk-cached copy may exist (connectivity can flip
      // offline after the resolver picked the remote URL), so run the
      // fallback chain, which errors only when no source is left.
      if (!getIsConnected() && !cancelled) {
        tryNextImageSource(imageUri!).catch(() => {
          if (!cancelled) setIsImageError(true);
        });
        return;
      }

      // Online but not cached — give the network a moment, then assume the
      // bitmap has painted and reveal (the background copy of the same uri
      // proves it loads). A genuine load failure still fires onError → error UI.
      if (!cancelled) {
        safetyTimeoutId = setTimeout(reveal, 2500);
      }
    }

    checkImageAvailability();
    return () => {
      cancelled = true;
      clearTimeout(safetyTimeoutId);
    };
  }, [imageUri, isImageLoaded, isImageError, tryNextImageSource]);

  // Images are always square (1:1)
  // For tablets: landscape shows 50% height (more content visible), portrait shows 80% height centered
  // For phones: square (full width)
  // Use actual container width (measured via onLayout) instead of screen width for accurate sizing
  const IMAGE_WIDTH = containerWidth;
  const IMAGE_HEIGHT = isTablet
    ? isLandscape
      ? IMAGE_WIDTH * 0.7
      : IMAGE_WIDTH * 0.8
    : containerWidth;

  const handleScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
  });

  // Detect scroll to bottom for read tracking
  // Requires both scrolling to bottom AND spending enough time reading
  const checkScrolledToBottom = useCallback(
    (event: any) => {
      if (hasMarkedRead.current) return;
      const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
      const threshold = 50;
      if (contentOffset.y + layoutMeasurement.height >= contentSize.height - threshold) {
        hasScrolledToBottom.current = true;

        // Calculate minimum reading time based on content length
        // ~200 words/min average reading speed, clamped between 10-30 seconds
        const wordCount = (fact.content || '').split(/\s+/).length;
        const estimatedSeconds = (wordCount / 200) * 60;
        const minReadingTime = Math.max(10, Math.min(30, Math.round(estimatedSeconds * 0.4)));
        const elapsedSeconds = getActiveSeconds();

        if (elapsedSeconds >= minReadingTime) {
          hasMarkedRead.current = true;
          markFactDetailRead(fact.id)
            .then(() => checkAndAwardBadges())
            .catch(() => {});
        }
      }
    },
    [fact.id, fact.content, getActiveSeconds]
  );

  // Pull-down-to-close: when the user overscrolls past the top and releases,
  // dismiss the screen. iOS reports a negative contentOffset.y while bouncing
  // above the top; a downward release past PULL_TO_CLOSE_THRESHOLD closes. This
  // coexists with normal scrolling (only fires above the top) and the
  // horizontal swipe-back (different axis).
  const PULL_TO_CLOSE_THRESHOLD = 90;
  const handleScrollEndDrag = useCallback(
    (event: any) => {
      const y = event.nativeEvent.contentOffset.y;
      if (y <= -PULL_TO_CLOSE_THRESHOLD) {
        onClose();
        return;
      }
      checkScrolledToBottom(event);
    },
    [onClose, checkScrolledToBottom]
  );

  const handleSubmitReport = useCallback(
    async (feedbackText: string) => {
      setIsSubmittingReport(true);
      try {
        await api.reportFact(fact.id, feedbackText);
        trackFactReport(fact.id);
        Alert.alert(t('success'), t('reportSubmitted'));
      } catch (error) {
        console.error('Error submitting report:', error);
        const errorMessage = error instanceof Error ? error.message : t('failedToSubmitReport');
        Alert.alert(t('error'), errorMessage);
      } finally {
        setIsSubmittingReport(false);
      }
    },
    [fact.id, t]
  );

  const handleSourcePress = useCallback(
    (url: string) => {
      trackSourceLinkClick({ factId: fact.id, domain: extractDomain(url) });
      // Translate the source page only when its language differs from the
      // reader's. Compare base language codes (the source/locale are ISO codes
      // like 'en'/'tr', but normalize away case/region just in case).
      const baseCode = (code: string) => code.toLowerCase().split('-')[0];
      const sourceLang = fact.source_language ? baseCode(fact.source_language) : null;
      const userLang = baseCode(locale);
      // Known source language → translate iff it's not the reader's language.
      // Unknown source (null) → fall back to the prior heuristic (most sources
      // are English): translate unless the reader already reads English. Either
      // way getTranslatedUrl uses sl=sourceLang when known, sl=auto otherwise.
      const shouldTranslate = sourceLang ? sourceLang !== userLang : userLang !== 'en';
      const finalUrl = shouldTranslate
        ? getTranslatedUrl(url, locale, sourceLang ?? undefined)
        : url;
      Linking.openURL(finalUrl);
    },
    [fact.id, fact.source_language, locale]
  );

  let categoryForBadge: string | Category | null = null;
  if (fact.categoryData) {
    categoryForBadge = fact.categoryData;
  } else if (fact.category) {
    try {
      const parsed = JSON.parse(fact.category);
      categoryForBadge = parsed.name || parsed.slug || fact.category;
    } catch {
      categoryForBadge = slugToTitleCase(fact.category);
    }
  }

  // Get category color (same logic as CategoryBadge)
  const categoryColor = React.useMemo(() => {
    if (!categoryForBadge) return null;
    if (typeof categoryForBadge === 'string') {
      return getCategoryNeonColor(categoryForBadge, theme);
    }
    return categoryForBadge.color_hex || getCategoryNeonColor(categoryForBadge.slug, theme);
  }, [categoryForBadge, theme]);

  // Keep the image section mounted while we have a URI, even in the error
  // state — the manual-retry overlay lives INSIDE this section, so collapsing
  // to the no-image layout on error (the old `&& !isImageError`) made the
  // retry UI unreachable and silently dropped the image for facts that do
  // have one. Genuine no-image facts (imageUri null) still get the text-only
  // layout.
  const hasImage = !!imageUri;

  // Header height = padding + measured title height.
  // On iOS the top pad depends on how the host route is presented:
  //  - modal  → laid out BELOW the status bar, so a small fixed pad is enough
  //             (adding insets.top there would double the gap).
  //  - card   → draws UNDER the status bar, so it needs the real safe-area inset.
  // Android always draws under the bar, so it uses the inset regardless.
  const basePaddingTop =
    Platform.OS === 'ios' ? (presentedAsModal ? spacing.xl : insets.top) : insets.top;
  const basePaddingBottom = spacing.lg;
  const headerHeight = basePaddingTop + basePaddingBottom + titleHeight;
  // Mirror into a ref so recomputeMaxScroll (declared above) can read the latest
  // header height without a stale closure / use-before-declaration.
  headerHeightRef.current = headerHeight;

  // Header background appears when image starts to be covered (for images) or early for no image
  const HEADER_BG_TRANSITION = hasImage ? IMAGE_HEIGHT - headerHeight : 100;

  // Cover overlay for fact-to-fact navigation. Renders a solid-colored
  // <Animated.View> on top of the content rather than fading the content
  // itself. The previous approach (parent opacity animation on a wrapper with
  // needsOffscreenAlphaCompositing) caused Android to re-composite the
  // offscreen buffer on every subtree change during the fade — back-layer
  // unmount, related-facts async refill, resolved-URI swap, etc. — each
  // producing a visible flash stacked on top of the intended cross-fade.
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const isFirstRender = useRef(true);

  // Snap the overlay to fully opaque the moment a new fact.id is observed —
  // during render, so it commits atomically with the new content. Doing this
  // in useEffect leaves one or two Android frames where the new content is
  // visible uncovered before the effect runs.
  const lastSeenFactIdRef = useRef(fact.id);
  if (lastSeenFactIdRef.current !== fact.id) {
    lastSeenFactIdRef.current = fact.id;
    overlayOpacity.stopAnimation();
    overlayOpacity.setValue(1);
  }

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Scroll to top under the cover — user can't see the jump
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    scrollY.setValue(0);
    currentScrollY.current = 0;
    // New fact = new content length; let onContentSizeChange / the tail's
    // onLayout repopulate them.
    contentHeightRef.current = 0;
    tailHeightRef.current = 0;
    setMaxScroll(0);

    // Brief hold so cascading state updates (related facts, resolved URI,
    // image source decode) settle under the cover, then fade it away.
    const timer = setTimeout(() => {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }, 50);

    return () => clearTimeout(timer);
  }, [fact.id]);

  // Image scale - stays at 1, no scaling
  const imageScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.3, 1],
    extrapolateRight: 'clamp',
  });

  // Image parallax - moves image down to show upper portion
  // At transition point, visible area = (diff - centeredTranslateY) from image top
  // How far from the top of the image to show (0 = top edge, 0.5 = center, 1 = bottom)
  const IMAGE_VERTICAL_ANCHOR = 0.13;
  const centeredTranslateY = hasImage
    ? (1 - IMAGE_VERTICAL_ANCHOR) * (IMAGE_HEIGHT - headerHeight)
    : 0;
  const imageTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, HEADER_BG_TRANSITION],
    outputRange: [-50, 0, centeredTranslateY], // At transition, show center portion
    extrapolate: 'clamp',
  });

  // Body image opacity - hides instantly when header background appears (no fade)
  // Use very small epsilon to create instant cutoff without fade
  const bodyImageOpacity = scrollY.interpolate({
    inputRange: [0, Math.max(0, HEADER_BG_TRANSITION - 0.01), HEADER_BG_TRANSITION],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });

  // Header container opacity - appears when image scrolls under (has-image only)
  // For no-image: header is completely hidden; title is sticky via stickyHeaderIndices
  const headerOpacity = hasImage
    ? scrollY.interpolate({
        inputRange: [0, Math.max(0, HEADER_BG_TRANSITION - 0.01), HEADER_BG_TRANSITION],
        outputRange: [0, 0, 1],
        extrapolate: 'clamp',
      })
    : 0;

  // Fade opacity - overlay for header background image (slowly fades in after header becomes visible)
  const FADE_DURATION = 70; // Pixels over which to fade in after header becomes visible
  const fadeOpacity = scrollY.interpolate({
    inputRange: [HEADER_BG_TRANSITION, HEADER_BG_TRANSITION + FADE_DURATION],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Content title opacity - stays visible, no fade
  const contentTitleOpacity = scrollY.interpolate({
    inputRange: [0, 1000],
    outputRange: [1, 1],
    extrapolate: 'clamp',
  });

  // Header title translateY - slides up from bottom of header as scrollY increases
  const headerTitleStartY = headerHeight - basePaddingTop + basePaddingBottom;

  // Continuous animation: translateY decreases (moves up) as scrollY increases
  // The title starts moving up when header becomes visible and continues to move up as user scrolls
  // Clamped at 0 to prevent going below the header
  // For no-image layout: title is static (no slide-up) to avoid distracting motion while reading
  const headerTitleTranslateY = hasImage
    ? scrollY.interpolate({
        inputRange: [
          Math.max(0, HEADER_BG_TRANSITION - 1),
          HEADER_BG_TRANSITION,
          HEADER_BG_TRANSITION + headerTitleStartY,
        ],
        outputRange: [headerTitleStartY, headerTitleStartY, 0],
        extrapolate: 'clamp',
      })
    : 0;

  // Header background image position - shows the upper portion of the image
  // Must match body parallax anchor point
  const headerImageTranslateY = hasImage
    ? -IMAGE_VERTICAL_ANCHOR * (IMAGE_HEIGHT - headerHeight)
    : 0;
  const fadedImageTranslateY = hasImage
    ? scrollY.interpolate({
        inputRange: [-100, 0, HEADER_BG_TRANSITION, HEADER_BG_TRANSITION + 1000],
        outputRange: [-50, headerImageTranslateY, headerImageTranslateY, headerImageTranslateY], // Show center portion
        extrapolate: 'clamp',
      })
    : new Animated.Value(0);

  // Close button is always visible for better UX (especially on iOS where there's no back button)

  // Badge scroll threshold - when category badge scrolls under the header
  // Badge is at: IMAGE_HEIGHT (or 0 if no image) + contentPadding + titleHeight + gap
  // Ensure non-negative to prevent invalid interpolation inputRange
  const BADGE_SCROLL_THRESHOLD = Math.max(
    0,
    (hasImage ? IMAGE_HEIGHT : 0) + spacing.lg + titleHeight + spacing.md - headerHeight
  );

  // Header border = reading-progress indicator. It fills left→right as scrollY
  // travels [borderStartOffset → maxScroll], so a full-width border lands exactly
  // when the content's end is reached and its growth rate signals how much remains.
  // The fill only STARTS once the sticky header title has finished sliding into
  // place (HEADER_BG_TRANSITION + headerTitleStartY), so the border doesn't move
  // while the title is still animating; no-image facts have a static title and so
  // start at 0. scaleX (native-driver friendly) carries the fill; a paired
  // translateX anchors the growth to the left edge instead of scaling from center.
  // With no meaningful scroll past that point, everything's on screen so it sits full.
  const borderStartOffset = hasImage ? HEADER_BG_TRANSITION + headerTitleStartY : 0;
  const isContentScrollable = maxScroll > borderStartOffset + 8;
  const progressRange = {
    inputRange: [borderStartOffset, Math.max(maxScroll, borderStartOffset + 1)],
    extrapolate: 'clamp' as const,
  };
  const borderScaleX = isContentScrollable
    ? scrollY.interpolate({ ...progressRange, outputRange: [0, 1] })
    : 1;
  const borderTranslateX = isContentScrollable
    ? scrollY.interpolate({ ...progressRange, outputRange: [-containerWidth / 2, 0] })
    : 0;

  // Category badge fade out as it approaches the header
  // Category badge fades out as it scrolls under the header (has-image only)
  // For no-image: badge is always visible (no header to scroll under)
  const categoryBadgeOpacity = hasImage
    ? scrollY.interpolate({
        inputRange: [Math.max(0, BADGE_SCROLL_THRESHOLD - 5), BADGE_SCROLL_THRESHOLD + 35],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      })
    : 1;

  const factTitle = fact.title || fact.content.substring(0, 60) + '...';

  // Shared audio controller — both the content-area button and the header
  // button render from this single state so they stay in sync.
  const audioController = useFactAudio(fact.id, fact.audio_url ?? null, locale);

  // Announce modal opening to screen readers
  useEffect(() => {
    // Small delay to ensure the modal is rendered
    const timer = setTimeout(() => {
      AccessibilityInfo.announceForAccessibility(factTitle);
    }, 100);
    return () => clearTimeout(timer);
  }, [factTitle]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme === 'dark' ? hexColors.dark.surface : hexColors.light.surface,
      }}
      accessibilityViewIsModal={true}
      accessibilityLabel={factTitle}
      accessibilityRole="none"
      importantForAccessibility="yes"
      onLayout={(event) => {
        const { width } = event.nativeEvent.layout;
        if (width > 0 && width !== containerWidth) {
          setContainerWidth(width);
        }
      }}
    >
      {/* Sticky Header with Faded Image Background */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          opacity: headerOpacity,
          minHeight: headerHeight,
          transform: [],
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
            },
          }),
        }}
        collapsable={false}
        pointerEvents="box-none"
      >
        <Animated.View
          // box-none (not "none") so interactive children inside the header
          // — like the play button — can receive taps. Decorative children
          // (title, background image) set their own pointerEvents="none".
          pointerEvents="box-none"
          style={{
            minHeight: headerHeight,
            overflow: 'hidden',
            ...Platform.select({
              android: {
                elevation: 12,
                // Background color for elevation - matches the overlay/solid background
                backgroundColor: hasImage
                  ? theme === 'dark'
                    ? 'rgba(0, 0, 0, 0.35)'
                    : 'rgba(255, 255, 255, 0.5)'
                  : theme === 'dark'
                    ? 'rgba(0, 0, 0, 0.85)'
                    : 'rgba(255, 255, 255, 0.95)',
              },
            }),
          }}
        >
          {/* Faded background image behind header */}
          {hasImage && (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                overflow: 'hidden',
              }}
            >
              <Animated.View
                style={{
                  width: IMAGE_WIDTH,
                  height: IMAGE_HEIGHT,
                  transform: [{ translateY: fadedImageTranslateY }],
                }}
              >
                <Image
                  source={{ uri: imageUri! }}
                  aria-label={t('a11y_factImage', { title: factTitle })}
                  role="img"
                  style={{
                    width: IMAGE_WIDTH,
                    height: IMAGE_HEIGHT,
                  }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  // Skip the fade when we already have the cached image —
                  // expo-image v56 on Android otherwise visibly fades from
                  // empty → image even on disk-cache hits.
                  transition={displayedImageUri ? 0 : 200}
                  recyclingKey="modal-hero"
                />
              </Animated.View>
              {/* Overlay for better text readability - fades out during header collapse */}
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    opacity: fadeOpacity,
                    backgroundColor:
                      theme === 'dark' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.5)',
                  },
                ]}
              />
            </Animated.View>
          )}
          {/* Solid background for header when no image */}
          {!hasImage && (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    theme === 'dark' ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.95)',
                },
              ]}
            />
          )}
          {/* Header content - wrapper compensates for header collapse */}
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 101,
              transform: [],
            }}
            pointerEvents="box-none"
          >
            <XStack
              alignItems="center"
              justifyContent="space-between"
              paddingHorizontal={spacing.xl}
              pointerEvents="box-none"
              style={{
                paddingTop: basePaddingTop,
                minHeight: headerHeight,
                paddingBottom: basePaddingBottom,
                alignItems: 'center',
              }}
            >
              <HeaderTitleContainer pointerEvents="none">
                <Animated.View
                  style={{
                    flex: 1,
                    minHeight: titleHeight,
                    // X and play share the same right edge (different rows
                    // within the header), so only reserve one button's width.
                    paddingRight: iconSizes.xl + spacing.md + spacing.xs,
                    transform: [{ translateY: headerTitleTranslateY }],
                  }}
                >
                  <Text.Headline>{factTitle}</Text.Headline>
                </Animated.View>
              </HeaderTitleContainer>
            </XStack>
          </Animated.View>
          {/* Reading-progress border: fills as the content scrolls (see
              borderScaleX). Parent header opacity fades it in with the header. */}
          {categoryColor && (
            <Animated.View
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: borderWidths.heavy,
                backgroundColor: categoryColor,
                transform: [{ translateX: borderTranslateX }, { scaleX: borderScaleX }],
                zIndex: 999,
              }}
              pointerEvents="none"
            />
          )}
        </Animated.View>
      </Animated.View>

      <Animated.ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        bounces={true}
        // Without this, a tap on a button inside a descendant (the comments
        // screen-name modal, the comment composer) is swallowed by this
        // ScrollView to dismiss the keyboard first, so it takes two taps. RN's
        // keyboard-dismiss walks the JS tree, so it reaches Modal children too
        // (see facebook/react-native#28871). 'handled' = a tap a child
        // touchable handles keeps the keyboard and fires on the first tap;
        // taps on empty space still dismiss it.
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={checkScrolledToBottom}
        scrollEventThrottle={16}
        // Feed the reading-progress border (recompute on viewport/orientation
        // and on content-size changes as comments/related load).
        onLayout={() => recomputeMaxScroll()}
        onContentSizeChange={(_w, h) => {
          contentHeightRef.current = h;
          recomputeMaxScroll();
        }}
        // Pad so content scrolls clear of whatever floats over its tail:
        // the glass bottom chrome (iOS), and — in the in-tab overlay on every
        // platform — the persistent tab-bar banner, which paints above the
        // overlay (zIndex 400). On Android useGlassChrome is false, so without
        // the overlay branch the article tail scrolls under the banner with no
        // way to clear it.
        contentContainerStyle={
          useGlassChrome
            ? {
                paddingBottom: inOverlay
                  ? Math.max(
                      bottomBarHeight,
                      insets.bottom + media.tabBarHeight + persistentBannerInset
                    )
                  : bottomBarHeight,
              }
            : inOverlay
              ? { paddingBottom: insets.bottom + media.tabBarHeight + persistentBannerInset }
              : undefined
        }
        // NO removeClippedSubviews here: on Android Fabric, removing clipped
        // children while the screen's fragment is being torn down (closing
        // this screen) is a native crash class — and the prop is unsupported
        // together with stickyHeaderIndices anyway. Fabric handles offscreen
        // content well enough without it.
        stickyHeaderIndices={!hasImage ? [0] : undefined}
      >
        {/* Sticky title for no-image layout (direct child at index 0 for stickyHeaderIndices) */}
        {!hasImage && (
          <View
            style={{
              backgroundColor: theme === 'dark' ? hexColors.dark.surface : hexColors.light.surface,
              paddingTop: spacing.xl,
              paddingHorizontal: spacing.xl,
              paddingBottom: spacing.md,
            }}
          >
            <View style={{ position: 'relative' }}>
              <View style={{ paddingRight: iconSizes.xl + spacing.md + spacing.xs }}>
                <Text.Headline
                  role="heading"
                  onTextLayout={(e) => {
                    const lines = e.nativeEvent.lines;
                    const totalHeight = lines.reduce((sum, line) => sum + line.height, 0);
                    if (totalHeight > 0 && totalHeight !== titleHeight) {
                      setTitleHeight(totalHeight);
                    }
                  }}
                >
                  {factTitle}
                </Text.Headline>
              </View>
            </View>
            {/* Same reading-progress border as the has-image header, anchored to
                the sticky title's base so no-image facts get the indicator too. */}
            {categoryColor && (
              <Animated.View
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: borderWidths.heavy,
                  backgroundColor: categoryColor,
                  transform: [{ translateX: borderTranslateX }, { scaleX: borderScaleX }],
                }}
                pointerEvents="none"
              />
            )}
          </View>
        )}

        {/* Main content: hero image (if any) + text content */}
        <View>
          {/* Hero Image */}
          {hasImage && (
            <Animated.View
              style={{
                position: 'relative',
                overflow: 'hidden',
                width: IMAGE_WIDTH,
                height: IMAGE_HEIGHT,
                opacity: bodyImageOpacity,
              }}
            >
              {/* Loading placeholder rendered BEHIND the image (not as an overlay
                  on top). This is the structural fix for the Android same-uri
                  race: even if the front image's onLoad/onDisplay callbacks are
                  dropped, the decoded bitmap paints OVER this layer, so the
                  image is never hidden by the placeholder. The error/retry UI
                  (which is interactive and shown when there is genuinely no
                  image) still renders on top, further below. */}
              {showImagePlaceholder && !isImageFailed && (
                <View
                  pointerEvents="none"
                  style={{
                    ...absoluteFillObject,
                    backgroundColor: theme === 'dark' ? '#1a1a2e' : '#e8e8f0',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isActivelyLoading && (
                    <Animated.View
                      style={[
                        StyleSheet.absoluteFill,
                        {
                          backgroundColor: theme === 'dark' ? '#2d2d44' : '#d0d0e0',
                          opacity: shimmerAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.3, 0.6],
                          }),
                        },
                      ]}
                    />
                  )}
                  <ImagePlus
                    size={iconSizes.xl}
                    color={theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)'}
                  />
                </View>
              )}
              <Animated.View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  transform: [{ scale: imageScale }, { translateY: imageTranslateY }],
                }}
              >
                {/* Back layer: last successfully loaded image (prevents flash during swap) */}
                {displayedImageUri && displayedImageUri !== imageUri && (
                  <Image
                    source={{ uri: displayedImageUri }}
                    aria-hidden
                    style={{
                      ...absoluteFillObject,
                      width: IMAGE_WIDTH,
                      height: isTablet ? IMAGE_HEIGHT : IMAGE_WIDTH,
                    }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey="modal-main-back"
                  />
                )}
                {/* Front layer: current/loading image */}
                <Image
                  key={`modal-main-${retryCount}`}
                  source={frontImageSource}
                  aria-label={t('a11y_factImage', { title: factTitle })}
                  role="img"
                  style={{
                    width: IMAGE_WIDTH,
                    height: isTablet ? IMAGE_HEIGHT : IMAGE_WIDTH,
                  }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  // Same rationale as the hero above: with a back-buffered
                  // cached image already on screen, fading the front layer in
                  // produces a visible flash on Android (the two layers decode
                  // from different sources — file:// vs remote disk-cached URL —
                  // so any opacity transition between them is perceptible).
                  // Fade only on a true first-time load (no cache hit).
                  transition={displayedImageUri ? 0 : 200}
                  recyclingKey="modal-main"
                  placeholder={
                    !displayedImageUri && !isImageLoaded
                      ? { blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }
                      : undefined
                  }
                  onLoad={() => {
                    setIsImageLoaded(true);
                    setHasPainted(true);
                    setDisplayedImageUri(imageUri);
                  }}
                  onDisplay={() => {
                    // expo-image v56 + Glide on Android can drop the onLoad
                    // dispatch on this front layer when a same-uri Image
                    // (the modal-hero background copy) co-mounts in the same
                    // commit — leaving isImageLoaded false, so the opaque
                    // placeholder overlay stays on top and the front image
                    // reads as blank (until scroll reveals the background copy).
                    // onDisplay fires when the bitmap is actually painted to
                    // THIS view, surviving the race, so it reliably clears the
                    // placeholder. Idempotent with onLoad.
                    setIsImageLoaded(true);
                    setHasPainted(true);
                    setDisplayedImageUri(imageUri);
                  }}
                  onError={() => {
                    if (retryCount < MAX_IMAGE_RETRIES) {
                      // Backoff, then bump retryCount → key+source change →
                      // front <Image> remounts and re-fetches. isImageError
                      // stays false during the retry window, so the availability
                      // effect's reveal() backstop and the shimmer placeholder
                      // remain armed and hasImage stays true (no layout thrash).
                      const delay = RETRY_BASE_DELAY_MS * (retryCount + 1);
                      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
                      retryTimerRef.current = setTimeout(() => {
                        setRetryCount((c) => c + 1);
                      }, delay);
                    } else if (imageUri) {
                      // Exhausted retries on this source → try the other one
                      // (remote ↔ disk cache); only errors out when no untried
                      // source remains.
                      tryNextImageSource(imageUri).catch(() => setIsImageError(true));
                    } else {
                      setIsImageError(true);
                    }
                  }}
                />
              </Animated.View>
              {/* Gradient overlay */}
              <LinearGradient
                colors={['rgba(0,0,0,0.5)', 'transparent', 'transparent']}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: media.buttonHeight + media.tabBarHeight,
                }}
                pointerEvents="none"
              />
              {/* Error / retry overlay — stays ON TOP because on a genuine load
                  failure there is no image to show, and this control is tappable
                  to retry. Only shown on error, never during normal loading. */}
              {isImageFailed && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    setRetryCount(0); // re-arm a fresh round of auto-retries
                    triedUrisRef.current.clear(); // re-arm the source fallback chain
                    setFallbackUri(null); // start over from the resolved source
                    setIsImageError(false);
                    setIsImageLoaded(false);
                  }}
                  style={{
                    ...absoluteFillObject,
                    backgroundColor: theme === 'dark' ? '#1a1a2e' : '#e8e8f0',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <RefreshCw
                    size={iconSizes.xl}
                    color={theme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.25)'}
                  />
                </TouchableOpacity>
              )}
            </Animated.View>
          )}

          {/* Content Section */}
          <YStack padding={spacing.xl} paddingTop={spacing.lg} gap={spacing.md}>
            {/* Title - shown in content only when has image (no-image uses sticky title above) */}
            {hasImage && (
              <View style={{ position: 'relative' }}>
                <Animated.View
                  style={{
                    opacity: contentTitleOpacity,
                    paddingRight: iconSizes.xl + spacing.md + spacing.xs,
                  }}
                >
                  <Text.Headline
                    role="heading"
                    onTextLayout={(e) => {
                      const lines = e.nativeEvent.lines;
                      const totalHeight = lines.reduce((sum, line) => sum + line.height, 0);
                      if (totalHeight > 0 && totalHeight !== titleHeight) {
                        setTitleHeight(totalHeight);
                      }
                    }}
                  >
                    {factTitle}
                  </Text.Headline>
                </Animated.View>
              </View>
            )}

            {/* Category Badge & Date */}
            {(categoryForBadge || fact.created_at) && (
              <XStack
                flexWrap="wrap"
                alignItems="center"
                justifyContent="space-between"
                width="100%"
              >
                {categoryForBadge && (
                  <Animated.View style={{ opacity: categoryBadgeOpacity }}>
                    <CategoryBadge category={categoryForBadge} />
                  </Animated.View>
                )}
                {fact.created_at && (
                  <XStack alignItems="center" gap={spacing.xs}>
                    <Text.Body
                      fontSize={typography.fontSize.label}
                      color="$textSecondary"
                      fontFamily={FONT_FAMILIES.semibold}
                    >
                      {formatLastUpdated(fact.created_at, locale)}
                    </Text.Body>
                    <Calendar size={iconSizes.xs} color="$textSecondary" />
                  </XStack>
                )}
              </XStack>
            )}

            {/* Summary */}
            {fact.summary && (
              <Text.Body
                color="$text"
                fontFamily={FONT_FAMILIES.semibold}
                marginVertical={typography.fontSize.body}
                fontSize={typography.fontSize.body * 1.1}
              >
                {fact.summary}
              </Text.Body>
            )}

            {/* Main Content — '\n\u200B' appended to work around Fabric iOS text clipping bug
               (RN #53450) where the last line's characters aren't rendered despite space being allocated.
               Negative marginBottom compensates for the extra invisible line. */}
            <Text.Body
              color="$text"
              fontFamily={FONT_FAMILIES.regular}
              marginBottom={-typography.lineHeight.body}
            >
              {fact.content + '\n\u200B'}
            </Text.Body>

            {/* Source link */}
            {fact.source_url && (
              <View style={{ alignSelf: 'flex-start' }}>
                <Pressable
                  onPress={() => handleSourcePress(fact.source_url!)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.6 : 1,
                    backgroundColor: pressed
                      ? theme === 'dark'
                        ? 'rgba(255,255,255,0.05)'
                        : 'rgba(0,0,0,0.03)'
                      : 'transparent',
                    borderRadius: radius.sm,
                    padding: spacing.sm,
                  })}
                >
                  <XStack alignItems="center" gap={spacing.sm}>
                    <ExternalLink
                      size={iconSizes.sm}
                      color={
                        theme === 'dark'
                          ? hexColors.dark.textSecondary
                          : hexColors.light.textSecondary
                      }
                    />
                    <Text.Label
                      color="$textSecondary"
                      numberOfLines={1}
                      fontFamily={FONT_FAMILIES.regular}
                    >
                      {extractDomain(fact.source_url)}
                    </Text.Label>
                  </XStack>
                </Pressable>
              </View>
            )}

            {/* Appended tail (comments + "more from category"). Measured so its
                height can be excluded from the progress border's content length —
                the border tracks the article, not these sections. Same gap as the
                parent YStack so spacing is unchanged. */}
            <View
              style={{ gap: spacing.md }}
              onLayout={(e) => {
                tailHeightRef.current = e.nativeEvent.layout.height;
                recomputeMaxScroll();
              }}
            >
              {/* Comments */}
              <FactComments factId={fact.id} categoryColor={categoryColor} />

              {/* Related Facts */}
              {relatedFacts.length > 0 && onRelatedFactPress && (
                <RelatedFacts
                  facts={relatedFacts}
                  onFactPress={onRelatedFactPress}
                  categoryColor={categoryColor}
                  categoryIcon={fact.categoryData?.icon}
                  categoryName={fact.categoryData?.name || slugToTitleCase(fact.category || '')}
                  containerWidth={containerWidth}
                />
              )}
            </View>
          </YStack>
        </View>
      </Animated.ScrollView>

      {/* Cover overlay during fact-to-fact navigation. Rendered on top of the
          sticky header + scroll content but BELOW the close button, banner ad,
          and action bar (those are rendered after this in the tree, so they
          stay visible during the cover-and-reveal). */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: theme === 'dark' ? hexColors.dark.surface : hexColors.light.surface,
          opacity: overlayOpacity,
        }}
      />

      {/* Fixed Close Button - always visible for easy dismissal */}
      <View
        style={{
          position: 'absolute',
          // Aligns with the header top via the shared basePaddingTop.
          top: basePaddingTop,
          right: spacing.xl,
          zIndex: 9999,
          ...Platform.select({
            android: {
              elevation: 999, // Much higher than any other element to receive touches
            },
          }),
        }}
        collapsable={false}
        pointerEvents="box-none"
      >
        <CloseButton onPress={onClose} testID="fact-modal-close-button" />
      </View>

      {/* Bottom chrome: banner + action bar. With Liquid Glass it floats over
          the scrolling content so the glass bar refracts it; otherwise it stays
          an in-flow footer exactly as before. */}
      <View
        style={useGlassChrome ? { position: 'absolute', left: 0, right: 0, bottom: 0 } : undefined}
        onLayout={
          useGlassChrome
            ? (e) => {
                const h = Math.ceil(e.nativeEvent.layout.height);
                if (h !== bottomBarHeight) setBottomBarHeight(h);
              }
            : undefined
        }
      >
        {/* In the overlay the persistent tab-bar banner shows above this chrome;
            don't render a second one. On the card/modal routes (banner occluded)
            this is the fact-detail banner as before. */}
        {!inOverlay && <BannerAd placement="fact_modal" />}

        <FactActions
          factId={fact.id}
          factSlug={fact.slug}
          factTitle={fact.title}
          factContent={fact.content}
          imageUrl={imageUri || undefined}
          category={fact.categoryData || fact.category}
          sourceUrl={fact.source_url || undefined}
          onNext={onNext}
          onPrevious={onPrevious}
          hasNext={hasNext}
          hasPrevious={hasPrevious}
          currentIndex={currentIndex}
          totalCount={totalCount}
          audioController={audioController}
          onReportPress={() => setShowReportModal(true)}
        />
      </View>

      {/* Premium content gate — blurs everything for free users viewing premium facts */}
      {!isPremium && !adUnlocked && !!fact.categoryData?.is_premium && (
        <PremiumGateOverlay
          factId={fact.id}
          categorySlug={fact.categoryData?.slug}
          onClose={onClose}
          onAdUnlock={() => setAdUnlocked(true)}
        />
      )}

      {/* Root-level so the dialog's inline overlay covers the whole screen */}
      <ReportFactModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleSubmitReport}
        isSubmitting={isSubmittingReport}
      />
    </View>
  );
}

function PremiumGateOverlay({
  factId,
  categorySlug,
  onClose,
  onAdUnlock,
}: {
  factId: number;
  categorySlug?: string;
  onClose: () => void;
  onAdUnlock: () => void;
}) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, radius, iconSizes, media, maxModalWidth } = useResponsive();
  const isDark = theme === 'dark';
  const [premiumCategoryCount, setPremiumCategoryCount] = useState(0);
  const [isLoadingAd, setIsLoadingAd] = useState(false);
  const adUnlockedRef = useRef(false);

  useEffect(() => {
    // Premium category count comes from server metadata now (no local table).
    api
      .getMetadata()
      .then((meta) => setPremiumCategoryCount(meta.categories.filter((c) => c.is_premium).length))
      .catch(() => {});
  }, []);

  const handleWatchAd = useCallback(async () => {
    setIsLoadingAd(true);
    try {
      trackPremiumGateAdShown({ factId, categorySlug });
      const rewarded = await showRewardedAd();
      trackPremiumGateAdResult({ factId, rewarded, categorySlug });
      if (rewarded) {
        adUnlockedRef.current = true;
        onAdUnlock();
      }
    } finally {
      setIsLoadingAd(false);
    }
  }, [factId, categorySlug, onAdUnlock]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Standardized scrim (Liquid Glass / BlurView / Android rgba). No
          onPress: the gate is NOT backdrop-dismissible — closing is only via
          the explicit goBack link below. */}
      <ModalBackdrop
        isDark={isDark}
        blurIntensity={isDark ? 50 : 70}
        androidScrim={isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.55)'}
      />
      <View
        style={{
          ...absoluteFillObject,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: spacing.xl,
        }}
      >
        <Reanimated.View
          entering={FadeInUp.duration(180)}
          style={{ width: '100%', alignItems: 'center' }}
        >
          <DialogCard style={{ maxWidth: maxModalWidth * 0.9 }}>
            <YStack alignItems="center" gap={spacing.lg} padding={spacing.xl}>
              <Crown
                size={iconSizes.hero}
                color={PAYWALL_GOLD.primary}
                fill={PAYWALL_GOLD.primary}
              />
              <Text.Title textAlign="center" color="$text">
                {t('premiumGateTitle')}
              </Text.Title>
              <Text.Body textAlign="center" color="$textSecondary">
                {t('premiumGateDescription', { count: premiumCategoryCount })}
              </Text.Body>
              <Pressable
                onPress={() => router.push('/paywall')}
                style={({ pressed }) => ({
                  alignSelf: 'center',
                  overflow: 'hidden',
                  borderRadius: radius.xl,
                  opacity: pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                  ...Platform.select({
                    ios: {
                      shadowColor: PAYWALL_GOLD.primary,
                      shadowOffset: { width: 0, height: spacing.xs },
                      shadowOpacity: 0.4,
                      shadowRadius: spacing.md,
                    },
                    android: {
                      elevation: 8,
                    },
                  }),
                })}
              >
                <LinearGradient
                  colors={[PAYWALL_GOLD.dark, PAYWALL_GOLD.primary, PAYWALL_GOLD.light]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    // paddingVertical: spacing.md,
                    paddingHorizontal: spacing.xl,
                    alignItems: 'center',
                    height: media.buttonHeight * 0.9,
                    justifyContent: 'center',
                  }}
                >
                  <Text.Label color="#000000" fontFamily={FONT_FAMILIES.semibold}>
                    {t('unlockPremium')}
                  </Text.Label>
                </LinearGradient>
              </Pressable>
              <Pressable
                onPress={handleWatchAd}
                disabled={isLoadingAd}
                style={({ pressed }) => ({
                  alignSelf: 'center',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.xs,
                  paddingVertical: spacing.sm,
                  opacity: isLoadingAd ? 0.5 : pressed ? 0.7 : 1,
                })}
              >
                {isLoadingAd ? (
                  <ActivityIndicator size="small" color={PAYWALL_GOLD.primary} />
                ) : (
                  <Play size={14} color={PAYWALL_GOLD.primary} fill={PAYWALL_GOLD.primary} />
                )}
                <Text.Caption color={PAYWALL_GOLD.primary} fontFamily={FONT_FAMILIES.semibold}>
                  {t('watchAdToRead')}
                </Text.Caption>
              </Pressable>
              <Pressable
                onPress={() => {
                  onClose();
                }}
                hitSlop={{
                  top: spacing.sm,
                  bottom: spacing.sm,
                  left: spacing.lg,
                  right: spacing.lg,
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.7 })}
              >
                <Text.Caption color="$textSecondary">{t('goBack')}</Text.Caption>
              </Pressable>
            </YStack>
          </DialogCard>
        </Reanimated.View>
      </View>
    </View>
  );
}
