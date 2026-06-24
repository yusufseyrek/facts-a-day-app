import { StyleSheet, View } from 'react-native';

import FactDetailScreen from '../../../app/fact/[id]';
import { closeFactOverlay, useFactOverlay } from '../../services/factMorph';

import { FactMorphContainer } from './FactMorphContainer';

/**
 * Hosts the fact-detail "morph" as an in-(tabs) overlay instead of a native
 * modal route, so the persistent tab-bar banner (rendered ABOVE this in the
 * tabs layout) stays mounted and visible throughout — only the bar beneath it
 * swaps from the native tab bar to the fact action bar. A native modal would
 * paint over the banner; this in-tree overlay sits below it.
 *
 * Mounted once in the tabs layout, below the banner (zIndex < the banner's).
 * Renders nothing until a card opens a fact via openFactOverlay().
 */
export function FactMorphOverlayHost() {
  const overlay = useFactOverlay();
  if (!overlay) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.host]}>
      <FactMorphContainer source={overlay.source} onDismiss={closeFactOverlay}>
        <FactDetailScreen
          overlay={{
            id: String(overlay.factId),
            source: overlay.viewSource,
            factIds: overlay.factIds,
            currentIndex: overlay.currentIndex,
          }}
        />
      </FactMorphContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  // Below the persistent banner (zIndex 400) and the progress bar (500), above
  // the tab content + native tab bar (which it covers, replacing the bar with
  // the fact action bar).
  host: { zIndex: 350 },
});
