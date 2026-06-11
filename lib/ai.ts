import { supabase } from './supabase';

export interface CompanionMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompanionAction {
  tool: string;
  result: string;
}

export interface CompanionResponse {
  replyText: string;
  actions: CompanionAction[];
  audioBase64?: string;
}

/**
 * Calls the `ai-companion` edge function.
 *
 * The function expects the latest user turn as `message` and all prior turns
 * as `conversationHistory` (NOT a single `messages` array), and returns
 * `actions` as a plain string[] of tool names. We adapt both sides here so the
 * UI can keep working with {tool, result} action objects.
 */
export async function sendToCompanion(
  messages: CompanionMessage[],
  useVoice = false,
): Promise<CompanionResponse> {
  // The last message is the new user turn; everything before it is history.
  const last = messages[messages.length - 1];
  const conversationHistory = messages.slice(0, -1);

  const { data, error } = await supabase.functions.invoke('ai-companion', {
    body: {
      message: last?.content ?? '',
      conversationHistory,
      useVoice,
    },
  });

  if (error) {
    // supabase-js FunctionsHttpError stores the raw Response in error.context.
    // Read its JSON body to surface the function's real error message
    // (e.g. "Claude API 400: ...", "AI key not configured").
    let detail = error.message;
    const ctx = (error as { context?: unknown }).context;
    try {
      if (ctx instanceof Response) {
        const body = await ctx
          .clone()
          .json()
          .catch(async () => ({ error: await ctx.clone().text() }));
        if (body?.error) detail = body.error;
        // eslint-disable-next-line no-console
        console.error('[ai] edge function error body:', body);
      } else if (ctx && typeof ctx === 'object') {
        // eslint-disable-next-line no-console
        console.error('[ai] edge function error context:', JSON.stringify(ctx));
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[ai] could not read error body:', e);
    }
    throw new Error(detail);
  }

  const raw = data as { replyText?: string; actions?: unknown; audioBase64?: string };

  // The function returns actions as string[] (tool names); normalise to objects.
  const actions: CompanionAction[] = Array.isArray(raw.actions)
    ? raw.actions.map((a) =>
        typeof a === 'string' ? { tool: a, result: 'done' } : (a as CompanionAction),
      )
    : [];

  return {
    replyText: raw.replyText ?? '',
    actions,
    audioBase64: raw.audioBase64,
  };
}
