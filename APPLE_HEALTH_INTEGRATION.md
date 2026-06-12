# Apple Health Integration

Aurora can connect to **Apple Health** so the data you already track on your iPhone and Apple Watch flows into the app automatically — and the water you log in Aurora flows back out to Apple Health. One source of truth, no double entry.

> **iPhone only.** Apple Health (HealthKit) does not exist on Android, web, or in Expo Go. On those platforms this feature is hidden/disabled and the rest of the app works normally.

---

## 1. What it does

| Metric | Direction | Where it shows up in Aurora |
|---|---|---|
| **Steps** | Read from Health | Dashboard → *Activity* card (today's total) |
| **Active Energy** | Read from Health | Dashboard → *Activity* card (kcal burned) |
| **Sleep** | Read from Health | Sleep tab + Dashboard sleep card (one "asleep" total per night) |
| **Water** | **Read + Write** | Hydration tab & bottle. Water logged in Aurora is pushed to Apple Health; water logged elsewhere is imported back. |

### Why it's useful
- **No manual re-entry.** Sleep tracked by your Apple Watch shows up in Aurora's sleep history without you typing anything.
- **Steps & energy without a pedometer screen.** Aurora doesn't track motion itself — it reads what your phone/watch already measured.
- **Two-way hydration.** Log a glass of water in Aurora and it appears in Apple Health (and any other app reading from it). Log water in another app and Aurora pulls it in — without ever double-counting.
- **Smarter companion.** Because real activity/sleep data lands in your account, the AI companion and daily insights can reason about your *actual* day, not just what you remembered to log.

### How double-counting is prevented
Every water entry carries a `source` (`manual` / `apple_health`) and, when written to Health, the HealthKit sample's unique ID (`hk_uuid`). On import, Aurora skips samples it already has and skips samples it wrote itself — so your hydration total is always correct.

---

## 2. How to use it (as a user)

1. Open **Profile** tab → **Devices & Data** → **Apple Health**.
2. Tap **Connect Apple Health**.
3. iOS shows a permission sheet — **allow** the categories you want (Steps, Active Energy, Sleep, Water).
4. Aurora runs a first sync immediately. You'll see steps & energy on the Dashboard *Activity* card and any sleep/water imported.

### Day-to-day
- **Automatic sync:** Aurora re-syncs every time you open the app (foreground), so data stays fresh on its own.
- **Manual sync:** On the Apple Health screen, tap **Sync now** to pull the latest immediately.
- **Choose what syncs:** Toggle individual metrics (Steps / Active Energy / Sleep / Water) on that same screen. Turn off anything you don't want imported.
- **Disconnect:** Tap **Disconnect** to stop syncing and clear the connection in Aurora.

### Changing permissions later
Aurora can't re-show the iOS permission sheet once you've answered it. To change what Aurora can read/write:
**iOS Settings → Health → Data Access & Devices → Aurora** (or the Health app → **Sharing → Apps**).

---

## 3. Setup (developer — required before it works)

The integration uses a **native module**, so it only runs in a custom dev/production build — not Expo Go, not the iOS Simulator for most metrics. You need a **real iPhone** and an **Apple Developer account** (HealthKit requires the entitlement).

### Step 1 — Install the native package
```bash
npx expo install @kingstinct/react-native-health
```
`expo install` resolves the version compatible with your Expo SDK. (It's already listed in `package.json`; this aligns the native pod.)

### Step 2 — Rebuild the native app
The HealthKit entitlement and usage strings are added by the config plugin in `app.json`, so you must regenerate native code:
```bash
npx expo prebuild -p ios --clean
# then either:
eas build --profile development --platform ios     # cloud build → install on device
# or, with Xcode toolchain on a Mac + device plugged in:
npx expo run:ios --device
```

### Step 3 — Run the database migration
Apply `supabase/migrations/0004_healthkit.sql` to your Supabase project. It adds the `source` and `hk_uuid` columns used for provenance and dedupe:
```bash
supabase db push          # or run the SQL in the Supabase dashboard SQL editor
```

### Step 4 — Test on device
Install the dev build on your iPhone → **Profile → Apple Health → Connect** → approve the permission sheet → confirm steps/sleep/water appear.

---

## 4. How it's wired (for maintainers)

```
HealthKit (iPhone/Watch)
        │
        ▼
lib/healthkit.ts      ← guarded native wrapper (lazy require; no-ops off-iOS)
        │
        ▼
lib/healthSync.ts     ← syncFromHealthKit() + pushWaterToHealthKit()
        │                 • steps/energy → Redux
        │                 • sleep  → sleep_logs (upsert on user_id,date)
        │                 • water  → water_logs (deduped by hk_uuid)
        ▼
store/slices/activitySlice.ts   ← connection flag, toggles, today's totals, 7-day series
        │
        ├─ hooks/useHealthSync.ts   ← auto-sync on mount + app foreground (throttled)
        ├─ app/health-connect.tsx   ← connect / toggle / sync / disconnect UI
        ├─ app/(tabs)/index.tsx     ← Activity card (steps + energy)
        ├─ app/(tabs)/hydration.tsx ← mirrors new water logs into Health
        └─ app/(tabs)/profile.tsx   ← "Apple Health" entry row
```

**Key files**

| File | Responsibility |
|---|---|
| `lib/healthkit.ts` | Thin promise wrapper over the native callbacks. Lazily requires the module so non-iOS builds never crash. `isHealthKitAvailable()` is the gate everything checks. |
| `lib/healthSync.ts` | All read/write orchestration, sleep aggregation, water dedupe, Redux + Supabase updates. |
| `store/slices/activitySlice.ts` | Persisted state: `hkConnected`, `enabledMetrics`, today's steps/energy, `series`, `lastSyncedAt`. |
| `hooks/useHealthSync.ts` | Mounted once in `app/_layout.tsx`; syncs on foreground when connected. |
| `app/health-connect.tsx` | The connection/settings screen (`/health-connect` route). |
| `supabase/migrations/0004_healthkit.sql` | `source` + `hk_uuid` columns + partial unique index. |

### Design notes
- **Steps & active energy are local-only** (Redux/persist) — there's no DB table for them; they're read fresh from Health each sync.
- **Sleep & water go through Supabase** so they share the existing logging modules, history, charts, and the AI companion's data.
- **Graceful degradation:** if the native module isn't present (e.g. you haven't rebuilt yet), `isHealthKitAvailable()` returns `false`, the screen shows an explanatory notice, and nothing breaks.

---

## 5. Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| "HealthKit is unavailable in this build" on the Apple Health screen | The native module isn't in the binary. Run `npx expo install @kingstinct/react-native-health` then `npx expo prebuild` + rebuild (Step 2). |
| Section says "only available on iPhone" | You're on Android/web/Simulator — expected; HealthKit is iOS-only. |
| Connected but no data appears | Make sure you **allowed** the categories in the iOS sheet, that the metric toggles are **on**, and that Apple Health actually has data for today. Check iOS Settings → Health → Aurora. |
| Water counted twice | Shouldn't happen — dedupe is by `hk_uuid` + source. If it does, confirm migration `0004` ran so the columns exist. |
| Permission sheet never reappears | iOS only shows it once. Change access in iOS Settings → Health → Data Access & Devices → Aurora. |

---

*Apple Health integration is an optional bonus on top of Aurora's manual tracking — every module works fully without it.*
