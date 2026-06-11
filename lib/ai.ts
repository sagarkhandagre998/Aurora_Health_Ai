import { supabase } from './supabase';

export interface CompanionMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompanionResponse {
  replyText: string;
  actions: Array<{ tool: string; params: Record<string, unknown>; result: string }>;
  audioBase64?: string;
}

export async function sendToCompanion(
  messages: CompanionMessage[],
  useVoice = false,
): Promise<CompanionResponse> {
  const { data, error } = await supabase.functions.invoke('ai-companion', {
    body: { messages, useVoice },
  });
  if (error) throw new Error(error.message);
  return data as CompanionResponse;
}
