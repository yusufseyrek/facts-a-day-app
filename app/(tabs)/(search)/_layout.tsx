import { Stack } from 'expo-router';

import { useGlassHeaderOptions } from '../../../src/hooks/useGlassHeaderOptions';
import { useTranslation } from '../../../src/i18n';

export default function SearchStackLayout() {
  const headerOptions = useGlassHeaderOptions();
  const { t } = useTranslation();

  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="search" options={{ title: t('search') }} />
    </Stack>
  );
}
