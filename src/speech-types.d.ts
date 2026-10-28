interface SpeechRecognitionResultItemLike { transcript: string }
interface SpeechRecognitionResultLike { readonly [index: number]: SpeechRecognitionResultItemLike; readonly isFinal?: boolean }
interface SpeechRecognitionEventLike extends Event { readonly resultIndex: number; readonly results: { readonly length: number; readonly [index: number]: SpeechRecognitionResultLike } }
interface SpeechRecognitionErrorEventLike extends Event { readonly error: string }
interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
interface Window {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}
