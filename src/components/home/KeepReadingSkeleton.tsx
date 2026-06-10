import React from 'react';
import { StyleSheet, View } from 'react-native';

import { LAYOUT } from '../../config/app';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { ShimmerPlaceholder } from '../ShimmerPlaceholder';

interface KeepReadingSkeletonProps {
  rows?: number;
}

export const KeepReadingSkeleton = React.memo(function KeepReadingSkeleton({
  rows = 5,
}: KeepReadingSkeletonProps) {
  const { theme } = useTheme();
  const { spacing, media } = useResponsive();
  const colors = hexColors[theme];

  const imageSize = media.keepReadingImageSize;

  return (
    <>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.centered}>
          <View
            style={[
              styles.row,
              {
                padding: spacing.xl,
                // Same zebra rule as KeepReadingList (isOdd = index % 2 === 0).
                backgroundColor: index % 2 === 0 ? `${colors.cardBackground}70` : 'transparent',
              },
            ]}
          >
            <View style={[styles.textContainer, { marginRight: spacing.md }]}>
              <ShimmerPlaceholder
                width="35%"
                height={12}
                borderRadius={4}
                style={{ marginBottom: spacing.xs }}
              />
              <ShimmerPlaceholder
                width="95%"
                height={16}
                borderRadius={4}
                style={{ marginBottom: spacing.xs }}
              />
              <ShimmerPlaceholder width="70%" height={16} borderRadius={4} />
            </View>
            <ShimmerPlaceholder width={imageSize} height={imageSize} borderRadius={spacing.sm} />
          </View>
        </View>
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  centered: {
    maxWidth: LAYOUT.MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
});
