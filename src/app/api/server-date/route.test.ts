import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/server-date", () => {
  it("returns the current server date without caching it", async () => {
    const now = new Date();
    const expectedDate = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");

    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ date: expectedDate });
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });
});
