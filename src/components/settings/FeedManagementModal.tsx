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
import { tokens } from '../../theme/tokens';
import { useTranslation } from '../../i18n';
import { H2, LabelText, SmallText, BodyText } from '../Typography';
import * as database from '../../services/database';
import type { FactWithRelations } from '../../services/database';
import { triggerFeedRefresh } from '../../services/contentRefresh';

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
}

const FactItem = React.memo(({ fact, isSelected, onToggle, onEditTitle, colors }: FactItemProps) => {
  const isInFeed = fact.shown_in_feed === 1 || (fact.scheduled_date && new Date(fact.scheduled_date) <= new Date());
  
  return (
    <Pressable onPress={onToggle} style={styles.factItem}>
      <View style={[styles.checkbox, { borderColor: colors.border }, isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
        {isSelected && <Check size={16} color="#FFFFFF" />}
      </View>
      <View style={styles.factContent}>
        <LabelText numberOfLines={2} color={colors.text}>
          {fact.title || fact.content.substring(0, 60) + '...'}
        </LabelText>
        <View style={styles.factMeta}>
          <SmallText color={colors.textSecondary}>
            {fact.categoryData?.name || fact.category || 'Unknown'}
          </SmallText>
          {isInFeed && (
            <View style={[styles.inFeedBadge, { backgroundColor: colors.primary + '20' }]}>
              <SmallText color={colors.primary}>In Feed</SmallText>
            </View>
          )}
          {fact.scheduled_date && (
            <SmallText color={colors.textSecondary}>
              {new Date(fact.scheduled_date).toLocaleDateString()}
            </SmallText>
          )}
        </View>
      </View>
      <Pressable onPress={onEditTitle} style={styles.editButton} hitSlop={8}>
        <Edit3 size={16} color={colors.textSecondary} />
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
  const colors = tokens.color[theme];
  const { t, locale } = useTranslation();

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
      />
    ),
    [selectedFactIds, toggleFactSelection, handleEditTitle, colors]
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
              <H2 color={colors.text}>Manage Feed (DEV)</H2>
              <Pressable onPress={handleClose} style={styles.closeButton}>
                <X size={24} color={colors.text} />
              </Pressable>
            </View>

            {/* Search */}
            <View style={[styles.searchContainer, { backgroundColor: colors.surface }]}>
              <Search size={20} color={colors.textSecondary} />
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
              <SmallText color={colors.textSecondary}>
                {selectedFactIds.size} selected • {filteredFacts.length} facts
              </SmallText>
              <View style={styles.selectionActions}>
                <Pressable onPress={selectAll} style={styles.selectionButton}>
                  <SmallText color={colors.primary}>Select All</SmallText>
                </Pressable>
                <Pressable onPress={clearSelection} style={styles.selectionButton}>
                  <SmallText color={colors.primary}>Clear</SmallText>
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
                  <Calendar size={16} color="#FFFFFF" />
                  <SmallText color="#FFFFFF">Today</SmallText>
                </Pressable>
                <Pressable
                  onPress={() => addToFeedWithDate(1)}
                  style={[styles.actionButton, { backgroundColor: colors.primary }]}
                >
                  <Calendar size={16} color="#FFFFFF" />
                  <SmallText color="#FFFFFF">Yesterday</SmallText>
                </Pressable>
                <Pressable
                  onPress={() => addToFeedWithDate(2)}
                  style={[styles.actionButton, { backgroundColor: colors.primary }]}
                >
                  <Calendar size={16} color="#FFFFFF" />
                  <SmallText color="#FFFFFF">2 Days</SmallText>
                </Pressable>
              </View>
              <View style={styles.actionRow}>
                <Pressable
                  onPress={clearFeed}
                  style={[styles.actionButton, styles.dangerButton]}
                >
                  <Trash2 size={16} color="#FFFFFF" />
                  <SmallText color="#FFFFFF">Clear Feed</SmallText>
                </Pressable>
                <Pressable
                  onPress={loadFacts}
                  style={[styles.actionButton, { backgroundColor: colors.textSecondary }]}
                >
                  <RefreshCw size={16} color="#FFFFFF" />
                  <SmallText color="#FFFFFF">Refresh</SmallText>
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
                <H2 color={colors.text}>Edit Title</H2>
                <SmallText color={colors.textSecondary} style={{ marginBottom: tokens.space.md }}>
                  Edit the title for screenshots
                </SmallText>
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
                    <BodyText color={colors.text}>Cancel</BodyText>
                  </Pressable>
                  <Pressable
                    onPress={saveEditedTitle}
                    style={[styles.modalButton, { backgroundColor: colors.primary }]}
                  >
                    <BodyText color="#FFFFFF">Save</BodyText>
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
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.lg,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: tokens.space.xs,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: tokens.space.lg,
    marginVertical: tokens.space.md,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.md,
    gap: tokens.space.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: tokens.fontSize.body,
    fontFamily: 'Montserrat_400Regular',
  },
  selectionInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.sm,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: tokens.space.md,
  },
  selectionButton: {
    padding: tokens.space.xs,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.lg,
  },
  factItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.space.md,
    gap: tokens.space.md,
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
    gap: tokens.space.xs,
  },
  factMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.sm,
    flexWrap: 'wrap',
  },
  inFeedBadge: {
    paddingHorizontal: tokens.space.sm,
    paddingVertical: 2,
    borderRadius: tokens.radius.sm,
  },
  editButton: {
    padding: tokens.space.sm,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBar: {
    padding: tokens.space.lg,
    borderTopWidth: 1,
    gap: tokens.space.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: tokens.space.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: tokens.space.md,
    borderRadius: tokens.radius.md,
    gap: tokens.space.xs,
  },
  dangerButton: {
    backgroundColor: '#E53935',
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space.lg,
  },
  editModalContent: {
    width: '100%',
    maxWidth: 400,
    padding: tokens.space.lg,
    borderRadius: tokens.radius.lg,
    gap: tokens.space.sm,
  },
  titleInput: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    fontSize: tokens.fontSize.body,
    fontFamily: 'Montserrat_400Regular',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  editModalActions: {
    flexDirection: 'row',
    gap: tokens.space.md,
    marginTop: tokens.space.md,
  },
  modalButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: tokens.space.md,
    borderRadius: tokens.radius.md,
  },
});

