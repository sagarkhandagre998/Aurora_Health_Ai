import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Supports both naming conventions people commonly use in .env
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? // most common
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? // alternative
  '';

if (!supabaseUrl) {
  throw new Error(
    '[Aurora] EXPO_PUBLIC_SUPABASE_URL is missing.\n' +
      'Add it to your .env file:\n' +
      '  EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co\n' +
      'Find it in: Supabase Dashboard → Project Settings → API → Project URL',
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    '[Aurora] Supabase anon key is missing.\n' +
      'Add it to your .env file:\n' +
      '  EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here\n' +
      'Find it in: Supabase Dashboard → Project Settings → API → anon / public',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
