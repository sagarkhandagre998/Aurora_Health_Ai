# Project Aurora — Technical Implementation Plan

> **Purpose of this document**
> This is the master build spec for turning the existing **`health-tracker-expo`** codebase into **Project Aurora**, an AI-powered health companion. It is written to be handed to an implementation agent. Each of the 15 modules has its own section with: what to build, what to reuse from the current code, data model, libraries, step-by-step implementation, and key code patterns.
>
> **Read the "Foundations" section first.** It defines the stack, architecture, and folder layout that every module depends on. Build in the order given in "Build Phases" at the end.

---

## 0. Vision & Evaluation Criteria

Aurora helps users **understand** their health data, not just collect it. The experience must feel **personal, intelligent, supportive, premium, and modern** — never clinical, stressful, or overwhelming.

Judges are scoring: **Product Thinking, Mobile Dev, UI/UX, Backend Architecture, AI Integration, Execution**. Two things carry disproportionate weight:
1. **UI/UX polish** (premium feel, delightful micro-interactions).
2. **The Agentic Voice Companion** (Module 10) — voice-to-voice + the AI taking real actions. This is the centerpiece; budget the most time here.

Everything should work **end-to-end** even if simplified. Backend should be **API-driven**. Voice AI is **required**. Device integrations are **optional bonus**.

---

## 1. Foundations

### 1.1 Final Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| App framework | **Expo SDK 54 + expo-router 6 + RN 0.81 + React 19 + TypeScript** | Already in place. New Architecture + React Compiler enabled. |
| **Build target** | **EAS dev build (`expo-dev-client`)** — already installed | **Not Expo Go.** Native auth + audio + Skia all require it. Build early. |
| State | **Redux Toolkit + redux-persist** (existing) | Keep as UI cache. Supabase is source of truth. |
| Backend + Auth + DB | **Supabase** (Postgres + Auth + Edge Functions) | RLS makes per-user data trivial; publishable key can ship in-app. |
| AI / Agent brain | **Anthropic Claude** (`claude-opus-4-8`) via Supabase Edge Function proxy | Tool use for agent actions. Key stays server-side. |
| STT | **OpenAI `gpt-4o-mini-transcribe`** (cloud, via proxy) | Best accuracy/effort. `expo-audio` records `.m4a`. |
| TTS | **ElevenLabs Flash v2.5** (premium) with **`expo-speech`** fallback | Both via proxy / on-device fallback. |
| Rendering (premium UI) | **`@shopify/react-native-skia` + Reanimated 4** | Powers water bottle, charts, rings, confetti — one cohesive foundation. |
| Charts | **`victory-native`** (Victory Native XL, Skia) | **Remove `react-native-chart-kit`.** |
| Bottom sheets | **`@gorhom/bottom-sheet` v5** | Logging modals. |
| Local notifications | **`expo-notifications`** | Reminders. |

### 1.2 Packages to install / remove

```bash
# Backend / auth
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
npx expo install @react-native-google-signin/google-signin expo-apple-authentication

# Voice
npx expo install expo-audio expo-speech expo-file-system

# Premium UI
npx expo install @shopify/react-native-skia victory-native @gorhom/bottom-sheet \
  expo-linear-gradient expo-blur react-native-fast-confetti react-native-progress-circle-gradient

# Notifications
npx expo install expo-notifications

# Remove (replaced by victory-native)
npm remove react-native-chart-kit
```

> **Keep** the existing Apollo/GraphQL + Hashnode setup only if you want an "Explore / Learn" content feed (optional). It is not required by Aurora; you may delete `api/` and the Explore tab to reduce surface area. **Recommendation:** repurpose Explore into a "Learn" tab or drop it.

> **Known SDK 54 + Skia gotcha:** if you hit `ReferenceError: Property 'SkiaViewApi' doesn't exist` or an arraybuffer Canvas crash, set `experimentalImportSupport: false` in `metro.config.js` and rebuild. Always install Skia/victory via `npx expo install` for version alignment.

### 1.3 Target Architecture

```
┌──────────────────────── Expo App (dev build) ────────────────────────┐
│  expo-router screens → Redux (UI cache) ↔ Supabase JS client          │
│  Voice UI: expo-audio (record/play)                                   │
│  Premium UI: Skia + Reanimated (bottle, rings, charts, confetti)      │
└───────────────┬───────────────────────────────┬──────────────────────┘
                │ supabase-js (RLS, user JWT)    │ functions.invoke()
                ▼                                 ▼
┌─────────── Supabase ──────────────┐   ┌──── Edge Functions (Deno) ─────┐
│ Postgres (RLS per user)           │   │ /ai-companion  → Claude (tools)│
│  profiles, water_logs, sleep_logs │   │ /stt           → OpenAI STT    │
│  habits, habit_completions, meals │   │ /tts           → ElevenLabs    │
│  streaks, health_memory, insights │   │ holds ALL secret API keys      │
│ Auth (email, Google, Apple)       │   └────────────────────────────────┘
└───────────────────────────────────┘
```

**Golden rule:** No third-party API keys (Anthropic, OpenAI, ElevenLabs) in the mobile client. Everything sensitive goes through Edge Functions that read keys from Supabase secrets and verify the caller's JWT.

### 1.4 Proposed folder structure (added to existing)

```
app/
  (auth)/            # NEW: landing, login, signup
    landing.tsx
    login.tsx
    signup.tsx
  (onboarding)/      # NEW: 5 intro screens + profile setup wizard
    intro.tsx
    profile.tsx
    lifestyle.tsx
    goals.tsx
    notifications.tsx
  (tabs)/            # REWORKED main app
    index.tsx        # Dashboard
    hydration.tsx
    sleep.tsx
    habits.tsx
    nutrition.tsx
    companion.tsx    # Voice AI (could be a center FAB)
    profile.tsx
  _layout.tsx        # add SupabaseProvider + auth routing guard
lib/
  supabase.ts        # NEW: client
  auth.tsx           # NEW: session context + guard
  ai.ts              # NEW: companion client (invoke edge fn)
  voice.ts           # NEW: record → stt → companion → tts → play
store/slices/        # add hydration, sleep, habit, nutrition, streak slices
                     # (or fold into per-domain thunks)
supabase/
  functions/ai-companion/index.ts
  functions/stt/index.ts
  functions/tts/index.ts
  migrations/        # SQL schema
components/
  bottle/WaterBottle.tsx     # Skia liquid wave
  charts/                    # victory-native wrappers
  rings/ProgressRing.tsx     # Skia activity ring
  ui/...                     # reuse existing
```

### 1.5 Reuse map (existing → Aurora)

| Existing | Reuse as |
|---|---|
| `store/` (Redux + persist + AsyncStorage adapter) | Keep; add domain slices, hydrate from Supabase |
| `components/ui/` (toast, modal, screen-header, empty-state, icon-symbol, haptic-tab) | Reuse directly across all modules |
| `constants/theme.ts` | Extend into Aurora's calm premium palette + typography |
| `app/(tabs)/_layout.tsx` (center-FAB tab pattern) | Reuse pattern; center FAB → **Companion** |
| `components/entry-form.tsx`, RHF + Zod validation | Reuse pattern for all logging forms |
| `hooks/useTheme`, `useColorScheme` | Reuse |
| `types/index.ts` | Replace `HealthEntry`/`Goal` with Aurora domain types (below) |
| `app/_layout.tsx` providers | Keep providers; add auth/session gating, drop Apollo if Explore removed |

### 1.6 Core domain types (`types/index.ts`)

```ts
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';
export type Gender = 'male' | 'female' | 'other' | 'prefer_not';
export type HealthGoal =
  | 'improve_hydration' | 'sleep_better' | 'build_habits'
  | 'eat_healthier' | 'improve_energy' | 'improve_consistency';

export interface Profile {
  id: string; name: string; age?: number; gender?: Gender;
  heightCm?: number; weightKg?: number;
  wakeTime?: string;  // "07:00"
  bedtime?: string;   // "23:00"
  activityLevel?: ActivityLevel;
  goals: HealthGoal[];
  notificationPrefs: { hydration: boolean; sleep: boolean; habits: boolean; insights: boolean };
  onboardingComplete: boolean;
}
export interface WaterLog { id: string; amountMl: number; loggedAt: string; }
export interface SleepLog { id: string; date: string; durationMin: number; quality?: number; sleepStart?: string; sleepEnd?: string; }
export interface Habit { id: string; name: string; icon?: string; frequency: 'daily'|'weekly'; targetPerDay: number; status: 'active'|'paused'; createdAt: string; }
export interface HabitCompletion { id: string; habitId: string; date: string; count: number; }
export interface Meal { id: string; name: string; mealType: 'breakfast'|'lunch'|'dinner'|'snack'; calories?: number; proteinG?: number; carbsG?: number; fatG?: number; loggedAt: string; }
export interface Streak { type: 'hydration'|'sleep'|'habit'|'nutrition'; current: number; longest: number; lastDate: string; }
export interface Insight { id: string; text: string; category: string; createdAt: string; }
```

### 1.7 Database schema (Supabase, `supabase/migrations/0001_init.sql`)

```sql
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text, age int, gender text,
  height_cm numeric, weight_kg numeric,
  wake_time time, bedtime time, activity_level text,
  goals text[] default '{}',
  notification_prefs jsonb default '{"hydration":true,"sleep":true,"habits":true,"insights":true}',
  onboarding_complete boolean default false,
  created_at timestamptz default now()
);
create table water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  amount_ml int not null, logged_at timestamptz default now()
);
create table sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null, sleep_start timestamptz, sleep_end timestamptz,
  duration_min int, quality int, unique (user_id, date)
);
create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null, icon text, frequency text default 'daily',
  target_per_day int default 1, status text default 'active',
  created_at timestamptz default now()
);
create table habit_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  habit_id uuid not null references habits on delete cascade,
  date date not null, count int default 1, unique (habit_id, date)
);
create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text, meal_type text,
  calories int, protein_g numeric, carbs_g numeric, fat_g numeric,
  logged_at timestamptz default now()
);
create table streaks (
  user_id uuid not null references auth.users on delete cascade,
  type text not null, current int default 0, longest int default 0,
  last_date date, primary key (user_id, type)
);
create table health_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  observation text not null, created_at timestamptz default now()
);
create table insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  text text not null, category text, created_at timestamptz default now()
);

-- RLS: enable on every table + own-rows policy
-- (repeat for each table)
alter table water_logs enable row level security;
create policy "own" on water_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- profiles policy uses id instead of user_id:
alter table profiles enable row level security;
create policy "own" on profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create profile on signup
create function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
```

### 1.8 Supabase client + data pattern

`lib/supabase.ts`:
```ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }
);
```
**Data pattern (hackathon-pragmatic):** Supabase is source of truth. On screen/auth mount, fetch rows into the matching Redux slice. On writes, do an **optimistic** Redux update + Supabase insert via a thunk; reconcile/rollback on response. `redux-persist` stays for instant cold-start UI. Do **not** build a full offline sync engine.

---

## 2. The 15 Modules

Each module: **Goal → Screens/Components → Data → Implementation → Reuse/Notes.**

---

### Module 1 — Intro / Landing Experience

**Goal:** Premium, calm 5-screen onboarding carousel ending on a CTA. Opening line: *"Understand yourself better every day."*

**Screens:** `app/(auth)/landing.tsx` (hero line + "Get Started" / "I already have an account"), then 5 intro slides:
1. Meet your personal health companion.
2. Track hydration, sleep, habits, and nutrition.
3. Receive personalized daily insights.
4. Build healthier routines through consistency.
5. Learn more about yourself every day.

**Implementation:**
- Use an `Animated.FlatList` (horizontal, paged) + Reanimated for the carousel — **avoids the `react-native-reanimated-carousel` v5 pagination bug** and gives full control. (If looping/autoplay wanted, use carousel v5, but hand-roll the dots.)
- Build animated pagination dots: interpolate dot width/opacity from scroll offset (`useAnimatedScrollHandler` + shared value).
- Each slide: `expo-linear-gradient` calm background, large illustration/icon, serif/display headline, subtle Reanimated entrance (`FadeInDown`).
- Persist `hasSeenOnboarding` flag in AsyncStorage so it only shows once for new installs.

**Reuse/Notes:** Reuse `ScreenHeader` patterns and theme. Keep copy short; whitespace-heavy. This screen sets the "premium" tone judges see first — invest in typography and motion.

---

### Module 2 — Authentication

**Goal:** Email sign-up/login, Continue with Google, Continue with Apple. Frictionless.

**Screens:** `app/(auth)/login.tsx`, `signup.tsx`. Auth routing guard in `app/_layout.tsx`.

**Implementation:**
- **Session context** `lib/auth.tsx`: subscribe to `supabase.auth.onAuthStateChange`, expose `{ session, user, loading }`. In `_layout.tsx`, redirect: no session → `(auth)`, session but `!onboardingComplete` → `(onboarding)`, else → `(tabs)`.
- **Email:** `supabase.auth.signUp({ email, password, options:{ data:{ full_name } } })` and `signInWithPassword`. **For the demo, disable "Confirm email"** in Supabase Dashboard → Auth → Email, to skip deep-link confirmation.
- **Google (native):** `@react-native-google-signin/google-signin` → get `idToken` → `supabase.auth.signInWithIdToken({ provider:'google', token: idToken })`. Add config plugin with `iosUrlScheme` (reversed client id). Needs a **Web client id** in Supabase's Google provider config + the dev build.
- **Apple (native, iOS):** `expo-apple-authentication` → `signInWithIdToken({ provider:'apple', token: credential.identityToken })`. Set `ios.usesAppleSignIn: true`. **Capture `credential.fullName` on first sign-in only** and save via `updateUser({ data:{ full_name } })`.

**Reuse/Notes:** Reuse Toast for error feedback, RHF+Zod for form validation. Requires EAS dev build (native modules). Add a `scheme` in `app.json` for redirects.

---

### Module 3 — User Onboarding (Profile Setup)

**Goal:** Collect personal info, lifestyle, goals, notification prefs after first auth.

**Screens (wizard):** `app/(onboarding)/profile.tsx` (name, age, gender, height, weight) → `lifestyle.tsx` (wake-up time, bedtime, activity level) → `goals.tsx` (multi-select goals) → `notifications.tsx` (toggle prefs) → write to `profiles`, set `onboarding_complete=true`, route to dashboard.

**Implementation:**
- Multi-step form with a progress bar (Reanimated width). Keep one step per screen for a calm pace.
- Inputs: `@react-native-community/datetimepicker` (already installed) for times; segmented selectors for gender/activity; chip multi-select for goals; toggles for notification prefs.
- Save: single `supabase.from('profiles').update(...).eq('id', user.id)`. Also seed `streaks` rows (one per type at 0).
- Validate with Zod; allow skipping optional fields.

**Reuse/Notes:** Reuse `entry-form.tsx` field patterns and `ScreenHeader`. Store profile in a Redux `profileSlice` after save.

---

### Module 4 — Health Data Setup (Tracking Method)

**Goal:** Let users choose how they track. **Manual tracking is the required path.** Device integrations are bonus.

**Implementation:**
- A simple screen (end of onboarding or in Settings) offering **Manual** (default, always available) and optional **Connect a device**.
- **Manual** unlocks all logging modules (5–9). This is fully covered by those modules — no extra work beyond surfacing the choice.
- **Device integration (bonus, only if time):**
  - iOS: **`@kingstinct/react-native-health`** / Apple HealthKit for steps, sleep, water (requires dev build + entitlement + Apple Developer account).
  - Android: **Health Connect** via `react-native-health-connect`.
  - Scope to **read steps + sleep** only; map into `sleep_logs` / a steps display. Clearly label as bonus.

**Reuse/Notes:** Don't over-invest. A polished manual flow beats a half-working HealthKit integration. If you attempt integrations, log them clearly in the demo — judges give extra consideration.

---

### Module 5 — Home Dashboard

**Goal:** Central screen. Everything important visible at a glance: insight, hydration, sleep, habits, nutrition, streaks. Encouraging, simple.

**Screen:** `app/(tabs)/index.tsx` — vertical scroll of cards.

**Cards:**
- **Daily Insight Card** (top, hero): pulls latest from `insights` (Module 11/AI). e.g. *"You slept 1h less than your weekly average. Prioritize hydration today."*
- **Hydration Card:** mini water bottle/ring + goal / current / remaining. Tap → Hydration module.
- **Sleep Card:** last night, weekly average, consistency.
- **Habit Card:** due today, completed, % ring.
- **Nutrition Card:** meals logged, calorie/macro summary.
- **Streak Card:** active streaks, longest, recent achievement badge.

**Implementation:**
- On mount, fetch today's aggregates with Supabase queries (sum water for today, last sleep, habit completions today, today's meals, streaks). Cache in Redux.
- Cards = reusable `<DashboardCard>` with `expo-linear-gradient` + Skia mini-visuals (small ring/bottle). Pull-to-refresh + `FadeInUp` staggered entrance.
- Greeting header: "Good morning, {name}" based on time of day.

**Reuse/Notes:** Reuse existing dashboard card/scroll/FAB patterns from current `index.tsx`. Keep hierarchy clear — insight first, then the four domains, then streaks.

---

### Module 6 — Hydration Module

**Goal:** Build hydration habits. **Virtual Water Bottle is a primary engagement feature.**

**Screen:** `app/(tabs)/hydration.tsx`.

**Features:** daily water goal, quick-add buttons (+250 / +500 / glass), custom entry, hydration history, the animated bottle, and hydration insights.

**Implementation:**
- **`components/bottle/WaterBottle.tsx` (Skia + Reanimated):** draw bottle silhouette; clip an inner "water" region with an animated sine-wave `Path`; animate `translateX` shared value with `withRepeat(withTiming())` for the wave scroll; animate fill height to `current/goal`. Pattern: Shopify's "Liquid Wave Progress Indicator" tutorial. **Fallback:** `react-native-svg` `<ClipPath>` wave (you already have svg) or the drop-in `react-native-liquid-gauge` (circular) if short on time.
- **Quick add:** buttons dispatch optimistic `addWater(amountMl)` thunk → insert into `water_logs` → bottle animates up + `expo-haptics` + confetti when goal hit (`react-native-fast-confetti`).
- **Goal:** derive default from profile (e.g., weight-based ~35ml/kg) or fixed 2000ml; editable.
- **History:** list/`FlashList` of today's + past days; weekly mini-chart (victory-native).
- **Insights:** simple rules (client or AI): "ahead of goal", "consistency improved this week".

**Reuse/Notes:** This is the visual showpiece — make the bottle fluid and satisfying. Wire it to the dashboard mini-bottle too.

---

### Module 7 — Sleep Module

**Goal:** Help users understand sleep patterns.

**Screen:** `app/(tabs)/sleep.tsx`.

**Features:** sleep logging, history, weekly + monthly trends, analysis (duration, consistency, trends), insights.

**Implementation:**
- **Log:** bedtime + wake time pickers → compute `duration_min`; optional quality (1–5 emoji/stars). One row per date (`unique(user_id,date)` → upsert).
- **Charts (victory-native):** weekly bar of hours; monthly line of trend; a "consistency" metric = inverse of stdev of bed/wake times (display as a ring or score).
- **Analysis cards:** avg duration, consistency score, trend arrow vs last week.
- **Insights:** e.g. "You sleep better when going to bed before 11 PM" (compare quality vs bedtime), "average sleep increased this week" (AI or rule-based).

**Reuse/Notes:** Reuse chart wrappers across sleep/hydration/habits. Keep the analysis encouraging, not clinical.

---

### Module 8 — Habit Tracking Module

**Goal:** Build consistency. Create, complete, skip, pause, edit habits.

**Screen:** `app/(tabs)/habits.tsx` + create/edit sheet.

**Features:** habit creation (Reading, Meditation, Stretching, Walking, Journaling, Supplements, Early Bedtime — offer presets + custom), management (complete / skip / pause / edit), insights.

**Implementation:**
- **Create/edit:** `@gorhom/bottom-sheet` form — name, icon (emoji picker), frequency, target/day. Insert into `habits`.
- **Today list:** habits with `status='active'` and due today; each row a checkable item. **Complete** → upsert `habit_completions(habit_id, date, count)`; **Skip** → mark skipped (no completion, optional skip log); **Pause** → `status='paused'`; **Edit** → reopen sheet.
- **Progress:** today completion % as a ring; per-habit streak (consecutive days with completion).
- **Insights:** "morning habits completed more consistently", "5 consecutive days" (compute from completions; surface streak milestones with confetti).
- Swipe actions (gesture-handler) for skip/pause/delete.

**Reuse/Notes:** Reuse existing swipe-to-delete + modal patterns from current Goals/History screens. Use `ProgressRing` (Module 13) for per-habit and daily progress.

---

### Module 9 — Nutrition Module

**Goal:** Increase awareness of eating patterns. Focus on **awareness, not strict calorie counting.**

**Screen:** `app/(tabs)/nutrition.tsx` + add-meal sheet.

**Features:** log breakfast/lunch/dinner/snacks; display calories, protein, carbs, fat; daily summary.

**Implementation:**
- **Add meal:** bottom sheet — meal type, name, optional macros. Keep entry light: allow just a name + meal type (awareness-first); macros optional.
- **Optional AI assist:** "Describe your meal" → send text to the AI companion edge function asking Claude to estimate calories/macros (return structured JSON via `output_config.format`). Great wow-feature, low effort given the proxy already exists.
- **Daily summary:** total calories + macro breakdown (victory-native donut/stacked bar). Meals grouped by type.
- Insert into `meals`; aggregate per day.

**Reuse/Notes:** Don't build a food database. Manual + optional AI estimation is enough and on-message ("awareness rather than strict counting").

---

### Module 10 — 🎙️ Agentic Health Companion (CORE)

**Goal:** A voice-to-voice personal health **coach** that converses AND takes actions (logs water, sleep, creates habits) and gives personalized recommendations. This is the highest-weighted feature.

**Screen:** `app/(tabs)/companion.tsx` (center FAB / dedicated tab). A calm conversational UI with a mic button, animated listening state (Skia/Reanimated orb or waveform), transcript bubbles, and spoken replies.

**End-to-end pipeline (all secrets server-side):**
```
expo-audio record .m4a
   → POST /stt   (OpenAI gpt-4o-mini-transcribe)  → transcript
   → POST /ai-companion (Claude Messages API, tool use + user context)
        Claude may call tools → edge fn executes DB writes → tool_result → final spoken text
   → POST /tts   (ElevenLabs Flash v2.5)           → audio
   → expo-audio play
```

**Client `lib/voice.ts`:** record (`useAudioRecorder`) → `FileSystem.uploadAsync(MULTIPART)` to `/stt` → send transcript + short conversation history to `/ai-companion` → receive `{ replyText, audioUrl|audioBase64, actions[] }` → play audio, refresh affected Redux slices, render transcript. Use `expo-speech` as TTS fallback.

**`/ai-companion` Edge Function (Claude with tools):**
- Verify caller JWT; load the user's profile + today's stats to build a **personalized system prompt** ("You are Aurora, a warm health coach. The user's hydration goal is X, they've had Y today...").
- Define **tools** (strict schemas) Claude can call:
  - `add_water({ amount_ml })`
  - `log_sleep({ hours, date?, quality? })`
  - `create_habit({ name, frequency?, target_per_day? })`
  - `complete_habit({ name })`
  - `log_meal({ name, meal_type, calories?, protein_g?, carbs_g?, fat_g? })`
  - `get_progress({ range })` (read tool for "how am I doing this week?")
- Run the **agent loop** on the server: on `stop_reason: "tool_use"`, execute the DB write (using the user's id), return `tool_result`, continue until `end_turn`. Return Claude's final spoken text + a list of actions taken (for UI confirmation + optimistic refresh).
- Model: `claude-opus-4-8`, `anthropic-version: 2023-06-01`. System prompt: keep replies **short and speech-friendly**. Use `strict: true` tool schemas. (For cost on a chatty companion you may swap to a Haiku-tier model — that's a deliberate choice, not a default.)

**Example interactions to support:** "I drank 500ml water" → calls `add_water` → "Great, I've added 500ml to today's hydration." / "I slept 7 hours" → `log_sleep`. / "Create a habit to meditate every morning" → `create_habit`. / "How am I doing this week?" → `get_progress` → spoken summary.

**Edge function skeleton (`supabase/functions/ai-companion/index.ts`):** see §1.8 proxy pattern; add a `tools` array and the tool-execution loop. Reference the Claude tool-use docs for the manual agent loop (`stop_reason==='tool_use'` → execute → append `tool_result` → re-call).

**Reuse/Notes:**
- Build the **text chat version first** (type a message → Claude + tools → reply), verify tool-calling and DB writes work, **then** wrap voice (STT in front, TTS behind). This de-risks the core.
- Keep a short rolling message history client-side for context.
- Listening/speaking animation: Skia orb or animated bars — a big part of the "wow".
- If time is tight, on-device `expo-speech` TTS still demos well; ElevenLabs is the upgrade.

---

### Module 11 — Health Memory System (Optional)

**Goal:** Store useful observations so Aurora "understands me" (e.g., "often misses hydration goals", "sleeps better on weekends", "completes morning habits consistently").

**Implementation:**
- `health_memory` table already in schema. Two ways to populate:
  1. **Agent-written:** give the companion a `remember({ observation })` tool; Claude writes notable observations during conversations.
  2. **Rule/batch:** a scheduled or on-open routine computes patterns (e.g., 7-day hydration goal hit-rate) and inserts observations.
- **Use in prompts:** the `/ai-companion` function loads recent `health_memory` rows into the system prompt so responses feel personalized and continuous.
- Optionally surface a "What Aurora knows about you" list in Profile.

**Reuse/Notes:** This is what creates the "personal" feeling — even a few good observations injected into the prompt noticeably improve the demo. Low effort, high perceived intelligence.

---

### Module 12 — Progress & Reports (Optional)

**Goal:** Visual weekly + monthly reports.

**Screen:** `app/(tabs)/profile.tsx` → Reports, or a dedicated screen.

**Implementation:**
- **Weekly:** hydration %, sleep progress, habit completion %, nutrition summary — victory-native charts + summary cards.
- **Monthly:** consistency score, achievements, behavior trends, areas for improvement.
- Compute aggregates with Supabase SQL (group by date). Optionally have Claude generate a short **narrative summary** ("This week you improved sleep consistency by 12%...") from the aggregates via the AI proxy.

**Reuse/Notes:** Reuse chart wrappers. The AI narrative is a cheap, high-impact addition.

---

### Module 13 — Streak System (Optional)

**Goal:** Encourage (not compete). Hydration/sleep/habit/nutrition streaks; badges, milestones, achievements.

**Implementation:**
- `streaks` table (per user per type). On each successful daily completion, update: if `last_date` was yesterday → `current+1`, else reset to 1; bump `longest`.
- **Progress rings** `components/rings/ProgressRing.tsx` — Skia `<Path>` with animated trim (0→progress), rounded cap, sweep gradient (Apple activity-ring look). Drop-in option: `react-native-progress-circle-gradient`.
- **Badges/milestones:** unlock at thresholds (3, 7, 30 days) → show badge + `react-native-fast-confetti` + haptic.
- Streak card on dashboard + a dedicated achievements view.

**Reuse/Notes:** Rings are reused in dashboard, habits, and reports — build once. Keep tone celebratory and gentle.

---

### Module 14 — Notifications (Optional)

**Goal:** Personalized reminders (hydration, sleep, habits, daily insight).

**Implementation:**
- **`expo-notifications`** local scheduled notifications (no push server needed for prototype).
- Schedule based on profile prefs + times:
  - Hydration: periodic during waking hours ("You're one glass away from today's goal").
  - Sleep: near bedtime ("You usually begin your bedtime routine around now").
  - Habit: streak nudges ("5 days in a row!").
  - Daily insight: morning ("A new health insight is ready").
- Respect `notification_prefs`. Request permission during onboarding (Module 3).

**Reuse/Notes:** Local notifications are enough — "basic implementation is acceptable." Don't build push infra.

---

### Module 15 — Profile & Settings

**Goal:** Manage profile (personal info, goals, preferences) and settings (notifications, device connections, units, privacy).

**Screen:** `app/(tabs)/profile.tsx` + sub-screens.

**Implementation:**
- **Profile:** edit personal info, goals, wake/bed times → update `profiles`.
- **Settings:** notification toggles (wire to Module 14), device connections (Module 4), measurement units (metric/imperial — store pref, convert on display), privacy (sign out, delete account → delete user data, export).
- **Sign out:** `supabase.auth.signOut()` → routing guard sends to `(auth)`.
- "What Aurora knows" (Module 11) list here.

**Reuse/Notes:** Reuse `ScreenHeader`, list rows, toggles, modal. Straightforward CRUD on `profiles` + local prefs.

---

## 3. Build Phases (recommended order)

**Phase 0 — Foundations (do first):**
1. Create Supabase project; run schema migration + RLS + trigger.
2. Configure EAS **dev build**; install all packages; remove chart-kit.
3. `lib/supabase.ts`, `lib/auth.tsx`, routing guard in `_layout.tsx`.
4. Extend `theme.ts` (calm premium palette + typography).

**Phase 1 — Auth & Onboarding (Modules 1, 2, 3, 4):** landing carousel → auth (email first, then Google/Apple) → profile wizard → tracking choice. App now gates correctly and has user profiles.

**Phase 2 — Core tracking + Dashboard (Modules 5, 6, 7, 8, 9):** build domain slices + Supabase thunks; the four logging modules; the **water bottle**; the dashboard aggregating everything. This is a complete working app without AI.

**Phase 3 — The Companion (Module 10):** edge functions (`/ai-companion` with tools first, as **text chat**), verify tool-calling writes data, then add `/stt` + `/tts` and the voice UI. **Highest priority after a working app.**

**Phase 4 — Intelligence & polish (Modules 11, 12, 13, 14, 15):** health memory → personalized prompts; reports; streaks + rings + confetti; notifications; profile/settings. Layer premium polish (bottom sheets, haptics, gradients, blur, micro-interactions) throughout.

**Demo-readiness checklist:** end-to-end signup → onboarding → log via UI → log via **voice** ("I drank 500ml" actually updates the bottle) → dashboard reflects it → an insight appears → a streak/badge fires. That single flow showcases all six judging criteria.

---

## 4. Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Skia crashes on SDK 54 | `experimentalImportSupport:false` in metro.config; install via `npx expo install`; SVG bottle fallback ready |
| Native auth needs dev build | Build EAS dev client on day 1; disable email confirmation for demo |
| Voice pipeline complexity | Build text-chat companion first; `expo-speech` TTS fallback; manual pipeline (not realtime vendor) for full Claude tool control |
| API keys leaking | All Anthropic/OpenAI/ElevenLabs calls via Edge Functions; only `EXPO_PUBLIC_SUPABASE_*` in app |
| Time overrun | Optional modules (11–14) are clearly optional; ship Phases 0–3 first |

---

## 5. Environment / Secrets

**App (`.env`, `EXPO_PUBLIC_` prefix — safe to ship):**
```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```
**Edge Function secrets (server-only, via `supabase secrets set`):**
```
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
ELEVENLABS_API_KEY=...
```
Verified API facts: Claude endpoint `POST https://api.anthropic.com/v1/messages`, headers `x-api-key` + `anthropic-version: 2023-06-01`, model `claude-opus-4-8`, tool use via `tools` + `stop_reason: "tool_use"` loop, structured JSON via `output_config.format`.

---

*This plan maps every Aurora requirement onto the existing `health-tracker-expo` foundation, prioritizes the voice companion and UI polish (the highest-scored areas), and sequences work so there is always a working, demoable app.*
