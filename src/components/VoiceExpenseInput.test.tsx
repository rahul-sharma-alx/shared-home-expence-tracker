// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "SpeechRecognition");
  MockSpeechRecognition.current = null;
});

beforeEach(() => {
  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: MockSpeechRecognition,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({
      title: "Doodh / Milk",
      amount: "50",
      category: "groceries",
      note: "",
    })),
  );
});

describe("VoiceExpenseInput", () => {
  it("recognizes Hindi speech and sends it for authenticated parsing", async () => {
    const onRecognized = vi.fn();
    const getIdToken = vi.fn().mockResolvedValue("firebase-id-token");
    render(<VoiceExpenseInput getIdToken={getIdToken} onRecognized={onRecognized} />);

    fireEvent.click(screen.getByRole("button", { name: "Start voice entry" }));
    const recognition = MockSpeechRecognition.current;
    expect(recognition?.lang).toBe("hi-IN");
    expect(recognition?.start).toHaveBeenCalledOnce();

    const result = Object.assign([{ transcript: "maine 50 rupaye ka dhudha liya hai" }], { isFinal: true });
    await act(async () => recognition?.onresult?.({ results: [result] }));

    await waitFor(() => expect(onRecognized).toHaveBeenCalledWith({
      title: "Doodh / Milk",
      amount: "50",
      category: "groceries",
      note: "",
    }));
    expect(getIdToken).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "/api/expenses/parse-voice",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer firebase-id-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transcript: "maine 50 rupaye ka dhudha liya hai" }),
      }),
    );
    expect(screen.getByText("Heard: maine 50 rupaye ka dhudha liya hai")).toBeInTheDocument();
  });

  it("shows a loading status while AI parses the recognized expense", async () => {
    let resolveResponse!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    }));
    render(<VoiceExpenseInput getIdToken={vi.fn().mockResolvedValue("firebase-id-token")} onRecognized={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Start voice entry" }));
    const result = Object.assign([{ transcript: "milk 50 rupees" }], { isFinal: true });
    await act(async () => MockSpeechRecognition.current?.onresult?.({ results: [result] }));

    expect(screen.getByRole("status")).toHaveTextContent("AI is crafting entry...");

    await act(async () => resolveResponse(Response.json({
      title: "Milk",
      amount: "50",
      category: "groceries",
      note: "",
    })));

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("allows English recognition and shows server parsing errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(
      { error: "AI voice parsing is not configured." },
      { status: 503 },
    ));
    render(<VoiceExpenseInput getIdToken={vi.fn().mockResolvedValue("firebase-id-token")} onRecognized={vi.fn()} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Speech language" }), { target: { value: "en-IN" } });
    fireEvent.click(screen.getByRole("button", { name: "Start voice entry" }));
    const recognition = MockSpeechRecognition.current;
    expect(recognition?.lang).toBe("en-IN");

    const result = Object.assign([{ transcript: "milk 50 rupees" }], { isFinal: true });
    await act(async () => recognition?.onresult?.({ results: [result] }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("AI voice parsing is not configured."));
  });
});
