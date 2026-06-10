export const absoluteFillObject = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
} as const;

/**
 * Material ripple for Pressables on Android (no-op prop on iOS). The Pressable
 * itself must carry borderRadius + overflow:'hidden' so the ripple clips to
 * the control. Pair with iOS-gated opacity feedback so Android doesn't get
 * double feedback (ripple + dim).
 */
export const androidRipple = (isDark: boolean) =>
  ({
    color: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    borderless: false,
  }) as const;
