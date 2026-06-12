import { supabase } from './supabase';
import { Insight } from '@/types';

/**
 * Asks the `generate-insights` edge function to (re)generate the user's daily
 * insight. The function itself guards on staleness — if the newest insight is
 * younger than ~20h it returns `{ skipped: true }` and no AI call is made — so
 * this is safe to call on every app open.
 *
 * Returns the freshly created Insight when one was generated, or null when it
 * was skipped (still fresh) or failed. Never throws.
 */
export async function maybeGenerateDailyInsight(force = false): Promise<Insight | null> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-insights', {
      body: { force },
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[insights] generate failed:', error.message);
      return null;
    }
    const row = (data as { insight?: { id: string; text: string; category: string | null; created_at: string } })
      ?.insight;
    if (!row) return null;
    return {
      id: row.id,
      text: row.text,
      category: row.category ?? 'general',
      createdAt: row.created_at,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[insights] generate threw:', e);
    return null;
  }
}
