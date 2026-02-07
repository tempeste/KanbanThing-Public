import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";

describe("api catch-all route", () => {
  it("returns JSON 404 for unknown GET routes", async () => {
    const response = await GET();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("returns JSON 404 for unknown POST routes", async () => {
    const response = await POST();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });
});
