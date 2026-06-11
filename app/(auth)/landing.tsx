import React, { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/hooks/useTheme';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Radius, Spacing, Typography } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ONBOARDING_KEY = 'aurora_hasSeenOnboarding';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface HeroSlide {
  id: string;
  type: 'hero';
}

interface FeatureSlide {
  id: string;
  type: 'feature';
  iconName: IoniconName;
  iconColor: string;
  bgColorsLight: [string, string];
  bgColorsDark: [string, string];
  headline: string;
  body: string;
}

type Slide = HeroSlide | FeatureSlide;

const SLIDES: Slide[] = [
  { id: 'hero', type: 'hero' },
  {
    id: 'companion',
    type: 'feature',
    iconName: 'sparkles',
    iconColor: '#8B7CF0',
    bgColorsLight: ['#F0EEFF', '#F8F6FF'],
    bgColorsDark: ['#1E1A35', '#17142B'],
    headline: 'Meet your personal health companion.',
    body: 'Aurora learns your patterns and adapts every day to help you thrive.',
  },
  {
    id: 'tracking',
    type: 'feature',
    iconName: 'heart',
    iconColor: '#EF4444',
    bgColorsLight: ['#FEF2F2', '#FFF5F5'],
    bgColorsDark: ['#2A1A1A', '#1F1515'],
    headline: 'Track hydration, sleep, habits, and nutrition.',
    body: 'Everything you need to understand your body, in one beautifully simple place.',
  },
  {
    id: 'insights',
    type: 'feature',
    iconName: 'bar-chart',
    iconColor: '#4F7EF5',
    bgColorsLight: ['#EEF2FF', '#F4F6FF'],
    bgColorsDark: ['#1A1D2E', '#14162A'],
    headline: 'Receive personalized daily insights.',
    body: 'AI-powered analysis surfaces patterns in your health you never knew existed.',
  },
  {
    id: 'habits',
    type: 'feature',
    iconName: 'checkmark-circle',
    iconColor: '#4CAF82',
    bgColorsLight: ['#F0FDF4', '#F6FFF9'],
    bgColorsDark: ['#14261E', '#101E17'],
    headline: 'Build healthier routines through consistency.',
    body: 'Small daily wins compound into lasting transformation over time.',
  },
  {
    id: 'self',
    type: 'feature',
    iconName: 'person-circle',
    iconColor: '#F5A623',
    bgColorsLight: ['#FFFBEB', '#FFFEF5'],
    bgColorsDark: ['#271F0A', '#1E1807'],
    headline: 'Learn more about yourself every day.',
    body: 'The more you track, the better Aurora understands and guides you.',
  },
];

// ─── Pagination Dot ──────────────────────────────────────────────────────────

interface DotProps {
  index: number;
  scrollX: SharedValue<number>;
  color: string;
}

function Dot({ index, scrollX, color }: DotProps) {
  const animStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];
    const width = interpolate(scrollX.value, inputRange, [6, 22, 6], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.3, 1, 0.3], Extrapolation.CLAMP);
    return { width, opacity };
  });

  return <Animated.View style={[styles.dot, { backgroundColor: color }, animStyle]} />;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LandingScreen() {
  const theme = useTheme();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';

  const scrollX = useSharedValue(0);
  const [currentSlide, setCurrentSlide] = useState(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const handleMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentSlide(index);
  }, []);

  // Redirect to login if already seen onboarding
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((value) => {
      if (value === 'true') {
        router.replace('/(auth)/login');
      }
    });
  }, []);

  const handleGetStarted = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.push('/(auth)/signup');
  };

  const handleSignIn = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.push('/(auth)/login');
  };

  const renderSlide = (slide: Slide) => {
    if (slide.type === 'hero') {
      return (
        <LinearGradient
          colors={['#4F7EF5', '#8B7CF0', '#C084FC']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.slide}
        >
          {/* Decorative circles */}
          <View style={styles.heroCircle1} />
          <View style={styles.heroCircle2} />

          <Animated.View entering={FadeInDown.duration(700).delay(100)} style={styles.heroContent}>
            <View style={styles.heroBadge}>
              <Ionicons name="sparkles" size={14} color="rgba(255,255,255,0.9)" />
              <Text style={styles.heroBadgeText}>Project Aurora</Text>
            </View>

            <Text style={styles.heroTitle}>
              Understand{'\n'}yourself better{'\n'}every day.
            </Text>

            <Text style={styles.heroSubtitle}>Your AI-powered health companion.</Text>
          </Animated.View>
        </LinearGradient>
      );
    }

    const bg = isDark ? slide.bgColorsDark : slide.bgColorsLight;

    return (
      <LinearGradient colors={bg} style={styles.slide}>
        <Animated.View entering={FadeInDown.duration(600).delay(150)} style={styles.featureContent}>
          <View style={[styles.featureIconWrap, { backgroundColor: slide.iconColor + '18' }]}>
            <Ionicons name={slide.iconName} size={52} color={slide.iconColor} />
          </View>

          <Text style={[styles.featureHeadline, { color: theme.text }]}>{slide.headline}</Text>

          <Text style={[styles.featureBody, { color: theme.textSecondary }]}>{slide.body}</Text>
        </Animated.View>
      </LinearGradient>
    );
  };

  const dotColor = currentSlide === 0 ? 'rgba(255,255,255,0.9)' : theme.tint;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar style={currentSlide === 0 ? 'light' : isDark ? 'light' : 'dark'} />

      {/* ── Carousel ── */}
      <Animated.ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        style={styles.carousel}
        contentContainerStyle={styles.carouselContent}
      >
        {SLIDES.map((slide) => (
          <View key={slide.id} style={styles.slideWrapper}>
            {renderSlide(slide)}
          </View>
        ))}
      </Animated.ScrollView>

      {/* ── Sticky Bottom ── */}
      <SafeAreaView
        edges={['bottom']}
        style={[
          styles.bottomBar,
          {
            backgroundColor: currentSlide === 0 ? 'transparent' : theme.background,
            borderTopColor: currentSlide === 0 ? 'transparent' : theme.border,
          },
        ]}
      >
        {/* Dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <Dot key={i} index={i} scrollX={scrollX} color={dotColor} />
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[
            styles.primaryButton,
            {
              backgroundColor: currentSlide === 0 ? 'rgba(255,255,255,0.95)' : theme.tint,
            },
          ]}
          onPress={handleGetStarted}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.primaryButtonText,
              { color: currentSlide === 0 ? '#4F7EF5' : '#FFFFFF' },
            ]}
          >
            Get Started
          </Text>
          <Ionicons
            name="arrow-forward"
            size={18}
            color={currentSlide === 0 ? '#4F7EF5' : '#FFFFFF'}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSignIn} activeOpacity={0.7} style={styles.signInLink}>
          <Text
            style={[
              styles.signInText,
              {
                color: currentSlide === 0 ? 'rgba(255,255,255,0.8)' : theme.textSecondary,
              },
            ]}
          >
            Already have an account?{' '}
            <Text
              style={{
                fontWeight: '700',
                color: currentSlide === 0 ? '#FFFFFF' : theme.tint,
              }}
            >
              Sign In
            </Text>
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  carousel: {
    flex: 1,
  },
  carouselContent: {
    // no extra padding needed — slides are exactly SCREEN_WIDTH
  },
  slideWrapper: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  slide: {
    flex: 1,
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },

  // ── Hero ──────────────────────────────────────────────────
  heroCircle1: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: -60,
    right: -80,
  },
  heroCircle2: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: 80,
    left: -60,
  },
  heroContent: {
    paddingHorizontal: 36,
    paddingBottom: 60,
    width: '100%',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 6,
    marginBottom: Spacing.xxl,
  },
  heroBadgeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroTitle: {
    ...Typography.displayLarge,
    fontSize: 38,
    color: '#FFFFFF',
    marginBottom: Spacing.lg,
    lineHeight: 48,
  },
  heroSubtitle: {
    ...Typography.bodyLarge,
    fontSize: 18,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 28,
  },

  // ── Feature slides ────────────────────────────────────────
  featureContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 40,
    gap: Spacing.xxl,
  },
  featureIconWrap: {
    width: 110,
    height: 110,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  featureHeadline: {
    ...Typography.displayMedium,
    textAlign: 'center',
    lineHeight: 38,
  },
  featureBody: {
    ...Typography.bodyLarge,
    textAlign: 'center',
    lineHeight: 26,
  },

  // ── Bottom bar ────────────────────────────────────────────
  bottomBar: {
    paddingTop: Spacing.xl,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 0 : Spacing.xl,
    gap: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  dot: {
    height: 6,
    borderRadius: Radius.full,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: Radius.xl,
    gap: 8,
    shadowColor: '#4F7EF5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  signInLink: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  signInText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
