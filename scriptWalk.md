 1 · Landing & Sign In — ⏱️  0:00–0:35

  🎬 Open the app to the landing carousel. Slowly swipe through the slides, then tap Get Started → land on Sign In.

  🎙️

  ▎ "Hi everyone — this is Aurora, an AI-powered personal health companion. When you first open the app, you're greeted by a quick intro carousel — it walks you
  ▎ through the core idea: track your hydration, sleep, habits and nutrition, get personalized daily insights, and build healthier routines over time.
  ▎
  ▎ Once you swipe through, you tap Get Started. If you already have an account you can jump straight to Sign In — and we also support Continue with Google for
  ▎ one-tap access."

  ---
  2 · Register & Onboarding — ⏱️  0:35–1:05

  🎬 Tap sign up / register. Then move through onboarding: profile → goals → lifestyle → notifications.

  🎙️

  ▎ "After registering, Aurora runs a short onboarding flow. We collect your profile basics, your health goals, a bit about your lifestyle, and your notification
  ▎ preferences.
  ▎
  ▎ This isn't just form-filling — this profile becomes the context that personalizes everything, including how the AI companion talks to you and what it
  ▎ recommends."

  ---
  3 · Dashboard & The Four Modules — ⏱️  1:05–2:05

  🎬 Land on the Dashboard. Then tab through: Hydration → Sleep → Habits → Nutrition.

  🎙️

  ▎ "And here's the dashboard — your daily snapshot at a glance. Aurora is built around four health modules.
  ▎
  ▎ First, Hydration — log your water with a satisfying animated bottle that fills up as you drink, with real water sounds for feedback.
  ▎
  ▎ Next, Sleep — track how long and how well you sleep, and watch the trends build over the week.
  ▎
  ▎ Then Habits — create daily or weekly habits and build streaks through consistency.
  ▎
  ▎ And Nutrition — log meals, track your calories and macros — protein, carbs, and fat — all in one place."

  ---
  4 · The Companion Agent — Architecture & Features — ⏱️  2:05–3:35

  🎬 Open the Companion tab. While the orb animates, talk over the architecture. Then demo: (a) type a message, (b) tap mic to voice-record.

  🎙️  (Architecture — say this over the Companion screen)

  ▎ "Now the core of Aurora — the AI Companion agent. Let me explain the architecture first, because this is where the real engineering is.
  ▎
  ▎ When you send a message, it goes to a secure edge function that runs an agentic loop. On every request the agent does four things: it verifies who you are, it
  ▎ loads your personalized health stats for today plus its long-term memory of you to build the system prompt, then it runs a tool-using reasoning loop — up to five
  ▎ turns — backed by a fast large language model with automatic provider fallback for reliability.
  ▎
  ▎ The agent has a set of real tools it can call against the database — it can log water, log sleep, create and complete habits, log meals, generate meal plans,
  ▎ pull your progress, and even remember facts about you for later.
  ▎
  ▎ And critically — it's scope-locked to health coaching only. The system prompt strictly limits it to hydration, sleep, nutrition, habits, and wellbeing. Ask it to
  ▎ write code or answer trivia, and it politely declines and steers you back to your health. It's a focused health coach, not a general chatbot."

  🎬 Now type: "I drank a glass of water" → show the action chip appear. Then tap the mic, speak a question, show it transcribe and reply aloud.

  🎙️  (Features)

  ▎ "There are three ways to talk to it. You can type — watch, when I say 'I drank a glass of water,' it actually calls the tool and logs it, confirmed right here.
  ▎
  ▎ You can voice-record — tap the mic, speak naturally, and it transcribes your speech, reasons over it, and replies out loud in a natural voice.
  ▎
  ▎ And then there's the most powerful mode — Aurora Live."

  ---
  5 · Live Agent Architecture — Hands-Free Automation — ⏱️  3:35–4:10

  🎬 Tap Go Live. Show the floating Live pill. Navigate between tabs while it stays active — to prove it's global.

  🎙️

  ▎ "Aurora Live is fully hands-free. Behind the scenes it runs a continuous loop: it listens, automatically detects when you stop speaking using voice-activity
  ▎ detection, transcribes, runs the exact same agent pipeline with all its tools, speaks the answer back, and then immediately starts listening again — no tapping,
  ▎ ever.
  ▎
  ▎ And notice — the Live bar stays alive even as I move between tabs, because it lives globally above every screen. This is the automation layer: you just talk, and
  ▎ Aurora does things for you across the whole app — logging, planning, tracking — completely hands-free."

  ---
  6 · Live Example — Preparing a Meal — ⏱️  4:10–4:40

  🎬 With Live on, say out loud: "Make me a high-protein vegetarian lunch, around 40 grams of protein." Let Aurora ask/confirm, generate, then open the Nutrition tab
  to show the saved meal plan.

  🎙️

  ▎ "Let me show you a real example. I'll just say: 'Make me a high-protein vegetarian lunch, around 40 grams of protein.'
  ▎
  ▎ Aurora confirms the macros and diet, then its Nutri-Coach engine generates a complete recipe — ingredients, steps, and the full macro breakdown — and saves it
  ▎ straight to my Nutrition tab. I didn't touch the screen once. That's a meal, prepared and logged, entirely by voice."

  ---
  7 · Health Connect — ⏱️  4:40–5:00

  🎬 Open the Health Connect screen. Tap Connect, show the metric toggles (steps, active energy, sleep, water).

  🎙️

  ▎ "Finally — Health Connect. Aurora syncs with your phone's health platform — Apple Health on iOS, Health Connect on Android — pulling in steps, active energy,
  ▎ sleep, and water, with two-way hydration sync.
  ▎
  ▎ That means Aurora sees your full health picture automatically, so its coaching is grounded in your real activity. Your data stays private to your account, and
  ▎ you can revoke access anytime.
  ▎
  ▎ That's Aurora — a focused, agentic health companion that doesn't just track your health, it actively manages it for you. Thanks for watching!"

  ---
  📋 Recording tips

  - Pre-load state: have water/sleep/habits already logged so charts look alive, not empty.
  - Pre-test the Live meal demo once before recording — generation takes a few seconds; you can trim dead air in editing or talk over it.
  - Network: the agent, STT, and TTS are all server calls — record on solid Wi-Fi to avoid lag.
  - Tight on time? Section 4 (architecture) is your highlight — protect it. Trim 5s each from onboarding and the modules if you run over.

  ---
  Want me to save this as a file (e.g. WALKTHROUGH.md) in the repo, or produce a condensed teleprompter version (just the spoken lines, no stage directions) that's
  easier to read while recording?