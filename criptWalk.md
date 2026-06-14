# Aurora — 5-Minute Walkthrough Script

## 1. Landing & Sign In

So let me show you Aurora, our AI health companion app. I'm opening the app now, and the first thing you see is this intro carousel. Let me swipe through these slides — each one shows what Aurora does: track your water, your sleep, your habits, and your food, and get daily tips. Now I'll tap **Get Started**. And if you already have an account, you can just tap **Sign In**. We also have **Continue with Google**, so you can log in with one tap.

## 2. Register & Onboarding

Let me register now. After you sign up, Aurora asks you a few quick questions. So here I'm adding my **profile**, then my **health goals**, then a little about my **lifestyle**, and last my **notification** settings. This part matters because everything I add here is used to make the app personal — even the AI companion uses it to talk to me and give better tips.

## 3. Dashboard & The Four Modules

And now we are on the **dashboard**. This is where you see your whole day in one place. Aurora has four main parts, so let me show you each one. First is **Hydration** — I log my water with this animated bottle that fills up as I drink, and it even plays a water sound. Next is **Sleep**, where I track how long and how well I slept, and here you can see the weekly chart. Then we have **Habits** — I can add daily or weekly habits and build a streak by doing them. And last is **Nutrition**, where I log my meals and see my calories and macros — protein, carbs and fat — all in one place.

## 4. The Companion Agent — Design & Features

Now let me show you the main part of Aurora — the **AI Companion agent**. I'm opening it here. Before I use it, let me explain how we designed it, because this is the real work behind the app.

I like to think of the companion as a **pipeline** with a few steps. The first step is **context** — before the agent answers anything, we give it everything it needs to know about you: your goals, your stats for today, and what it remembers about you from before. So it never starts blank — it already knows you. The second step is the **thinking step** — this is the brain. It doesn't just write a reply, it makes a plan. It checks if your request needs an action, picks the right tool for it, and it can repeat — do the action, look at the result, and think again — until your request is really done. The third step is the **action step** — this is a set of things the agent can actually do, like log water, log sleep, add or complete a habit, log a meal, make a meal plan, or check your progress. Each one is a real action on your data, so when the agent decides to do something, it actually happens. And around the whole pipeline there is a **safety layer** — the agent only helps with health. So if I ask it to write code or answer some random question, it says no nicely and brings me back to health. Our goal was simple: not a chatbot that only talks about health, but an agent that actually does things for your health.

Now let me show you the pipeline working. There are three ways to talk to it. First, I can just **type** — watch, I'll say "I drank a glass of water," and you can see the agent understood it's an action, picked the log-water tool, did it, and confirmed it right here. Second, I can **use voice** — I tap the mic and just talk. This only adds speech-to-text at the start and a voice reply at the end, but it goes through the same pipeline. And then there's the best mode of all — **Aurora Live**.

## 5. Live Agent — Hands-Free

Let me turn on **Aurora Live**. The idea here was simple: take the same agent brain and put it inside a **live loop**, so I can just talk and it keeps going hands-free. So the pipeline is a loop with four steps that connect to each other. It starts with **listening** — it can tell on its own when I stop talking, so I never press a button to end my turn. Then it goes to **speech-to-text**, then into the **same agent pipeline** I just showed you — same thinking, same actions, same safety. That was the key choice: we did not build a second brain for voice, we reused the one we already had. Then it **speaks** the answer back, and the moment it finishes, it goes right back to listening. So it's a loop that keeps itself going — listen, understand, act, reply, listen again.

And one more thing — notice the Live bar stays on even when I move between tabs. That's because we put this loop above the whole app, not inside one screen. So this is really the automation part of Aurora: I just talk, and it keeps the conversation going on every screen and does everything for me — log, plan, track — completely hands-free.

## 6. Live Example — Preparing a Meal

Let me show you a real example. With Live on, I'll just say out loud: "Make me a high-protein vegetarian lunch, around 40 grams of protein." And watch — Aurora checks the macros and the diet, then its Nutri-Coach makes a full recipe with the ingredients, the steps, and the macros, and saves it right into my Nutrition tab. And see, I didn't touch the screen at all — that's a full meal, made and saved, just by talking.

## 7. Health Connect

And last, let me show you **Health Connect**. Aurora connects to your phone's health app — Apple Health on iPhone, and Health Connect on Android — and brings in your steps, your active energy, your sleep, and your water, with two-way water sync. So this means Aurora sees your full health picture on its own, and that makes all of its tips based on your real activity. And of course your data stays private to your account, and you can turn off access anytime. So that's Aurora — a health companion that doesn't just track your health, it actually takes care of it for you. Thanks for watching!
