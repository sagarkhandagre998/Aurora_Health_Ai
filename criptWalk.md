# Aurora — 5-Minute Walkthrough

## 1. Landing & Sign In
- This is **Aurora**, an AI-powered personal health companion.
- When you open the app, you're greeted by an intro carousel with 5 slides showing the core idea — track hydration, sleep, habits and nutrition, and get personalized insights.
- After swiping through, you tap **Get Started**.
- If you already have an account you can **Sign In**, and we also support **Continue with Google** for one-tap access.

## 2. Register & Onboarding
- After registering, Aurora runs a short **onboarding** flow.
- We collect your **profile** basics, your **health goals**, your **lifestyle**, and your **notification** preferences.
- This profile becomes the context that personalizes everything, including how the AI companion talks to you and what it recommends.

## 3. Dashboard & The Four Modules
- This is the **dashboard** — your daily snapshot at a glance.
- Aurora is built around four health modules:
  - **Hydration** — log your water with an animated bottle that fills as you drink, with real water sounds.
  - **Sleep** — track how long and how well you sleep, and watch the weekly trends build.
  - **Habits** — create daily or weekly habits and build streaks through consistency.
  - **Nutrition** — log meals and track your calories and macros (protein, carbs, fat) in one place.

## 4. The Companion Agent — Architecture & Features
- Now the core of Aurora — the **AI Companion agent**.
- **Architecture:**
  - When you send a message, it goes to a secure **edge function** that runs an **agentic loop**.
  - On every request the agent does four things: it **verifies who you are**, it **loads your personalized health stats for today** plus its long-term memory of you to build the prompt, then it runs a **tool-using reasoning loop** (up to five turns) backed by a fast LLM with automatic provider fallback for reliability.
  - The agent has a set of **real tools** it can call against the database — log water, log sleep, create and complete habits, log meals, generate meal plans, pull your progress, and **remember** facts about you.
  - It's **scope-locked to health coaching only** — ask it to write code or answer trivia and it politely declines and steers you back to your health.
- **Features — three ways to talk to it:**
  - **Text** — when I say "I drank a glass of water," it actually calls the tool and logs it, confirmed right here.
  - **Voice record** — tap the mic, speak naturally, and it transcribes your speech, reasons over it, and replies out loud in a natural voice.
  - And the most powerful mode — **Aurora Live**.

## 5. Live Agent — Hands-Free Automation
- **Aurora Live** is fully hands-free.
- Behind the scenes it runs a **continuous loop**: it listens, automatically detects when you stop speaking, transcribes, runs the same agent pipeline with all its tools, speaks the answer back, and then immediately starts listening again — no tapping, ever.
- The Live bar stays alive even as I move between tabs, because it lives globally above every screen.
- This is the automation layer: you just talk, and Aurora does things for you across the whole app — logging, planning, tracking — completely hands-free.

## 6. Live Example — Preparing a Meal
- Here's a real example. I'll just say: "Make me a high-protein vegetarian lunch, around 40 grams of protein."
- Aurora confirms the macros and diet, then its **Nutri-Coach** engine generates a complete recipe — ingredients, steps, and the full macro breakdown — and saves it straight to my Nutrition tab.
- I didn't touch the screen once — a meal, prepared and logged, entirely by voice.

## 7. Health Connect
- Finally — **Health Connect**.
- Aurora syncs with your phone's health platform — Apple Health on iOS, Health Connect on Android — pulling in **steps, active energy, sleep, and water**, with two-way hydration sync.
- That means Aurora sees your full health picture automatically, so its coaching is grounded in your real activity.
- Your data stays private to your account, and you can revoke access anytime.
- That's Aurora — a focused, agentic health companion that doesn't just track your health, it actively manages it for you. Thanks for watching!
