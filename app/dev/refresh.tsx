import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocalSearchParams } from 'expo-router';

import { FactBulb } from '../../src/components/home/FactBulb';
import { hexColors } from '../../src/theme';
import { useThemeName } from '../../src/theme/ThemeProvider';

/**
 * Dev-only playground for the pull-to-refresh logo. Not linked anywhere — reach
 * it with `factsaday://dev/refresh`. Optional params drive a fixed keyframe for
 * screenshots: `?p=0.5` (pull progress) and `?r=1` (refreshing on).
 */
export default function RefreshPreview() {
  const theme = useThemeName();
  const colors = hexColors[theme];
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ p?: string; r?: string }>();

  const progress = useSharedValue(params.p ? Number(params.p) : 0);
  const active = useSharedValue(params.r === '1' ? 1 : 0);
  const [refreshing, setRefreshing] = useState(params.r === '1');

  useEffect(() => {
    active.value = withTiming(refreshing ? 1 : 0, { duration: refreshing ? 420 : 320 });
  }, [refreshing, active]);

  // Let repeat deep links re-drive the keyframe without a remount, so each
  // `factsaday://dev/refresh?...` updates the live state.
  useEffect(() => {
    if (params.p !== undefined) {
      setRefreshing(false);
      progress.value = withTiming(Number(params.p), { duration: 260 });
    }
  }, [params.p, progress]);
  useEffect(() => {
    if (params.r !== undefined) {
      progress.value = 0;
      setRefreshing(params.r === '1');
    }
  }, [params.r, progress]);

  const setPull = (v: number) => {
    setRefreshing(false);
    progress.value = withTiming(v, { duration: 260 });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 24 }]}>
      <Text style={[styles.title, { color: colors.text }]}>Pull-to-refresh logo</Text>

      <View style={styles.stage}>
        <FactBulb
          progress={progress}
          active={active}
          refreshing={refreshing}
          size={180}
          theme={theme}
        />
      </View>

      <View style={styles.row}>
        <Btn label="Idle" c={colors} onPress={() => setPull(0)} />
        <Btn label="½ pull" c={colors} onPress={() => setPull(0.5)} />
        <Btn label="Armed" c={colors} onPress={() => setPull(1)} />
      </View>
      <View style={styles.row}>
        <Btn
          label={refreshing ? 'Stop refresh' : 'Refresh'}
          c={colors}
          primary
          onPress={() => {
            progress.value = 0;
            setRefreshing((r) => !r);
          }}
        />
      </View>
    </View>
  );
}

function Btn({
  label,
  onPress,
  c,
  primary,
}: {
  label: string;
  onPress: () => void;
  c: Record<string, string>;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.btn,
        { borderColor: c.border, backgroundColor: primary ? c.primary : c.cardBackground },
      ]}
    >
      <Text style={{ color: primary ? '#fff' : c.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  stage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  btn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1 },
});
