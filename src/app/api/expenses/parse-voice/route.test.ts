import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOpenRouter: vi.fn(),
  generateText: vi.fn(),
  metric: vi.fn(),
  outputObject: vi.fn((options: unknown) => options),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: mocks.createOpenRouter,
}));

vi.mock("@vercel/functions", () => ({
  metric: mocks.metric,
}));

vi.mock("ai", async () => ({
  ...await vi.importActual<typeof import("ai")>("ai"),
  generateText: mocks.generateText,
  Output: { object: mocks.outputObject },
}));

import { NoOutputGeneratedError, RetryError } from "ai";
import { POST } from "./route";

const transcript = "maine 50 rupaye ka dhudha liya hai";
const modelOutput = {
  isExpense: true,
  title: "Doodh / Milk",
  amount: 50,
  category: "groceries",
  note: "",
};

function makeRequest(body: unknown = { transcript }, token = "valid-firebase-token") {
  return new Request("http://localhost/api/expenses/parse-voice", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "public-firebase-api-key");
  vi.stubEnv("OPENROUTER_API_KEY", "server-only-test-key");
  vi.stubEnv("OPENROUTER_MODEL", "");
  mocks.createOpenRouter.mockReturnValue((modelId: string) => ({ modelId }));
  mocks.generateText.mockResolvedValue({ output: modelOutput });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ users: [{ localId: "firebase-user-id" }] })),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("POST /api/expenses/parse-voice", () => {
  it("verifies the Firebase user and returns a structured Hindi expense draft", async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      title: "Doodh / Milk",
      amount: "50",
      category: "groceries",
      note: "",
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("identitytoolkit.googleapis.com/v1/accounts:lookup"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ idToken: "valid-firebase-token" }),
      }),
    );
    expect(mocks.generateText).toHaveBeenCalledOnce();
    expect(mocks.generateText).toHaveBeenCalledWith(expect.objectContaining({
      providerOptions: {
        openrouter: {
          provider: { data_collection: "deny" },
        },
      },
    }));
    expect(mocks.metric).toHaveBeenCalledWith("voice_expense.parse", 1, { outcome: "success" });
  });

  it("rejects an invalid Firebase token before calling OpenRouter", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "INVALID_ID_TOKEN" }, { status: 400 }));

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("rejects oversized transcripts without verifying the token or calling OpenRouter", async () => {
    const response = await POST(makeRequest({ transcript: "x".repeat(1_201) }));

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("reports missing OpenRouter configuration after authenticating the user", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");

    const response = await POST(makeRequest());

    expect(response.status).toBe(503);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("does not return an expense draft for non-expense speech", async () => {
    mocks.generateText.mockResolvedValueOnce({
      output: { ...modelOutput, isExpense: false },
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(422);
    expect(mocks.generateText).toHaveBeenCalledOnce();
  });

  it("retries the free router with a pinned free model when it produces no output", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "openrouter/free");
    mocks.generateText.mockRejectedValueOnce(new NoOutputGeneratedError());

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mocks.generateText).toHaveBeenNthCalledWith(1, expect.objectContaining({
      model: { modelId: "openrouter/free" },
      maxOutputTokens: 512,
    }));
    expect(mocks.generateText).toHaveBeenNthCalledWith(2, expect.objectContaining({
      model: { modelId: "inclusionai/ling-3.2-flash:free" },
      maxOutputTokens: 512,
    }));
  });

  it("retries a pinned model through the free router when it produces no output", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "inclusionai/ling-3.2-flash:free");
    mocks.generateText.mockRejectedValueOnce(new NoOutputGeneratedError());

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mocks.generateText).toHaveBeenNthCalledWith(1, expect.objectContaining({
      model: { modelId: "inclusionai/ling-3.2-flash:free" },
    }));
    expect(mocks.generateText).toHaveBeenNthCalledWith(2, expect.objectContaining({
      model: { modelId: "openrouter/free" },
    }));
  });

  it("uses the last retry error status to explain OpenRouter rate limits", async () => {
    const rateLimitError = Object.assign(new Error("provider rate limit"), { statusCode: 429 });
    mocks.generateText.mockRejectedValueOnce(new RetryError({
      message: "All retries failed",
      reason: "maxRetriesExceeded",
      errors: [rateLimitError],
    }));

    const response = await POST(makeRequest());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "The OpenRouter free-model limit was reached. Wait and try again later.",
    });
  });

  it("explains when OpenRouter has no compatible model endpoint", async () => {
    const error = Object.assign(new Error("private provider response"), { statusCode: 404 });
    mocks.generateText.mockRejectedValueOnce(error);

    const response = await POST(makeRequest());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "No compatible model endpoint is available. Try another free model or check provider privacy settings.",
    });
  });
});
