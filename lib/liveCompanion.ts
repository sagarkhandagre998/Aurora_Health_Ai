import { useSyncExternalStore } from 'react';

/**
 * Aurora Live — global on/off state for the hands-free voice popup.
 *
 * The Live popup must keep listening/talking even as the user navigates between
 * tabs, so its open state lives OUTSIDE any screen. This is a tiny dependency-
 * free external store (no Redux/Context plumbing) that the globally-mounted
 * `LiveCompanionOverlay` reads, and that any screen can toggle.
 */

interface LiveState {
  open: boolean;
}

let state: LiveState = { open: false };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return state.open;
}

/** Open the Live popup and start the continuous listen → respond loop. */
export function openLiveCompanion(): void {
  if (state.open) return;
  state = { open: true };
  emit();
}

/** Close the Live popup and stop the loop. */
export function closeLiveCompanion(): void {
  if (!state.open) return;
  state = { open: false };
  emit();
}

/** Toggle the Live popup. */
export function toggleLiveCompanion(): void {
  state = { open: !state.open };
  emit();
}

/** React hook — re-renders when Live is opened/closed. */
export function useLiveCompanionOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
