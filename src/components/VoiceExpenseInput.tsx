"use client";

import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseVoiceExpense, type VoiceExpenseDraft } from "../features/expenses/voice-entry";

type SpeechAlternative = { transcript: string };
type SpeechResult = ArrayLike<SpeechAlternative> & { isFinal: boolean };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechResult> };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor() {
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
}

function getSpeechErrorMessage(error: string) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Microphone access was denied. Allow access in your browser and try again.";
  }
  if (error === "no-speech") return "No speech was detected. Try again.";
  if (error === "audio-capture") return "No microphone was found. Check your device and try again.";
  return "Voice recognition failed. Please enter the expense manually.";
}

export function VoiceExpenseInput({
  onRecognized,
}: {
  onRecognized: (draft: VoiceExpenseDraft) => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.abort();
  }, []);

  function toggleListening() {
    const currentRecognition = recognitionRef.current;
    if (currentRecognition) {
      try {
        currentRecognition.stop();
      } catch {
        setVoiceError("Voice input could not stop. Please close the dialog and try again.");
        setIsListening(false);
        recognitionRef.current = null;
      }
      return;
    }

    setVoiceError("");
    setTranscript("");
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setVoiceError("Voice entry is not supported in this browser. You can enter the fields manually.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const recognizedText = Array.from({ length: event.results.length }, (_, index) => event.results[index])
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();

      if (!recognizedText) {
        setVoiceError("No speech was detected. Try again.");
        return;
      }

      onRecognized(parseVoiceExpense(recognizedText));
      setTranscript(`Heard: ${recognizedText}`);
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current === recognition) {
        setVoiceError(getSpeechErrorMessage(event.error));
        setIsListening(false);
        recognitionRef.current = null;
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        setIsListening(false);
        recognitionRef.current = null;
      }
    };
    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
    } catch (error) {
      recognitionRef.current = null;
      setIsListening(false);
      setVoiceError(
        error instanceof Error && error.name === "NotAllowedError"
          ? "Microphone access was denied. Allow access in your browser and try again."
          : "Voice input could not start. Check microphone access and try again.",
      );
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleListening}
          aria-label={isListening ? "Stop voice entry" : "Start voice entry"}
          aria-pressed={isListening}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
        >
          {isListening ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
          {isListening ? "Stop listening" : "Speak expense"}
        </button>
        <p className="text-xs leading-5 text-zinc-500">
          Say the item and amount, e.g. “Groceries 500 rupees”. Review the fields before saving.
        </p>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-zinc-400">
        Speech processing depends on your browser and may happen online.
      </p>
      {transcript && <p role="status" className="mt-2 text-xs text-emerald-700">{transcript}</p>}
      {voiceError && <p role="alert" className="mt-2 text-xs text-red-600">{voiceError}</p>}
    </div>
  );
}
