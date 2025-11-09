import { Text, styled } from '@tamagui/core';
import { tokens } from '../theme/tokens';

export const H1 = styled(Text, {
  fontSize: tokens.fontSize.h1,
  fontWeight: tokens.fontWeight.bold,
  color: '$text',
  lineHeight: tokens.fontSize.h1 * 1.3,
});

export const H2 = styled(Text, {
  fontSize: tokens.fontSize.h2,
  fontWeight: tokens.fontWeight.bold,
  color: '$text',
  lineHeight: tokens.fontSize.h2 * 1.3,
});

export const BodyText = styled(Text, {
  fontSize: tokens.fontSize.body,
  fontWeight: tokens.fontWeight.regular,
  color: '$textSecondary',
  lineHeight: tokens.fontSize.body * 1.5,
});

export const LabelText = styled(Text, {
  fontSize: tokens.fontSize.label,
  fontWeight: tokens.fontWeight.medium,
  color: '$text',
  lineHeight: tokens.fontSize.label * 1.3,
});
