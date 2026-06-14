Submission of Live Automated AI Health Companion — "Aurora"

Name - Sagar Khandagre
Email - sagar.khandagre998@gmail.com
Country - INDIA
Time - IST

Key Features (All 15 modules covered)

🎙️ Live Agent — Hands-Free (flagship)
Always-on voice loop above the whole app: listen → understand → act → reply → listen again. Detects when you stop talking, so you never press a button, and stays active across all tabs. Just talk, and Aurora logs, plans and tracks for you.

- AI Companion Agent — text, voice & live, one shared brain
- 8 action tools — log water, log sleep, create/complete habit, log meal, create meal plan, get progress, remember
- Nutri-Coach — AI builds a full recipe (ingredients, steps, macros) for your targets + diet
- Hydration — animated bottle + sound, two-way Health sync
- Sleep — duration, quality & weekly trends
- Habits — daily/weekly habits with streaks
- Nutrition — meals, calories & macros
- Dashboard — full day at a glance
- Onboarding — profile, goals, lifestyle & notifications
- Auth — Email, Google & Apple
- Insights & Reports
- Safety layer — health-only, refuses off-topic & jailbreaks
- Health Connect / Apple Health integration
- Secure backend — per-user row-level security

Android APK Build Download Link - <paste link>
Demo Recording Walkthrough - <paste link>

Architecture
Frontend: Expo / React Native (Expo Router), Redux Toolkit, Reanimated + Skia.
Backend: Supabase — Postgres (Row-Level Security), Auth, Deno Edge Functions.
AI: Cerebras (gpt-oss-120b) + Groq fallback; Gemini / ElevenLabs voice.

Agent Pipeline (design)
Context → Thinking → Action, all wrapped in a Safety Layer.
- Context: everything about the user is gathered before it responds.
- Thinking: it reasons, decides if an action is needed, and plans the tool.
- Action: real tools it can invoke to actually do things.
- Safety Layer: surrounds the whole pipeline, keeping it strictly health.

Live Agent Pipeline
The same agent brain inside a loop — no second brain for voice:
Listen → Speech-to-Text → Agent Pipeline (same as above) → Speak → back to Listen.
Runs globally above the app, so it persists across tabs, hands-free.

Health Connect
Connects to the phone's native health platform — Apple Health (iOS) / Health Connect (Android) — behind one interface. Brings in steps, active energy, sleep and water, with two-way water sync, giving the agent your full health picture. Data stays private and access can be turned off anytime.
