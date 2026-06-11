# Aurora — Setup Guide

## API Keys needed (all free)

| Key | Service | Cost | Get it at |
|---|---|---|---|
| `FREEMODEL_API_KEY` | Claude AI companion | **Free** ($100 credit) | [freemodel.dev/dashboard/keys](https://freemodel.dev/dashboard/keys) |
| `GROQ_API_KEY` | Voice speech-to-text (Whisper) | **Free** (rate limits) | [console.groq.com](https://console.groq.com) |
| `ELEVENLABS_API_KEY` | Premium TTS voice | Optional (free tier) | [elevenlabs.io](https://elevenlabs.io) — falls back to device voice if not set |

---

## Step 1 — Get your freemodel.dev key

1. Go to [freemodel.dev](https://freemodel.dev) → Sign up & verify your account
2. Get **$100 free credits** (no credit card needed)
3. Go to [freemodel.dev/dashboard/keys](https://freemodel.dev/dashboard/keys)
4. Create a new API key → copy it

This key is used for **Claude Opus** (the AI companion brain).

---

## Step 2 — Get your Groq key (voice input)

1. Go to [console.groq.com](https://console.groq.com) → Sign up (free, no credit card)
2. Click **API Keys** → **Create API Key** → copy it

This key is used for **Whisper speech-to-text** (voice → text).

---

## Step 3 — Set Supabase secrets

```bash
supabase secrets set FREEMODEL_API_KEY=your_freemodel_key_here
supabase secrets set GROQ_API_KEY=your_groq_key_here

# Optional — premium TTS voice (falls back to device speech if not set)
supabase secrets set ELEVENLABS_API_KEY=your_elevenlabs_key_here
```

Or set them in the Supabase dashboard:
**Settings → Edge Functions → Edit secrets**

---

## Step 4 — App environment variables

Create a `.env` file in the project root:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
```

Both values are in: **Supabase Dashboard → Project Settings → API**

---

## Step 5 — Deploy edge functions

```bash
supabase functions deploy ai-companion
supabase functions deploy stt
supabase functions deploy tts
```

---

## How freemodel.dev works with Claude

The app's `ai-companion` edge function calls:
```
cc.freemodel.dev/v1/messages   ← freemodel's Anthropic-compatible endpoint
```
instead of `api.anthropic.com/v1/messages` — the API format is **identical**, only the URL changes.
Your freemodel key goes in the `x-api-key` header, exactly like a real Anthropic key.

## How Groq works for voice

Groq's Whisper endpoint is **100% OpenAI-compatible**:
```
api.groq.com/openai/v1/audio/transcriptions   ← same format as OpenAI Whisper
```
Model used: `whisper-large-v3` (better accuracy than `whisper-1`).
