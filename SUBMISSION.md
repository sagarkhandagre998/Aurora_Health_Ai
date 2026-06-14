# Submission of Live Automated AI Health Companion — "Aurora"

**Name** — Sagar Khandagre
**Email** — sagar.khandagre998@gmail.com
**Country** — INDIA
**Time** — IST

---

## Key Features

### 🎙️ Live Agent — Hands-Free (flagship)
An always-on voice loop that runs above the entire app: **listen → understand → act → reply → listen again.** It detects on its own when you stop talking, so you never press a button. The Live bar stays active as you move between tabs — completely hands-free. You just talk, and Aurora logs, plans, and tracks everything for you.

**Other features (15 modules covered):**
- **AI Companion Agent** — talk by text, voice, or live mode, all on one shared agent brain
- **8 action tools** — log water, log sleep, create habit, complete habit, log meal, create meal plan, get progress, remember (long-term memory)
- **Nutri-Coach** — AI generates a full recipe (ingredients, steps, macros) to hit your targets + diet, saved automatically
- **Hydration** — animated water bottle + sound, two-way Health sync
- **Sleep** — duration, quality & weekly trends
- **Habits** — daily/weekly habits with streaks
- **Nutrition** — meals, calories & macros (protein/carbs/fat)
- **Dashboard** — your whole day at a glance
- **Onboarding** — profile, goals, lifestyle & notifications (personalizes the AI)
- **Auth** — Email, Google & Apple sign-in
- **Insights & Reports** — progress summaries
- **Safety layer** — health-only scope, declines off-topic & jailbreak attempts, no medical diagnosis
- **Health Connect / Apple Health** integration
- **Secure backend** — per-user row-level security on all data

---

## Android APK Build Download Link
_<paste link>_

## Demo Recording Walkthrough
_<paste link>_

---

## Architecture

- **Frontend:** Expo / React Native (Expo Router), Redux Toolkit (persisted), Reanimated + Skia
- **Backend:** Supabase — Postgres with Row-Level Security, Auth, and Deno Edge Functions (`ai-companion`, `nutri-coach`, `stt`, `tts`, `generate-insights`)
- **AI:** OpenAI-compatible LLM via Cerebras (`gpt-oss-120b`) with Groq fallback; Gemini / ElevenLabs for voice

### Agent Pipeline

A three-stage pipeline wrapped in a safety layer:

1. **Context** — everything about the user is gathered before the agent responds.
2. **Thinking** — the agent reasons over the request, decides whether an action is needed, and plans which tool to use.
3. **Action** — a set of real tools the agent can invoke to actually do things.
4. **Safety Layer** — surrounds the whole pipeline, keeping the agent strictly within health.

```
            ┌──────────────── Safety Layer ────────────────┐
            │                                               │
  Request → │   Context  →  Thinking  →  Action  →  Reply   │ → Response
            │                                               │
            └───────────────────────────────────────────────┘
```

### Live Agent Pipeline

The Live agent is the **same agent brain** placed inside a continuous loop — no second brain was built for voice. It reuses the exact same Context, Thinking, Action, and Safety stages.

```
   ┌──────────────────────────────────────────────────────────┐
   │                                                            │
   └─→ Listen → Speech-to-Text → Agent Pipeline → Speak ────────┘
                                  (same as above)
```

Listen → Speech-to-Text → **Agent Pipeline** → Speak → back to Listen. The loop runs globally above the app, so it persists across all tabs and keeps going hands-free.

### Health Connect

Aurora connects to the phone's native health platform — **Apple Health on iOS, Health Connect on Android** — behind one unified interface. It brings in **steps, active energy, sleep, and water**, with **two-way water sync**. This gives the agent the user's full health picture, so its tips reflect real activity. Data stays private to the user's account, and access can be turned off anytime.
