import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Easing,
  Extrapolation,
  FadeInDown,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import LottieView from 'lottie-react-native';
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
  heroColor: string;
  featureColor: string;
}

function Dot({ index, scrollX, heroColor, featureColor }: DotProps) {
  const animStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];
    const width = interpolate(scrollX.value, inputRange, [6, 22, 6], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.3, 1, 0.3], Extrapolation.CLAMP);
    // Color transitions once, across the hero → feature swipe (slide 0 → 1).
    const backgroundColor = interpolateColor(
      scrollX.value,
      [0, SCREEN_WIDTH],
      [heroColor, featureColor],
    );
    return { width, opacity, backgroundColor };
  });

  return <Animated.View style={[styles.dot, animStyle]} />;
}

// ─── Full-bleed crossfading background ──────────────────────────────────────
// One gradient layer per slide, stacked full-screen behind the carousel AND the
// (transparent) bottom bar. Each layer fades in as you reach its slide and stays
// opaque, so adjacent layers crossfade with no white wash and no seam — the bar
// always shows the exact background of the slide above it.

interface BgLayerProps {
  index: number;
  scrollX: SharedValue<number>;
  colors: readonly [string, string, ...string[]];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

function BackgroundLayer({ index, scrollX, colors, start, end }: BgLayerProps) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <LinearGradient colors={colors} start={start} end={end} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

// ─── Per-slide themed animations ────────────────────────────────────────────
// Each slide carries a looping animation that illustrates its title: a beating
// heart for tracking, growing bars for insights, a filling streak for habits,
// radar rings for self-discovery, twinkling sparkles for the companion. They
// run continuously so the page feels alive the moment you land on it.

const CLAMP = Extrapolation.CLAMP;

/** Small helper: a shared value looping 0→1 forever (optionally yo-yo). */
function useLoop(duration: number, delay = 0, reverse = true) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, reverse),
    );
  }, [v, duration, delay, reverse]);
  return v;
}

// 1 · Companion — an AI bot that slides into view and waves "Hi". The Lottie
// scene (PhoneBot) carries the character + greeting; we drive the "walk-in"
// entrance with Reanimated and replay the greeting each time the slide is shown.
function CompanionVisual({ color, active }: { color: string; active: boolean }) {
  const lottieRef = useRef<LottieView>(null);
  const enter = useSharedValue(0); // 0 = off-screen left, 1 = settled center

  useEffect(() => {
    if (!active) return;
    // Re-run the entrance + greeting every time the user lands on this slide.
    enter.value = 0;
    enter.value = withTiming(1, { duration: 850, easing: Easing.out(Easing.back(1.3)) });
    lottieRef.current?.reset();
    lottieRef.current?.play();
  }, [active, enter]);

  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 1.4),
    transform: [
      { translateX: (1 - enter.value) * -SCREEN_WIDTH * 0.55 },
      { scale: 0.75 + enter.value * 0.25 },
    ],
  }));

  return (
    <Animated.View style={[styles.botWrap, style]}>
      <View style={[styles.botGlow, { backgroundColor: color + '14' }]} />
      <LottieView
        ref={lottieRef}
        source={require('@/assets/animations/ai-bot.json')}
        autoPlay={active}
        loop
        style={styles.botLottie}
      />
    </Animated.View>
  );
}

// 2 · Tracking — a heart with a "lub-dub" beat and an expanding pulse ring.
function HeartbeatVisual({ color }: { color: string }) {
  const beat = useSharedValue(1);
  const ripple = useSharedValue(0);
  useEffect(() => {
    beat.value = withRepeat(
      withSequence(
        withTiming(1.18, { duration: 110 }),
        withTiming(1.0, { duration: 110 }),
        withTiming(1.13, { duration: 110 }),
        withTiming(1.0, { duration: 520 }),
      ),
      -1,
    );
    ripple.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, [beat, ripple]);

  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: beat.value }] }));
  const rippleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.6 + ripple.value * 1.8 }],
    opacity: 0.5 * (1 - ripple.value),
  }));

  return (
    <View style={styles.visualWrap}>
      <Animated.View style={[styles.pulseRing, { borderColor: color }, rippleStyle]} />
      <Animated.View style={heartStyle}>
        <Ionicons name="heart" size={72} color={color} />
      </Animated.View>
    </View>
  );
}

// A single equalizer bar.
function Bar({
  color,
  duration,
  delay,
  faint,
}: {
  color: string;
  duration: number;
  delay: number;
  faint: boolean;
}) {
  const v = useLoop(duration, delay);
  const style = useAnimatedStyle(() => ({ height: 26 + v.value * 70 }));
  return (
    <Animated.View
      style={[styles.bar, { backgroundColor: color, opacity: faint ? 0.55 : 0.9 }, style]}
    />
  );
}

// 3 · Insights — five equalizer bars rising and falling like data building.
function InsightsBarsVisual({ color }: { color: string }) {
  const cfg: [number, number][] = [
    [700, 0],
    [900, 120],
    [600, 240],
    [1000, 80],
    [820, 320],
  ];
  return (
    <View style={[styles.visualWrap, styles.barsRow]}>
      {cfg.map(([duration, delay], i) => (
        <Bar key={i} color={color} duration={duration} delay={delay} faint={i % 2 === 0} />
      ))}
    </View>
  );
}

// A single streak chip that lights up as the sequence passes its index.
function HabitChip({
  color,
  index,
  progress,
}: {
  color: string;
  index: number;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const on = interpolate(
      progress.value,
      [index - 0.4, index, index + 0.8, index + 1],
      [0, 1, 1, 0],
      CLAMP,
    );
    return { transform: [{ scale: 0.85 + on * 0.2 }], opacity: 0.35 + on * 0.65 };
  });
  return (
    <Animated.View
      style={[styles.checkChip, { backgroundColor: color + '22', borderColor: color }, style]}
    >
      <Ionicons name="checkmark" size={26} color={color} />
    </Animated.View>
  );
}

// 4 · Habits — three rings light up in sequence, then loop: consistency.
function HabitsStreakVisual({ color }: { color: string }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(
      withTiming(3, { duration: 2400, easing: Easing.linear }),
      -1,
      false,
    );
  }, [progress]);
  return (
    <View style={[styles.visualWrap, styles.checksRow]}>
      {[0, 1, 2].map((i) => (
        <HabitChip key={i} color={color} index={i} progress={progress} />
      ))}
    </View>
  );
}

// A single expanding radar ring.
function RadarRing({ color, value }: { color: string; value: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.5 + value.value * 1.5 }],
    opacity: 0.5 * (1 - value.value),
  }));
  return <Animated.View style={[styles.radarRing, { borderColor: color }, style]} />;
}

// 5 · Self — radar rings expand outward from a person: daily discovery.
function SelfRadarVisual({ color }: { color: string }) {
  const r1 = useSharedValue(0);
  const r2 = useSharedValue(0);
  const r3 = useSharedValue(0);
  const bob = useLoop(1600);
  useEffect(() => {
    const opt = { duration: 2600, easing: Easing.out(Easing.ease) } as const;
    r1.value = withRepeat(withTiming(1, opt), -1, false);
    r2.value = withDelay(870, withRepeat(withTiming(1, opt), -1, false));
    r3.value = withDelay(1740, withRepeat(withTiming(1, opt), -1, false));
  }, [r1, r2, r3]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -4 + bob.value * 8 }] }));
  return (
    <View style={styles.visualWrap}>
      <RadarRing color={color} value={r1} />
      <RadarRing color={color} value={r2} />
      <RadarRing color={color} value={r3} />
      <Animated.View style={bobStyle}>
        <Ionicons name="person-circle" size={76} color={color} />
      </Animated.View>
    </View>
  );
}

/** Picks the right themed animation for a feature slide. */
function SlideVisual({ slide, active }: { slide: FeatureSlide; active: boolean }) {
  switch (slide.id) {
    case 'companion':
      return <CompanionVisual color={slide.iconColor} active={active} />;
    case 'tracking':
      return <HeartbeatVisual color={slide.iconColor} />;
    case 'insights':
      return <InsightsBarsVisual color={slide.iconColor} />;
    case 'habits':
      return <HabitsStreakVisual color={slide.iconColor} />;
    case 'self':
      return <SelfRadarVisual color={slide.iconColor} />;
    default:
      return (
        <View style={[styles.featureIconWrap, { backgroundColor: slide.iconColor + '18' }]}>
          <Ionicons name={slide.iconName} size={52} color={slide.iconColor} />
        </View>
      );
  }
}

function AnimatedHeroSlide() {
  // Gently floating decorative circles keep the hero alive on first launch.
  const float = useLoop(3200);
  const c1Style = useAnimatedStyle(() => ({ transform: [{ translateY: -10 + float.value * 20 }] }));
  const c2Style = useAnimatedStyle(() => ({ transform: [{ translateY: 12 - float.value * 20 }] }));

  return (
    // Transparent — the hero gradient is rendered full-screen behind the whole
    // screen (incl. the bottom bar) by LandingScreen, so white dots/Sign-In text
    // sit on the gradient instead of the white root background.
    <View style={styles.slide}>
      <Animated.View style={[styles.heroCircle1, c1Style]} />
      <Animated.View style={[styles.heroCircle2, c2Style]} />

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
    </View>
  );
}

function AnimatedFeatureSlide({
  slide,
  textColor,
  textSecondary,
  active,
}: {
  slide: FeatureSlide;
  textColor: string;
  textSecondary: string;
  active: boolean;
}) {
  // Transparent — the slide's gradient is drawn full-screen by BackgroundLayer.
  return (
    <View style={styles.slide}>
      <View style={styles.featureContent}>
        <SlideVisual slide={slide} active={active} />
        <Text style={[styles.featureHeadline, { color: textColor }]}>{slide.headline}</Text>
        <Text style={[styles.featureBody, { color: textSecondary }]}>{slide.body}</Text>
      </View>
    </View>
  );
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
  // TEMP(testing): disabled so the get-started carousel stays on screen while
  // we review the slide animations. Re-enable before shipping.
  // useEffect(() => {
  //   AsyncStorage.getItem(ONBOARDING_KEY).then((value) => {
  //     if (value === 'true') {
  //       router.replace('/(auth)/login');
  //     }
  //   });
  // }, []);

  const handleGetStarted = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.push('/(auth)/signup');
  };

  const handleSignIn = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.push('/(auth)/login');
  };

  // Bottom-bar control colors transition across the hero → feature swipe so
  // they stay legible as the full-bleed background changes underneath them.
  const signInTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      scrollX.value,
      [0, SCREEN_WIDTH],
      ['rgba(255,255,255,0.85)', theme.textSecondary],
    ),
  }));
  const signInStrongStyle = useAnimatedStyle(() => ({
    color: interpolateColor(scrollX.value, [0, SCREEN_WIDTH], ['#FFFFFF', theme.tint]),
  }));

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar style={currentSlide === 0 ? 'light' : isDark ? 'light' : 'dark'} />

      {/* Full-bleed crossfading backgrounds — one per slide, behind the carousel
          and the transparent bottom bar, so every page (hero gradient included)
          is one continuous surface with no seam at the controls. */}
      {SLIDES.map((slide, i) => (
        <BackgroundLayer
          key={slide.id}
          index={i}
          scrollX={scrollX}
          colors={
            slide.type === 'hero'
              ? (['#4F7EF5', '#8B7CF0', '#C084FC'] as const)
              : isDark
                ? slide.bgColorsDark
                : slide.bgColorsLight
          }
          start={slide.type === 'hero' ? { x: 0.1, y: 0 } : { x: 0, y: 0 }}
          end={slide.type === 'hero' ? { x: 0.9, y: 1 } : { x: 0, y: 1 }}
        />
      ))}

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
        {SLIDES.map((slide, i) => (
          <View key={slide.id} style={styles.slideWrapper}>
            {slide.type === 'hero' ? (
              <AnimatedHeroSlide />
            ) : (
              <AnimatedFeatureSlide
                slide={slide}
                textColor={theme.text}
                textSecondary={theme.textSecondary}
                active={currentSlide === i}
              />
            )}
          </View>
        ))}
      </Animated.ScrollView>

      {/* ── Sticky Bottom ── */}
      {/* Always transparent so the crossfading background shows through, keeping
          the bar visually continuous with every slide. */}
      <SafeAreaView edges={['bottom']} style={[styles.bottomBar, styles.bottomBarTransparent]}>
        {/* Dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <Dot
              key={i}
              index={i}
              scrollX={scrollX}
              heroColor="rgba(255,255,255,0.9)"
              featureColor={theme.tint}
            />
          ))}
        </View>

        {/* CTA — consistent brand blue on every slide so it always reads. */}
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.tint }]}
          onPress={handleGetStarted}
          activeOpacity={0.85}
        >
          <Text style={[styles.primaryButtonText, { color: '#FFFFFF' }]}>Get Started</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSignIn} activeOpacity={0.7} style={styles.signInLink}>
          <Animated.Text style={[styles.signInText, signInTextStyle]}>
            Already have an account?{' '}
            <Animated.Text style={[{ fontWeight: '700' }, signInStrongStyle]}>
              Sign In
            </Animated.Text>
          </Animated.Text>
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

  // ── Themed slide animations ───────────────────────────────
  visualWrap: {
    width: 150,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  // Companion bot (Lottie)
  botWrap: {
    width: 230,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  botGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  botLottie: {
    width: 230,
    height: 230,
  },
  // Heart
  pulseRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2.5,
  },
  // Insights bars
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  bar: {
    width: 16,
    borderRadius: 8,
  },
  // Habits checks
  checksRow: {
    flexDirection: 'row',
    gap: 16,
  },
  checkChip: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Self radar
  radarRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
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
  bottomBarTransparent: {
    backgroundColor: 'transparent',
    borderTopColor: 'transparent',
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
