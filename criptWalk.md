# Aurora — 5-Minute Walkthrough Script

## 1. Landing & Sign In

So let me walk you through Aurora, our AI-powered personal health companion. Right now I'm opening the app, and the first thing you see is this intro carousel. Let me swipe through these slides — as you can see, each one introduces the core idea behind Aurora: tracking your hydration, your sleep, your habits and your nutrition, and getting personalized insights every day. Now that I've gone through the slides, I'll tap **Get Started** here. And if you already have an account, you can just tap **Sign In** instead — we've also added **Continue with Google** right here, so you can get in with a single tap.

## 2. Register & Onboarding

I'll go ahead and register now. Once you sign up, Aurora takes you through a quick onboarding flow. So here I'm filling in my **profile** details, then I set my **health goals**, then a little bit about my **lifestyle**, and finally my **notification** preferences. This part is important — everything I'm entering here becomes the context that personalizes the whole app, including how the AI companion talks to me and what it recommends later on.

## 3. Dashboard & The Four Modules

And now we land on the **dashboard**. This is your daily snapshot at a glance. Aurora is built around four health modules, so let me quickly take you through each one. First I'll open **Hydration** — you can see I log my water with this animated bottle that fills up as I drink, and it even plays real water sounds. Next is **Sleep**, where I track how long and how well I slept, and over here you can see the weekly trends building up. Then we have **Habits** — I can create daily or weekly habits and build streaks just by staying consistent. And lastly **Nutrition**, where I log my meals and track my calories and macros — protein, carbs and fat — all in one place.

## 4. The Companion Agent — Architecture & Features

Now let me take you to the heart of Aurora — the **AI Companion agent**. I'm opening it up here, and while it loads, let me explain how it actually works behind the scenes, because this is where the real engineering is. When I send a message, it goes to a secure edge function that runs an **agentic loop**. On every request, the agent does four things — it verifies who I am, it loads my personalized health stats for today along with its long-term memory of me to build the prompt, then it runs a tool-using reasoning loop, up to five turns, powered by a fast language model with automatic fallback so it stays reliable. The agent has a set of real tools it can actually call against the database — it can log water, log sleep, create and complete habits, log meals, generate meal plans, pull up my progress, and even remember facts about me for later. And one important thing — it's scope-locked to health coaching only. So if I ask it to write code or answer some random trivia, it politely declines and steers me back to my health.

Now let me show you the features. There are three ways to talk to it. First, I can just **type** — watch, I'll say "I drank a glass of water," and you can see it actually called the tool and logged it, confirmed right here. Second, I can **voice record** — I tap the mic, speak naturally, and it transcribes what I said, reasons over it, and replies back to me out loud in a natural voice. And then there's the most powerful mode of all — **Aurora Live**.

## 5. Live Agent — Hands-Free Automation

Let me turn on **Aurora Live**. This mode is completely hands-free. Behind the scenes it runs a continuous loop — it listens, automatically detects when I stop speaking, transcribes it, runs the same agent pipeline with all its tools, speaks the answer back, and then immediately starts listening again, without me tapping anything. And notice this — the Live bar stays active even as I move between tabs, because it lives globally above every screen. So this is really the automation layer of the app: I just talk, and Aurora does everything for me across the whole app — logging, planning, tracking — completely hands-free.

## 6. Live Example — Preparing a Meal

Let me show you a real example of that. With Live on, I'll just say out loud: "Make me a high-protein vegetarian lunch, around 40 grams of protein." And watch — Aurora confirms the macros and the diet, then its Nutri-Coach engine generates a complete recipe with the ingredients, the steps, and the full macro breakdown, and saves it straight into my Nutrition tab. And notice I didn't touch the screen even once — that's a full meal, prepared and logged, entirely by voice.

## 7. Health Connect

And finally, let me show you **Health Connect**. Aurora syncs with your phone's health platform — Apple Health on iOS, and Health Connect on Android — and pulls in your steps, your active energy, your sleep, and your water, with two-way hydration sync. So what this means is Aurora automatically sees your full health picture, which makes all of its coaching grounded in your real activity. And of course your data stays private to your account, and you can revoke access anytime. So that's Aurora — a focused, agentic health companion that doesn't just track your health, it actively manages it for you. Thanks for watching!
