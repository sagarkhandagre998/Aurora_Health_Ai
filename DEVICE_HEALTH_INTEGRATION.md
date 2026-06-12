# Device Health Integration (Apple Health + Android Health Connect)

Aurora syncs with your phone's health platform so the data you already track flows
into the app automatically — and the water you log in Aurora flows back out. One
source of truth, no double entry. The integration is **cross-platform**:

- **iOS** → **Apple Health** (HealthKit)
- **Android** → **Health Connect**

The app automatically uses the right provider for the device it's running on. The
UI shows the correct name/icon per platform ("Apple Health" with a heart on iOS,
"Health Connect" with a pulse on Android).

> On any unsupported platform (web, Expo Go, a build without the native module),
> the feature gracefully shows an "unavailable" notice and the rest of the app
> works normally — it can never crash the app.

---

## 1. What it does

| Metric | Direction | Where it shows in Aurora |
|---|---|---|
| **Steps** | Read | Dashboard → *Activity* card |
| **Active Energy** | Read | Dashboard → *Activity* card (kcal) |
| **Sleep** | Read | Sleep tab + Dashboard sleep card |
| **Water** | **Read + Write** | Hydration tab & bottle (two-way sync) |

### Why it's useful
- **No manual re-entry** — sleep from your watch/phone shows up automatically.
- **Steps & energy without a pedometer screen** — Aurora reads what the device measured.
- **Two-way hydration** — water logged in Aurora appears in Apple Health / Health
  Connect, and water logged elsewhere is imported back, without double-counting.
- **Smarter companion & insights** — the AI reasons about your *actual* day.

### How double-counting is prevented
Every entry carries a `source` (`manual` / `apple_health` / `health_connect`) and,
when written to the health store, the native sample's unique id (`hk_uuid`). On
import, Aurora skips samples it already has and samples it wrote itself.

---

## 2. How to use it (as a user)

1. Open **Profile** → **Devices & Data** → **Apple Health** (iOS) / **Health Connect** (Android).
2. Tap **Connect**.
3. Approve the permission sheet (Steps, Active Energy, Sleep, Water).
4. Aurora runs a first sync immediately.

### Day-to-day
- **Automatic sync** on every app open (foreground).
- **Manual sync** via **Sync now**.
- **Per-metric toggles** — turn any metric on/off.
- **Disconnect** to stop syncing.

### Changing permissions later
- **iOS:** Settings → Health → Data Access & Devices → Aurora.
- **Android:** Health Connect app → App permissions → Aurora.

---

## 3. Platform support & cost reality

| Platform | Provider | Developer account needed? | Free to build & test yourself? |
|---|---|---|---|
| **Android** | Health Connect | **No** | ✅ **Yes** — free APK, no account |
| **iOS** | Apple HealthKit | **Yes — paid ($99/yr)** to build/sideload from a non-Mac | ❌ Not without a Mac or the paid program |

**Key takeaway for this project:** the **Android Health Connect** path is fully
free and self-testable. Apple Health requires either a Mac (free Apple ID +
Xcode) or the **$99/yr Apple Developer Program** to get a build onto a real
iPhone — there is no free way to do it from Windows.

So for a free, live, demoable device integration: **use Android.**

---

## 4. Setup — Android (free, recommended)

### Step 1 — Install the native package
```bash
npx expo install react-native-health-connect
```

### Step 2 — Build an Android dev/preview build
```bash
# Installable APK you can put on any Android phone:
eas build --profile preview --platform android
# or a dev client:
eas build --profile development --platform android
```
(Android EAS builds are free. `npx expo run:android` also works if you have the
Android SDK installed locally.)

### Step 3 — Install Health Connect on the phone
- **Android 14+:** Health Connect is built into system settings.
- **Android 13 and below:** install **Health Connect** from the Play Store.
- Put some data in it (Google Fit / Samsung Health / Fitbit can feed it, or add
  manual entries) so there's something to sync.

### Step 4 — Run the database migration
Apply `supabase/migrations/0004_healthkit.sql` (adds `source` + `hk_uuid`).

### Step 5 — Connect
Open the app → **Profile → Health Connect → Connect** → approve → confirm steps/
sleep/water appear.

---

## 5. Setup — iOS (Apple Health, needs paid account on Windows)

### Step 1 — Install the native package
```bash
npx expo install @kingstinct/react-native-health
```

### Step 2 — Rebuild the native app
```bash
npx expo prebuild -p ios --clean
eas build --profile development --platform ios   # requires paid Apple Developer account
```
(Or, on a Mac with a free Apple ID, `npx expo run:ios --device` — but this app
uses Sign in with Apple, which the free tier won't provision, so you'd need to
disable that capability for a free-account build.)

### Step 3 — Migration + connect
Same as Android Steps 4–5; the screen shows "Apple Health."

---

## 6. Architecture (for maintainers)

```
            Apple Health (iOS)            Health Connect (Android)
                   │                              │
        lib/healthkit.ts              lib/healthConnect.ts
         (guarded, iOS only)           (guarded, Android only)
                   └──────────────┬───────────────┘
                                  ▼
                       lib/healthProvider.ts
            (picks provider per platform; shared types;
             getHealthProvider / isHealthAvailable / name)
                                  │
                                  ▼
                        lib/healthSync.ts
          syncFromHealthKit()  +  pushWaterToHealthKit()
            • steps/energy → Redux
            • sleep → sleep_logs (upsert user_id,date)
            • water → water_logs (dedupe by hk_uuid)
                                  │
        ┌─────────────────┬──────┴───────┬────────────────────┐
        ▼                 ▼              ▼                     ▼
 hooks/useHealthSync  app/health-     app/(tabs)/index   app/(tabs)/profile
 (auto-sync on        connect.tsx     Activity card      "…Health" row
  foreground)         (connect UI)    (steps+energy)     (platform-aware)
```

**Key files**

| File | Responsibility |
|---|---|
| `lib/healthProvider.ts` | Platform switch + shared types (`DailyValue`, `HealthSleepSample`, `HealthWaterSample`, `HealthProvider`). Exposes `getHealthProvider()`, `isHealthAvailable()`, `getHealthProviderName()`. |
| `lib/healthkit.ts` | Apple HealthKit wrapper. Lazily requires `@kingstinct/react-native-health`; no-ops off-iOS. |
| `lib/healthConnect.ts` | Health Connect wrapper. Lazily requires `react-native-health-connect`; no-ops off-Android. Maps HC records (Steps/ActiveCaloriesBurned/SleepSession/Hydration) to the shared shapes. |
| `lib/healthSync.ts` | Provider-agnostic read/write orchestration, sleep aggregation, water dedupe, Redux + Supabase updates. |
| `store/slices/activitySlice.ts` | Persisted state: `hkConnected`, `enabledMetrics`, today's steps/energy, 7-day series, `lastSyncedAt`. |
| `hooks/useHealthSync.ts` | Mounted in `app/_layout.tsx`; syncs on foreground when connected. |
| `app/health-connect.tsx` | Connection/settings screen (`/health-connect`), platform-aware name/icon/copy. |
| `supabase/migrations/0004_healthkit.sql` | `source` + `hk_uuid` columns + partial unique index. |

### Why it's cross-platform-safe
- Each native wrapper checks `Platform.OS` **before** `require()`ing its module,
  so the wrong-platform native code never loads.
- The provider facade returns `null` on unsupported platforms; `isHealthAvailable()`
  gates every entry point.
- JS for both packages is bundled into both apps (harmless — never executes on the
  wrong OS); **native** autolinking compiles only the correct platform's library.

### Design notes
- **Steps & active energy** are local-only (Redux/persist) — read fresh each sync,
  no DB table.
- **Sleep & water** go through Supabase to reuse the existing modules, history,
  charts, and the AI companion.
- The `source` written to the DB is the provider key (`apple_health` on iOS,
  `health_connect` on Android), so rows are traceable to their origin.

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| "unavailable in this build" | Native module not in the binary. `npx expo install` the package, then prebuild + rebuild. |
| Android: "Health Connect isn't available" | Install/enable the Health Connect app (Play Store on Android ≤13; built-in on 14+). |
| Connected but no data | Ensure the permission sheet was allowed, metric toggles are on, and the health store actually has data for today. |
| Water counted twice | Confirm migration `0004` ran (needs `source` + `hk_uuid` columns). |
| Permission sheet won't reappear | iOS: Settings → Health → Aurora. Android: Health Connect app → App permissions → Aurora. |

---

*Device health integration is an optional bonus on top of Aurora's manual
tracking — every module works fully without it. The Android (Health Connect) path
is free and self-testable; the iOS (Apple Health) path needs a Mac or a paid
Apple Developer account.*
