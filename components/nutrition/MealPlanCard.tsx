import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useTheme } from '@/hooks/useTheme';
import { MealPlan } from '@/types';

const MACROS = [
  { key: 'proteinG' as const, label: 'Protein', color: '#4F7EF5' },
  { key: 'carbsG' as const, label: 'Carbs', color: '#34C5FF' },
  { key: 'fatG' as const, label: 'Fat', color: '#F5A623' },
];

const DIET_BADGE: Record<string, { label: string; color: string; icon: string }> = {
  veg: { label: 'Veg', color: '#22C55E', icon: 'leaf' },
  vegan: { label: 'Vegan', color: '#10B981', icon: 'leaf' },
  nonveg: { label: 'Non-veg', color: '#EF4444', icon: 'restaurant' },
};

const MEAL_EMOJI: Record<string, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
};

interface Props {
  plan: MealPlan;
  /** When true, render expanded by default (e.g. a just-generated plan). */
  defaultExpanded?: boolean;
  onLog?: (plan: MealPlan) => void;
  onDelete?: (plan: MealPlan) => void;
  /** Hide the action row (e.g. inline preview in the generate sheet). */
  hideActions?: boolean;
}

export function MealPlanCard({
  plan,
  defaultExpanded = false,
  onLog,
  onDelete,
  hideActions,
}: Props) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);

  const totalCal = plan.calories ?? 0;
  const diet = plan.dietType ? DIET_BADGE[plan.dietType] : undefined;

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(16)}
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
    >
      {/* Header — emoji, name, diet badge, expand chevron */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setExpanded((e) => !e)}
        style={styles.header}
      >
        <View style={[styles.emojiWrap, { backgroundColor: theme.nutrition + '22' }]}>
          <Text style={styles.emoji}>{MEAL_EMOJI[plan.mealType] ?? '🍽️'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {plan.name}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: theme.textSecondary }]}>
              {plan.mealType}
              {totalCal ? ` · ${totalCal} kcal` : ''}
            </Text>
            {diet && (
              <View style={[styles.dietBadge, { backgroundColor: diet.color + '22' }]}>
                <Ionicons name={diet.icon as never} size={10} color={diet.color} />
                <Text style={[styles.dietText, { color: diet.color }]}>{diet.label}</Text>
              </View>
            )}
            {plan.logged && (
              <View style={[styles.dietBadge, { backgroundColor: theme.success + '22' }]}>
                <Ionicons name="checkmark-circle" size={10} color={theme.success} />
                <Text style={[styles.dietText, { color: theme.success }]}>Logged</Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.textSecondary}
        />
      </TouchableOpacity>

      {/* Macro bars (always visible — the headline of the card) */}
      <View style={styles.macroRow}>
        {MACROS.map((m) => {
          const grams = (plan[m.key] as number | undefined) ?? 0;
          return (
            <View key={m.key} style={styles.macroPill}>
              <View style={[styles.macroDot, { backgroundColor: m.color }]} />
              <Text style={[styles.macroVal, { color: theme.text }]}>{grams}g</Text>
              <Text style={[styles.macroLbl, { color: theme.textSecondary }]}>{m.label}</Text>
            </View>
          );
        })}
      </View>

      {/* Expanded body — description, ingredients, steps */}
      {expanded && (
        <Animated.View entering={FadeIn.duration(180)} style={styles.body}>
          {!!plan.description && (
            <Text style={[styles.desc, { color: theme.textSecondary }]}>{plan.description}</Text>
          )}

          {plan.ingredients.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Ingredients</Text>
              {plan.ingredients.map((ing, i) => (
                <View key={i} style={styles.ingredientRow}>
                  <View style={[styles.bullet, { backgroundColor: theme.nutrition }]} />
                  <Text style={[styles.ingredientText, { color: theme.text }]}>{ing}</Text>
                </View>
              ))}
            </>
          )}

          {plan.steps.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 14 }]}>
                Preparation
              </Text>
              {plan.steps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={[styles.stepNum, { backgroundColor: theme.nutrition + '22' }]}>
                    <Text style={[styles.stepNumText, { color: theme.nutrition }]}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.stepText, { color: theme.text }]}>{step}</Text>
                </View>
              ))}
            </>
          )}
        </Animated.View>
      )}

      {/* Actions */}
      {!hideActions && (onLog || onDelete) && (
        <View style={styles.actions}>
          {onLog && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => onLog(plan)}
              disabled={plan.logged}
              style={{ flex: 1, opacity: plan.logged ? 0.5 : 1 }}
            >
              <LinearGradient
                colors={[theme.nutrition, '#E8941A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logBtn}
              >
                <Ionicons name={plan.logged ? 'checkmark' : 'add'} size={16} color="#fff" />
                <Text style={styles.logText}>{plan.logged ? 'Logged' : 'Log this meal'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => onDelete(plan)}
              style={[
                styles.deleteBtn,
                { borderColor: theme.border, backgroundColor: theme.background },
              ]}
            >
              <Ionicons name="trash-outline" size={17} color={theme.error} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emojiWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 22 },
  name: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  metaText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  dietBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  dietText: { fontSize: 10, fontWeight: '800' },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 8,
  },
  macroPill: { flex: 1, alignItems: 'center', gap: 2 },
  macroDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 2 },
  macroVal: { fontSize: 15, fontWeight: '800' },
  macroLbl: { fontSize: 11, fontWeight: '600' },
  body: { marginTop: 14 },
  desc: { fontSize: 13, lineHeight: 19, fontStyle: 'italic', marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '800', marginBottom: 8, letterSpacing: 0.2 },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  bullet: { width: 5, height: 5, borderRadius: 3 },
  ingredientText: { fontSize: 14, flex: 1, lineHeight: 20 },
  stepRow: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontSize: 12, fontWeight: '800' },
  stepText: { fontSize: 14, flex: 1, lineHeight: 21 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
  },
  logText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  deleteBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});

export default MealPlanCard;
