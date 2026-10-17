import * as Speech from 'expo-speech';

/** Read-aloud for Non-Reader Mode. */
export function speak(text: string) {
  Speech.stop();
  Speech.speak(text, { rate: 0.9, pitch: 1.1, language: 'en-US' });
}

export function stopSpeaking() {
  Speech.stop();
}
