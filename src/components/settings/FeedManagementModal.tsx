import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { Calendar, Check, Edit3, RefreshCw, Search, Trash2, X } from '@tamagui/lucide-icons';

import { useTranslation } from '../../i18n';
import { triggerFeedRefresh } from '../../services/contentRefresh';
import * as database from '../../services/database';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { FONT_FAMILIES, Text } from '../Typography';

import type { FactWithRelations } from '../../services/database';

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
  spacing: Record<string, number>;
  radius: Record<string, number>;
}

const FactItem = React.memo(
  ({
    fact,
    isSelected,
    onToggle,
    onEditTitle,
    colors,
    iconSizes,
    spacing,
    radius,
  }: FactItemProps) => {
    const isInFeed =
      fact.shown_in_feed === 1 ||
      (fact.scheduled_date && new Date(fact.scheduled_date) <= new Date());

    const itemStyles = useMemo(
      () => ({
        factItem: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          paddingVertical: spacing.md,
          gap: spacing.md,
        },
        factContent: {
          flex: 1,
          gap: spacing.xs,
        },
        factMeta: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          gap: spacing.sm,
          flexWrap: 'wrap' as const,
        },
        inFeedBadge: {
          paddingHorizontal: spacing.sm,
          paddingVertical: 2,
          borderRadius: radius.sm,
        },
        editButton: {
          padding: spacing.sm,
        },
      }),
      [spacing, radius]
    );

    return (
      <Pressable onPress={onToggle} style={itemStyles.factItem}>
        <View
          style={[
            styles.checkbox,
            { borderColor: colors.border },
            isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
          ]}
        >
          {isSelected && <Check size={iconSizes.sm} color="#FFFFFF" />}
        </View>
        <View style={itemStyles.factContent}>
          <Text.Label numberOfLines={2} color={colors.text}>
            {fact.title || fact.content.substring(0, 60) + '...'}
          </Text.Label>
          <View style={itemStyles.factMeta}>
            <Text.Caption color={colors.textSecondary}>
              {fact.categoryData?.name || fact.category || 'Unknown'}
            </Text.Caption>
            {isInFeed && (
              <View style={[itemStyles.inFeedBadge, { backgroundColor: colors.primary + '20' }]}>
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
        <Pressable onPress={onEditTitle} style={itemStyles.editButton} hitSlop={8}>
          <Edit3 size={iconSizes.sm} color={colors.textSecondary} />
        </Pressable>
      </Pressable>
    );
  }
);

FactItem.displayName = 'FactItem';

export const FeedManagementModal: React.FC<FeedManagementModalProps> = ({ visible, onClose }) => {
  const { theme } = useTheme();
  const colors = hexColors[theme];
  const { locale } = useTranslation();
  const { spacing, radius, typography, iconSizes } = useResponsive();

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
        prev.map((f) => (f.id === editingFact.id ? { ...f, title: editedTitle } : f))
      );
      setEditingFact(null);
      setEditedTitle('');
    } catch (error) {
      console.error('Error updating title:', error);
      Alert.alert('Error', 'Failed to update title');
    }
  }, [editingFact, editedTitle]);

  const addToFeedWithDate = useCallback(
    async (daysAgo: number) => {
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
    },
    [selectedFactIds, loadFacts]
  );

  const clearFeed = useCallback(async () => {
    Alert.alert('Clear Feed', 'This will remove all facts from the feed. Are you sure?', [
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
    ]);
  }, [loadFacts]);

  const selectAll = useCallback(() => {
    setSelectedFactIds(new Set(filteredFacts.map((f) => f.id)));
  }, [filteredFacts]);

  const clearSelection = useCallback(() => {
    setSelectedFactIds(new Set());
  }, []);

  const screenHeight = Dimensions.get('window').height;
  const screenWidth = Dimensions.get('window').width;

  const dynamicStyles = useMemo(
    () => ({
      modalContainer: {
        position: 'absolute' as const,
        bottom: 0,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        overflow: 'hidden' as const,
      },
      header: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
        borderBottomWidth: 1,
      },
      closeButton: {
        padding: spacing.xs,
      },
      searchContainer: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        marginHorizontal: spacing.lg,
        marginVertical: spacing.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        gap: spacing.sm,
      },
      searchInput: {
        flex: 1,
        fontSize: typography.fontSize.body,
        fontFamily: FONT_FAMILIES.regular,
      },
      selectionInfo: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.sm,
      },
      selectionActions: {
        flexDirection: 'row' as const,
        gap: spacing.md,
      },
      selectionButton: {
        padding: spacing.xs,
      },
      listContent: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.lg,
      },
      factItem: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        paddingVertical: spacing.md,
        gap: spacing.md,
      },
      factContent: {
        flex: 1,
        gap: spacing.xs,
      },
      factMeta: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: spacing.sm,
        flexWrap: 'wrap' as const,
      },
      inFeedBadge: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radius.sm,
      },
      editButton: {
        padding: spacing.sm,
      },
      actionBar: {
        padding: spacing.lg,
        borderTopWidth: 1,
        gap: spacing.sm,
      },
      actionRow: {
        flexDirection: 'row' as const,
        gap: spacing.sm,
      },
      actionButton: {
        flex: 1,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        paddingVertical: spacing.md,
        borderRadius: radius.md,
        gap: spacing.xs,
      },
      editModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        padding: spacing.lg,
      },
      editModalContent: {
        width: '100%' as const,
        maxWidth: 400,
        padding: spacing.lg,
        borderRadius: radius.lg,
        gap: spacing.sm,
      },
      titleInput: {
        borderWidth: 1,
        borderRadius: radius.md,
        padding: spacing.md,
        fontSize: typography.fontSize.body,
        fontFamily: FONT_FAMILIES.regular,
        minHeight: 100,
        textAlignVertical: 'top' as const,
      },
      editModalActions: {
        flexDirection: 'row' as const,
        gap: spacing.md,
        marginTop: spacing.md,
      },
      modalButton: {
        flex: 1,
        alignItems: 'center' as const,
        paddingVertical: spacing.md,
        borderRadius: radius.md,
      },
    }),
    [spacing, radius, typography]
  );

  const renderFactItem = useCallback(
    ({ item }: { item: FactWithRelations }) => (
      <FactItem
        fact={item}
        isSelected={selectedFactIds.has(item.id)}
        onToggle={() => toggleFactSelection(item.id)}
        onEditTitle={() => handleEditTitle(item)}
        colors={colors}
        iconSizes={iconSizes}
        spacing={spacing}
        radius={radius}
      />
    ),
    [selectedFactIds, toggleFactSelection, handleEditTitle, colors, iconSizes, spacing, radius]
  );

  const keyExtractor = useCallback((item: FactWithRelations) => String(item.id), []);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
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
              dynamicStyles.modalContainer,
              {
                backgroundColor: colors.background,
                height: screenHeight * 0.9,
                width: screenWidth,
              },
            ]}
          >
            {/* Header */}
            <View style={[dynamicStyles.header, { borderBottomColor: colors.border }]}>
              <Text.Title color={colors.text}>Manage Feed (DEV)</Text.Title>
              <Pressable onPress={handleClose} style={dynamicStyles.closeButton}>
                <X size={iconSizes.lg} color={colors.text} />
              </Pressable>
            </View>

            {/* Search */}
            <View style={[dynamicStyles.searchContainer, { backgroundColor: colors.surface }]}>
              <Search size={iconSizes.md} color={colors.textSecondary} />
              <TextInput
                style={[dynamicStyles.searchInput, { color: colors.text }]}
                placeholder="Search facts..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Selection info */}
            <View style={dynamicStyles.selectionInfo}>
              <Text.Caption color={colors.textSecondary}>
                {selectedFactIds.size} selected • {filteredFacts.length} facts
              </Text.Caption>
              <View style={dynamicStyles.selectionActions}>
                <Pressable onPress={selectAll} style={dynamicStyles.selectionButton}>
                  <Text.Caption color={colors.primary}>Select All</Text.Caption>
                </Pressable>
                <Pressable onPress={clearSelection} style={dynamicStyles.selectionButton}>
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
                contentContainerStyle={dynamicStyles.listContent}
                showsVerticalScrollIndicator={false}
              />
            )}

            {/* Action buttons */}
            <View
              style={[
                dynamicStyles.actionBar,
                { backgroundColor: colors.surface, borderTopColor: colors.border },
              ]}
            >
              <View style={dynamicStyles.actionRow}>
                <Pressable
                  onPress={() => addToFeedWithDate(0)}
                  style={[dynamicStyles.actionButton, { backgroundColor: colors.primary }]}
                >
                  <Calendar size={iconSizes.sm} color="#FFFFFF" />
                  <Text.Caption color="#FFFFFF">Today</Text.Caption>
                </Pressable>
                <Pressable
                  onPress={() => addToFeedWithDate(1)}
                  style={[dynamicStyles.actionButton, { backgroundColor: colors.primary }]}
                >
                  <Calendar size={iconSizes.sm} color="#FFFFFF" />
                  <Text.Caption color="#FFFFFF">Yesterday</Text.Caption>
                </Pressable>
                <Pressable
                  onPress={() => addToFeedWithDate(2)}
                  style={[dynamicStyles.actionButton, { backgroundColor: colors.primary }]}
                >
                  <Calendar size={iconSizes.sm} color="#FFFFFF" />
                  <Text.Caption color="#FFFFFF">2 Days</Text.Caption>
                </Pressable>
              </View>
              <View style={dynamicStyles.actionRow}>
                <Pressable
                  onPress={clearFeed}
                  style={[dynamicStyles.actionButton, styles.dangerButton]}
                >
                  <Trash2 size={iconSizes.sm} color="#FFFFFF" />
                  <Text.Caption color="#FFFFFF">Clear Feed</Text.Caption>
                </Pressable>
                <Pressable
                  onPress={loadFacts}
                  style={[dynamicStyles.actionButton, { backgroundColor: colors.textSecondary }]}
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
            <View style={dynamicStyles.editModalOverlay}>
              <View
                style={[dynamicStyles.editModalContent, { backgroundColor: colors.background }]}
              >
                <Text.Title color={colors.text}>Edit Title</Text.Title>
                <Text.Caption color={colors.textSecondary} style={{ marginBottom: spacing.md }}>
                  Edit the title for screenshots
                </Text.Caption>
                <TextInput
                  style={[
                    dynamicStyles.titleInput,
                    {
                      backgroundColor: colors.surface,
                      color: colors.text,
                      borderColor: colors.border,
                    },
                  ]}
                  value={editedTitle}
                  onChangeText={setEditedTitle}
                  placeholder="Enter title..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                />
                <View style={dynamicStyles.editModalActions}>
                  <Pressable
                    onPress={() => setEditingFact(null)}
                    style={[dynamicStyles.modalButton, { backgroundColor: colors.surface }]}
                  >
                    <Text.Body color={colors.text}>Cancel</Text.Body>
                  </Pressable>
                  <Pressable
                    onPress={saveEditedTitle}
                    style={[dynamicStyles.modalButton, { backgroundColor: colors.primary }]}
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
  list: {
    flex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButton: {
    backgroundColor: '#E53935',
  },
});
