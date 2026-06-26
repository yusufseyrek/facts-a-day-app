import { Stack } from 'expo-router';

import { HeaderQueueButton } from '../../../src/components/player/HeaderQueueButton';
import { useGlassHeaderOptions } from '../../../src/hooks/useGlassHeaderOptions';
import { useTranslation } from '../../../src/i18n';

export default function FavoritesStackLayout() {
  const headerOptions = useGlassHeaderOptions();
  const { t } = useTranslation();

  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen
        name="favorites"
        options={{ title: t('favorites'), headerLeft: () => <HeaderQueueButton /> }}
      />
    </Stack>
  );
}
