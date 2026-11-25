"use client";

import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isVoiceExpenseDraft, type VoiceExpenseDraft } from "../features/expenses/voice-entry";

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
  getIdToken,
}: {
  onRecognized: (draft: VoiceExpenseDraft) => void;
  getIdToken: () => Promise<string>;
}) {
  const [isListening, setIsListening] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [language, setLanguage] = useState("hi-IN");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const parseControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    }
    parseControllerRef.current?.abort();
  }, []);

  async function parseTranscript(recognizedText: string) {
    const controller = new AbortController();
    parseControllerRef.current = controller;
    setIsParsing(true);

    try {
      const idToken = await getIdToken();
      const response = await fetch("/api/expenses/parse-voice", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transcript: recognizedText }),
        signal: controller.signal,
      });
      const responseBody: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message = responseBody && typeof responseBody === "object" && "error" in responseBody
          && typeof responseBody.error === "string"
          ? responseBody.error
          : "Voice parsing failed. Please enter the expense manually.";
        throw new Error(message);
      }

      if (!isVoiceExpenseDraft(responseBody)) {
        throw new Error("Voice parsing returned an invalid draft. Please enter the expense manually.");
      }

      onRecognized(responseBody);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setVoiceError(
        error instanceof Error
          ? error.message
          : "Could not reach voice parsing. Please enter the expense manually.",
      );
    } finally {
      if (parseControllerRef.current === controller) {
        parseControllerRef.current = null;
        setIsParsing(false);
      }
    }
  }

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
    recognition.lang = language;
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

      setTranscript(`Heard: ${recognizedText}`);
      void parseTranscript(recognizedText);
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
          disabled={isParsing}
          aria-label={isListening ? "Stop voice entry" : "Start voice entry"}
          aria-pressed={isListening}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isListening ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
          {isParsing ? "Understanding…" : isListening ? "Stop listening" : "Speak expense"}
        </button>
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="voice-expense-language">Speech language</label>
          <select
            id="voice-expense-language"
            aria-label="Speech language"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            disabled={isListening || isParsing}
            className="mb-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700"
          >
            <option value="hi-IN">Hindi / Hinglish</option>
            <option value="en-IN">English</option>
          </select>
          <p className="text-xs leading-5 text-zinc-500">
            Say the item and amount, e.g. “Maine 50 rupaye ka doodh liya hai”. Review before saving.
          </p>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-zinc-400">
        Browser speech recognition may send audio online. OpenRouter requests deny data collection, but providers may retain safety logs.
      </p>
      {transcript && <p className="mt-2 text-xs text-emerald-700">{transcript}</p>}
      {isParsing && (
        <p role="status" className="mt-2 flex items-center gap-2 text-xs font-medium text-zinc-700">
          <span
            aria-hidden="true"
            className="size-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800"
          />
          AI is crafting entry...
        </p>
      )}
      {voiceError && <p role="alert" className="mt-2 text-xs text-red-600">{voiceError}</p>}
    </div>
  );
}
