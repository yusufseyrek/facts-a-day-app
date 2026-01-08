import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { X, Search, Check, Calendar, Trash2, Edit3, RefreshCw } from '@tamagui/lucide-icons';
import { useTheme } from '../../theme';
import { hexColors, spacing, radius, sizes } from '../../theme';
import { typography } from '../../utils/responsive';
import { useTranslation } from '../../i18n';
import { Text, FONT_FAMILIES } from '../Typography';
import * as database from '../../services/database';
import type { FactWithRelations } from '../../services/database';
import { triggerFeedRefresh } from '../../services/contentRefresh';
import { useResponsive } from '../../utils/useResponsive';

const ANIMATION_DURATION = 300;

interface FeedManagementModalProps {
  visible: boolean;
  onClose: () => void;
}

interface FactItemProps {
  fact: FactWithRelations;
  isSelected: boolean;
  onToggle: () => void;
  onEditTitle: () => void;
  colors: any;
  iconSizes: { sm: number; md: number; lg: number; xl: number; hero: number; heroLg: number };
}

const FactItem = React.memo(({ fact, isSelected, onToggle, onEditTitle, colors, iconSizes }: FactItemProps) => {
  const isInFeed = fact.shown_in_feed === 1 || (fact.scheduled_date && new Date(fact.scheduled_date) <= new Date());
  
  return (
    <Pressable onPress={onToggle} style={styles.factItem}>
      <View style={[styles.checkbox, { borderColor: colors.border }, isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
        {isSelected && <Check size={iconSizes.sm} color="#FFFFFF" />}
      </View>
      <View style={styles.factContent}>
        <Text.Label numberOfLines={2} color={colors.text}>
          {fact.title || fact.content.substring(0, 60) + '...'}
        </Text.Label>
        <View style={styles.factMeta}>
          <Text.Caption color={colors.textSecondary}>
            {fact.categoryData?.name || fact.category || 'Unknown'}
          </Text.Caption>
          {isInFeed && (
            <View style={[styles.inFeedBadge, { backgroundColor: colors.primary + '20' }]}>
              <Text.Caption color={colors.primary}>In Feed</Text.Caption>
            </View>
          )}
          {fact.scheduled_date && (
            <Text.Caption color={colors.textSecondary}>
              {new Date(fact.scheduled_date).toLocaleDateString()}
            </Text.Caption>
          )}
        </View>
      </View>
      <Pressable onPress={onEditTitle} style={styles.editButton} hitSlop={8}>
        <Edit3 size={iconSizes.sm} color={colors.textSecondary} />
      </Pressable>
    </Pressable>
  );
});

FactItem.displayName = 'FactItem';

export const FeedManagementModal: React.FC<FeedManagementModalProps> = ({
  visible,
  onClose,
}) => {
  const { theme } = useTheme();
  const colors = hexColors[theme];
  const { t, locale } = useTranslation();
  const { iconSizes } = useResponsive();

  const [showContent, setShowContent] = useState(false);
  const closingRef = useRef(false);
  
  const [facts, setFacts] = useState<FactWithRelations[]>([]);
  const [filteredFacts, setFilteredFacts] = useState<FactWithRelations[]>([]);
  const [selectedFactIds, setSelectedFactIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingFact, setEditingFact] = useState<FactWithRelations | null>(null);
  const [editedTitle, setEditedTitle] = useState('');

  // Load all facts
  const loadFacts = useCallback(async () => {
    setLoading(true);
    try {
      const allFacts = await database.getAllFacts(locale);
      setFacts(allFacts);
      setFilteredFacts(allFacts);
    } catch (error) {
      console.error('Error loading facts:', error);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  // Filter facts based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFacts(facts);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredFacts(
        facts.filter(
          (fact) =>
            (fact.title && fact.title.toLowerCase().includes(query)) ||
            fact.content.toLowerCase().includes(query) ||
            (fact.categoryData?.name && fact.categoryData.name.toLowerCase().includes(query))
        )
      );
    }
  }, [searchQuery, facts]);

  // Sync with external visible prop
  useEffect(() => {
    if (visible) {
      setShowContent(true);
      closingRef.current = false;
      loadFacts();
    } else if (!closingRef.current) {
      setShowContent(false);
    }
  }, [visible, loadFacts]);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setShowContent(false);
    setTimeout(() => {
      onClose();
      closingRef.current = false;
    }, ANIMATION_DURATION);
  }, [onClose]);

  const toggleFactSelection = useCallback((factId: number) => {
    setSelectedFactIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(factId)) {
        newSet.delete(factId);
      } else {
        newSet.add(factId);
      }
      return newSet;
    });
  }, []);

  const handleEditTitle = useCallback((fact: FactWithRelations) => {
    setEditingFact(fact);
    setEditedTitle(fact.title || '');
  }, []);

  const saveEditedTitle = useCallback(async () => {
    if (!editingFact) return;
    
    try {
      await database.updateFactTitle(editingFact.id, editedTitle);
      setFacts((prev) =>
        prev.map((f) =>
          f.id === editingFact.id ? { ...f, title: editedTitle } : f
        )
      );
      setEditingFact(null);
      setEditedTitle('');
    } catch (error) {
      console.error('Error updating title:', error);
      Alert.alert('Error', 'Failed to update title');
    }
  }, [editingFact, editedTitle]);

  const addToFeedWithDate = useCallback(async (daysAgo: number) => {
    if (selectedFactIds.size === 0) {
      Alert.alert('No Selection', 'Please select at least one fact');
      return;
    }

    setLoading(true);
    try {
      const now = new Date();
      let index = 0;
      
      for (const factId of selectedFactIds) {
        const scheduledDate = new Date(now);
        scheduledDate.setDate(scheduledDate.getDate() - daysAgo);
        // Stagger times throughout the day for variety
        scheduledDate.setHours(9 + (index % 3), Math.floor(Math.random() * 60), 0, 0);
        
        const notificationId = `screenshot_${factId}_${Date.now()}_${index}`;
        await database.markFactAsScheduled(factId, scheduledDate.toISOString(), notificationId);
        await database.markFactAsShown(factId);
        index++;
      }
      
      // Refresh the feed
      triggerFeedRefresh();
      
      Alert.alert(
        'Success',
        `Added ${selectedFactIds.size} fact(s) to feed${daysAgo === 0 ? ' for today' : daysAgo === 1 ? ' for yesterday' : ` for ${daysAgo} days ago`}`
      );
      
      setSelectedFactIds(new Set());
      loadFacts();
    } catch (error) {
      console.error('Error adding facts to feed:', error);
      Alert.alert('Error', 'Failed to add facts to feed');
    } finally {
      setLoading(false);
    }
  }, [selectedFactIds, loadFacts]);

  const clearFeed = useCallback(async () => {
    Alert.alert(
      'Clear Feed',
      'This will remove all facts from the feed. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await database.clearAllShownInFeed();
              triggerFeedRefresh();
              Alert.alert('Success', 'Feed cleared');
              loadFacts();
            } catch (error) {
              console.error('Error clearing feed:', error);
              Alert.alert('Error', 'Failed to clear feed');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  }, [loadFacts]);

  const selectAll = useCallback(() => {
    setSelectedFactIds(new Set(filteredFacts.map((f) => f.id)));
  }, [filteredFacts]);

  const clearSelection = useCallback(() => {
    setSelectedFactIds(new Set());
  }, []);

  const screenHeight = Dimensions.get('window').height;
  const screenWidth = Dimensions.get('window').width;

  const renderFactItem = useCallback(
    ({ item }: { item: FactWithRelations }) => (
      <FactItem
        fact={item}
        isSelected={selectedFactIds.has(item.id)}
        onToggle={() => toggleFactSelection(item.id)}
        onEditTitle={() => handleEditTitle(item)}
        colors={colors}
        iconSizes={iconSizes}
      />
    ),
    [selectedFactIds, toggleFactSelection, handleEditTitle, colors, iconSizes]
  );

  const keyExtractor = useCallback((item: FactWithRelations) => String(item.id), []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {showContent && (
          <Animated.View
            entering={FadeIn.duration(ANIMATION_DURATION)}
            exiting={FadeOut.duration(ANIMATION_DURATION)}
            style={styles.overlay}
          />
        )}
        
        {showContent && (
          <Animated.View
            entering={SlideInDown.duration(ANIMATION_DURATION)}
            exiting={SlideOutDown.duration(ANIMATION_DURATION)}
            style={[
              styles.modalContainer,
              {
                backgroundColor: colors.background,
                height: screenHeight * 0.9,
                width: screenWidth,
              },
            ]}
          >
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <Text.Title color={colors.text}>Manage Feed (DEV)</Text.Title>
              <Pressable onPress={handleClose} style={styles.closeButton}>
                <X size={iconSizes.lg} color={colors.text} />
              </Pressable>
            </View>

            {/* Search */}
            <View style={[styles.searchContainer, { backgroundColor: colors.surface }]}>
              <Search size={iconSizes.md} color={colors.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search facts..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Selection info */}
            <View style={styles.selectionInfo}>
              <Text.Caption color={colors.textSecondary}>
                {selectedFactIds.size} selected • {filteredFacts.length} facts
              </Text.Caption>
              <View style={styles.selectionActions}>
                <Pressable onPress={selectAll} style={styles.selectionButton}>
                  <Text.Caption color={colors.primary}>Select All</Text.Caption>
                </Pressable>
                <Pressable onPress={clearSelection} style={styles.selectionButton}>
                  <Text.Caption color={colors.primary}>Clear</Text.Caption>
                </Pressable>
              </View>
            </View>

            {/* Facts list */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <FlatList
                data={filteredFacts}
                keyExtractor={keyExtractor}
                renderItem={renderFactItem}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              />
            )}

            {/* Action buttons */}
            <View style={[styles.actionBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => addToFeedWithDate(0)}
                  style={[styles.actionButton, { backgroundColor: colors.primary }]}
                >
                  <Calendar size={iconSizes.sm} color="#FFFFFF" />
                  <Text.Caption color="#FFFFFF">Today</Text.Caption>
                </Pressable>
                <Pressable
                  onPress={() => addToFeedWithDate(1)}
                  style={[styles.actionButton, { backgroundColor: colors.primary }]}
                >
                  <Calendar size={iconSizes.sm} color="#FFFFFF" />
                  <Text.Caption color="#FFFFFF">Yesterday</Text.Caption>
                </Pressable>
                <Pressable
                  onPress={() => addToFeedWithDate(2)}
                  style={[styles.actionButton, { backgroundColor: colors.primary }]}
                >
                  <Calendar size={iconSizes.sm} color="#FFFFFF" />
                  <Text.Caption color="#FFFFFF">2 Days</Text.Caption>
                </Pressable>
              </View>
              <View style={styles.actionRow}>
                <Pressable
                  onPress={clearFeed}
                  style={[styles.actionButton, styles.dangerButton]}
                >
                  <Trash2 size={iconSizes.sm} color="#FFFFFF" />
                  <Text.Caption color="#FFFFFF">Clear Feed</Text.Caption>
                </Pressable>
                <Pressable
                  onPress={loadFacts}
                  style={[styles.actionButton, { backgroundColor: colors.textSecondary }]}
                >
                  <RefreshCw size={iconSizes.sm} color="#FFFFFF" />
                  <Text.Caption color="#FFFFFF">Refresh</Text.Caption>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Edit title modal */}
        {editingFact && (
          <Modal visible transparent animationType="fade">
            <View style={styles.editModalOverlay}>
              <View style={[styles.editModalContent, { backgroundColor: colors.background }]}>
                <Text.Title color={colors.text}>Edit Title</Text.Title>
                <Text.Caption color={colors.textSecondary} style={{ marginBottom: spacing.phone.md }}>
                  Edit the title for screenshots
                </Text.Caption>
                <TextInput
                  style={[
                    styles.titleInput,
                    { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
                  ]}
                  value={editedTitle}
                  onChangeText={setEditedTitle}
                  placeholder="Enter title..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                />
                <View style={styles.editModalActions}>
                  <Pressable
                    onPress={() => setEditingFact(null)}
                    style={[styles.modalButton, { backgroundColor: colors.surface }]}
                  >
                    <Text.Body color={colors.text}>Cancel</Text.Body>
                  </Pressable>
                  <Pressable
                    onPress={saveEditedTitle}
                    style={[styles.modalButton, { backgroundColor: colors.primary }]}
                  >
                    <Text.Body color="#FFFFFF">Save</Text.Body>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    position: 'absolute',
    bottom: 0,
    borderTopLeftRadius: radius.phone.xl,
    borderTopRightRadius: radius.phone.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.phone.lg,
    paddingVertical: spacing.phone.lg,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: spacing.phone.xs,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.phone.lg,
    marginVertical: spacing.phone.md,
    paddingHorizontal: spacing.phone.md,
    paddingVertical: spacing.phone.sm,
    borderRadius: radius.phone.md,
    gap: spacing.phone.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.phone.fontSize.body,
    fontFamily: FONT_FAMILIES.regular,
  },
  selectionInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.phone.lg,
    paddingBottom: spacing.phone.sm,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: spacing.phone.md,
  },
  selectionButton: {
    padding: spacing.phone.xs,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.phone.lg,
    paddingBottom: spacing.phone.lg,
  },
  factItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.phone.md,
    gap: spacing.phone.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factContent: {
    flex: 1,
    gap: spacing.phone.xs,
  },
  factMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.phone.sm,
    flexWrap: 'wrap',
  },
  inFeedBadge: {
    paddingHorizontal: spacing.phone.sm,
    paddingVertical: 2,
    borderRadius: radius.phone.sm,
  },
  editButton: {
    padding: spacing.phone.sm,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBar: {
    padding: spacing.phone.lg,
    borderTopWidth: 1,
    gap: spacing.phone.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.phone.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.phone.md,
    borderRadius: radius.phone.md,
    gap: spacing.phone.xs,
  },
  dangerButton: {
    backgroundColor: '#E53935',
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.phone.lg,
  },
  editModalContent: {
    width: '100%',
    maxWidth: 400,
    padding: spacing.phone.lg,
    borderRadius: radius.phone.lg,
    gap: spacing.phone.sm,
  },
  titleInput: {
    borderWidth: 1,
    borderRadius: radius.phone.md,
    padding: spacing.phone.md,
    fontSize: typography.phone.fontSize.body,
    fontFamily: FONT_FAMILIES.regular,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  editModalActions: {
    flexDirection: 'row',
    gap: spacing.phone.md,
    marginTop: spacing.phone.md,
  },
  modalButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.phone.md,
    borderRadius: radius.phone.md,
  },
});

