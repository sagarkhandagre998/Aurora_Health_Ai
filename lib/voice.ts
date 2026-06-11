import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
  createAudioPlayer,
  AudioRecorder,
} from 'expo-audio';
import { supabase } from './supabase';
import { sendToCompanion, CompanionMessage, CompanionResponse } from './ai';

let activeRecorder: AudioRecorder | null = null;

export async function startRecording(): Promise<void> {
  await requestRecordingPermissionsAsync();
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

  const recorder = new AudioRecorder(RecordingPresets.HIGH_QUALITY);
  await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
  recorder.record();
  activeRecorder = recorder;
}

export async function stopRecordingAndTranscribe(): Promise<string> {
  if (!activeRecorder) throw new Error('No active recording');

  await activeRecorder.stop();
  const uri = activeRecorder.uri;
  activeRecorder = null;

  if (!uri) throw new Error('Recording URI is null');

  const formData = new FormData();
  formData.append('file', { uri, name: 'audio.m4a', type: 'audio/m4a' } as any);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/stt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token}` },
    body: formData,
  });
  const json = await response.json();
  return json.transcript as string;
}

export async function speakText(text: string, audioBase64?: string): Promise<void> {
  if (audioBase64) {
    const uri = FileSystem.cacheDirectory + 'aurora_tts.mp3';
    await FileSystem.writeAsStringAsync(uri, audioBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const player = createAudioPlayer({ uri });
    player.play();
  } else {
    Speech.speak(text, { language: 'en-US', rate: 0.95 });
  }
}

export async function voiceTurn(history: CompanionMessage[]): Promise<CompanionResponse> {
  const transcript = await stopRecordingAndTranscribe();
  const messages: CompanionMessage[] = [...history, { role: 'user', content: transcript }];
  const response = await sendToCompanion(messages, true);
  await speakText(response.replyText, response.audioBase64);
  return response;
}
