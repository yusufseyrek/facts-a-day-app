import { Text, styled } from '@tamagui/core';
import { tokens } from '../theme/tokens';

export const H1 = styled(Text, {
  fontFamily: 'SourceSansPro_700Bold',
  fontSize: tokens.fontSize.h1,
  fontWeight: tokens.fontWeight.bold,
  color: '$text',
  lineHeight: tokens.fontSize.h1 * 1.25,
});

export const H2 = styled(Text, {
  fontFamily: 'SourceSansPro_700Bold',
  fontSize: tokens.fontSize.h2,
  fontWeight: tokens.fontWeight.bold,
  color: '$text',
  lineHeight: tokens.fontSize.h2 * 1.25,
});

export const BodyText = styled(Text, {
  fontFamily: 'SourceSansPro_400Regular',
  fontSize: tokens.fontSize.body,
  fontWeight: tokens.fontWeight.regular,
  color: '$textSecondary',
  lineHeight: tokens.fontSize.body * 1.6,
});

export const LabelText = styled(Text, {
  fontFamily: 'SourceSansPro_600SemiBold',
  fontSize: tokens.fontSize.label,
  fontWeight: tokens.fontWeight.medium,
  color: '$text',
  lineHeight: tokens.fontSize.label * 1.4,
});

export const SerifTitle = styled(Text, {
  fontFamily: 'NotoSerif_700Bold',
  fontSize: tokens.fontSize.h2,
  fontWeight: tokens.fontWeight.bold,
  color: '$text',
  lineHeight: tokens.fontSize.h2 * 1.35,
});
