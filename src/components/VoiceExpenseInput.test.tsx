// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceExpenseInput } from "./VoiceExpenseInput";

type MockSpeechResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type MockSpeechEvent = { results: ArrayLike<MockSpeechResult> };

class MockSpeechRecognition {
  static current: MockSpeechRecognition | null = null;

  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((event: MockSpeechEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    MockSpeechRecognition.current = this;
  }
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "SpeechRecognition");
  MockSpeechRecognition.current = null;
});

beforeEach(() => {
  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: MockSpeechRecognition,
  });
});

describe("VoiceExpenseInput", () => {
  it("uses browser speech recognition and returns a parsed expense draft", () => {
    const onRecognized = vi.fn();
    render(<VoiceExpenseInput onRecognized={onRecognized} />);

    fireEvent.click(screen.getByRole("button", { name: "Start voice entry" }));
    const recognition = MockSpeechRecognition.current;
    expect(recognition?.lang).toBe("en-IN");
    expect(recognition?.start).toHaveBeenCalledOnce();

    const result = Object.assign([{ transcript: "Groceries 500 rupees" }], { isFinal: true });
    act(() => recognition?.onresult?.({ results: [result] }));

    expect(onRecognized).toHaveBeenCalledWith({
      title: "Groceries",
      amount: "500",
      category: "groceries",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Heard: Groceries 500 rupees");
  });
});
