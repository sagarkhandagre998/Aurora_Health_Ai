# Aurora — 5-Minute Walkthrough Script

## 1. Landing & Sign In

So let me walk you through Aurora, our AI-powered personal health companion. Right now I'm opening the app, and the first thing you see is this intro carousel. Let me swipe through these slides — as you can see, each one introduces the core idea behind Aurora: tracking your hydration, your sleep, your habits and your nutrition, and getting personalized insights every day. Now that I've gone through the slides, I'll tap **Get Started** here. And if you already have an account, you can just tap **Sign In** instead — we've also added **Continue with Google** right here, so you can get in with a single tap.

## 2. Register & Onboarding

I'll go ahead and register now. Once you sign up, Aurora takes you through a quick onboarding flow. So here I'm filling in my **profile** details, then I set my **health goals**, then a little bit about my **lifestyle**, and finally my **notification** preferences. This part is important — everything I'm entering here becomes the context that personalizes the whole app, including how the AI companion talks to me and what it recommends later on.

## 3. Dashboard & The Four Modules

And now we land on the **dashboard**. This is your daily snapshot at a glance. Aurora is built around four health modules, so let me quickly take you through each one. First I'll open **Hydration** — you can see I log my water with this animated bottle that fills up as I drink, and it even plays real water sounds. Next is **Sleep**, where I track how long and how well I slept, and over here you can see the weekly trends building up. Then we have **Habits** — I can create daily or weekly habits and build streaks just by staying consistent. And lastly **Nutrition**, where I log my meals and track my calories and macros — protein, carbs and fat — all in one place.

## 4. The Companion Agent — Architecture & Features

Now let me take you to the heart of Aurora — the **AI Companion agent**. I'm opening it up here, and before I demo it, let me walk you through how we designed the pipeline, because this is the real engineering of the app.

The way I think about it, the companion is an **agentic pipeline** with a few distinct stages. The first stage is the **context layer** — before the agent ever reasons, we hydrate it with everything it needs to be personal: who the user is, their goals, their stats for today, and a long-term memory of past observations. So the agent never starts from a blank slate; it starts already knowing you. The second stage is the **reasoning and orchestration layer** — this is the brain. Instead of just generating text, the agent plans: it decides whether your request needs an action, picks the right tool for it, and it can loop — act, observe the result, and reason again — until the request is actually fulfilled. The third stage is the **tool and action layer** — this is a clean set of capabilities the agent can invoke, like logging water, logging sleep, creating and completing habits, logging meals, generating meal plans, or pulling up progress. Each tool is a real action against our data, so when the agent decides to do something, it genuinely happens. And wrapped around the whole pipeline is a **guardrail layer** — the agent is scope-locked to health coaching only, so if you ask it to write code or answer random trivia, it declines and steers you back to your health. The design goal was simple: not a chatbot that talks about health, but an agent that takes real action on your health.

Now let me show you that pipeline in action. There are three ways to talk to it. First, I can just **type** — watch, I'll say "I drank a glass of water," and you can see the agent decided that's an action, picked the log-water tool, executed it, and confirmed it right here. Second, I can **voice record** — I tap the mic and speak naturally; that just adds a speech-to-text stage on the front and a voice stage on the back, but it runs through the exact same reasoning pipeline. And then there's the most powerful mode of all — **Aurora Live**.

## 5. Live Agent — Hands-Free Automation

Let me turn on **Aurora Live**. This mode is completely hands-free. Behind the scenes it runs a continuous loop — it listens, automatically detects when I stop speaking, transcribes it, runs the same agent pipeline with all its tools, speaks the answer back, and then immediately starts listening again, without me tapping anything. And notice this — the Live bar stays active even as I move between tabs, because it lives globally above every screen. So this is really the automation layer of the app: I just talk, and Aurora does everything for me across the whole app — logging, planning, tracking — completely hands-free.

## 6. Live Example — Preparing a Meal

Let me show you a real example of that. With Live on, I'll just say out loud: "Make me a high-protein vegetarian lunch, around 40 grams of protein." And watch — Aurora confirms the macros and the diet, then its Nutri-Coach engine generates a complete recipe with the ingredients, the steps, and the full macro breakdown, and saves it straight into my Nutrition tab. And notice I didn't touch the screen even once — that's a full meal, prepared and logged, entirely by voice.

## 7. Health Connect

And finally, let me show you **Health Connect**. Aurora syncs with your phone's health platform — Apple Health on iOS, and Health Connect on Android — and pulls in your steps, your active energy, your sleep, and your water, with two-way hydration sync. So what this means is Aurora automatically sees your full health picture, which makes all of its coaching grounded in your real activity. And of course your data stays private to your account, and you can revoke access anytime. So that's Aurora — a focused, agentic health companion that doesn't just track your health, it actively manages it for you. Thanks for watching!
