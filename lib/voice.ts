import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { sendToCompanion, CompanionMessage, CompanionResponse } from './ai';

let recording: any = null;

export async function startRecording(): Promise<void> {
  const { Audio } = await import('expo-audio');
  await Audio.requestPermissionsAsync();
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
  const { recording: rec } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY,
  );
  recording = rec;
}

export async function stopRecordingAndTranscribe(): Promise<string> {
  if (!recording) throw new Error('No active recording');
  await recording.stopAndUnloadAsync();
  const uri = recording.getURI();
  recording = null;

  // Upload to /stt edge function
  const fileInfo = await FileSystem.getInfoAsync(uri!);
  if (!fileInfo.exists) throw new Error('Recording file not found');

  const formData = new FormData();
  formData.append('file', { uri: uri!, name: 'audio.m4a', type: 'audio/m4a' } as any);

  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/stt`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: formData,
    },
  );
  const json = await response.json();
  return json.transcript as string;
}

export async function speakText(text: string, audioBase64?: string): Promise<void> {
  if (audioBase64) {
    const { Audio } = await import('expo-audio');
    const uri = FileSystem.cacheDirectory + 'aurora_tts.mp3';
    await FileSystem.writeAsStringAsync(uri, audioBase64, { encoding: FileSystem.EncodingType.Base64 });
    const { sound } = await Audio.Sound.createAsync({ uri });
    await sound.playAsync();
  } else {
    Speech.speak(text, { language: 'en-US', rate: 0.95 });
  }
}

export async function voiceTurn(
  history: CompanionMessage[],
): Promise<CompanionResponse> {
  const transcript = await stopRecordingAndTranscribe();
  const messages: CompanionMessage[] = [...history, { role: 'user', content: transcript }];
  const response = await sendToCompanion(messages, true);
  await speakText(response.replyText, response.audioBase64);
  return { ...response, replyText: response.replyText };
}
