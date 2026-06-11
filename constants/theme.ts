// Aurora — calm, premium, supportive palette
const primaryLight = '#4F7EF5'; // calm cornflower blue
const primaryDark = '#6B96FF';

export const Colors = {
  light: {
    text: '#1E2235',
    textSecondary: '#6B7280',
    background: '#F4F6FF',
    card: '#FFFFFF',
    border: '#E8ECFF',
    tint: primaryLight,
    icon: '#6B7280',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: primaryLight,
    error: '#EF4444',
    success: '#22C55E',
    // Domain colors
    hydration: '#34C5FF',
    sleep: '#8B7CF0',
    habits: '#4CAF82',
    nutrition: '#F5A623',
    streak: '#FF6B6B',
    // Gradients (start, end)
    gradientStart: '#EEF2FF',
    gradientEnd: '#F4F6FF',
  },
  dark: {
    text: '#E8EBF5',
    textSecondary: '#9CA3AF',
    background: '#0D0F1A',
    card: '#1A1D2E',
    border: '#252840',
    tint: primaryDark,
    icon: '#9CA3AF',
    tabIconDefault: '#6B7280',
    tabIconSelected: primaryDark,
    error: '#F87171',
    success: '#4ADE80',
    // Domain colors
    hydration: '#34C5FF',
    sleep: '#A78BFA',
    habits: '#6EE7B7',
    nutrition: '#FBD38D',
    streak: '#FC8181',
    // Gradients
    gradientStart: '#1A1D2E',
    gradientEnd: '#0D0F1A',
  },
};

export const Typography = {
  displayLarge: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.5 },
  displayMedium: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.3 },
  headingLarge: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.2 },
  headingMedium: { fontSize: 18, fontWeight: '600' as const },
  headingSmall: { fontSize: 16, fontWeight: '600' as const },
  bodyLarge: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyMedium: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  bodySmall: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
  labelLarge: { fontSize: 14, fontWeight: '600' as const, letterSpacing: 0.1 },
  labelSmall: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
};
