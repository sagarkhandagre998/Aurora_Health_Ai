import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

// Google OAuth client IDs from Google Cloud Console.
// - webClientId: the "Web application" OAuth client. Required — it's the audience
//   Supabase validates the ID token against, and Android uses it too.
// - iosClientId: the "iOS" OAuth client. Required on iOS.
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

let configured = false;

function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId,
    iosClientId,
  });
  configured = true;
}

export type GoogleSignInResult =
  | { ok: true }
  | { ok: false; cancelled: boolean; message: string };

/**
 * Runs the native Google Sign-In flow and exchanges the resulting ID token for a
 * Supabase session via `signInWithIdToken`. Supabase's `on_auth_user_created`
 * trigger creates the profile row, so both sign-up and sign-in use this same
 * call — there's no separate "register" step for Google.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (!webClientId) {
    return {
      ok: false,
      cancelled: false,
      message:
        'Google sign-in is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in your .env.',
    };
  }

  try {
    ensureConfigured();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignin.signIn();

    if (!isSuccessResponse(response)) {
      // User dismissed the picker.
      return { ok: false, cancelled: true, message: 'Sign-in cancelled' };
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      return {
        ok: false,
        cancelled: false,
        message: 'No ID token returned from Google. Check your webClientId.',
      };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      return { ok: false, cancelled: false, message: error.message };
    }

    // Success — the auth layout guard redirects based on the new session.
    return { ok: true };
  } catch (error) {
    if (isErrorWithCode(error)) {
      switch (error.code) {
        case statusCodes.SIGN_IN_CANCELLED:
          return { ok: false, cancelled: true, message: 'Sign-in cancelled' };
        case statusCodes.IN_PROGRESS:
          return { ok: false, cancelled: true, message: 'Sign-in already in progress' };
        case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
          return {
            ok: false,
            cancelled: false,
            message: 'Google Play Services is not available or out of date.',
          };
      }
    }
    return {
      ok: false,
      cancelled: false,
      message: error instanceof Error ? error.message : 'Google sign-in failed',
    };
  }
}
