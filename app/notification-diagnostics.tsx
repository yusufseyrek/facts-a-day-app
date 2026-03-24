import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft } from '@tamagui/lucide-icons';
import * as Localization from 'expo-localization';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { YStack } from 'tamagui';

import { ContentContainer } from '../src/components/ScreenLayout';
import { FONT_FAMILIES, Text } from '../src/components/Typography';
import { getLocaleFromCode } from '../src/i18n';
import {
  clearSyncLog,
  type DiagnosticsState,
  ensureNotificationSchedule,
  getNotificationDiagnostics,
  getSyncLog,
  scheduleTestNotification,
  type SyncLogEntry,
} from '../src/services/notifications';
import { hexColors, useTheme } from '../src/theme';
import { useResponsive } from '../src/utils/useResponsive';

function getLocale() {
  const deviceLocale = Localization.getLocales()[0]?.languageCode || 'en';
  return getLocaleFromCode(deviceLocale);
}

export default function NotificationDiagnosticsScreen() {
  const { theme } = useTheme();
  const colors = hexColors[theme];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { spacing } = useResponsive();

  const [diagnostics, setDiagnostics] = useState<DiagnosticsState | null>(null);
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const locale = getLocale();
      const [diag, log] = await Promise.all([
        getNotificationDiagnostics(locale),
        getSyncLog(),
      ]);
      setDiagnostics(diag);
      setSyncLog(log);
    } catch (error) {
      console.error('Failed to load diagnostics:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleForceReschedule = async () => {
    try {
      setLoading(true);
      const locale = getLocale();
      const result = await ensureNotificationSchedule(locale, 'unknown', { forceReschedule: true });
      Alert.alert('Rescheduled', `Scheduled ${result.count} notifications.\nSuccess: ${result.success}${result.error ? `\nError: ${result.error}` : ''}`);
      await loadData();
    } catch (error) {
      Alert.alert('Error', String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleForceSync = async () => {
    try {
      setLoading(true);
      const locale = getLocale();
      const result = await ensureNotificationSchedule(locale, 'unknown');
      Alert.alert('Synced', `Count: ${result.count}\nSuccess: ${result.success}\nRepaired: ${result.repaired ?? false}\nSkipped: ${result.skipped ?? false}${result.error ? `\nError: ${result.error}` : ''}`);
      await loadData();
    } catch (error) {
      Alert.alert('Error', String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleTestNotification = async () => {
    try {
      const id = await scheduleTestNotification();
      Alert.alert('Scheduled', `Test notification scheduled for 30s from now.\nID: ${id.substring(0, 12)}...`);
    } catch (error) {
      Alert.alert('Error', String(error));
    }
  };

  const handleDumpTriggers = async () => {
    const allNotifs = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of allNotifs.slice(0, 5)) {
      if (__DEV__) {
        console.log('🔔 RAW TRIGGER:', JSON.stringify(notif.trigger, null, 2));
        console.log('🔔 RAW TRIGGER KEYS:', Object.keys(notif.trigger ?? {}));
      }
    }
    Alert.alert('Dumped', `Logged ${Math.min(allNotifs.length, 5)} triggers to console.`);
  };

  const handleClearLog = async () => {
    await clearSyncLog();
    setSyncLog([]);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  };

  const formatTimeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text.Title color={colors.text} style={styles.headerTitle}>
          Notification Diagnostics
        </Text.Title>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: spacing.lg }}
      >
        <ContentContainer>
          {/* Current State */}
          <SectionHeader title="Current State" color={colors.text} />

          {diagnostics ? (
            <YStack gap={spacing.sm}>
              <InfoRow label="OS Notifications" value={String(diagnostics.osCount)} colors={colors} />
              <InfoRow label="DB Scheduled" value={String(diagnostics.dbCount)} colors={colors} />
              <InfoRow
                label="Preferred Times"
                value={diagnostics.preferredTimes.map((t) => {
                  const d = new Date(t);
                  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                }).join(', ') || 'None'}
                colors={colors}
              />
              <InfoRow
                label="Mismatches"
                value={String(diagnostics.mismatches.length)}
                colors={colors}
                highlight={diagnostics.mismatches.length > 0}
              />

              {diagnostics.mismatches.length > 0 && (
                <YStack gap={4} paddingLeft={spacing.sm}>
                  {diagnostics.mismatches.slice(0, 10).map((m, i) => (
                    <Text.Caption key={i} color="#F59E0B">
                      [{m.type}] {m.details}
                    </Text.Caption>
                  ))}
                </YStack>
              )}

              <SectionHeader title="Next 5 OS Notifications" color={colors.text} />
              {diagnostics.osNotifications.slice(0, 5).map((n, i) => (
                <View key={i} style={[styles.logEntry, { backgroundColor: colors.surface }]}>
                  <Text.Caption color={colors.textSecondary}>
                    {n.triggerDate ? formatDate(n.triggerDate) : 'No trigger date'}
                  </Text.Caption>
                  <Text.Caption color={colors.text} numberOfLines={1}>
                    {n.title || '(no title)'}
                  </Text.Caption>
                  <Text.Caption color={colors.textSecondary}>
                    ID: {n.id.substring(0, 16)}...
                  </Text.Caption>
                  <Text.Caption color={colors.textSecondary} numberOfLines={3}>
                    Trigger: {n.rawTrigger}
                  </Text.Caption>
                </View>
              ))}
              {diagnostics.osNotifications.length === 0 && (
                <Text.Caption color={colors.textSecondary}>No OS notifications scheduled</Text.Caption>
              )}

              <SectionHeader title="Next 5 DB Scheduled" color={colors.text} />
              {diagnostics.dbScheduled.slice(0, 5).map((f, i) => (
                <View key={i} style={[styles.logEntry, { backgroundColor: colors.surface }]}>
                  <Text.Caption color={colors.textSecondary}>
                    {formatDate(f.scheduled_date)}
                  </Text.Caption>
                  <Text.Caption color={colors.text}>
                    Fact #{f.id} | notif_id: {f.notification_id ? f.notification_id.substring(0, 12) + '...' : 'NULL'}
                  </Text.Caption>
                </View>
              ))}
              {diagnostics.dbScheduled.length === 0 && (
                <Text.Caption color={colors.textSecondary}>No DB scheduled facts</Text.Caption>
              )}
            </YStack>
          ) : (
            <Text.Body color={colors.textSecondary}>
              {loading ? 'Loading...' : 'Failed to load diagnostics'}
            </Text.Body>
          )}

          {/* Actions */}
          <SectionHeader title="Actions" color={colors.text} />
          <YStack gap={spacing.sm}>
            <ActionButton
              label="Force Sync"
              onPress={handleForceSync}
              colors={colors}
              disabled={loading}
            />
            <ActionButton
              label="Force Reschedule"
              onPress={handleForceReschedule}
              colors={colors}
              disabled={loading}
            />
            <ActionButton
              label="Test Notification (30s)"
              onPress={handleTestNotification}
              colors={colors}
              disabled={loading}
            />
            <ActionButton
              label="Dump Triggers (console)"
              onPress={handleDumpTriggers}
              colors={colors}
              disabled={loading}
            />
            <ActionButton
              label="Refresh"
              onPress={loadData}
              colors={colors}
              disabled={loading}
            />
          </YStack>

          {/* Sync Log */}
          <View style={styles.logHeader}>
            <SectionHeader title={`Sync Log (${syncLog.length})`} color={colors.text} />
            {syncLog.length > 0 && (
              <Pressable onPress={handleClearLog}>
                <Text.Caption color={colors.primary}>Clear</Text.Caption>
              </Pressable>
            )}
          </View>

          {syncLog.length === 0 ? (
            <Text.Caption color={colors.textSecondary}>No sync events recorded yet</Text.Caption>
          ) : (
            <YStack gap={spacing.xs}>
              {[...syncLog].reverse().slice(0, 20).map((entry, i) => (
                <View key={i} style={[styles.logEntry, { backgroundColor: colors.surface }]}>
                  <View style={styles.logEntryHeader}>
                    <Text.Caption color={colors.primary} fontFamily={FONT_FAMILIES.semibold}>
                      {entry.action.toUpperCase()}
                    </Text.Caption>
                    <Text.Caption color={colors.textSecondary}>
                      {formatTimeAgo(entry.timestamp)}
                    </Text.Caption>
                  </View>
                  <Text.Caption color={colors.text}>
                    Source: {entry.source} | Valid: {entry.scheduleValid === undefined ? '-' : String(entry.scheduleValid)}
                  </Text.Caption>
                  <Text.Caption color={colors.textSecondary}>
                    OS: {entry.osCountBefore ?? '-'} → {entry.osCountAfter ?? '-'} | DB: {entry.dbCount ?? '-'}
                    {entry.toppedUp ? ` | +${entry.toppedUp}` : ''}
                    {entry.repaired ? ' | REPAIRED' : ''}
                    {entry.skipped ? ' | SKIPPED' : ''}
                  </Text.Caption>
                  {entry.error && (
                    <Text.Caption color="#EF4444">{entry.error}</Text.Caption>
                  )}
                </View>
              ))}
            </YStack>
          )}
        </ContentContainer>
      </ScrollView>
    </View>
  );
}

function SectionHeader({ title, color }: { title: string; color: string }) {
  return (
    <Text.Headline color={color} style={styles.sectionHeader}>
      {title}
    </Text.Headline>
  );
}

function InfoRow({
  label,
  value,
  colors,
  highlight,
}: {
  label: string;
  value: string;
  colors: { text: string; textSecondary: string; surface: string };
  highlight?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Text.Body color={colors.textSecondary}>{label}</Text.Body>
      <Text.Body
        color={highlight ? '#F59E0B' : colors.text}
        fontFamily={FONT_FAMILIES.semibold}
      >
        {value}
      </Text.Body>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  colors,
  disabled,
}: {
  label: string;
  onPress: () => void;
  colors: { primary: string; surface: string; border: string; text: string };
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.actionButton,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Text.Body color={colors.primary} fontFamily={FONT_FAMILIES.semibold}>
        {label}
      </Text.Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  sectionHeader: {
    marginTop: 20,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logEntry: {
    padding: 10,
    borderRadius: 8,
    gap: 2,
  },
  logEntryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
});
